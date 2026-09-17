"use client";
import { EventTypeBadge } from "../event-types";
import Link from "next/link";
import { useState } from "react";
import {
  History,
  Layers,
  Plus,
  Stethoscope,
  HeartPulse,
  Pill,
  Syringe,
  TestTube2,
  Bandage,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import { TrackerFiltersBar, useTrackerQuery } from "./filters";
import { useTrackerResults } from "./use-results";
import { useProfiles } from "../app-shell";
import { ProfileIdentity } from "../ui/profile-avatar";
import { LoadingState, ErrorState } from "../ui/feedback";
import { TagPill } from "../ui/labels";
import { formatAccessibleDate, ordinalDay } from "@/lib/date-format";
import { CustomSelect } from "../ui/pickers";
import { ProfileColumns } from "../ui/profile-columns";
import {
  groupTimeline,
  type TimelineItem,
  type TimelineResults,
} from "@/lib/timeline";
const icons: Record<string, typeof Activity> = {
  "Doctor Visit": Stethoscope,
  Illness: HeartPulse,
  Symptom: Activity,
  Medication: Pill,
  Vaccination: Syringe,
  "Examination / Test": TestTube2,
  Injury: Bandage,
  Other: Activity,
};
function TimelineEntry({ item }: { item: TimelineItem }) {
  const { profiles } = useProfiles();
  const profile = profiles.find((p) => p.id === item.profile_id);
  const episode = item.entry_type === "episode";
  const Icon = episode ? Layers : (icons[item.event_type] ?? Activity);
  return (
    <li className="timeline-item">
      <span className="timeline-marker" aria-hidden>
        <Icon size={18} />
      </span>
      <Link
        className="card timeline-entry"
        href={
          episode
            ? `/episodes/${item.event_id}`
            : `/events/${item.event_id}`
        }
      >
        <div className="timeline-entry-top">
          <ProfileIdentity
            className="timeline-person"
            name={profile?.name ?? "Health profile"}
            avatar={profile?.avatar}
          />
          <time dateTime={item.occurred_at}>
            {episode
              ? "Episode"
              : new Date(item.occurred_at).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
          </time>
        </div>
        <div className="timeline-kind">
          <EventTypeBadge type={item.event_type} />
        </div>
        <h3>
          {item.title}
          <ArrowUpRight size={17} aria-hidden />
        </h3>
        {item.summary && (
          <p className="timeline-summary">
            {item.summary}
            {item.summary.length === 320 ? "…" : ""}
          </p>
        )}
        {item.tags.length > 0 && (
          <div className="event-labels">
            {item.tags.map((tag) => (
              <TagPill name={tag.name} key={tag.id} />
            ))}
          </div>
        )}
      </Link>
    </li>
  );
}
function TimelineGroups({ items }: { items: TimelineItem[] }) {
  return (
    <div className="health-timeline">
      {groupTimeline(items).map((year) => (
        <section className="timeline-year" key={year.year} aria-label={String(year.year)}>
          <h2 className="timeline-year-heading">{year.year}</h2>
          {year.months.map((month) => (
            <section className="timeline-month" key={month.key}>
              <h3 className="timeline-month-heading">{month.label} <span>{year.year}</span></h3>
              {month.days.map((day) => (
                <div className="timeline-day" key={day.key}>
                  <div className="timeline-day-label">
                    <time dateTime={day.date.toISOString()}>
                      <strong>{ordinalDay(day.date.getDate())}</strong>
                      <span>{day.date.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    </time>
                    <span className="sr-only">{formatAccessibleDate(day.date)}</span>
                  </div>
                  <ol className="timeline-day-items">
                    {day.items.map((item) => <TimelineEntry key={item.id} item={item} />)}
                  </ol>
                </div>
              ))}
            </section>
          ))}
        </section>
      ))}
    </div>
  );
}
function TimelineContent({
  query,
  entryType,
  error,
}: {
  query: Record<string, unknown>;
  entryType: string;
  error?: string;
}) {
  const [page, setPage] = useState(1);
  const {
    data,
    error: loadError,
    retry,
  } = useTrackerResults<TimelineResults>(
    "/api/v1/events/timeline",
    { filters: { ...query, page, page_size: 30 }, entry_type: entryType },
    { error },
  );
  if (loadError) return <ErrorState message={loadError} retry={retry} />;
  if (!data) return <LoadingState label="Loading timeline…" />;
  if (!data.items.length)
    return (
      <section className="card event-state">
        <span className="state-symbol">
          <History size={25} />
        </span>
        <h2>No events found</h2>
        <p>No entries match the current filters.</p>
        <Link className="button" href="/events/new">
          <Plus size={17} />
          Add event
        </Link>
        {page > 1 && (
          <button className="text-link" onClick={() => setPage(1)}>
            Return to newest entries
          </button>
        )}
      </section>
    );
  return (
    <>
      <div className="timeline-count" role="status">
        {data.total} {data.total === 1 ? "entry" : "entries"} · Newest first ·
        Dates in your local timezone
      </div>
      <ProfileColumns items={data.items} profileId={(item) => item.profile_id} noun="entry" className="timeline-profile-columns">
        {(items) => <TimelineGroups items={items} />}
      </ProfileColumns>
      <div className="card events-pagination">
        <span>
          Page {page} of {Math.max(1, Math.ceil(data.total / 30))}
        </span>
        <div>
          <button
            className="button secondary-button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Newer entries
          </button>
          <button
            className="button secondary-button"
            disabled={page * 30 >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Earlier entries
          </button>
        </div>
      </div>
    </>
  );
}
export function HealthTimeline() {
  const [entryType, setEntryType] = useState("all");
  const { query, error } = useTrackerQuery();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Timeline</h1>
        </div>
        <Link className="button" href="/events/new">
          <Plus size={18} />
          Add event
        </Link>
      </div>
      <TrackerFiltersBar
        extraFilterCount={entryType === "all" ? 0 : 1}
        onClearExtra={() => setEntryType("all")}
        primaryFilter={
          <div className="filter-select">
            <label htmlFor="timeline-entry-type">Entry type</label>
            <CustomSelect
              id="timeline-entry-type"
              ariaLabel="Entry type"
              value={entryType}
              onChange={setEntryType}
              options={[
                { value: "all", label: "All entries" },
                { value: "episode", label: "Health episodes" },
                { value: "event", label: "Health events" },
              ]}
            />
          </div>
        }
      />
      <TimelineContent
        key={JSON.stringify([query, entryType, error])}
        query={query}
        entryType={entryType}
        error={error}
      />
    </>
  );
}
