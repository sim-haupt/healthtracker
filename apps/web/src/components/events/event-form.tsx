"use client";
import { useEventTypes } from "../event-types";
import Link from "next/link";
import { useProviders } from "../providers-context";
import { useToast, ConfirmDialog } from "../ui/feedback";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import {
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
import { ProfileIdentity } from "../ui/profile-avatar";
import { EventLabelEditor } from "../tracker/event-label-editor";
import { useEvent } from "./use-event";
import {
  PendingDocumentPicker,
  uploadPendingDocument,
  type PendingDocument,
} from "./pending-document";
import { formatDate } from "@/lib/date-format";
import { CustomSelect, DatePicker } from "../ui/pickers";

type EpisodeOption = {
  id: string;
  title: string;
  status: "active" | "resolved";
  start_date: string;
  end_date: string | null;
};
export function EditEvent({ id }: { id: string }) {
  const { event, error, retry } = useEvent(id);
  if (error)
    return (
      <section className="card event-state" role="alert">
        <p>{error}</p>
        <button className="button secondary-button" onClick={retry}>
          Try again
        </button>
        <Link className="text-link" href="/timeline">
          Back to timeline
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
  const { profiles, activeProfile } = useProfiles();
  const router = useRouter();
  const toast = useToast();
  const doctors = useProviders();
  const typeOptions = useEventTypes();
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
  const [pendingDocument, setPendingDocument] =
    useState<PendingDocument | null>(null);
  const [episodeId, setEpisodeId] = useState("");
  const [episodeOptions, setEpisodeOptions] = useState<EpisodeOption[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [episodeError, setEpisodeError] = useState("");
  const [episodeAttempt, setEpisodeAttempt] = useState(0);
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
  useEffect(() => {
    if (!draft.profile_id) return;
    const controller = new AbortController();
    setEpisodesLoading(true);
    setEpisodeError("");
    apiFetch<{ episodes: EpisodeOption[] }>(
      `/api/v1/episodes?profile_id=${draft.profile_id}`,
      controller.signal,
    )
      .then(({ episodes }) => {
        setEpisodeOptions(episodes);
        setEpisodeId((current) =>
          episodes.some((episode) => episode.id === current) ? current : "",
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setEpisodeError(
            cause instanceof Error ? cause.message : "Unable to load episodes.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setEpisodesLoading(false);
      });
    return () => controller.abort();
  }, [draft.profile_id, episodeAttempt]);
  function update<K extends keyof EventDraft>(field: K, value: EventDraft[K]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setDirty(true);
    setErrors((previous) => ({ ...previous, [field]: "" }));
  }
  function highlight(fields: Record<string, string>) {
    setErrors(fields);
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
    if (
      !typeOptions.types.some(
        (t) =>
          t.key === draft.event_type &&
          (!t.archived || event?.event_type === t.key),
      )
    )
      issues.event_type = "Choose an available event type.";
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
      const failed: string[] = [];
      if (episodeId) {
        try {
          await apiFetch(
            `/api/v1/episodes/${episodeId}/events/${saved.id}`,
            undefined,
            { method: "POST" },
          );
        } catch {
          failed.push("episode link");
        }
      }
      if (pendingDocument) {
        try {
          await uploadPendingDocument(saved.id, pendingDocument);
        } catch {
          failed.push("document upload");
        }
      }
      toast(
        failed.length
          ? `Event saved. ${failed.join(" and ")} failed; you can retry from the saved event or episode.`
          : episodeId && pendingDocument
            ? "Event linked to episode with document saved."
            : episodeId
              ? "Event linked to episode."
              : pendingDocument
                ? "Event and document saved."
                : "Event saved.",
      );
      setDirty(false);
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
    else router.push(event ? `/events/${event.id}` : "/timeline");
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
        <ArrowLeft size={16} /> {event ? "Back to event" : "Back to timeline"}
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
            <div className="form-field profile-choice-field">
              <span className="field-label">Health profile</span>
              <div
                className="profile-choices"
                role="radiogroup"
                aria-label="Health profile"
              >
                {profiles.map((profile) => (
                  <label
                    key={profile.id}
                    className={
                      draft.profile_id === profile.id ? "selected" : ""
                    }
                  >
                    <input
                      type="radio"
                      name="profile_id"
                      value={profile.id}
                      checked={draft.profile_id === profile.id}
                      onChange={(e) => {
                        update("profile_id", e.target.value);
                        setEpisodeId("");
                      }}
                      required
                    />
                    <ProfileIdentity
                      name={profile.name}
                      avatar={profile.avatar}
                    />
                  </label>
                ))}
              </div>
              {feedback("profile_id")}
            </div>
            <div className="form-field">
              <label htmlFor="event_type">Event type</label>
              <CustomSelect
                id="event_type"
                value={draft.event_type}
                invalid={!!errors.event_type}
                placeholder="Choose a type"
                onChange={(value) => update("event_type", value)}
                options={typeOptions.types
                  .filter((t) => !t.archived || event?.event_type === t.key)
                  .map((item) => ({
                    value: item.key,
                    label: `${item.name}${item.archived ? " (removed)" : ""}`,
                  }))}
              />
              {feedback("event_type")}
              {typeOptions.error && (
                <p role="alert">
                  {typeOptions.error}{" "}
                  <button
                    type="button"
                    className="text-link"
                    onClick={typeOptions.reload}
                  >
                    Retry
                  </button>
                </p>
              )}
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="episode_id">
              {event ? "Link to episode" : "Health episode"}{" "}
              <span>Optional</span>
            </label>
            <CustomSelect
              id="episode_id"
              value={episodeId}
              disabled={episodesLoading}
              onChange={(value) => {
                setEpisodeId(value);
                setDirty(true);
              }}
              options={[
                {
                  value: "",
                  label: episodesLoading
                    ? "Loading episodes…"
                    : episodeOptions.length
                      ? event
                        ? "No new episode link"
                        : "No episode"
                      : "No episodes for this profile",
                },
                ...episodeOptions.map((episode) => ({
                  value: episode.id,
                  label: `${episode.title} · ${episode.status === "active" ? "Active" : "Resolved"} · ${formatDate(episode.start_date)}`,
                })),
              ]}
            />
            {event && episodeOptions.length > 0 && (
              <p className="form-hint">Existing episode links are kept.</p>
            )}
            {episodeError && (
              <p className="field-error" role="alert">
                {episodeError}{" "}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setEpisodeAttempt((attempt) => attempt + 1)}
                >
                  Retry
                </button>
              </p>
            )}
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
              <DatePicker
                id="event_date"
                mode="datetime"
                value={draft.event_date}
                invalid={!!errors.event_date}
                onChange={(value) => update("event_date", value)}
              />
              {feedback("event_date")}
            </div>
            <div className="form-field">
              <label htmlFor="end_date">
                End date and time <span>Optional</span>
              </label>
              <DatePicker
                id="end_date"
                mode="datetime"
                optional
                value={draft.end_date}
                invalid={!!errors.end_date}
                min={draft.event_date.slice(0, 10)}
                onChange={(value) => update("end_date", value)}
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
            <CustomSelect
              id="provider_id"
              value={draft.provider_id ?? ""}
              disabled={doctors.loading}
              invalid={!!errors.provider_id}
              onChange={(id) => {
                update("provider_id", id);
                if (id)
                  update(
                    "doctor",
                    doctors.providers.find((p) => p.id === id)?.name ?? "",
                  );
              }}
              options={[
                { value: "", label: "No saved doctor" },
                ...(draft.provider_id &&
                !doctors.providers.some((p) => p.id === draft.provider_id)
                  ? [
                      {
                        value: draft.provider_id,
                        label: "Previously selected doctor",
                      },
                    ]
                  : []),
                ...doctors.providers.map((provider) => ({
                  value: provider.id,
                  label: `${provider.name}${provider.specialty ? ` · ${provider.specialty}` : ""}`,
                })),
              ]}
            />
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
                <DatePicker
                  id="next_dose_date"
                  optional
                  value={draft.next_dose_date ?? ""}
                  invalid={!!errors.next_dose_date}
                  onChange={(value) => update("next_dose_date", value)}
                />
                {feedback("next_dose_date")}
                <p className="muted">
                  Use the date provided by your clinician.
                </p>
              </div>
            </div>
          )}
          <div className="event-fields" aria-live="polite">
            {[...primary, ...secondary].map(detailField)}
          </div>
          <EventLabelEditor
            onBusyChange={setLabelBusy}
            fieldErrors={errors}
            tagIds={draft.tag_ids}
            onTags={(ids) => update("tag_ids", ids)}
          />
          <PendingDocumentPicker
            value={pendingDocument}
            disabled={busy || labelBusy}
            onChange={(value) => {
              setPendingDocument(value);
              setDirty(true);
            }}
          />
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
            router.push(event ? `/events/${event.id}` : "/timeline")
          }
        />
      )}
    </>
  );
}
