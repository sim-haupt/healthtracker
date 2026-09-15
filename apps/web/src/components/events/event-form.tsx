"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ArrowLeft, Bell, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import {
  fieldLabel,
  fieldsForType,
  eventDraft,
  validateDraft,
  draftInput,
  type HealthEvent,
  type EventType,
  type DetailField,
  type EventDraft,
} from "@/lib/events";
import { formatDate } from "@/lib/date-format";
import { useProfiles } from "../app-shell";
import { useEventTypes } from "../event-types";
import { useProviders } from "../providers-context";
import { ProviderEditor } from "../providers";
import { EventLabelEditor } from "../tracker/event-label-editor";
import { useToast, ConfirmDialog } from "../ui/feedback";
import { CustomSelect, DatePicker } from "../ui/pickers";
import { ProfileIdentity } from "../ui/profile-avatar";
import { RichTextEditor } from "../ui/rich-text";
import { useEvent } from "./use-event";
import {
  PendingDocumentPicker,
  attachExistingDocument,
  uploadPendingDocument,
  type EventDocumentSelection,
} from "./pending-document";

type EpisodeOption = {
  id: string;
  title: string;
  status: "active" | "resolved";
  start_date: string;
  end_date: string | null;
};

type EventReminderDraft = {
  id?: string;
  key: string;
  title: string;
  due_date: string;
  recurrence: "none" | "monthly" | "yearly";
};

