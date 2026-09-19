"use client";

import { Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import {
  attachmentTypes,
  documentCategories,
  type DocumentCategory,
} from "@/lib/attachments";
import { categoryLabel } from "@/lib/documents";
import { EventLabelEditor } from "./tracker/event-label-editor";
import { CustomSelect } from "./ui/pickers";
import { RichTextEditor } from "./ui/rich-text";

export function DocumentFormFields({
  idPrefix,
  documentType,
  description,
  tagIds,
  file,
  files,
  disabled,
  relatedEvent,
  onDocumentType,
  onDescription,
  onTags,
  onFile,
  onFiles,
  multiple = false,
  onTagBusyChange,
  fileInputKey,
}: {
  idPrefix: string;
  documentType: DocumentCategory;
  description: string;
  tagIds: string[];
  file: File | null;
  files?: File[];
  disabled: boolean;
  relatedEvent?: ReactNode;
  onDocumentType: (value: DocumentCategory) => void;
  onDescription: (value: string) => void;
  onTags: (ids: string[]) => void;
  onFile: (file: File | null) => void;
  onFiles?: (files: File[]) => void;
  multiple?: boolean;
  onTagBusyChange: (busy: boolean) => void;
  fileInputKey?: number;
}) {
  const typeId = `${idPrefix}-type`;
  const descriptionId = `${idPrefix}-description`;
  const fileId = `${idPrefix}-file`;

  return (
    <div className="document-form-grid">
      <div className="field document-form-type">
        <label htmlFor={typeId}>Document type</label>
        <CustomSelect
          id={typeId}
          value={documentType}
          disabled={disabled}
          onChange={(value) => onDocumentType(value as DocumentCategory)}
          options={documentCategories.map((type) => ({
            value: type,
            label: categoryLabel(type),
          }))}
        />
      </div>
      {relatedEvent}
      <div className="field document-form-description">
        <label htmlFor={descriptionId}>Description</label>
        <RichTextEditor
          id={descriptionId}
          value={description}
          disabled={disabled}
          onChange={onDescription}
        />
      </div>
      <div className="document-form-tags">
        <EventLabelEditor
          id={`${idPrefix}-tags`}
          showHeading={false}
          onBusyChange={onTagBusyChange}
          tagIds={tagIds}
          onTags={onTags}
        />
      </div>
      <div className="field document-form-file">
        <label htmlFor={fileId}>Upload file</label>
        <label className="file-choice" htmlFor={fileId}>
          <Paperclip size={17} aria-hidden="true" />
          <span>
            {multiple
              ? files?.length
                ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
                : "Choose files"
              : (file?.name ?? "Choose file")}
          </span>
        </label>
        <input
          key={fileInputKey}
          id={fileId}
          className="sr-only"
          type="file"
          multiple={multiple}
          disabled={disabled}
          accept={Object.keys(attachmentTypes)
            .map((extension) => `.${extension}`)
            .join(",")}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (multiple && onFiles) onFiles(files);
            else onFile(files[0] ?? null);
          }}
        />
      </div>
    </div>
  );
}
