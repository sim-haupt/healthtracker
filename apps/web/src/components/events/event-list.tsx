"use client";
import { LoadingState } from "../ui/feedback";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { TrackerFiltersBar, useTrackerQuery } from "../tracker/filters";
import { useTrackerResults, type EventResults } from "../tracker/use-results";
import { EventRows } from "../tracker/event-rows";
export function EventList() {
  const { query, error: filterError } = useTrackerQuery();
  const filterKey = JSON.stringify(query);
  const [paging, setPaging] = useState({ key: "", page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const setPage = (value: number) => setPaging({ key: filterKey, page: value });
  const { data, error, retry } = useTrackerResults<EventResults>(
    "/api/v1/events/search",
    { ...query, page, page_size: 20 },
    { error: filterError },
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Events</h1>
        </div>
        <Link className="button" href="/events/new">
          <Plus size={18} /> Add event
        </Link>
      </div>
      <TrackerFiltersBar />
      <section className="card events-card">
        {error ? (
          <div className="event-state" role="alert">
            <p>{error}</p>
            <button className="button secondary-button" onClick={retry}>
              Try again
            </button>
          </div>
        ) : !data ? (
          <LoadingState label="Loading events…" />
        ) : !data.events.length ? (
          <div className="event-state">
            <h2>No events to show</h2>
            <p>No events match the current filters.</p>
            <Link className="button" href="/events/new">
              Add event
            </Link>
            {page > 1 && (
              <button className="text-link" onClick={() => setPage(1)}>
                Return to first page
              </button>
            )}
          </div>
        ) : (
          <>
            <EventRows events={data.events} />
            <div className="events-pagination">
              <span>
                {data.total} {data.total === 1 ? "event" : "events"} · Page{" "}
                {page} of {Math.ceil(data.total / 20)}
              </span>
              <div>
                <button
                  className="button secondary-button"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  className="button secondary-button"
                  disabled={page * 20 >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
