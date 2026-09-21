import { Router } from "express";
import { z } from "zod";
import type { UserDataAccess } from "./data.js";
import { EventDataError, type HealthEvent } from "./events.js";
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);
export const providerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    specialty: optional(200),
    phone: optional(100),
    email: optional(254).refine(
      (v) => !v || z.email().safeParse(v).success,
      "Enter a valid email address.",
    ),
    address: optional(1000),
    website: optional(2000).refine((v) => {
      if (!v) return true;
      try {
        return ["http:", "https:"].includes(new URL(v).protocol);
      } catch {
        return false;
      }
    }, "Use a complete http:// or https:// website address."),
    rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    notes: optional(5000),
  })
  .strict();
export type ProviderInput = z.output<typeof providerSchema>;
export type Provider = ProviderInput & { id: string; created_at: string };
export type ProviderTimelineItem = {
  id: string;
  record_type: "event" | "document";
  event_id: string;
  document_group_id: string | null;
  profile_id: string;
  event_type: string | null;
  title: string;
  occurred_at: string;
  description: string | null;
  file_name: string | null;
  document_category: string | null;
};
export type ProviderDataAccess = {
  listProviders: () => Promise<Provider[]>;
  getProvider: (id: string) => Promise<Provider | null>;
  saveProvider: (
    id: string | null,
    input: ProviderInput,
  ) => Promise<Provider | null>;
  deleteProvider: (id: string) => Promise<boolean>;
  providerEvents: (
    id: string,
    page: number,
    profileId?: string,
  ) => Promise<{ events: HealthEvent[]; total: number }>;
  providerTimeline: (
    id: string,
    page: number,
    profileId?: string,
  ) => Promise<{ items: ProviderTimelineItem[]; total: number }>;
};
export function providerRouter() {
  const router = Router();
  router.param("id", (_req, _res, next, id) => {
    if (!z.uuid().safeParse(id).success)
      throw new EventDataError(400, "Invalid provider ID.");
    next();
  });
  router.get("/", async (_req, res) =>
    res.json({
      providers: await (res.locals.data as UserDataAccess).listProviders(),
    }),
  );
  router.get("/:id", async (req, res) => {
    const provider = await (res.locals.data as UserDataAccess).getProvider(
      String(req.params.id),
    );
    if (!provider)
      throw new EventDataError(
        404,
        "Provider not found or no longer available.",
      );
    res.json({ provider });
  });
  router.get("/:id/events", async (req, res) => {
    const id = String(req.params.id),
      data = res.locals.data as UserDataAccess;
    const query = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        profile_id: z.uuid().optional(),
      })
      .strict()
      .safeParse(req.query);
    if (!query.success) throw new EventDataError(400, "Invalid filters.");
    if (!(await data.getProvider(id)))
      throw new EventDataError(
        404,
        "Provider not found or no longer available.",
      );
    res.json({
      ...(await data.providerEvents(
        id,
        query.data.page,
        query.data.profile_id,
      )),
      page: query.data.page,
      page_size: 30,
    });
  });
  router.get("/:id/timeline", async (req, res) => {
    const id = String(req.params.id),
      data = res.locals.data as UserDataAccess;
    const query = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        profile_id: z.uuid().optional(),
      })
      .strict()
      .safeParse(req.query);
    if (!query.success) throw new EventDataError(400, "Invalid filters.");
    if (!(await data.getProvider(id)))
      throw new EventDataError(
        404,
        "Provider not found or no longer available.",
      );
    res.json({
      ...(await data.providerTimeline(
        id,
        query.data.page,
        query.data.profile_id,
      )),
      page: query.data.page,
      page_size: 30,
    });
  });
  for (const method of ["post", "put"] as const)
    router[method](method === "post" ? "/" : "/:id", async (req, res) => {
      const parsed = providerSchema.safeParse(req.body);
      if (!parsed.success)
        throw new EventDataError(
          400,
          "Check the provider details.",
          parsed.error.flatten().fieldErrors,
        );
      const provider = await (res.locals.data as UserDataAccess).saveProvider(
        method === "post"
          ? null
          : String((req.params as Record<string, string>).id),
        parsed.data,
      );
      if (!provider)
        throw new EventDataError(
          404,
          "Provider not found or no longer available.",
        );
      res.status(method === "post" ? 201 : 200).json({ provider });
    });
  router.delete("/:id", async (req, res) => {
    if (
      !(await (res.locals.data as UserDataAccess).deleteProvider(
        String(req.params.id),
      ))
    )
      throw new EventDataError(
        404,
        "Provider not found or no longer available.",
      );
    res.status(204).end();
  });
  return router;
}
