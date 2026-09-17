"use client";

import { useId, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { Label } from "@/lib/tracker";

export function TagPill({ name }: { name: string }) {
  return <span className="label-pill label-tag">{name}</span>;
}

export function TagFilterPills({
  legend,
  items,
  selected,
  onChange,
  emptyText,
  searchable = false,
  maxVisible,
}: {
  legend: string;
  items: Label[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyText?: string;
  searchable?: boolean;
  maxVisible?: number;
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const sorted = [...items].sort(
      (a, b) =>
        Number(selected.includes(b.id)) - Number(selected.includes(a.id)) ||
        (b.usage_count ?? 0) - (a.usage_count ?? 0) ||
        a.name.localeCompare(b.name),
    );
    const matches = normalized
      ? sorted.filter((item) =>
          item.name.toLocaleLowerCase().includes(normalized),
        )
      : sorted;
    return maxVisible ? matches.slice(0, maxVisible) : matches;
  }, [items, maxVisible, query, selected]);
  return (
    <fieldset
      className={`filter-labels ${searchable ? "searchable-filter-labels" : ""}`}
    >
      <legend>{legend}</legend>
      {searchable && (
        <div className="filter-bar-search tag-filter-search">
          <Search size={16} aria-hidden="true" />
          <label className="sr-only" htmlFor={searchId}>
            Search tags
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder="Search tags…"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="search-clear-button"
              aria-label="Clear tag search"
              onClick={() => setQuery("")}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {visibleItems.length ? (
        <div className="label-pills">
          {visibleItems.map((item) => {
            const active = selected.includes(item.id);
            return (
              <button
                type="button"
                className={`label-pill label-tag ${active ? "selected" : ""}`}
                aria-pressed={active}
                key={item.id}
                onClick={() =>
                  onChange(
                    active
                      ? selected.filter((id) => id !== item.id)
                      : [...selected, item.id],
                  )
                }
              >
                {active && <Check size={13} aria-hidden="true" />}
                {item.name}
              </button>
            );
          })}
        </div>
      ) : items.length ? (
        <p className="muted tag-filter-empty">No matching tags.</p>
      ) : (
        emptyText && <p className="muted tag-filter-empty">{emptyText}</p>
      )}
    </fieldset>
  );
}

export function DocumentCategoryPill({ name }: { name: string }) {
  return <span className="label-pill document-category-pill">{name}</span>;
}
