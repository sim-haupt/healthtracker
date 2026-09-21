"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Pencil, Save } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  attachmentError,
  attachmentTypes,
  type Attachment,
  type DocumentCategory,
} from "@/lib/attachments";
import type { HealthDocument } from "@/lib/documents";
import { eventDisplayTitle, type EventSummary } from "@/lib/events";
import { formatDate } from "@/lib/date-format";
import type { HealthProfile } from "./app-shell";
import { ProfileIdentity } from "./ui/profile-avatar";
import { useToast } from "./ui/feedback";
import { CustomSelect } from "./ui/pickers";
import { DocumentFormFields } from "./document-form-fields";
import { uploadPendingDocument } from "./events/pending-document";
import { useProviders } from "./providers-context";

function documentFiles(document: HealthDocument) {
  return document.files?.length ? document.files : [document];
}

export function DocumentEditButton({
  document,
  events,
  profiles,
  hideTrigger = false,
  openOnMount = false,
  onUpdated,
}: {
  document: HealthDocument;
  events: EventSummary[];
  profiles: HealthProfile[];
  hideTrigger?: boolean;
  openOnMount?: boolean;
  onUpdated: () => void;
}) {
  const toast = useToast();
  const providers = useProviders();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentCategory>(
    document.document_category,
  );
  const [description, setDescription] = useState(document.description ?? "");
  const [providerId, setProviderId] = useState(document.provider_id ?? "");
  const [eventId, setEventId] = useState(document.health_event_id);
  const [tagIds, setTagIds] = useState(document.tags.map((tag) => tag.id));
  const [tagBusy, setTagBusy] = useState(false);
  const [replacementFiles, setReplacementFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState("");
  const currentFiles = documentFiles(document);
  const availableEvents = useMemo(
    () => events.filter((event) => event.profile_id === document.profile_id),
    [document.profile_id, events],
  );
  const selectedEvent = availableEvents.find((event) => event.id === eventId);
  const selectedProfile = profiles.find(
    (profile) => profile.id === selectedEvent?.profile_id,
  );

  useEffect(() => {
    if (openOnMount) dialog.current?.showModal();
  }, [openOnMount]);

  function reset() {
    setDocumentType(document.document_category);
    setDescription(document.description ?? "");
    setProviderId(document.provider_id ?? "");
    setEventId(document.health_event_id);
    setTagIds(document.tags.map((tag) => tag.id));
    setReplacementFiles([]);
    setFileInputKey((key) => key + 1);
    setError("");
  }

  function beginEdit() {
    reset();
    dialog.current?.showModal();
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
    reset();
  }

  async function updateMetadata(groupId: string, relatedEventId: string) {
    if (!supabase) throw new Error("Document storage is not configured.");
    const { data, error: updateError } = await supabase.rpc(
      "update_health_document",
      {
        p_document_group_id: groupId,
        p_input: {
          event_id: relatedEventId,
          document_category: documentType,
          description: description.trim() || null,
          provider_id: providerId || null,
          tag_ids: tagIds,
        },
      },
    );
    if (updateError) throw new Error(updateError.message);
    if (!data) throw new Error("Document not found or no longer available.");
  }

  async function downloadCurrentFiles() {
    if (!supabase) throw new Error("Document storage is not configured.");
    const storageClient = supabase;
    return Promise.all(
      currentFiles.map(async (file) => {
        const { data, error: downloadError } = await storageClient.storage
          .from("health-attachments")
          .download(file.file_path);
        if (downloadError)
          throw new Error(`Unable to prepare ${file.file_name} for moving.`);
        return new File([data], file.file_name, { type: file.mime_type });
      }),
    );
  }

  async function removeFiles(files: Attachment[]) {
    const results = await Promise.allSettled(
      files.map((file) =>
        apiFetch(
          `/api/v1/events/${file.health_event_id}/attachments/${file.id}`,
          undefined,
          { method: "DELETE" },
        ),
      ),
    );
    if (results.some((result) => result.status === "rejected"))
      throw new Error(
        "Some previous files could not be removed. Please retry.",
      );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!eventId) {
      setError("Choose a related event.");
      return;
    }
    const selectedFiles = replacementFiles.map((file) => {
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
    const issue = selectedFiles.find((file) => file.issue)?.issue;
    if (issue) {
      setError(issue);
      return;
    }

    setBusy(true);
    setError("");
    const moving = eventId !== document.health_event_id;
    const replacing = replacementFiles.length > 0;
    const uploaded: Attachment[] = [];
    let replacementReady = false;
    try {
      if (!moving && !replacing) {
        await updateMetadata(document.document_group_id, eventId);
      } else {
        const files = replacing
          ? selectedFiles
          : (await downloadCurrentFiles()).map((file) => ({
              file,
              mimeType: file.type,
              issue: null,
            }));
        const groupId = crypto.randomUUID();
        for (const item of files)
          uploaded.push(
            await uploadPendingDocument(
              eventId,
              {
                file: item.file,
                mimeType: item.mimeType,
                documentType,
                description,
                providerId,
                tagIds,
              },
              "document",
              groupId,
            ),
          );
        await updateMetadata(groupId, eventId);
        replacementReady = true;
        await removeFiles(currentFiles);
      }
      dialog.current?.close();
      reset();
      toast("Document updated.");
      onUpdated();
    } catch (cause) {
      if (uploaded.length && !replacementReady)
        await Promise.allSettled(
          uploaded.map((file) =>
            apiFetch(
              `/api/v1/events/${file.health_event_id}/attachments/${file.id}`,
              undefined,
              { method: "DELETE" },
            ),
          ),
        );
      if (replacementReady) onUpdated();
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update document. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          className="button secondary-button"
          onClick={beginEdit}
        >
          <Pencil size={16} /> Edit
        </button>
      )}
      <dialog
        ref={dialog}
        className="delete-dialog attachment-upload-dialog document-upload-dialog structured-form-dialog document-edit-dialog"
        aria-labelledby={`edit-document-${document.document_group_id}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h2 id={`edit-document-${document.document_group_id}`}>
          Edit document
        </h2>
        <form onSubmit={save}>
          <DocumentFormFields
            idPrefix={`edit-document-${document.document_group_id}`}
            documentType={documentType}
            description={description}
            tagIds={tagIds}
            file={replacementFiles[0] ?? null}
            files={replacementFiles}
            multiple
            disabled={busy || tagBusy}
            fileInputKey={fileInputKey}
            emptyFileLabel={`Keep ${currentFiles.length} current file${currentFiles.length === 1 ? "" : "s"}`}
            onDocumentType={setDocumentType}
            onDescription={setDescription}
            onTags={setTagIds}
            onTagBusyChange={setTagBusy}
            onFile={(file) => setReplacementFiles(file ? [file] : [])}
            onFiles={setReplacementFiles}
            medicalProvider={
              <div className="field document-form-provider">
                <label
                  htmlFor={`edit-document-provider-${document.document_group_id}`}
                >
                  Medical provider
                </label>
                <CustomSelect
                  id={`edit-document-provider-${document.document_group_id}`}
                  value={providerId}
                  disabled={busy || providers.loading}
                  onChange={setProviderId}
                  options={[
                    { value: "", label: "Select medical provider" },
                    ...providers.providers.map((provider) => ({
                      value: provider.id,
                      label:
                        provider.name +
                        (provider.specialty ? ` · ${provider.specialty}` : ""),
                    })),
                  ]}
                />
                {providers.error && (
                  <p className="field-error" role="alert">
                    {providers.error}{" "}
                    <button
                      type="button"
                      className="text-link"
                      onClick={providers.reload}
                    >
                      Retry
                    </button>
                  </p>
                )}
              </div>
            }
            relatedEvent={
              <div className="field document-form-event">
                <label
                  htmlFor={`edit-document-event-${document.document_group_id}`}
                >
                  Related event
                </label>
                <CustomSelect
                  id={`edit-document-event-${document.document_group_id}`}
                  value={eventId}
                  disabled={busy}
                  onChange={setEventId}
                  options={availableEvents.map((event) => ({
                    value: event.id,
                    label: `${eventDisplayTitle(event)} · ${formatDate(event.event_date)}`,
                  }))}
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
              </div>
            }
          />
          {replacementFiles.length > 0 && (
            <p className="muted" role="status">
              Saving will replace all current files with the selected files.
            </p>
          )}
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
            <button className="button" disabled={busy || tagBusy}>
              <Save size={16} /> {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
