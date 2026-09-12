import type { Attachment } from "./attachments";
import type { Label } from "./events";
import { nextDay, parseDay } from "./tracker";

export const documentFileTypes = [
  ["image", "Images"],
  ["pdf", "PDFs"],
  ["word", "Word / rich text"],
  ["spreadsheet", "Spreadsheets"],
  ["presentation", "Presentations"],
  ["text", "Text / CSV"],
] as const;

export type HealthDocument = Attachment & {
  profile_id: string;
  event_title: string;
  event_type: string;
  event_date: string;
  event_category: Label | null;
  tags: Label[];
};

export type DocumentFilters = {
  q: string;
  file_type: string;
  event_id: string;
  document_category: string;
  date_from: string;
  date_to: string;
  tag_ids: string[];
};

export const emptyDocumentFilters: DocumentFilters = {
  q: "",
  file_type: "",
  event_id: "",
  document_category: "",
  date_from: "",
  date_to: "",
  tag_ids: [],
};

export function documentFilterQuery(
  filters: DocumentFilters,
  profileId = "",
  search = filters.q,
) {
  const start = filters.date_from ? parseDay(filters.date_from) : null;
  const end = filters.date_to ? parseDay(filters.date_to) : null;
  if (
    (filters.date_from && !start) ||
    (filters.date_to && !end) ||
    (start && end && start > end)
  )
    return {
      error:
        "Choose a valid upload date range. The end date must be on or after the start date.",
      query: {},
    };
  const query: Record<string, unknown> = {};
  if (profileId) query.profile_id = profileId;
  if (filters.file_type) query.file_type = filters.file_type;
  if (filters.event_id) query.event_id = filters.event_id;
  if (filters.document_category)
    query.document_category = filters.document_category;
  if (filters.tag_ids.length) query.tag_ids = filters.tag_ids;
  if (search.trim()) query.q = search.trim();
  if (start) query.date_from = start.toISOString();
  if (end) query.date_to = nextDay(end).toISOString();
  return { query, error: "" };
}

export function categoryLabel(value: string) {
  return value.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function fileKind(item: Pick<Attachment, "file_name" | "mime_type">) {
  if (item.mime_type.startsWith("image/")) return "Image";
  if (item.mime_type === "application/pdf") return "PDF";
  return item.file_name.split(".").pop()?.toUpperCase() || "Document";
}
