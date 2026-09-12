"use client";
import { EpisodeOverview } from "./episodes";
import { ProfileAvatar } from "./ui/profile-avatar";
import { LoadingState, ErrorState } from "./ui/feedback";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useProfiles } from "./app-shell";

import { useTrackerResults } from "./tracker/use-results";
import { EventRows } from "./tracker/event-rows";
import type { DashboardResult } from "@/lib/tracker";
export function Dashboard() {
  const { profiles, activeProfile, setActiveProfile } = useProfiles();
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
        <div className="profile-overviews">
          {data.profiles.map((group) => (
            <section className="card profile-overview" key={group.profile_id}>
              <header className="profile-overview-heading">
                <ProfileAvatar
                  name={
                    profiles.find((p) => p.id === group.profile_id)?.name ??
                    "Profile"
                  }
                  avatar={
                    profiles.find((p) => p.id === group.profile_id)?.avatar
                  }
                />
                <div>
                  <h2>
                    {profiles.find((p) => p.id === group.profile_id)?.name ??
                      "Health profile"}
                  </h2>
                </div>
                <Link
                  href="/events"
                  onClick={() => setActiveProfile(group.profile_id)}
                  className="text-link"
                >
                  View events
                </Link>
              </header>
              {!!group.vaccination_doses?.length && (
                <section className="dashboard-doses">
                  <h3>Upcoming vaccination doses</h3>

                  <ul>
                    {group.vaccination_doses.map((dose) => (
                      <li key={dose.id}>
                        <Link href={`/events/${dose.id}`}>
                          <strong>{dose.title}</strong>
                          <span>
                            Next recommended dose ·{" "}
                            <time dateTime={dose.date}>
                              {new Date(
                                dose.date + "T12:00:00",
                              ).toLocaleDateString(undefined, {
                                dateStyle: "medium",
                              })}
                            </time>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <EpisodeOverview profileId={group.profile_id} />
              <div className="overview-sections">
                {[
                  {
                    title: "Upcoming events",
                    events: group.upcoming,
                    empty: "No upcoming events.",
                  },
                  {
                    title: "Recent events",
                    events: group.recent,
                    empty: "No recent events.",
                  },
                ].map((section) => (
                  <section className="overview-section" key={section.title}>
                    <h3>{section.title}</h3>
                    {section.events.length ? (
                      <EventRows events={section.events} compact />
                    ) : (
                      <p className="overview-empty">{section.empty}</p>
                    )}
                  </section>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
