"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Bell, Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/date-format";
import type { Reminder, ReminderRecurrence, ReminderStatus } from "@/lib/reminders";
import { useProfiles } from "./app-shell";
import { ConfirmDialog, ErrorState, LoadingState, useToast } from "./ui/feedback";
import { FilterBar } from "./ui/filter-bar";
import { DatePicker, CustomSelect } from "./ui/pickers";
import { ProfileIdentity } from "./ui/profile-avatar";
import { ProfileColumns } from "./ui/profile-columns";

type Result = { reminders: Reminder[]; total: number };

function ReminderEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { profiles, activeProfile } = useProfiles();
  const toast = useToast();
  const [profileId, setProfileId] = useState(activeProfile?.id ?? profiles[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => dialog.current?.showModal(), []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !profileId) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/v1/reminders", undefined, {
        method: "POST",
        body: { profile_id: profileId, title, due_date: date, recurrence },
      });
      toast("Reminder saved.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save reminder.");
      setBusy(false);
    }
  }
  return (
    <dialog ref={dialog} className="delete-dialog reminder-dialog structured-form-dialog" aria-labelledby="reminder-editor-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <h2 id="reminder-editor-title">Add reminder</h2>
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <div className="reminder-form-grid">
            <div className="form-field">
              <label htmlFor="reminder-profile">Profile</label>
              <CustomSelect id="reminder-profile" value={profileId} onChange={setProfileId} options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))} />
            </div>
            <div className="form-field reminder-title-field">
              <label htmlFor="reminder-title">Reminder</label>
              <input id="reminder-title" value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="reminder-date">Date</label>
              <DatePicker id="reminder-date" value={date} onChange={setDate} />
            </div>
            <div className="form-field">
              <label htmlFor="reminder-recurrence">Repeat</label>
              <CustomSelect id="reminder-recurrence" value={recurrence} onChange={(value) => setRecurrence(value as ReminderRecurrence)} options={[
                { value: "none", label: "Does not repeat" },
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]} />
            </div>
          </div>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button secondary-button" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="button" disabled={busy}>{busy ? "Saving…" : "Save reminder"}</button>
        </div>
      </form>
    </dialog>
  );
}

