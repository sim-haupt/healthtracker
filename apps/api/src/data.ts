import type { EventTypeDataAccess, ManagedEventType } from "./event-types.js";
import type { EpisodeDataAccess, Episode } from "./episodes.js";
import type { ProviderDataAccess } from "./providers.js";
import type { DocumentDataAccess, HealthDocument } from "./documents.js";
import type { ReminderDataAccess, Reminder } from "./reminders.js";
import { randomUUID } from "node:crypto";
import type { AttachmentDataAccess } from "./attachments.js";
import type { Attachment } from "./attachment-types.js";
import { createClient } from "@supabase/supabase-js";
import {
  EventDataError,
  type EventDataAccess,
  type HealthEvent,
  type EventSummary,
} from "./events.js";
export type HealthProfile = {
  id: string;
  name: string;
  avatar: string | null;
  created_at: string;
};
export type UserDataAccess = EventTypeDataAccess &
  EpisodeDataAccess &
  EventDataAccess &
  ProviderDataAccess &
  AttachmentDataAccess &
  DocumentDataAccess &
  ReminderDataAccess & {
    updateProfile: (
      id: string,
      input: { name: string; avatar: string | null },
    ) => Promise<HealthProfile | null>;
    updateLabel: (
      kind: "categories" | "tags",
      id: string,
      name: string,
    ) => Promise<{ id: string; name: string } | null>;
    deleteLabel: (kind: "categories" | "tags", id: string) => Promise<boolean>;
    isApproved: (userId: string) => Promise<boolean>;
    listProfiles: () => Promise<HealthProfile[]>;
  };
