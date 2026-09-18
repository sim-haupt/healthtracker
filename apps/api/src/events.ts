import { Router } from "express";
import { z } from "zod";
import type { UserDataAccess } from "./data.js";

export const eventTypes = [
  "Doctor Visit",
  "Illness",
  "Examination / Test",
  "Injury",
  "Symptom",
  "Other",
  "Migraine",
] as const;
const storedEventTypes = [...eventTypes, "Medication", "Vaccination"] as const;
const shortText = z
  .string()
  .trim()
  .max(300, "Use 300 characters or fewer.")
  .nullable()
  .optional()
  .transform((value) => value || null);
const longText = z
  .string()
  .trim()
  .max(5000, "Use 5,000 characters or fewer.")
  .nullable()
  .optional()
  .transform((value) => value || null);
export const eventInputSchema = z
  .object({
    profile_id: z.uuid("Choose a valid health profile."),
    related_symptom_id: z
      .uuid("Choose an available symptom event.")
      .nullable()
      .optional()
      .default(null),
    test_type: shortText,
    severity: z.string().trim().max(20).nullable().optional().default(null),
    trigger: longText,
    relief: longText,
    injury_type: shortText,
    body_area: shortText,
    frequency: z
      .enum(["Once", "Occasional", "Frequent", "Constant"])
      .nullable()
      .optional()
      .default(null),
    recovery: longText,
    action: longText,
    disease: shortText,
    dose_number: z
      .number()
      .int()
      .min(1)
      .max(3)
      .nullable()
      .optional()
      .default(null),
    dose_total: z
      .number()
      .int()
      .min(1)
      .max(3)
      .nullable()
      .optional()
      .default(null),
    next_dose_date: z.iso
      .date("Enter a valid next-dose date.")
      .nullable()
      .optional()
      .default(null),
    needs_renewal: z.boolean().optional().default(false),
    renewal_date: z.iso
      .date("Enter a valid renewal date.")
      .nullable()
      .optional()
      .default(null),
    provider_id: z
      .uuid("Choose an available doctor.")
      .nullable()
      .optional()
      .default(null),
    category_id: z
      .uuid("Choose an available category.")
      .nullable()
      .optional()
      .default(null),
    tag_ids: z
      .array(z.uuid("Choose valid tags."))
      .max(20, "Choose up to 20 tags.")
      .optional()
      .default([])
      .transform((ids) => [...new Set(ids)]),
    event_type: z.union([z.enum(storedEventTypes), z.uuid()]),
    title: z
      .string()
      .trim()
      .min(1, "Enter a title.")
      .max(300, "Use 300 characters or fewer."),
    event_date: z.iso.datetime({
      offset: true,
      error: "Enter a valid start date and time with a timezone.",
    }),
    end_date: z.iso
      .datetime({
        offset: true,
        error: "Enter a valid end date and time with a timezone.",
      })
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    description: z
      .string()
      .trim()
      .max(5000, "Use 5,000 characters or fewer.")
      .optional()
      .default(""),
    symptoms: longText,
    diagnosis: longText,
    treatment: longText,
    prescription: longText,
    doctor: shortText,
    location: shortText,
    notes: longText,
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed =
      value.event_type === "Migraine"
        ? ["1", "2", "3", "4", "5"]
        : ["Mild", "Moderate", "Severe"];
    if (value.severity && !allowed.includes(value.severity))
      ctx.addIssue({
        code: "custom",
        path: ["severity"],
        message:
          value.event_type === "Migraine"
            ? "Choose a severity from 1 to 5."
            : "Choose a severity.",
      });
  })
  .refine(
    (value) =>
      !value.end_date ||
      Date.parse(value.end_date) >= Date.parse(value.event_date),
    {
      path: ["end_date"],
      message: "End date must be on or after the start date.",
    },
  )
  .refine(
    (value) =>
      !value.dose_number ||
      !value.dose_total ||
      value.dose_number <= value.dose_total,
    {
      path: ["dose_number"],
      message: "Dose number cannot exceed the total doses.",
    },
  );