function FormSection({
  number,
  title,
  children,
  className = "",
}: {
  number: number;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"event-form-section " + className}>
      <header>
        <span aria-hidden="true">
          <span>{number}</span>
        </span>
        <h2>{title}</h2>
      </header>
      <div className="event-form-section-body">{children}</div>
    </section>
  );
}

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
  const [addingProvider, setAddingProvider] = useState(false);
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
    useState<EventDocumentSelection | null>(null);
  const [episodeId, setEpisodeId] = useState("");
  const [episodeOptions, setEpisodeOptions] = useState<EpisodeOption[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [episodeError, setEpisodeError] = useState("");
  const [episodeAttempt, setEpisodeAttempt] = useState(0);
  const [reminders, setReminders] = useState<EventReminderDraft[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(!!event);
  const [reminderError, setReminderError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const type = draft.event_type as EventType;
  const medicalFields: DetailField[] = [
    "treatment",
    "diagnosis",
    "prescription",
    "symptoms",
  ];
  const preferredFields = fieldsForType(type);
  const orderedMedicalFields = [
    ...preferredFields.filter((field) => medicalFields.includes(field)),
    ...medicalFields.filter((field) => !preferredFields.includes(field)),
  ];

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
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
      "/api/v1/episodes?profile_id=" + draft.profile_id,
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

  useEffect(() => {
    if (!event) return;
    const controller = new AbortController();
    setRemindersLoading(true);
    setReminderError("");
    apiFetch<{
      reminders: Array<{
        id: string;
        title: string;
        due_date: string;
        recurrence: "none" | "monthly" | "yearly";
      }>;
    }>(
      `/api/v1/reminders?source_event_id=${event.id}&reminder_kind=custom&status=scheduled&page_size=20`,
      controller.signal,
    )
      .then((result) =>
        setReminders(
          result.reminders.map((reminder) => ({
            ...reminder,
            key: reminder.id,
          })),
        ),
      )
      .catch((cause: Error) => {
        if (!controller.signal.aborted) setReminderError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRemindersLoading(false);
      });
    return () => controller.abort();
  }, [event]);

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

  async function save(submission: FormEvent) {
    submission.preventDefault();
    if (busy || labelBusy) return;
    const issues = validateDraft(
      draft,
      profiles.map((profile) => profile.id),
    );
    if (
      !typeOptions.types.some(
        (option) =>
          option.key === draft.event_type &&
          (!option.archived || event?.event_type === option.key),
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
        event ? "/api/v1/events/" + event.id : "/api/v1/events",
        undefined,
        { method: event ? "PUT" : "POST", body: draftInput(draft, event) },
      );
      const failed: string[] = [];
      if (episodeId) {
        try {
          await apiFetch(
            "/api/v1/episodes/" + episodeId + "/events/" + saved.id,
            undefined,
            { method: "POST" },
          );
        } catch {
          failed.push("episode link");
        }
      }
      if (pendingDocument) {
        try {
          if (pendingDocument.source === "new")
            await uploadPendingDocument(saved.id, pendingDocument.document);
          else await attachExistingDocument(saved.id, pendingDocument.document);
        } catch {
          failed.push(
            pendingDocument.source === "new"
              ? "document upload"
              : "document attachment",
          );
        }
      }
      try {
        if (remindersLoading || reminderError) throw new Error("Reminders were not loaded.");
        await apiFetch(`/api/v1/reminders/event/${saved.id}`, undefined, {
          method: "PUT",
          body: {
            reminders: reminders.map(({ id, title, due_date, recurrence }) => ({
              ...(id ? { id } : {}),
              title,
              due_date,
              recurrence,
            })),
          },
        });
      } catch {
        failed.push("reminder update");
      }
      toast(
        failed.length
          ? "Event saved. " +
              failed.join(" and ") +
              " failed; retry from the saved event."
          : "Event saved.",
      );
      setDirty(false);
      router.push("/events/" + saved.id);
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
    else router.push(event ? "/events/" + event.id : "/timeline");
  }

  const feedback = (name: string) =>
    errors[name] ? (
      <p className="field-error" id={name + "-error"}>
        {errors[name]}
      </p>
    ) : null;

  const fieldProps = (
    name: Exclude<keyof EventDraft, "tag_ids" | "needs_renewal">,
  ) => ({
    id: name,
    name,
    value: draft[name],
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? name + "-error" : undefined,
  });

  function longField(field: DetailField) {
    return (
      <div className="form-field" key={field}>
        <label htmlFor={field}>{fieldLabel(type, field)}</label>
        <RichTextEditor
          id={field}
          value={String(draft[field] ?? "")}
          invalid={!!errors[field]}
          describedBy={errors[field] ? field + "-error" : undefined}
          onChange={(value) => update(field, value)}
        />
        {feedback(field)}
      </div>
    );
  }

  const detailsTitle =
    type === "Doctor Visit"
      ? "Visit details"
      : type === "Illness"
        ? "Illness details"
        : type === "Vaccination"
          ? "Vaccination details"
          : "Event details";

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
      <form ref={formRef} onSubmit={save} noValidate className="event-form">
        <fieldset disabled={busy}>
          <legend className="sr-only">Health event details</legend>

          <FormSection number={1} title="Basic information">
            <div className="event-section-grid event-basic-grid">
              <div className="form-field profile-choice-field basic-profile">
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
                        onChange={(choice) => {
                          update("profile_id", choice.target.value);
                          setEpisodeId("");
                          setPendingDocument(null);
                        }}
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
              <div className="form-field basic-type">
                <label htmlFor="event_type">Event type</label>
                <CustomSelect
                  id="event_type"
                  value={draft.event_type}
                  invalid={!!errors.event_type}
                  placeholder="Choose a type"
                  onChange={(value) => update("event_type", value)}
                  options={typeOptions.types
                    .filter(
                      (option) =>
                        !option.archived || event?.event_type === option.key,
                    )
                    .map((option) => ({
                      value: option.key,
                      label:
                        option.name + (option.archived ? " (removed)" : ""),
                    }))}
                />
                {feedback("event_type")}
              </div>
              <div className="form-field basic-title">
                {type === "Vaccination" ? (
                  <>
                    <label htmlFor="disease">Disease</label>
                    <input
                      id="disease"
                      value={draft.disease ?? ""}
                      maxLength={300}
                      aria-invalid={!!errors.disease}
                      aria-describedby={
                        errors.disease ? "disease-error" : undefined
                      }
                      onChange={(change) =>
                        update("disease", change.target.value)
                      }
                    />
                    {feedback("disease")}
                  </>
                ) : (
                  <>
                    <label htmlFor="title">Title</label>
                    <input
                      {...fieldProps("title")}
                      maxLength={300}
                      onChange={(change) =>
                        update("title", change.target.value)
                      }
                    />
                    {feedback("title")}
                  </>
                )}
              </div>
              <div className="form-field basic-date">
                <label htmlFor="event_date">Date</label>
                <DatePicker
                  id="event_date"
                  mode="datetime"
                  value={draft.event_date}
                  invalid={!!errors.event_date}
                  onChange={(value) => update("event_date", value)}
                />
                {feedback("event_date")}
              </div>
              <div className="form-field basic-end">
                <label htmlFor="end_date">End date</label>
                <DatePicker
                  id="end_date"
                  mode="datetime"
                  optional
                  value={draft.end_date}
                  invalid={!!errors.end_date}
                  min={draft.event_date.slice(0, 10)}
                  placeholder="Add end date"
                  onChange={(value) => update("end_date", value)}
                />
                {feedback("end_date")}
              </div>
            </div>
          </FormSection>

          <FormSection number={2} title={detailsTitle}>
            <div
              className={`event-section-grid ${type === "Vaccination" ? "vaccination-details-grid" : ""}`}
            >
              <div className="form-field">
                <label htmlFor="provider_id">Medical provider</label>
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
                        doctors.providers.find((provider) => provider.id === id)
                          ?.name ?? "",
                      );
                  }}
                  options={[
                    { value: "", label: "No medical provider" },
                    ...(draft.provider_id &&
                    !doctors.providers.some(
                      (provider) => provider.id === draft.provider_id,
                    )
                      ? [
                          {
                            value: draft.provider_id,
                            label: "Previously selected provider",
                          },
                        ]
                      : []),
                    ...doctors.providers.map((provider) => ({
                      value: provider.id,
                      label:
                        provider.name +
                        (provider.specialty ? " · " + provider.specialty : ""),
                    })),
                  ]}
                />
                <div className="provider-add-row">
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setAddingProvider(true)}
                  >
                    <Plus size={14} aria-hidden="true" /> Add provider
                  </button>
                </div>
                {feedback("provider_id")}
              </div>
              {longField("description")}
              {type === "Vaccination" && (
                <>
                  <div className="form-field vaccination-dose-field">
                    <span className="field-label">Dose</span>
                    <div
                      className="vaccination-dose-selector"
                      aria-invalid={!!errors.dose_number || !!errors.dose_total}
                    >
                      <div
                        className="vaccination-dose-group"
                        role="group"
                        aria-label="Total doses"
                      >
                        <span>Total</span>
                        <div>
                          {[1, 2, 3].map((number) => (
                            <button
                              type="button"
                              key={number}
                              className="dose-circle"
                              aria-pressed={draft.dose_total === String(number)}
                              onClick={() => {
                                const next =
                                  draft.dose_total === String(number)
                                    ? ""
                                    : String(number);
                                update("dose_total", next);
                                if (!next) update("dose_number", "");
                                else if (number === 1)
                                  update("dose_number", "1");
                                else if (
                                  draft.dose_number &&
                                  Number(draft.dose_number) > number
                                )
                                  update("dose_number", "");
                              }}
                            >
                              {number}
                            </button>
                          ))}
                        </div>
                      </div>
                      {draft.dose_total && (
                        <>
                          <span className="dose-selector-divider" />
                          <div
                            className="vaccination-dose-group"
                            role="group"
                            aria-label="Administered dose"
                          >
                            <span>Dose</span>
                            <div>
                              {Array.from(
                                { length: Number(draft.dose_total) },
                                (_, index) => index + 1,
                              ).map((number) => (
                                <button
                                  type="button"
                                  key={number}
                                  className="dose-circle"
                                  aria-pressed={
                                    draft.dose_number === String(number)
                                  }
                                  onClick={() =>
                                    update(
                                      "dose_number",
                                      draft.dose_total !== "1" &&
                                        draft.dose_number === String(number)
                                        ? ""
                                        : String(number),
                                    )
                                  }
                                >
                                  {number}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    {feedback("dose_number") || feedback("dose_total")}
                  </div>
                  <div className="form-field vaccination-name-field">
                    <label htmlFor="title">Vaccine name</label>
                    <input
                      {...fieldProps("title")}
                      maxLength={300}
                      onChange={(change) =>
                        update("title", change.target.value)
                      }
                    />
                    {feedback("title")}
                  </div>
                  <div className="form-field vaccination-next-dose-field">
                    <label htmlFor="next_dose_date">
                      Next recommended dose
                    </label>
                    <DatePicker
                      id="next_dose_date"
                      optional
                      value={draft.next_dose_date ?? ""}
                      invalid={!!errors.next_dose_date}
                      placeholder="Add recommended dose date"
                      onChange={(value) => update("next_dose_date", value)}
                    />
                    {feedback("next_dose_date")}
                  </div>
                  <div className="vaccination-renewal-fields">
                    <div className="form-field">
                      <label htmlFor="needs_renewal">
                        Needs to be renewed?
                      </label>
                      <CustomSelect
                        id="needs_renewal"
                        value={draft.needs_renewal ? "yes" : "no"}
                        onChange={(value) => {
                          update("needs_renewal", value === "yes");
                          if (value !== "yes") update("renewal_date", "");
                        }}
                        options={[
                          { value: "no", label: "No" },
                          { value: "yes", label: "Yes" },
                        ]}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="renewal_date">Renewal date</label>
                      <DatePicker
                        id="renewal_date"
                        optional
                        disabled={!draft.needs_renewal}
                        value={draft.renewal_date ?? ""}
                        invalid={!!errors.renewal_date}
                        placeholder="Add renewal date"
                        onChange={(value) => update("renewal_date", value)}
                      />
                      {feedback("renewal_date")}
                    </div>
                  </div>
                </>
              )}
            </div>
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
          </FormSection>

          {type !== "Vaccination" && (
            <FormSection number={3} title="Medical information">
              <div className="event-section-grid event-medical-grid">
                {orderedMedicalFields.map(longField)}
              </div>
            </FormSection>
          )}

          <FormSection
            number={type === "Vaccination" ? 3 : 4}
            title="Additional information"
            className="event-additional-section"
          >
            <div className="event-section-grid">
              <div className="form-field">
                <label htmlFor="episode_id">Health episode</label>
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
                          ? "No episode"
                          : "No episodes for this profile",
                    },
                    ...episodeOptions.map((episode) => ({
                      value: episode.id,
                      label:
                        episode.title +
                        " · " +
                        (episode.status === "active" ? "Active" : "Resolved") +
                        " · " +
                        formatDate(episode.start_date),
                    })),
                  ]}
                />
                {episodeError && (
                  <p className="field-error" role="alert">
                    {episodeError}{" "}
                    <button
                      type="button"
                      className="text-link"
                      onClick={() =>
                        setEpisodeAttempt((attempt) => attempt + 1)
                      }
                    >
                      Retry
                    </button>
                  </p>
                )}
              </div>
              <div>
                <PendingDocumentPicker
                  value={pendingDocument}
                  disabled={busy || labelBusy}
                  profileId={draft.profile_id}
                  currentEventId={event?.id}
                  onChange={(value) => {
                    setPendingDocument(value);
                    setDirty(true);
                  }}
                />
              </div>
              {longField("notes")}
              <div>
                <EventLabelEditor
                  showHeading={false}
                  onBusyChange={setLabelBusy}
                  fieldErrors={errors}
                  tagIds={draft.tag_ids}
                  onTags={(ids) => update("tag_ids", ids)}
                />
              </div>
            </div>
            <div className="event-reminders-editor">
              <div className="event-reminders-heading">
                <span className="field-label">
                  <Bell size={15} aria-hidden="true" /> Reminders
                </span>
                <button
                  type="button"
                  className="text-link"
                  disabled={remindersLoading || reminders.length >= 20}
                  onClick={() => {
                    setReminders((items) => [
                      ...items,
                      {
                        key: crypto.randomUUID(),
                        title: "",
                        due_date: draft.event_date.slice(0, 10),
                        recurrence: "none",
                      },
                    ]);
                    setDirty(true);
                  }}
                >
                  <Plus size={15} aria-hidden="true" /> Add reminder
                </button>
              </div>
              {remindersLoading ? (
                <p className="muted" role="status">Loading reminders…</p>
              ) : (
                reminders.map((reminder) => (
                  <div className="event-reminder-row" key={reminder.key}>
                    <div className="form-field">
                      <label className="sr-only" htmlFor={`reminder-title-${reminder.key}`}>Reminder</label>
                      <input
                        id={`reminder-title-${reminder.key}`}
                        value={reminder.title}
                        maxLength={300}
                        placeholder="Reminder"
                        onChange={(change) => {
                          setReminders((items) => items.map((item) => item.key === reminder.key ? { ...item, title: change.target.value } : item));
                          setDirty(true);
                        }}
                      />
                    </div>
                    <DatePicker
                      id={`reminder-date-${reminder.key}`}
                      value={reminder.due_date}
                      ariaLabel="Reminder date"
                      onChange={(value) => {
                        setReminders((items) => items.map((item) => item.key === reminder.key ? { ...item, due_date: value } : item));
                        setDirty(true);
                      }}
                    />
                    <CustomSelect
                      id={`reminder-repeat-${reminder.key}`}
                      value={reminder.recurrence}
                      ariaLabel="Repeat reminder"
                      onChange={(value) => {
                        setReminders((items) => items.map((item) => item.key === reminder.key ? { ...item, recurrence: value as EventReminderDraft["recurrence"] } : item));
                        setDirty(true);
                      }}
                      options={[
                        { value: "none", label: "Does not repeat" },
                        { value: "monthly", label: "Monthly" },
                        { value: "yearly", label: "Yearly" },
                      ]}
                    />
                    <button
                      type="button"
                      className="icon-button danger-icon-button"
                      aria-label="Remove reminder"
                      title="Remove reminder"
                      onClick={() => {
                        setReminders((items) => items.filter((item) => item.key !== reminder.key));
                        setDirty(true);
                      }}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
              {reminderError && <p className="field-error" role="alert">{reminderError}</p>}
            </div>
          </FormSection>
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
            router.push(event ? "/events/" + event.id : "/timeline")
          }
        />
      )}
      {addingProvider && (
        <ProviderEditor
          onClose={() => setAddingProvider(false)}
          onSaved={(provider) => {
            doctors.reload();
            update("provider_id", provider.id);
            update("doctor", provider.name);
            setAddingProvider(false);
          }}
        />
      )}
    </>
  );
}
