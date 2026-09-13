import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import { emptyEventData } from "./test-data.js";
import { providerSchema, type Provider } from "./providers.js";
const id = "00000000-0000-4000-8000-000000000001";
test("providers validate contact fields and website schemes", () => {
  for (const website of [
    "javascript:alert(1)",
    "data:text/html,x",
    "ftp://example.test",
    "bad url",
  ])
    assert.equal(
      providerSchema.safeParse({ name: "Doctor", website }).success,
      false,
    );
  assert.equal(
    providerSchema.safeParse({ name: "Doctor", email: "bad" }).success,
    false,
  );
  assert.equal(providerSchema.safeParse({ name: "  " }).success, false);
  assert.equal(
    providerSchema.safeParse({ name: "Doctor", rating: 0 }).success,
    false,
  );
  assert.equal(
    providerSchema.safeParse({ name: "Doctor", rating: 6 }).success,
    false,
  );
  assert.equal(
    providerSchema.safeParse({ name: "Doctor", owner_id: id }).success,
    false,
  );
  const valid = providerSchema.parse({
    name: " Dr Test ",
    website: "https://example.test",
    email: "doctor@example.test",
  });
  assert.equal(valid.name, "Dr Test");
  assert.equal(valid.phone, null);
  assert.equal(valid.rating, null);
});
test("provider CRUD and related records use authenticated scope", async () => {
  let row: Provider | null = null;
  let receivedProfile: string | undefined;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) =>
      ["own", "other"].includes(token) ? { id: token } : null,
    dataForToken: (token) => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      listProviders: async () => (row && token === "own" ? [row] : []),
      getProvider: async (value) =>
        value === id && token === "own" ? row : null,
      saveProvider: async (value, input) => {
        if (value && (!row || token !== "own")) return null;
        row = { id, ...input, created_at: "now" };
        return row;
      },
      deleteProvider: async () => {
        if (!row || token !== "own") return false;
        row = null;
        return true;
      },
      providerEvents: async (_id, _page, profileId) => {
        receivedProfile = profileId;
        return { events: [], total: 0 };
      },
    }),
  });
  await request(app).get("/api/v1/providers").expect(401);
  await request(app)
    .post("/api/v1/providers")
    .set("Authorization", "Bearer own")
    .send({ name: "Dr Test" })
    .expect(201);
  await request(app)
    .get(`/api/v1/providers/${id}`)
    .set("Authorization", "Bearer other")
    .expect(404);
  await request(app)
    .get(`/api/v1/providers/${id}/events?profile_id=${id}`)
    .set("Authorization", "Bearer other")
    .expect(404);
  await request(app)
    .put(`/api/v1/providers/${id}`)
    .set("Authorization", "Bearer own")
    .send({ name: "Dr Updated", notes: "Contact notes", rating: 4 })
    .expect(200);
  assert.equal(row?.rating, 4);
  await request(app)
    .get(`/api/v1/providers/${id}/events?page=0`)
    .set("Authorization", "Bearer own")
    .expect(400);
  await request(app)
    .get(`/api/v1/providers/${id}/events?profile_id=${id}`)
    .set("Authorization", "Bearer own")
    .expect(200)
    .expect("Cache-Control", "no-store");
  assert.equal(receivedProfile, id);
  await request(app)
    .delete(`/api/v1/providers/${id}`)
    .set("Authorization", "Bearer own")
    .expect(204);
  await request(app)
    .get(`/api/v1/providers/${id}`)
    .set("Authorization", "Bearer own")
    .expect(404);
});
