import { apiFetch } from "./api";
import { calendarQuery, monthDays } from "./tracker";

export function preloadWorkspaceData() {
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const calendar = calendarQuery({}, monthDays(month)).query;
  const cachedPost = (path: string, body: Record<string, unknown>) =>
    apiFetch(path, undefined, {
      method: "POST",
      body,
      cache: "session",
    });

  return Promise.allSettled([
    apiFetch("/api/v1/event-types"),
    apiFetch("/api/v1/tags"),
    apiFetch("/api/v1/providers"),
    apiFetch("/api/v1/episodes"),
    apiFetch("/api/v1/reminders?page_size=100"),
    cachedPost("/api/v1/events/dashboard", {}),
    cachedPost("/api/v1/events/timeline", {
      filters: { page: 1, page_size: 30 },
      entry_type: "all",
    }),
    cachedPost("/api/v1/events/search", {
      ...calendar,
      page: 1,
      page_size: 100,
    }),
    cachedPost("/api/v1/events/search", {
      event_type: "Vaccination",
      page: 1,
      page_size: 30,
    }),
    cachedPost("/api/v1/documents/search", { page: 1, page_size: 24 }),
  ]);
}
