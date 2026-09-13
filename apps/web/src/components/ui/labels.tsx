"use client";

import { Check } from "lucide-react";
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
}: {
  legend: string;
  items: Label[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyText?: string;
}) {
  return (
    <fieldset className="filter-labels">
      <legend>{legend}</legend>
      {items.length ? (
        <div className="label-pills">
          {items.map((item) => {
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
      ) : (
        emptyText && <p className="muted">{emptyText}</p>
      )}
    </fieldset>
  );
}

export function DocumentCategoryPill({ name }: { name: string }) {
  return <span className="label-pill document-category-pill">{name}</span>;
}
