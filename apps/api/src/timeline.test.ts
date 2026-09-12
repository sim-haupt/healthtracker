import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import { emptyEventData } from "./test-data.js";
import {
  groupTimeline,
  timelineYearQuery,
  type TimelineItem,
} from "../../web/src/lib/timeline.js";
test("timeline route validates filters and requires authentication", async () => {
  let calls = 0;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) => (token === "valid" ? { id: "owner" } : null),
    dataForToken: () => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      timeline: async (query, kind) => {
        calls++;
        assert.equal(kind, "document");
        assert.equal(query.page_size, 30);
        return { items: [], total: 0 };
      },
    }),
  });
  const path = "/api/v1/events/timeline";
  await request(app).post(path).send({ filters: {} }).expect(401);
  for (const body of [
    { filters: { owner_id: "other" } },
    { filters: { page_size: 101 } },
    {
      filters: {
        date_from: "2026-01-02T00:00:00Z",
        date_to: "2026-01-01T00:00:00Z",
      },
    },
    { filters: {}, entry_type: "invalid" },
  ])
    await request(app)
      .post(path)
      .set("Authorization", "Bearer valid")
      .send(body)
      .expect(400);
  assert.equal(calls, 0);
  await request(app)
    .post(path)
    .set("Authorization", "Bearer valid")
    .send({ filters: { page_size: 30 }, entry_type: "document" })
    .expect(200)
    .expect("Cache-Control", "no-store");
  assert.equal(calls, 1);
});
test("timeline groups mixed records by local year month and day and intersects year ranges", () => {
  const item = (id: string, date: string) =>
    ({ id, occurred_at: new Date(date).toISOString() }) as TimelineItem;
  const grouped = groupTimeline([
    item("doc", "2026-02-02T10:00:00"),
    item("event", "2026-02-02T09:00:00"),
    item("older", "2026-01-01T10:00:00"),
    item("oldest", "2025-12-31T10:00:00"),
  ]);
  assert.deepEqual(
    grouped.map((g) => g.year),
    [2026, 2025],
  );
  assert.equal(grouped[0].months.length, 2);
  assert.equal(grouped[0].months[0].days[0].items.length, 2);
  const year = timelineYearQuery({}, "2026");
  assert.equal(year.error, "");
  assert.equal(new Date(String(year.query.date_from)).getFullYear(), 2026);
  assert.equal(new Date(String(year.query.date_to)).getFullYear(), 2027);
  assert.ok(timelineYearQuery({}, "abc").error);
  assert.ok(
    timelineYearQuery({ date_from: "2028-01-01T00:00:00Z" }, "2026").error,
  );
  assert.deepEqual(timelineYearQuery({}, "").query, {});
});
