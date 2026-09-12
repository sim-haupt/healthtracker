"use client";
import { useProviders } from "../providers-context";
import { Search, SlidersHorizontal } from "lucide-react";
import { eventTypes } from "@/lib/events";
import { emptyFilters, filterQuery, type TrackerFilters } from "@/lib/tracker";
import { useProfiles } from "../app-shell";
import { useTracker } from "./context";
export function useTrackerQuery() {
  const { filters, search } = useTracker();
  const { activeProfile } = useProfiles();
  return filterQuery({ ...filters, q: search }, activeProfile?.id);
}
export function TrackerFiltersBar() {
  const doctors = useProviders();
  const {
    filters,
    setFilters,
    categories,
    tags,
    labelError,
    labelsLoading,
    reloadLabels,
    search,
  } = useTracker();
  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const update = <K extends keyof TrackerFilters>(
    key: K,
    value: TrackerFilters[K],
  ) => setFilters((previous) => ({ ...previous, [key]: value }));
  const count =
    Number(!!filters.provider_id) +
    Number(!!activeProfile) +
    Number(!!filters.event_type) +
    Number(!!filters.category_id) +
    filters.tag_ids.length +
    Number(!!filters.date_from) +
    Number(!!filters.date_to) +
    Number(!!filters.q);
  const error = filterQuery(filters).error;
  return (
    <section className="card tracker-filters" aria-label="Filter health events">
      <div className="filter-top">
        <div className="search-field">
          <Search size={18} />
          <label className="sr-only" htmlFor="health-search">
            Search health events
          </label>
          <input
            id="health-search"
            type="search"
            value={filters.q}
            maxLength={200}
            placeholder="Search health events…"
            onChange={(e) => update("q", e.target.value)}
          />
        </div>
        <div className="filter-select">
          <label htmlFor="filter-profile">Profile</label>
          <select
            id="filter-profile"
            value={activeProfile?.id ?? ""}
            onChange={(e) => setActiveProfile(e.target.value)}
          >
            <option value="">Both profiles</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-select">
          <label htmlFor="filter-type">Event type</label>
          <select
            id="filter-type"
            value={filters.event_type}
            onChange={(e) => update("event_type", e.target.value)}
          >
            <option value="">All types</option>
            {eventTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="filter-footer">
        <details className="filter-details">
          <summary>
            <SlidersHorizontal size={16} /> Filters{" "}
            {count > 0 && <span className="filter-count">{count}</span>}
          </summary>
          <div className="advanced-filters">
            <div className="filter-select">
              <label htmlFor="filter-doctor">Doctor</label>
              <select
                id="filter-doctor"
                value={filters.provider_id ?? ""}
                onChange={(e) => update("provider_id", e.target.value)}
                disabled={doctors.loading}
              >
                <option value="">All doctors</option>
                {doctors.providers.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {doctors.error && (
                <p className="field-error" role="alert">
                  {doctors.error}{" "}
                  <button onClick={doctors.reload} className="text-link">
                    Retry
                  </button>
                </p>
              )}
            </div>
            <div className="filter-select">
              <label htmlFor="filter-category">Category</label>
              <select
                id="filter-category"
                value={filters.category_id}
                onChange={(e) => update("category_id", e.target.value)}
                disabled={labelsLoading}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-select">
              <label htmlFor="filter-from">From</label>
              <input
                id="filter-from"
                type="date"
                value={filters.date_from}
                onChange={(e) => update("date_from", e.target.value)}
              />
            </div>
            <div className="filter-select">
              <label htmlFor="filter-to">Through</label>
              <input
                id="filter-to"
                type="date"
                value={filters.date_to}
                onChange={(e) => update("date_to", e.target.value)}
              />
            </div>
            <fieldset className="filter-tags">
              <legend>
                Tags <span>Matches all selected tags</span>
              </legend>
              <div className="tag-options">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className={`tag-option ${filters.tag_ids.includes(tag.id) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={filters.tag_ids.includes(tag.id)}
                      disabled={
                        !filters.tag_ids.includes(tag.id) &&
                        filters.tag_ids.length >= 20
                      }
                      onChange={(e) =>
                        update(
                          "tag_ids",
                          e.target.checked
                            ? [...filters.tag_ids, tag.id]
                            : filters.tag_ids.filter((id) => id !== tag.id),
                        )
                      }
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
              {!tags.length && !labelsLoading && (
                <p className="muted">
                  Create tags when adding or editing an event.
                </p>
              )}
            </fieldset>
          </div>
        </details>
        <button
          className="text-link"
          disabled={!count}
          onClick={() => {
            setFilters(emptyFilters);
            setActiveProfile("");
          }}
        >
          Clear filters
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {labelError && (
        <p role="alert" className="field-error">
          {labelError}{" "}
          <button className="text-link" onClick={reloadLabels}>
            Retry labels
          </button>
        </p>
      )}
      {filters.q !== search && (
        <p role="status" className="muted">
          Updating search…
        </p>
      )}
    </section>
  );
}
