/** Local calendar date as YYYY-MM-DD. */
export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
