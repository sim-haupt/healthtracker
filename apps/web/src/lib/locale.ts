export type AppLocale = "en" | "de";

export function currentLocale(): AppLocale {
  if (typeof document !== "undefined" && document.documentElement.lang === "de")
    return "de";
  return "en";
}

export function localeCode() {
  return currentLocale() === "de" ? "de-DE" : "en-GB";
}
