import type { EpisodeDataAccess } from "./episodes.js";
// Shared fixtures for API tests; this module is excluded from production output.
import type { EventDataAccess } from "./events.js";
import type { ProviderDataAccess } from "./providers.js";
import type { UserDataAccess } from "./data.js";
import type { AttachmentDataAccess } from "./attachments.js";
import type { DocumentDataAccess } from "./documents.js";
export const emptyEventData: EpisodeDataAccess &
  EventDataAccess &
  ProviderDataAccess &
  AttachmentDataAccess &
  DocumentDataAccess &
  Pick<UserDataAccess, "updateProfile" | "updateLabel" | "deleteLabel"> = {
  listEpisodes: async () => [],
  getEpisode: async () => null,
  saveEpisode: async () => null,
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
