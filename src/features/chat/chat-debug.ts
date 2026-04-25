/**
 * Chat / gateway debug logs for the browser console.
 *
 * Enable: **on by default** in all builds.
 * - Verbose JSON (truncated): `localStorage.setItem("ctl:chatDebug", "verbose")`.
 *
 * Disable: `localStorage.setItem("ctl:chatDebug", "0")` (or `"false"`), then reload.
 *
 * **File preview** (short, readable lines; not verbose JSON):
 * - On when chat debug is on, unless `localStorage.setItem("ctl:filePreviewDebug", "0")`.
 * - Filter console by `ctl:file-preview` or `file-preview`.
 */

const STORAGE_KEY = "ctl:chatDebug";
const FILE_PREVIEW_DEBUG_KEY = "ctl:filePreviewDebug";

export type ChatDebugLevel = "off" | "on" | "verbose";

export function getChatDebugLevel(): ChatDebugLevel {
  if (typeof window !== "undefined") {
    try {
      const v = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (v === "0" || v === "false") return "off";
      if (v === "verbose") return "verbose";
      if (v === "1" || v === "true") return "on";
    } catch {
      /* private mode */
    }
  }
  return "on";
}

export function isChatDebugEnabled(): boolean {
  return getChatDebugLevel() !== "off";
}

/** Focused logs for file-artifact detection / merge. Off if chat debug is off or `ctl:filePreviewDebug` is "0". */
export function isFilePreviewDebugEnabled(): boolean {
  if (!isChatDebugEnabled()) return false;
  if (typeof window === "undefined") return false;
  try {
    const v = globalThis.localStorage?.getItem(FILE_PREVIEW_DEBUG_KEY);
    if (v === "0" || v === "false") return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Short, scannable logs for the file preview side panel (path/content detection).
 * Uses `console.info` so it stays visible without enabling Verbose in Chrome.
 */
export function filePreviewDebug(message: string, data?: Record<string, unknown>): void {
  if (!isFilePreviewDebugEnabled()) return;
  if (data && Object.keys(data).length > 0) {
    console.info(`[ctl:file-preview] ${message}`, data);
  } else {
    console.info(`[ctl:file-preview] ${message}`);
  }
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(+${s.length - max} chars)`;
}

/** Safe JSON for logs: truncates long strings, caps depth and array length. */
export function jsonForChatDebug(value: unknown, maxLen = 12_000): string {
  const seen = new WeakSet<object>();

  const walk = (v: unknown, depth: number): unknown => {
    if (v == null) return v;
    if (typeof v === "string") return clip(v, 500);
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v !== "object") return String(v);
    if (seen.has(v as object)) return "[Circular]";
    seen.add(v as object);
    if (depth > 8) return "[MaxDepth]";
    if (Array.isArray(v)) {
      const cap = v.slice(0, 24).map((x) => walk(x, depth + 1));
      if (v.length > 24) cap.push(`…+${v.length - 24} items`);
      return cap;
    }
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const keys = Object.keys(o).slice(0, 40);
    for (const k of keys) {
      out[k] = walk(o[k], depth + 1);
    }
    if (Object.keys(o).length > 40) {
      out["…"] = `+${Object.keys(o).length - 40} keys`;
    }
    return out;
  };

  try {
    const out = walk(value, 0);
    const s = JSON.stringify(out);
    return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…(+${s.length - maxLen} chars)`;
  } catch (e) {
    return `[jsonForChatDebug error: ${e instanceof Error ? e.message : String(e)}]`;
  }
}

export function chatDebug(label: string, data?: Record<string, unknown>): void {
  if (!isChatDebugEnabled()) return;
  if (data && Object.keys(data).length > 0) {
    console.debug(`[ctl:chat] ${label}`, data);
  } else {
    console.debug(`[ctl:chat] ${label}`);
  }
}

export function summarizeChatWsPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return { kind: typeof payload, preview: clip(String(payload), 120) };
  }
  const p = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {
    sessionKey: p.sessionKey,
    runId: p.runId,
    state: p.state,
    errorMessage: p.errorMessage,
  };
  const msg = p.message;
  if (msg && typeof msg === "object") {
    const m = msg as Record<string, unknown>;
    out.messageRole = m.role;
    out.messageKeys = Object.keys(m).slice(0, 20);
    const c = m.content;
    if (typeof c === "string") {
      out.contentShape = "string";
      out.contentPreview = clip(c, 180);
    } else if (Array.isArray(c)) {
      out.contentShape = `array[${c.length}]`;
      out.blockTypes = c.slice(0, 16).map((x) => {
        if (!x || typeof x !== "object") return "?";
        const t = (x as { type?: string }).type;
        return typeof t === "string" ? t : "?";
      });
    } else {
      out.contentShape = c === undefined ? "undefined" : typeof c;
    }
  } else if (typeof msg === "string") {
    out.messageShape = "string";
    out.messagePreview = clip(msg, 180);
  } else if (msg !== undefined) {
    out.messageShape = typeof msg;
  }
  return out;
}

export function summarizeAgentWsPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return { kind: typeof payload, preview: clip(String(payload), 120) };
  }
  const p = payload as Record<string, unknown>;
  const data = p.data;
  const base: Record<string, unknown> = {
    sessionKey: p.sessionKey ?? p.session,
    runId: p.runId,
    stream: p.stream,
    state: p.state ?? p.type ?? p.phase ?? p.kind,
    toolName: p.toolName,
    toolCallId: p.toolCallId ?? p.tool_call_id,
  };
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    base.dataPhase = d.phase;
    base.dataName = d.name;
    base.dataToolCallId = d.toolCallId ?? d.id ?? d.tool_call_id;
    base.dataKeys = Object.keys(d).slice(0, 18);
  }
  return base;
}

export function logVerbosePayload(context: string, payload: unknown): void {
  if (getChatDebugLevel() !== "verbose") return;
  console.debug(`[ctl:chat] ${context} payload (truncated JSON)\n`, jsonForChatDebug(payload));
}

/** Post-apply UI model (no message bodies). */
export function chatModelSnapshot(model: {
  streaming: string;
  streamingThinking: string | null;
  activity: string | null;
  activeRunId: string | null;
  sending: boolean;
  entries: readonly unknown[];
}): Record<string, unknown> {
  return {
    streamingLen: model.streaming.length,
    thinkingLen: (model.streamingThinking ?? "").length,
    activity: model.activity,
    activeRunId: model.activeRunId ? clip(model.activeRunId, 24) : null,
    sending: model.sending,
    entryCount: model.entries.length,
  };
}
