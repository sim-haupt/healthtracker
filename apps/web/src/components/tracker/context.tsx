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
  categories: Label[];
  tags: Label[];
  labelError: string;
  labelsLoading: boolean;
  reloadLabels: () => void;
  createLabel: (kind: "categories" | "tags", name: string) => Promise<Label>;
} | null>(null);
export function useTracker() {
  const value = useContext(Context);
  if (!value) throw new Error("Tracker context is missing");
  return value;
}
export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<TrackerFilters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<Label[]>([]),
    [tags, setTags] = useState<Label[]>([]);
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
    Promise.all([
      apiFetch<{ labels: Label[] }>("/api/v1/categories", controller.signal),
      apiFetch<{ labels: Label[] }>("/api/v1/tags", controller.signal),
    ])
      .then(([c, t]) => {
        if (!controller.signal.aborted) {
          setCategories(c.labels);
          setTags(t.labels);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLabelError(
            error instanceof Error
              ? error.message
              : "Unable to load categories and tags.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLabelsLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  async function createLabel(kind: "categories" | "tags", name: string) {
    const { label } = await apiFetch<{ label: Label }>(
      `/api/v1/${kind}`,
      undefined,
      { method: "POST", body: { name } },
    );
    const update = kind === "tags" ? setTags : setCategories;
    update((items) =>
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
        categories,
        tags,
        labelError,
        labelsLoading,
        reloadLabels: () => setRevision((n) => n + 1),
        createLabel,
      }}
    >
      {children}
    </Context.Provider>
  );
}
