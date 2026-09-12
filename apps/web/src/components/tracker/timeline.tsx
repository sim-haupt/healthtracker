"use client";
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
  FileText,
  ImageIcon,
  ArrowUpRight,
} from "lucide-react";
import { TrackerFiltersBar, useTrackerQuery } from "./filters";
import { useTrackerResults } from "./use-results";
import { useProfiles } from "../app-shell";
import { ProfileAvatar } from "../ui/profile-avatar";
import { LoadingState, ErrorState } from "../ui/feedback";
import {
  groupTimeline,
  timelineYearQuery,
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
  const document = item.entry_type === "document";
  const episode = item.entry_type === "episode";
  const Icon = episode
    ? Layers
    : document
      ? item.mime_type?.startsWith("image/")
        ? ImageIcon
        : FileText
      : (icons[item.event_type] ?? Activity);
  return (
    <li className={`timeline-item ${document ? "timeline-document" : ""}`}>
      <span className="timeline-marker" aria-hidden>
        <Icon size={18} />
      </span>
      <Link
        className="card timeline-entry"
        href={
          episode
            ? `/episodes/${item.event_id}`
            : `/events/${item.event_id}${document ? "#attachments-title" : ""}`
        }
      >
        <div className="timeline-entry-top">
          <span className="timeline-person">
            <ProfileAvatar
              name={profile?.name ?? "Health profile"}
              avatar={profile?.avatar}
            />
            {profile?.name ?? "Health profile"}
          </span>
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
          {document ? "Uploaded document" : ""}
          {document ? " · " : ""}
          {item.event_type}
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
        {document && (
          <p className="timeline-file">
            {item.title.split(".").pop()?.toUpperCase()} ·{" "}
            {((item.file_size ?? 0) / 1024 / 1024).toFixed(2)} MB · View
            attachments
          </p>
        )}
        {(item.category || item.tags.length > 0) && (
          <div className="event-labels">
            {item.category && (
              <span className="category-pill">{item.category.name}</span>
            )}
            {item.tags.map((tag) => (
              <span className="tag-pill" key={tag.id}>
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </Link>
    </li>
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
      <div className="health-timeline">
        {groupTimeline(data.items).map((year) => (
          <section
            className="timeline-year"
            key={year.year}
            aria-label={String(year.year)}
          >
            <h2 className="timeline-year-heading">{year.year}</h2>
            {year.months.map((month) => (
              <section className="timeline-month" key={month.key}>
                <h3 className="timeline-month-heading">
                  {month.label} <span>{year.year}</span>
                </h3>
                {month.days.map((day) => (
                  <div className="timeline-day" key={day.key}>
                    <div className="timeline-day-label">
                      <time dateTime={day.date.toISOString()}>
                        <strong>{day.date.getDate()}</strong>
                        <span>
                          {day.date.toLocaleDateString(undefined, {
                            weekday: "short",
                          })}
                        </span>
                      </time>
                      <span className="sr-only">
                        {day.date.toLocaleDateString(undefined, {
                          dateStyle: "full",
                        })}
                      </span>
                    </div>
                    <ol className="timeline-day-items">
                      {day.items.map((item) => (
                        <TimelineEntry key={item.id} item={item} />
                      ))}
                    </ol>
                  </div>
                ))}
              </section>
            ))}
          </section>
        ))}
      </div>
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
  const [year, setYear] = useState(""),
    [entryType, setEntryType] = useState("all");
  const { query, error } = useTrackerQuery();
  const selected = timelineYearQuery(query, year);
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
      <TrackerFiltersBar />
      <section className="timeline-controls" aria-label="Timeline filters">
        <div className="filter-select">
          <label htmlFor="timeline-year">Year</label>
          <input
            id="timeline-year"
            type="number"
            min="1000"
            max="9998"
            placeholder="All years"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div className="filter-select">
          <label htmlFor="timeline-entry-type">Show</label>
          <select
            id="timeline-entry-type"
            value={entryType}
            onChange={(e) => setEntryType(e.target.value)}
          >
            <option value="all">All entries</option>
            <option value="episode">Health episodes only</option>
            <option value="event">Health events only</option>
            <option value="document">Uploaded documents only</option>
          </select>
        </div>
        {(year || entryType !== "all") && (
          <button
            className="text-link"
            onClick={() => {
              setYear("");
              setEntryType("all");
            }}
          >
            Reset timeline options
          </button>
        )}
      </section>
      <TimelineContent
        key={JSON.stringify([selected.query, entryType, selected.error, error])}
        query={selected.query}
        entryType={entryType}
        error={error || selected.error}
      />
    </>
  );
}
