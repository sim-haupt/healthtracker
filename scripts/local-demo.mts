/** Disposable local demo. Never imported by either production application. */
import { PGlite } from "@electric-sql/pglite";
import express from "express";
import cors from "cors";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createApp } from "../apps/api/src/app.ts";
import { createUserDataAccess } from "../apps/api/src/data.ts";
if (Number(process.versions.node.split(".")[0]) < 22)
  throw new Error("Run the demo with Node 22 or later.");
if (process.env.NODE_ENV === "production")
  throw new Error("The local demo cannot run in production.");
const email = "demo@example.com",
  password = "Local-Health-2026!";
const owner = randomUUID(),
  secret = randomBytes(32),
  key = "local-demo-public-key";
const base = "http://127.0.0.1:54321";
const db = new PGlite();
await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;grant select on storage.buckets to authenticated;`);
for (const file of (
  await readdir(new URL("../supabase/migrations/", import.meta.url))
)
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/" + file, import.meta.url),
      "utf8",
    ),
  );
await db.query("insert into auth.users values($1)", [owner]);
await db.query("insert into public.app_users(user_id) values($1)", [owner]);
const profiles = (
  await db.query<{ id: string }>(
    "select id from public.profiles order by created_at,id",
  )
).rows;
await db.query("update public.profiles set name=$1 where id=$2", [
  "Alex",
  profiles[0].id,
]);
await db.query("update public.profiles set name=$1 where id=$2", [
  "Sam",
  profiles[1].id,
]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
const date = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};
const day = (days: number) => date(days).slice(0, 10);
const provider = randomUUID();
await db.query(
  "insert into public.providers(id,name,specialty,notes) values($1,'Dr Morgan Lee','General practice','Synthetic demo provider')",
  [provider],
);
const tag = (
  await db.query<{ id: string }>(
    "insert into public.tags(name) values('demo flu') returning id",
  )
).rows[0].id;
const category = (
  await db.query<{ id: string }>("select id from public.categories limit 1")
).rows[0].id;
const events: any[] = [];
for (const input of [
  {
    profile_id: profiles[0].id,
    event_type: "Symptom",
    title: "Fever and sore throat",
    event_date: date(-9),
    symptoms: "Fever, sore throat, tiredness",
    notes: "Synthetic sample record.",
    tag_ids: [tag],
  },
  {
    profile_id: profiles[0].id,
    event_type: "Doctor Visit",
    title: "Flu consultation",
    event_date: date(-7),
    provider_id: provider,
    doctor: "Dr Morgan Lee",
    diagnosis: "Flu — sample entry",
    treatment: "Rest and follow-up recorded for demonstration.",
    tag_ids: [tag],
  },
  {
    profile_id: profiles[0].id,
    event_type: "Medication",
    title: "Medication record",
    event_date: date(-7),
    prescription: "Example medication entry — synthetic data",
    tag_ids: [tag],
  },
  {
    profile_id: profiles[0].id,
    event_type: "Doctor Visit",
    title: "Follow-up appointment",
    event_date: date(3),
    provider_id: provider,
    doctor: "Dr Morgan Lee",
    tag_ids: [tag],
  },
  {
    profile_id: profiles[0].id,
    event_type: "Examination / Test",
    title: "Routine blood test",
    event_date: date(-20),
    diagnosis: "Sample result record",
    provider_id: provider,
  },
  {
    profile_id: profiles[1].id,
    event_type: "Doctor Visit",
    title: "Dental check-up",
    event_date: date(8),
    doctor: "Dr Avery Kim",
    location: "Sample dental clinic",
  },
  {
    profile_id: profiles[1].id,
    event_type: "Vaccination",
    title: "Vaccination record",
    event_date: date(-60),
    disease: "Sample disease",
    next_dose_date: day(30),
    notes: "Example date only; not a vaccination recommendation.",
  },
  {
    profile_id: profiles[1].id,
    event_type: "Injury",
    title: "Ankle strain",
    event_date: date(-16),
    end_date: date(-4),
    description: "Synthetic sports injury entry",
    treatment: "Sample recovery notes",
  },
  {
    profile_id: profiles[1].id,
    event_type: "Other",
    title: "Recovery check-in",
    event_date: date(-4),
    notes: "Symptoms resolved — synthetic example",
  },
])
  events.push(
    (
      await db.query<any>(
        "select public.save_health_event(null,$1) as result",
        [{ description: "", category_id: category, ...input }],
      )
    ).rows[0].result,
  );
for (const input of [
  {
    title:
      "Flu — " +
      new Date().toLocaleDateString("en", { month: "long", year: "numeric" }),
    profile_id: profiles[0].id,
    start_date: day(-9),
    end_date: null,
    status: "active",
    description:
      "Synthetic episode linking symptoms, consultation, medication, and follow-up.",
    event_ids: events.slice(0, 4).map((e) => e.id),
  },
  {
    title: "Ankle recovery",
    profile_id: profiles[1].id,
    start_date: day(-16),
    end_date: day(-4),
    status: "resolved",
    description: "Synthetic resolved episode.",
    event_ids: events.slice(7, 9).map((e) => e.id),
  },
])
  await db.query("select public.save_health_episode(null,$1)", [input]);
const files = new Map<string, { bytes: Buffer; mime: string }>();
const attachment = randomUUID(),
  filePath = `${owner}/${events[4].id}/${attachment}`;
const bytes = Buffer.from(
  "Synthetic laboratory report\n\nThis is sample data for the local health tracker demo.\nNo real medical results.\n",
);
await db.query(
  "insert into public.attachments(id,health_event_id,file_name,file_path,mime_type,file_size,document_category,description) values($1,$2,'sample-lab-report.txt',$3,'text/plain',$4,'lab result','Synthetic laboratory report')",
  [attachment, events[4].id, filePath, bytes.length],
);
await db.query(
  "insert into storage.objects(bucket_id,name,metadata) values('health-attachments',$1,$2)",
  [filePath, { size: bytes.length, mimetype: "text/plain" }],
);
files.set("health-attachments/" + filePath, { bytes, mime: "text/plain" });
// Every simulated Data API request still executes the real migrations and RLS.
let queue: Promise<unknown> = Promise.resolve();
function scoped<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  const task = queue.then(() =>
    db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      return fn(tx);
    }),
  );
  queue = task.catch(() => {});
  return task;
}
const sessions = new Map<string, { refresh: string; expires: number }>();
const user = {
  id: owner,
  aud: "authenticated",
  role: "authenticated",
  email,
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
function session() {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encoded = (v: any) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const payload =
    encoded({ alg: "HS256", typ: "JWT" }) +
    "." +
    encoded({
      sub: owner,
      aud: "authenticated",
      role: "authenticated",
      email,
      exp: expires,
      iat: Math.floor(Date.now() / 1000),
    });
  const token =
    payload +
    "." +
    createHmac("sha256", secret).update(payload).digest("base64url");
  const refresh = randomBytes(32).toString("hex");
  sessions.set(token, { refresh, expires });
  return {
    access_token: token,
    refresh_token: refresh,
    expires_in: 3600,
    expires_at: expires,
    token_type: "bearer",
    user,
  };
}
const valid = (token: string) =>
  !!sessions.get(token) && sessions.get(token)!.expires > Date.now() / 1000;
const local = express();
local.use(
  cors({
    origin: ["http://localhost:3001", "http://127.0.0.1:3001"],
    exposedHeaders: ["Content-Range"],
  }),
);
local.use((_q, r, n) => {
  r.setHeader("Cache-Control", "no-store");
  n();
});
local.post("/auth/v1/token", express.json(), (req, res) => {
  const refresh =
    req.query.grant_type === "refresh_token" &&
    [...sessions.values()].some((s) => s.refresh === req.body.refresh_token);
  if (
    !refresh &&
    (req.query.grant_type !== "password" ||
      req.body.email !== email ||
      req.body.password !== password)
  ) {
    res
      .status(400)
      .json({
        error: "invalid_grant",
        error_description: "Invalid demo credentials",
      });
    return;
  }
  res.json(session());
});
local.use((req, res, next) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
  if (!valid(token)) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  next();
});
local.get("/auth/v1/user", (_req, res) => res.json(user));
local.post("/auth/v1/logout", (req, res) => {
  sessions.delete((req.headers.authorization ?? "").replace(/^Bearer /i, ""));
  res.status(204).end();
});
local.post(
  "/rest/v1/rpc/:name",
  express.json({ limit: "256kb" }),
  async (req, res, next) => {
    try {
      const name = identifier(req.params.name);
      const entries = Object.entries(req.body ?? {});
      const args = entries
        .map(([k], i) => `${identifier(k)} => $${i + 1}`)
        .join(",");
      const result = await scoped((tx) =>
        tx.query(
          `select public.${name}(${args}) as result`,
          entries.map(([, v]) => v),
        ),
      );
      res.json((result as any).rows[0].result);
    } catch (e) {
      next(e);
    }
  },
);
function identifier(value: string) {
  if (!/^[a-z_]+$/.test(value)) throw new Error("Invalid identifier");
  return '"' + value + '"';
}
const tables = new Set([
  "app_users",
  "profiles",
  "health_events",
  "providers",
  "attachments",
  "categories",
  "tags",
  "health_episodes",
  "health_episode_events",
]);
local.all(
  "/rest/v1/:table",
  express.json({ limit: "256kb" }),
  async (req, res, next) => {
    try {
      if (!tables.has(req.params.table)) throw new Error("Unknown table");
      const params: any[] = [];
      const bind = (v: any) => {
        params.push(v);
        return "$" + params.length;
      };
      const filters: string[] = [];
      for (const [k, v] of Object.entries(req.query)) {
        if (["select", "order", "offset", "limit"].includes(k)) continue;
        if (typeof v !== "string" || !v.startsWith("eq."))
          throw new Error("Unsupported filter");
        filters.push(`${identifier(k)}=${bind(v.slice(3))}`);
      }
      const where = filters.length ? " where " + filters.join(" and ") : "";
      const select = String(req.query.select ?? "*")
        .split(",")
        .map((s) => (s === "*" ? "*" : identifier(s.trim())))
        .join(",");
      const table = "public." + identifier(req.params.table);
      let sql = "";
      if (req.method === "GET") {
        const order = req.query.order
          ? " order by " +
            String(req.query.order)
              .split(",")
              .map((v) => {
                const [key, dir] = v.split(".");
                return identifier(key) + (dir === "desc" ? " desc" : " asc");
              })
              .join(",")
          : "";
        const limit = Math.min(
            1000,
            Math.max(1, Number(req.query.limit) || 1000),
          ),
          offset = Math.max(0, Number(req.query.offset) || 0);
        sql = `select ${select} from ${table}${where}${order} limit ${bind(limit)} offset ${bind(offset)}`;
      } else if (req.method === "POST") {
        const entries = Object.entries(req.body);
        sql = `insert into ${table}(${entries.map(([k]) => identifier(k)).join(",")}) values(${entries.map(([, v]) => bind(v)).join(",")}) returning ${select}`;
      } else if (req.method === "PATCH") {
        sql = `update ${table} set ${Object.entries(req.body)
          .map(([k, v]) => identifier(k) + "=" + bind(v))
          .join(",")}${where} returning ${select}`;
      } else if (req.method === "DELETE")
        sql = `delete from ${table}${where} returning ${select}`;
      else {
        res.sendStatus(405);
        return;
      }
      const result: any = await scoped((tx) => tx.query(sql, params));
      if (req.headers.prefer?.includes("count=exact")) {
        const count: any = await scoped((tx) =>
          tx.query(
            `select count(*) as n from ${table}${where}`,
            params.slice(0, filters.length),
          ),
        );
        res.setHeader(
          "Content-Range",
          `0-${Math.max(0, result.rows.length - 1)}/${count.rows[0].n}`,
        );
      }
      const single = req.headers.accept?.includes(
        "application/vnd.pgrst.object+json",
      );
      res
        .status(req.method === "POST" ? 201 : 200)
        .json(single ? (result.rows[0] ?? null) : result.rows);
    } catch (e) {
      next(e);
    }
  },
);
local.get(
  "/storage/v1/object/authenticated/:bucket/*path",
  async (req, res, next) => {
    try {
      const path = (req.params.path as unknown as string[]).join("/");
      const row: any = await scoped((tx) =>
        tx.query(
          "select id from storage.objects where bucket_id=$1 and name=$2",
          [req.params.bucket, path],
        ),
      );
      const file = files.get(req.params.bucket + "/" + path);
      if (!row.rows.length || !file) {
        res.sendStatus(404);
        return;
      }
      res.type(file.mime).send(file.bytes);
    } catch (e) {
      next(e);
    }
  },
);
local.delete(
  "/storage/v1/object/:bucket",
  express.json(),
  async (req, res, next) => {
    try {
      for (const path of req.body.prefixes ?? []) {
        await scoped((tx) =>
          tx.query(
            "delete from storage.objects where bucket_id=$1 and name=$2",
            [req.params.bucket, path],
          ),
        );
        files.delete(req.params.bucket + "/" + path);
      }
      res.json([]);
    } catch (e) {
      next(e);
    }
  },
);
local.post(
  "/storage/v1/object/:bucket/*path",
  express.raw({ type: () => true, limit: "11mb" }),
  async (req, res, next) => {
    try {
      // Supabase uploads FormData for browser File inputs. Parse it using the native Request implementation.
      const request = new Request(base, {
        method: "POST",
        headers: { "content-type": req.headers["content-type"] ?? "" },
        body: req.body,
      });
      let body: Buffer, mime: string;
      if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
        const form = await request.formData();
        const file = [...form.values()].find(
          (v) => typeof v !== "string",
        ) as File;
        if (!file) throw new Error("Missing file");
        body = Buffer.from(await file.arrayBuffer());
        mime = file.type;
      } else {
        body = req.body;
        mime = req.headers["content-type"] ?? "application/octet-stream";
      }
      const path = (req.params.path as unknown as string[]).join("/");
      await scoped(async (tx) => {
        const bucket = await tx.query(
          "select * from storage.buckets where id=$1",
          [req.params.bucket],
        );
        const b = bucket.rows[0];
        if (
          !b ||
          body.length > b.file_size_limit ||
          !b.allowed_mime_types.includes(mime)
        )
          throw new Error("Unsupported file");
        await tx.query(
          "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)",
          [req.params.bucket, path, { size: body.length, mimetype: mime }],
        );
      });
      files.set(req.params.bucket + "/" + path, { bytes: body, mime });
      res.json({ Key: req.params.bucket + "/" + path });
    } catch (e) {
      next(e);
    }
  },
);
local.use((err: any, _req: any, res: any, _next: any) =>
  res
    .status(400)
    .json({ code: err.code ?? "DEMO_ERROR", message: err.message }),
);
const api = createApp({
  frontendOrigin: "http://localhost:3001",
  verifyToken: async (token) => (valid(token) ? { id: owner } : null),
  dataForToken: (token) => createUserDataAccess(base, key, token),
});
const listen = (app: any, port: number) =>
  new Promise<any>((resolve, reject) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
if (process.argv.includes("--check")) {
  const dashboard: any = await scoped((tx) =>
    tx.query("select public.health_dashboard('{}') as data"),
  );
  const overview = dashboard.rows[0].data;
  if (
    overview.profiles.length !== 2 ||
    !overview.profiles.every((p: any) => p.recent.length && p.upcoming.length)
  )
    throw new Error("Demo overview is missing sample records.");
  const timeline: any = await scoped((tx) =>
    tx.query("select public.health_timeline('{}') as data"),
  );
  if (!timeline.rows[0].data.items.some((i: any) => i.entry_type === "episode"))
    throw new Error("Demo episodes missing.");
  const docs: any = await scoped((tx) =>
    tx.query("select public.search_health_documents('{}') as data"),
  );
  if (docs.rows[0].data.total !== 1) throw new Error("Demo document missing.");
  console.log(
    "Demo data verified: 2 profiles, 9 events, 2 episodes, 1 document.",
  );
  await db.close();
  process.exit(0);
}
const authServer = await listen(local, 54321),
  apiServer = await listen(api, 4000);
const web = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "apps/web",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3001",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: base,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      NEXT_PUBLIC_API_URL: "http://localhost:4000",
    },
  },
);
console.log(
  `Local demo: http://localhost:3001\nEmail: ${email}\nPassword: ${password}\nSynthetic data only. All demo changes disappear when stopped.`,
);
const stop = () => {
  web.kill("SIGTERM");
  authServer.close();
  apiServer.close();
  void db.close().finally(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", stop);
