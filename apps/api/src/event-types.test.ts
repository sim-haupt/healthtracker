import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import { emptyEventData } from "./test-data.js";
import { typeSchema } from "./event-types.js";
const id = "00000000-0000-4000-8000-000000000001";
test("event types validate color, names and reject key reassignment", () => {
  assert.ok(typeSchema.safeParse({ name: "Check", color: "#249E94" }).success);
  for (const input of [
    { name: "", color: "#005461" },
    { name: "Check", color: "red" },
    { name: "Check", color: "#005461", key: "Vaccination" },
  ])
    assert.equal(typeSchema.safeParse(input).success, false);
});
test("event type management is authenticated and accepts custom types", async () => {
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) => (token === "good" ? { id } : null),
    dataForToken: () => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      saveEventType: async (_id, input) => ({
        id,
        key: id,
        archived: false,
        ...input,
      }),
      archiveEventType: async () => true,
    }),
  });
  for (const method of ["get", "post", "put", "delete"] as const)
    await request(app)
      [method](
        "/api/v1/event-types" +
          (["put", "delete"].includes(method) ? "/" + id : ""),
      )
      .expect(401);
  await request(app)
    .post("/api/v1/event-types")
    .set("Authorization", "Bearer good")
    .send({ name: "Check", color: "#249E94" })
    .expect(201);
  await request(app)
    .put("/api/v1/event-types/" + id)
    .set("Authorization", "Bearer good")
    .send({ name: "Renamed", color: "#005461" })
    .expect(200);
  await request(app)
    .delete("/api/v1/event-types/" + id)
    .set("Authorization", "Bearer good")
    .expect(204);
});
