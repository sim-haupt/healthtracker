"use client";
import { useProviders } from "../providers-context";
import { useEventTypes } from "../event-types";
import { emptyFilters, filterQuery, type TrackerFilters } from "@/lib/tracker";
import { useProfiles } from "../app-shell";
import { useTracker } from "./context";
import type { ReactNode } from "react";
import { TagFilterPills } from "../ui/labels";
import { CustomSelect, DatePicker } from "../ui/pickers";
import { FilterBar } from "../ui/filter-bar";
export function useTrackerQuery() {
  const { filters, search } = useTracker();
  const { activeProfile } = useProfiles();
  return filterQuery({ ...filters, q: search }, activeProfile?.id);
}
export function TrackerFiltersBar({
  primaryFilter,
  extraFilterCount = 0,
  onClearExtra,
}: {
  primaryFilter?: ReactNode;
  extraFilterCount?: number;
  onClearExtra?: () => void;
} = {}) {
  const doctors = useProviders();
  const typeOptions = useEventTypes();
  const {
    filters,
    setFilters,
    tags,
    labelError,
    labelsLoading,
    reloadLabels,
    search,
  } = useTracker();
  const update = <K extends keyof TrackerFilters>(
    key: K,
    value: TrackerFilters[K],
  ) => setFilters((previous) => ({ ...previous, [key]: value }));
  const count =
    Number(!!filters.provider_id) +
    Number(!!filters.event_type) +
    filters.tag_ids.length +
    Number(!!filters.date_from) +
    Number(!!filters.date_to) +
    Number(!!filters.q) +
    extraFilterCount;
  const error = filterQuery(filters).error;
  return (
    <FilterBar
      label="Filter health events"
      count={count}
      onClear={() => {
        setFilters(emptyFilters);
        onClearExtra?.();
      }}
      primary={
        <>
          <div className="filter-select">
            <label htmlFor="filter-type">Event type</label>
            <CustomSelect
              id="filter-type"
              ariaLabel="Event type"
              value={filters.event_type}
              onChange={(value) => update("event_type", value)}
              options={[
                { value: "", label: "All event types" },
                ...typeOptions.types.map((type) => ({
                  value: type.key,
                  label: `${type.name}${type.archived ? " (removed)" : ""}`,
                })),
              ]}
            />
          </div>
          {primaryFilter}
        </>
      }
      search={{
        id: "health-search",
        label: "Search health events",
        value: filters.q,
        placeholder: "Search events, symptoms, appointments…",
        onChange: (value) => update("q", value),
      }}
      advanced={
        <div className="advanced-filters">
          <div className="filter-select">
            <label htmlFor="filter-doctor">Doctor</label>
            <CustomSelect
              id="filter-doctor"
              value={filters.provider_id ?? ""}
              onChange={(value) => update("provider_id", value)}
              disabled={doctors.loading}
              options={[
                { value: "", label: "All doctors" },
                ...doctors.providers.map((provider) => ({
                  value: provider.id,
                  label: provider.name,
                })),
              ]}
            />
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
            <label htmlFor="filter-from">From</label>
            <DatePicker
              id="filter-from"
              value={filters.date_from}
              optional
              ariaLabel="From date"
              placeholder="From date"
              onChange={(value) => update("date_from", value)}
            />
          </div>
          <div className="filter-select">
            <label htmlFor="filter-to">Through</label>
            <DatePicker
              id="filter-to"
              value={filters.date_to}
              optional
              min={filters.date_from}
              ariaLabel="To date"
              placeholder="To date"
              onChange={(value) => update("date_to", value)}
            />
          </div>
          <TagFilterPills
            legend="Tags"
            items={tags}
            selected={filters.tag_ids}
            onChange={(ids) => update("tag_ids", ids.slice(0, 20))}
            emptyText={labelsLoading ? undefined : "No tags are available."}
            searchable
            maxVisible={12}
          />
        </div>
      }
    >
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {labelError && (
        <p role="alert" className="field-error">
          {labelError}{" "}
          <button className="text-link" onClick={reloadLabels}>
            Retry
          </button>
        </p>
      )}
      {filters.q !== search && (
        <p role="status" className="muted">
          Updating search…
        </p>
      )}
    </FilterBar>
  );
}
