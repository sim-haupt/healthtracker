"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Paperclip, Upload } from "lucide-react";
import type { EventSummary } from "@/lib/events";
import {
  attachmentError,
  attachmentTypes,
  documentCategories,
  type DocumentCategory,
} from "@/lib/attachments";
import { categoryLabel } from "@/lib/documents";
import { formatDate } from "@/lib/date-format";
import type { HealthProfile } from "./app-shell";
import { ProfileIdentity } from "./ui/profile-avatar";
import { useToast } from "./ui/feedback";
import { uploadPendingDocument } from "./events/pending-document";
import { CustomSelect } from "./ui/pickers";

export function DocumentUpload({
  events,
  profiles,
  loading,
  loadError,
  retryEvents,
  onUploaded,
}: {
  events: EventSummary[];
  profiles: HealthProfile[];
  loading: boolean;
  loadError?: string;
  retryEvents: () => void;
  onUploaded: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const [eventId, setEventId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentCategory>("other");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedEvent = events.find((event) => event.id === eventId);
  const selectedProfile = profiles.find(
    (profile) => profile.id === selectedEvent?.profile_id,
  );

  function reset() {
    setEventId("");
    setFile(null);
    setDocumentType("other");
    setDescription("");
    setError("");
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
    reset();
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!eventId) {
      setError("Choose a related event.");
      return;
    }
    if (!file) {
      setError("Choose a document.");
      return;
    }
    const mimeType =
      file.type ||
      attachmentTypes[file.name.split(".").pop()?.toLowerCase() ?? ""] ||
      "";
    const issue = attachmentError(file.name, file.size, mimeType);
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await uploadPendingDocument(eventId, {
        file,
        mimeType,
        documentType,
        description,
      });
      dialog.current?.close();
      reset();
      toast("Document uploaded.");
      onUploaded();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to upload document.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="button"
        onClick={() => dialog.current?.showModal()}
      >
        <Upload size={17} /> Upload document
      </button>
      <dialog
        ref={dialog}
        className="delete-dialog attachment-upload-dialog document-upload-dialog"
        aria-labelledby="document-upload-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h2 id="document-upload-title">Upload document</h2>
        <form onSubmit={upload}>
          <div className="field">
            <label htmlFor="upload-related-event">Related event</label>
            <CustomSelect
              id="upload-related-event"
              value={eventId}
              disabled={busy || loading}
              invalid={!!error && !eventId}
              onChange={(value) => {
                setEventId(value);
                setError("");
              }}
              options={[
                {
                  value: "",
                  label: loading
                    ? "Loading events…"
                    : events.length
                      ? "Choose an event"
                      : "No events available",
                },
                ...events.map((event) => ({
                  value: event.id,
                  label: `${event.title} · ${formatDate(event.event_date)}`,
                })),
              ]}
            />
            {selectedEvent && (
              <div className="selected-document-event">
                <ProfileIdentity
                  name={selectedProfile?.name ?? "Health profile"}
                  avatar={selectedProfile?.avatar}
                />
                <span>{selectedEvent.event_type}</span>
              </div>
            )}
            {loadError && (
              <p className="field-error" role="alert">
                {loadError}{" "}
                <button
                  type="button"
                  className="text-link"
                  onClick={retryEvents}
                >
                  Retry
                </button>
              </p>
            )}
            {!loading && !loadError && !events.length && (
              <Link className="text-link" href="/events/new">
                Add an event first
              </Link>
            )}
          </div>
          <div className="field">
            <label htmlFor="upload-document-file">Document</label>
            <label className="file-choice" htmlFor="upload-document-file">
              <Paperclip size={17} />
              <span>{file?.name ?? "Choose file"}</span>
            </label>
            <input
              id="upload-document-file"
              className="sr-only"
              type="file"
              required
              disabled={busy}
              accept={Object.keys(attachmentTypes)
                .map((extension) => `.${extension}`)
                .join(",")}
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                if (chosen) {
                  const mimeType =
                    chosen.type ||
                    attachmentTypes[
                      chosen.name.split(".").pop()?.toLowerCase() ?? ""
                    ] ||
                    "";
                  setError(
                    attachmentError(chosen.name, chosen.size, mimeType) ?? "",
                  );
                }
              }}
            />
            <p className="form-hint">PDF, image, or document · Up to 10 MB</p>
          </div>
          <div className="field">
            <label htmlFor="upload-document-type">Document type</label>
            <CustomSelect
              id="upload-document-type"
              value={documentType}
              disabled={busy}
              onChange={(value) => setDocumentType(value as DocumentCategory)}
              options={documentCategories.map((type) => ({
                value: type,
                label: categoryLabel(type),
              }))}
            />
          </div>
          <div className="field">
            <label htmlFor="upload-document-description">
              Description <span>Optional</span>
            </label>
            <textarea
              id="upload-document-description"
              value={description}
              maxLength={2000}
              rows={3}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
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
              onClick={close}
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={busy || loading || !events.length}
            >
              <Upload size={16} /> {busy ? "Uploading…" : "Upload document"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
