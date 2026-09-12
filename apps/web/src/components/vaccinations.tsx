"use client";
import Link from "next/link";
import { useState } from "react";
import { Syringe, Plus, Paperclip, ArrowUpRight } from "lucide-react";
import { useProfiles } from "./app-shell";
import { useTrackerResults, type EventResults } from "./tracker/use-results";
import { LoadingState, ErrorState } from "./ui/feedback";
import { dateLabel } from "@/lib/events";
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
              <p className="eyebrow">
                {profiles.find((p) => p.id === event.profile_id)?.name ??
                  "Health profile"}
              </p>
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
                    {new Date(
                      event.next_dose_date + "T12:00:00",
                    ).toLocaleDateString(undefined, { dateStyle: "medium" })}
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
  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const query = activeProfile ? { profile_id: activeProfile.id } : {};
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
      <section className="card vaccination-intro">
        <div className="filter-select">
          <label htmlFor="vaccination-profile">Health profile</label>
          <select
            id="vaccination-profile"
            value={activeProfile?.id ?? ""}
            onChange={(e) => setActiveProfile(e.target.value)}
          >
            <option value="">Both profiles</option>
            {profiles.map((profile) => (
              <option value={profile.id} key={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>
      </section>
      <History key={JSON.stringify(query)} query={query} />
    </>
  );
}
