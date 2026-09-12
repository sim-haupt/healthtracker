import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { dateLabel, type EventSummary } from "@/lib/events";
import { useProfiles } from "../app-shell";
export function EventRows({
  events,
  compact = false,
}: {
  events: EventSummary[];
  compact?: boolean;
}) {
  const { profiles } = useProfiles();
  return (
    <ul className={`event-list ${compact ? "compact-events" : ""}`}>
      {events.map((event) => (
        <li key={event.id}>
          <Link href={`/events/${event.id}`} className="event-row">
            <div className="event-row-content">
              <span className="event-type-label">
                {event.event_type} ·{" "}
                {profiles.find((p) => p.id === event.profile_id)?.name ??
                  "Health profile"}
              </span>
              <h3>{event.title}</h3>
              <time dateTime={event.event_date}>
                {dateLabel(event.event_date)}
              </time>
              {!compact && (
                <div className="event-labels">
                  {event.category && (
                    <span className="category-pill">{event.category.name}</span>
                  )}
                  {event.tags?.map((tag) => (
                    <span className="tag-pill" key={tag.id}>
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <ArrowUpRight size={18} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
