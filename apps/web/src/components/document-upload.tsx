"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { eventDisplayTitle, type EventSummary } from "@/lib/events";
import {
  attachmentError,
  attachmentTypes,
  type DocumentCategory,
} from "@/lib/attachments";
import { formatDate } from "@/lib/date-format";
import type { HealthProfile } from "./app-shell";
import { ProfileIdentity } from "./ui/profile-avatar";
import { useToast } from "./ui/feedback";
import { uploadPendingDocument } from "./events/pending-document";
import { CustomSelect } from "./ui/pickers";
import { DocumentFormFields } from "./document-form-fields";

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
  const [files, setFiles] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState<DocumentCategory>("other");
  const [description, setDescription] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagBusy, setTagBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedEvent = events.find((event) => event.id === eventId);
  const selectedProfile = profiles.find(
    (profile) => profile.id === selectedEvent?.profile_id,
  );

  function reset() {
    setEventId("");
    setFiles([]);
    setDocumentType("other");
    setDescription("");
    setTagIds([]);
    setFileInputKey((key) => key + 1);
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
    if (!files.length) {
      setError("Choose a document.");
      return;
    }
    const validated = files.map((file) => {
      const mimeType =
        file.type ||
        attachmentTypes[file.name.split(".").pop()?.toLowerCase() ?? ""] ||
        "";
      return {
        file,
        mimeType,
        issue: attachmentError(file.name, file.size, mimeType),
      };
    });
    const issue = validated.find((item) => item.issue)?.issue;
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (const item of validated)
        await uploadPendingDocument(eventId, {
          file: item.file,
          mimeType: item.mimeType,
          documentType,
          description,
          tagIds,
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
        className="delete-dialog attachment-upload-dialog document-upload-dialog structured-form-dialog"
        aria-labelledby="document-upload-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h2 id="document-upload-title">Upload document</h2>
        <form onSubmit={upload}>
          <DocumentFormFields
            idPrefix="upload-document"
            documentType={documentType}
            description={description}
            tagIds={tagIds}
            file={files[0] ?? null}
            files={files}
            multiple
            disabled={busy || tagBusy}
            fileInputKey={fileInputKey}
            onDocumentType={setDocumentType}
            onDescription={setDescription}
            onTags={setTagIds}
            onTagBusyChange={setTagBusy}
            onFile={(chosen) => {
              setFiles(chosen ? [chosen] : []);
              if (!chosen) return;
              const mimeType =
                chosen.type ||
                attachmentTypes[
                  chosen.name.split(".").pop()?.toLowerCase() ?? ""
                ] ||
                "";
              setError(
                attachmentError(chosen.name, chosen.size, mimeType) ?? "",
              );
            }}
            onFiles={(chosen) => {
              setFiles(chosen);
              setError("");
            }}
            relatedEvent={
              <div className="field document-form-event">
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
                      label: `${eventDisplayTitle(event)} · ${formatDate(event.event_date)}`,
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
            }
          />
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
              disabled={busy || tagBusy || loading || !events.length}
            >
              <Upload size={16} /> {busy ? "Uploading…" : "Upload document"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
