"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  attachmentError,
  attachmentTypes,
  type Attachment,
  type DocumentCategory,
} from "@/lib/attachments";
import { categoryLabel, type HealthDocument } from "@/lib/documents";
import { DocumentCategoryPill } from "../ui/labels";
import { CustomSelect } from "../ui/pickers";
import { DocumentFormFields } from "../document-form-fields";

export type PendingDocument = {
  file: File;
  mimeType: string;
  documentType: DocumentCategory;
  description: string;
  tagIds: string[];
};

export type EventDocumentSelection =
  | { source: "new"; document: PendingDocument }
  | { source: "existing"; document: HealthDocument };

export async function uploadPendingDocument(
  eventId: string,
  pending: PendingDocument,
  attachmentKind: "document" | "event_upload" = "document",
) {
  const base = "/api/v1/events/" + eventId + "/attachments";
  let reserved: Attachment | null = null;
  try {
    const result = await apiFetch<{ attachment: Attachment }>(base, undefined, {
      method: "POST",
      body: {
        file_name: pending.file.name,
        mime_type: pending.mimeType,
        file_size: pending.file.size,
        document_category: pending.documentType,
        ...(attachmentKind === "event_upload"
          ? { attachment_kind: attachmentKind }
          : {}),
        description: pending.description || null,
        tag_ids: pending.tagIds,
      },
    });
    reserved = result.attachment;
    if (!supabase) throw new Error("File storage is not configured.");
    const storageClient = supabase;
    const uploadFile =
      pending.file.type === pending.mimeType
        ? pending.file
        : new File([pending.file], pending.file.name, {
            type: pending.mimeType,
            lastModified: pending.file.lastModified,
          });
    const upload = () =>
      storageClient.storage
        .from("health-attachments")
        .upload(reserved!.file_path, uploadFile, {
          contentType: pending.mimeType,
          upsert: false,
          cacheControl: "0",
        });
    let { error } = await upload();
    const uploadStatus = Number(
      (error as { statusCode?: string | number } | null)?.statusCode,
    );
    if (error && uploadStatus === 401) {
      const refreshed = await storageClient.auth.refreshSession();
      if (!refreshed.error && refreshed.data.session)
        ({ error } = await upload());
    }
    if (error) {
      const reason = /row.level|permission/i.test(error.message)
        ? "File storage rejected the upload. Please try again shortly."
        : /unauthor|jwt/i.test(error.message)
          ? "Your session could not authorize this upload. Refresh the page and retry."
          : error.message;
      throw new Error(`Document upload failed. ${reason}`);
    }
    return reserved;
  } catch (cause) {
    if (reserved)
      await apiFetch(base + "/" + reserved.id, undefined, {
        method: "DELETE",
      }).catch(() => {});
    throw cause;
  }
}

export async function attachExistingDocument(
  eventId: string,
  document: HealthDocument,
) {
  const result = await apiFetch<{ attachment: Attachment }>(
    `/api/v1/events/${eventId}/attachments/link`,
    undefined,
    {
      method: "POST",
      body: { document_id: document.id },
    },
  );
  return result.attachment;
}

