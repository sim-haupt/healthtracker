import { Router } from "express";
import { z } from "zod";
import { documentCategories, type Attachment } from "./attachment-types.js";
import { EventDataError, type Label } from "./events.js";
import type { UserDataAccess } from "./data.js";

export const documentFileTypes = [
  "image",
  "pdf",
  "word",
  "spreadsheet",
  "presentation",
  "text",
] as const;

export type HealthDocument = Attachment & {
  files?: Attachment[];
  profile_id: string;
  event_title: string;
  event_type: string;
  event_date: string;
  event_category: Label | null;
  tags: Label[];
};

export const documentListSchema = z
  .object({
    profile_id: z.uuid().optional(),
    file_type: z.enum(documentFileTypes).optional(),
    event_id: z.uuid().optional(),
    document_category: z.enum(documentCategories).optional(),
    tag_ids: z.array(z.uuid()).max(20).optional(),
    q: z.string().trim().max(200).optional(),
    date_from: z.iso.datetime({ offset: true }).optional(),
    date_to: z.iso.datetime({ offset: true }).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(24),
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

export type DocumentQuery = z.output<typeof documentListSchema>;
export type DocumentDataAccess = {
  listDocuments: (
    query: DocumentQuery,
  ) => Promise<{ documents: HealthDocument[]; total: number }>;
};

export function documentRouter() {
  const router = Router();
  router.post("/search", async (req, res) => {
    const parsed = documentListSchema.safeParse(req.body);
    if (!parsed.success)
      throw new EventDataError(
        400,
        "Check the document filters and date range.",
      );
    res.json(
      await (res.locals.data as UserDataAccess).listDocuments(parsed.data),
    );
  });
  return router;
}
