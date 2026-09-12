import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKey,
  parseDay,
  nextDay,
  monthDays,
  eventsOnDay,
  filterQuery,
  calendarQuery,
  emptyFilters,
} from "../../web/src/lib/tracker.js";
import { eventDraft, type EventSummary } from "../../web/src/lib/events.js";
const event: EventSummary = {
  id: "one",
  profile_id: "p",
  event_type: "Illness",
  title: "Cold",
  category_id: null,
  event_date: new Date(2026, 8, 10, 12).toISOString(),
  end_date: new Date(2026, 8, 13, 16).toISOString(),
};
test("month grid covers six Monday-first weeks, leap days and year boundaries", () => {
  const leap = monthDays(new Date(2024, 1, 1));
  assert.equal(leap.length, 42);
  assert.equal(leap[0].getDay(), 1);
  assert.ok(leap.some((day) => dayKey(day) === "2024-02-29"));
  const year = monthDays(new Date(2027, 0, 1));
  assert.equal(year[0].getFullYear(), 2026);
  assert.equal(year[41].getFullYear(), 2027);
  assert.equal(parseDay("2026-02-30"), null);
  assert.equal(parseDay("invalid"), null);
});
test("calendar includes spanning events and excludes dates outside their interval", () => {
  for (const day of [10, 11, 12, 13])
    assert.equal(eventsOnDay([event], new Date(2026, 8, day)).length, 1);
  for (const day of [9, 14])
    assert.equal(eventsOnDay([event], new Date(2026, 8, day)).length, 0);
  const instant = {
    ...event,
    event_date: new Date(2026, 8, 11, 0).toISOString(),
    end_date: null,
  };
  assert.equal(eventsOnDay([instant], new Date(2026, 8, 10)).length, 0);
  assert.equal(eventsOnDay([instant], new Date(2026, 8, 11)).length, 1);
});
test("date filtering is inclusive of the selected end day and intersects visible weeks", () => {
  const parsed = filterQuery(
    {
      ...emptyFilters,
      date_from: "2026-09-11",
      date_to: "2026-09-11",
      tag_ids: ["tag"],
      q: " fever ",
    },
    "profile",
  );
  assert.equal(parsed.error, "");
  assert.equal(parsed.query.date_to, new Date(2026, 8, 12).toISOString());
  assert.equal(parsed.query.q, "fever");
  assert.ok(
    filterQuery({
      ...emptyFilters,
      date_from: "2026-09-12",
      date_to: "2026-09-11",
    }).error,
  );
  const bounds = calendarQuery(parsed.query, monthDays(new Date(2026, 8, 1)));
  assert.equal(bounds.empty, false);
  assert.equal(bounds.query.date_from, parsed.query.date_from);
  assert.equal(
    calendarQuery(parsed.query, monthDays(new Date(2027, 1, 1))).empty,
    true,
  );
});
test("local calendar dates prefill new events without shifting days; existing events stay unchanged", () => {
  const draft = eventDraft(undefined, "profile", "2026-09-11");
  assert.equal(draft.event_date, "2026-09-11T09:00:00");
  assert.ok(
    !eventDraft(undefined, "profile", "bad").event_date.includes("bad"),
  );
  assert.equal(dayKey(nextDay(new Date(2026, 11, 31))), "2027-01-01");
});
