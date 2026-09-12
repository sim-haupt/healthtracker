"use client";
import { useToast } from "../ui/feedback";
import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Upload, Download, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  attachmentError,
  attachmentTypes,
  documentCategories,
  type Attachment,
  type DocumentCategory,
} from "@/lib/attachments";
import { categoryLabel } from "@/lib/documents";

function AttachmentItem({
  item,
  remove,
  disabled,
}: {
  item: Attachment;
  remove: () => void;
  disabled: boolean;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const isImage = item.mime_type.startsWith("image/");
  useEffect(() => {
    if (!isImage) return;
    let cancelled = false,
      objectUrl = "";
    setError("");
    void supabase!.storage
      .from("health-attachments")
      .download(item.file_path)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(
            "Preview unavailable. Retry or remove an incomplete upload.",
          );
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
      if (error)
        throw new Error(
          "Unable to download. Retry or remove an incomplete upload.",
        );
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
        <span className="category-pill attachment-category">
          {categoryLabel(item.document_category)}
        </span>
        <span>
          {item.file_name.split(".").pop()?.toUpperCase()} ·{" "}
          {(item.file_size / 1024 / 1024).toFixed(2)} MB
        </span>
        {item.description && <p>{item.description}</p>}
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
          disabled={loading || disabled}
          aria-label={`Download ${item.file_name}`}
        >
          <Download size={16} />
          {loading ? "Downloading…" : "Download"}
        </button>
        <button
          className="button danger-outline"
          disabled={disabled}
          onClick={remove}
          aria-label={`Delete ${item.file_name}`}
        >
          <Trash2 size={16} />
          <span className="sr-only">Delete</span>
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
  disabled = false,
}: {
  eventId: string;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [items, setItems] = useState<Attachment[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [pending, setPending] = useState<Attachment | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [documentCategory, setDocumentCategory] =
    useState<DocumentCategory>("other");
  const [description, setDescription] = useState("");
  const confirm = useRef<HTMLDialogElement>(null);
  const uploadDialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const base = `/api/v1/events/${eventId}/attachments`;
  async function load() {
    setLoading(true);
    setError("");
    try {
      setItems(
        (await apiFetch<{ attachments: Attachment[] }>(base)).attachments,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load attachments.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    apiFetch<{ attachments: Attachment[] }>(base, controller.signal)
      .then((data) => {
        if (active) setItems(data.attachments);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [base]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (busyRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function markBusy(value: boolean) {
    busyRef.current = value;
    setBusy(value);
    onBusyChange(value);
  }
  function closeUploadDialog() {
    uploadDialog.current?.close();
    setPendingFile(null);
    setDocumentCategory("other");
    setDescription("");
    if (input.current) input.current.value = "";
  }
  function prepareUpload(file: File) {
    const mime =
      file.type ||
      attachmentTypes[file.name.split(".").pop()?.toLowerCase() ?? ""] ||
      "";
    const validation = attachmentError(file.name, file.size, mime);
    if (validation) {
      setError(validation);
      if (input.current) input.current.value = "";
      return;
    }
    setError("");
    setPendingFile(file);
    uploadDialog.current?.showModal();
  }
  async function upload(file: File) {
    if (busyRef.current || disabled) return;
    const mime =
      file.type ||
      attachmentTypes[file.name.split(".").pop()?.toLowerCase() ?? ""] ||
      "";
    const validation = attachmentError(file.name, file.size, mime);
    if (validation) {
      setError(validation);
      return;
    }
    markBusy(true);
    setError("");
    setStatus(`Uploading ${file.name}…`);
    let reserved: Attachment | undefined;
    try {
      reserved = (
        await apiFetch<{ attachment: Attachment }>(base, undefined, {
          method: "POST",
          body: {
            file_name: file.name,
            mime_type: mime,
            file_size: file.size,
            document_category: documentCategory,
            description: description.trim() || null,
          },
        })
      ).attachment;
      const { error: storageError } = await supabase!.storage
        .from("health-attachments")
        .upload(reserved.file_path, file, {
          contentType: mime,
          upsert: false,
          cacheControl: "0",
        });
      if (storageError)
        throw new Error("Upload failed. Check your connection and try again.");
      setItems((previous) => [...previous, reserved!]);
      setStatus("Attachment uploaded.");
      toast("Attachment uploaded.");
      closeUploadDialog();
    } catch (cause) {
      let message =
        cause instanceof Error ? cause.message : "Unable to upload attachment.";
      if (reserved) {
        try {
          await apiFetch(`${base}/${reserved.id}`, undefined, {
            method: "DELETE",
          });
        } catch {
          setItems((previous) => [...previous, reserved!]);
          message +=
            " An incomplete upload remains. Use Delete to remove it before retrying.";
        }
      }
      setError(message);
      setStatus("");
      closeUploadDialog();
    } finally {
      markBusy(false);
    }
  }
  async function remove() {
    if (!pending || busyRef.current) return;
    markBusy(true);
    setError("");
    try {
      await apiFetch(`${base}/${pending.id}`, undefined, { method: "DELETE" });
      setItems((previous) => previous.filter((item) => item.id !== pending.id));
      confirm.current?.close();
      setPending(null);
      setStatus("Attachment deleted.");
      toast("Attachment deleted.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to delete attachment.",
      );
      confirm.current?.close();
    } finally {
      markBusy(false);
    }
  }
  return (
    <section
      className="card attachments-section"
      aria-labelledby="attachments-title"
    >
      <div className="attachments-heading">
        <div>
          <h2 id="attachments-title">
            <Paperclip size={20} /> Attachments
          </h2>
        </div>
        <button
          className="button secondary-button"
          disabled={busy || loading || disabled}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          {busy ? "Working…" : "Upload file"}
        </button>
      </div>
      <input
        ref={input}
        className="sr-only"
        type="file"
        aria-label="Choose attachment"
        accept={Object.keys(attachmentTypes)
          .map((ext) => "." + ext)
          .join(",")}
        disabled={busy || disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) prepareUpload(file);
        }}
      />
      <p className="form-hint">
        PDF, images, or documents · Up to 10 MB · Private
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          <button className="text-link" disabled={busy} onClick={load}>
            Refresh attachments
          </button>
        </p>
      )}
      {status && (
        <p role="status" className="form-hint">
          {status}
        </p>
      )}
      {loading ? (
        <p role="status">Loading attachments…</p>
      ) : items.length ? (
        <ul className="attachment-list">
          {items.map((item) => (
            <AttachmentItem
              key={item.id}
              item={item}
              disabled={busy || disabled}
              remove={() => {
                setPending(item);
                confirm.current?.showModal();
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="attachment-empty">No attachments</p>
      )}
      <dialog
        ref={uploadDialog}
        className="delete-dialog attachment-upload-dialog"
        aria-labelledby="attachment-upload-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) closeUploadDialog();
        }}
      >
        <h2 id="attachment-upload-title">Upload document</h2>
        <p className="form-hint">{pendingFile?.name}</p>
        <div className="field">
          <label htmlFor="attachment-category">Category</label>
          <select
            id="attachment-category"
            value={documentCategory}
            disabled={busy}
            onChange={(event) =>
              setDocumentCategory(event.target.value as DocumentCategory)
            }
          >
            {documentCategories.map((category) => (
              <option value={category} key={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="attachment-description">
            Description <span>Optional</span>
          </label>
          <textarea
            id="attachment-description"
            value={description}
            maxLength={2000}
            rows={3}
            disabled={busy}
            placeholder="What this document contains"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="form-actions">
          <button
            className="button secondary-button"
            disabled={busy}
            onClick={closeUploadDialog}
          >
            Cancel
          </button>
          <button
            className="button"
            disabled={busy || !pendingFile}
            onClick={() => pendingFile && void upload(pendingFile)}
          >
            <Upload size={16} />
            {busy ? "Uploading…" : "Upload document"}
          </button>
        </div>
      </dialog>
      <dialog
        ref={confirm}
        className="delete-dialog"
        aria-labelledby="attachment-delete-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <h2 id="attachment-delete-title">Delete attachment?</h2>
        <p>“{pending?.file_name}” will be permanently removed.</p>
        <div className="form-actions">
          <button
            className="button secondary-button"
            disabled={busy}
            onClick={() => confirm.current?.close()}
          >
            Cancel
          </button>
          <button
            className="button danger-button"
            disabled={busy}
            onClick={remove}
          >
            {busy ? "Deleting…" : "Delete file"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
