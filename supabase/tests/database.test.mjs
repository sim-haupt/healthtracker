import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const alice = uuid(1),
  bob = uuid(2),
  outsider = uuid(3);
const eventA = uuid(11),
  eventB = uuid(12),
  tagA = uuid(21),
  tagB = uuid(22);
const tables = [
  "profiles",
  "health_events",
  "categories",
  "tags",
  "health_event_tags",
];

test("initial migration and PostgreSQL RLS boundaries", async (t) => {
  const db = new PGlite();
  try {
    // Supabase supplies these roles and auth.uid(). Only this test harness stubs
    // the Auth schema; the actual migration below runs unchanged in PostgreSQL.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
    `);
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202609110001_initial_health_schema.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(`insert into auth.users values ('${alice}'), ('${bob}'), ('${outsider}');
      insert into public.app_users(user_id) values ('${alice}'), ('${bob}');`);
    const profileA = (
      await db.query(
        "select id from profiles where owner_id = $1 order by name",
        [alice],
      )
    ).rows[0].id;
    const profileB = (
      await db.query(
        "select id from profiles where owner_id = $1 order by name",
        [bob],
      )
    ).rows[0].id;
    async function asUser(
      userId,
      fn,
      { commit = false, role = "authenticated" } = {},
    ) {
      await db.exec("begin");
      try {
        await db.exec(`set local role ${role}`);
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
          userId ?? "",
        ]);
        const result = await fn();
        await db.exec(commit ? "commit" : "rollback");
        return result;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    }
    const query = (sql, args = []) => db.query(sql, args);
    for (const [owner, profile, event, tag] of [
      [alice, profileA, eventA, tagA],
      [bob, profileB, eventB, tagB],
    ]) {
      await asUser(
        owner,
        async () => {
          await query(
            "insert into health_events(id,profile_id,event_type,title,event_date) values ($1,$2,'visit','Private visit','2026-09-11T10:00:00Z')",
            [event, profile],
          );
          await query("insert into categories(name) values ('Personal')");
          await query("insert into tags(id,name) values ($1,'Follow-up')", [
            tag,
          ]);
          await query(
            "insert into health_event_tags(event_id,tag_id) values ($1,$2)",
            [event, tag],
          );
        },
        { commit: true },
      );
    }
    await t.test(
      "approval seeds two defaults and reapproval preserves renames",
      async () => {
        await query("update profiles set name='Renamed person' where id=$1", [
          profileA,
        ]);
        await query(
          "insert into app_users(user_id) values ($1) on conflict (user_id) do update set enabled=true",
          [alice],
        );
        const rows = (
          await query("select name from profiles where owner_id=$1", [alice])
        ).rows;
        assert.equal(rows.length, 2);
        assert.ok(rows.some((row) => row.name === "Renamed person"));
      },
    );
    await t.test(
      "anonymous users cannot read or write any application table",
      async () => {
        for (const table of [...tables, "app_users"]) {
          await assert.rejects(
            asUser(null, () => query(`select * from ${table}`), {
              role: "anon",
            }),
            { code: "42501" },
          );
        }
        await assert.rejects(
          asUser(
            null,
            () => query("insert into profiles(name) values ('Intruder')"),
            { role: "anon" },
          ),
          { code: "42501" },
        );
      },
    );
    await t.test(
      "approved accounts see only their own rows in all tables",
      async () => {
        for (const owner of [alice, bob])
          await asUser(owner, async () => {
            for (const table of tables) {
              const rows = (await query(`select * from ${table}`)).rows;
              assert.equal(rows.length, table === "profiles" ? 2 : 1);
              assert.ok(rows.every((row) => row.owner_id === owner));
            }
            assert.deepEqual(
              (await query("select user_id from app_users")).rows,
              [{ user_id: owner }],
            );
          });
      },
    );
    await t.test(
      "unapproved users see nothing and cannot enroll themselves",
      async () => {
        await asUser(outsider, async () => {
          for (const table of [...tables, "app_users"])
            assert.equal(
              (await query(`select * from ${table}`)).rows.length,
              0,
            );
        });
        await assert.rejects(
          asUser(outsider, () =>
            query("insert into profiles(name) values ('Intruder')"),
          ),
          { code: "42501" },
        );
        await assert.rejects(
          asUser(outsider, () =>
            query("insert into app_users(user_id) values ($1)", [outsider]),
          ),
          { code: "42501" },
        );
        await assert.rejects(
          asUser(alice, () => query("update app_users set enabled=true")),
          { code: "42501" },
        );
      },
    );
    await t.test(
      "ownership spoofing and reassignment are rejected on every private table",
      async () => {
        const inserts = [
          ["insert into profiles(owner_id,name) values ($1,'Spoofed')", [bob]],
          [
            "insert into health_events(owner_id,profile_id,event_type,title,event_date) values ($1,$2,'visit','Spoofed',now())",
            [bob, profileB],
          ],
          [
            "insert into categories(owner_id,name) values ($1,'Spoofed')",
            [bob],
          ],
          ["insert into tags(owner_id,name) values ($1,'Spoofed')", [bob]],
          [
            "insert into health_event_tags(owner_id,event_id,tag_id) values ($1,$2,$3)",
            [bob, eventB, tagB],
          ],
        ];
        for (const [sql, args] of inserts)
          await assert.rejects(
            asUser(alice, () => query(sql, args)),
            { code: "42501" },
          );
        for (const table of tables)
          await assert.rejects(
            asUser(alice, () =>
              query(`update ${table} set owner_id=$1 where owner_id=$2`, [
                bob,
                alice,
              ]),
            ),
            { code: "42501" },
          );
      },
    );
    await t.test(
      "cross-account reads, updates and deletes affect no rows",
      async () => {
        await asUser(alice, async () => {
          for (const table of tables) {
            assert.equal(
              (await query(`select * from ${table} where owner_id=$1`, [bob]))
                .rows.length,
              0,
            );
            assert.equal(
              (
                await query(
                  `update ${table} set owner_id=owner_id where owner_id=$1 returning *`,
                  [bob],
                )
              ).rows.length,
              0,
            );
            assert.equal(
              (
                await query(
                  `delete from ${table} where owner_id=$1 returning *`,
                  [bob],
                )
              ).rows.length,
              0,
            );
          }
        });
      },
    );
    await t.test(
      "foreign keys forbid cross-account profile/event/tag links",
      async () => {
        const attempts = [
          [
            "insert into health_events(profile_id,event_type,title,event_date) values ($1,'visit','Wrong profile',now())",
            [profileB],
          ],
          [
            "update health_events set profile_id=$1 where id=$2",
            [profileB, eventA],
          ],
          [
            "insert into health_event_tags(event_id,tag_id) values ($1,$2)",
            [eventA, tagB],
          ],
          [
            "insert into health_event_tags(event_id,tag_id) values ($1,$2)",
            [eventB, tagA],
          ],
          [
            "update health_event_tags set tag_id=$1 where event_id=$2",
            [tagB, eventA],
          ],
        ];
        for (const [sql, args] of attempts)
          await assert.rejects(
            asUser(alice, () => query(sql, args)),
            { code: "23503" },
          );
      },
    );
    await t.test(
      "valid owner updates work and updated_at cannot be backdated",
      async () => {
        await asUser(alice, async () => {
          const rows = (
            await query(
              "update health_events set title='Updated',updated_at='2000-01-01' where id=$1 returning title,updated_at",
              [eventA],
            )
          ).rows;
          assert.equal(rows[0].title, "Updated");
          assert.ok(new Date(rows[0].updated_at).getFullYear() > 2000);
          assert.equal(
            (
              await query(
                "update profiles set name='New name' where id=$1 returning name",
                [profileA],
              )
            ).rows[0].name,
            "New name",
          );
          assert.equal(
            (
              await query(
                "update tags set name='Renamed' where id=$1 returning name",
                [tagA],
              )
            ).rows[0].name,
            "Renamed",
          );
          assert.equal(
            (await query("update categories set name='Renamed' returning name"))
              .rows[0].name,
            "Renamed",
          );
        });
      },
    );
    await t.test(
      "constraints reject invalid dates, blank names and duplicate labels",
      async () => {
        await assert.rejects(
          asUser(alice, () =>
            query(
              "update health_events set end_date='2000-01-01' where id=$1",
              [eventA],
            ),
          ),
          { code: "23514" },
        );
        await assert.rejects(
          asUser(alice, () =>
            query("insert into profiles(name) values ('   ')"),
          ),
          { code: "23514" },
        );
        await assert.rejects(
          asUser(alice, () =>
            query("insert into tags(name) values (' FOLLOW-UP ')"),
          ),
          { code: "23505" },
        );
        await assert.rejects(
          asUser(alice, () =>
            query(
              "insert into health_event_tags(event_id,tag_id) values ($1,$2)",
              [eventA, tagA],
            ),
          ),
          { code: "23505" },
        );
      },
    );
    await t.test(
      "revoking approval blocks existing rows without deleting them",
      async () => {
        await query("update app_users set enabled=false where user_id=$1", [
          alice,
        ]);
        try {
          await asUser(alice, async () => {
            for (const table of tables)
              assert.equal(
                (await query(`select * from ${table}`)).rows.length,
                0,
              );
          });
          await assert.rejects(
            asUser(alice, () =>
              query("insert into tags(name) values ('Denied')"),
            ),
            { code: "42501" },
          );
          assert.equal(
            (await query("select * from profiles where owner_id=$1", [alice]))
              .rows.length,
            2,
          );
        } finally {
          await query("update app_users set enabled=true where user_id=$1", [
            alice,
          ]);
        }
      },
    );
    await t.test(
      "deleting an owned profile cascades its events and links only",
      async () => {
        await asUser(alice, async () => {
          await query("delete from profiles where id=$1", [profileA]);
          assert.equal(
            (await query("select * from health_events")).rows.length,
            0,
          );
          assert.equal(
            (await query("select * from health_event_tags")).rows.length,
            0,
          );
          assert.equal((await query("select * from tags")).rows.length, 1);
        });
        assert.equal(
          (await query("select * from health_events where owner_id=$1", [bob]))
            .rows.length,
          1,
        );
      },
    );

    await t.test(
      "tracker migration: atomic labels, filtering, search and dashboard retain RLS",
      async () => {
        await db.exec(
          await readFile(
            new URL(
              "../migrations/202609120001_tracker_experience.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        const categoryA = (
          await query(
            "select id from categories where owner_id=$1 order by name limit 1",
            [alice],
          )
        ).rows[0].id;
        const categoryB = (
          await query(
            "select id from categories where owner_id=$1 order by name limit 1",
            [bob],
          )
        ).rows[0].id;
        const extraTag = (
          await query(
            "select id from tags where owner_id=$1 and name='fever'",
            [alice],
          )
        ).rows[0].id;
        const past = new Date(Date.now() - 86400000).toISOString();
        const future = new Date(Date.now() + 86400000).toISOString();
        const payload = {
          profile_id: profileA,
          event_type: "Illness",
          title: "Recovery",
          description: "Tender throat",
          symptoms: "Cough",
          diagnosis: "Viral",
          notes: "literal %_() phrase",
          event_date: past,
          end_date: future,
          category_id: categoryA,
          tag_ids: [tagA, extraTag],
        };
        const save = (id, input) =>
          query("select public.save_health_event($1,$2::jsonb) as doc", [
            id,
            JSON.stringify(input),
          ]);
        const search = (filters) =>
          query("select public.search_health_events($1::jsonb) as doc", [
            JSON.stringify(filters),
          ]);
        let savedId;
        await asUser(
          alice,
          async () => {
            const saved = (await save(null, { ...payload, owner_id: bob }))
              .rows[0].doc;
            savedId = saved.id;
            assert.equal(saved.category.id, categoryA);
            assert.equal(saved.tags.length, 2);
            assert.equal(saved.owner_id, undefined);
            for (const q of [
              "Recovery",
              "tender",
              "COUGH",
              "viral",
              "%_() phrase",
            ]) {
              assert.ok(
                (await search({ q })).rows[0].doc.events.some(
                  (e) => e.id === savedId,
                ),
              );
            }
            const combined = (
              await search({
                profile_id: profileA,
                event_type: "Illness",
                category_id: categoryA,
                tag_ids: [tagA, extraTag],
                q: "Cough",
                date_from: new Date().toISOString(),
                date_to: future,
              })
            ).rows[0].doc;
            assert.equal(combined.total, 1);
            assert.equal(combined.events[0].id, savedId);
            assert.equal(
              (await search({ tag_ids: [tagA, tagB] })).rows[0].doc.total,
              0,
            );
            assert.equal(
              (await search({ category_id: categoryB })).rows[0].doc.total,
              0,
            );
            const dashboard = (
              await query("select public.health_dashboard('{}') as doc")
            ).rows[0].doc;
            assert.equal(dashboard.profiles.length, 2);
            assert.ok(
              dashboard.profiles
                .find((p) => p.profile_id === profileA)
                .illnesses.some((e) => e.id === savedId),
            );
            assert.equal(
              (
                await query("select public.health_event_document($1) as doc", [
                  eventB,
                ])
              ).rows[0].doc,
              null,
            );
            assert.equal((await save(eventB, payload)).rows[0].doc, null);
          },
          { commit: true },
        );
        assert.equal(
          (
            await query("select owner_id from health_events where id=$1", [
              savedId,
            ])
          ).rows[0].owner_id,
          alice,
        );
        for (const input of [
          { ...payload, title: "Should roll back", tag_ids: [tagB] },
          { ...payload, title: "Should roll back", category_id: categoryB },
        ]) {
          await assert.rejects(
            asUser(alice, () => save(savedId, input)),
            { code: "23503" },
          );
          assert.equal(
            (
              await query("select title from health_events where id=$1", [
                savedId,
              ])
            ).rows[0].title,
            "Recovery",
          );
          assert.equal(
            (
              await query("select * from health_event_tags where event_id=$1", [
                savedId,
              ])
            ).rows.length,
            2,
          );
        }
        await asUser(alice, async () => {
          const edited = (
            await save(savedId, { ...payload, tag_ids: [], category_id: null })
          ).rows[0].doc;
          assert.equal(edited.tags.length, 0);
          assert.equal(edited.category, null);
        });
        await asUser(bob, async () => {
          assert.equal(
            (await search({ q: "literal %_() phrase" })).rows[0].doc.total,
            0,
          );
          const result = (
            await query("select public.health_dashboard('{}') as doc")
          ).rows[0].doc;
          assert.ok(result.profiles.every((p) => p.profile_id !== profileA));
        });
        await assert.rejects(
          asUser(null, () => search({}), { role: "anon" }),
          { code: "42501" },
        );
        await asUser(outsider, async () =>
          assert.equal((await search({})).rows[0].doc.total, 0),
        );
      },
    );
  } finally {
    await db.close();
  }
});
