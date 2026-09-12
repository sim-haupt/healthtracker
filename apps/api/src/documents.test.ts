import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import { emptyEventData } from "./test-data.js";

const profileId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const tagId = "00000000-0000-4000-8000-000000000003";

test("document search is authenticated and passes validated private filters", async () => {
  let received: unknown;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) => (token === "good" ? { id: "owner" } : null),
    dataForToken: () => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      listDocuments: async (query) => {
        received = query;
        return { documents: [], total: 0 };
      },
    }),
  });

  await request(app).post("/api/v1/documents/search").send({}).expect(401);
  const response = await request(app)
    .post("/api/v1/documents/search")
    .set("Authorization", "Bearer good")
    .send({
      profile_id: profileId,
      event_id: eventId,
      file_type: "pdf",
      document_category: "lab result",
      tag_ids: [tagId],
      q: "blood work",
      date_from: "2026-01-01T00:00:00.000Z",
      date_to: "2027-01-01T00:00:00.000Z",
      page: 2,
      page_size: 12,
    });
  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    profile_id: profileId,
    event_id: eventId,
    file_type: "pdf",
    document_category: "lab result",
    tag_ids: [tagId],
    q: "blood work",
    date_from: "2026-01-01T00:00:00.000Z",
    date_to: "2027-01-01T00:00:00.000Z",
    page: 2,
    page_size: 12,
  });
});

test("document search rejects malformed and unsupported filters", async () => {
  let reads = 0;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async () => ({ id: "owner" }),
    dataForToken: () => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      listDocuments: async () => {
        reads++;
        return { documents: [], total: 0 };
      },
    }),
  });
  for (const body of [
    { owner_id: profileId },
    { file_type: "executable" },
    { document_category: "secret" },
    { tag_ids: Array(21).fill(tagId) },
    {
      date_from: "2027-01-01T00:00:00.000Z",
      date_to: "2026-01-01T00:00:00.000Z",
    },
  ])
    await request(app)
      .post("/api/v1/documents/search")
      .set("Authorization", "Bearer good")
      .send(body)
      .expect(400);
  assert.equal(reads, 0);
});
