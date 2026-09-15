import type { EventTypeDataAccess } from "./event-types.js";
import type { EpisodeDataAccess } from "./episodes.js";
// Shared fixtures for API tests; this module is excluded from production output.
import type { EventDataAccess } from "./events.js";
import type { ProviderDataAccess } from "./providers.js";
import type { UserDataAccess } from "./data.js";
import type { AttachmentDataAccess } from "./attachments.js";
import type { DocumentDataAccess } from "./documents.js";
import type { ReminderDataAccess } from "./reminders.js";
export const emptyEventData: EventTypeDataAccess &
  EpisodeDataAccess &
  EventDataAccess &
  ProviderDataAccess &
  AttachmentDataAccess &
  DocumentDataAccess &
  ReminderDataAccess &
  Pick<UserDataAccess, "updateProfile" | "updateLabel" | "deleteLabel"> = {
  listEventTypes: async () => [],
  saveEventType: async () => null,
  archiveEventType: async () => false,
  listEpisodes: async () => [],
  getEpisode: async () => null,
  saveEpisode: async () => null,
  linkEventToEpisode: async () => false,
  deleteEpisode: async () => false,
  updateProfile: async () => null,
  updateLabel: async () => null,
  deleteLabel: async () => false,
  listAttachments: async () => [],
  createAttachment: async () => {
    throw new Error("Unexpected attachment write");
  },
  deleteAttachment: async () => false,
  listDocuments: async () => ({ documents: [], total: 0 }),
  listReminders: async () => ({ reminders: [], total: 0 }),
  saveReminder: async () => null,
  setReminderStatus: async () => null,
  deleteReminder: async () => false,
  syncEventReminders: async () => [],
  listProviders: async () => [],
  getProvider: async () => null,
  saveProvider: async () => null,
  deleteProvider: async () => false,
  providerEvents: async () => ({ events: [], total: 0 }),
  timeline: async () => ({ items: [], total: 0 }),
  dashboard: async () => ({ profiles: [] }),
  listLabels: async () => [],
  createLabel: async () => {
    throw new Error("Unexpected label write");
  },
  listEvents: async () => ({ events: [], total: 0 }),
  getEvent: async () => null,
  createEvent: async () => {
    throw new Error("Unexpected event write");
  },
  updateEvent: async () => null,
  deleteEvent: async () => false,
};
