"use client";
import { EventTypeBadge } from "../event-types";
import { LoadingState, useToast } from "../ui/feedback";
import { ProfileIdentity } from "../ui/profile-avatar";
import { TagPill } from "../ui/labels";
import { RichTextContent } from "../ui/rich-text";
import {
  Stethoscope,
  HeartPulse,
  ClipboardCheck,
  Pill,
  NotebookPen,
  FileText,
  Bell,
} from "lucide-react";
import { EventAttachments } from "./attachments";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, Trash2, CalendarDays } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { dateLabel, eventDisplayTitle, fieldLabel } from "@/lib/events";
import { formatDate } from "@/lib/date-format";
import { useProfiles } from "../app-shell";
import { useEvent } from "./use-event";
import type { Reminder } from "@/lib/reminders";

function EventReminders({ eventId }: { eventId: string }) {
  const [reminders, setReminders] = useState<Reminder[]>();
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ reminders: Reminder[] }>(
      `/api/v1/reminders?source_event_id=${eventId}&page_size=20`,
      controller.signal,
    ).then((result) => setReminders(result.reminders)).catch(() => {});
    return () => controller.abort();
  }, [eventId]);
  if (!reminders?.length) return null;
  return (
    <section className="clinical-section event-reminder-detail" id="event-reminders">
      <div className="clinical-heading">
        <span className="state-symbol"><Bell size={22} /></span>
        <h2>Reminders</h2>
      </div>
      <ul>
        {reminders.map((reminder) => (
          <li key={reminder.id}>
            <div><strong>{reminder.title}</strong><time dateTime={reminder.due_date}>{formatDate(reminder.due_date)}</time></div>
            <span className={`reminder-status-pill ${reminder.status}`}>{reminder.status}</span>
          </li>
        ))}
      </ul>
      <Link className="text-link" href="/reminders">View reminders</Link>
    </section>
  );
}
export function EventDetail({ id }: { id: string }) {
  const { event, error, retry } = useEvent(id);
  const { profiles } = useProfiles();
  const router = useRouter();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  async function remove() {
    if (deleting || attachmentBusy || !event) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch<void>(`/api/v1/events/${event.id}`, undefined, {
        method: "DELETE",
      });
      toast("Event deleted.");
      dialog.current?.close();
      router.replace("/timeline");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        dialog.current?.close();
        router.replace("/timeline");
        return;
      }
      setDeleteError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete this event. Please try again.",
      );
      setDeleting(false);
    }
  }
  if (error)
    return (
      <section className="card event-state" role="alert">
        <p>{error}</p>
        <button className="button secondary-button" onClick={retry}>
          Try again
        </button>
        <Link href="/timeline" className="text-link">
          Back to timeline
        </Link>
      </section>
    );
  if (!event) return <LoadingState label="Opening this health event…" />;
  const profile = profiles.find((item) => item.id === event.profile_id);
  return (
    <>
      <Link href="/timeline" className="text-link event-back">
        <ArrowLeft size={16} /> Back to timeline
      </Link>
      <div className="page-heading event-detail-heading">
        <div>
          <h1>{eventDisplayTitle(event)}</h1>
        </div>
        <div className="event-actions">
          <Link
            className="icon-button"
            href={`/events/${event.id}/edit`}
            aria-label="Edit event"
            title="Edit"
          >
            <Pencil size={17} aria-hidden="true" />
          </Link>
          <button
            className="icon-button danger-icon"
            aria-label="Delete event"
            title="Delete"
            disabled={attachmentBusy}
            onClick={() => {
              setDeleteError("");
              dialog.current?.showModal();
            }}
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      {event.tags?.length ? (
        <div className="event-labels event-detail-tags" aria-label="Tags">
          {event.tags.map((tag) => (
            <TagPill name={tag.name} key={tag.id} />
          ))}
        </div>
      ) : null}
      <section className="card basic-information" id="basic-information">
        <div className="clinical-heading">
          <span className="state-symbol">
            <CalendarDays size={22} />
          </span>
          <h2>Basic information</h2>
        </div>
        <dl className="basic-grid">
          <div>
            <dt>Health profile</dt>
            <dd>
              <ProfileIdentity
                name={profile?.name ?? "Health profile"}
                avatar={profile?.avatar}
              />
            </dd>
          </div>
          <div>
            <dt>Event type</dt>
            <dd>
              <EventTypeBadge type={event.event_type} />
            </dd>
          </div>
          <div>
            <dt>
              {event.event_type === "Illness" ? "Started" : "Date and time"}
            </dt>
            <dd>
              <time dateTime={event.event_date}>
                {dateLabel(event.event_date)}
              </time>
            </dd>
          </div>
          {event.end_date && (
            <div>
              <dt>Until</dt>
              <dd>
                <time dateTime={event.end_date}>
                  {dateLabel(event.end_date)}
                </time>
              </dd>
            </div>
          )}
          {(event.provider || event.doctor) && (
            <div>
              <dt>Doctor</dt>
              <dd>
                {event.provider ? (
                  <Link
                    className="text-link"
                    href={`/providers/${event.provider.id}`}
                  >
                    {event.provider.name}
                  </Link>
                ) : (
                  event.doctor
                )}
              </dd>
            </div>
          )}
          {event.location && (
            <div>
              <dt>Location</dt>
              <dd>{event.location}</dd>
            </div>
          )}
        </dl>
        {event.event_type === "Vaccination" && (
          <div className="vaccination-detail">
            <h3>Vaccination record</h3>
            <dl>
              <div>
                <dt>Vaccine name</dt>
                <dd>{event.title}</dd>
              </div>
              <div>
                <dt>Dose</dt>
                <dd>
                  {event.dose_number || event.dose_total
                    ? `${event.dose_number ?? "–"}/${event.dose_total ?? "–"}`
                    : "Not recorded"}
                </dd>
              </div>
              <div>
                <dt>Next recommended dose</dt>
                <dd>
                  {event.next_dose_date ? (
                    <time dateTime={event.next_dose_date}>
                      {formatDate(event.next_dose_date)}
                    </time>
                  ) : (
                    "Not recorded"
                  )}
                </dd>
              </div>
              <div>
                <dt>Needs to be renewed?</dt>
                <dd>{event.needs_renewal ? "Yes" : "No"}</dd>
              </div>
              {event.needs_renewal && (
                <div>
                  <dt>Renewal date</dt>
                  <dd>
                    {event.renewal_date ? (
                      <time dateTime={event.renewal_date}>
                        {formatDate(event.renewal_date)}
                      </time>
                    ) : (
                      "Not recorded"
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </section>
      <div className="clinical-grid">
        {[
          {
            field: "description" as const,
            title: fieldLabel(event.event_type, "description"),
            icon: FileText,
          },
          { field: "symptoms" as const, title: "Symptoms", icon: HeartPulse },
          {
            field: "diagnosis" as const,
            title: "Diagnosis",
            icon: ClipboardCheck,
          },
          {
            field: "treatment" as const,
            title: "Treatment",
            icon: Stethoscope,
          },
          {
            field: "prescription" as const,
            title: "Prescriptions",
            icon: Pill,
          },
          { field: "notes" as const, title: "Notes", icon: NotebookPen },
        ]
          .filter((section) => event[section.field])
          .map(({ field, title, icon: Icon }) => (
            <section
              className={`clinical-section clinical-${field}`}
              id={`detail-${field}`}
              key={field}
            >
              <div className="clinical-heading">
                <span className="state-symbol">
                  <Icon size={22} />
                </span>
                <h2>{title}</h2>
              </div>
              <RichTextContent value={String(event[field])} />
            </section>
          ))}
      </div>

      <EventReminders eventId={event.id} />

      <p className="event-updated">
        Last updated {dateLabel(event.updated_at)}
      </p>
      <EventAttachments
        eventId={event.id}
        onBusyChange={setAttachmentBusy}
        disabled={deleting}
      />
      <dialog
        ref={dialog}
        className="delete-dialog"
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
        onCancel={(e) => {
          if (deleting) e.preventDefault();
        }}
      >
        <h2 id="delete-title">Delete event?</h2>
        <p id="delete-description">
          This event and its documents will be deleted.
        </p>
        {deleteError && (
          <p className="form-error" role="alert">
            {deleteError}
          </p>
        )}
        <div className="form-actions">
          <button
            autoFocus
            className="button secondary-button"
            disabled={deleting}
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button
            className="button danger-button"
            disabled={deleting}
            onClick={remove}
          >
            {deleting ? "Deleting…" : "Delete event"}
          </button>
        </div>
      </dialog>
    </>
  );
}
