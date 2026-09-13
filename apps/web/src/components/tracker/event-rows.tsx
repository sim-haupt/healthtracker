import { EventTypeBadge } from "../event-types";
import { TagPill } from "../ui/labels";
import { ProfileIdentity } from "../ui/profile-avatar";
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
      {events.map((event) => {
        const profile = profiles.find((p) => p.id === event.profile_id);
        return (
          <li key={event.id}>
            <Link href={`/events/${event.id}`} className="event-row">
              <div className="event-row-content">
                <span className="event-type-label">
                  <EventTypeBadge type={event.event_type} />
                  <ProfileIdentity
                    name={profile?.name ?? "Health profile"}
                    avatar={profile?.avatar}
                  />
                </span>
                <h3>{event.title}</h3>
                <time dateTime={event.event_date}>
                  {dateLabel(event.event_date)}
                </time>
                {!compact && (
                  <div className="event-labels">
                    {event.tags?.map((tag) => (
                      <TagPill name={tag.name} key={tag.id} />
                    ))}
                  </div>
                )}
              </div>
              <ArrowUpRight size={18} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
