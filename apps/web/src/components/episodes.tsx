"use client";
import { EventTypeBadge } from "./event-types";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { dayKey } from "@/lib/tracker";
import { formatDate } from "@/lib/date-format";
import type { EventSummary } from "@/lib/events";
import { useProfiles } from "./app-shell";
import { useTrackerResults, type EventResults } from "./tracker/use-results";
import { useTracker } from "./tracker/context";
import { EventRows } from "./tracker/event-rows";
import { TagFilterPills, TagPill } from "./ui/labels";
import { ProfileIdentity } from "./ui/profile-avatar";
import { CustomSelect, DatePicker } from "./ui/pickers";
import {
  LoadingState,
  ErrorState,
  ConfirmDialog,
  useToast,
} from "./ui/feedback";
export type Episode = {
  id: string;
  title: string;
  profile_id: string;
  start_date: string;
  end_date: string | null;
  status: "active" | "resolved";
  description: string;
  events: EventSummary[];
};
export function EpisodeOverview({ profileId }: { profileId: string }) {
  const [data, setData] = useState<Episode[]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(undefined);
    setError("");
    apiFetch<{ episodes: Episode[] }>(
      `/api/v1/episodes?profile_id=${profileId}`,
      c.signal,
    )
      .then((r) => setData(r.episodes))
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [profileId, attempt]);
  return (
    <section className="overview-section episode-overview">
      <div className="attachments-heading">
        <h3>Health episodes</h3>
        <Link className="text-link" href="/episodes">
          View all
        </Link>
      </div>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      ) : !data ? (
        <p role="status">Loading episodes…</p>
      ) : !data.length ? (
        <p className="overview-empty">No episodes.</p>
      ) : (
        <ul className="episode-list">
          {[...data]
            .sort(
              (a, b) =>
                Number(b.status === "active") - Number(a.status === "active") ||
                b.start_date.localeCompare(a.start_date),
            )
            .slice(0, 4)
            .map((e) => (
              <li key={e.id}>
                <Link href={`/episodes/${e.id}`}>
                  <strong>{e.title}</strong>
                  <span className="episode-list-meta">
                    <span className={`status-pill episode-status-${e.status}`}>
                      {e.status}
                    </span>
                    <span>{formatDate(e.start_date)}</span>
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
function EpisodeEditor({
  episode,
  onClose,
  onSaved,
}: {
  episode?: Episode;
  onClose: () => void;
  onSaved: (e: Episode) => void;
}) {
  const { profiles, activeProfile } = useProfiles();
  const { tags } = useTracker();
  const toast = useToast();
  const [draft, setDraft] = useState({
    title: episode?.title ?? "",
    profile_id:
      episode?.profile_id ?? activeProfile?.id ?? profiles[0]?.id ?? "",
    start_date: episode?.start_date ?? dayKey(new Date()),
    end_date: episode?.end_date ?? "",
    status: episode?.status ?? "active",
    description: episode?.description ?? "",
    event_ids: episode?.events.map((e) => e.id) ?? [],
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [tagIds, setTagIds] = useState<string[]>([]);
  const options = useTrackerResults<EventResults>(
    "/api/v1/events/search",
    { profile_id: draft.profile_id, page: 1, page_size: 100 },
    { allPages: true },
  );
  const update = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <form
      className="card event-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!draft.start_date) {
          setError("Choose a start date.");
          return;
        }
        if (draft.end_date && draft.end_date < draft.start_date) {
          setError("End date must be on or after start date.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          const r = await apiFetch<{ episode: Episode }>(
            `/api/v1/episodes${episode ? "/" + episode.id : ""}`,
            undefined,
            {
              method: episode ? "PUT" : "POST",
              body: { ...draft, end_date: draft.end_date || null },
            },
          );
          toast("Episode saved.");
          onSaved(r.episode);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to save episode.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend className="sr-only">Episode details</legend>
        <div className="form-field">
          <label htmlFor="episode-title">Title</label>
          <input
            id="episode-title"
            required
            maxLength={300}
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="episode-profile">Profile</label>
            <div
              className="profile-choices"
              role="radiogroup"
              aria-label="Episode profile"
            >
              {profiles.map((profile) => (
                <label
                  key={profile.id}
                  className={draft.profile_id === profile.id ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="episode-profile"
                    value={profile.id}
                    checked={draft.profile_id === profile.id}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        profile_id: e.target.value,
                        event_ids: [],
                      }))
                    }
                  />
                  <ProfileIdentity
                    name={profile.name}
                    avatar={profile.avatar}
                  />
                </label>
              ))}
            </div>
            {episode && (
              <p className="form-hint">
                Changing profile clears the selected events.
              </p>
            )}
          </div>
          <div className="episode-picker-filters">
            <TagFilterPills
              legend="Tags"
              items={tags}
              selected={tagIds}
              onChange={(ids) => setTagIds(ids.slice(0, 20))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="episode-status">Status</label>
            <CustomSelect
              id="episode-status"
              value={draft.status}
              onChange={(value) => update("status", value)}
              options={[
                { value: "active", label: "Active" },
                { value: "resolved", label: "Resolved" },
              ]}
            />
          </div>
          <div className="form-field">
            <label htmlFor="episode-start">Start date</label>
            <DatePicker
              id="episode-start"
              value={draft.start_date}
              onChange={(value) => update("start_date", value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="episode-end">
              End date <span>Optional</span>
            </label>
            <DatePicker
              id="episode-end"
              min={draft.start_date}
              optional
              value={draft.end_date}
              onChange={(value) => update("end_date", value)}
            />
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="episode-description">
            Description <span>Optional</span>
          </label>
          <textarea
            id="episode-description"
            maxLength={5000}
            rows={3}
            value={draft.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </div>
        <fieldset className="episode-picker">
          <legend>Related events · {draft.event_ids.length} selected</legend>
          <div className="form-field">
            <label className="sr-only" htmlFor="episode-search">
              Search events
            </label>
            <input
              id="episode-search"
              type="search"
              placeholder="Search events"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {options.error ? (
            <p role="alert">
              {options.error}{" "}
              <button
                type="button"
                className="text-link"
                onClick={options.retry}
              >
                Retry
              </button>
            </p>
          ) : !options.data ? (
            <p role="status">Loading events…</p>
          ) : (
            <div className="episode-event-options">
              {options.data.events
                .filter(
                  (e) =>
                    e.title.toLowerCase().includes(search.toLowerCase()) &&
                    tagIds.every((id) => e.tags?.some((tag) => tag.id === id)),
                )
                .map((e) => (
                  <label key={e.id}>
                    <input
                      type="checkbox"
                      checked={draft.event_ids.includes(e.id)}
                      disabled={
                        !draft.event_ids.includes(e.id) &&
                        draft.event_ids.length >= 500
                      }
                      onChange={(v) =>
                        update(
                          "event_ids",
                          v.target.checked
                            ? [...draft.event_ids, e.id]
                            : draft.event_ids.filter((id) => id !== e.id),
                        )
                      }
                    />
                    <span>
                      <strong>{e.title}</strong>
                      <small>
                        <EventTypeBadge type={e.event_type} /> ·{" "}
                        {formatDate(e.event_date)}
                      </small>
                    </span>
                  </label>
                ))}
              {!options.data.events.length && (
                <p>No events for this profile.</p>
              )}
            </div>
          )}
        </fieldset>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="button secondary-button"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save episode"}
        </button>
      </div>
    </form>
  );
}

function EpisodeEventTimeline({ events }: { events: EventSummary[] }) {
  const ordered = [...events].sort(
    (a, b) =>
      Date.parse(a.event_date) - Date.parse(b.event_date) ||
      a.id.localeCompare(b.id),
  );
  if (!ordered.length)
    return <p className="overview-empty">No related events.</p>;
  return (
    <ol className="episode-event-timeline">
      {ordered.map((event) => (
        <li key={event.id}>
          <time dateTime={event.event_date}>
            {formatDate(event.event_date)}
          </time>
          <span className="episode-timeline-marker" aria-hidden="true" />
          <Link href={`/events/${event.id}`}>
            <span className="episode-timeline-type">
              <EventTypeBadge type={event.event_type} />
            </span>
            <strong>
              {event.title}
              <ArrowUpRight size={15} aria-hidden="true" />
            </strong>
            {!!event.tags?.length && (
              <span className="event-labels">
                {event.tags.map((tag) => (
                  <TagPill key={tag.id} name={tag.name} />
                ))}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ol>
  );
}

function EpisodeAccordionCard({
  episode,
  profile,
}: {
  episode: Episode;
  profile?: { name: string; avatar: string | null };
}) {
  return (
    <details className="card episode-accordion-card">
      <summary>
        <div className="episode-card-title">
          <strong>{episode.title}</strong>
          <span className="episode-list-meta">
            <ProfileIdentity
              name={profile?.name ?? "Health profile"}
              avatar={profile?.avatar}
            />
            <span className={`status-pill episode-status-${episode.status}`}>
              {episode.status}
            </span>
          </span>
        </div>
        <div className="episode-card-range">
          <span>
            {formatDate(episode.start_date)}
            {episode.end_date ? ` – ${formatDate(episode.end_date)}` : ""}
          </span>
          <span>
            {episode.events.length}{" "}
            {episode.events.length === 1 ? "event" : "events"}
          </span>
        </div>
        <ChevronDown
          className="episode-card-chevron"
          size={19}
          aria-hidden="true"
        />
      </summary>
      <div className="episode-accordion-content">
        {episode.description && <p>{episode.description}</p>}
        <EpisodeEventTimeline events={episode.events} />
        <Link
          className="text-link episode-open-link"
          href={`/episodes/${episode.id}`}
        >
          Open episode <ArrowUpRight size={15} />
        </Link>
      </div>
    </details>
  );
}

export function EpisodesPage({ id }: { id?: string }) {
  const { profiles, activeProfile } = useProfiles();
  const [data, setData] = useState<Episode[]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const c = new AbortController();
    setData(undefined);
    setError("");
    apiFetch<{ episodes?: Episode[]; episode?: Episode }>(
      id
        ? `/api/v1/episodes/${id}`
        : `/api/v1/episodes${activeProfile ? "?profile_id=" + activeProfile.id : ""}`,
      c.signal,
    )
      .then((r) => setData(r.episode ? [r.episode] : (r.episodes ?? [])))
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [id, activeProfile?.id, attempt]);
  const episode = id ? data?.[0] : undefined;
  return (
    <>
      {id && (
        <Link className="text-link event-back" href="/episodes">
          <ArrowLeft size={16} />
          Episodes
        </Link>
      )}
      <div className="page-heading">
        <h1>
          {editing
            ? id
              ? "Edit episode"
              : "Add episode"
            : (episode?.title ?? "Health episodes")}
        </h1>
        {!editing && (
          <button
            className={id ? "icon-button" : "button"}
            aria-label={id ? "Edit episode" : undefined}
            title={id ? "Edit" : undefined}
            disabled={!!id && !episode}
            onClick={() => setEditing(true)}
          >
            {id ? (
              <Pencil size={17} aria-hidden="true" />
            ) : (
              <>
                <Plus size={16} /> Add episode
              </>
            )}
          </button>
        )}
      </div>
      {editing ? (
        <EpisodeEditor
          episode={episode}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : error ? (
        <ErrorState message={error} retry={() => setAttempt((n) => n + 1)} />
      ) : !data ? (
        <LoadingState label="Loading episodes…" />
      ) : episode ? (
        <>
          <section className="card basic-information">
            <div className="document-meta">
              <span className={`status-pill episode-status-${episode.status}`}>
                {episode.status}
              </span>
              {(() => {
                const profile = profiles.find(
                  (p) => p.id === episode.profile_id,
                );
                return (
                  <ProfileIdentity
                    name={profile?.name ?? "Health profile"}
                    avatar={profile?.avatar}
                  />
                );
              })()}
              <span>
                {formatDate(episode.start_date)}
                {episode.end_date ? ` – ${formatDate(episode.end_date)}` : ""}
              </span>
            </div>
            {episode.description && (
              <p className="episode-description">{episode.description}</p>
            )}
          </section>
          <section className="card episode-related">
            <h2>Related events</h2>
            {episode.events.length ? (
              <EventRows events={episode.events} />
            ) : (
              <p className="overview-empty">No related events.</p>
            )}
          </section>
          <button
            className="icon-button danger-icon episode-delete-action"
            aria-label="Delete episode"
            title="Delete"
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </>
      ) : data.length ? (
        <div className="episode-cards">
          {data.map((episode) => (
            <EpisodeAccordionCard
              key={episode.id}
              episode={episode}
              profile={profiles.find(
                (profile) => profile.id === episode.profile_id,
              )}
            />
          ))}
        </div>
      ) : (
        <section className="card event-state">
          <h2>No episodes</h2>
          <button className="button" onClick={() => setEditing(true)}>
            <Plus size={16} /> Add episode
          </button>
        </section>
      )}
      {deleting && episode && (
        <ConfirmDialog
          title="Delete episode?"
          description="Related events will be kept."
          busy={busy}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await apiFetch(`/api/v1/episodes/${episode.id}`, undefined, {
                method: "DELETE",
              });
              toast("Episode deleted.");
              window.location.assign("/episodes");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Unable to delete episode.",
              );
              setDeleting(false);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
