import { Router } from "express";
import { z } from "zod";
import { EventDataError, type EventSummary } from "./events.js";
import type { UserDataAccess } from "./data.js";
export const episodeSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    profile_id: z.uuid(),
    start_date: z.iso.date(),
    end_date: z.iso.date().nullable().default(null),
    status: z.enum(["active", "resolved"]),
    description: z.string().trim().max(5000).default(""),
    event_ids: z.array(z.uuid()).max(500).default([]),
  })
  .strict()
  .refine((v) => !v.end_date || v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "End date must be on or after start date.",
  });
export type EpisodeInput = z.output<typeof episodeSchema>;
export type Episode = Omit<EpisodeInput, "event_ids"> & {
  id: string;
  created_at: string;
  events: EventSummary[];
};
export type EpisodeDataAccess = {
  listEpisodes: (profileId?: string) => Promise<Episode[]>;
  getEpisode: (id: string) => Promise<Episode | null>;
  saveEpisode: (
    id: string | null,
    input: EpisodeInput,
  ) => Promise<Episode | null>;
  deleteEpisode: (id: string) => Promise<boolean>;
};
export function episodeRouter() {
  const router = Router();
  router.param("id", (_req, _res, next, id) => {
    if (!z.uuid().safeParse(id).success)
      throw new EventDataError(400, "Invalid episode ID.");
    next();
  });
  router.get("/", async (req, res) => {
    const parsed = z
      .object({ profile_id: z.uuid().optional() })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) throw new EventDataError(400, "Invalid profile.");
    res.json({
      episodes: await (res.locals.data as UserDataAccess).listEpisodes(
        parsed.data.profile_id,
      ),
    });
  });
  router.get("/:id", async (req, res) => {
    const episode = await (res.locals.data as UserDataAccess).getEpisode(
      String(req.params.id),
    );
    if (!episode) throw new EventDataError(404, "Episode not found.");
    res.json({ episode });
  });
  for (const method of ["post", "put"] as const)
    router[method](method === "post" ? "/" : "/:id", async (req, res) => {
      const parsed = episodeSchema.safeParse(req.body);
      if (!parsed.success)
        throw new EventDataError(
          400,
          "Check the episode details.",
          parsed.error.flatten().fieldErrors,
        );
      const episode = await (res.locals.data as UserDataAccess).saveEpisode(
        method === "post"
          ? null
          : String((req.params as Record<string, string>).id),
        parsed.data,
      );
      if (!episode) throw new EventDataError(404, "Episode not found.");
      res.status(method === "post" ? 201 : 200).json({ episode });
    });
  router.delete("/:id", async (req, res) => {
    if (
      !(await (res.locals.data as UserDataAccess).deleteEpisode(
        String(req.params.id),
      ))
    )
      throw new EventDataError(404, "Episode not found.");
    res.status(204).end();
  });
  return router;
}
