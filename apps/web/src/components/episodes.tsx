"use client";
import { EventTypeBadge } from "./event-types";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  ChevronDown,
  ArrowUpRight,
  FileText,
  Search,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { dayKey } from "@/lib/tracker";
import { formatDate } from "@/lib/date-format";
import { eventDisplayTitle, type EventSummary } from "@/lib/events";
import { useProfiles } from "./app-shell";
import { useTrackerResults, type EventResults } from "./tracker/use-results";
import { EventLabelEditor } from "./tracker/event-label-editor";
import { TagPill } from "./ui/labels";
import { ProfileIdentity } from "./ui/profile-avatar";
import { RichTextContent, RichTextEditor } from "./ui/rich-text";
import { DatePicker } from "./ui/pickers";
import { categoryLabel, type HealthDocument } from "@/lib/documents";
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
  documents?: HealthDocument[];
};

function EpisodeFormSection({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="event-form-section episode-form-section">
      <header>
        <span aria-hidden="true">
          <span>{number}</span>
        </span>
        <h2>{title}</h2>
      </header>
      <div className="event-form-section-body">{children}</div>
    </section>
  );
}
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
  const toast = useToast();
  const [draft, setDraft] = useState({
    title: episode?.title ?? "",
    profile_id:
      episode?.profile_id ?? activeProfile?.id ?? profiles[0]?.id ?? "",
    start_date: episode?.start_date ?? dayKey(new Date()),
    end_date: episode?.end_date ?? "",
    description: episode?.description ?? "",
    event_ids: episode?.events.map((e) => e.id) ?? [],
    document_ids: episode?.documents?.map((document) => document.id) ?? [],
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [documentSearch, setDocumentSearch] = useState(""),
    [tagIds, setTagIds] = useState<string[]>([]),
    [labelBusy, setLabelBusy] = useState(false),
    [documents, setDocuments] = useState<HealthDocument[]>(),
    [documentError, setDocumentError] = useState(""),
    [documentAttempt, setDocumentAttempt] = useState(0);
  const options = useTrackerResults<EventResults>(
    "/api/v1/events/search",
    { profile_id: draft.profile_id, page: 1, page_size: 100 },
    { allPages: true },
  );
  useEffect(() => {
    const controller = new AbortController();
    setDocuments(undefined);
    setDocumentError("");
    apiFetch<{ documents: HealthDocument[] }>(
      "/api/v1/documents/search",
      controller.signal,
      {
        method: "POST",
        body: {
          profile_id: draft.profile_id,
          page: 1,
          page_size: 100,
        },
      },
    )
      .then((result) => setDocuments(result.documents))
      .catch((cause) => {
        if (!controller.signal.aborted)
          setDocumentError(
            cause instanceof Error
              ? cause.message
              : "Unable to load documents.",
          );
      });
    return () => controller.abort();
  }, [documentAttempt, draft.profile_id]);
  const update = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const visibleDocuments = (documents ?? []).filter((document) =>
    [document.file_name, document.description ?? "", document.event_title]
      .join(" ")
      .toLowerCase()
      .includes(documentSearch.toLowerCase()),
  );
  return (
    <form
      className="episode-editor-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || labelBusy) return;
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
              body: {
                ...draft,
                title: draft.title.trim() || "Untitled episode",
                end_date: draft.end_date || null,
              },
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
      <fieldset disabled={busy || labelBusy}>
        <legend className="sr-only">Episode details</legend>
        <EpisodeFormSection number={1} title="Episode information">
          <div className="episode-information-grid">
            <div className="form-field episode-profile-field">
              <span className="field-label">Profile</span>
              <div
                className="profile-choices"
                role="radiogroup"
                aria-label="Episode profile"
              >
                {profiles.map((profile) => (
                  <label
                    key={profile.id}
                    className={
                      draft.profile_id === profile.id ? "selected" : ""
                    }
                  >
                    <input
                      type="radio"
                      name="episode-profile"
                      value={profile.id}
                      checked={draft.profile_id === profile.id}
                      onChange={(e) => {
                        setDraft((d) => ({
                          ...d,
                          profile_id: e.target.value,
                          event_ids: [],
                          document_ids: [],
                        }));
                        setTagIds([]);
                      }}
                    />
                    <ProfileIdentity
                      name={profile.name}
                      avatar={profile.avatar}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="form-field episode-title-field">
              <label htmlFor="episode-title">Title</label>
              <input
                id="episode-title"
                maxLength={300}
                value={draft.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </div>
            <div className="form-field episode-start-field">
              <label htmlFor="episode-start">Start date</label>
              <DatePicker
                id="episode-start"
                value={draft.start_date}
                onChange={(value) => update("start_date", value)}
              />
            </div>
            <div className="form-field episode-end-field">
              <label htmlFor="episode-end">End date</label>
              <DatePicker
                id="episode-end"
                min={draft.start_date}
                optional
                value={draft.end_date}
                onChange={(value) => update("end_date", value)}
              />
            </div>
            <div className="form-field episode-description-field">
              <label htmlFor="episode-description">Description</label>
              <RichTextEditor
                id="episode-description"
                value={draft.description}
                onChange={(value) => update("description", value)}
              />
            </div>
            <div className="episode-tags-field">
              <EventLabelEditor
                showHeading={false}
                onBusyChange={setLabelBusy}
                fieldErrors={{}}
                tagIds={tagIds}
                onTags={(ids) => setTagIds(ids.slice(0, 20))}
              />
            </div>
          </div>
        </EpisodeFormSection>

        <EpisodeFormSection number={2} title="Related events">
          <fieldset className="episode-picker">
            <legend className="sr-only">
              {draft.event_ids.length} related events selected
            </legend>
            <div className="form-field">
              <label className="sr-only" htmlFor="episode-search">
                Search events
              </label>
              <div className="filter-bar-search form-search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  id="episode-search"
                  type="search"
                  placeholder="Search events"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    className="search-clear-button"
                    aria-label="Clear event search"
                    onClick={() => setSearch("")}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            <p className="episode-selection-count">
              {draft.event_ids.length} selected
            </p>
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
                    (event) =>
                      eventDisplayTitle(event)
                        .toLowerCase()
                        .includes(search.toLowerCase()) &&
                      tagIds.every((id) =>
                        event.tags?.some((tag) => tag.id === id),
                      ),
                  )
                  .map((event) => (
                    <label key={event.id}>
                      <input
                        type="checkbox"
                        checked={draft.event_ids.includes(event.id)}
                        disabled={
                          !draft.event_ids.includes(event.id) &&
                          draft.event_ids.length >= 500
                        }
                        onChange={(choice) =>
                          update(
                            "event_ids",
                            choice.target.checked
                              ? [...draft.event_ids, event.id]
                              : draft.event_ids.filter((id) => id !== event.id),
                          )
                        }
                      />
                      <span>
                        <strong>{eventDisplayTitle(event)}</strong>
                        <small>
                          <EventTypeBadge type={event.event_type} /> ·{" "}
                          {formatDate(event.event_date)}
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
        </EpisodeFormSection>

        <EpisodeFormSection number={3} title="Related documents">
          <fieldset className="episode-picker">
            <legend className="sr-only">
              {draft.document_ids.length} related documents selected
            </legend>
            <div className="form-field">
              <label className="sr-only" htmlFor="episode-document-search">
                Search documents
              </label>
              <div className="filter-bar-search form-search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  id="episode-document-search"
                  type="search"
                  placeholder="Search documents"
                  value={documentSearch}
                  onChange={(event) => setDocumentSearch(event.target.value)}
                />
                {documentSearch && (
                  <button
                    type="button"
                    className="search-clear-button"
                    aria-label="Clear document search"
                    onClick={() => setDocumentSearch("")}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            <p className="episode-selection-count">
              {draft.document_ids.length} selected
            </p>
            {documentError ? (
              <p role="alert">
                {documentError}{" "}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setDocumentAttempt((attempt) => attempt + 1)}
                >
                  Retry
                </button>
              </p>
            ) : !documents ? (
              <p role="status">Loading documents…</p>
            ) : (
              <div className="episode-event-options episode-document-selector">
                {visibleDocuments.map((document) => (
                  <label key={document.id}>
                    <input
                      type="checkbox"
                      checked={draft.document_ids.includes(document.id)}
                      disabled={
                        !draft.document_ids.includes(document.id) &&
                        draft.document_ids.length >= 500
                      }
                      onChange={(choice) =>
                        update(
                          "document_ids",
                          choice.target.checked
                            ? [...draft.document_ids, document.id]
                            : draft.document_ids.filter(
                                (id) => id !== document.id,
                              ),
                        )
                      }
                    />
                    <FileText size={18} aria-hidden="true" />
                    <span>
                      <strong>{document.file_name}</strong>
                      <small>
                        {categoryLabel(document.document_category)} ·{" "}
                        {document.event_title}
                      </small>
                    </span>
                  </label>
                ))}
                {!visibleDocuments.length && (
                  <p>No documents for this profile.</p>
                )}
              </div>
            )}
          </fieldset>
        </EpisodeFormSection>
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
          disabled={busy || labelBusy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button className="button" disabled={busy || labelBusy}>
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
              {eventDisplayTitle(event)}
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

function EpisodeDocumentList({
  documents,
}: {
  documents: HealthDocument[];
}) {
  if (!documents.length)
    return <p className="overview-empty">No related documents.</p>;
  return (
    <ul className="episode-document-options">
      {documents.map((document) => (
        <li key={document.id}>
          <FileText size={18} aria-hidden="true" />
          <span>
            <strong>{document.file_name}</strong>
            <small>
              {categoryLabel(document.document_category)} ·{" "}
              {document.event_title}
            </small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function EpisodeAccordionCard({ episode }: { episode: Episode }) {
  return (
    <details className="card episode-accordion-card">
      <summary>
        <div className="episode-card-title">
          <strong>{episode.title}</strong>
          <span className="episode-list-meta">
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
            {episode.documents?.length
              ? ` · ${episode.documents.length} ${episode.documents.length === 1 ? "document" : "documents"}`
              : ""}
          </span>
        </div>
        <ChevronDown
          className="episode-card-chevron"
          size={19}
          aria-hidden="true"
        />
      </summary>
      <div className="episode-accordion-content">
        {episode.description && <RichTextContent value={episode.description} />}
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
              <div className="episode-description">
                <RichTextContent value={episode.description} />
              </div>
            )}
          </section>
          <section className="card episode-related episode-related-events">
            <h2>Related events</h2>
            <EpisodeEventTimeline events={episode.events} />
          </section>
          <section className="card episode-related">
            <h2>Related documents</h2>
            <EpisodeDocumentList documents={episode.documents ?? []} />
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
      ) : (
        <div
          className={`episode-profile-grid ${activeProfile ? "single-profile" : ""}`}
        >
          {(activeProfile ? [activeProfile] : profiles).map((profile) => {
            const profileEpisodes = data.filter(
              (item) => item.profile_id === profile.id,
            );
            return (
              <section className="episode-profile-column" key={profile.id}>
                <header>
                  <h2>
                    <ProfileIdentity
                      name={profile.name}
                      avatar={profile.avatar}
                    />
                  </h2>
                  <span>
                    {profileEpisodes.length}{" "}
                    {profileEpisodes.length === 1 ? "episode" : "episodes"}
                  </span>
                </header>
                {profileEpisodes.length ? (
                  <div className="episode-cards">
                    {profileEpisodes.map((episode) => (
                      <EpisodeAccordionCard
                        key={episode.id}
                        episode={episode}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="card episode-profile-empty">No episodes.</div>
                )}
              </section>
            );
          })}
        </div>
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
