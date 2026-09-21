"use client";
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Paperclip } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { type Attachment } from "@/lib/attachments";
import { categoryLabel, documentTitle } from "@/lib/documents";
import { DocumentCategoryPill } from "../ui/labels";
import { RichTextContent } from "../ui/rich-text";

function AttachmentItem({
  item,
  showDescription = true,
}: {
  item: Attachment;
  showDescription?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const isImage = item.mime_type.startsWith("image/");
  const previewable =
    isImage ||
    item.mime_type.startsWith("text/") ||
    item.mime_type === "application/pdf";

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    let objectUrl = "";
    setError("");
    void supabase!.storage
      .from("health-attachments")
      .download(item.file_path)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError("Preview unavailable.");
          return;
        }
        objectUrl = URL.createObjectURL(
          data.slice(0, data.size, item.mime_type),
        );
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load preview.");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.file_path, item.mime_type, isImage, attempt]);

  async function open() {
    if (isImage && url) {
      dialog.current?.showModal();
      return;
    }
    const preview = previewable ? window.open("about:blank", "_blank") : null;
    if (preview) preview.opener = null;
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase!.storage
        .from("health-attachments")
        .download(item.file_path);
      if (error) throw new Error("Unable to open file.");
      const blob = data.slice(0, data.size, item.mime_type);
      const blobUrl = URL.createObjectURL(blob);
      if (previewable && preview) preview.location.href = blobUrl;
      else {
        preview?.close();
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = item.file_name;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (cause) {
      preview?.close();
      setError(cause instanceof Error ? cause.message : "Unable to open file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="attachment-item">
      {isImage ? (
        url ? (
          <button
            className="attachment-thumbnail"
            onClick={() => dialog.current?.showModal()}
            aria-label={`Open image ${item.file_name}`}
          >
            <img src={url} alt={item.file_name} />
          </button>
        ) : (
          <div className="attachment-icon">Image</div>
        )
      ) : (
        <div className="attachment-icon">
          <FileText aria-hidden size={26} />
        </div>
      )}
      <div className="attachment-info">
        <strong>{item.file_name}</strong>
        <span className="attachment-category">
          <DocumentCategoryPill name={categoryLabel(item.document_category)} />
        </span>
        <span>
          {item.file_name.split(".").pop()?.toUpperCase()} ·{" "}
          {(item.file_size / 1024 / 1024).toFixed(2)} MB
        </span>
        {showDescription && item.description && (
          <RichTextContent value={item.description} />
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}{" "}
            {isImage && (
              <button
                className="text-link"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Retry preview
              </button>
            )}
          </p>
        )}
      </div>
      <div className="attachment-actions">
        <button
          className="button secondary-button"
          onClick={open}
          disabled={loading}
          aria-label={`${previewable ? "Open" : "Download"} ${item.file_name}`}
        >
          {previewable ? <ExternalLink size={16} /> : <Download size={16} />}
          {loading ? "Opening…" : previewable ? "Open" : "Download"}
        </button>
      </div>
      {isImage && (
        <dialog
          ref={dialog}
          className="image-dialog"
          aria-label={item.file_name}
        >
          <button
            className="button secondary-button"
            onClick={() => dialog.current?.close()}
          >
            Close image
          </button>
          {url && <img src={url} alt={item.file_name} />}
        </dialog>
      )}
    </li>
  );
}

function groupedDocuments(items: Attachment[]) {
  const groups = new Map<string, Attachment[]>();
  for (const item of items) {
    const key = item.document_group_id || item.id;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

export function EventAttachments({
  eventId,
  onBusyChange,
}: {
  eventId: string;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [uploads, setUploads] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const base = `/api/v1/events/${eventId}/attachments`;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ attachments: Attachment[] }>(base);
      setItems(data.attachments);
      const uploadData = await apiFetch<{ attachments: Attachment[] }>(
        base + "/uploads",
      );
      setUploads(uploadData.attachments);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load documents.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    onBusyChange(false);
  }, [onBusyChange]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([
      apiFetch<{ attachments: Attachment[] }>(base, controller.signal),
      apiFetch<{ attachments: Attachment[] }>(
        base + "/uploads",
        controller.signal,
      ),
    ])
      .then(([data, uploadData]) => {
        if (active) {
          setItems(data.attachments);
          setUploads(uploadData.attachments);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load documents.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [base]);

  // Keep the page clean when the event has no linked documents. An error still
  // renders the section so the user can retry the document lookup.
  if (!loading && !items.length && !uploads.length && !error) return null;

  return (
    <section
      className="card attachments-section"
      aria-labelledby="documents-title"
    >
      <div className="attachments-heading">
        <div>
          <h2 id="documents-title">
            <Paperclip size={20} /> Documents
          </h2>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          <button className="text-link" onClick={load}>
            Refresh documents
          </button>
        </p>
      )}
      {loading ? (
        <p role="status">Loading documents…</p>
      ) : (
        <>
          {uploads.length > 0 && (
            <>
              <h3>Uploaded files</h3>
              <ul className="attachment-list">
                {uploads.map((item) => (
                  <AttachmentItem key={item.id} item={item} />
                ))}
              </ul>
            </>
          )}
          {items.length > 0 && (
            <>
              <h3>Documents</h3>
              <div className="event-document-groups">
                {groupedDocuments(items).map(([groupId, files]) => (
                  <section className="event-document-group" key={groupId}>
                    <div className="event-document-group-heading">
                      <div
                        className="event-document-title"
                        role="heading"
                        aria-level={4}
                      >
                        {files[0].description ? (
                          <RichTextContent value={files[0].description} />
                        ) : (
                          documentTitle(files[0])
                        )}
                      </div>
                    </div>
                    <ul className="attachment-list">
                      {files.map((item) => (
                        <AttachmentItem
                          key={item.id}
                          item={item}
                          showDescription={false}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
