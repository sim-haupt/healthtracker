import { supabase } from "./supabase";
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fields: Record<string, string[]> = {},
  ) {
    super(message);
  }
}
export async function apiFetch<T>(
  path: string,
  signal?: AbortSignal,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  if (!supabase) throw new ApiError("Sign-in is not configured.", 401);
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session) {
    if (window.location.pathname !== "/login")
      window.location.replace("/login");
    throw new ApiError("Please sign in again.", 401);
  }
  const origin = process.env.NEXT_PUBLIC_API_URL;
  if (!origin) throw new Error("API is not configured.");
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    signal,
  }).catch((cause) => {
    if (signal?.aborted) throw cause;
    throw new Error("Unable to connect. Check your connection and try again.");
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (
      (response.status === 401 || response.status === 403) &&
      window.location.pathname !== "/login"
    ) {
      window.location.replace(
        response.status === 403 ? "/login?access=unavailable" : "/login",
      );
    }
    throw new ApiError(
      typeof payload.error === "string"
        ? payload.error
        : "Unable to complete the request. Please try again.",
      response.status,
      payload.fields ?? {},
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
