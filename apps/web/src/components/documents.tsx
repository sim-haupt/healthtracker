"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Download,
  FileImage,
  FileText,
  FolderOpen,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useProfiles } from "./app-shell";
import { useTracker } from "./tracker/context";
import { useTrackerResults, type EventResults } from "./tracker/use-results";
import { ErrorState, LoadingState } from "./ui/feedback";
import { ProfileAvatar } from "./ui/profile-avatar";
import { supabase } from "@/lib/supabase";
import { documentCategories } from "@/lib/attachments";
import {
  categoryLabel,
  documentFileTypes,
  documentFilterQuery,
  emptyDocumentFilters,
  fileKind,
  type DocumentFilters,
  type HealthDocument,
} from "@/lib/documents";

type DocumentResults = { documents: HealthDocument[]; total: number };

function DocumentCard({ item }: { item: HealthDocument }) {
  const { profiles } = useProfiles();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const profile = profiles.find((entry) => entry.id === item.profile_id);
  const previewable =
    item.mime_type.startsWith("image/") || item.mime_type === "application/pdf";

  async function open() {
    if (opening) return;
    const preview = previewable ? window.open("", "_blank") : null;
    if (preview) preview.opener = null;
    setOpening(true);
    setError("");
    try {
      const { data, error: storageError } = await supabase!.storage
        .from("health-attachments")
        .download(item.file_path);
      if (storageError)
        throw new Error("This private file could not be opened. Please retry.");
      const url = URL.createObjectURL(data);
      if (previewable && preview) preview.location.href = url;
      else {
        preview?.close();
        const link = document.createElement("a");
        link.href = url;
        link.download = item.file_name;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      preview?.close();
      setError(cause instanceof Error ? cause.message : "Unable to open file.");
    } finally {
      setOpening(false);
    }
  }

  const Icon = item.mime_type.startsWith("image/") ? FileImage : FileText;
  return (
    <article className="card document-card">
      <div className="document-icon" aria-hidden>
        <Icon size={25} />
      </div>
      <div className="document-body">
        <div className="document-meta">
          <span className="category-pill">
            {categoryLabel(item.document_category)}
          </span>
          <span>{fileKind(item)}</span>
          <span>{(item.file_size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
        <h2>{item.file_name}</h2>
        {item.description && <p>{item.description}</p>}
        <div className="document-context">
          <span>
            <ProfileAvatar
              name={profile?.name ?? "Health profile"}
              avatar={profile?.avatar}
            />
            {profile?.name ?? "Health profile"}
          </span>
          <span>
            <CalendarDays size={15} /> Uploaded{" "}
            {new Date(item.created_at).toLocaleDateString(undefined, {
              dateStyle: "medium",
            })}
          </span>
        </div>
        {item.tags.length > 0 && (
          <div className="event-labels">
            {item.tags.map((tag) => (
              <span className="tag-pill" key={tag.id}>
                {tag.name}
              </span>
            ))}
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="document-actions">
        <button
          className="button secondary-button"
          onClick={open}
          disabled={opening}
        >
          <Download size={16} />
          {opening ? "Opening…" : previewable ? "Open" : "Download"}
        </button>
        <Link className="text-link" href={`/events/${item.health_event_id}`}>
          {item.event_title}
          <ArrowUpRight size={16} />
        </Link>
        <span className="document-event-type">{item.event_type}</span>
      </div>
    </article>
  );
}

function DocumentResultsList({
  query,
  queryError,
}: {
  query: Record<string, unknown>;
  queryError: string;
}) {
  const [page, setPage] = useState(1);
  const { data, error, retry } = useTrackerResults<DocumentResults>(
    "/api/v1/documents/search",
    { ...query, page, page_size: 24 },
    { error: queryError },
  );
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!data) return <LoadingState label="Loading documents…" />;
  if (!data.documents.length)
    return (
      <section className="card event-state">
        <span className="state-symbol">
          <FolderOpen size={25} />
        </span>
        <h2>No documents found</h2>
        <p>
          Upload a file from a health event, or clear a filter to see more of
          your records.
        </p>
        <Link className="button secondary-button" href="/events">
          Browse health events
        </Link>
        {page > 1 && (
          <button className="text-link" onClick={() => setPage(1)}>
            Return to newest documents
          </button>
        )}
      </section>
    );
  return (
    <>
      <div className="document-count" role="status">
        {data.total} {data.total === 1 ? "document" : "documents"} · Newest
        uploads first
      </div>
      <div className="document-list">
        {data.documents.map((item) => (
          <DocumentCard item={item} key={item.id} />
        ))}
      </div>
      <div className="card events-pagination">
        <span>
          Page {page} of {Math.max(1, Math.ceil(data.total / 24))}
        </span>
        <div>
          <button
            className="button secondary-button"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Newer documents
          </button>
          <button
            className="button secondary-button"
            disabled={page * 24 >= data.total}
            onClick={() => setPage((value) => value + 1)}
          >
            Older documents
          </button>
        </div>
      </div>
    </>
  );
}

export function DocumentsPage() {
  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const { tags, labelsLoading, labelError, reloadLabels } = useTracker();
  const [filters, setFilters] = useState<DocumentFilters>(emptyDocumentFilters);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(filters.q), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);
  const eventOptions = useTrackerResults<EventResults>(
    "/api/v1/events/search",
    { page: 1, page_size: 100 },
    { allPages: true },
  );
  const update = <K extends keyof DocumentFilters>(
    key: K,
    value: DocumentFilters[K],
  ) => setFilters((previous) => ({ ...previous, [key]: value }));
  const selected = useMemo(
    () => documentFilterQuery(filters, activeProfile?.id, search),
    [activeProfile?.id, filters, search],
  );
  const availableEvents = useMemo(
    () =>
      (eventOptions.data?.events ?? []).filter(
        (event) => !activeProfile || event.profile_id === activeProfile.id,
      ),
    [activeProfile, eventOptions.data?.events],
  );
  useEffect(() => {
    if (
      eventOptions.data &&
      filters.event_id &&
      !availableEvents.some((event) => event.id === filters.event_id)
    )
      setFilters((previous) => ({ ...previous, event_id: "" }));
  }, [availableEvents, eventOptions.data, filters.event_id]);
  const count =
    Number(!!activeProfile) +
    Number(!!filters.file_type) +
    Number(!!filters.event_id) +
    Number(!!filters.document_category) +
    Number(!!filters.date_from) +
    Number(!!filters.date_to) +
    filters.tag_ids.length +
    Number(!!filters.q);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Documents</h1>
        </div>
      </div>
      <section className="card tracker-filters" aria-label="Filter documents">
        <div className="filter-top">
          <div className="search-field">
            <Search size={18} />
            <label className="sr-only" htmlFor="document-search">
              Search filenames and descriptions
            </label>
            <input
              id="document-search"
              type="search"
              maxLength={200}
              value={filters.q}
              placeholder="Search files and descriptions…"
              onChange={(event) => update("q", event.target.value)}
            />
          </div>
          <div className="filter-select">
            <label htmlFor="document-profile">Profile</label>
            <select
              id="document-profile"
              value={activeProfile?.id ?? ""}
              onChange={(event) => {
                setActiveProfile(event.target.value);
                update("event_id", "");
              }}
            >
              <option value="">Both profiles</option>
              {profiles.map((profile) => (
                <option value={profile.id} key={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-select">
            <label htmlFor="document-file-type">File type</label>
            <select
              id="document-file-type"
              value={filters.file_type}
              onChange={(event) => update("file_type", event.target.value)}
            >
              <option value="">All file types</option>
              {documentFileTypes.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
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
            <div className="advanced-filters document-advanced-filters">
              <div className="filter-select">
                <label htmlFor="document-category">Document category</label>
                <select
                  id="document-category"
                  value={filters.document_category}
                  onChange={(event) =>
                    update("document_category", event.target.value)
                  }
                >
                  <option value="">All categories</option>
                  {documentCategories.map((category) => (
                    <option value={category} key={category}>
                      {categoryLabel(category)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-select">
                <label htmlFor="document-event">Related event</label>
                <select
                  id="document-event"
                  value={filters.event_id}
                  disabled={!eventOptions.data}
                  onChange={(event) => update("event_id", event.target.value)}
                >
                  <option value="">All events</option>
                  {availableEvents.map((event) => (
                    <option value={event.id} key={event.id}>
                      {event.title} ·{" "}
                      {profiles.find(
                        (profile) => profile.id === event.profile_id,
                      )?.name ?? "Health profile"}
                      {" · "}
                      {new Date(event.event_date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
                {eventOptions.error && (
                  <p className="field-error" role="alert">
                    {eventOptions.error}{" "}
                    <button className="text-link" onClick={eventOptions.retry}>
                      Retry
                    </button>
                  </p>
                )}
              </div>
              <div className="filter-select">
                <label htmlFor="document-from">Uploaded from</label>
                <input
                  id="document-from"
                  type="date"
                  value={filters.date_from}
                  onChange={(event) => update("date_from", event.target.value)}
                />
              </div>
              <div className="filter-select">
                <label htmlFor="document-to">Uploaded through</label>
                <input
                  id="document-to"
                  type="date"
                  value={filters.date_to}
                  onChange={(event) => update("date_to", event.target.value)}
                />
              </div>
              <fieldset className="filter-tags">
                <legend>
                  Event tags <span>Matches all selected tags</span>
                </legend>
                <div className="tag-options">
                  {tags.map((tag) => (
                    <label
                      className={`tag-option ${filters.tag_ids.includes(tag.id) ? "selected" : ""}`}
                      key={tag.id}
                    >
                      <input
                        type="checkbox"
                        checked={filters.tag_ids.includes(tag.id)}
                        disabled={
                          !filters.tag_ids.includes(tag.id) &&
                          filters.tag_ids.length >= 20
                        }
                        onChange={(event) =>
                          update(
                            "tag_ids",
                            event.target.checked
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
                    Add tags to health events to use them here.
                  </p>
                )}
              </fieldset>
            </div>
          </details>
          <button
            className="text-link"
            disabled={!count}
            onClick={() => {
              setFilters(emptyDocumentFilters);
              setActiveProfile("");
            }}
          >
            Clear filters
          </button>
        </div>
        {selected.error && (
          <p className="field-error" role="alert">
            {selected.error}
          </p>
        )}
        {labelError && (
          <p className="field-error" role="alert">
            {labelError}{" "}
            <button className="text-link" onClick={reloadLabels}>
              Retry tags
            </button>
          </p>
        )}
        {filters.q !== search && (
          <p className="muted" role="status">
            Updating search…
          </p>
        )}
      </section>
      <DocumentResultsList
        key={JSON.stringify([selected.query, selected.error])}
        query={selected.query}
        queryError={selected.error}
      />
    </>
  );
}
