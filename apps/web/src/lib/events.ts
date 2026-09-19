import { parseDay } from "./tracker";
import { formatDateTime } from "./date-format";
export const eventTypes = [
  "Doctor Visit",
  "Illness",
  "Examination / Test",
  "Injury",
  "Symptom",
  "Other",
  "Migraine",
  "Herpes",
] as const;
export type EventType = string;
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
  related_symptom_id?: string | null;
  related_symptom?: EventRelationSummary | null;
  related_visits?: EventRelationSummary[];
  test_type?: string | null;
  severity?: string | null;
  trigger?: string | null;
  relief?: string | null;
  injury_type?: string | null;
  body_area?: string | null;
  frequency?: string | null;
  recovery?: string | null;
  action?: string | null;
  disease?: string | null;
  dose_number?: number | null;
  dose_total?: number | null;
  next_dose_date?: string | null;
  needs_renewal?: boolean;
  renewal_date?: string | null;
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
export type EventRelationSummary = {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
};
export type EventInput = Omit<
  HealthEvent,
  | "id"
  | "created_at"
  | "updated_at"
  | "category"
  | "tags"
  | "provider"
  | "related_symptom"
  | "related_visits"
>;
export function eventDisplayTitle(
  event: Pick<HealthEvent, "event_type" | "title" | "disease">,
) {
  return event.event_type === "Vaccination" && event.disease?.trim()
    ? event.disease
    : event.title;
}
export type EventSummary = Pick<
  HealthEvent,
  | "id"
  | "profile_id"
  | "event_type"
  | "title"
  | "event_date"
  | "end_date"
  | "disease"
  | "test_type"
  | "severity"
  | "trigger"
  | "relief"
  | "injury_type"
  | "body_area"
  | "frequency"
  | "recovery"
  | "action"
  | "dose_number"
  | "dose_total"
  | "next_dose_date"
  | "needs_renewal"
  | "renewal_date"
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
  return formatDateTime(value);
}
export type EventDraft = Record<
  Exclude<
    keyof EventInput,
    "tag_ids" | "dose_number" | "dose_total" | "needs_renewal"
  >,
  string
> & {
  tag_ids: string[];
  dose_number: string;
  dose_total: string;
  needs_renewal: boolean;
};
export function eventDraft(
  event?: HealthEvent,
  profileId = "",
  initialDate?: string,
): EventDraft {
  return {
    related_symptom_id: event?.related_symptom_id ?? "",
    test_type: event?.test_type ?? "",
    severity: event?.severity ?? "",
    trigger: event?.trigger ?? "",
    relief: event?.relief ?? "",
    injury_type: event?.injury_type ?? "",
    body_area: event?.body_area ?? "",
    frequency: event?.frequency ?? "",
    recovery: event?.recovery ?? "",
    action: event?.action ?? "",
    disease: event?.disease ?? "",
    dose_number: event?.dose_number ? String(event.dose_number) : "",
    dose_total: event?.dose_total ? String(event.dose_total) : "",
    next_dose_date: event?.next_dose_date ?? "",
    needs_renewal: event?.needs_renewal ?? false,
    renewal_date: event?.renewal_date ?? "",
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
  if (draft.test_type && draft.test_type.length > 300)
    errors.test_type = "Use 300 characters or fewer.";
  if (
    draft.severity &&
    draft.event_type === "Migraine" &&
    !["1", "2", "3", "4", "5"].includes(draft.severity)
  )
    errors.severity = "Choose a severity from 1 to 5.";
  else if (
    draft.severity &&
    draft.event_type !== "Migraine" &&
    !["Mild", "Moderate", "Severe"].includes(draft.severity)
  )
    errors.severity = "Choose a severity.";
  if (draft.trigger && draft.trigger.length > 5000)
    errors.trigger = "Use 5,000 characters or fewer.";
  if (draft.relief && draft.relief.length > 5000)
    errors.relief = "Use 5,000 characters or fewer.";
  if (draft.injury_type && draft.injury_type.length > 300)
    errors.injury_type = "Use 300 characters or fewer.";
  if (draft.body_area && draft.body_area.length > 300)
    errors.body_area = "Use 300 characters or fewer.";
  if (
    draft.frequency &&
    !["Once", "Occasional", "Frequent", "Constant"].includes(draft.frequency)
  )
    errors.frequency = "Choose a frequency.";
  if (draft.recovery && draft.recovery.length > 5000)
    errors.recovery = "Use 5,000 characters or fewer.";
  if (draft.action && draft.action.length > 5000)
    errors.action = "Use 5,000 characters or fewer.";
  if (draft.disease && draft.disease.length > 300)
    errors.disease = "Use 300 characters or fewer.";
  if (draft.next_dose_date && !parseDay(draft.next_dose_date))
    errors.next_dose_date = "Enter a valid next-dose date.";
  const validDose = (value: string) =>
    !value || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 3);
  if (!validDose(draft.dose_number))
    errors.dose_number = "Choose a dose from 1 to 3.";
  if (!validDose(draft.dose_total))
    errors.dose_total = "Choose a total from 1 to 3.";
  if (
    draft.dose_number &&
    draft.dose_total &&
    Number(draft.dose_number) > Number(draft.dose_total)
  )
    errors.dose_number = "Dose number cannot exceed the total doses.";
  if (draft.renewal_date && !parseDay(draft.renewal_date))
    errors.renewal_date = "Enter a valid renewal date.";
  if (draft.tag_ids.length > 20) errors.tag_ids = "Choose up to 20 tags.";
  if (!profileIds.includes(draft.profile_id))
    errors.profile_id = "Choose a health profile.";
  if (!draft.event_type || draft.event_type.length > 100)
    errors.event_type = "Choose an event type.";
  if (!draft.title.trim()) errors.title = "Enter a title.";
  else if (draft.title.trim().length > 300)
    errors.title = "Use 300 characters or fewer.";
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) &&
    !Number.isNaN(new Date(value).getTime()) &&
    localDateTime(new Date(value).toISOString()) ===
      (value.length === 16 ? `${value}:00` : value);
  if (draft.event_date && !validDate(draft.event_date))
    errors.event_date = "Enter a valid start date and local time.";
  if (draft.end_date && !validDate(draft.end_date))
    errors.end_date = "Enter a valid end date and local time.";
  else if (
    draft.event_date &&
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
  const eventDate =
    draft.event_date ||
    draft.end_date ||
    localDateTime(new Date().toISOString());
  return {
    ...draft,
    related_symptom_id:
      draft.event_type === "Doctor Visit"
        ? draft.related_symptom_id || null
        : null,
    test_type: draft.test_type?.trim() || null,
    severity: draft.severity || null,
    trigger: draft.trigger?.trim() || null,
    relief: draft.relief?.trim() || null,
    injury_type: draft.injury_type?.trim() || null,
    body_area: draft.body_area?.trim() || null,
    frequency: draft.frequency || null,
    recovery: draft.recovery?.trim() || null,
    action: draft.action?.trim() || null,
    disease: draft.disease?.trim() || null,
    dose_number: draft.dose_number ? Number(draft.dose_number) : null,
    dose_total: draft.dose_total ? Number(draft.dose_total) : null,
    next_dose_date: draft.next_dose_date || null,
    needs_renewal: draft.needs_renewal,
    renewal_date: draft.needs_renewal ? draft.renewal_date || null : null,
    provider_id: draft.provider_id || null,
    category_id: draft.category_id || null,
    event_type: draft.event_type as EventType,
    title: draft.title.trim(),
    event_date: dateValue(eventDate, original?.event_date),
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
