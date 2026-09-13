"use client";
import { EventTypeSettings } from "./event-types";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Check, Tags, Pencil, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useProfiles, type HealthProfile } from "./app-shell";
import { useTracker } from "./tracker/context";
import { ProfileAvatar } from "./ui/profile-avatar";
import { TagPill } from "./ui/labels";
import {
  ConfirmDialog,
  LoadingState,
  ErrorState,
  useToast,
} from "./ui/feedback";
import type { Label } from "@/lib/tracker";
function ProfileEditor({
  profile,
  index,
}: {
  profile: HealthProfile;
  index: number;
}) {
  const { updateProfile } = useProfiles(),
    toast = useToast();
  const [name, setName] = useState(profile.name),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [removeAvatar, setRemoveAvatar] = useState(false),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const dirty = name.trim() !== profile.name || file !== null || removeAvatar;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || name.trim().length > 100) {
      setError("Enter a name between 1 and 100 characters.");
      return;
    }
    setBusy(true);
    setError("");
    let uploaded: string | null = null;
    let saved = false;
    try {
      if (file) {
        const {
          data: { session },
        } = await supabase!.auth.getSession();
        if (!session) throw new Error("Please sign in again.");
        uploaded = `${session.user.id}/${profile.id}/${crypto.randomUUID()}`;
        const result = await supabase!.storage
          .from("profile-avatars")
          .upload(uploaded, file, {
            contentType: file.type,
            upsert: false,
            cacheControl: "0",
          });
        if (result.error)
          throw new Error("Photo upload failed. Please try again.");
      }
      const avatar = uploaded ?? (removeAvatar ? null : profile.avatar);
      const { profile: updated } = await apiFetch<{ profile: HealthProfile }>(
        `/api/v1/profiles/${profile.id}`,
        undefined,
        { method: "PUT", body: { name: name.trim(), avatar } },
      );
      saved = true;
      updateProfile(updated);
      setName(updated.name);
      setFile(null);
      setRemoveAvatar(false);
      toast("Profile updated.");
      if (profile.avatar && profile.avatar !== avatar) {
        const result = await supabase!.storage
          .from("profile-avatars")
          .remove([profile.avatar]);
        if (result.error)
          setError(
            "Profile saved. The previous photo could not be removed from storage.",
          );
      }
    } catch (cause) {
      if (uploaded && !saved)
        await supabase!.storage
          .from("profile-avatars")
          .remove([uploaded])
          .catch(() => {});
      setError(
        cause instanceof Error ? cause.message : "Unable to save profile.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <form className="card profile-editor" onSubmit={save}>
      <p className="eyebrow">HEALTH PROFILE {index + 1}</p>
      <div className="profile-photo-row">
        {preview ? (
          <span className="avatar portrait portrait-large">
            <img src={preview} alt="New profile photo preview" />
          </span>
        ) : (
          <ProfileAvatar
            large
            name={name}
            avatar={removeAvatar ? null : profile.avatar}
          />
        )}
        <div>
          <button
            type="button"
            className="button secondary-button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Camera size={16} />
            Change photo
          </button>
          <p className="muted">JPG, PNG, or WebP · Up to 2 MB</p>
        </div>
      </div>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Photo for ${profile.name}`}
        disabled={busy}
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (!chosen) return;
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(chosen.type) ||
            chosen.size < 1 ||
            chosen.size > 2097152
          ) {
            setError("Choose a JPG, PNG, or WebP image up to 2 MB.");
            e.target.value = "";
            return;
          }
          setError("");
          setFile(chosen);
          setRemoveAvatar(false);
        }}
      />
      {(file || profile.avatar) && !removeAvatar && (
        <button
          type="button"
          className="icon-button danger-icon remove-photo"
          aria-label={`Delete photo for ${profile.name}`}
          title="Delete photo"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      )}
      <div className="form-field">
        <label htmlFor={`name-${profile.id}`}>Display name</label>
        <input
          id={`name-${profile.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          disabled={busy}
          autoComplete="off"
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="settings-save">
        <span className="muted">
          {dirty ? "Unsaved changes" : "Up to date"}
        </span>
        <button className="button" disabled={busy || !dirty}>
          <Check size={16} />
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
      {confirm && (
        <ConfirmDialog
          title="Remove profile photo?"
          description="Your initials will be shown instead. Save the profile to apply this change."
          action="Remove photo"
          busy={false}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            setFile(null);
            setRemoveAvatar(true);
            setConfirm(false);
          }}
        />
      )}
    </form>
  );
}
function TagManager() {
  const tracker = useTracker(),
    toast = useToast();
  const labels = tracker.tags;
  const [name, setName] = useState(""),
    [editing, setEditing] = useState<Label | null>(null),
    [pending, setPending] = useState<Label | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const singular = "tag";
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError("Enter a name first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing)
        await apiFetch(`/api/v1/tags/${editing.id}`, undefined, {
          method: "PUT",
          body: { name: name.trim() },
        });
      else await tracker.createTag(name.trim());
      toast(`Tag ${editing ? "updated" : "created"}.`);
      setName("");
      setEditing(null);
      tracker.reloadLabels();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save label.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/tags/${pending.id}`, undefined, {
        method: "DELETE",
      });
      tracker.setFilters((filters) => ({
        ...filters,
        tag_ids: filters.tag_ids.filter((id) => id !== pending.id),
      }));
      if (editing?.id === pending.id) {
        setEditing(null);
        setName("");
      }
      setPending(null);
      tracker.reloadLabels();
      toast("Tag deleted.");
    } catch (cause) {
      setPending(null);
      setError(
        cause instanceof Error ? cause.message : "Unable to delete label.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card label-manager">
      <div className="settings-section-title">
        <span className="state-symbol">
          <Tags size={22} />
        </span>
        <div>
          <h2>Tags</h2>
        </div>
      </div>
      <form onSubmit={save}>
        <label htmlFor="label-tags">
          {editing ? `Rename “${editing.name}”` : `Add a ${singular}`}
        </label>
        <div className="inline-create">
          <input
            id="label-tags"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            placeholder="e.g. annual checkup"
            disabled={busy}
          />
          <button
            className="button secondary-button"
            disabled={busy || !name.trim()}
          >
            {editing ? <Check size={16} /> : <Plus size={16} />}{" "}
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
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {labels.length ? (
        <ul className="settings-label-list">
          {labels.map((label) => (
            <li key={label.id}>
              <TagPill name={label.name} />
              <div>
                <button
                  className="icon-button"
                  aria-label={`Rename ${singular} ${label.name}`}
                  title="Edit"
                  disabled={busy}
                  onClick={() => {
                    setEditing(label);
                    setName(label.name);
                    document.getElementById("label-tags")?.focus();
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button danger-icon"
                  aria-label={`Delete ${singular} ${label.name}`}
                  title="Delete"
                  disabled={busy}
                  onClick={() => setPending(label)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="label-empty">
          {tracker.labelsLoading
            ? "Loading your labels…"
            : "No tags yet. Add your first one above."}
        </p>
      )}
      {pending && (
        <ConfirmDialog
          title={`Delete ${singular}?`}
          description={`“${pending.name}” will be removed from all your events. Events will be kept.`}
          busy={busy}
          onClose={() => setPending(null)}
          onConfirm={remove}
        />
      )}
    </section>
  );
}
export function SettingsPage() {
  const { profiles } = useProfiles();
  const tracker = useTracker();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
        </div>
      </div>
      <div className="section-intro">
        <h2>Profiles</h2>
      </div>
      <div className="settings-grid">
        {profiles.map((profile, index) => (
          <ProfileEditor key={profile.id} profile={profile} index={index} />
        ))}
      </div>
      <EventTypeSettings />
      <div className="section-intro">
        <h2>Tags</h2>
      </div>
      {tracker.labelError ? (
        <ErrorState message={tracker.labelError} retry={tracker.reloadLabels} />
      ) : (
        <div className="settings-grid" aria-busy={tracker.labelsLoading}>
          <TagManager />
        </div>
      )}
    </>
  );
}
