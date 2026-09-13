"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Syringe,
  Plus,
  Paperclip,
  ArrowUpRight,
  SlidersHorizontal,
} from "lucide-react";
import { useProfiles } from "./app-shell";
import { useTracker } from "./tracker/context";
import { TagFilterPills } from "./ui/labels";
import { ProfileIdentity } from "./ui/profile-avatar";
import { useTrackerResults, type EventResults } from "./tracker/use-results";
import { LoadingState, ErrorState } from "./ui/feedback";
import { dateLabel } from "@/lib/events";
import { formatDate } from "@/lib/date-format";
function History({ query }: { query: Record<string, unknown> }) {
  const [page, setPage] = useState(1);
  const { profiles } = useProfiles();
  const { data, error, retry } = useTrackerResults<EventResults>(
    "/api/v1/events/search",
    { ...query, event_type: "Vaccination", page, page_size: 30 },
  );
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!data) return <LoadingState label="Loading vaccination history…" />;
  if (!data.events.length)
    return (
      <section className="card event-state">
        <span className="state-symbol">
          <Syringe size={26} />
        </span>
        <h2>No vaccinations recorded</h2>

        <Link className="button" href="/events/new?type=Vaccination">
          Record a vaccination
        </Link>
      </section>
    );
  return (
    <>
      <p className="muted vaccination-count">
        {data.total} vaccination {data.total === 1 ? "entry" : "entries"} ·
        Newest first
      </p>
      <ol className="vaccination-history">
        {data.events.map((event) => (
          <li className="card vaccination-record" key={event.id}>
            <span className="state-symbol">
              <Syringe size={23} />
            </span>
            <div>
              <ProfileIdentity
                className="eyebrow"
                name={
                  profiles.find((p) => p.id === event.profile_id)?.name ??
                  "Health profile"
                }
                avatar={profiles.find((p) => p.id === event.profile_id)?.avatar}
              />
              <Link href={`/events/${event.id}`}>
                <h2>
                  {event.title}
                  <ArrowUpRight size={17} />
                </h2>
              </Link>
              <p className="muted">
                Administered{" "}
                <time dateTime={event.event_date}>
                  {dateLabel(event.event_date)}
                </time>
              </p>
              <p>Disease: {event.disease || "Not recorded"}</p>
              {event.next_dose_date && (
                <p className="vaccination-next">
                  Next recommended dose:{" "}
                  <time dateTime={event.next_dose_date}>
                    {formatDate(event.next_dose_date)}
                  </time>
                </p>
              )}
              <Link
                className="text-link"
                href={`/events/${event.id}#attachments-title`}
              >
                <Paperclip size={15} />
                View or add attachments
              </Link>
            </div>
          </li>
        ))}
      </ol>
      <div className="card events-pagination">
        <span>
          Page {page} of {Math.ceil(data.total / 30)}
        </span>
        <div>
          <button
            className="button secondary-button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Newer
          </button>
          <button
            className="button secondary-button"
            disabled={page * 30 >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Older
          </button>
        </div>
      </div>
    </>
  );
}
export function Vaccinations() {
  const { activeProfile } = useProfiles();
  const { tags, labelsLoading, labelError, reloadLabels } = useTracker();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const query: Record<string, unknown> = {};
  if (activeProfile) query.profile_id = activeProfile.id;
  if (tagIds.length) query.tag_ids = tagIds;
  const count = tagIds.length;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Vaccinations</h1>
        </div>
        <Link className="button" href="/events/new?type=Vaccination">
          <Plus size={18} />
          Record vaccination
        </Link>
      </div>
      <section
        className="card tracker-filters"
        aria-label="Filter vaccinations"
      >
        <div className="filter-footer vaccination-filter-footer">
          <details className="filter-details">
            <summary>
              <SlidersHorizontal size={16} /> Filters{" "}
              {count > 0 && <span className="filter-count">{count}</span>}
            </summary>
            <div className="advanced-filters">
              <TagFilterPills
                legend="Tags"
                items={tags}
                selected={tagIds}
                onChange={(ids) => setTagIds(ids.slice(0, 20))}
                emptyText={labelsLoading ? undefined : "No tags are available."}
              />
            </div>
          </details>
          <button
            type="button"
            className="text-link"
            disabled={!count}
            onClick={() => {
              setTagIds([]);
            }}
          >
            Clear filters
          </button>
        </div>
        {labelError && (
          <p className="field-error" role="alert">
            {labelError}{" "}
            <button className="text-link" onClick={reloadLabels}>
              Retry
            </button>
          </p>
        )}
      </section>
      <History key={JSON.stringify(query)} query={query} />
    </>
  );
}
