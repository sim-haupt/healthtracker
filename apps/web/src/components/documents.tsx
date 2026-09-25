"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  FolderOpen,
  MapPin,
} from "lucide-react";
import { useProfiles } from "./app-shell";
import { DocumentUpload } from "./document-upload";
import { useTracker } from "./tracker/context";
import { useTrackerResults, type EventResults } from "./tracker/use-results";
import { ErrorState, LoadingState } from "./ui/feedback";
import { DocumentCategoryPill, TagFilterPills, TagPill } from "./ui/labels";
import { RichTextContent } from "./ui/rich-text";
import { supabase } from "@/lib/supabase";
import { documentCategories } from "@/lib/attachments";
import { formatDate } from "@/lib/date-format";
import { CustomSelect, DatePicker } from "./ui/pickers";
import { FilterBar } from "./ui/filter-bar";
import { ProfileColumns } from "./ui/profile-columns";
import { eventDisplayTitle } from "@/lib/events";
import type { EventSummary } from "@/lib/events";
import { DocumentEditButton } from "./document-editor";
import { EventTypeBadge } from "./event-types";
import {
  categoryLabel,
  documentTitle,
  documentFileTypes,
  documentFilterQuery,
  emptyDocumentFilters,
  type DocumentFilters,
  type HealthDocument,
} from "@/lib/documents";

type DocumentResults = { documents: HealthDocument[]; total: number };

