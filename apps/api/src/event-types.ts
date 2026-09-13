import { Router } from "express";
import { z } from "zod";
import { EventDataError } from "./events.js";
import type { UserDataAccess } from "./data.js";
export type ManagedEventType = {
  id: string;
  key: string;
  name: string;
  color: string;
  archived: boolean;
};
export type EventTypeDataAccess = {
  listEventTypes: () => Promise<ManagedEventType[]>;
  saveEventType: (
    id: string | null,
    input: { name: string; color: string },
  ) => Promise<ManagedEventType | null>;
  archiveEventType: (id: string) => Promise<boolean>;
};
export const typeSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();
export function eventTypeRouter() {
  const r = Router();
  r.param("id", (_q, _s, n, id) => {
    if (!z.uuid().safeParse(id).success)
      throw new EventDataError(400, "Invalid event type.");
    n();
  });
  r.get("/", async (_q, s) =>
    s.json({ types: await (s.locals.data as UserDataAccess).listEventTypes() }),
  );
  for (const method of ["post", "put"] as const)
    r[method](method === "post" ? "/" : "/:id", async (q, s) => {
      const p = typeSchema.safeParse(q.body);
      if (!p.success)
        throw new EventDataError(400, "Enter a name and valid color.");
      const type = await (s.locals.data as UserDataAccess).saveEventType(
        method === "post"
          ? null
          : String((q.params as Record<string, string>).id),
        p.data,
      );
      if (!type) throw new EventDataError(404, "Event type not found.");
      s.status(method === "post" ? 201 : 200).json({ type });
    });
  r.delete("/:id", async (q, s) => {
    if (
      !(await (s.locals.data as UserDataAccess).archiveEventType(
        String(q.params.id),
      ))
    )
      throw new EventDataError(404, "Event type not found.");
    s.status(204).end();
  });
  return r;
}
