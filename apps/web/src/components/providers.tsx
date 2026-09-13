"use client";
import { EventTypeBadge } from "./event-types";
import { useTracker } from "./tracker/context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Stethoscope,
  Plus,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Globe,
  ArrowLeft,
  ArrowUpRight,
  NotebookPen,
  Star,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { dateLabel, type HealthEvent } from "@/lib/events";
import type { Provider, ProviderInput } from "@/lib/providers";
import { useProviders } from "./providers-context";
import { useProfiles } from "./app-shell";
import { ProfileIdentity } from "./ui/profile-avatar";
import {
  ConfirmDialog,
  LoadingState,
  ErrorState,
  useToast,
} from "./ui/feedback";
const providerFields = [
  "name",
  "specialty",
  "rating",
  "phone",
  "email",
  "address",
  "website",
  "notes",
] as const;
const fieldLabels: Record<(typeof providerFields)[number], string> = {
  name: "Name",
  specialty: "Specialty",
  rating: "Rating",
  phone: "Phone",
  email: "Email",
  address: "Address",
  website: "Website",
  notes: "Notes",
};
function ProviderRating({
  value,
  onChange,
  readOnly = false,
}: {
  value: number | null;
  onChange?: (value: number | null) => void;
  readOnly?: boolean;
}) {
  if (readOnly)
    return value ? (
      <span
        className="provider-rating provider-rating-readonly"
        aria-label={`${value} out of 5 stars`}
      >
        {Array.from({ length: 5 }, (_, index) => (
          <Star
            key={index}
            size={15}
            className={index < value ? "selected" : ""}
            aria-hidden="true"
          />
        ))}
      </span>
    ) : null;
  return (
    <div className="provider-rating-field">
      <div className="provider-rating" role="radiogroup" aria-label="Rating">
        {Array.from({ length: 5 }, (_, index) => {
          const rating = index + 1;
          return (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-checked={value === rating}
              aria-label={`${rating} ${rating === 1 ? "star" : "stars"}`}
              className={rating <= (value ?? 0) ? "selected" : ""}
              onClick={() => onChange?.(rating)}
            >
              <Star size={22} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {value && (
        <button
          type="button"
          className="provider-rating-clear"
          onClick={() => onChange?.(null)}
        >
          Clear
        </button>
      )}
    </div>
  );
}
function ProviderEditor({
  provider,
  onClose,
  onSaved,
}: {
  provider?: Provider;
  onClose: () => void;
  onSaved: (provider: Provider) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(
    () =>
      Object.fromEntries(
        providerFields.map((field) => [
          field,
          field === "rating"
            ? (provider?.rating?.toString() ?? "")
            : (provider?.[field] ?? ""),
        ]),
      ) as Record<(typeof providerFields)[number], string>,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string[]>>({});
  const toast = useToast();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const input = Object.fromEntries(
        providerFields.map((field) => [
          field,
          field === "rating"
            ? draft.rating
              ? Number(draft.rating)
              : null
            : draft[field].trim() || null,
        ]),
      ) as ProviderInput;
      const { provider: saved } = await apiFetch<{ provider: Provider }>(
        provider ? `/api/v1/providers/${provider.id}` : "/api/v1/providers",
        undefined,
        { method: provider ? "PUT" : "POST", body: input },
      );
      toast(provider ? "Provider updated." : "Provider saved.");
      onSaved(saved);
    } catch (cause) {
      if (cause instanceof ApiError) setErrors(cause.fields);
      setError(
        cause instanceof Error ? cause.message : "Unable to save provider.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="delete-dialog provider-dialog"
      aria-labelledby="provider-editor-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="provider-editor-title">
        {provider ? "Edit provider" : "Add to your medical providers"}
      </h2>
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <div className="provider-form-grid">
            {providerFields.map((field) => (
              <div className={`form-field provider-field-${field}`} key={field}>
                <label htmlFor={`provider-${field}`}>
                  {fieldLabels[field]}{" "}
                  {field !== "name" && <span>Optional</span>}
                </label>
                {field === "rating" ? (
                  <ProviderRating
                    value={draft.rating ? Number(draft.rating) : null}
                    onChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        rating: value?.toString() ?? "",
                      }))
                    }
                  />
                ) : field === "notes" || field === "address" ? (
                  <textarea
                    id={`provider-${field}`}
                    value={draft[field]}
                    maxLength={field === "notes" ? 5000 : 1000}
                    rows={3}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                    aria-invalid={!!errors[field]}
                  />
                ) : (
                  <input
                    id={`provider-${field}`}
                    value={draft[field]}
                    maxLength={
                      field === "name" || field === "phone"
                        ? 100
                        : field === "email"
                          ? 254
                          : field === "website"
                            ? 2000
                            : 200
                    }
                    type={
                      field === "email"
                        ? "email"
                        : field === "website"
                          ? "url"
                          : field === "phone"
                            ? "tel"
                            : "text"
                    }
                    required={field === "name"}
                    placeholder={field === "website" ? "https://…" : undefined}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                    aria-invalid={!!errors[field]}
                  />
                )}{" "}
                {errors[field] && (
                  <p className="field-error">{errors[field][0]}</p>
                )}
              </div>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save provider"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function ProviderDirectory() {
  const { providers, loading, error, reload } = useProviders();
  const [adding, setAdding] = useState(false),
    [search, setSearch] = useState("");
  const router = useRouter();
  const visible = providers.filter((p) =>
    `${p.name} ${p.specialty ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading event-detail-heading">
        <div>
          <h1>Medical Providers</h1>
        </div>
        <button className="button" onClick={() => setAdding(true)}>
          <Plus size={18} />
          Add provider
        </button>
      </div>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading ? (
        <LoadingState label="Loading your medical providers…" />
      ) : (
        <>
          <div className="card tracker-filters form-field provider-search">
            <label htmlFor="provider-search">Find a provider</label>
            <input
              type="search"
              id="provider-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or specialty"
            />
          </div>
          {visible.length ? (
            <div className="settings-grid provider-directory">
              {visible.map((provider) => (
                <Link
                  className="card provider-card"
                  key={provider.id}
                  href={`/providers/${provider.id}`}
                >
                  <span className="state-symbol">
                    <Stethoscope size={24} />
                  </span>
                  <div>
                    <h2>{provider.name}</h2>
                    <p>{provider.specialty || "Healthcare provider"}</p>
                    <ProviderRating value={provider.rating} readOnly />
                    {provider.address && (
                      <span className="muted">{provider.address}</span>
                    )}
                  </div>
                  <ArrowUpRight size={19} />
                </Link>
              ))}
            </div>
          ) : (
            <section className="card event-state">
              <Stethoscope size={28} />
              <h2>{search ? "No matching providers" : "No providers"}</h2>
              <p>{search ? "Try another name or specialty." : ""}</p>
              {!search && (
                <button className="button" onClick={() => setAdding(true)}>
                  Add provider
                </button>
              )}
            </section>
          )}
        </>
      )}
      {adding && (
        <ProviderEditor
          onClose={() => setAdding(false)}
          onSaved={(provider) => {
            reload();
            setAdding(false);
            router.push(`/providers/${provider.id}`);
          }}
        />
      )}
    </>
  );
}
function RelatedRecords({ id }: { id: string }) {
  const [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: { events: HealthEvent[]; total: number };
    error?: string;
  }>({ key: "" });
  const { profiles, activeProfile } = useProfiles();
  const key = `${id}:${activeProfile?.id ?? "all"}:${page}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ events: HealthEvent[]; total: number }>(
      `/api/v1/providers/${id}/events?page=${page}${activeProfile ? `&profile_id=${activeProfile.id}` : ""}`,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data });
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setState({ key, error: cause.message });
      });
    return () => controller.abort();
  }, [id, page, attempt, key, activeProfile]);
  if (state.key !== key)
    return <LoadingState label="Gathering related health records…" />;
  if (state.error)
    return (
      <ErrorState
        message={state.error}
        retry={() => setAttempt((v) => v + 1)}
      />
    );
  const data = state.data!;
  const sections = [
    {
      title: "Related appointments",
      events: data.events.filter((e) => e.event_type === "Doctor Visit"),
      field: "description",
    },
    {
      title: "Diagnoses",
      events: data.events.filter((e) => e.diagnosis),
      field: "diagnosis",
    },
    {
      title: "Prescriptions",
      events: data.events.filter((e) => e.prescription),
      field: "prescription",
    },
    {
      title: "Tests & examinations",
      events: data.events.filter((e) => e.event_type === "Examination / Test"),
      field: "description",
    },
    {
      title: "Event notes",
      events: data.events.filter((e) => e.notes),
      field: "notes",
    },
  ] as const;
  return (
    <>
      <div className="section-intro">
        <h2>Related events</h2>
        <p>
          {data.total} linked {data.total === 1 ? "event" : "events"}. Newest
          first.
        </p>
      </div>
      {!data.total ? (
        <section className="card event-state">
          <NotebookPen size={25} />
          <h2>No related events</h2>

          <Link className="button" href="/events/new">
            Add event
          </Link>
        </section>
      ) : (
        <>
          <p className="muted provider-page-note">
            Showing related details from events {(page - 1) * 30 + 1}–
            {Math.min(page * 30, data.total)} of {data.total}. An event may
            appear in more than one section.
          </p>
          <div className="clinical-grid">
            {sections.map((section) => (
              <section
                className="card provider-record-section"
                key={section.title}
              >
                <h2>{section.title}</h2>
                {section.events.length ? (
                  <ul>
                    {section.events.map((event) => (
                      <li key={event.id}>
                        <Link href={`/events/${event.id}`}>
                          <span className="provider-event-meta muted">
                            {(() => {
                              const profile = profiles.find(
                                (p) => p.id === event.profile_id,
                              );
                              return (
                                <ProfileIdentity
                                  name={profile?.name ?? "Health profile"}
                                  avatar={profile?.avatar}
                                />
                              );
                            })()}
                            <span>· {dateLabel(event.event_date)}</span>
                          </span>
                          <h3>{event.title}</h3>
                          {event[section.field] && (
                            <p>{event[section.field]}</p>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None recorded in these events.</p>
                )}
              </section>
            ))}
          </div>
          <details className="card provider-all-records">
            <summary>All linked events ({data.total})</summary>
            <ul>
              {data.events.map((event) => (
                <li key={event.id}>
                  <Link className="text-link" href={`/events/${event.id}`}>
                    {event.title}
                  </Link>
                  <span className="muted">
                    <EventTypeBadge type={event.event_type} /> ·{" "}
                    {dateLabel(event.event_date)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <div className="card events-pagination">
            <span>
              Page {page} of {Math.ceil(data.total / 30)}
            </span>
            <div>
              <button
                className="button secondary-button"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Newer records
              </button>
              <button
                className="button secondary-button"
                disabled={page * 30 >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Older records
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
export function ProviderDetail({ id }: { id: string }) {
  const tracker = useTracker();
  const [provider, setProvider] = useState<Provider | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false);
  const { reload } = useProviders();
  const toast = useToast(),
    router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    apiFetch<{ provider: Provider }>(
      `/api/v1/providers/${id}`,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setProvider(data.provider);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [id, attempt]);
  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/providers/${id}`, undefined, {
        method: "DELETE",
      });
      reload();
      tracker.setFilters((filters) => ({
        ...filters,
        provider_id: filters.provider_id === id ? "" : filters.provider_id,
      }));
      toast("Provider deleted. Health events were kept.");
      router.replace("/providers");
    } catch (cause) {
      setDeleting(false);
      setError(
        cause instanceof Error ? cause.message : "Unable to delete provider.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <ErrorState message={error} retry={() => setAttempt((v) => v + 1)} />
    );
  if (!provider) return <LoadingState label="Opening provider details…" />;
  const safeWebsite =
    provider.website && /^https?:\/\//i.test(provider.website)
      ? provider.website
      : null;
  return (
    <>
      <Link className="text-link event-back" href="/providers">
        <ArrowLeft size={16} />
        Back to medical providers
      </Link>
      <div className="page-heading event-detail-heading">
        <div>
          <h1>{provider.name}</h1>
          <p>{provider.specialty || "Healthcare provider"}</p>
          <ProviderRating value={provider.rating} readOnly />
        </div>
        <div className="event-actions">
          <button
            className="icon-button"
            aria-label={`Edit ${provider.name}`}
            title="Edit"
            onClick={() => setEditing(true)}
          >
            <Pencil size={17} aria-hidden="true" />
          </button>
          <button
            className="icon-button danger-icon"
            aria-label={`Delete ${provider.name}`}
            title="Delete"
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      <section className="card provider-contact">
        <h2>Contact & details</h2>
        <div className="provider-contact-grid">
          {provider.phone && (
            <div>
              <Phone size={18} />
              <div>
                <span>Phone</span>
                <a href={`tel:${provider.phone.replace(/[^+\d]/g, "")}`}>
                  {provider.phone}
                </a>
              </div>
            </div>
          )}
          {provider.email && (
            <div>
              <Mail size={18} />
              <div>
                <span>Email</span>
                <a href={`mailto:${encodeURIComponent(provider.email)}`}>
                  {provider.email}
                </a>
              </div>
            </div>
          )}
          {provider.address && (
            <div>
              <MapPin size={18} />
              <div>
                <span>Address</span>
                <p>{provider.address}</p>
              </div>
            </div>
          )}
          {safeWebsite && (
            <div>
              <Globe size={18} />
              <div>
                <span>Website</span>
                <a href={safeWebsite} target="_blank" rel="noopener noreferrer">
                  {provider.website}
                  <ArrowUpRight size={14} />
                </a>
              </div>
            </div>
          )}
        </div>
        {!provider.phone &&
          !provider.email &&
          !provider.address &&
          !safeWebsite && (
            <p className="muted">No contact details added yet.</p>
          )}
        {provider.notes && (
          <div className="provider-own-notes">
            <h3>Provider notes</h3>
            <p>{provider.notes}</p>
          </div>
        )}
      </section>
      <RelatedRecords id={id} />
      {editing && (
        <ProviderEditor
          provider={provider}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setProvider(saved);
            setEditing(false);
            reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this provider?"
          description={`Remove ${provider.name} from your medical providers? Linked events and their recorded doctor text will remain, but the saved provider link will be cleared.`}
          busy={busy}
          onClose={() => setDeleting(false)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