export type EventInput = z.output<typeof eventInputSchema>;
export type Label = { id: string; name: string };
export type HealthEvent = EventInput & {
  related_symptom?: EventRelationSummary | null;
  related_visits?: EventRelationSummary[];
  category?: Label | null;
  tags?: Label[];
  id: string;
  created_at: string;
  updated_at: string;
};
export type EventRelationSummary = {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
};
export type EventSummary = Pick<
  HealthEvent,
  | "id"
  | "profile_id"
  | "event_type"
  | "title"
  | "event_date"
  | "end_date"
  | "disease"
  | "dose_number"
  | "dose_total"
  | "next_dose_date"
  | "needs_renewal"
  | "renewal_date"
  | "category_id"
  | "category"
  | "tags"
>;
export const listSchema = z
  .object({
    profile_id: z.uuid().optional(),
    event_type: z.union([z.enum(storedEventTypes), z.uuid()]).optional(),
    category_id: z.uuid().optional(),
    provider_id: z.uuid().optional(),
    tag_ids: z
      .preprocess(
        (value) => (typeof value === "string" ? value.split(",") : value),
        z.array(z.uuid()).max(20),
      )
      .optional(),
    q: z.string().trim().max(200).optional(),
    date_from: z.iso.datetime({ offset: true }).optional(),
    date_to: z.iso.datetime({ offset: true }).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    (value) =>
      !value.date_from ||
      !value.date_to ||
      Date.parse(value.date_to) > Date.parse(value.date_from),
    {
      path: ["date_to"],
      message: "The end of the range must follow its start.",
    },
  );
export type EventQuery = z.output<typeof listSchema>;
export type DashboardResult = {
  profiles: {
    profile_id: string;
    total: number;
    upcoming: EventSummary[];
    recent: EventSummary[];
    illnesses: EventSummary[];
    visits: EventSummary[];
  }[];
};
export type TimelineItem = {
  id: string;
  entry_type: "event" | "episode";
  event_id: string;
  profile_id: string;
  event_type: string;
  title: string;
  event_title: string;
  occurred_at: string;
  summary: string;
  related_event_id?: string | null;
  tags: Label[];
  category: Label | null;
};
export type EventDataAccess = {
  timeline: (
    query: EventQuery,
    entryType: "all" | "event" | "episode",
  ) => Promise<{ items: TimelineItem[]; total: number }>;
  dashboard: (query: EventQuery) => Promise<DashboardResult>;
  listLabels: (kind: "categories" | "tags") => Promise<Label[]>;
  createLabel: (kind: "categories" | "tags", name: string) => Promise<Label>;
  listEvents: (
    query: EventQuery,
  ) => Promise<{ events: EventSummary[]; total: number }>;
  getEvent: (id: string) => Promise<HealthEvent | null>;
  createEvent: (input: EventInput, ownerId: string) => Promise<HealthEvent>;
  updateEvent: (id: string, input: EventInput) => Promise<HealthEvent | null>;
  deleteEvent: (id: string) => Promise<boolean>;
};
export class EventDataError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export function eventRouter() {
  const router = Router();
  router.get("/", async (req, res) => {
    const query = listSchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        error: "Check the event filters and pagination.",
        fields: query.error.flatten().fieldErrors,
      });
      return;
    }
    const result = await (res.locals.data as UserDataAccess).listEvents(
      query.data,
    );
    res.json({
      ...result,
      page: query.data.page,
      page_size: query.data.page_size,
    });
  });
  router.post("/search", async (req, res) => {
    const query = listSchema.safeParse(req.body);
    if (!query.success) {
      res.status(400).json({
        error: "Check the search filters and date range.",
        fields: query.error.flatten().fieldErrors,
      });
      return;
    }
    const result = await (res.locals.data as UserDataAccess).listEvents(
      query.data,
    );
    res.json({
      ...result,
      page: query.data.page,
      page_size: query.data.page_size,
    });
  });
  router.post("/timeline", async (req, res) => {
    const parsed = z
      .object({
        filters: listSchema,
        entry_type: z.enum(["all", "event", "episode"]).default("all"),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      throw new EventDataError(
        400,
        "Check the timeline filters and date range.",
      );
    const { filters, entry_type } = parsed.data;
    res.json({
      ...(await (res.locals.data as UserDataAccess).timeline(
        filters,
        entry_type,
      )),
      page: filters.page,
      page_size: filters.page_size,
    });
  });
  router.post("/dashboard", async (req, res) => {
    const query = listSchema.safeParse(req.body);
    if (!query.success) {
      res
        .status(400)
        .json({ error: "Check the dashboard filters and date range." });
      return;
    }
    res.json(await (res.locals.data as UserDataAccess).dashboard(query.data));
  });
  router.param("id", (_req, res, next, id) => {
    if (!z.uuid().safeParse(id).success) {
      res.status(400).json({ error: "Invalid event ID." });
      return;
    }
    next();
  });
  router.get("/:id", async (req, res) => {
    const event = await (res.locals.data as UserDataAccess).getEvent(
      String(req.params.id),
    );
    if (!event) {
      res
        .status(404)
        .json({ error: "Event not found or no longer available." });
      return;
    }
    res.json({ event });
  });
  router.post("/", async (req, res) => {
    if (!req.is("application/json")) {
      res.status(415).json({ error: "Send the event as application/json." });
      return;
    }
    const parsed = eventInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Please check the highlighted fields.",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const event = await (res.locals.data as UserDataAccess).createEvent(
      parsed.data,
      res.locals.user.id,
    );
    res.status(201).location(`/api/v1/events/${event.id}`).json({ event });
  });
  router.put("/:id", async (req, res) => {
    if (!req.is("application/json")) {
      res.status(415).json({ error: "Send the event as application/json." });
      return;
    }
    const parsed = eventInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Please check the highlighted fields.",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const event = await (res.locals.data as UserDataAccess).updateEvent(
      String(req.params.id),
      parsed.data,
    );
    if (!event) {
      res
        .status(404)
        .json({ error: "Event not found or no longer available." });
      return;
    }
    res.json({ event });
  });
  router.delete("/:id", async (req, res) => {
    const deleted = await (res.locals.data as UserDataAccess).deleteEvent(
      String(req.params.id),
    );
    if (!deleted) {
      res
        .status(404)
        .json({ error: "Event not found or no longer available." });
      return;
    }
    res.status(204).end();
  });
  return router;
}

