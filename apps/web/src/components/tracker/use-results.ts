"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { EventSummary } from "@/lib/events";
export type EventResults = { events: EventSummary[]; total: number };
export function useTrackerResults<T>(
  endpoint: string,
  query: Record<string, unknown>,
  options: { error?: string; empty?: boolean; allPages?: boolean } = {},
) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([
    endpoint,
    query,
    options.error,
    options.empty,
    options.allPages,
    attempt,
  ]);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key: "" },
  );
  useEffect(() => {
    if (options.error || options.empty) return;
    const controller = new AbortController();
    async function load() {
      let data: T = await apiFetch<T>(endpoint, controller.signal, {
        method: "POST",
        body: query,
        cache: "session",
      });
      if (options.allPages) {
        const first = data as EventResults;
        const events = [...first.events];
        let page = 1;
        while (events.length < first.total) {
          const next = await apiFetch<EventResults>(
            endpoint,
            controller.signal,
            {
              method: "POST",
              body: { ...query, page: ++page, page_size: 100 },
              cache: "session",
            },
          );
          if (!next.events.length || next.total !== first.total)
            throw new Error(
              "Events changed while loading. Please refresh the calendar.",
            );
          events.push(...next.events);
        }
        const unique = [
          ...new Map(events.map((event) => [event.id, event])).values(),
        ];
        if (unique.length !== first.total)
          throw new Error(
            "Events changed while loading. Please refresh the calendar.",
          );
        data = { ...first, events: unique } as T;
      }
      if (!controller.signal.aborted) setState({ key, data });
    }
    load().catch((cause) => {
      if (!controller.signal.aborted)
        setState({
          key,
          error:
            cause instanceof Error ? cause.message : "Unable to load events.",
        });
    });
    return () => controller.abort();
    // The serialized key includes every request input; objects may be rebuilt by callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    data: options.empty
      ? ({ events: [], total: 0 } as T)
      : state.key === key
        ? state.data
        : undefined,
    error: options.error || (state.key === key ? state.error : undefined),
    retry: () => setAttempt((n) => n + 1),
  };
}
