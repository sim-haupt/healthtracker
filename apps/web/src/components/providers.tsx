"use client";
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
  History,
  Star,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Provider, ProviderInput } from "@/lib/providers";
import { useProviders } from "./providers-context";
import { useProfiles } from "./app-shell";
import { FilterBar } from "./ui/filter-bar";
import { ProfileColumns } from "./ui/profile-columns";
import { TimelineGroups } from "./tracker/timeline";
import type { TimelineItem } from "@/lib/timeline";
import { documentTitle } from "@/lib/documents";
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
export function ProviderEditor({
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
            : field === "name"
              ? draft.name.trim() || "Unnamed provider"
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
      className="delete-dialog provider-dialog structured-form-dialog"
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
                  {fieldLabels[field]}
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
          <FilterBar
            label="Find a provider"
            count={Number(!!search)}
            onClear={() => setSearch("")}
            search={{
              id: "provider-search",
              label: "Find a provider",
              value: search,
              onChange: setSearch,
              placeholder: "Search name or specialty…",
            }}
          />
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
type ProviderTimelineResponse = {
  items: Array<{
    id: string;
    record_type: "event" | "document";
    event_id: string;
    document_group_id: string | null;
    profile_id: string;
    event_type: string | null;
    title: string;
    occurred_at: string;
    description: string | null;
    file_name: string | null;
    document_category: string | null;
  }>;
  total: number;
};

async function loadProviderTimeline(
  id: string,
  page: number,
  profileId?: string,
  signal?: AbortSignal,
) {
  try {
    return await apiFetch<ProviderTimelineResponse>(
      `/api/v1/providers/${id}/timeline?page=${page}${profileId ? `&profile_id=${profileId}` : ""}`,
      signal,
    );
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.status !== 404 || !supabase)
      throw cause;
    const { data, error } = await supabase.rpc("provider_health_timeline", {
      p_provider_id: id,
      p_profile_id: profileId ?? null,
      p_page: page,
      p_page_size: 30,
    });
    if (error) throw new Error(error.message);
    return data as ProviderTimelineResponse;
  }
}

function RelatedRecords({ id }: { id: string }) {
  const [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: ProviderTimelineResponse;
    error?: string;
  }>({ key: "" });
  const { activeProfile } = useProfiles();
  const key = `${id}:${activeProfile?.id ?? "all"}:${page}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    loadProviderTimeline(id, page, activeProfile?.id, controller.signal)
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
  const items: TimelineItem[] = data.items.map((item) => ({
    id: item.id,
    entry_type: item.record_type,
    event_id: item.event_id,
    profile_id: item.profile_id,
    event_type: item.event_type ?? "Document",
    title:
      item.record_type === "document"
        ? documentTitle({
            description: item.description,
            file_name: item.file_name ?? "Document",
          })
        : item.title,
    event_title: item.title,
    occurred_at: item.occurred_at,
    summary: "",
    tags: [],
    category: null,
    document_category: item.document_category,
  }));
  return (
    <>
      <div className="section-intro">
        <h2>Timeline</h2>
        <p>
          {data.total} related {data.total === 1 ? "record" : "records"} ·
          Events and documents · Newest first
        </p>
      </div>
      {!data.total ? (
        <section className="card event-state">
          <History size={25} />
          <h2>No related records</h2>
          <p>Events and documents linked to this provider will appear here.</p>

          <Link className="button" href="/events/new">
            Add event
          </Link>
        </section>
      ) : (
        <>
          <ProfileColumns
            items={items}
            profileId={(item) => item.profile_id}
            noun="record"
            className="timeline-profile-columns provider-timeline-columns"
          >
            {(profileItems) => <TimelineGroups items={profileItems} />}
          </ProfileColumns>
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
                Earlier records
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
