"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, Pencil, Trash2 } from "lucide-react";
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
import { DocumentCategoryPill } from "../ui/labels";
import { CustomSelect } from "../ui/pickers";

export type PendingDocument = {
  file: File;
  mimeType: string;
  documentType: DocumentCategory;
  description: string;
};

export async function uploadPendingDocument(
  eventId: string,
  pending: PendingDocument,
) {
  const base = `/api/v1/events/${eventId}/attachments`;
  let reserved: Attachment | undefined;
  try {
    reserved = (
      await apiFetch<{ attachment: Attachment }>(base, undefined, {
        method: "POST",
        body: {
          file_name: pending.file.name,
          mime_type: pending.mimeType,
          file_size: pending.file.size,
          document_category: pending.documentType,
          description: pending.description.trim() || null,
        },
      })
    ).attachment;
    const { error } = await supabase!.storage
      .from("health-attachments")
      .upload(reserved.file_path, pending.file, {
        contentType: pending.mimeType,
        upsert: false,
        cacheControl: "0",
      });
    if (error) throw new Error("Document upload failed.");
    return reserved;
  } catch (cause) {
    if (reserved)
      await apiFetch(`${base}/${reserved.id}`, undefined, {
        method: "DELETE",
      }).catch(() => {});
    throw cause;
  }
}

export function PendingDocumentPicker({
  value,
  onChange,
  disabled,
}: {
  value: PendingDocument | null;
  onChange: (value: PendingDocument | null) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentCategory>("other");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function close() {
    dialog.current?.close();
    setFile(null);
    setDescription("");
    setDocumentType("other");
    if (input.current) input.current.value = "";
  }

  function choose(chosen: File) {
    const mimeType =
      chosen.type ||
      attachmentTypes[chosen.name.split(".").pop()?.toLowerCase() ?? ""] ||
      "";
    const issue = attachmentError(chosen.name, chosen.size, mimeType);
    if (issue) {
      setError(issue);
      if (input.current) input.current.value = "";
      return;
    }
    setError("");
    setFile(chosen);
    setDocumentType(value?.documentType ?? "other");
    setDescription(value?.description ?? "");
    dialog.current?.showModal();
  }

  return (
    <section className="event-document-field">
      <div className="event-document-heading">
        <div>
          <h2>Document</h2>
          <p className="form-hint">
            Optional · PDF, image, or document · Up to 10 MB
          </p>
        </div>
        <button
          type="button"
          className="button secondary-button"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <Paperclip size={16} /> {value ? "Replace" : "Add document"}
        </button>
      </div>
      <input
        ref={input}
        className="sr-only"
        type="file"
        aria-label="Choose document"
        accept={Object.keys(attachmentTypes)
          .map((extension) => `.${extension}`)
          .join(",")}
        disabled={disabled}
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) choose(chosen);
        }}
      />
      {value && (
        <div className="pending-document">
          <FileText size={22} aria-hidden="true" />
          <div>
            <strong>{value.file.name}</strong>
            <span>
              <DocumentCategoryPill name={categoryLabel(value.documentType)} />
              {(value.file.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Edit document details"
            title="Edit"
            disabled={disabled}
            onClick={() => {
              setFile(value.file);
              setDocumentType(value.documentType);
              setDescription(value.description);
              dialog.current?.showModal();
            }}
          >
            <Pencil size={16} />
          </button>
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
        className="delete-dialog attachment-upload-dialog"
        aria-labelledby="new-event-document-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h2 id="new-event-document-title">Add document</h2>
        <p className="form-hint">{file?.name}</p>
        <div className="field">
          <label htmlFor="new-event-document-type">Document type</label>
          <CustomSelect
            id="new-event-document-type"
            value={documentType}
            onChange={(value) => setDocumentType(value as DocumentCategory)}
            options={documentCategories.map((type) => ({
              value: type,
              label: categoryLabel(type),
            }))}
          />
        </div>
        <div className="field">
          <label htmlFor="new-event-document-description">
            Description <span>Optional</span>
          </label>
          <textarea
            id="new-event-document-description"
            value={description}
            maxLength={2000}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
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
            disabled={!file}
            onClick={() => {
              if (!file) return;
              const mimeType =
                file.type ||
                attachmentTypes[
                  file.name.split(".").pop()?.toLowerCase() ?? ""
                ] ||
                "";
              onChange({ file, mimeType, documentType, description });
              close();
            }}
          >
            Add document
          </button>
        </div>
      </dialog>
    </section>
  );
}