export function Reminders() {
  const { profiles, activeProfile } = useProfiles();
  const toast = useToast();
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Reminder>();
  const [busyId, setBusyId] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuerySearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError("");
    const params = new URLSearchParams({ page_size: "100" });
    if (activeProfile) params.set("profile_id", activeProfile.id);
    if (status) params.set("status", status);
    if (recurrence) params.set("recurrence", recurrence);
    if (querySearch) params.set("q", querySearch);
    apiFetch<Result>(`/api/v1/reminders?${params}`, controller.signal)
      .then(setResult)
      .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [activeProfile, status, recurrence, querySearch, attempt]);

  async function changeStatus(reminder: Reminder, next: ReminderStatus) {
    setBusyId(reminder.id);
    try {
      const { reminder: saved } = await apiFetch<{ reminder: Reminder }>(`/api/v1/reminders/${reminder.id}/status`, undefined, { method: "PUT", body: { status: next } });
      toast(next === "completed" && reminder.recurrence !== "none" ? `Completed. Next reminder: ${formatDate(saved.due_date)}.` : next === "completed" ? "Reminder completed." : "Reminder restored.");
      setAttempt((value) => value + 1);
    } catch (cause) {
      toast(cause instanceof ApiError ? cause.message : "Unable to update reminder.");
    } finally { setBusyId(""); }
  }

  async function remove() {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await apiFetch(`/api/v1/reminders/${deleting.id}`, undefined, { method: "DELETE" });
      toast("Reminder deleted.");
      setDeleting(undefined);
      setAttempt((value) => value + 1);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Unable to delete reminder.");
      setBusyId("");
    }
  }

  return (
    <>
      <div className="page-heading">
        <div><h1>Reminders</h1></div>
        <button type="button" className="button" onClick={() => setAdding(true)}><Plus size={18} /> Add reminder</button>
      </div>
      <FilterBar
        label="Filter reminders"
        count={Number(!!status) + Number(!!recurrence) + Number(!!search)}
        onClear={() => { setStatus(""); setRecurrence(""); setSearch(""); }}
        primary={
          <>
            <div className="filter-select"><label htmlFor="reminder-status">Status</label><CustomSelect id="reminder-status" value={status} onChange={setStatus} options={[
              { value: "", label: "All statuses" }, { value: "scheduled", label: "Scheduled" }, { value: "completed", label: "Completed" },
            ]} /></div>
            <div className="filter-select"><label htmlFor="reminder-repeat-filter">Repeat</label><CustomSelect id="reminder-repeat-filter" value={recurrence} onChange={setRecurrence} options={[
              { value: "", label: "All reminders" }, { value: "none", label: "Does not repeat" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" },
            ]} /></div>
          </>
        }
        search={{ id: "reminder-search", label: "Search reminders", value: search, placeholder: "Search reminders…", onChange: setSearch }}
      />
      {error ? <ErrorState message={error} retry={() => setAttempt((value) => value + 1)} /> : !result ? <LoadingState label="Loading reminders…" /> : !result.reminders.length ? (
        <section className="card event-state"><span className="state-symbol"><Bell size={25} /></span><h2>No reminders</h2></section>
      ) : (
        <ProfileColumns items={result.reminders} profileId={(reminder) => reminder.profile_id} noun="reminder">
          {(profileReminders) => (
          <section className="reminder-list" aria-label="Reminders">
          {profileReminders.map((reminder) => {
            const profile = profiles.find((item) => item.id === reminder.profile_id);
            const overdue = reminder.status === "scheduled" && reminder.due_date < new Date().toISOString().slice(0, 10);
            return (
              <article className="reminder-row" key={reminder.id}>
                <div className="reminder-card-main">
                  <span className={`dashboard-reminder-icon ${overdue ? "overdue" : ""}`} aria-hidden="true"><Bell size={17} /></span>
                  <div>
                    <div className="reminder-card-meta">
                      <ProfileIdentity name={profile?.name ?? "Health profile"} avatar={profile?.avatar} />
                      <span className={`reminder-status-pill ${reminder.status}`}>{reminder.status}</span>
                    </div>
                    <h2>{reminder.title}</h2>
                    <p><time dateTime={reminder.due_date}>{formatDate(reminder.due_date)}</time>{reminder.recurrence !== "none" && ` · ${reminder.recurrence}`}</p>
                  </div>
                </div>
                <div className="reminder-card-actions">
                  {reminder.source_event_id && (
                    <Link
                      className="icon-button"
                      href={`/events/${reminder.source_event_id}`}
                      aria-label="View related event"
                      title="View related event"
                    >
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </Link>
                  )}
                  {reminder.status === "scheduled" ? (
                    <button type="button" className="icon-button" disabled={busyId === reminder.id} aria-label="Complete reminder" title="Complete" onClick={() => changeStatus(reminder, "completed")}><Check size={17} aria-hidden="true" /></button>
                  ) : (
                    <button type="button" className="reminder-state-button" disabled={busyId === reminder.id} onClick={() => changeStatus(reminder, "scheduled")}><RotateCcw size={16} aria-hidden="true" /> Restore</button>
                  )}
                  {reminder.reminder_kind === "custom" && <button type="button" className="icon-button danger-icon-button" disabled={busyId === reminder.id} aria-label="Delete reminder" title="Delete" onClick={() => setDeleting(reminder)}><Trash2 size={17} /></button>}
                </div>
              </article>
            );
          })}
          </section>
          )}
        </ProfileColumns>
      )}
      {adding && <ReminderEditor onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setAttempt((value) => value + 1); }} />}
      {deleting && <ConfirmDialog title="Delete reminder?" description="This reminder will be deleted." busy={busyId === deleting.id} onClose={() => setDeleting(undefined)} onConfirm={remove} />}
    </>
  );
}
