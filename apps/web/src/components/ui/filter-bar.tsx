"use client";

import { useState, type ReactNode } from "react";
import { FilterX, Search, SlidersHorizontal, X } from "lucide-react";
import { useProfiles } from "../app-shell";
import { ProfileAvatar } from "./profile-avatar";

type SearchControl = {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  maxLength?: number;
};

export function FilterBar({
  label,
  count,
  onClear,
  primary,
  search,
  advanced,
  children,
}: {
  label: string;
  count: number;
  onClear: () => void;
  primary?: ReactNode;
  search?: SearchControl;
  advanced?: ReactNode;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const { activeProfile, profiles, setActiveProfile } = useProfiles();
  const activeCount = count + Number(!!activeProfile);
  const clear = () => {
    setActiveProfile("");
    onClear();
  };
  return (
    <section className="filter-bar" aria-label={label}>
      <div className="filter-bar-row">
        <div
          className="filter-profile-selector"
          role="group"
          aria-label="Health profile"
        >
          <button
            type="button"
            className={!activeProfile ? "active" : ""}
            aria-pressed={!activeProfile}
            onClick={() => setActiveProfile("")}
          >
            All profiles
          </button>
          {profiles.map((profile) => (
            <button
              type="button"
              key={profile.id}
              className={activeProfile?.id === profile.id ? "active" : ""}
              aria-pressed={activeProfile?.id === profile.id}
              onClick={() => setActiveProfile(profile.id)}
            >
              <ProfileAvatar name={profile.name} avatar={profile.avatar} />
              <span>{profile.name}</span>
            </button>
          ))}
        </div>
        {primary && <span className="filter-bar-divider" aria-hidden="true" />}
        {primary && <div className="filter-bar-primary">{primary}</div>}
        {advanced && (
          <button
            type="button"
            className={`filter-bar-icon filter-bar-toggle ${expanded ? "active" : ""}`}
            aria-label={expanded ? "Hide filters" : "Show more filters"}
            title={expanded ? "Hide filters" : "Show more filters"}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
            {activeCount > 0 && (
              <span className="filter-bar-count">{activeCount}</span>
            )}
          </button>
        )}
        <button
          type="button"
          className="filter-bar-icon"
          disabled={!activeCount}
          aria-label="Clear filters"
          title="Clear filters"
          onClick={clear}
        >
          <FilterX size={17} aria-hidden="true" />
        </button>
        {search && (
          <div className="filter-bar-search">
            <Search size={16} aria-hidden="true" />
            <label className="sr-only" htmlFor={search.id}>
              {search.label}
            </label>
            <input
              id={search.id}
              type="search"
              maxLength={search.maxLength ?? 200}
              value={search.value}
              placeholder={search.placeholder}
              onChange={(event) => search.onChange(event.target.value)}
            />
            {search.value && (
              <button
                type="button"
                className="search-clear-button"
                aria-label={`Clear ${search.label}`}
                onClick={() => search.onChange("")}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
      {advanced && expanded && (
        <div className="filter-bar-advanced">{advanced}</div>
      )}
      {children && <div className="filter-bar-messages">{children}</div>}
    </section>
  );
}
