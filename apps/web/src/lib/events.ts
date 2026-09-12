import { parseDay } from "./tracker";
export const eventTypes = [
  "Doctor Visit",
  "Illness",
  "Medication",
  "Vaccination",
  "Examination / Test",
  "Injury",
  "Symptom",
  "Other",
] as const;
export type EventType = (typeof eventTypes)[number];
export type DetailField =
  | "description"
  | "symptoms"
  | "diagnosis"
  | "treatment"
  | "prescription"
  | "doctor"
  | "location"
  | "notes";
export type Label = { id: string; name: string };
export type HealthEvent = {
  disease?: string | null;
  next_dose_date?: string | null;
  provider_id?: string | null;
  provider?: { id: string; name: string; specialty: string | null } | null;
  category_id: string | null;
  tag_ids: string[];
  category?: Label | null;
  tags?: Label[];
  id: string;
  profile_id: string;
  event_type: EventType;
  title: string;
  event_date: string;
  end_date: string | null;
  description: string;
  symptoms: string | null;
  diagnosis: string | null;
  treatment: string | null;
  prescription: string | null;
  doctor: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type EventInput = Omit<
  HealthEvent,
  "id" | "created_at" | "updated_at" | "category" | "tags" | "provider"
>;
export type EventSummary = Pick<
  HealthEvent,
  | "id"
  | "profile_id"
  | "event_type"
  | "title"
  | "event_date"
  | "end_date"
  | "disease"
  | "next_dose_date"
  | "category_id"
  | "category"
  | "tags"
>;
export const detailFields: DetailField[] = [
  "description",
  "symptoms",
  "diagnosis",
  "treatment",
  "prescription",
  "doctor",
  "location",
  "notes",
];
const baseLabels: Record<DetailField, string> = {
  description: "Description",
  symptoms: "Symptoms",
  diagnosis: "Diagnosis",
  treatment: "Treatment",
  prescription: "Prescription",
  doctor: "Doctor",
  location: "Location",
  notes: "Notes",
};
const primaryFields: Record<EventType, DetailField[]> = {
  "Doctor Visit": [
    "doctor",
    "description",
    "treatment",
    "diagnosis",
    "prescription",
  ],
  Illness: ["symptoms", "description", "treatment"],
  Medication: ["prescription", "description"],
  Vaccination: ["description", "doctor"],
  "Examination / Test": ["description", "diagnosis", "doctor"],
  Injury: ["description", "symptoms", "treatment"],
  Symptom: ["symptoms", "description"],
  Other: ["description"],
};
export function fieldsForType(type: EventType) {
  return primaryFields[type] ?? ["description" as DetailField];
}
export function fieldLabel(type: EventType, field: DetailField) {
  if (type === "Doctor Visit" && field === "description")
    return "Reason for visit";
  if (type === "Doctor Visit" && field === "treatment") return "What was done";
  if (type === "Illness" && field === "description") return "How it felt";
  if (type === "Medication" && field === "prescription")
    return "Medication and dose";
  if (type === "Medication" && field === "description")
    return "Reason for taking it";
  if (type === "Vaccination" && field === "description")
    return "Vaccine and dose details";
  if (type === "Examination / Test" && field === "description")
    return "Reason for the test";
  if (type === "Examination / Test" && field === "diagnosis")
    return "Results / findings";
  if (type === "Injury" && field === "description") return "What happened";
  if (type === "Symptom" && field === "description")
    return "How it felt / when it happened";
  return baseLabels[field];
}
export function localDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
export function dateLabel(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
export type EventDraft = Record<
  Exclude<keyof EventInput, "tag_ids">,
  string
> & { tag_ids: string[] };
export function eventDraft(
  event?: HealthEvent,
  profileId = "",
  initialDate?: string,
): EventDraft {
  return {
    disease: event?.disease ?? "",
    next_dose_date: event?.next_dose_date ?? "",
    profile_id: event?.profile_id ?? profileId,
    provider_id: event?.provider_id ?? "",
    category_id: event?.category_id ?? "",
    tag_ids: event?.tag_ids ?? [],
    event_type: event?.event_type ?? "Doctor Visit",
    title: event?.title ?? "",
    event_date:
      !event && initialDate && parseDay(initialDate)
        ? `${initialDate}T09:00:00`
        : localDateTime(event?.event_date ?? new Date().toISOString()),
    end_date: event?.end_date ? localDateTime(event.end_date) : "",
    description: event?.description ?? "",
    symptoms: event?.symptoms ?? "",
    diagnosis: event?.diagnosis ?? "",
    treatment: event?.treatment ?? "",
    prescription: event?.prescription ?? "",
    doctor: event?.doctor ?? "",
    location: event?.location ?? "",
    notes: event?.notes ?? "",
  };
}
export function validateDraft(
  draft: EventDraft,
  profileIds: string[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.disease && draft.disease.length > 300)
    errors.disease = "Use 300 characters or fewer.";
  if (draft.next_dose_date && !parseDay(draft.next_dose_date))
    errors.next_dose_date = "Enter a valid next-dose date.";
  if (draft.tag_ids.length > 20) errors.tag_ids = "Choose up to 20 tags.";
  if (!profileIds.includes(draft.profile_id))
    errors.profile_id = "Choose a health profile.";
  if (!eventTypes.includes(draft.event_type as EventType))
    errors.event_type = "Choose an event type.";
  if (!draft.title.trim()) errors.title = "Enter a title.";
  else if (draft.title.trim().length > 300)
    errors.title = "Use 300 characters or fewer.";
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) &&
    !Number.isNaN(new Date(value).getTime()) &&
    localDateTime(new Date(value).toISOString()) ===
      (value.length === 16 ? `${value}:00` : value);
  if (!validDate(draft.event_date))
    errors.event_date = "Enter a valid start date and local time.";
  if (draft.end_date && !validDate(draft.end_date))
    errors.end_date = "Enter a valid end date and local time.";
  else if (
    draft.end_date &&
    !errors.event_date &&
    new Date(draft.end_date) < new Date(draft.event_date)
  )
    errors.end_date = "End date must be on or after the start date.";
  for (const field of detailFields) {
    const max = field === "doctor" || field === "location" ? 300 : 5000;
    if (draft[field].trim().length > max)
      errors[field] = `Use ${max.toLocaleString()} characters or fewer.`;
  }
  return errors;
}
export function draftInput(
  draft: EventDraft,
  original?: HealthEvent,
): EventInput {
  const dateValue = (value: string, previous?: string | null) =>
    previous && value === localDateTime(previous)
      ? previous
      : new Date(value).toISOString();
  return {
    ...draft,
    disease: draft.disease?.trim() || null,
    next_dose_date: draft.next_dose_date || null,
    provider_id: draft.provider_id || null,
    category_id: draft.category_id || null,
    event_type: draft.event_type as EventType,
    title: draft.title.trim(),
    event_date: dateValue(draft.event_date, original?.event_date),
    end_date: draft.end_date
      ? dateValue(draft.end_date, original?.end_date)
      : null,
    ...Object.fromEntries(
      detailFields.map((field) => [
        field,
        draft[field].trim() || (field === "description" ? "" : null),
      ]),
    ),
  } as EventInput;
}
