"use client";
import { useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import type { Label } from "@/lib/tracker";
import { useTracker } from "./context";

function LabelPicker({
  items,
  selected,
  onSelect,
  onCreate,
  disabled,
  error,
  id,
}: {
  items: Label[];
  selected: string[];
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  disabled: boolean;
  error?: string;
  id: string;
}) {
  const [query, setQuery] = useState("");
  const term = query.trim();
  const normalized = term.toLocaleLowerCase();
  const exact = items.find(
    (item) => item.name.toLocaleLowerCase() === normalized,
  );
  const sorted = [...items].sort(
    (a, b) =>
      (b.usage_count ?? 0) - (a.usage_count ?? 0) ||
      a.name.localeCompare(b.name),
  );
  const commonIds = new Set(sorted.slice(0, 10).map((item) => item.id));
  const visiblePills = sorted.filter(
    (item) => commonIds.has(item.id) || selected.includes(item.id),
  );
  const matches = sorted.filter((item) =>
    item.name.toLocaleLowerCase().includes(normalized),
  );
  const full = selected.length >= 20;
  function choose(itemId: string) {
    onSelect(itemId);
    setQuery("");
  }
  async function create() {
    if (await onCreate(term)) setQuery("");
  }
  return (
    <div className="form-field label-picker">
      <label htmlFor={id}>Tags</label>
      <div className="filter-bar-search form-search-field">
        <Search size={16} aria-hidden="true" />
        <input
          id={id}
          value={query}
          maxLength={100}
          autoComplete="off"
          placeholder="Search or create…"
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
            if (e.key === "Enter") {
              e.preventDefault();
              if (!term || disabled) return;
              if (exact) {
                if (!full || selected.includes(exact.id)) choose(exact.id);
              } else if (!full) void create();
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="search-clear-button"
            aria-label="Clear tag search"
            disabled={disabled}
            onClick={() => setQuery("")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {term && (
        <div className="label-search-results" aria-label="Tag search results">
          {matches.map((item) => (
            <button
              type="button"
              key={item.id}
              disabled={disabled || (full && !selected.includes(item.id))}
              aria-pressed={selected.includes(item.id)}
              onClick={() => choose(item.id)}
            >
              {item.name}
              {selected.includes(item.id) && (
                <Check size={14} aria-hidden="true" />
              )}
            </button>
          ))}
          {!exact && (
            <button
              type="button"
              disabled={disabled || full}
              onClick={() => void create()}
            >
              <Plus size={14} aria-hidden="true" /> Create “{term}”
            </button>
          )}
        </div>
      )}
      {items.length > 0 && (
        <div className="common-labels">
          <div className="label-pills">
            {visiblePills.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`label-pill ${selected.includes(item.id) ? "selected" : ""}`}
                aria-pressed={selected.includes(item.id)}
                disabled={disabled || (full && !selected.includes(item.id))}
                onClick={() => choose(item.id)}
              >
                {selected.includes(item.id) && (
                  <Check size={13} aria-hidden="true" />
                )}
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function EventLabelEditor({
  tagIds,
  onTags,
  fieldErrors = {},
  onBusyChange,
  showHeading = true,
  id = "event-tags",
}: {
  fieldErrors?: Record<string, string>;
  onBusyChange: (busy: boolean) => void;
  tagIds: string[];
  onTags: (ids: string[]) => void;
  showHeading?: boolean;
  id?: string;
}) {
  const { tags, createTag, labelError, labelsLoading, reloadLabels } =
    useTracker();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(name: string) {
    if (busy || !name || tagIds.length >= 20) return false;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const label = await createTag(name);
      onTags([...new Set([...tagIds, label.id])]);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create the label.",
      );
      return false;
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="event-label-editor">
      {showHeading && <h2>Tags</h2>}
      {labelError && (
        <p className="field-error" role="alert">
          {labelError}{" "}
          <button type="button" className="text-link" onClick={reloadLabels}>
            Retry
          </button>
        </p>
      )}
      {labelsLoading && (
        <p className="muted" role="status">
          Loading tags…
        </p>
      )}
      <LabelPicker
        id={id}
        items={tags}
        selected={tagIds}
        onSelect={(id) =>
          onTags(
            tagIds.includes(id)
              ? tagIds.filter((t) => t !== id)
              : [...tagIds, id],
          )
        }
        onCreate={create}
        disabled={busy || labelsLoading || !!labelError}
        error={fieldErrors.tag_ids}
      />
      {busy && (
        <p role="status" className="muted">
          Saving…
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
