import { Router } from "express";
import { z } from "zod";
import type { UserDataAccess } from "./data.js";
import { EventDataError } from "./events.js";

export const reminderStatuses = ["scheduled", "completed", "dismissed"] as const;
export const reminderRecurrences = ["none", "monthly", "yearly"] as const;
export const reminderKinds = ["custom", "next_dose", "renewal"] as const;

export type ReminderStatus = (typeof reminderStatuses)[number];
export type ReminderRecurrence = (typeof reminderRecurrences)[number];
export type ReminderKind = (typeof reminderKinds)[number];

export type Reminder = {
  id: string;
  profile_id: string;
  source_event_id: string | null;
  reminder_kind: ReminderKind;
  title: string;
  due_date: string;
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  source_event: { id: string; title: string; event_type: string; disease: string | null } | null;
};

const optionalUuid = z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null);
export const reminderSchema = z.object({
  profile_id: z.uuid(),
  source_event_id: optionalUuid,
  title: z.string().trim().max(300).optional().transform((v) => v || "Reminder"),
  due_date: z.iso.date(),
  recurrence: z.enum(reminderRecurrences).default("none"),
}).strict();
export type ReminderInput = z.output<typeof reminderSchema>;

const eventReminderSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().max(300).optional().transform((v) => v || "Follow up"),
  due_date: z.iso.date(),
  recurrence: z.enum(reminderRecurrences).default("none"),
}).strict();
export type EventReminderInput = z.output<typeof eventReminderSchema>;

export type ReminderQuery = {
  profile_id?: string;
  source_event_id?: string;
  reminder_kind?: ReminderKind;
  status?: ReminderStatus;
  recurrence?: ReminderRecurrence;
  q?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
};

export type ReminderDataAccess = {
  listReminders: (query: ReminderQuery) => Promise<{ reminders: Reminder[]; total: number }>;
  saveReminder: (id: string | null, input: ReminderInput) => Promise<Reminder | null>;
  setReminderStatus: (id: string, status: ReminderStatus) => Promise<Reminder | null>;
  deleteReminder: (id: string) => Promise<boolean>;
  syncEventReminders: (eventId: string, reminders: EventReminderInput[]) => Promise<Reminder[] | null>;
};

export function reminderRouter() {
  const router = Router();
  router.param("id", (_req, _res, next, id) => {
    if (!z.uuid().safeParse(id).success) throw new EventDataError(400, "Invalid reminder ID.");
    next();
  });
  router.param("eventId", (_req, _res, next, id) => {
    if (!z.uuid().safeParse(id).success) throw new EventDataError(400, "Invalid event ID.");
    next();
  });
  router.get("/", async (req, res) => {
    const parsed = z.object({
      profile_id: z.uuid().optional(),
      source_event_id: z.uuid().optional(),
      reminder_kind: z.enum(reminderKinds).optional(),
      status: z.enum(reminderStatuses).optional(),
      recurrence: z.enum(reminderRecurrences).optional(),
      q: z.string().trim().max(200).optional(),
      date_from: z.iso.date().optional(),
      date_to: z.iso.date().optional(),
      page: z.coerce.number().int().min(1).max(100000).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(30),
    }).strict().safeParse(req.query);
    if (!parsed.success) throw new EventDataError(400, "Invalid reminder filters.");
    res.json({
      ...(await (res.locals.data as UserDataAccess).listReminders(parsed.data)),
      page: parsed.data.page,
      page_size: parsed.data.page_size,
    });
  });
  for (const method of ["post", "put"] as const)
    router[method](method === "post" ? "/" : "/:id", async (req, res) => {
      const parsed = reminderSchema.safeParse(req.body);
      if (!parsed.success)
        throw new EventDataError(400, "Check the reminder details.", parsed.error.flatten().fieldErrors);
      const reminder = await (res.locals.data as UserDataAccess).saveReminder(
        method === "post" ? null : String((req.params as Record<string, string>).id),
        parsed.data,
      );
      if (!reminder) throw new EventDataError(404, "Reminder not found.");
      res.status(method === "post" ? 201 : 200).json({ reminder });
    });
  router.put("/:id/status", async (req, res) => {
    const parsed = z.object({ status: z.enum(reminderStatuses) }).strict().safeParse(req.body);
    if (!parsed.success) throw new EventDataError(400, "Choose a valid reminder status.");
    const reminder = await (res.locals.data as UserDataAccess).setReminderStatus(String(req.params.id), parsed.data.status);
    if (!reminder) throw new EventDataError(404, "Reminder not found.");
    res.json({ reminder });
  });
  router.put("/event/:eventId", async (req, res) => {
    const parsed = z.object({ reminders: z.array(eventReminderSchema).max(20) }).strict().safeParse(req.body);
    if (!parsed.success)
      throw new EventDataError(400, "Check the event reminders.", parsed.error.flatten().fieldErrors);
    const reminders = await (res.locals.data as UserDataAccess).syncEventReminders(String(req.params.eventId), parsed.data.reminders);
    if (!reminders) throw new EventDataError(404, "Event not found.");
    res.json({ reminders });
  });
  router.delete("/:id", async (req, res) => {
    if (!(await (res.locals.data as UserDataAccess).deleteReminder(String(req.params.id))))
      throw new EventDataError(404, "Reminder not found.");
    res.status(204).end();
  });
  return router;
}
