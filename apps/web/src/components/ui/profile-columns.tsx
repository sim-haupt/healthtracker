"use client";

import type { ReactNode } from "react";
import { useProfiles, type HealthProfile } from "../app-shell";
import { ProfileIdentity } from "./profile-avatar";

export function ProfileColumns<T>({
  items,
  profileId,
  noun,
  className = "",
  children,
}: {
  items: T[];
  profileId: (item: T) => string;
  noun: string;
  className?: string;
  children: (items: T[], profile: HealthProfile) => ReactNode;
}) {
  const { profiles, activeProfile } = useProfiles();
  if (activeProfile) return <>{children(items, activeProfile)}</>;
  return (
    <div className={`profile-record-columns ${className}`.trim()}>
      {profiles.map((profile) => {
        const matching = items.filter((item) => profileId(item) === profile.id);
        const plural = noun.endsWith("y") ? `${noun.slice(0, -1)}ies` : `${noun}s`;
        return (
          <section className="profile-record-column" key={profile.id}>
            <header className="profile-record-heading">
              <h2><ProfileIdentity name={profile.name} avatar={profile.avatar} /></h2>
              <span>{matching.length} {matching.length === 1 ? noun : plural}</span>
            </header>
            {matching.length ? children(matching, profile) : (
              <div className="profile-record-empty">No {plural}.</div>
            )}
          </section>
        );
      })}
    </div>
  );
}
