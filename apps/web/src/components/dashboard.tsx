"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  History,
  Layers,
  Plus,
} from "lucide-react";
import { formatDate } from "@/lib/date-format";
import { eventDisplayTitle, type EventSummary } from "@/lib/events";
import type { DashboardResult } from "@/lib/tracker";
import { useProfiles } from "./app-shell";
import { EventTypeBadge } from "./event-types";
import { useTrackerResults } from "./tracker/use-results";
import { ErrorState, LoadingState } from "./ui/feedback";
import { ProfileAvatar } from "./ui/profile-avatar";

function DashboardCard({
  title,
  icon,
  children,
  href,
  linkLabel,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  href: string;
  linkLabel: string;
}) {
  return (
    <section className="dashboard-overview-card">
      <h3>
        <span aria-hidden="true">{icon}</span>
        {title}
      </h3>
      <div className="dashboard-card-content">{children}</div>
      <Link className="dashboard-card-link" href={href}>
        {linkLabel} <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}

function DashboardEventList({
  events,
  empty,
}: {
  events: EventSummary[];
  empty: string;
}) {
  if (!events.length) return <p className="dashboard-card-empty">{empty}</p>;
  return (
    <ul className="dashboard-event-list">
      {events.slice(0, 3).map((event) => (
        <li key={event.id}>
          <Link href={"/events/" + event.id}>
            <EventTypeBadge type={event.event_type} />
            <span className="dashboard-item-copy">
              <strong>{eventDisplayTitle(event)}</strong>
              <time dateTime={event.event_date}>
                {formatDate(event.event_date)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ActiveEpisodes({
  episodes = [],
}: {
  episodes?: DashboardResult["profiles"][number]["active_episodes"];
}) {
  if (!episodes.length)
    return <p className="dashboard-card-empty">No active episodes.</p>;

  return (
    <ul className="dashboard-episode-list">
      {episodes.slice(0, 3).map((episode) => (
        <li key={episode.id}>
          <Link href={"/episodes/" + episode.id}>
            <strong>{episode.title}</strong>
            <span>
              Since{" "}
              <time dateTime={episode.start_date}>
                {formatDate(episode.start_date)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ReminderList({
  reminders = [],
}: {
  reminders?: NonNullable<DashboardResult["profiles"][number]["reminders"]>;
}) {
  if (!reminders.length)
    return <p className="dashboard-card-empty">No reminders.</p>;
  return (
    <ul className="dashboard-reminder-list">
      {reminders.slice(0, 3).map((reminder) => (
        <li key={reminder.id}>
          <Link
            href={
              reminder.source_event_id
                ? "/events/" + reminder.source_event_id
                : "/reminders"
            }
          >
            <span className="dashboard-reminder-icon" aria-hidden="true">
              <Bell size={15} />
            </span>
            <span className="dashboard-item-copy">
              <strong>{reminder.title}</strong>
              <span>
                <time dateTime={reminder.due_date}>
                  {formatDate(reminder.due_date)}
                </time>
                {reminder.recurrence !== "none"
                  ? ` · ${reminder.recurrence}`
                  : ""}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Dashboard() {
  const { profiles, activeProfile } = useProfiles();
  const query = activeProfile ? { profile_id: activeProfile.id } : {};
  const { data, error, retry } = useTrackerResults<DashboardResult>(
    "/api/v1/events/dashboard",
    query,
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
        </div>
        <Link className="button" href="/events/new">
          <Plus size={18} /> Add event
        </Link>
      </div>
      {error ? (
        <ErrorState message={error} retry={retry} />
      ) : !data ? (
        <LoadingState label="Loading overview…" />
      ) : (
        <div className="profile-dashboard-list">
          {data.profiles.map((group) => {
            const profile = profiles.find(
              (item) => item.id === group.profile_id,
            );
            return (
              <section className="profile-dashboard" key={group.profile_id}>
                <header className="profile-dashboard-heading">
                  <ProfileAvatar
                    name={profile?.name ?? "Health profile"}
                    avatar={profile?.avatar}
                  />
                  <h2>{profile?.name ?? "Health profile"}</h2>
                  <Link href="/timeline" className="text-link">
                    View timeline <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </header>
                <div className="profile-dashboard-grid">
                  <DashboardCard
                    title="Active episodes"
                    icon={<Layers size={17} />}
                    href="/episodes"
                    linkLabel="View episodes"
                  >
                    <ActiveEpisodes episodes={group.active_episodes} />
                  </DashboardCard>
                  <DashboardCard
                    title="Upcoming events"
                    icon={<CalendarDays size={17} />}
                    href="/calendar"
                    linkLabel="View calendar"
                  >
                    <DashboardEventList
                      events={group.upcoming}
                      empty="No upcoming events."
                    />
                  </DashboardCard>
                  <DashboardCard
                    title="Recent events"
                    icon={<History size={17} />}
                    href="/timeline"
                    linkLabel="View all events"
                  >
                    <DashboardEventList
                      events={group.recent}
                      empty="No recent events."
                    />
                  </DashboardCard>
                  <DashboardCard
                    title="Reminders"
                    icon={<Bell size={17} />}
                    href="/reminders"
                    linkLabel="View reminders"
                  >
                    <ReminderList reminders={group.reminders} />
                  </DashboardCard>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
