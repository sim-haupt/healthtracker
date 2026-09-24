import type { Label } from "./tracker";
export type TimelineItem = {
  id: string;
  entry_type: "event" | "episode" | "document";
  event_id: string;
  profile_id: string;
  event_type: string;
  title: string;
  event_title: string;
  occurred_at: string;
  summary: string;
  related_event_id?: string | null;
  has_attachments?: boolean;
  tags: Label[];
  category: Label | null;
  document_category?: string | null;
};
export type TimelineResults = { items: TimelineItem[]; total: number };
export function timelineYearQuery(
  query: Record<string, unknown>,
  year: string,
) {
  if (!year) return { query, error: "" };
  if (!/^\d{4}$/.test(year) || Number(year) < 1000 || Number(year) > 9998)
    return {
      query,
      error:
        "Enter a four-digit year between 1000 and 9998, or clear it for all years.",
    };
  const from = new Date(Number(year), 0, 1).toISOString(),
    to = new Date(Number(year) + 1, 0, 1).toISOString();
  const start =
    typeof query.date_from === "string" &&
    Date.parse(query.date_from) > Date.parse(from)
      ? query.date_from
      : from;
  const end =
    typeof query.date_to === "string" &&
    Date.parse(query.date_to) < Date.parse(to)
      ? query.date_to
      : to;
  if (Date.parse(start) >= Date.parse(end))
    return {
      query,
      error:
        "This year is outside your selected date range. Clear the date range or choose another year.",
    };
  return { query: { ...query, date_from: start, date_to: end }, error: "" };
}
export function groupTimeline(items: TimelineItem[]) {
  const years: {
    year: number;
    months: {
      key: string;
      label: string;
      days: { key: string; date: Date; items: TimelineItem[] }[];
    }[];
  }[] = [];
  for (const item of items) {
    const date = new Date(
      item.entry_type === "episode"
        ? item.occurred_at.slice(0, 10) + "T00:00:00"
        : item.occurred_at,
    );
    const y = date.getFullYear(),
      m = date.getMonth();
    const monthKey = `${y}-${m}`,
      dayKey = `${monthKey}-${date.getDate()}`;
    let year = years.find((group) => group.year === y);
    if (!year) {
      year = { year: y, months: [] };
      years.push(year);
    }
    let month = year.months.find((group) => group.key === monthKey);
    if (!month) {
      month = {
        key: monthKey,
        label: date.toLocaleDateString(localeCode(), { month: "long" }),
        days: [],
      };
      year.months.push(month);
    }
    let day = month.days.find((group) => group.key === dayKey);
    if (!day) {
      day = { key: dayKey, date, items: [] };
      month.days.push(day);
    }
    day.items.push(item);
  }
  return years;
}
import { localeCode } from "./locale";
