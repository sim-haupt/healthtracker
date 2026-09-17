import type { EventSummary } from "./events";
export type Label = { id: string; name: string; usage_count?: number };
export type TrackerFilters = {
  provider_id?: string;
  event_type: string;
  tag_ids: string[];
  date_from: string;
  date_to: string;
  q: string;
};
export const emptyFilters: TrackerFilters = {
  provider_id: "",
  event_type: "",
  tag_ids: [],
  date_from: "",
  date_to: "",
  q: "",
};
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) || dayKey(date) !== value ? null : date;
}
export function nextDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}
export function filterQuery(filters: TrackerFilters, profileId = "") {
  const start = filters.date_from ? parseDay(filters.date_from) : null;
  const end = filters.date_to ? parseDay(filters.date_to) : null;
  if (
    (filters.date_from && !start) ||
    (filters.date_to && !end) ||
    (start && end && start > end)
  )
    return {
      error:
        "Choose a valid date range. The end date must be on or after the start date.",
      query: {},
    };
  const query: Record<string, unknown> = {};
  if (filters.provider_id) query.provider_id = filters.provider_id;
  if (profileId) query.profile_id = profileId;
  if (filters.event_type) query.event_type = filters.event_type;
  if (filters.tag_ids.length) query.tag_ids = filters.tag_ids;
  if (filters.q.trim()) query.q = filters.q.trim();
  if (start) query.date_from = start.toISOString();
  if (end) query.date_to = nextDay(end).toISOString();
  return { query, error: "" };
}
export function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i),
  );
}
export function eventsOnDay(events: EventSummary[], day: Date) {
  const start = day.getTime(),
    end = nextDay(day).getTime();
  return events
    .filter(
      (event) =>
        new Date(event.event_date).getTime() < end &&
        new Date(event.end_date ?? event.event_date).getTime() >= start,
    )
    .sort(
      (a, b) =>
        Date.parse(a.event_date) - Date.parse(b.event_date) ||
        a.id.localeCompare(b.id),
    );
}
export type CalendarEventSegment = {
  event: EventSummary;
  week: number;
  startColumn: number;
  endColumn: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};
export function calendarEventSegments(
  events: EventSummary[],
  days: Date[],
  maxLanes = 2,
) {
  const segments: CalendarEventSegment[] = [];
  for (let week = 0; week < Math.ceil(days.length / 7); week++) {
    const weekDays = days.slice(week * 7, week * 7 + 7);
    const candidates = events
      .map((event) => {
        const occupied = weekDays
          .map((day, index) =>
            eventsOnDay([event], day).length ? index : -1,
          )
          .filter((index) => index >= 0);
        if (!occupied.length) return null;
        const startColumn = occupied[0] + 1;
        const endColumn = occupied[occupied.length - 1] + 1;
        return {
          event,
          startColumn,
          endColumn,
          continuesBefore:
            eventsOnDay(
              [event],
              new Date(
                weekDays[0].getFullYear(),
                weekDays[0].getMonth(),
                weekDays[0].getDate() - 1,
              ),
            ).length > 0,
          continuesAfter:
            eventsOnDay([event], nextDay(weekDays[weekDays.length - 1])).length > 0,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item)
      .sort(
        (a, b) =>
          a.startColumn - b.startColumn ||
          b.endColumn - b.startColumn - (a.endColumn - a.startColumn) ||
          Date.parse(a.event.event_date) - Date.parse(b.event.event_date) ||
          a.event.id.localeCompare(b.event.id),
      );
    const laneEnds = Array.from({ length: maxLanes }, () => 0);
    for (const candidate of candidates) {
      const lane = laneEnds.findIndex(
        (lastColumn) => lastColumn < candidate.startColumn,
      );
      if (lane < 0) continue;
      laneEnds[lane] = candidate.endColumn;
      segments.push({ ...candidate, week, lane });
    }
  }
  return segments;
}
export function calendarQuery(query: Record<string, unknown>, days: Date[]) {
  const start = Math.max(
    days[0].getTime(),
    query.date_from ? Date.parse(String(query.date_from)) : -Infinity,
  );
  const end = Math.min(
    nextDay(days[days.length - 1]).getTime(),
    query.date_to ? Date.parse(String(query.date_to)) : Infinity,
  );
  return {
    empty: start >= end,
    query: {
      ...query,
      date_from: new Date(start).toISOString(),
      date_to: new Date(end).toISOString(),
    },
  };
}
export type DashboardResult = {
  profiles: {
    profile_id: string;
    total: number;
    upcoming: EventSummary[];
    recent: EventSummary[];
    illnesses: EventSummary[];
    visits: EventSummary[];
    reminders?: {
      id: string;
      profile_id: string;
      source_event_id: string | null;
      reminder_kind: "custom" | "next_dose" | "renewal";
      title: string;
      due_date: string;
      recurrence: "none" | "monthly" | "yearly";
      status: "scheduled";
    }[];
    vaccination_doses?: {
      id: string;
      title: string;
      date: string;
      disease: string | null;
    }[];
  }[];
};