// Never share a mutable session/client between requests. The caller's JWT keeps
// every query inside Supabase RLS; no service-role credential is used.
export function createUserDataAccess(
  url: string,
  key: string,
  token: string,
): UserDataAccess {
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  function eventError(error: { code?: string; message?: string }): never {
    if (error.code === "23001")
      throw new EventDataError(
        409,
        "An attachment was added while deleting. Refresh the event and try again.",
      );
    if (error.code === "23505")
      throw new EventDataError(
        409,
        "That name already exists. Choose the existing label.",
      );
    if (error.code === "23503")
      throw new EventDataError(
        400,
        "Check the selected profile and related records. Linked records must belong to the same health profile.",
      );
    if (error.code === "42501")
      throw new EventDataError(
        403,
        "You no longer have access to this workspace.",
      );
    if (
      error.code === "23514" ||
      error.code === "22007" ||
      error.code === "22008"
    )
      throw new EventDataError(400, "Check the event values and dates.");
    throw new EventDataError(
      503,
      "Events are temporarily unavailable. Please try again.",
    );
  }
  const bucket = client.storage.from("health-attachments");
  async function deleteAttachment(eventId: string, id: string) {
    const { data: row, error } = await client
      .from("attachments")
      .select("id,file_path")
      .eq("health_event_id", eventId)
      .eq("id", id)
      .maybeSingle();
    if (error)
      throw new EventDataError(503, "Attachments are temporarily unavailable.");
    if (!row) return false;
    const removed = await bucket.remove([row.file_path]);
    if (removed.error)
      throw new EventDataError(503, "Unable to delete the file. Please retry.");
    const deleted = await client.from("attachments").delete().eq("id", id);
    if (deleted.error)
      throw new EventDataError(
        503,
        "The file was removed but its entry could not be deleted. Please retry.",
      );
    return true;
  }
  return {
    async listEventTypes() {
      const { data, error } = await client
        .from("event_types")
        .select("id,key,name,color,archived")
        .order("name");
      if (error) throw new EventDataError(503, "Unable to load event types.");
      return data as ManagedEventType[];
    },
    async saveEventType(id, input) {
      const q = id
        ? client.from("event_types").update(input).eq("id", id)
        : client.from("event_types").insert(input);
      const { data, error } = await q
        .select("id,key,name,color,archived")
        .maybeSingle();
      if (error) {
        if (error.code === "23505")
          throw new EventDataError(
            409,
            "An event type with this name already exists.",
          );
        throw new EventDataError(503, "Unable to save event type.");
      }
      return data as ManagedEventType | null;
    },
    async archiveEventType(id) {
      const { data, error } = await client
        .from("event_types")
        .update({ archived: true })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw new EventDataError(503, "Unable to remove event type.");
      return !!data;
    },
    async listEpisodes(profileId) {
      const { data, error } = await client.rpc("list_health_episodes", {
        p_profile_id: profileId ?? null,
      });
      if (error) throw new EventDataError(503, "Unable to load episodes.");
      return data as Episode[];
    },
    async getEpisode(id) {
      const { data, error } = await client.rpc("episode_document", {
        p_id: id,
      });
      if (error) throw new EventDataError(503, "Unable to load episode.");
      return data as Episode | null;
    },
    async saveEpisode(id, input) {
      const { data, error } = await client.rpc("save_health_episode", {
        p_id: id,
        p_input: input,
      });
      if (error) {
        if (error.code === "23503")
          throw new EventDataError(
            400,
            "Choose events belonging to the selected profile.",
          );
        if (error.code === "23514")
          throw new EventDataError(400, "Check the episode dates and details.");
        throw new EventDataError(503, "Unable to save episode.");
      }
      return data as Episode | null;
    },
    async linkEventToEpisode(episodeId, eventId) {
      const { data, error } = await client.rpc("link_event_to_episode", {
        p_episode_id: episodeId,
        p_event_id: eventId,
      });
      if (error)
        throw new EventDataError(503, "Unable to link event to episode.");
      return data === true;
    },
    async deleteEpisode(id) {
      const { data, error } = await client
        .from("health_episodes")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw new EventDataError(503, "Unable to delete episode.");
      return !!data;
    },
    async listReminders(query) {
      let request = client
        .from("reminders")
        .select(
          "id,profile_id,source_event_id,reminder_kind,title,due_date,recurrence,status,completed_at,created_at,updated_at",
          { count: "exact" },
        );
      if (query.profile_id)
        request = request.eq("profile_id", query.profile_id);
      if (query.source_event_id)
        request = request.eq("source_event_id", query.source_event_id);
      if (query.reminder_kind)
        request = request.eq("reminder_kind", query.reminder_kind);
      if (query.status) request = request.eq("status", query.status);
      if (query.recurrence)
        request = request.eq("recurrence", query.recurrence);
      if (query.date_from) request = request.gte("due_date", query.date_from);
      if (query.date_to) request = request.lte("due_date", query.date_to);
      if (query.q) request = request.ilike("title", `%${query.q}%`);
      const start = (query.page - 1) * query.page_size;
      const { data, error, count } = await request
        .order("due_date", { ascending: true })
        .order("id")
        .range(start, start + query.page_size - 1);
      if (error)
        throw new EventDataError(503, "Reminders are temporarily unavailable.");
      return {
        reminders: (data ?? []).map((item) => ({
          ...item,
          due_date: String(item.due_date).slice(0, 10),
          source_event: null,
        })) as Reminder[],
        total: count ?? 0,
      };
    },
    async saveReminder(id, input) {
      const values = {
        ...input,
        reminder_kind: "custom",
        status: "scheduled",
        completed_at: null,
      };
      let request = id
        ? client
            .from("reminders")
            .update(values)
            .eq("id", id)
            .eq("reminder_kind", "custom")
        : client.from("reminders").insert(values);
      const { data, error } = await request
        .select(
          "id,profile_id,source_event_id,reminder_kind,title,due_date,recurrence,status,completed_at,created_at,updated_at",
        )
        .maybeSingle();
      if (error) eventError(error);
      return data as Reminder | null;
    },
    async setReminderStatus(id, status) {
      const current = await client
        .from("reminders")
        .select("id,recurrence,due_date")
        .eq("id", id)
        .maybeSingle();
      if (current.error) eventError(current.error);
      if (!current.data) return null;
      const recurring =
        status === "completed" && current.data.recurrence !== "none";
      let dueDate = current.data.due_date;
      if (recurring) {
        const next = new Date(`${dueDate}T12:00:00Z`);
        if (current.data.recurrence === "monthly")
          next.setUTCMonth(next.getUTCMonth() + 1);
        else next.setUTCFullYear(next.getUTCFullYear() + 1);
        dueDate = next.toISOString().slice(0, 10);
      }
      const values = recurring
        ? { status: "scheduled", completed_at: null, due_date: dueDate }
        : {
            status,
            completed_at:
              status === "completed" ? new Date().toISOString() : null,
          };
      const { data, error } = await client
        .from("reminders")
        .update(values)
        .eq("id", id)
        .select(
          "id,profile_id,source_event_id,reminder_kind,title,due_date,recurrence,status,completed_at,created_at,updated_at",
        )
        .maybeSingle();
      if (error) eventError(error);
      return data as Reminder | null;
    },
    async deleteReminder(id) {
      const { data, error } = await client
        .from("reminders")
        .delete()
        .eq("id", id)
        .eq("reminder_kind", "custom")
        .select("id")
        .maybeSingle();
      if (error) eventError(error);
      return !!data;
    },
    async syncEventReminders(eventId, reminders) {
      const { data, error } = await client.rpc("sync_event_reminders", {
        p_event_id: eventId,
        p_reminders: reminders,
      });
      if (error) eventError(error);
      return data as Reminder[] | null;
    },
    async listAttachments(eventId) {
      const { data, error } = await client.rpc("event_documents", {
        p_event_id: eventId,
      });
      if (error)
        throw new EventDataError(
          503,
          "Attachments are temporarily unavailable.",
        );
      return data as Attachment[];
    },
    async listEventUploads(eventId) {
      const { data, error } = await client.rpc("event_uploads", {
        p_event_id: eventId,
      });
      if (error)
        throw new EventDataError(503, "Uploads are temporarily unavailable.");
      return data as Attachment[];
    },
    async createAttachment(eventId, ownerId, input) {
      const id = randomUUID();
      const { tag_ids, ...attachmentInput } = input;
      const { data, error } = await client
        .from("attachments")
        .insert({
          ...attachmentInput,
          id,
          document_group_id: input.document_group_id ?? id,
          owner_id: ownerId,
          health_event_id: eventId,
          file_path: `${ownerId}/${eventId}/${id}`,
        })
        .select(
          "id,document_group_id,health_event_id,file_name,file_path,mime_type,file_size,document_category,attachment_kind,description,created_at",
        )
        .single();
      if (error)
        throw new EventDataError(
          503,
          "Unable to prepare the attachment. Refresh and try again.",
        );
      if (tag_ids.length) {
        const linked = await client.from("health_event_tags").upsert(
          tag_ids.map((tagId) => ({
            owner_id: ownerId,
            event_id: eventId,
            tag_id: tagId,
          })),
          { onConflict: "event_id,tag_id" },
        );
        if (linked.error) {
          await client.from("attachments").delete().eq("id", id);
          throw new EventDataError(400, "Choose available tags.");
        }
      }
      return data!;
    },
    async linkAttachment(eventId, documentId) {
      const { data, error } = await client.rpc("link_event_document", {
        p_event_id: eventId,
        p_document_id: documentId,
      });
      if (error)
        throw new EventDataError(
          503,
          "Unable to attach the document. Refresh and try again.",
        );
      return data as Attachment | null;
    },
    deleteAttachment,
    async listDocuments(query) {
      const { data, error } = await client.rpc("search_health_documents", {
        p_filters: query,
      });
      if (error)
        throw new EventDataError(
          503,
          "Documents are temporarily unavailable. Please try again.",
        );
      return data as { documents: HealthDocument[]; total: number };
    },
    async updateDocument(documentGroupId, input) {
      const { data, error } = await client
        .from("attachments")
        .update(input)
        .eq("document_group_id", documentGroupId)
        .eq("attachment_kind", "document")
        .select("id");
      if (error)
        throw new EventDataError(
          503,
          "Unable to update the document. Please retry.",
        );
      return !!data?.length;
    },
    async listProviders() {
      const { data, error } = await client
        .from("providers")
        .select(
          "id,name,specialty,phone,email,address,website,rating,notes,created_at",
        )
        .order("name");
      if (error)
        throw new EventDataError(503, "Providers are temporarily unavailable.");
      return data!;
    },
    async getProvider(id) {
      const { data, error } = await client
        .from("providers")
        .select(
          "id,name,specialty,phone,email,address,website,rating,notes,created_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw new EventDataError(503, "Unable to load this provider.");
      return data;
    },
    async saveProvider(id, input) {
      const query = id
        ? client.from("providers").update(input).eq("id", id)
        : client.from("providers").insert(input);
      const { data, error } = await query
        .select(
          "id,name,specialty,phone,email,address,website,rating,notes,created_at",
        )
        .maybeSingle();
      if (error) throw new EventDataError(503, "Unable to save this provider.");
      return data;
    },
    async deleteProvider(id) {
      const { data, error } = await client
        .from("providers")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error)
        throw new EventDataError(503, "Unable to delete this provider.");
      return data !== null;
    },
    async providerEvents(id, page, profileId) {
      let query = client
        .from("health_events")
        .select(
          "id,profile_id,provider_id,event_type,title,event_date,end_date,description,symptoms,diagnosis,treatment,prescription,doctor,location,notes,test_type,severity,trigger,relief,injury_type,body_area,frequency,recovery,action,disease,dose_number,dose_total,next_dose_date,needs_renewal,renewal_date,created_at,updated_at",
          { count: "exact" },
        )
        .eq("provider_id", id);
      if (profileId) query = query.eq("profile_id", profileId);
      const { data, error, count } = await query
        .order("event_date", { ascending: false })
        .order("id", { ascending: false })
        .range((page - 1) * 30, page * 30 - 1);
      if (error)
        throw new EventDataError(503, "Unable to load related health records.");
      return { events: data as HealthEvent[], total: count ?? 0 };
    },
    async updateProfile(id, input) {
      const previous = await client
        .from("profiles")
        .select("avatar")
        .eq("id", id)
        .maybeSingle();
      if (previous.error)
        throw new EventDataError(503, "Unable to load this profile.");
      if (!previous.data) return null;
      if (input.avatar && input.avatar !== previous.data.avatar) {
        const file = await client.storage
          .from("profile-avatars")
          .download(input.avatar);
        if (
          file.error ||
          !file.data ||
          file.data.size > 2097152 ||
          file.data.size === 0 ||
          !["image/jpeg", "image/png", "image/webp"].includes(file.data.type)
        )
          throw new EventDataError(
            400,
            "Upload a JPG, PNG, or WebP image up to 2 MB first.",
          );
      }
      const { data, error } = await client
        .from("profiles")
        .update(input)
        .eq("id", id)
        .select("id,name,avatar,created_at")
        .maybeSingle();
      if (error)
        throw new EventDataError(
          503,
          "Unable to save this profile. Please retry.",
        );
      return data;
    },
    async updateLabel(kind, id, name) {
      const { data, error } = await client
        .from(kind)
        .update({ name })
        .eq("id", id)
        .select("id,name")
        .maybeSingle();
      if (error) eventError(error);
      return data;
    },
    async deleteLabel(kind, id) {
      const { data, error } = await client
        .from(kind)
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) eventError(error);
      return data !== null;
    },
    async listLabels(kind) {
      const { data, error } = await client
        .from(kind)
        .select("id,name")
        .order("name");
      if (error) eventError(error);
      const column = kind === "categories" ? "category_id" : "tag_id";
      const table =
        kind === "categories" ? "health_events" : "health_event_tags";
      const counts = new Map<string, number>();
      for (let offset = 0; ; offset += 1000) {
        const { data: rows, error: countError } = await client
          .from(table)
          .select(column)
          .order(kind === "categories" ? "id" : "event_id")
          .range(offset, offset + 999);
        // Popularity is an enhancement. Labels should remain usable if the
        // supporting count query is temporarily unavailable.
        if (countError) break;
        for (const row of rows ?? []) {
          const id = (row as unknown as Record<string, string>)[column];
          if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        if (!rows || rows.length < 1000) break;
      }
      return data!.map((label) => ({
        ...label,
        usage_count: counts.get(label.id) ?? 0,
      }));
    },
    async createLabel(kind, name) {
      const { data, error } = await client
        .from(kind)
        .insert({ name })
        .select("id,name")
        .single();
      if (error) eventError(error);
      return data!;
    },
    async timeline(query, entryType) {
      const { data, error } = await client.rpc("health_timeline", {
        p_filters: query,
        p_entry_type: entryType,
      });
      if (error) eventError(error);
      return data;
    },
    async dashboard(query) {
      const { data, error } = await client.rpc("health_dashboard", {
        p_filters: query,
      });
      if (error) eventError(error);
      return data;
    },
    async listEvents(query) {
      const { data, error } = await client.rpc("search_health_events", {
        p_filters: query,
      });
      if (error) eventError(error);
      return data as { events: EventSummary[]; total: number };
    },
    async getEvent(id) {
      const { data, error } = await client.rpc("health_event_document", {
        p_id: id,
      });
      if (error) eventError(error);
      return data as HealthEvent | null;
    },
    async createEvent(input, _ownerId) {
      const { data, error } = await client.rpc("save_health_event", {
        p_id: null,
        p_input: input,
      });
      if (error) eventError(error);
      return data as HealthEvent;
    },
    async updateEvent(id, input) {
      const { data, error } = await client.rpc("save_health_event", {
        p_id: id,
        p_input: input,
      });
      if (error) eventError(error);
      return data as HealthEvent | null;
    },
    async deleteEvent(id) {
      const attachments = await client
        .from("attachments")
        .select("id")
        .eq("health_event_id", id);
      if (attachments.error)
        throw new EventDataError(
          503,
          "Unable to check event attachments. Please retry.",
        );
      for (const attachment of attachments.data!)
        await deleteAttachment(id, attachment.id);

      const { data, error } = await client
        .from("health_events")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) eventError(error);
      return data !== null;
    },
    async isApproved(userId) {
      const { data, error } = await client
        .from("app_users")
        .select("user_id")
        .eq("user_id", userId)
        .eq("enabled", true)
        .maybeSingle();
      if (error) throw new Error("Membership lookup failed");
      return data !== null;
    },
    async listProfiles() {
      const { data, error } = await client
        .from("profiles")
        .select("id, name, avatar, created_at")
        .order("created_at")
        .order("name")
        .order("id");
      if (error) throw new Error("Profile lookup failed");
      return data;
    },
  };
}
