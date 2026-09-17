"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileText, Paperclip } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { type Attachment } from "@/lib/attachments";
import { categoryLabel } from "@/lib/documents";
import { DocumentCategoryPill } from "../ui/labels";
import { RichTextContent } from "../ui/rich-text";

function AttachmentItem({ item }: { item: Attachment }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const isImage = item.mime_type.startsWith("image/");

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
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load preview.");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.file_path, isImage, attempt]);

  async function download() {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase!.storage
        .from("health-attachments")
        .download(item.file_path);
      if (error) throw new Error("Unable to download.");
      const blobUrl = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = item.file_name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to download.");
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
        {item.description && <RichTextContent value={item.description} />}
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
          onClick={download}
          disabled={loading}
          aria-label={`Download ${item.file_name}`}
        >
          <Download size={16} />
          {loading ? "Downloading…" : "Download"}
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

export function EventAttachments({
  eventId,
  onBusyChange,
}: {
  eventId: string;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const base = `/api/v1/events/${eventId}/attachments`;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ attachments: Attachment[] }>(base);
      setItems(data.attachments);
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
    apiFetch<{ attachments: Attachment[] }>(base, controller.signal)
      .then((data) => {
        if (active) setItems(data.attachments);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load documents.",
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
      ) : items.length ? (
        <ul className="attachment-list">
          {items.map((item) => (
            <AttachmentItem key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="attachment-empty">No documents</p>
      )}
    </section>
  );
}
