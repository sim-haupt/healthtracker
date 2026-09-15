export type ReminderStatus = "scheduled" | "completed" | "dismissed";
export type ReminderRecurrence = "none" | "monthly" | "yearly";
export type ReminderKind = "custom" | "next_dose" | "renewal";

export type Reminder = {
  id: string;
  profile_id: string;
  source_event_id: string | null;
  reminder_kind: ReminderKind;
  title: string;
  due_date: string;
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  source_event: {
    id: string;
    title: string;
    event_type: string;
    disease: string | null;
  } | null;
};
