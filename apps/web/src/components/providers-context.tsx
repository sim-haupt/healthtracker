"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Provider } from "@/lib/providers";
const Context = createContext<{
  providers: Provider[];
  loading: boolean;
  error: string;
  reload: () => void;
}>({ providers: [], loading: true, error: "", reload: () => {} });
export const useProviders = () => useContext(Context);
export function ProvidersProvider({ children }: { children: React.ReactNode }) {
  const [providers, setProviders] = useState<Provider[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    apiFetch<{ providers: Provider[] }>("/api/v1/providers", controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setProviders(data.providers);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  return (
    <Context.Provider
      value={{
        providers,
        loading,
        error,
        reload: () => setRevision((v) => v + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
