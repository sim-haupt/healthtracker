import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import { emptyEventData } from "./test-data.js";
import { reminderSchema, type Reminder } from "./reminders.js";

const id = "00000000-0000-4000-8000-000000000001";
const profileId = "00000000-0000-4000-8000-000000000002";
const eventId = "00000000-0000-4000-8000-000000000003";

test("reminders validate dates, recurrence and server defaults", () => {
  const parsed = reminderSchema.parse({ profile_id: profileId, due_date: "2027-09-14" });
  assert.equal(parsed.title, "Reminder");
  assert.equal(parsed.recurrence, "none");
  assert.equal(reminderSchema.safeParse({ profile_id: profileId, due_date: "bad" }).success, false);
  assert.equal(reminderSchema.safeParse({ profile_id: profileId, due_date: "2027-09-14", recurrence: "weekly" }).success, false);
  assert.equal(reminderSchema.safeParse({ profile_id: profileId, due_date: "2027-09-14", owner_id: id }).success, false);
});

test("reminder routes list, save, synchronize and update status", async () => {
  let row: Reminder | null = null;
  let synchronized = false;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) => token === "own" ? { id } : null,
    dataForToken: () => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      listReminders: async () => ({ reminders: row ? [row] : [], total: row ? 1 : 0 }),
      saveReminder: async (_reminderId, input) => {
        row = {
          id,
          ...input,
          reminder_kind: "custom",
          status: "scheduled",
          completed_at: null,
          created_at: "2026-09-14T00:00:00Z",
          updated_at: "2026-09-14T00:00:00Z",
          source_event: null,
        };
        return row;
      },
      setReminderStatus: async (_reminderId, status) => row ? (row = { ...row, status, completed_at: status === "completed" ? "now" : null }) : null,
      deleteReminder: async () => { if (!row) return false; row = null; return true; },
      syncEventReminders: async (_eventId, reminders) => {
        synchronized = reminders.length === 1 && reminders[0].recurrence === "yearly";
        return [];
      },
    }),
  });
  await request(app).get("/api/v1/reminders").expect(401);
  await request(app).post("/api/v1/reminders").set("Authorization", "Bearer own")
    .send({ profile_id: profileId, due_date: "2027-09-14", recurrence: "yearly" }).expect(201);
  await request(app).get("/api/v1/reminders?status=scheduled&page_size=10").set("Authorization", "Bearer own").expect(200);
  await request(app).put(`/api/v1/reminders/${id}/status`).set("Authorization", "Bearer own")
    .send({ status: "completed" }).expect(200);
  await request(app).put(`/api/v1/reminders/event/${eventId}`).set("Authorization", "Bearer own")
    .send({ reminders: [{ title: "Annual check", due_date: "2027-09-14", recurrence: "yearly" }] }).expect(200);
  assert.equal(synchronized, true);
  await request(app).delete(`/api/v1/reminders/${id}`).set("Authorization", "Bearer own").expect(204);
});
