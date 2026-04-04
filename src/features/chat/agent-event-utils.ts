/** Serialize tool arguments for display (bounded). */
export function serializeToolArgs(value: unknown, maxLen = 12_000): string {
  if (value == null) return "";
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return String(value);
  }
}

/** Best-effort string from a tool result payload. */
export function stringifyToolResult(data: Record<string, unknown>): string {
  const direct =
    (typeof data.content === "string" && data.content) ||
    (typeof data.output === "string" && data.output) ||
    (typeof data.result === "string" && data.result) ||
    (typeof data.text === "string" && data.text);
  if (direct) return direct.length > 24_000 ? `${direct.slice(0, 24_000)}…` : direct;
  if (data.result != null || data.output != null) {
    try {
      return JSON.stringify(data.result ?? data.output, null, 2);
    } catch {
      return String(data.result ?? data.output);
    }
  }
  return "";
}
