"use client";
import { useEventTypes } from "../event-types";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  dayKey,
  monthDays,
  eventsOnDay,
  calendarEventSegments,
  calendarQuery,
  nextDay,
} from "@/lib/tracker";
import { TrackerFiltersBar, useTrackerQuery } from "./filters";
import { useTrackerResults, type EventResults } from "./use-results";
import { EventRows } from "./event-rows";
import { formatAccessibleDate, formatDate } from "@/lib/date-format";
import { eventDisplayTitle } from "@/lib/events";
import { useProfiles } from "../app-shell";
import { ProfileAvatar } from "../ui/profile-avatar";
export function HealthCalendar() {
  const typeOptions = useEventTypes();
  const { profiles, activeProfile } = useProfiles();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const { query, error: filterError } = useTrackerQuery();
  const days = monthDays(month);
  const bounds = calendarQuery(query, days);
  const { data, error, retry } = useTrackerResults<EventResults>(
    "/api/v1/events/search",
    { ...bounds.query, page: 1, page_size: 100 },
    { error: filterError, empty: bounds.empty, allPages: true },
  );
  const selectedDay = new Date(`${selected}T00:00:00`);
  function visibleEvents(day: Date) {
    if (
      !data ||
      (query.date_from &&
        nextDay(day).getTime() <= Date.parse(String(query.date_from))) ||
      (query.date_to && day.getTime() >= Date.parse(String(query.date_to)))
    )
      return [];
    return eventsOnDay(data.events, day);
  }
  const chosen = visibleEvents(selectedDay);
  const eventSegments = data ? calendarEventSegments(data.events, days) : [];
  function move(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelected(dayKey(next));
  }
  const title = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Calendar</h1>
        </div>
        <Link className="button" href={`/events/new?date=${selected}`}>
          <Plus size={18} /> Add event
        </Link>
      </div>
      <TrackerFiltersBar />
      <section className="card calendar-card">
        <header className="calendar-toolbar">
          <h2 aria-live="polite">{title}</h2>
          <div>
            <span className="month-label">Month view</span>
            <button
              className="button secondary-button"
              onClick={() => {
                const now = new Date();
                setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelected(dayKey(now));
              }}
            >
              Today
            </button>
            <button
              className="icon-button"
              aria-label="Previous month"
              onClick={() => move(-1)}
            >
              <ChevronLeft />
            </button>
            <button
              className="icon-button"
              aria-label="Next month"
              onClick={() => move(1)}
            >
              <ChevronRight />
            </button>
          </div>
        </header>
        {error ? (
          <div className="event-state" role="alert">
            <p>{error}</p>
            <button className="button secondary-button" onClick={retry}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="calendar-weekdays" aria-hidden="true">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-grid" aria-label={title} aria-busy={!data}>
              {days.map((day, index) => {
                const key = dayKey(day),
                  events = visibleEvents(day),
                  current = day.getMonth() === month.getMonth();
                return (
                  <div
                    key={key}
                    className={`calendar-day ${current ? "" : "outside-month"} ${selected === key ? "selected-day" : ""}`}
                    style={{
                      gridColumn: (index % 7) + 1,
                      gridRow: Math.floor(index / 7) + 1,
                    }}
                    onClick={() => setSelected(key)}
                  >
                    <button
                      className={`day-number ${key === dayKey(new Date()) ? "today" : ""}`}
                      aria-pressed={selected === key}
                      aria-label={`${formatAccessibleDate(day)}, ${data ? events.length : "loading"} events`}
                      onClick={() => setSelected(key)}
                    >
                      {day.getDate()}
                    </button>
                    {events.length > 0 && (
                      <button
                        className="day-event-count"
                        aria-label={`Show all ${events.length} events on ${formatDate(day)}`}
                        onClick={() => setSelected(key)}
                      >
                        {events.length}{" "}
                        {events.length === 1 ? "event" : "events"}
                      </button>
                    )}
                  </div>
                );
              })}
              {eventSegments.map((segment) => {
                const event = segment.event;
                const profile = profiles.find(
                  (item) => item.id === event.profile_id,
                );
                const eventType = typeOptions.types.find(
                  (type) => type.key === event.event_type,
                );
                const typeName = eventType?.name ?? event.event_type;
                return (
                  <Link
                    key={`${event.id}-${segment.week}`}
                    className={`calendar-event-segment lane-${segment.lane} ${segment.continuesBefore ? "continues-before" : ""} ${segment.continuesAfter ? "continues-after" : ""}`}
                    style={
                      {
                        gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`,
                        gridRow: segment.week + 1,
                        "--event-color": eventType?.color ?? "#005461",
                      } as CSSProperties
                    }
                    href={`/events/${event.id}`}
                    title={`${profile?.name ?? "Health profile"} · ${typeName}: ${eventDisplayTitle(event)}`}
                  >
                    {!activeProfile && (
                      <ProfileAvatar
                        name={profile?.name ?? "Health profile"}
                        avatar={profile?.avatar}
                      />
                    )}
                    <span>{eventDisplayTitle(event)}</span>
                  </Link>
                );
              })}
            </div>
            {!data && (
              <p className="calendar-loading" role="status">
                Loading calendar events…
              </p>
            )}
          </>
        )}
      </section>
      <section className="card selected-day-events">
        <header className="card-heading">
          <h2>{formatDate(selectedDay)}</h2>
          <Link className="text-link" href={`/events/new?date=${selected}`}>
            <Plus size={16} /> Add event
          </Link>
        </header>
        {error ? (
          <p className="overview-empty">
            Events couldn’t be loaded. Retry above.
          </p>
        ) : !data ? (
          <p className="overview-empty" role="status">
            Loading events…
          </p>
        ) : chosen.length ? (
          <EventRows events={chosen} />
        ) : (
          <p className="overview-empty">
            No events match your filters on this day.
          </p>
        )}
      </section>
    </>
  );
}
