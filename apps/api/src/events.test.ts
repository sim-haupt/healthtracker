import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import {
  EventDataError,
  eventInputSchema,
  eventTypes,
  type HealthEvent,
} from "./events.js";
import { emptyEventData } from "./test-data.js";
import {
  fieldsForType,
  fieldLabel,
  eventDraft,
  draftInput,
  validateDraft,
  eventTypes as formTypes,
} from "../../web/src/lib/events.js";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = uuid(1),
  outsider = uuid(2),
  profile1 = uuid(3),
  profile2 = uuid(4),
  foreignProfile = uuid(5);
const valid = {
  profile_id: profile1,
  event_type: "Doctor Visit",
  title: "Check-up",
  event_date: "2026-09-11T10:00:00+02:00",
  doctor: "Dr Example",
  description: "Check symptoms",
  treatment: "Examination",
  notes: "Follow up",
};
function fixture() {
  const rows = new Map<string, HealthEvent & { owner_id: string }>();
  let nextId = 10;
  let writes = 0;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) =>
      token === "owner"
        ? { id: owner }
        : token === "other"
          ? { id: outsider }
          : null,
    dataForToken: (token) => {
      const userId = token === "owner" ? owner : outsider;
      const visible = () =>
        [...rows.values()].filter((row) => row.owner_id === userId);
      const checkProfile = (id: string) => {
        if (![profile1, profile2].includes(id) || userId !== owner)
          throw new EventDataError(400, "Choose an available health profile.", {
            profile_id: ["This profile is not available in your workspace."],
          });
      };
      return {
        ...emptyEventData,
        isApproved: async () => true,
        listProfiles: async () => [],
        listEvents: async (query) => {
          const all = visible().filter(
            (row) =>
              (!query.profile_id || row.profile_id === query.profile_id) &&
              (!query.event_type || row.event_type === query.event_type),
          );
          return {
            events: all.slice(
              (query.page - 1) * query.page_size,
              query.page * query.page_size,
            ),
            total: all.length,
          };
        },
        getEvent: async (id) => visible().find((row) => row.id === id) ?? null,
        createEvent: async (input, verifiedOwner) => {
          checkProfile(input.profile_id);
          writes++;
          const event = {
            ...input,
            owner_id: verifiedOwner,
            id: uuid(nextId++),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          rows.set(event.id, event);
          return event;
        },
        updateEvent: async (id, input) => {
          const existing = visible().find((row) => row.id === id);
          if (!existing) return null;
          checkProfile(input.profile_id);
          writes++;
          const event = {
            ...existing,
            ...input,
            updated_at: new Date().toISOString(),
          };
          rows.set(id, event);
          return event;
        },
        deleteEvent: async (id) => {
          if (!visible().some((row) => row.id === id)) return false;
          writes++;
          return rows.delete(id);
        },
      };
    },
  });
  return { app, rows, writes: () => writes };
}
test("create, read, list, edit across own profiles, and delete an event", async () => {
  const { app, rows } = fixture();
  const created = await request(app)
    .post("/api/v1/events")
    .set("Authorization", "Bearer owner")
    .send(valid);
  assert.equal(created.status, 201);
  const id = created.body.event.id;
  assert.equal(created.headers.location, `/api/v1/events/${id}`);
  assert.equal(rows.get(id)?.owner_id, owner);
  assert.equal(created.body.event.end_date, null);
  assert.equal(
    (
      await request(app)
        .get(`/api/v1/events/${id}`)
        .set("Authorization", "Bearer owner")
    ).body.event.doctor,
    "Dr Example",
  );
  const list = await request(app)
    .get(
      `/api/v1/events?profile_id=${profile1}&event_type=Doctor%20Visit&page_size=1`,
    )
    .set("Authorization", "Bearer owner");
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.events.length, 1);
  const updated = await request(app)
    .put(`/api/v1/events/${id}`)
    .set("Authorization", "Bearer owner")
    .send({
      ...valid,
      profile_id: profile2,
      event_type: "Illness",
      title: "Cold",
      symptoms: "Cough",
      notes: "",
      doctor: null,
      end_date: "2026-09-12T10:00:00+02:00",
    });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.event.profile_id, profile2);
  assert.equal(updated.body.event.notes, null);
  assert.equal(updated.body.event.doctor, null);
  assert.equal(
    (
      await request(app)
        .get(`/api/v1/events?profile_id=${profile1}`)
        .set("Authorization", "Bearer owner")
    ).body.total,
    0,
  );
  const deleted = await request(app)
    .delete(`/api/v1/events/${id}`)
    .set("Authorization", "Bearer owner");
  assert.equal(deleted.status, 204);
  assert.equal(deleted.text, "");
  assert.equal(rows.size, 0);
  assert.equal(
    (
      await request(app)
        .get(`/api/v1/events/${id}`)
        .set("Authorization", "Bearer owner")
    ).status,
    404,
  );
});
test("every CRUD operation requires authentication before accessing records", async () => {
  const { app, writes } = fixture();
  for (const method of ["get", "post", "put", "delete"] as const) {
    const response = await request(app)
      [method](
        method === "post" ? "/api/v1/events" : `/api/v1/events/${uuid(10)}`,
      )
      .send(valid);
    assert.equal(response.status, 401);
  }
  assert.equal(writes(), 0);
});
test("other-account and missing event IDs have identical 404 responses", async () => {
  const { app, writes } = fixture();
  const created = await request(app)
    .post("/api/v1/events")
    .set("Authorization", "Bearer owner")
    .send(valid);
  const id = created.body.event.id;
  for (const method of ["get", "put", "delete"] as const) {
    const other = await request(app)
      [method](`/api/v1/events/${id}`)
      .set("Authorization", "Bearer other")
      .send(method === "put" ? valid : undefined);
    const missing = await request(app)
      [method](`/api/v1/events/${uuid(99)}`)
      .set("Authorization", "Bearer owner")
      .send(method === "put" ? valid : undefined);
    assert.equal(other.status, 404);
    assert.deepEqual(other.body, missing.body);
  }
  assert.equal(writes(), 1);
});
test("validation rejects spoofed ownership, bad types, dates, lengths and unknown fields", async () => {
  const { app, writes } = fixture();
  for (const invalid of [
    { ...valid, owner_id: outsider },
    { ...valid, id: uuid(8) },
    { ...valid, title: "   " },
    { ...valid, event_type: "Unsupported" },
    { ...valid, event_date: "2026-02-30T10:00:00Z" },
    { ...valid, event_date: "2026-09-11T10:00" },
    { ...valid, end_date: "2026-01-01T00:00:00Z" },
    { ...valid, notes: "x".repeat(5001) },
    { ...valid, profile_id: "not-a-uuid" },
  ]) {
    assert.equal(
      (
        await request(app)
          .post("/api/v1/events")
          .set("Authorization", "Bearer owner")
          .send(invalid)
      ).status,
      400,
    );
  }
  const dates = await request(app)
    .post("/api/v1/events")
    .set("Authorization", "Bearer owner")
    .send({ ...valid, end_date: "2026-01-01T00:00:00Z" });
  assert.ok(dates.body.fields.end_date[0].includes("End date"));
  assert.equal(writes(), 0);
});
test("unavailable profile failures are actionable and do not reveal database details", async () => {
  const { app } = fixture();
  const res = await request(app)
    .post("/api/v1/events")
    .set("Authorization", "Bearer owner")
    .send({ ...valid, profile_id: foreignProfile });
  assert.equal(res.status, 400);
  assert.ok(res.body.fields.profile_id);
  assert.ok(!res.text.includes("foreign key"));
});
test("malformed JSON, large bodies, invalid IDs and unbounded queries are rejected", async () => {
  const { app } = fixture();
  assert.equal(
    (
      await request(app)
        .post("/api/v1/events")
        .set("Authorization", "Bearer owner")
        .set("Content-Type", "application/json")
        .send("{")
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/events")
        .set("Authorization", "Bearer owner")
        .send({ ...valid, notes: "x".repeat(270000) })
    ).status,
    413,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/events")
        .set("Authorization", "Bearer owner")
        .set("Content-Type", "text/plain")
        .send("hello")
    ).status,
    415,
  );
  assert.equal(
    (
      await request(app)
        .get("/api/v1/events/bad-id")
        .set("Authorization", "Bearer owner")
    ).status,
    400,
  );
  for (const query of [
    "page=0",
    "page_size=1000",
    "profile_id=bad",
    "event_type=unknown",
    "owner_id=someone",
    "page=1&page=2",
  ])
    assert.equal(
      (
        await request(app)
          .get(`/api/v1/events?${query}`)
          .set("Authorization", "Bearer owner")
      ).status,
      400,
    );
  const cors = await request(app)
    .options("/api/v1/events")
    .set("Origin", "http://localhost:3000")
    .set("Access-Control-Request-Method", "PUT");
  assert.ok(cors.headers["access-control-allow-methods"].includes("PUT"));
});
test("all supported types round-trip their simple form fields without losing hidden data", () => {
  assert.deepEqual(formTypes, eventTypes);
  for (const type of formTypes) {
    const input = eventInputSchema.parse({
      ...valid,
      event_type: type,
      symptoms: "Symptoms retained",
      prescription: "Prescription retained",
      notes: "Notes retained",
    });
    const event = {
      ...input,
      id: uuid(10),
      created_at: "2026-09-11T10:00:00Z",
      updated_at: "2026-09-11T10:00:00Z",
    };
    const draft = eventDraft(event, profile1);
    assert.deepEqual(validateDraft(draft, [profile1, profile2]), {});
    assert.deepEqual(draftInput(draft, event), input);
    assert.ok(fieldsForType(type).length > 0);
  }
  assert.equal(fieldLabel("Doctor Visit", "description"), "Reason for visit");
  assert.equal(fieldLabel("Doctor Visit", "treatment"), "What was done");
  assert.equal(fieldLabel("Illness", "description"), "How it felt");
  const draft = eventDraft(undefined, profile1);
  assert.equal(validateDraft(draft, [profile1]).title, "Enter a title.");
  draft.title = "Only required field";
  draft.event_date = "";
  assert.equal(validateDraft(draft, [profile1]).event_date, undefined);
  assert.ok(!Number.isNaN(Date.parse(draftInput(draft).event_date)));
  draft.event_date = eventDraft(undefined, profile1).event_date;
  draft.end_date = "2000-01-01T10:00:00";
  assert.ok(validateDraft(draft, [profile1]).end_date);
});

