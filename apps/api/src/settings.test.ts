import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import { emptyEventData } from "./test-data.js";
const id = "00000000-0000-4000-8000-000000000001",
  owner = "00000000-0000-4000-8000-000000000002";
test("settings writes require authentication and reject foreign avatar paths and invalid names", async () => {
  let writes = 0;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) => (token === "valid" ? { id: owner } : null),
    dataForToken: () => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      updateProfile: async (profile, input) => {
        writes++;
        return profile === id ? { id, ...input, created_at: "now" } : null;
      },
      updateLabel: async (_kind, label, name) => {
        writes++;
        return { id: label, name };
      },
      deleteLabel: async () => true,
    }),
  });
  await request(app)
    .put(`/api/v1/profiles/${id}`)
    .send({ name: "Alex", avatar: null })
    .expect(401);
  for (const body of [
    { name: "", avatar: null },
    { name: "Alex", avatar: `${id}/${id}/${id}` },
    { name: "Alex", avatar: "https://example.test/photo.jpg" },
    { name: "Alex", avatar: null, owner_id: owner },
  ])
    await request(app)
      .put(`/api/v1/profiles/${id}`)
      .set("Authorization", "Bearer valid")
      .send(body)
      .expect(400);
  assert.equal(writes, 0);
  const result = await request(app)
    .put(`/api/v1/profiles/${id}`)
    .set("Authorization", "Bearer valid")
    .send({ name: " Alex ", avatar: null })
    .expect(200);
  assert.equal(result.body.profile.name, "Alex");
  for (const kind of ["categories", "tags"]) {
    await request(app)
      .put(`/api/v1/${kind}/${id}`)
      .set("Authorization", "Bearer valid")
      .send({ name: "Renamed" })
      .expect(200);
    await request(app).delete(`/api/v1/${kind}/${id}`).expect(401);
    await request(app)
      .delete(`/api/v1/${kind}/${id}`)
      .set("Authorization", "Bearer valid")
      .expect(204);
  }
});
