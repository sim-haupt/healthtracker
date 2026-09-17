import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("private attachments enforce database and Storage isolation and upload constraints", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
    const migrationDirectory = new URL("../migrations/", import.meta.url);
    for (const file of (await readdir(migrationDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(file, migrationDirectory), "utf8"));
    await db.query("insert into auth.users values ($1),($2),($3)", [
      uid(1),
      uid(2),
      uid(3),
    ]);
    await db.query("insert into public.app_users(user_id) values ($1),($2)", [
      uid(1),
      uid(2),
    ]);
    for (const n of [1, 2])
      await db.query(
        `insert into public.health_events(id,owner_id,profile_id,event_type,title,event_date) select $1,$2,id,'Other','Synthetic',now() from public.profiles where owner_id=$2 limit 1`,
        [uid(n + 10), uid(n)],
      );
    const run = async (owner, fn, role = "authenticated") => {
      await db.exec(`set role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        owner ?? "",
      ]);
      try {
        return await fn();
      } finally {
        await db.exec("reset role");
      }
    };
    const path = `${uid(1)}/${uid(11)}/${uid(21)}`;
    const insert = (
      id = uid(21),
      event = uid(11),
      size = 123,
      name = "report.pdf",
      mime = "application/pdf",
      filePath = path,
    ) =>
      db.query(
        `insert into public.attachments(id,health_event_id,file_name,file_path,mime_type,file_size) values($1,$2,$3,$4,$5,$6)`,
        [id, event, name, filePath, mime, size],
      );
    let avatarPath;
    await run(uid(1), async () => {
      await assert.rejects(
        insert(
          uid(21),
          uid(12),
          123,
          "report.pdf",
          "application/pdf",
          `${uid(1)}/${uid(12)}/${uid(21)}`,
        ),
        { code: "23503" },
      );
      await assert.rejects(insert(uid(21), uid(11), 10485761), {
        code: "23514",
      });
      await assert.rejects(insert(uid(21), uid(11), 123, "../report.pdf"), {
        code: "23514",
      });
      await assert.rejects(
        insert(uid(21), uid(11), 123, "report.pdf", "image/jpeg"),
        { code: "23514" },
      );
      await assert.rejects(
        db.query(
          `insert into public.attachments(id,health_event_id,file_name,file_path,mime_type,file_size,document_category)
           values($1,$2,'report.pdf',$3,'application/pdf',123,'secret')`,
          [uid(21), uid(11), path],
        ),
        { code: "23514" },
      );
      await insert();
      await assert.rejects(
        db.query(
          "insert into storage.objects(bucket_id,name,metadata) values ('health-attachments',$1,$2)",
          [path, { size: 124, mimetype: "application/pdf" }],
        ),
        { code: "42501" },
      );
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata) values ('health-attachments',$1,$2)",
        [path, { size: 123, mimetype: "application/pdf" }],
      );
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        1,
      );
      assert.equal(
        (
          await db.query(
            "update storage.objects set name='changed' returning *",
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        db.query("delete from public.health_events where id=$1", [uid(11)]),
        { code: "23001" },
      );
      await db.query(
        `insert into public.health_events(id,owner_id,profile_id,event_type,title,event_date)
         select $1,owner_id,profile_id,'Other','Linked document event',now()
         from public.health_events where id=$2`,
        [uid(13), uid(11)],
      );
      const linked = (
        await db.query("select public.link_event_document($1,$2) as document", [
          uid(13),
          uid(21),
        ])
      ).rows[0].document;
      assert.equal(linked.id, uid(21));
      const linkedDocuments = (
        await db.query("select public.event_documents($1) as documents", [
          uid(13),
        ])
      ).rows[0].documents;
      assert.equal(linkedDocuments.length, 1);
      assert.equal(linkedDocuments[0].id, uid(21));
      await db.query("delete from public.health_events where id=$1", [uid(13)]);
    });
    await run(uid(2), async () => {
      const unavailable = (
        await db.query("select public.link_event_document($1,$2) as document", [
          uid(12),
          uid(21),
        ])
      ).rows[0].document;
      assert.equal(unavailable, null);
    });
    const timeline = async (filters = {}, kind = "all") =>
      (
        await db.query("select public.health_timeline($1,$2) as result", [
          filters,
          kind,
        ])
      ).rows[0].result;
    await db.query(
      "update public.health_events set event_date='2024-01-01T12:00:00Z',diagnosis='Short summary' where id=$1",
      [uid(11)],
    );
    await db.query(
      "update public.attachments set created_at='2026-01-01T12:00:00Z',document_category='lab result',description='Annual blood work' where id=$1",
      [uid(21)],
    );
    await run(uid(1), async () => {
      const all = await timeline();
      assert.equal(all.total, 1);
      assert.equal(all.items[0].entry_type, "event");
      assert.equal(all.items[0].summary, "Short summary");
      const first = await timeline({ page: 1, page_size: 1 }),
        second = await timeline({ page: 2, page_size: 1 });
      assert.equal(first.total, 1);
      assert.equal(first.items.length, 1);
      assert.equal(second.items.length, 0);
      const year = await timeline({
        date_from: "2026-01-01T00:00:00Z",
        date_to: "2027-01-01T00:00:00Z",
      });
      assert.equal(year.total, 0);
      assert.equal((await timeline({}, "event")).total, 1);
      assert.equal((await timeline({}, "document")).total, 0);
      assert.equal((await timeline({ event_type: "Vaccination" })).total, 0);
      assert.equal(
        (
          await timeline({
            profile_id: (
              await db.query(
                "select profile_id from public.health_events where id=$1",
                [uid(11)],
              )
            ).rows[0].profile_id,
          })
        ).total,
        1,
      );
      assert.equal((await timeline({ tag_ids: [uid(999)] })).total, 0);
      assert.equal((await timeline({ category_id: uid(999) })).total, 0);
      const documents = async (filters = {}) =>
        (
          await db.query(
            "select public.search_health_documents($1) as result",
            [filters],
          )
        ).rows[0].result;
      const allDocuments = await documents();
      assert.equal(allDocuments.total, 1);
      assert.equal(allDocuments.documents[0].file_name, "report.pdf");
      assert.equal(allDocuments.documents[0].document_category, "lab result");
      assert.equal(allDocuments.documents[0].description, "Annual blood work");
      assert.equal((await documents({ file_type: "pdf" })).total, 1);
      assert.equal((await documents({ file_type: "image" })).total, 0);
      assert.equal(
        (await documents({ document_category: "lab result" })).total,
        1,
      );
      assert.equal(
        (await documents({ document_category: "invoice" })).total,
        0,
      );
      assert.equal((await documents({ event_id: uid(11) })).total, 1);
      assert.equal((await documents({ event_id: uid(12) })).total, 0);
      assert.equal((await documents({ q: "BLOOD WORK" })).total, 1);
      assert.equal((await documents({ q: "report.pdf" })).total, 1);
      assert.equal((await documents({ q: "%_" })).total, 0);
      assert.equal(
        (
          await documents({
            date_from: "2026-01-01T00:00:00Z",
            date_to: "2026-01-02T00:00:00Z",
          })
        ).total,
        1,
      );
      assert.equal(
        (
          await documents({
            profile_id: (
              await db.query(
                "select profile_id from public.health_events where id=$1",
                [uid(11)],
              )
            ).rows[0].profile_id,
          })
        ).total,
        1,
      );
      assert.equal((await documents({ tag_ids: [uid(999)] })).total, 0);
      await db.query(
        "insert into public.attachments(id,health_event_id,file_name,file_path,mime_type,file_size) values($1,$2,'pending.pdf',$3,'application/pdf',123)",
        [uid(22), uid(11), `${uid(1)}/${uid(11)}/${uid(22)}`],
      );
      assert.equal(
        (await timeline({}, "document")).total,
        0,
        "documents are excluded from the timeline",
      );
      assert.equal(
        (await documents()).total,
        1,
        "incomplete uploads are excluded from documents",
      );
    });
    await run(uid(2), async () => {
      const result = await timeline();
      assert.ok(result.items.every((item) => item.event_id !== uid(11)));
      const documents = (
        await db.query("select public.search_health_documents('{}') as result")
      ).rows[0].result;
      assert.ok(
        documents.documents.every((item) => item.health_event_id !== uid(11)),
      );
    });
    await run(uid(3), async () => assert.equal((await timeline()).total, 0));
    await run(
      null,
      async () => {
        await assert.rejects(timeline(), { code: "42501" });
        await assert.rejects(
          db.query("select public.search_health_documents('{}')"),
          { code: "42501" },
        );
      },
      "anon",
    );
    for (const owner of [uid(2), uid(3), null])
      await run(
        owner,
        async () => {
          if (owner === null)
            await assert.rejects(db.query("select * from public.attachments"), {
              code: "42501",
            });
          else
            assert.equal(
              (await db.query("select * from public.attachments")).rows.length,
              0,
            );
          assert.equal(
            (await db.query("select * from storage.objects")).rows.length,
            0,
          );
          assert.equal(
            (await db.query("delete from storage.objects returning *")).rows
              .length,
            0,
          );
          await assert.rejects(
            db.query(
              "insert into storage.objects(bucket_id,name,metadata) values ('health-attachments',$1,$2)",
              [path, { size: 123, mimetype: "application/pdf" }],
            ),
            { code: "42501" },
          );
        },
        owner === null ? "anon" : "authenticated",
      );
    await db.query(
      "update public.app_users set enabled=false where user_id=$1",
      [uid(1)],
    );
    await run(uid(1), async () =>
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        0,
      ),
    );
    await db.query(
      "update public.app_users set enabled=true where user_id=$1",
      [uid(1)],
    );
    await run(uid(1), async () => {
      await db.exec(
        "delete from storage.objects;delete from public.attachments;",
      );
      await db.query("delete from public.health_events where id=$1", [uid(11)]);
    });
    await run(uid(1), async () => {
      const profile = (await db.query("select id from public.profiles limit 1"))
        .rows[0].id;
      await db.query("update public.profiles set name='Alex' where id=$1", [
        profile,
      ]);
      const path = `${uid(1)}/${profile}/${uid(55)}`;
      avatarPath = path;
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('profile-avatars',$1,$2)",
        [path, null],
      );
      await db.query("update public.profiles set avatar=$1 where id=$2", [
        path,
        profile,
      ]);
      await assert.rejects(
        db.query("update public.profiles set avatar=$1 where id=$2", [
          `${uid(2)}/${profile}/${uid(55)}`,
          profile,
        ]),
        { code: "23514" },
      );
      const cat = (await db.query("select id from public.categories limit 1"))
        .rows[0].id;
      await db.query(
        "insert into public.health_events(id,profile_id,event_type,title,event_date,category_id) values($1,$2,'Other','Kept event',now(),$3)",
        [uid(66), profile, cat],
      );
      await db.query("delete from public.categories where id=$1", [cat]);
      assert.equal(
        (
          await db.query(
            "select category_id from public.health_events where id=$1",
            [uid(66)],
          )
        ).rows[0].category_id,
        null,
      );
    });
    await run(uid(2), async () => {
      await assert.rejects(
        db.query(
          "insert into storage.objects(bucket_id,name,metadata) values('profile-avatars',$1,$2)",
          [avatarPath, null],
        ),
        { code: "42501" },
      );
      assert.equal(
        (
          await db.query(
            "select * from storage.objects where bucket_id='profile-avatars'",
          )
        ).rows.length,
        0,
      );
    });
    await run(uid(1), async () => {
      await db.query(
        "insert into public.providers(id,name,specialty) values($1,'Dr Test','General practice')",
        [uid(81)],
      );
      await db.query("update public.providers set rating=4 where id=$1", [
        uid(81),
      ]);
      assert.equal(
        (
          await db.query("select rating from public.providers where id=$1", [
            uid(81),
          ])
        ).rows[0].rating,
        4,
      );
      await assert.rejects(
        db.query("update public.providers set rating=6 where id=$1", [uid(81)]),
        { code: "23514" },
      );
      const profile = (await db.query("select id from public.profiles limit 1"))
        .rows[0].id;
      const input = {
        profile_id: profile,
        provider_id: uid(81),
        event_type: "Doctor Visit",
        title: "Linked appointment",
        event_date: "2026-06-01T12:00:00Z",
        doctor: "Dr Test",
        diagnosis: "Test diagnosis",
        prescription: "Test prescription",
        notes: "Follow-up",
      };
      const saved = (
        await db.query("select public.save_health_event(null,$1) as result", [
          input,
        ])
      ).rows[0].result;
      assert.equal(saved.provider.id, uid(81));
      assert.equal(saved.provider.name, "Dr Test");
      assert.equal((await timeline({ provider_id: uid(81) })).total, 1);
      assert.equal((await timeline({ provider_id: uid(82) })).total, 0);
    });
    await run(uid(2), async () => {
      assert.equal(
        (await db.query("select * from public.providers")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "update public.providers set name=$1 where id=$2 returning id",
            ["Spoofed", uid(81)],
          )
        ).rows.length,
        0,
      );
      await db.query(
        "insert into public.providers(id,name) values($1,'Other doctor')",
        [uid(82)],
      );
      const profile = (await db.query("select id from public.profiles limit 1"))
        .rows[0].id;
      await assert.rejects(
        db.query(
          "insert into public.health_events(profile_id,provider_id,event_type,title,event_date) values($1,$2,'Other','Invalid',now())",
          [profile, uid(81)],
        ),
        { code: "23503" },
      );
    });
    await run(uid(1), async () => {
      await db.query("delete from public.providers where id=$1", [uid(81)]);
      const row = (
        await db.query(
          "select provider_id,doctor,diagnosis from public.health_events where title='Linked appointment'",
        )
      ).rows[0];
      assert.equal(row.provider_id, null);
      assert.equal(row.doctor, "Dr Test");
      assert.equal(row.diagnosis, "Test diagnosis");
    });
    await run(uid(1), async () => {
      const profile = (await db.query("select id from public.profiles limit 1"))
        .rows[0].id;
      const input = {
        profile_id: profile,
        event_type: "Vaccination",
        title: "Recorded vaccine",
        disease: "Recorded disease",
        dose_number: 2,
        dose_total: 3,
        event_date: "2026-01-01T12:00:00Z",
        notes: "Patient supplied notes",
        next_dose_date: "2030-06-15",
        needs_renewal: true,
        renewal_date: "2035-06-15",
      };
      const saved = (
        await db.query("select public.save_health_event(null,$1) as result", [
          input,
        ])
      ).rows[0].result;
      assert.equal(saved.disease, "Recorded disease");
      assert.equal(saved.next_dose_date, "2030-06-15");
      assert.equal(saved.dose_number, 2);
      assert.equal(saved.dose_total, 3);
      assert.equal(saved.needs_renewal, true);
      assert.equal(saved.renewal_date, "2035-06-15");
      const dashboard = (
        await db.query("select public.health_dashboard('{}') as result")
      ).rows[0].result;
      assert.ok(
        dashboard.profiles
          .find((p) => p.profile_id === profile)
          .vaccination_doses.some(
            (d) => d.id === saved.id && d.date === "2030-06-15",
          ),
      );
      const history = (
        await db.query("select public.search_health_events($1) as result", [
          { event_type: "Vaccination" },
        ])
      ).rows[0].result;
      assert.equal(history.events[0].disease, "Recorded disease");
      assert.equal(history.events[0].title, "Recorded disease");
      const vaccinationSearch = (
        await db.query("select public.search_health_events($1) as result", [
          { q: "Recorded disease" },
        ])
      ).rows[0].result;
      assert.ok(
        vaccinationSearch.events.some((event) => event.id === saved.id),
      );
      const timeline = (
        await db.query("select public.health_timeline($1,'event') as result", [
          { event_type: "Vaccination" },
        ])
      ).rows[0].result;
      assert.equal(timeline.items[0].title, "Recorded disease");
      await db.query("select public.save_health_event($1,$2)", [
        saved.id,
        { ...input, next_dose_date: "2000-01-01" },
      ]);
      const past = (
        await db.query("select public.health_dashboard('{}') as result")
      ).rows[0].result;
      assert.equal(
        past.profiles.find((p) => p.profile_id === profile).vaccination_doses
          .length,
        0,
        "past dates are not labeled as upcoming",
      );
      await db.query("select public.save_health_event($1,$2)", [
        saved.id,
        { ...input, next_dose_date: null },
      ]);
      const cleared = (
        await db.query("select public.health_dashboard('{}') as result")
      ).rows[0].result;
      assert.equal(
        cleared.profiles.find((p) => p.profile_id === profile).vaccination_doses
          .length,
        0,
        "no dates inferred when none entered",
      );
    });
    await run(uid(2), async () => {
      const dashboard = (
        await db.query("select public.health_dashboard('{}') as result")
      ).rows[0].result;
      assert.ok(dashboard.profiles.every((p) => !p.vaccination_doses.length));
    });

    let episodeId;
    await run(uid(1), async () => {
      const events = (
        await db.query(
          "select id,profile_id from public.health_events order by id",
        )
      ).rows;
      const event = events[0];
      const input = {
        title: "Flu episode",
        profile_id: event.profile_id,
        start_date: "2026-01-01",
        end_date: null,
        description: "Recovery",
        event_ids: [event.id],
      };
      const saved = (
        await db.query("select public.save_health_episode(null,$1) as result", [
          input,
        ])
      ).rows[0].result;
      episodeId = saved.id;
      assert.equal(saved.events.length, 1);
      assert.equal(saved.status, "active");
      const dashboard = (
        await db.query("select public.health_dashboard('{}') as result")
      ).rows[0].result;
      assert.deepEqual(
        dashboard.profiles
          .find((profile) => profile.profile_id === event.profile_id)
          .active_episodes.map((episode) => episode.id),
        [episodeId],
      );
      const entries = await timeline({}, "episode");
      assert.equal(entries.total, 1);
      assert.equal(entries.items[0].event_id, episodeId);
      assert.equal((await timeline({ q: "Recovery" }, "episode")).total, 1);
      assert.equal((await timeline({ q: "unmatched" }, "episode")).total, 0);
      const otherProfile = (
        await db.query("select id from public.profiles where id<>$1", [
          event.profile_id,
        ])
      ).rows[0].id;
      await assert.rejects(
        db.query("select public.save_health_episode($1,$2)", [
          episodeId,
          { ...input, profile_id: otherProfile },
        ]),
        { code: "23503" },
      );
      await assert.rejects(
        db.query("select public.save_health_episode($1,$2)", [
          episodeId,
          { ...input, event_ids: [uid(12)] },
        ]),
        { code: "23503" },
      );
      const retained = (
        await db.query("select public.episode_document($1) as result", [
          episodeId,
        ])
      ).rows[0].result;
      assert.equal(
        retained.events.length,
        1,
        "failed replacement rolls back links",
      );
      assert.equal(retained.profile_id, event.profile_id);
      const resolved = (
        await db.query("select public.save_health_episode($1,$2) as result", [
          episodeId,
          { ...input, status: "active", end_date: "2026-01-15" },
        ])
      ).rows[0].result;
      assert.equal(resolved.status, "resolved");
      const linkedEvent = (
        await db.query(
          "insert into public.health_events(profile_id,event_type,title,event_date) values($1,'Other','Linked later',now()) returning id",
          [event.profile_id],
        )
      ).rows[0].id;
      assert.equal(
        (
          await db.query(
            "select public.link_event_to_episode($1,$2) as linked",
            [episodeId, linkedEvent],
          )
        ).rows[0].linked,
        true,
      );
      assert.equal(
        (
          await db.query(
            "select public.link_event_to_episode($1,$2) as linked",
            [episodeId, linkedEvent],
          )
        ).rows[0].linked,
        true,
        "linking the same event is idempotent",
      );
      assert.equal(
        (
          await db.query("select public.episode_document($1) as result", [
            episodeId,
          ])
        ).rows[0].result.events.length,
        2,
      );
      const listedEpisodes = (
        await db.query("select public.list_health_episodes($1) as result", [
          event.profile_id,
        ])
      ).rows[0].result;
      assert.equal(listedEpisodes.length, 1);
      assert.equal(listedEpisodes[0].events.length, 2);
      const otherProfileEvent = (
        await db.query(
          "insert into public.health_events(profile_id,event_type,title,event_date) values($1,'Other','Wrong profile',now()) returning id",
          [otherProfile],
        )
      ).rows[0].id;
      assert.equal(
        (
          await db.query(
            "select public.link_event_to_episode($1,$2) as linked",
            [episodeId, otherProfileEvent],
          )
        ).rows[0].linked,
        false,
      );
      await assert.rejects(
        db.query("update public.health_events set profile_id=$1 where id=$2", [
          otherProfile,
          event.id,
        ]),
        { code: "23503" },
      );
    });
    for (const owner of [uid(2), uid(3)])
      await run(owner, async () => {
        assert.equal(
          (await db.query("select * from public.health_episodes")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.health_episode_events")).rows
            .length,
          0,
        );
        assert.equal((await timeline({}, "episode")).total, 0);
        assert.deepEqual(
          (await db.query("select public.list_health_episodes(null) as result"))
            .rows[0].result,
          [],
        );
        assert.equal(
          (
            await db.query(
              "select public.link_event_to_episode($1,$2) as linked",
              [episodeId, uid(12)],
            )
          ).rows[0].linked,
          false,
        );
        assert.equal(
          (
            await db.query("select public.episode_document($1) as result", [
              episodeId,
            ])
          ).rows[0].result,
          null,
        );
        assert.equal(
          (
            await db.query(
              "delete from public.health_episodes where id=$1 returning id",
              [episodeId],
            )
          ).rows.length,
          0,
        );
      });
    await run(
      null,
      async () => {
        await assert.rejects(
          db.query("select public.episode_document($1)", [episodeId]),
          { code: "42501" },
        );
      },
      "anon",
    );
    await run(uid(1), async () => {
      const before = (
        await db.query("select count(*) as n from public.health_events")
      ).rows[0].n;
      await db.query("delete from public.health_episodes where id=$1", [
        episodeId,
      ]);
      assert.equal(
        (await db.query("select count(*) as n from public.health_events"))
          .rows[0].n,
        before,
      );
      assert.equal(
        (await db.query("select * from public.health_episode_events")).rows
          .length,
        0,
      );
    });

    let customType;
    await run(uid(1), async () => {
      const defaults = (await db.query("select * from public.event_types"))
        .rows;
      assert.equal(defaults.length, 9);
      assert.ok(defaults.some((eventType) => eventType.key === "Migraine"));
      customType = (
        await db.query(
          "insert into public.event_types(name,color) values('Custom check','#249E94') returning *",
        )
      ).rows[0];
      const profile = (await db.query("select id from public.profiles limit 1"))
        .rows[0].id;
      const event = (
        await db.query(
          "insert into public.health_events(profile_id,event_type,title,event_date) values($1,$2,'Custom event',now()) returning id",
          [profile, customType.key],
        )
      ).rows[0];
      await db.query(
        "update public.event_types set name='Renamed',color='#005461' where id=$1",
        [customType.id],
      );
      assert.equal(
        (
          await db.query(
            "select event_type from public.health_events where id=$1",
            [event.id],
          )
        ).rows[0].event_type,
        customType.key,
      );
      await db.query(
        "update public.event_types set archived=true where id=$1",
        [customType.id],
      );
      await db.query(
        "update public.health_events set notes='Kept' where id=$1",
        [event.id],
      );
      await assert.rejects(
        db.query(
          "insert into public.health_events(profile_id,event_type,title,event_date) values($1,$2,'New',now())",
          [profile, customType.key],
        ),
        { code: "23514" },
      );
      await assert.rejects(
        db.query(
          "insert into public.event_types(name,color) values('Bad','javascript:bad')",
        ),
        { code: "23514" },
      );
    });
    await run(uid(2), async () => {
      assert.equal(
        (
          await db.query("select * from public.event_types where id=$1", [
            customType.id,
          ])
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "update public.event_types set name='Foreign' where id=$1 returning id",
            [customType.id],
          )
        ).rows.length,
        0,
      );
    });
    let vaccinationId;
    await run(uid(1), async () => {
      const profile = (
        await db.query(
          "select id from public.profiles order by created_at,id limit 1",
        )
      ).rows[0].id;
      vaccinationId = uid(90);
      await db.query(
        `insert into public.health_events(id,profile_id,event_type,title,disease,event_date,next_dose_date,needs_renewal,renewal_date)
         values($1,$2,'Vaccination','Example vaccine','Example disease',now(),'2027-03-10',true,'2036-03-10')`,
        [vaccinationId, profile],
      );
      const generated = (
        await db.query(
          "select reminder_kind,title,due_date::text,status from public.reminders where source_event_id=$1 order by reminder_kind",
          [vaccinationId],
        )
      ).rows;
      assert.deepEqual(
        generated.map((item) => item.reminder_kind),
        ["next_dose", "renewal"],
      );
      assert.equal(generated[0].status, "scheduled");
      await db.query(
        "update public.health_events set next_dose_date='2027-04-10',needs_renewal=false where id=$1",
        [vaccinationId],
      );
      const changed = (
        await db.query(
          "select reminder_kind,due_date::text from public.reminders where source_event_id=$1",
          [vaccinationId],
        )
      ).rows;
      assert.deepEqual(changed, [
        { reminder_kind: "next_dose", due_date: "2027-04-10" },
      ]);
      const customId = (
        await db.query(
          "insert into public.reminders(profile_id,source_event_id,title,due_date,recurrence) values($1,$2,'Annual check','2027-09-14','yearly') returning id",
          [profile, vaccinationId],
        )
      ).rows[0].id;
      assert.equal(
        (
          await db.query(
            "select count(*) as n from public.reminders where source_event_id=$1",
            [vaccinationId],
          )
        ).rows[0].n,
        2,
      );
      const synchronized = (
        await db.query(
          "select public.sync_event_reminders($1,$2) as reminders",
          [
            vaccinationId,
            [
              {
                id: customId,
                title: "Updated annual check",
                due_date: "2027-10-14",
                recurrence: "yearly",
              },
              {
                title: "Follow-up",
                due_date: "2027-11-14",
                recurrence: "none",
              },
            ],
          ],
        )
      ).rows[0].reminders;
      assert.deepEqual(
        synchronized.map((item) => item.title),
        ["Updated annual check", "Follow-up"],
      );
      assert.equal(
        (
          await db.query(
            "select jsonb_array_length(public.sync_event_reminders($1,'[]')) as n",
            [vaccinationId],
          )
        ).rows[0].n,
        0,
      );
    });
    await run(uid(2), async () => {
      assert.equal(
        (
          await db.query(
            "select count(*) as n from public.reminders where source_event_id=$1",
            [vaccinationId],
          )
        ).rows[0].n,
        0,
      );
    });
    const bucket = (
      await db.query(
        "select * from storage.buckets where id='health-attachments'",
      )
    ).rows[0];
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), 10485760);
  } finally {
    await db.close();
  }
});