test("search accepts combined filters in a POST body and rejects malformed ranges and labels", async () => {
  let received: unknown;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async () => ({ id: owner }),
    dataForToken: () => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      listEvents: async (query) => {
        received = query;
        return { events: [], total: 0 };
      },
    }),
  });
  const filters = {
    profile_id: profile1,
    event_type: "Illness",
    category_id: uuid(30),
    tag_ids: [uuid(31), uuid(32)],
    q: "fever & notes",
    date_from: "2026-09-01T00:00:00Z",
    date_to: "2026-10-01T00:00:00Z",
  };
  const response = await request(app)
    .post("/api/v1/events/search")
    .set("Authorization", "Bearer owner")
    .send(filters);
  assert.equal(response.status, 200);
  assert.deepEqual(received, { ...filters, page: 1, page_size: 20 });
  for (const invalid of [
    { date_from: "2026-09-02T00:00:00Z", date_to: "2026-09-01T00:00:00Z" },
    { tag_ids: ["bad"] },
    { category_id: "bad" },
    { q: "x".repeat(201) },
    { tag_ids: Array(21).fill(uuid(31)) },
  ]) {
    assert.equal(
      (
        await request(app)
          .post("/api/v1/events/search")
          .set("Authorization", "Bearer owner")
          .send(invalid)
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await request(app)
        .post("/api/v1/events/dashboard")
        .set("Authorization", "Bearer owner")
        .send(filters)
    ).status,
    200,
  );
});
test("custom labels validate names, require auth and handle duplicate names", async () => {
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) => (token === "owner" ? { id: owner } : null),
    dataForToken: () => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      createLabel: async (_kind, name) => {
        if (name === "existing")
          throw new EventDataError(409, "That name already exists.");
        return { id: uuid(30), name };
      },
    }),
  });
  for (const kind of ["tags", "categories"]) {
    assert.equal(
      (await request(app).post(`/api/v1/${kind}`).send({ name: "fever" }))
        .status,
      401,
    );
    const created = await request(app)
      .post(`/api/v1/${kind}`)
      .set("Authorization", "Bearer owner")
      .send({ name: " custom label " });
    assert.equal(created.status, 201);
    assert.equal(created.body.label.name, "custom label");
    for (const name of ["   ", "x".repeat(101)])
      assert.equal(
        (
          await request(app)
            .post(`/api/v1/${kind}`)
            .set("Authorization", "Bearer owner")
            .send({ name })
        ).status,
        400,
      );
    assert.equal(
      (
        await request(app)
          .post(`/api/v1/${kind}`)
          .set("Authorization", "Bearer owner")
          .send({ name: "existing" })
      ).status,
      409,
    );
  }
});
