import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import { emptyEventData } from "./test-data.js";
import { episodeSchema } from "./episodes.js";
const id = "00000000-0000-4000-8000-000000000001";
const input = {
  title: "Flu — January 2026",
  profile_id: id,
  start_date: "2026-01-02",
  end_date: null,
  status: "active",
  description: "",
  event_ids: [],
};
test("episodes validate dates, status, ownership fields and event IDs", () => {
  assert.ok(episodeSchema.safeParse(input).success);
  for (const change of [
    { end_date: "2025-01-01" },
    { status: "unknown" },
    { owner_id: id },
    { start_date: "2026-02-30" },
    { event_ids: ["invalid"] },
    { title: " " },
  ])
    assert.equal(
      episodeSchema.safeParse({ ...input, ...change }).success,
      false,
    );
});
test("episode CRUD and event linking require approved authentication", async () => {
  let saved = false,
    linked: string[] = [];
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) => (token === "good" ? { id } : null),
    dataForToken: () => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      saveEpisode: async (_id, value) => {
        saved = true;
        return { ...value, id, created_at: "now", events: [] };
      },
      getEpisode: async () => null,
      deleteEpisode: async () => true,
      linkEventToEpisode: async (episodeId, eventId) => {
        linked = [episodeId, eventId];
        return true;
      },
    }),
  });
  for (const method of ["get", "post", "put", "delete"] as const)
    await request(app)
      [method](
        method === "post" ? "/api/v1/episodes" : `/api/v1/episodes/${id}`,
      )
      .send(input)
      .expect(401);
  await request(app)
    .post("/api/v1/episodes")
    .set("Authorization", "Bearer good")
    .send(input)
    .expect(201);
  assert.equal(saved, true);
  await request(app)
    .get(`/api/v1/episodes/${id}`)
    .set("Authorization", "Bearer good")
    .expect(404);
  await request(app)
    .put(`/api/v1/episodes/${id}`)
    .set("Authorization", "Bearer good")
    .send({ ...input, status: "resolved", end_date: "2026-01-10" })
    .expect(200);
  await request(app)
    .delete(`/api/v1/episodes/${id}`)
    .set("Authorization", "Bearer good")
    .expect(204);
  await request(app).post(`/api/v1/episodes/${id}/events/${id}`).expect(401);
  await request(app)
    .post(`/api/v1/episodes/${id}/events/${id}`)
    .set("Authorization", "Bearer good")
    .expect(204);
  assert.deepEqual(linked, [id, id]);
});