function DocumentCard({
  item,
  events,
  onUpdated,
}: {
  item: HealthDocument;
  events: EventSummary[];
  onUpdated: () => void;
}) {
  const { profiles } = useProfiles();
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");
  const files = item.files?.length ? item.files : [item];

  async function open(file: (typeof files)[number]) {
    if (opening) return;
    const previewable =
      file.mime_type.startsWith("image/") ||
      file.mime_type.startsWith("text/") ||
      file.mime_type === "application/pdf";
    const preview = previewable ? window.open("about:blank", "_blank") : null;
    if (preview) preview.opener = null;
    setOpening(file.id);
    setError("");
    try {
      const { data, error: storageError } = await supabase!.storage
        .from("health-attachments")
        .download(file.file_path);
      if (storageError)
        throw new Error("This private file could not be opened. Please retry.");
      // Storage responses may use application/octet-stream, which makes the
      // browser download otherwise previewable files. The stored MIME type is
      // validated during upload, so use it for the local preview URL.
      const previewBlob = data.slice(0, data.size, file.mime_type);
      const url = URL.createObjectURL(previewBlob);
      if (previewable && preview) preview.location.href = url;
      else {
        preview?.close();
        const link = document.createElement("a");
        link.href = url;
        link.download = file.file_name;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      preview?.close();
      setError(cause instanceof Error ? cause.message : "Unable to open file.");
    } finally {
      setOpening("");
    }
  }

  const Icon = files.some((file) => file.mime_type.startsWith("image/"))
    ? FileImage
    : FileText;

  return (
    <article className="card document-card">
      <div className="document-icon" aria-hidden>
        <Icon size={25} />
      </div>
      <DocumentEditButton
        document={item}
        events={events}
        profiles={profiles}
        iconOnly
        onUpdated={onUpdated}
      />
      <div className="document-body">
        <div className="document-card-topline">
          <DocumentCategoryPill name={categoryLabel(item.document_category)} />
          <span className="document-date">
            <CalendarDays size={15} />
            <span>{formatDate(item.created_at)}</span>
          </span>
          {item.provider && (
            <Link
              className="text-link document-provider"
              href={`/providers/${item.provider.id}`}
            >
              <MapPin size={14} aria-hidden="true" />
              {item.provider.name}
            </Link>
          )}
        </div>
        <div className="document-title" role="heading" aria-level={2}>
          {item.description ? (
            <RichTextContent value={item.description} />
          ) : (
            documentTitle(item)
          )}
        </div>
        <Link
          className="document-related-event"
          href={`/events/${item.health_event_id}`}
        >
          <EventTypeBadge type={item.event_type} />
          <span className="document-related-event-title">
            {item.event_title}
          </span>
        </Link>
        <div className="document-file-actions">
          {files.map((file) => {
            const previewable =
              file.mime_type.startsWith("image/") ||
              file.mime_type.startsWith("text/") ||
              file.mime_type === "application/pdf";
            const ActionIcon = previewable ? ExternalLink : Download;
            return (
              <a
                className="text-link document-file-link"
                href={`#document-file-${file.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  void open(file);
                }}
                aria-disabled={!!opening}
                key={file.id}
                title={file.file_name}
              >
                <ActionIcon size={15} />
                <span>{opening === file.id ? "Opening…" : file.file_name}</span>
              </a>
            );
          })}
        </div>
        {item.tags.length > 0 && (
          <div className="event-labels">
            {item.tags.map((tag) => (
              <TagPill name={tag.name} key={tag.id} />
            ))}
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

function DocumentResultsList({
  query,
  queryError,
  events,
  onUpdated,
}: {
  query: Record<string, unknown>;
  queryError: string;
  events: EventSummary[];
  onUpdated: () => void;
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
        <p>Upload a document above, or clear a filter to see more records.</p>
        <Link className="button secondary-button" href="/timeline">
          Browse timeline
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
      <ProfileColumns
        items={data.documents}
        profileId={(item) => item.profile_id}
        noun="document"
      >
        {(documents) => (
          <div className="document-list">
            {documents.map((item) => (
              <DocumentCard
                item={item}
                events={events}
                key={item.id}
                onUpdated={onUpdated}
              />
            ))}
          </div>
        )}
      </ProfileColumns>
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
  const { profiles, activeProfile } = useProfiles();
  const { tags, labelsLoading, labelError, reloadLabels } = useTracker();
  const [filters, setFilters] = useState<DocumentFilters>(emptyDocumentFilters);
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(filters.q), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);
  const eventOptions = useTrackerResults<EventResults>(
    "/api/v1/events/search",
    {
      ...(activeProfile ? { profile_id: activeProfile.id } : {}),
      page: 1,
      page_size: 100,
    },
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
    () => eventOptions.data?.events ?? [],
    [eventOptions.data?.events],
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
        <DocumentUpload
          events={availableEvents}
          profiles={profiles}
          loading={!eventOptions.data && !eventOptions.error}
          loadError={eventOptions.error}
          retryEvents={eventOptions.retry}
          onUploaded={() => setRevision((value) => value + 1)}
        />
      </div>
      <FilterBar
        label="Filter documents"
        count={count}
        onClear={() => setFilters(emptyDocumentFilters)}
        primary={
          <>
            <div className="filter-select">
              <label htmlFor="document-file-type">File type</label>
              <CustomSelect
                id="document-file-type"
                ariaLabel="File type"
                value={filters.file_type}
                onChange={(value) => update("file_type", value)}
                options={[
                  { value: "", label: "All file types" },
                  ...documentFileTypes.map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]}
              />
            </div>
            <div className="filter-select">
              <label htmlFor="document-category">Document type</label>
              <CustomSelect
                id="document-category"
                ariaLabel="Document type"
                value={filters.document_category}
                onChange={(value) => update("document_category", value)}
                options={[
                  { value: "", label: "All document types" },
                  ...documentCategories.map((category) => ({
                    value: category,
                    label: categoryLabel(category),
                  })),
                ]}
              />
            </div>
          </>
        }
        search={{
          id: "document-search",
          label: "Search filenames and descriptions",
          value: filters.q,
          placeholder: "Search files and descriptions…",
          onChange: (value) => update("q", value),
        }}
        advanced={
          <div className="advanced-filters document-advanced-filters">
            <div className="filter-select">
              <label htmlFor="document-event">Related event</label>
              <CustomSelect
                id="document-event"
                value={filters.event_id}
                disabled={!eventOptions.data}
                onChange={(value) => update("event_id", value)}
                options={[
                  { value: "", label: "All events" },
                  ...availableEvents.map((event) => ({
                    value: event.id,
                    label: `${eventDisplayTitle(event)} · ${formatDate(event.event_date)}`,
                  })),
                ]}
              />
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
              <DatePicker
                id="document-from"
                value={filters.date_from}
                optional
                ariaLabel="From date"
                placeholder="From date"
                onChange={(value) => update("date_from", value)}
              />
            </div>
            <div className="filter-select">
              <label htmlFor="document-to">Uploaded through</label>
              <DatePicker
                id="document-to"
                value={filters.date_to}
                optional
                min={filters.date_from}
                ariaLabel="To date"
                placeholder="To date"
                onChange={(value) => update("date_to", value)}
              />
            </div>
            <TagFilterPills
              legend="Event tags"
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
        {selected.error && (
          <p className="field-error" role="alert">
            {selected.error}
          </p>
        )}
        {labelError && (
          <p className="field-error" role="alert">
            {labelError}{" "}
            <button className="text-link" onClick={reloadLabels}>
              Retry
            </button>
          </p>
        )}
        {filters.q !== search && (
          <p className="muted" role="status">
            Updating search…
          </p>
        )}
      </FilterBar>
      <DocumentResultsList
        key={JSON.stringify([selected.query, selected.error, revision])}
        query={selected.query}
        queryError={selected.error}
        events={availableEvents}
        onUpdated={() => setRevision((value) => value + 1)}
      />
    </>
  );
}
