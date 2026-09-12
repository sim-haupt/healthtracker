"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, ArrowLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { dayKey } from "@/lib/tracker";
import type { EventSummary } from "@/lib/events";
import { useProfiles } from "./app-shell";
import { useTrackerResults, type EventResults } from "./tracker/use-results";
import { EventRows } from "./tracker/event-rows";
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
                  <span>
                    {e.status} · {e.start_date}
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
    [search, setSearch] = useState("");
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
            <select
              id="episode-profile"
              value={draft.profile_id}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  profile_id: e.target.value,
                  event_ids: [],
                }))
              }
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {episode && (
              <p className="form-hint">
                Changing profile clears the selected events.
              </p>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="episode-status">Status</label>
            <select
              id="episode-status"
              value={draft.status}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="episode-start">Start date</label>
            <input
              id="episode-start"
              type="date"
              required
              value={draft.start_date}
              onChange={(e) => update("start_date", e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="episode-end">
              End date <span>Optional</span>
            </label>
            <input
              id="episode-end"
              type="date"
              min={draft.start_date}
              value={draft.end_date}
              onChange={(e) => update("end_date", e.target.value)}
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
                .filter((e) =>
                  e.title.toLowerCase().includes(search.toLowerCase()),
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
                        {e.event_type} ·{" "}
                        {new Date(e.event_date).toLocaleDateString()}
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
            className={id ? "button secondary-button" : "button"}
            disabled={!!id && !episode}
            onClick={() => setEditing(true)}
          >
            {!id && <Plus size={16} />} {id ? "Edit" : "Add episode"}
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
              <span className="category-pill">{episode.status}</span>
              <span>
                {profiles.find((p) => p.id === episode.profile_id)?.name}
              </span>
              <span>
                {episode.start_date}
                {episode.end_date ? " – " + episode.end_date : ""}
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
            className="button danger-outline"
            onClick={() => setDeleting(true)}
          >
            Delete episode
          </button>
        </>
      ) : (
        <section className="card">
          <ul className="episode-list">
            {data.map((e) => (
              <li key={e.id}>
                <Link href={`/episodes/${e.id}`}>
                  <strong>{e.title}</strong>
                  <span>
                    {profiles.find((p) => p.id === e.profile_id)?.name} ·{" "}
                    {e.status} · {e.start_date}
                    {e.end_date ? " – " + e.end_date : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {!data.length && <p className="overview-empty">No episodes.</p>}
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
