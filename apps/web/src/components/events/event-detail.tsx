"use client";
import { EventTypeBadge } from "../event-types";
import { LoadingState, useToast } from "../ui/feedback";
import { ProfileIdentity } from "../ui/profile-avatar";
import { TagPill } from "../ui/labels";
import {
  Stethoscope,
  HeartPulse,
  ClipboardCheck,
  Pill,
  NotebookPen,
  FileText,
} from "lucide-react";
import { EventAttachments } from "./attachments";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowLeft, Pencil, Trash2, CalendarDays } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { dateLabel, fieldLabel } from "@/lib/events";
import { formatDate } from "@/lib/date-format";
import { useProfiles } from "../app-shell";
import { useEvent } from "./use-event";
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
          <p className="eyebrow">
            <EventTypeBadge type={event.event_type} />
          </p>
          <h1>{event.title}</h1>
          <ProfileIdentity
            name={profile?.name ?? "Health profile"}
            avatar={profile?.avatar}
          />
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
      <nav className="detail-jump-links" aria-label="Event sections">
        <a href="#basic-information">Basic information</a>
        {event.symptoms && <a href="#detail-symptoms">Symptoms</a>}
        {event.diagnosis && <a href="#detail-diagnosis">Diagnosis</a>}
        {event.treatment && <a href="#detail-treatment">Treatment</a>}
        {event.prescription && <a href="#detail-prescription">Prescriptions</a>}
        {event.notes && <a href="#detail-notes">Notes</a>}
        <a href="#attachments-title">Attachments</a>
      </nav>
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
            <dd>{event.event_type}</dd>
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
                <dt>Disease</dt>
                <dd>{event.disease || "Not recorded"}</dd>
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
            </dl>
          </div>
        )}
        {event.tags?.length ? (
          <div className="event-labels">
            {event.tags?.map((tag) => (
              <TagPill name={tag.name} key={tag.id} />
            ))}
          </div>
        ) : null}
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
              <p>{event[field]}</p>
            </section>
          ))}
      </div>

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
          This event and its attachments will be deleted.
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
