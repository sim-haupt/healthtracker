"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { apiFetch } from "@/lib/api";
import { emptyFilters, type TrackerFilters, type Label } from "@/lib/tracker";
const Context = createContext<{
  filters: TrackerFilters;
  setFilters: Dispatch<SetStateAction<TrackerFilters>>;
  search: string;
  tags: Label[];
  labelError: string;
  labelsLoading: boolean;
  reloadLabels: () => void;
  createTag: (name: string) => Promise<Label>;
} | null>(null);
export function useTracker() {
  const value = useContext(Context);
  if (!value) throw new Error("Tracker context is missing");
  return value;
}
export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<TrackerFilters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [tags, setTags] = useState<Label[]>([]);
  const [labelError, setLabelError] = useState(""),
    [labelsLoading, setLabelsLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(filters.q), 300);
    return () => clearTimeout(timer);
  }, [filters.q]);
  useEffect(() => {
    const controller = new AbortController();
    setLabelsLoading(true);
    setLabelError("");
    apiFetch<{ labels: Label[] }>("/api/v1/tags", controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setTags(result.labels);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLabelError("Tags couldn’t be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLabelsLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  async function createTag(name: string) {
    const { label } = await apiFetch<{ label: Label }>(
      "/api/v1/tags",
      undefined,
      { method: "POST", body: { name } },
    );
    setTags((items) =>
      [...items.filter((item) => item.id !== label.id), label].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    return label;
  }
  return (
    <Context.Provider
      value={{
        filters,
        setFilters,
        search,
        tags,
        labelError,
        labelsLoading,
        reloadLabels: () => setRevision((n) => n + 1),
        createTag,
      }}
    >
      {children}
    </Context.Provider>
  );
}
