import { Router } from "express";
import { z } from "zod";
import {
  attachmentError,
  documentCategories,
  type Attachment,
  type DocumentCategory,
  attachmentKinds,
  type AttachmentKind,
} from "./attachment-types.js";
import { EventDataError } from "./events.js";
import type { UserDataAccess } from "./data.js";
export type AttachmentDataAccess = {
  listAttachments(eventId: string): Promise<Attachment[]>;
  listEventUploads(eventId: string): Promise<Attachment[]>;
  createAttachment(
    eventId: string,
    ownerId: string,
    input: {
      file_name: string;
      mime_type: string;
      file_size: number;
      document_category: DocumentCategory;
      attachment_kind: AttachmentKind;
      document_group_id?: string;
      description: string | null;
      tag_ids: string[];
    },
  ): Promise<Attachment>;
  linkAttachment(
    eventId: string,
    documentId: string,
  ): Promise<Attachment | null>;
  deleteAttachment(eventId: string, id: string): Promise<boolean>;
};
export function attachmentRouter() {
  const router = Router({ mergeParams: true });
  router.use(async (req, res, next) => {
    const id = String(req.params.eventId);
    if (!z.string().uuid().safeParse(id).success)
      throw new EventDataError(400, "Invalid event ID.");
    if (!(await (res.locals.data as UserDataAccess).getEvent(id)))
      throw new EventDataError(404, "Event not found or no longer available.");
    res.locals.eventId = id;
    next();
  });
  router.get("/", async (req, res) =>
    res.json({
      attachments: await (res.locals.data as UserDataAccess).listAttachments(
        String(res.locals.eventId),
      ),
    }),
  );
  router.get("/uploads", async (req, res) =>
    res.json({
      attachments: await (res.locals.data as UserDataAccess).listEventUploads(
        String(res.locals.eventId),
      ),
    }),
  );
  router.post("/", async (req, res) => {
    const parsed = z
      .object({
        file_name: z.string(),
        mime_type: z.string(),
        file_size: z.number(),
        document_category: z.enum(documentCategories).default("other"),
        attachment_kind: z.enum(attachmentKinds).default("document"),
        document_group_id: z.uuid().optional(),
        description: z
          .string()
          .trim()
          .max(2000, "Use 2,000 characters or fewer.")
          .nullable()
          .optional()
          .transform((value) => value || null),
        tag_ids: z.array(z.uuid()).max(20).optional().default([]),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      throw new EventDataError(400, "Provide a filename, file type, and size.");
    const error = attachmentError(
      parsed.data.file_name,
      parsed.data.file_size,
      parsed.data.mime_type,
    );
    if (error) throw new EventDataError(400, error);
    res.status(201).json({
      attachment: await (res.locals.data as UserDataAccess).createAttachment(
        String(res.locals.eventId),
        res.locals.user.id,
        parsed.data,
      ),
    });
  });
  router.post("/link", async (req, res) => {
    const parsed = z
      .object({ document_id: z.uuid("Choose an available document.") })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      throw new EventDataError(400, "Choose an available document.");
    const attachment = await (res.locals.data as UserDataAccess).linkAttachment(
      String(res.locals.eventId),
      parsed.data.document_id,
    );
    if (!attachment)
      throw new EventDataError(
        404,
        "Document not found or unavailable for this health profile.",
      );
    res.status(201).json({ attachment });
  });
  router.delete("/:attachmentId", async (req, res) => {
    const id = String(req.params.attachmentId);
    if (!z.string().uuid().safeParse(id).success)
      throw new EventDataError(400, "Invalid attachment ID.");
    if (
      !(await (res.locals.data as UserDataAccess).deleteAttachment(
        String(res.locals.eventId),
        id,
      ))
    )
      throw new EventDataError(
        404,
        "Attachment not found or no longer available.",
      );
    res.status(204).end();
  });
  return router;
}