export function PendingDocumentPicker({
  value,
  onChange,
  disabled,
  profileId,
  currentEventId,
}: {
  value: EventDocumentSelection | null;
  onChange: (value: EventDocumentSelection | null) => void;
  disabled: boolean;
  profileId: string;
  currentEventId?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentCategory>("other");
  const [description, setDescription] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagBusy, setTagBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState<HealthDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingDocuments(true);
    setError("");
    apiFetch<{ documents: HealthDocument[] }>(
      "/api/v1/documents/search",
      controller.signal,
      {
        method: "POST",
        body: {
          ...(profileId ? { profile_id: profileId } : {}),
          page: 1,
          page_size: 100,
        },
      },
    )
      .then((result) =>
        setDocuments(
          result.documents.filter(
            (document) => document.health_event_id !== currentEventId,
          ),
        ),
      )
      .catch((cause: Error) => {
        if (!controller.signal.aborted)
          setError(cause.message || "Unable to load documents.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDocuments(false);
      });
    return () => controller.abort();
  }, [currentEventId, profileId]);

  function close() {
    dialog.current?.close();
    setFile(null);
    setDescription("");
    setTagIds([]);
    setDocumentType("other");
    setFileInputKey((key) => key + 1);
  }

  function choose(chosen: File) {
    const mimeType =
      chosen.type ||
      attachmentTypes[chosen.name.split(".").pop()?.toLowerCase() ?? ""] ||
      "";
    const issue = attachmentError(chosen.name, chosen.size, mimeType);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    setFile(chosen);
    if (value?.source === "new") {
      setDocumentType(value.document.documentType);
      setDescription(value.document.description);
      setTagIds(value.document.tagIds);
    }
  }

  const selected = value?.document;
  const selectedName =
    value?.source === "new"
      ? value.document.file.name
      : value?.source === "existing"
        ? value.document.file_name
        : "";
  const selectedSize =
    value?.source === "new"
      ? value.document.file.size
      : value?.source === "existing"
        ? value.document.file_size
        : 0;
  const selectedCategory =
    value?.source === "new"
      ? value.document.documentType
      : value?.source === "existing"
        ? value.document.document_category
        : "other";

  return (
    <div className="event-document-field">
      <div className="event-document-controls">
        <div className="form-field">
          <label htmlFor="existing-event-document">Document</label>
          <CustomSelect
            id="existing-event-document"
            value={value?.source === "existing" ? value.document.id : ""}
            disabled={disabled || loadingDocuments}
            placeholder="Select document"
            onChange={(id) => {
              const document = documents.find((item) => item.id === id);
              onChange(document ? { source: "existing", document } : null);
            }}
            options={[
              {
                value: "",
                label: loadingDocuments
                  ? "Loading documents…"
                  : documents.length
                    ? "Select document"
                    : "No documents",
              },
              ...documents.map((document) => ({
                value: document.id,
                label: document.file_name + " · " + document.event_title,
              })),
            ]}
          />
        </div>
        <span className="document-choice-or">or</span>
        <div className="provider-add-row document-add-row">
          <button
            type="button"
            className="text-link"
            disabled={disabled}
            onClick={() => {
              setError("");
              dialog.current?.showModal();
            }}
          >
            <Plus size={14} aria-hidden="true" /> Add document
          </button>
        </div>
      </div>
      {selected && (
        <div className="pending-document">
          <FileText size={22} aria-hidden="true" />
          <div>
            <strong>{selectedName}</strong>
            <span>
              <DocumentCategoryPill name={categoryLabel(selectedCategory)} />
              {(selectedSize / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
          {value?.source === "new" && (
            <button
              type="button"
              className="icon-button"
              aria-label="Edit document details"
              title="Edit"
              disabled={disabled}
              onClick={() => {
                setFile(value.document.file);
                setDocumentType(value.document.documentType);
                setDescription(value.document.description);
                setTagIds(value.document.tagIds);
                dialog.current?.showModal();
              }}
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            type="button"
            className="icon-button danger-icon"
            aria-label="Remove document"
            title="Delete"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        className="delete-dialog attachment-upload-dialog form-dialog shared-document-dialog"
        aria-labelledby="new-event-document-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h2 id="new-event-document-title">Add document</h2>
        <DocumentFormFields
          idPrefix="new-event-document"
          documentType={documentType}
          description={description}
          tagIds={tagIds}
          file={file}
          disabled={disabled || tagBusy}
          fileInputKey={fileInputKey}
          onDocumentType={setDocumentType}
          onDescription={setDescription}
          onTags={setTagIds}
          onTagBusyChange={setTagBusy}
          onFile={(chosen) => {
            if (chosen) choose(chosen);
            else setFile(null);
          }}
        />
        <div className="form-actions">
          <button
            type="button"
            className="button secondary-button"
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button"
            disabled={!file || tagBusy}
            onClick={() => {
              if (!file) return;
              const mimeType =
                file.type ||
                attachmentTypes[
                  file.name.split(".").pop()?.toLowerCase() ?? ""
                ] ||
                "";
              onChange({
                source: "new",
                document: {
                  file,
                  mimeType,
                  documentType,
                  description,
                  tagIds,
                },
              });
              close();
            }}
          >
            Add document
          </button>
        </div>
      </dialog>
    </div>
  );
}
