"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { apiFetch } from "@/lib/api";
import { ConfirmDialog, useToast } from "./ui/feedback";
import { Pencil, Trash2 } from "lucide-react";
export type ManagedEventType = {
  id: string;
  key: string;
  name: string;
  color: string;
  archived: boolean;
};
const Context = createContext<{
  types: ManagedEventType[];
  error: string;
  loading: boolean;
  reload: () => void;
}>({ types: [], error: "", loading: true, reload: () => {} });
export const useEventTypes = () => useContext(Context);
export function EventTypesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [types, setTypes] = useState<ManagedEventType[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    apiFetch<{ types: ManagedEventType[] }>("/api/v1/event-types", c.signal)
      .then((r) => setTypes(r.types))
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [revision]);
  return (
    <Context.Provider
      value={{ types, error, loading, reload: () => setRevision((n) => n + 1) }}
    >
      {children}
    </Context.Provider>
  );
}
export function useEventTypeStyle(key: string) {
  const { types } = useEventTypes();
  const type = types.find((t) => t.key === key);
  return {
    type,
    name: type?.name ?? key,
    style: { "--event-color": type?.color ?? "#0C7779" } as CSSProperties,
  };
}
export function EventTypeBadge({ type }: { type: string }) {
  const value = useEventTypeStyle(type);
  return (
    <span className="event-type-badge" style={value.style}>
      <span aria-hidden className="event-type-dot" />
      {value.name}
    </span>
  );
}
export function EventTypeSettings() {
  const { types, error, loading, reload } = useEventTypes();
  const toast = useToast();
  const [editing, setEditing] = useState<ManagedEventType | null>(null),
    [pending, setPending] = useState<ManagedEventType | null>(null),
    [name, setName] = useState(""),
    [color, setColor] = useState("#91B5E4"),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  return (
    <section className="card label-manager event-type-settings">
      <h2>Event types</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setFailure("");
          try {
            await apiFetch(
              "/api/v1/event-types" + (editing ? "/" + editing.id : ""),
              undefined,
              { method: editing ? "PUT" : "POST", body: { name, color } },
            );
            toast("Event type saved.");
            setEditing(null);
            setName("");
            reload();
          } catch (e) {
            setFailure(e instanceof Error ? e.message : "Unable to save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="type-editor">
          <div className="form-field">
            <label htmlFor="type-name">
              {editing ? "Edit type" : "Add type"}
            </label>
            <input
              id="type-name"
              value={name}
              maxLength={100}
              required
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="type-color">Color</label>
            <input
              type="color"
              id="type-color"
              value={color}
              disabled={busy}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
          <button
            className="button secondary-button"
            disabled={busy || !name.trim()}
          >
            {busy ? "Saving…" : editing ? "Save" : "Add"}
          </button>
          {editing && (
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setName("");
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      {(failure || error) && (
        <p className="form-error" role="alert">
          {failure || error}{" "}
          {error && (
            <button className="text-link" onClick={reload}>
              Retry
            </button>
          )}
        </p>
      )}
      {loading ? (
        <p role="status">Loading event types…</p>
      ) : (
        <ul className="settings-label-list">
          {types
            .filter((t) => !t.archived)
            .map((t) => (
              <li key={t.id}>
                <EventTypeBadge type={t.key} />
                <div>
                  <button
                    className="icon-button"
                    aria-label={`Edit event type ${t.name}`}
                    title="Edit"
                    disabled={busy}
                    onClick={() => {
                      setEditing(t);
                      setName(t.name);
                      setColor(t.color);
                      document.getElementById("type-name")?.focus();
                    }}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button danger-icon"
                    aria-label={`Delete event type ${t.name}`}
                    title="Delete"
                    disabled={busy}
                    onClick={() => setPending(t)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
        </ul>
      )}
      {pending && (
        <ConfirmDialog
          title="Remove event type?"
          description="Existing events keep their type and color. It will no longer be available for new events."
          action="Remove"
          busy={busy}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await apiFetch("/api/v1/event-types/" + pending.id, undefined, {
                method: "DELETE",
              });
              if (editing?.id === pending.id) {
                setEditing(null);
                setName("");
              }
              setPending(null);
              reload();
              toast("Event type removed.");
            } catch (e) {
              setFailure(e instanceof Error ? e.message : "Unable to remove.");
              setPending(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}
