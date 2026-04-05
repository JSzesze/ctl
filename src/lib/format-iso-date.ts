/** Local calendar date as YYYY-MM-DD. */
export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Preset ranges for usage dashboards (local calendar, browser timezone). */
export type UsageDateRangePreset = "today" | "week" | "month";

/**
 * Inclusive local date range: `today` = single day; `week` = Monday–today; `month` = 1st–today.
 */
export function localDateRangeForPreset(preset: UsageDateRangePreset, now = new Date()): { start: string; end: string } {
  const end = localIsoDate(now);
  if (preset === "today") {
    return { start: end, end };
  }
  if (preset === "month") {
    const y = now.getFullYear();
    const mo = now.getMonth();
    const start = `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    return { start, end };
  }
  // Week: Monday (ISO-style) through today
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = d.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + delta);
  return { start: localIsoDate(d), end };
}

/** `Date#getTimezoneOffset()` minutes → UTC±H or UTC±H:MM for sessions.usage. */
export function utcOffsetLabelFromBrowser(): string {
  const offsetFromUtcMinutes = -new Date().getTimezoneOffset();
  const sign = offsetFromUtcMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetFromUtcMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return minutes === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}
