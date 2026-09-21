"use client";

import { useRef, useState, type FormEvent } from "react";
import { Pencil, Save } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  documentCategories,
  type Attachment,
  type DocumentCategory,
} from "@/lib/attachments";
import { categoryLabel } from "@/lib/documents";
import { useToast } from "./ui/feedback";
import { CustomSelect } from "./ui/pickers";
import { RichTextEditor } from "./ui/rich-text";
import { useProviders } from "./providers-context";

export function DocumentEditButton({
  document,
  onUpdated,
}: {
  document: Pick<
    Attachment,
    "document_group_id" | "document_category" | "description" | "provider_id"
  >;
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
  const [error, setError] = useState("");

  function beginEdit() {
    setDocumentType(document.document_category);
    setDescription(document.description ?? "");
    setProviderId(document.provider_id ?? "");
    setError("");
    dialog.current?.showModal();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(
        `/api/v1/documents/${document.document_group_id}`,
        undefined,
        {
          method: "PUT",
          body: {
            document_category: documentType,
            description: description.trim() || null,
            provider_id: providerId || null,
          },
        },
      );
      dialog.current?.close();
      toast("Document updated.");
      onUpdated();
    } catch (cause) {
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
      <button
        type="button"
        className="button secondary-button"
        onClick={beginEdit}
      >
        <Pencil size={16} /> Edit
      </button>
      <dialog
        ref={dialog}
        className="delete-dialog structured-form-dialog document-edit-dialog"
        aria-labelledby={`edit-document-${document.document_group_id}`}
        onCancel={(cancel) => {
          if (busy) cancel.preventDefault();
        }}
      >
        <h2 id={`edit-document-${document.document_group_id}`}>
          Edit document
        </h2>
        <form onSubmit={save}>
          <div className="field">
            <label htmlFor={`edit-document-type-${document.document_group_id}`}>
              Document type
            </label>
            <CustomSelect
              id={`edit-document-type-${document.document_group_id}`}
              value={documentType}
              disabled={busy}
              onChange={(value) => setDocumentType(value as DocumentCategory)}
              options={documentCategories.map((category) => ({
                value: category,
                label: categoryLabel(category),
              }))}
            />
          </div>
          <div className="field">
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
                ...(providerId &&
                !providers.providers.some(
                  (provider) => provider.id === providerId,
                )
                  ? [
                      {
                        value: providerId,
                        label: "Previously selected provider",
                      },
                    ]
                  : []),
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
          <div className="field">
            <label
              htmlFor={`edit-document-description-${document.document_group_id}`}
            >
              Description
            </label>
            <RichTextEditor
              id={`edit-document-description-${document.document_group_id}`}
              value={description}
              disabled={busy}
              onChange={setDescription}
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
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button className="button" disabled={busy}>
              <Save size={16} /> {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
