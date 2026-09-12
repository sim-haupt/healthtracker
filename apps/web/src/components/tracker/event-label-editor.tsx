"use client";
import { useState } from "react";
import { useTracker } from "./context";
export function EventLabelEditor({
  categoryId,
  tagIds,
  onCategory,
  onTags,
  fieldErrors = {},
  onBusyChange,
}: {
  fieldErrors?: Record<string, string>;
  onBusyChange: (busy: boolean) => void;
  categoryId: string;
  tagIds: string[];
  onCategory: (id: string) => void;
  onTags: (ids: string[]) => void;
}) {
  const {
    categories,
    tags,
    createLabel,
    labelError,
    labelsLoading,
    reloadLabels,
  } = useTracker();
  const [categoryName, setCategoryName] = useState(""),
    [tagName, setTagName] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function create(kind: "categories" | "tags") {
    const name = (kind === "tags" ? tagName : categoryName).trim();
    if (!name) {
      setError("Enter a name first.");
      return;
    }
    if (busy) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const label = await createLabel(kind, name);
      if (kind === "tags") {
        onTags([...new Set([...tagIds, label.id])]);
        setTagName("");
      } else {
        onCategory(label.id);
        setCategoryName("");
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create the label.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="event-label-editor">
      <h2>Category & tags</h2>

      {labelError && (
        <p className="field-error" role="alert">
          {labelError}{" "}
          <button type="button" className="text-link" onClick={reloadLabels}>
            Retry
          </button>
        </p>
      )}
      <div className="form-field">
        <label htmlFor="event-category">Category</label>
        <select
          id="event-category"
          aria-invalid={!!fieldErrors.category_id}
          aria-describedby={
            fieldErrors.category_id ? "category_id-error" : undefined
          }
          value={categoryId}
          onChange={(e) => onCategory(e.target.value)}
          disabled={labelsLoading}
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {fieldErrors.category_id && (
        <p id="category_id-error" className="field-error">
          {fieldErrors.category_id}
        </p>
      )}
      <details className="create-label">
        <summary>Create a category</summary>
        <div className="inline-create">
          <label className="sr-only" htmlFor="new-category-name">
            New category name
          </label>
          <input
            id="new-category-name"
            value={categoryName}
            maxLength={100}
            placeholder="Category name"
            onChange={(e) => setCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void create("categories");
              }
            }}
          />
          <button
            className="button secondary-button"
            type="button"
            disabled={busy || !categoryName.trim()}
            onClick={() => void create("categories")}
          >
            Add category
          </button>
        </div>
      </details>
      <fieldset className="filter-tags">
        <legend>
          Tags <span>Choose up to 20</span>
        </legend>
        <div className="tag-options">
          {tags.map((tag) => (
            <label
              className={`tag-option ${tagIds.includes(tag.id) ? "selected" : ""}`}
              key={tag.id}
            >
              <input
                type="checkbox"
                checked={tagIds.includes(tag.id)}
                disabled={
                  busy || (!tagIds.includes(tag.id) && tagIds.length >= 20)
                }
                onChange={(e) =>
                  onTags(
                    e.target.checked
                      ? [...tagIds, tag.id]
                      : tagIds.filter((id) => id !== tag.id),
                  )
                }
              />
              {tag.name}
            </label>
          ))}
        </div>
      </fieldset>
      {fieldErrors.tag_ids && (
        <p className="field-error" role="alert">
          {fieldErrors.tag_ids}
        </p>
      )}
      <div className="inline-create">
        <label className="sr-only" htmlFor="new-tag-name">
          New tag name
        </label>
        <input
          id="new-tag-name"
          value={tagName}
          maxLength={100}
          placeholder="Create your own tag"
          onChange={(e) => setTagName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (tagIds.length < 20) void create("tags");
            }
          }}
        />
        <button
          className="button secondary-button"
          type="button"
          disabled={busy || !tagName.trim() || tagIds.length >= 20}
          onClick={() => void create("tags")}
        >
          Add tag
        </button>
      </div>
      {busy && (
        <p role="status" className="muted">
          Saving label…
        </p>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  );
}
