function parsedDate(value: string | Date) {
  if (value instanceof Date) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
}

const shortMonths = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function ordinalDay(day: number) {
  const remainder = day % 100;
  if (remainder >= 11 && remainder <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

export function formatDate(value: string | Date) {
  const date = parsedDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = shortMonths[date.getMonth()];
  return `${ordinalDay(date.getDate())} ${month} ${date.getFullYear()}`;
}

export function formatDateTime(value: string | Date) {
  const date = parsedDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate(date)}, ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function formatAccessibleDate(value: string | Date) {
  const date = parsedDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleDateString("en-GB", { weekday: "long" })}, ${formatDate(date)}`;
}
