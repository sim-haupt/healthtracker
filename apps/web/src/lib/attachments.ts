export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const documentCategories = [
  "lab result",
  "doctor's letter",
  "prescription",
  "invoice",
  "vaccination certificate",
  "imaging",
  "insurance",
  "other",
] as const;
export type DocumentCategory = (typeof documentCategories)[number];
export type AttachmentKind = "document" | "event_upload";
export const attachmentTypes: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
};
export type Attachment = {
  id: string;
  document_group_id: string;
  health_event_id: string;
  provider_id: string | null;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  document_category: DocumentCategory;
  attachment_kind: AttachmentKind;
  description: string | null;
  created_at: string;
};
export function attachmentError(
  name: string,
  size: number,
  mime: string,
): string | null {
  if (!name.trim() || name.length > 200 || /[\/\\\x00-\x1f\x7f]/.test(name))
    return "Use a filename of 1–200 characters without path separators or control characters.";
  const expected = attachmentTypes[name.split(".").pop()?.toLowerCase() ?? ""];
  if (!expected || mime !== expected)
    return "Choose a supported PDF, image, or document with a matching file type.";
  if (!Number.isInteger(size) || size < 1 || size > MAX_ATTACHMENT_SIZE)
    return "Files must be non-empty and no larger than 10 MB.";
  return null;
}
