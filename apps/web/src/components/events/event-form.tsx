"use client";
import Link from "next/link";
import { useProviders } from "../providers-context";
import { useToast, ConfirmDialog } from "../ui/feedback";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  eventTypes,
  detailFields,
  fieldsForType,
  fieldLabel,
  eventDraft,
  validateDraft,
  draftInput,
  type HealthEvent,
  type EventType,
  type DetailField,
  type EventDraft,
} from "@/lib/events";
import { useProfiles } from "../app-shell";
import { EventLabelEditor } from "../tracker/event-label-editor";
import { useEvent } from "./use-event";
export function EditEvent({ id }: { id: string }) {
  const { event, error, retry } = useEvent(id);
  if (error)
    return (
      <section className="card event-state" role="alert">
        <p>{error}</p>
        <button className="button secondary-button" onClick={retry}>
          Try again
        </button>
        <Link className="text-link" href="/events">
          Back to events
        </Link>
      </section>
    );
  if (!event)
    return (
      <p className="event-state" role="status">
        Loading event…
      </p>
    );
  return <EventForm key={event.id} event={event} />;
}
export function EventForm({
  event,
  initialDate,
  initialType,
}: {
  event?: HealthEvent;
  initialDate?: string;
  initialType?: EventType;
}) {
  const { profiles, activeProfile, setActiveProfile } = useProfiles();
  const router = useRouter();
  const toast = useToast();
  const doctors = useProviders();
  const [discard, setDiscard] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(() => ({
    ...eventDraft(event, activeProfile?.id ?? profiles[0]?.id, initialDate),
    ...(!event && initialType ? { event_type: initialType } : {}),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const type = draft.event_type as EventType;
  const primary = fieldsForType(type);
  const secondary = detailFields.filter((field) => !primary.includes(field));
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update<K extends keyof EventDraft>(field: K, value: EventDraft[K]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setDirty(true);
    setErrors((previous) => ({ ...previous, [field]: "" }));
  }
  function highlight(fields: Record<string, string>) {
    setErrors(fields);
    if (secondary.some((field) => fields[field])) setMoreOpen(true);
    requestAnimationFrame(() =>
      formRef.current
        ?.querySelector<HTMLElement>("[aria-invalid=true]")
        ?.focus(),
    );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || labelBusy) return;
    const issues = validateDraft(
      draft,
      profiles.map((profile) => profile.id),
    );
    setError("");
    if (Object.keys(issues).length) {
      highlight(issues);
      setError("Please check the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      const { event: saved } = await apiFetch<{ event: HealthEvent }>(
        event ? `/api/v1/events/${event.id}` : "/api/v1/events",
        undefined,
        { method: event ? "PUT" : "POST", body: draftInput(draft, event) },
      );
      toast("Event saved.");
      setDirty(false);
      setActiveProfile(saved.profile_id);
      router.push(`/events/${saved.id}`);
    } catch (cause) {
      if (cause instanceof ApiError)
        highlight(
          Object.fromEntries(
            Object.entries(cause.fields).map(([key, messages]) => [
              key,
              messages[0],
            ]),
          ),
        );
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save this event. Your entries have been kept; please try again.",
      );
      setBusy(false);
    }
  }
  function cancel() {
    if (dirty) setDiscard(true);
    else router.push(event ? `/events/${event.id}` : "/events");
  }
  const feedback = (name: string) =>
    errors[name] ? (
      <p className="field-error" id={`${name}-error`}>
        {errors[name]}
      </p>
    ) : null;
  const fieldProps = (name: keyof EventDraft) => ({
    id: name,
    name,
    value: draft[name],
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });
  function detailField(field: DetailField) {
    if (field === "doctor" && draft.provider_id) return null;
    const short = field === "doctor" || field === "location";
    return (
      <div className="form-field" key={field}>
        <label htmlFor={field}>
          {fieldLabel(type, field)} <span>Optional</span>
        </label>
        {short ? (
          <input
            {...fieldProps(field)}
            maxLength={300}
            onChange={(e) => update(field, e.target.value)}
          />
        ) : (
          <textarea
            {...fieldProps(field)}
            rows={3}
            maxLength={5000}
            onChange={(e) => update(field, e.target.value)}
          />
        )}{" "}
        {feedback(field)}
      </div>
    );
  }
  return (
    <>
      <button type="button" className="text-link event-back" onClick={cancel}>
        <ArrowLeft size={16} /> {event ? "Back to event" : "Back to events"}
      </button>
      <div className="page-heading">
        <div>
          <h1>{event ? "Edit event" : "Add event"}</h1>
        </div>
      </div>
      <form
        ref={formRef}
        onSubmit={save}
        noValidate
        className="card event-form"
      >
        <fieldset disabled={busy}>
          <legend className="sr-only">Health event details</legend>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="profile_id">Health profile</label>
              <select
                {...fieldProps("profile_id")}
                onChange={(e) => update("profile_id", e.target.value)}
                required
              >
                <option value="" disabled>
                  Choose a profile
                </option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              {feedback("profile_id")}
            </div>
            <div className="form-field">
              <label htmlFor="event_type">Event type</label>
              <select
                {...fieldProps("event_type")}
                onChange={(e) => update("event_type", e.target.value)}
                required
              >
                {!eventTypes.includes(type) && (
                  <option value="" disabled>
                    Choose a type
                  </option>
                )}
                {eventTypes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              {feedback("event_type")}
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="title">
              {type === "Vaccination" ? "Vaccine name" : "Title"}
            </label>
            <input
              {...fieldProps("title")}
              maxLength={300}
              required
              onChange={(e) => update("title", e.target.value)}
            />
            {feedback("title")}
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="event_date">
                {type === "Vaccination"
                  ? "Date administered"
                  : type === "Illness"
                    ? "Start date and time"
                    : "Date and time"}
              </label>
              <input
                {...fieldProps("event_date")}
                type="datetime-local"
                step="1"
                required
                onChange={(e) => update("event_date", e.target.value)}
              />
              {feedback("event_date")}
            </div>
            <div className="form-field">
              <label htmlFor="end_date">
                End date and time <span>Optional</span>
              </label>
              <input
                {...fieldProps("end_date")}
                type="datetime-local"
                step="1"
                onChange={(e) => update("end_date", e.target.value)}
              />
              {feedback("end_date")}
            </div>
          </div>
          <p className="form-hint">
            Dates and times use your device’s local timezone.
          </p>
          <div className="form-field">
            <label htmlFor="provider_id">
              Saved doctor <span>Optional</span>
            </label>
            <select
              id="provider_id"
              value={draft.provider_id ?? ""}
              disabled={doctors.loading}
              aria-invalid={!!errors.provider_id}
              onChange={(e) => {
                const id = e.target.value;
                update("provider_id", id);
                if (id)
                  update(
                    "doctor",
                    doctors.providers.find((p) => p.id === id)?.name ?? "",
                  );
              }}
            >
              <option value="">No saved doctor</option>
              {draft.provider_id &&
                !doctors.providers.some((p) => p.id === draft.provider_id) && (
                  <option value={draft.provider_id}>
                    Previously selected doctor
                  </option>
                )}
              {doctors.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.specialty ? ` · ${p.specialty}` : ""}
                </option>
              ))}
            </select>
            {feedback("provider_id")}
            {doctors.error && (
              <p role="alert" className="field-error">
                {doctors.error}{" "}
                <button
                  type="button"
                  className="text-link"
                  onClick={doctors.reload}
                >
                  Retry
                </button>
              </p>
            )}
          </div>
          {type === "Vaccination" && (
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="disease">
                  Disease <span>Optional</span>
                </label>
                <input
                  id="disease"
                  value={draft.disease ?? ""}
                  maxLength={300}
                  onChange={(e) => update("disease", e.target.value)}
                />
                {feedback("disease")}
              </div>
              <div className="form-field">
                <label htmlFor="next_dose_date">
                  Next recommended dose <span>Optional</span>
                </label>
                <input
                  id="next_dose_date"
                  type="date"
                  value={draft.next_dose_date ?? ""}
                  onChange={(e) => update("next_dose_date", e.target.value)}
                />
                {feedback("next_dose_date")}
                <p className="muted">
                  Use the date provided by your clinician.
                </p>
              </div>
            </div>
          )}
          <div className="event-fields" aria-live="polite">
            {primary.map(detailField)}
          </div>
          <EventLabelEditor
            onBusyChange={setLabelBusy}
            fieldErrors={errors}
            categoryId={draft.category_id}
            tagIds={draft.tag_ids}
            onCategory={(id) => update("category_id", id)}
            onTags={(ids) => update("tag_ids", ids)}
          />
          <details
            className="event-more"
            open={moreOpen}
            onToggle={(e) => setMoreOpen(e.currentTarget.open)}
          >
            <summary>More details </summary>
            <div className="event-fields">{secondary.map(detailField)}</div>
          </details>
        </fieldset>
        {error && (
          <p role="alert" className="form-error event-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary-button"
            onClick={cancel}
            disabled={busy || labelBusy}
          >
            Cancel
          </button>
          <button type="submit" className="button" disabled={busy || labelBusy}>
            <Save size={17} />
            {busy ? "Saving…" : event ? "Save changes" : "Create event"}
          </button>
        </div>
      </form>
      {discard && (
        <ConfirmDialog
          title="Discard your changes?"
          description="Your unsaved entries will be lost."
          action="Discard changes"
          busy={false}
          onClose={() => setDiscard(false)}
          onConfirm={() =>
            router.push(event ? `/events/${event.id}` : "/events")
          }
        />
      )}
    </>
  );
}
