import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
    for (const file of [
      "202609110001_initial_health_schema.sql",
      "202609120001_tracker_experience.sql",
      "202609120002_attachments.sql",
      "202609120003_settings.sql",
      "202609120004_timeline.sql",
      "202609120005_providers.sql",
      "202609120006_vaccinations.sql",
      "202609120007_documents.sql",
      "202609120008_episodes.sql",
    ])
      await db.exec(
        await readFile(
          new URL(`../migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
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
      assert.equal(all.total, 2);
      assert.equal(all.items[0].entry_type, "document");
      assert.equal(all.items[1].summary, "Short summary");
      const first = await timeline({ page: 1, page_size: 1 }),
        second = await timeline({ page: 2, page_size: 1 });
      assert.equal(first.total, 2);
      assert.notEqual(first.items[0].id, second.items[0].id);
      const year = await timeline({
        date_from: "2026-01-01T00:00:00Z",
        date_to: "2027-01-01T00:00:00Z",
      });
      assert.equal(year.total, 1);
      assert.equal(year.items[0].entry_type, "document");
      assert.equal((await timeline({}, "event")).total, 1);
      assert.equal((await timeline({}, "document")).total, 1);
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
        2,
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
        1,
        "incomplete uploads are excluded",
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
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('profile-avatars',$1,$2)",
        [path, { size: 123, mimetype: "image/png" }],
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
    await run(uid(2), async () =>
      assert.equal(
        (
          await db.query(
            "select * from storage.objects where bucket_id='profile-avatars'",
          )
        ).rows.length,
        0,
      ),
    );
    await run(uid(1), async () => {
      await db.query(
        "insert into public.providers(id,name,specialty) values($1,'Dr Test','General practice')",
        [uid(81)],
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
        event_date: "2026-01-01T12:00:00Z",
        notes: "Patient supplied notes",
        next_dose_date: "2030-06-15",
      };
      const saved = (
        await db.query("select public.save_health_event(null,$1) as result", [
          input,
        ])
      ).rows[0].result;
      assert.equal(saved.disease, "Recorded disease");
      assert.equal(saved.next_dose_date, "2030-06-15");
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
        status: "active",
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
          { ...input, status: "resolved", end_date: "2026-01-15" },
        ])
      ).rows[0].result;
      assert.equal(resolved.status, "resolved");
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
