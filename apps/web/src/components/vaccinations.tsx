"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Syringe,
  Plus,
  ArrowUpRight,
  ChevronDown,
  Layers3,
} from "lucide-react";
import { useProfiles } from "./app-shell";
import { useTracker } from "./tracker/context";
import { TagFilterPills } from "./ui/labels";
import { useTrackerResults, type EventResults } from "./tracker/use-results";
import { LoadingState, ErrorState } from "./ui/feedback";
import { eventDisplayTitle, type EventSummary } from "@/lib/events";
import { formatDate } from "@/lib/date-format";
import { FilterBar } from "./ui/filter-bar";
import { ProfileColumns } from "./ui/profile-columns";

type VaccinationRow =
  | { kind: "event"; event: EventSummary }
  | {
      kind: "series";
      key: string;
      disease: string;
      events: EventSummary[];
    };

function doseSeriesKey(event: EventSummary) {
  if (
    !event.disease?.trim() ||
    (event.dose_number == null && event.dose_total == null)
  )
    return "";
  return event.disease.normalize("NFKC").trim().toLocaleLowerCase();
}

function vaccinationRows(events: EventSummary[], grouped: boolean) {
  if (!grouped)
    return events.map((event) => ({ kind: "event", event }) as const);

  const series = new Map<string, EventSummary[]>();
  for (const event of events) {
    const key = doseSeriesKey(event);
    if (key) series.set(key, [...(series.get(key) ?? []), event]);
  }

  const emitted = new Set<string>();
  const rows: VaccinationRow[] = [];
  for (const event of events) {
    const key = doseSeriesKey(event);
    const matches = key ? (series.get(key) ?? []) : [];
    if (matches.length < 2) {
      rows.push({ kind: "event", event });
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    rows.push({
      kind: "series",
      key,
      disease: event.disease!.trim(),
      events: [...matches].sort((a, b) =>
        a.event_date.localeCompare(b.event_date),
      ),
    });
  }
  return rows;
}

function VaccinationRecord({
  event,
  inSeries = false,
}: {
  event: EventSummary;
  inSeries?: boolean;
}) {
  return (
    <li
      className={`card vaccination-record${inSeries ? " vaccination-series-record" : ""}`}
    >
      <Link href={`/events/${event.id}`} className="vaccination-card-link">
        <span className="state-symbol">
          <Syringe size={23} />
        </span>
        <div>
          <div className="vaccination-card-meta">
            <time dateTime={event.event_date}>
              {formatDate(event.event_date)}
            </time>
          </div>
          <h2>
            {inSeries ? event.title || event.disease : eventDisplayTitle(event)}
            <ArrowUpRight size={17} />
          </h2>
          {(event.dose_number || event.dose_total) && (
            <span
              className={`vaccination-dose-pill ${event.dose_number && event.dose_total && event.dose_number >= event.dose_total ? "completed" : "pending"}`}
            >
              Dose {event.dose_number ?? "–"}/{event.dose_total ?? "–"}
            </span>
          )}
          {event.next_dose_date && (
            <p className="vaccination-next">
              Next dose:{" "}
              <time dateTime={event.next_dose_date}>
                {formatDate(event.next_dose_date)}
              </time>
            </p>
          )}
          {event.needs_renewal && (
            <p className="vaccination-next">
              Renewal date:{" "}
              {event.renewal_date ? (
                <time dateTime={event.renewal_date}>
                  {formatDate(event.renewal_date)}
                </time>
              ) : (
                "Not set"
              )}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

function VaccinationSeries({
  row,
}: {
  row: Extract<VaccinationRow, { kind: "series" }>;
}) {
  const first = row.events[0]!;
  const last = row.events[row.events.length - 1]!;
  const dateRange =
    first.event_date === last.event_date
      ? formatDate(first.event_date)
      : `${formatDate(first.event_date)} – ${formatDate(last.event_date)}`;
  return (
    <li className="card vaccination-series">
      <details>
        <summary>
          <span className="state-symbol">
            <Syringe size={23} />
          </span>
          <span className="vaccination-series-copy">
            <span>{dateRange}</span>
            <strong>{row.disease}</strong>
            <small>
              {row.events.length} vaccination
              {row.events.length === 1 ? "" : "s"}
            </small>
          </span>
          <ChevronDown className="vaccination-series-chevron" size={19} />
        </summary>
        <ol className="vaccination-series-list">
          {row.events.map((event) => (
            <VaccinationRecord event={event} inSeries key={event.id} />
          ))}
        </ol>
      </details>
    </li>
  );
}

function History({
  query,
  groupDoses,
  onGroupDosesChange,
}: {
  query: Record<string, unknown>;
  groupDoses: boolean;
  onGroupDosesChange: (value: boolean) => void;
}) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [groupDoses]);
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
      <div className="vaccination-list-toolbar">
        <p className="muted vaccination-count">
          {data.total} vaccination {data.total === 1 ? "entry" : "entries"} ·
          Newest first
        </p>
        <button
          type="button"
          className="button secondary-button vaccination-group-toggle"
          aria-pressed={groupDoses}
          onClick={() => onGroupDosesChange(!groupDoses)}
        >
          <Layers3 size={16} />
          Group dose series
        </button>
      </div>
      <ProfileColumns
        items={data.events}
        profileId={(event) => event.profile_id}
        noun="vaccination"
      >
        {(vaccinations) => (
          <ol className="vaccination-history">
            {vaccinationRows(vaccinations, groupDoses).map((row) =>
              row.kind === "series" ? (
                <VaccinationSeries row={row} key={`series-${row.key}`} />
              ) : (
                <VaccinationRecord event={row.event} key={row.event.id} />
              ),
            )}
          </ol>
        )}
      </ProfileColumns>
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
  const { activeProfile } = useProfiles();
  const { tags, labelsLoading, labelError, reloadLabels } = useTracker();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [groupDoses, setGroupDoses] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuerySearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const query: Record<string, unknown> = {};
  if (activeProfile) query.profile_id = activeProfile.id;
  if (tagIds.length) query.tag_ids = tagIds;
  if (querySearch) query.q = querySearch;
  const count = tagIds.length + Number(!!search);
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
      <FilterBar
        label="Filter vaccinations"
        count={count}
        onClear={() => {
          setTagIds([]);
          setSearch("");
        }}
        search={{
          id: "vaccination-search",
          label: "Search vaccinations",
          value: search,
          placeholder: "Search vaccinations…",
          onChange: setSearch,
        }}
        advanced={
          <div className="advanced-filters">
            <TagFilterPills
              legend="Tags"
              items={tags}
              selected={tagIds}
              onChange={(ids) => setTagIds(ids.slice(0, 20))}
              emptyText={labelsLoading ? undefined : "No tags are available."}
              searchable
              maxVisible={12}
            />
          </div>
        }
      >
        {labelError && (
          <p className="field-error" role="alert">
            {labelError}{" "}
            <button className="text-link" onClick={reloadLabels}>
              Retry
            </button>
          </p>
        )}
        {search !== querySearch && (
          <p className="muted" role="status">
            Updating search…
          </p>
        )}
      </FilterBar>
      <History
        key={JSON.stringify(query)}
        query={query}
        groupDoses={groupDoses}
        onGroupDosesChange={setGroupDoses}
      />
    </>
  );
}
