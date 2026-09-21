"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { dayKey, monthDays, parseDay } from "@/lib/tracker";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { localeCode } from "@/lib/locale";

export type PickerOption = {
  value: string;
  label: string;
  content?: ReactNode;
  disabled?: boolean;
};

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function snapTimeToFiveMinutes(value: string) {
  if (!validTime(value)) return value;
  const [hours, minutes] = value.split(":").map(Number);
  const rounded = Math.round((hours * 60 + minutes) / 5) * 5;
  const bounded = Math.min(rounded, 23 * 60 + 55);
  return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(bounded % 60).padStart(2, "0")}`;
}

const hourOptions = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, "0");
  return { value, label: value };
});

const minuteOptions = Array.from({ length: 12 }, (_, index) => {
  const value = String(index * 5).padStart(2, "0");
  return { value, label: value };
});

export function CustomSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select…",
  className = "",
  ariaLabel,
  invalid = false,
}: {
  id?: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  invalid?: boolean;
}) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const enabled = options.filter((option) => !option.disabled);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      enabled.findIndex((option) => option.value === value),
    ),
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function choose(option: PickerOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
  }

  return (
    <div className={`custom-select ${className}`.trim()} ref={root}>
      <button
        id={controlId}
        type="button"
        className="custom-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => {
          setActive(
            Math.max(
              0,
              enabled.findIndex((option) => option.value === value),
            ),
          );
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
            setActive((current) => {
              if (!enabled.length) return 0;
              if (event.key === "Home") return 0;
              if (event.key === "End") return Math.max(0, enabled.length - 1);
              const delta = event.key === "ArrowDown" ? 1 : -1;
              return (current + delta + enabled.length) % enabled.length;
            });
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (enabled[active]) choose(enabled[active]);
          } else if (event.key === "Escape") setOpen(false);
        }}
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="custom-select-menu"
          role="listbox"
          aria-labelledby={controlId}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={`${isSelected ? "selected" : ""} ${enabled[active]?.value === option.value ? "active" : ""}`}
                key={option.value}
                onMouseEnter={() =>
                  setActive(
                    enabled.findIndex((item) => item.value === option.value),
                  )
                }
                onClick={() => choose(option)}
              >
                <span>{option.content ?? option.label}</span>
                {isSelected && <Check size={15} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MultiSelect({
  id,
  values,
  options,
  onChange,
  disabled = false,
  placeholder = "Select…",
  ariaLabel,
  invalid = false,
}: {
  id: string;
  values: string[];
  options: PickerOption[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  invalid?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedLabels = values.map(
    (value) => options.find((option) => option.value === value)?.label ?? value,
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function toggle(option: PickerOption) {
    if (option.disabled) return;
    onChange(
      values.includes(option.value)
        ? values.filter((value) => value !== option.value)
        : [...values, option.value],
    );
  }

  return (
    <div className="custom-select multi-select" ref={root}>
      <button
        id={id}
        type="button"
        className="custom-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <span>
          {selectedLabels.length ? selectedLabels.join(", ") : placeholder}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="custom-select-menu multi-select-menu"
          role="listbox"
          aria-labelledby={id}
          aria-multiselectable="true"
        >
          {options.map((option) => {
            const selected = values.includes(option.value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                className={selected ? "selected" : ""}
                key={option.value}
                onClick={() => toggle(option)}
              >
                <span>{option.content ?? option.label}</span>
                {selected && <Check size={15} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matching options.",
  invalid = false,
}: {
  id: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  invalid?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const visible = options.filter(
    (option) =>
      !query.trim() ||
      option.label
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    requestAnimationFrame(() => search.current?.focus());
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="custom-select searchable-select" ref={root}>
      <button
        id={id}
        type="button"
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="custom-select-menu searchable-select-menu">
          <div className="filter-bar-search searchable-select-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={search}
              type="search"
              value={query}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
            />
            {query && (
              <button
                type="button"
                className="search-clear-button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <div role="listbox" aria-labelledby={id}>
            {visible.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  className={isSelected ? "selected" : ""}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <span>{option.content ?? option.label}</span>
                  {isSelected && <Check size={15} aria-hidden="true" />}
                </button>
              );
            })}
            {!visible.length && <p className="select-empty">{emptyText}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function DatePicker({
  id,
  value,
  onChange,
  mode = "date",
  disabled = false,
  min,
  optional = false,
  invalid = false,
  ariaLabel,
  placeholder = "Choose a date",
  allowTimeToggle = false,
  timeEnabled = mode === "datetime",
  onTimeToggle,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  mode?: "date" | "datetime";
  disabled?: boolean;
  min?: string;
  optional?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  allowTimeToggle?: boolean;
  timeEnabled?: boolean;
  onTimeToggle?: (enabled: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const selectedDay = parseDay(value.slice(0, 10));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    () =>
      selectedDay ??
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [time, setTime] = useState(value.slice(11, 16) || "09:00");
  const days = useMemo(() => monthDays(month), [month]);
  const years = useMemo(() => {
    const first = 1900;
    const last = new Date().getFullYear() + 20;
    const values = Array.from(
      { length: last - first + 1 },
      (_, index) => first + index,
    );
    return values.includes(month.getFullYear())
      ? values
      : [...values, month.getFullYear()].sort((a, b) => a - b);
  }, [month]);
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) =>
        new Date(2024, index, 1).toLocaleDateString(localeCode(), {
          month: "long",
        }),
      ),
    [],
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function select(day: Date) {
    const date = dayKey(day);
    if (min && date < min.slice(0, 10)) return;
    onChange(mode === "datetime" ? `${date}T${time}:00` : date);
    if (mode === "date") setOpen(false);
  }

  function commitTime(value: string) {
    if (!selectedDay || !validTime(value)) return;
    const snapped = snapTimeToFiveMinutes(value);
    setTime(snapped);
    onChange(`${dayKey(selectedDay)}T${snapped}:00`);
  }

  function changeTimePart(part: "hour" | "minute", nextValue: string) {
    const snapped = snapTimeToFiveMinutes(time) || "09:00";
    const [hour, minute] = snapped.split(":");
    const next =
      part === "hour" ? `${nextValue}:${minute}` : `${hour}:${nextValue}`;
    setTime(next);
    commitTime(next);
  }

  const display = value
    ? mode === "datetime"
      ? formatDateTime(new Date(value).toISOString())
      : formatDate(value)
    : placeholder;

  return (
    <div
      className="date-picker"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        id={id}
        type="button"
        className="date-picker-trigger"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => {
          if (selectedDay)
            setMonth(
              new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1),
            );
          setTime(snapTimeToFiveMinutes(value.slice(11, 16) || "09:00"));
          setOpen((current) => !current);
        }}
      >
        <span className={value ? "" : "placeholder"}>{display}</span>
        <CalendarDays size={17} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="date-picker-popover"
          role="dialog"
          aria-label="Choose date"
        >
          <div className="date-picker-month">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft size={17} />
            </button>
            <div className="date-picker-period">
              <CustomSelect
                id={`${id}-month`}
                className="date-picker-month-control"
                value={String(month.getMonth())}
                ariaLabel="Select month"
                onChange={(nextMonth) =>
                  setMonth(new Date(month.getFullYear(), Number(nextMonth), 1))
                }
                options={months.map((label, index) => ({
                  value: String(index),
                  label,
                }))}
              />
              <CustomSelect
                id={`${id}-year`}
                className="date-picker-year-control"
                value={String(month.getFullYear())}
                ariaLabel="Select year"
                onChange={(nextYear) =>
                  setMonth(new Date(Number(nextYear), month.getMonth(), 1))
                }
                options={years.map((year) => ({
                  value: String(year),
                  label: String(year),
                }))}
              />
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="date-picker-weekdays" aria-hidden="true">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="date-picker-days">
            {days.map((day) => {
              const key = dayKey(day);
              const unavailable = !!min && key < min.slice(0, 10);
              return (
                <button
                  type="button"
                  key={key}
                  disabled={unavailable}
                  className={`${day.getMonth() === month.getMonth() ? "" : "outside"} ${value.slice(0, 10) === key ? "selected" : ""}`}
                  aria-label={formatDate(day)}
                  onClick={() => select(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          {allowTimeToggle && onTimeToggle && (
            <button
              type="button"
              className="date-picker-time-toggle"
              role="switch"
              aria-checked={timeEnabled}
              onClick={() => onTimeToggle(!timeEnabled)}
            >
              <span>
                <strong>Add time</strong>
                <small>Include a specific time for this event</small>
              </span>
              <span className="date-picker-switch" aria-hidden="true">
                <span />
              </span>
            </button>
          )}
          {mode === "datetime" && (
            <div className="date-picker-time">
              <span className="date-picker-time-label">Time</span>
              <div className="date-picker-time-controls">
                <CustomSelect
                  id={`${id}-hour`}
                  value={(snapTimeToFiveMinutes(time) || "09:00").slice(0, 2)}
                  ariaLabel="Select hour"
                  onChange={(nextHour) => changeTimePart("hour", nextHour)}
                  options={hourOptions}
                />
                <span aria-hidden="true">:</span>
                <CustomSelect
                  id={`${id}-minute`}
                  value={(snapTimeToFiveMinutes(time) || "09:00").slice(3, 5)}
                  ariaLabel="Select minute"
                  onChange={(nextMinute) =>
                    changeTimePart("minute", nextMinute)
                  }
                  options={minuteOptions}
                />
              </div>
              <button
                type="button"
                className="button"
                disabled={!selectedDay || !validTime(time)}
                onClick={() => {
                  commitTime(time);
                  setOpen(false);
                }}
              >
                Done
              </button>
            </div>
          )}
          {optional && value && (
            <button
              type="button"
              className="date-picker-clear"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <X size={14} /> Clear date
            </button>
          )}
        </div>
      )}
    </div>
  );
}
