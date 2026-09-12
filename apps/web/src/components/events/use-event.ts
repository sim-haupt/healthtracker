"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { HealthEvent } from "@/lib/events";
export function useEvent(id: string) {
  const [event, setEvent] = useState<HealthEvent | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setEvent(null);
    setError("");
    apiFetch<{ event: HealthEvent }>(
      `/api/v1/events/${encodeURIComponent(id)}`,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setEvent(data.event);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load this event.",
          );
      });
    return () => controller.abort();
  }, [id, attempt]);
  return {
    event: event?.id === id ? event : null,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
