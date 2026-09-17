import { supabase } from "./supabase";
type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  cache?: "session" | "no-store";
  maxAgeMs?: number;
};
type CacheEntry = {
  expiresAt: number;
  promise: Promise<unknown>;
};
const queryCache = new Map<string, CacheEntry>();
const defaultMaxAgeMs = 5 * 60_000;

export function clearApiCache() {
  queryCache.clear();
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(
      new DOMException("The request was aborted.", "AbortError"),
    );
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(new DOMException("The request was aborted.", "AbortError"));
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
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
  options: ApiOptions = {},
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
  const method = options.method ?? "GET";
  const readOnlyPost =
    method === "POST" &&
    [
      "/api/v1/events/search",
      "/api/v1/events/timeline",
      "/api/v1/events/dashboard",
      "/api/v1/documents/search",
    ].includes(path);
  const cacheable =
    options.cache === "session" ||
    ((method === "GET" || readOnlyPost) && options.cache !== "no-store");
  const key = JSON.stringify([
    session.user.id,
    method,
    path,
    options.body ?? null,
  ]);
  if (cacheable) {
    const cached = queryCache.get(key);
    if (cached && cached.expiresAt > Date.now())
      return withAbort(cached.promise as Promise<T>, signal);
    if (cached) queryCache.delete(key);
  }

  const request = (async () => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    }).catch(() => {
      throw new Error(
        "Unable to connect. Check your connection and try again.",
      );
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (
        (response.status === 401 || response.status === 403) &&
        window.location.pathname !== "/login"
      ) {
        clearApiCache();
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
    if (!cacheable) clearApiCache();
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  })();

  if (cacheable) {
    const entry = {
      expiresAt: Date.now() + (options.maxAgeMs ?? defaultMaxAgeMs),
      promise: request as Promise<unknown>,
    };
    queryCache.set(key, entry);
    void request.catch(() => {
      if (queryCache.get(key) === entry) queryCache.delete(key);
    });
  }
  return withAbort(request, signal);
}