export function labelRouter(kind: "categories" | "tags") {
  const router = Router();
  router.get("/", async (_req, res) => {
    res.json({
      labels: await (res.locals.data as UserDataAccess).listLabels(kind),
    });
  });
  router.put("/:id", async (req, res) => {
    const parsed = z
      .object({ name: z.string().trim().min(1).max(100) })
      .strict()
      .safeParse(req.body);
    if (!z.uuid().safeParse(req.params.id).success || !parsed.success)
      throw new EventDataError(
        400,
        "Enter a name between 1 and 100 characters.",
      );
    const label = await (res.locals.data as UserDataAccess).updateLabel(
      kind,
      String(req.params.id),
      parsed.data.name,
    );
    if (!label) throw new EventDataError(404, "Label no longer available.");
    res.json({ label });
  });
  router.delete("/:id", async (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success)
      throw new EventDataError(400, "Invalid label ID.");
    if (
      !(await (res.locals.data as UserDataAccess).deleteLabel(
        kind,
        String(req.params.id),
      ))
    )
      throw new EventDataError(404, "Label no longer available.");
    res.status(204).end();
  });
  router.post("/", async (req, res) => {
    const parsed = z
      .object({
        name: z
          .string()
          .trim()
          .min(1, "Enter a name.")
          .max(100, "Use 100 characters or fewer."),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Enter a name between 1 and 100 characters." });
      return;
    }
    res.status(201).json({
      label: await (res.locals.data as UserDataAccess).createLabel(
        kind,
        parsed.data.name,
      ),
    });
  });
  return router;
}
