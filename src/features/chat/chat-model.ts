import { serializeToolArgs } from "@/features/chat/agent-event-utils";
import {
  type FileArtifact,
  detectFileArtifact,
  fileArtifactWithToolCallId,
  mergeFileArtifact,
} from "@/features/chat/file-artifact";
import {
  type ContentBlock,
  extractContentBlocks,
  extractRawText,
  messageRole,
  stripEnvelope,
} from "@/features/chat/message-text";
import { clearFileArtifactCache, recallFileArtifact, rememberFileArtifact } from "@/features/chat/file-artifact-cache";
import {
  chatDebug,
  chatModelSnapshot,
  filePreviewDebug,
  isChatDebugEnabled,
} from "@/features/chat/chat-debug";
import type { OpenClawMinimalClient } from "@/lib/openclaw";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatEntryKind = "tool" | "thinking" | "status";

export type ToolRowStatus = "running" | "done" | "error";

export type ChatEntry = {
  /** Stable row key for list rendering (windowing / memo). */
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  /** Undefined = normal text message. */
  kind?: ChatEntryKind;
  toolName?: string;
  toolCallId?: string;
  toolInput?: string;
  toolResult?: string;
  toolStatus?: ToolRowStatus;
  /** Detected file path + body for preview (write/edit tools). */
  fileArtifact?: FileArtifact;
};

export type RunUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  model?: string;
};

export type ChatSurfaceModel = {
  sessionKey: string;
  entries: ChatEntry[];
  streaming: string;
  activeRunId: string | null;
  sending: boolean;
  lastError: string | null;
  /** Current agent activity description (tool name, thinking, etc.). */
  activity: string | null;
  /** Latest reasoning/thinking text while streaming (separate from answer body). */
  streamingThinking: string | null;
  /**
   * Set when a live tool `result` includes a file artifact; UI opens the preview and clears this.
   * Not used for history-only loads.
   */
  pendingOpenFileArtifact: FileArtifact | null;
  /**
   * Files modified after this time are shown in the session file bar (workspace scan).
   * Set when the session is opened or on first send.
   */
  sessionActivityStartMs: number | null;
  /** Usage from the most recent completed run. */
  lastRunUsage: RunUsage | null;
};

export function createChatModel(initialSessionKey: string): ChatSurfaceModel {
  return {
    sessionKey: initialSessionKey.trim(),
    entries: [],
    streaming: "",
    activeRunId: null,
    sending: false,
    lastError: null,
    activity: null,
    streamingThinking: null,
    pendingOpenFileArtifact: null,
    sessionActivityStartMs: null,
    lastRunUsage: null,
  };
}

/** Unique previewable file artifacts from tool rows (latest content per path). */
export function collectSessionFileArtifacts(entries: readonly ChatEntry[]): FileArtifact[] {
  const byPath = new Map<string, FileArtifact>();
  for (const e of entries) {
    if (e.kind === "tool" && e.fileArtifact) {
      byPath.set(e.fileArtifact.path, e.fileArtifact);
    }
  }
  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function syncFileArtifactCache(model: ChatSurfaceModel, entry: ChatEntry): void {
  if (entry.kind === "tool" && entry.fileArtifact && entry.toolCallId) {
    rememberFileArtifact(model.sessionKey, entry.toolCallId, entry.fileArtifact);
  }
}

function rehydrateToolFileArtifacts(sessionKey: string, entries: ChatEntry[]): ChatEntry[] {
  return entries.map((e) => {
    if (e.kind !== "tool" || !e.toolCallId || e.fileArtifact) return e;
    const cached = recallFileArtifact(sessionKey, e.toolCallId);
    return cached
      ? { ...e, fileArtifact: fileArtifactWithToolCallId(cached, e.toolCallId) }
      : e;
  });
}

// ---------------------------------------------------------------------------
// Chat event handling
// ---------------------------------------------------------------------------

type ChatEventPayload = {
  runId?: string;
  sessionKey?: string;
  state?: string;
  message?: unknown;
  errorMessage?: string;
};

function parseChatPayload(payload: unknown): ChatEventPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload as ChatEventPayload;
}

/** Simple text extraction from message content blocks (PinchChat-style). */
function extractText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b): b is { type: string; text: string } =>
          b != null && typeof b === "object" && (b as Record<string, unknown>).type === "text" && typeof (b as Record<string, unknown>).text === "string",
      )
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

/** Simple thinking extraction from message content blocks (PinchChat-style). */
function extractThinking(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: string; thinking?: string; text?: string } =>
        b != null && typeof b === "object" && (b as Record<string, unknown>).type === "thinking",
    )
    .map((b) => b.thinking || b.text || "")
    .join("\n");
}

const SESSION_DIRECTIVE_RE =
  /^A new session was started via \/(?:new|reset)\b/;

function isSessionDirective(text: string): boolean {
  return SESSION_DIRECTIVE_RE.test(text.trim());
}

function matchesRun(model: ChatSurfaceModel, runId: string): boolean {
  if (!model.activeRunId) return false;
  return runId === model.activeRunId;
}

function adoptOrMatch(model: ChatSurfaceModel, runId: string): boolean {
  if (model.activeRunId) {
    return runId === model.activeRunId;
  }
  model.activeRunId = runId;
  return true;
}

function clipRunId(runId: string): string {
  if (!runId) return "";
  return runId.length <= 16 ? runId : `${runId.slice(0, 10)}…${runId.slice(-4)}`;
}

/** Merge reasoning chunks from streaming deltas (full snapshots vs incremental fragments). */
function mergeThinkingStream(prev: string | null, next: string): string {
  const p = prev ?? "";
  const n = next.trim();
  if (!n) return p;
  if (!p) return n;
  if (n.startsWith(p)) return n;
  if (p.startsWith(n)) return p;
  return `${p}${p && !p.endsWith("\n") ? "\n" : ""}${n}`;
}

function extractRunUsage(p: ChatEventPayload): RunUsage | null {
  const raw = p as Record<string, unknown>;
  const u =
    (raw.usage as Record<string, unknown> | undefined) ??
    ((raw.message as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined);
  if (!u || typeof u !== "object") return null;
  const inp =
    typeof u.inputTokens === "number" ? u.inputTokens :
    typeof u.input_tokens === "number" ? u.input_tokens :
    typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
  const out =
    typeof u.outputTokens === "number" ? u.outputTokens :
    typeof u.output_tokens === "number" ? u.output_tokens :
    typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
  if (inp === 0 && out === 0) return null;
  const cr =
    typeof u.cacheReadTokens === "number" ? u.cacheReadTokens :
    typeof u.cache_read_tokens === "number" ? u.cache_read_tokens :
    typeof u.cache_read_input_tokens === "number" ? u.cache_read_input_tokens : undefined;
  const cw =
    typeof u.cacheWriteTokens === "number" ? u.cacheWriteTokens :
    typeof u.cache_write_tokens === "number" ? u.cache_write_tokens :
    typeof u.cache_creation_input_tokens === "number" ? u.cache_creation_input_tokens : undefined;
  const model =
    typeof raw.model === "string" ? raw.model :
    typeof u.model === "string" ? u.model : undefined;
  return { inputTokens: inp, outputTokens: out, cacheReadTokens: cr, cacheWriteTokens: cw, model };
}

/**
 * Apply a `chat` gateway event to the model.
 * - `false` — ignored
 * - `true` — model changed; refresh UI immediately
 * - `"stream"` — only streaming buffers / activity changed; safe to coalesce refreshes (e.g. rAF)
 * - `"reload"` — reload history from gateway
 */
export function applyChatGatewayEvent(model: ChatSurfaceModel, payload: unknown): boolean | "reload" | "stream" {
  const p = parseChatPayload(payload);
  if (!p?.sessionKey || p.sessionKey !== model.sessionKey) {
    if (isChatDebugEnabled() && p?.sessionKey) {
      chatDebug("chat:skip (sessionKey mismatch)", {
        payloadSessionKey: p.sessionKey,
        modelSessionKey: model.sessionKey,
        state: p.state,
        runId: p.runId,
      });
    }
    return false;
  }

  const runId = typeof p.runId === "string" ? p.runId : "";
  const stateRaw = typeof p.state === "string" ? p.state : "";
  const state =
    stateRaw === "chunk" || stateRaw === "streaming" || stateRaw === "partial" ? "delta" : stateRaw;

  if (state === "started") {
    if (model.activeRunId && runId !== model.activeRunId) {
      return false;
    }
    if (!model.activeRunId) {
      model.activeRunId = runId;
    }
    model.streamingThinking = null;
    model.streaming = "";
    model.activity = "Generating…";
    chatDebug("chat:started", { runId: clipRunId(runId), ...chatModelSnapshot(model) });
    return true;
  }

  if (state === "delta") {
    if (!adoptOrMatch(model, runId)) return false;
    const text = extractText(p.message);
    const thinking = extractThinking(p.message);

    if (text) {
      model.streaming = text;
      model.activity = null;
    }
    if (thinking) {
      model.streamingThinking = mergeThinkingStream(model.streamingThinking, thinking);
      if (!text) {
        model.activity = "Thinking…";
      }
    }
    if (!text && !thinking) {
      const fallback = extractRawText(p.message);
      if (typeof fallback === "string" && fallback.length > 0) {
        model.streaming = fallback;
        model.activity = null;
      }
    }
    chatDebug("chat:delta", {
      stateRaw,
      runId: clipRunId(runId),
      textLen: text.length,
      thinkingLen: thinking.length,
      ...chatModelSnapshot(model),
    });
    return "stream";
  }

  if (state === "final") {
    if (!adoptOrMatch(model, runId)) return false;
    model.streaming = "";
    model.streamingThinking = null;
    model.activeRunId = null;
    model.sending = false;
    model.activity = null;
    model.lastRunUsage = extractRunUsage(p) ?? model.lastRunUsage;
    chatDebug("chat:final", {
      runId: clipRunId(runId),
      ...chatModelSnapshot(model),
    });
    return "reload";
  }

  if (state === "aborted") {
    if (!matchesRun(model, runId)) return false;
    model.streaming = "";
    model.streamingThinking = null;
    model.activeRunId = null;
    model.sending = false;
    model.activity = null;
    chatDebug("chat:aborted", { runId: clipRunId(runId), ...chatModelSnapshot(model) });
    return "reload";
  }

  if (state === "error") {
    if (model.activeRunId && runId !== model.activeRunId) {
      return false;
    }
    model.lastError = p.errorMessage ?? "chat error";
    model.streaming = "";
    model.streamingThinking = null;
    model.activeRunId = null;
    model.sending = false;
    model.activity = null;
    chatDebug("chat:error", {
      runId: clipRunId(runId),
      errorMessage: p.errorMessage ?? null,
      ...chatModelSnapshot(model),
    });
    return "reload";
  }

  if (isChatDebugEnabled() && stateRaw) {
    chatDebug("chat:unhandled-state", { stateRaw, normalized: state });
  }
  return false;
}

// ---------------------------------------------------------------------------
// Agent event handling (tool calls, thinking)
// ---------------------------------------------------------------------------

type AgentEventPayload = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function findToolRowIndex(model: ChatSurfaceModel, toolCallId: string | null, toolName: string | null): number {
  if (toolCallId) {
    const byId = model.entries.findIndex((e) => e.kind === "tool" && e.toolCallId === toolCallId);
    if (byId >= 0) return byId;
  }
  if (toolName) {
    for (let i = model.entries.length - 1; i >= 0; i--) {
      const e = model.entries[i];
      if (e.kind === "tool" && e.toolStatus === "running" && e.toolName === toolName) {
        return i;
      }
    }
  }
  return -1;
}

function patchToolEntry(model: ChatSurfaceModel, index: number, patch: Partial<ChatEntry>): void {
  const prev = model.entries[index];
  model.entries = [
    ...model.entries.slice(0, index),
    { ...prev, ...patch },
    ...model.entries.slice(index + 1),
  ];
}

/**
 * Apply an `agent` gateway event for tool activity.
 * Only handles `stream: "tool"` with `phase: "start" | "result"` (PinchChat-style).
 * Everything else (assistant stream, lifecycle, fallback) is ignored.
 */
export function applyAgentGatewayEvent(model: ChatSurfaceModel, payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as AgentEventPayload;

  const streamKind = str(p.stream);
  if (streamKind !== "tool") return false;

  const payloadSession = str(p.sessionKey) ?? str(p.session);
  if (payloadSession && payloadSession !== model.sessionKey) return false;

  const data = p.data;
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  const phase = str(d.phase);
  const toolCallId = str(d.toolCallId) ?? str(d.id) ?? str(d.tool_call_id);
  const name = str(d.name) ?? "tool";
  if (!toolCallId) return false;

  if (phase === "start") {
    const toolInput = serializeToolArgs(d.args ?? d.input);
    const detected = detectFileArtifact(name, toolInput) ?? undefined;
    const fileArtifact = fileArtifactWithToolCallId(detected, toolCallId);
    const idx = findToolRowIndex(model, toolCallId, name);
    if (idx >= 0) {
      // Streaming / repeated start: same toolCallId with growing args (e.g. file body).
      patchToolEntry(model, idx, { toolInput, fileArtifact });
      syncFileArtifactCache(model, model.entries[idx]!);
    } else {
      const entry: ChatEntry = {
        id: `tool:${toolCallId}`,
        role: "system",
        text: "",
        kind: "tool",
        toolName: name,
        toolCallId,
        toolInput,
        toolStatus: "running",
        fileArtifact,
      };
      model.entries = [...model.entries, entry];
      syncFileArtifactCache(model, entry);
    }
    model.activity = `Using ${name}`;
    return true;
  }

  if (phase === "result") {
    const rawResult = d.result;
    const resultStr = typeof rawResult === "string" ? rawResult : (rawResult != null ? JSON.stringify(rawResult, null, 2) : "");
    const errRaw = d.error ?? d.err;
    const errMsg = errRaw != null ? String(errRaw) : null;
    const displayResult = errMsg ?? resultStr;
    const idx = findToolRowIndex(model, toolCallId, name);

    if (idx >= 0) {
      const prevEntry = model.entries[idx];
      const preview =
        displayResult.length > 500 ? `${displayResult.slice(0, 500)}…` : displayResult || "—";
      const mergedArtifact = mergeFileArtifact(
        prevEntry.fileArtifact,
        name,
        prevEntry.toolInput,
        displayResult,
      );
      const fileArtifact = fileArtifactWithToolCallId(mergedArtifact, toolCallId);
      patchToolEntry(model, idx, {
        toolResult: displayResult || "—",
        toolStatus: errMsg ? "error" : "done",
        text: preview,
        fileArtifact,
      });
      const doneEntry = model.entries[idx];
      syncFileArtifactCache(model, doneEntry);
      if (!errMsg && doneEntry.fileArtifact) {
        model.pendingOpenFileArtifact = doneEntry.fileArtifact;
      }
    } else {
      const mergedLate = mergeFileArtifact(undefined, name, undefined, displayResult);
      const fileArtifact = fileArtifactWithToolCallId(mergedLate, toolCallId);
      const lateEntry: ChatEntry = {
        id: `tool:${toolCallId}:late`,
        role: "system",
        text: displayResult.slice(0, 200) + (displayResult.length > 200 ? "…" : "") || name,
        kind: "tool",
        toolName: name,
        toolCallId,
        toolResult: displayResult || undefined,
        toolStatus: errMsg ? "error" : "done",
        fileArtifact,
      };
      model.entries = [...model.entries, lateEntry];
      syncFileArtifactCache(model, lateEntry);
      if (!errMsg && lateEntry.fileArtifact) {
        model.pendingOpenFileArtifact = lateEntry.fileArtifact;
      }
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Session message events (cross-channel inbound messages)
// ---------------------------------------------------------------------------

export function applySessionMessageEvent(model: ChatSurfaceModel, payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;

  const sessionKey = str(p.sessionKey);
  if (!sessionKey || sessionKey !== model.sessionKey) return false;

  const message = p.message;
  if (!message || typeof message !== "object") return false;

  const role = messageRole(message);
  const text = extractRawText(message)?.trim() ?? "";
  if (!text) return false;

  const id = `sm:${role}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;

  if (role === "user") {
    if (isSessionDirective(text)) return false;
    const cleaned = stripEnvelope(text);
    const last = model.entries[model.entries.length - 1];
    if (last?.role === "user" && last.text === cleaned) return false;
    model.entries = [...model.entries, { id, role: "user", text: cleaned }];
    return true;
  }

  if (role === "assistant" && !model.activeRunId) {
    model.entries = [...model.entries, { id, role: "assistant", text }];
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// History loading (enriched with tool/thinking entries)
// ---------------------------------------------------------------------------

export async function chatLoadHistory(
  client: OpenClawMinimalClient,
  model: ChatSurfaceModel,
): Promise<void> {
  model.lastError = null;
  const key = model.sessionKey.trim();
  if (!key) {
    model.lastError = "Set a session key first.";
    return;
  }
  if (model.sessionActivityStartMs == null) {
    model.sessionActivityStartMs = Date.now();
  }
  const res = (await client.request("chat.history", {
    sessionKey: key,
    limit: 200,
  })) as { messages?: unknown[] };
  const messages = Array.isArray(res.messages) ? res.messages : [];
  const entries: ChatEntry[] = [];
  let idx = 0;

  for (const m of messages) {
    const role = messageRole(m);
    const blocks = extractContentBlocks(m);

    if (role === "user") {
      const raw = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (isSessionDirective(raw)) continue;
      const text = stripEnvelope(raw);
      entries.push({ id: `h:user:${idx++}`, role: "user", text: text || "[message]" });
    } else if (role === "assistant") {
      let i = 0;
      while (i < blocks.length) {
        const block = blocks[i];
        if (block.type === "thinking") {
          entries.push({ id: `h:think:${idx++}`, role: "assistant", text: block.text, kind: "thinking" });
          i += 1;
          continue;
        }
        // One bubble per `text` block so order matches the API: e.g. text → tool → text
        // renders as two assistant messages with the tool row between (Pinch-style interleaving).
        if (block.type === "text") {
          const t = (block as Extract<ContentBlock, { type: "text" }>).text.trim();
          if (t) {
            entries.push({ id: `h:asst:${idx++}`, role: "assistant", text: t });
          }
          i += 1;
          continue;
        }
        if (block.type === "tool_use") {
          let resultText = "";
          let j = i + 1;
          const useId = block.toolCallId;
          if (useId) {
            let k = i + 1;
            while (k < blocks.length) {
              const nb = blocks[k];
              if (nb.type === "tool_result") {
                const rid = nb.toolCallId;
                if (!rid || rid === useId) {
                  resultText = nb.text;
                  j = k + 1;
                  break;
                }
              }
              k += 1;
            }
          } else {
            const maybeResult = j < blocks.length ? blocks[j] : null;
            if (maybeResult?.type === "tool_result") {
              resultText = maybeResult.text;
              j += 1;
            }
          }
          const preview =
            resultText.length > 240 ? `${resultText.slice(0, 240)}…` : resultText;
          const fallbackText =
            preview ||
            (block.input ? `${block.toolName} — ${block.input.slice(0, 120)}` : block.toolName);
          const fileArtifact = fileArtifactWithToolCallId(
            mergeFileArtifact(undefined, block.toolName, block.input, resultText),
            block.toolCallId,
          );
          entries.push({
            id: `h:tool:${idx++}`,
            role: "system",
            text: fallbackText,
            kind: "tool",
            toolName: block.toolName,
            toolCallId: block.toolCallId,
            toolInput: block.input,
            toolResult: resultText || undefined,
            toolStatus: "done",
            fileArtifact,
          });
          i = j;
          continue;
        }
        if (block.type === "tool_result") {
          const preview = block.text.length > 200 ? `${block.text.slice(0, 200)}…` : block.text;
          const fileArtifact = fileArtifactWithToolCallId(
            mergeFileArtifact(undefined, block.toolName ?? "tool output", undefined, block.text),
            block.toolCallId,
          );
          entries.push({
            id: `h:toolres:${idx++}`,
            role: "system",
            text: preview,
            kind: "tool",
            toolName: block.toolName ?? "tool output",
            toolCallId: block.toolCallId,
            toolResult: block.text,
            toolStatus: "done",
            fileArtifact,
          });
          i += 1;
          continue;
        }
        i += 1;
      }
    } else if (role === "tool") {
      const raw = m as Record<string, unknown>;
      const toolCallId = typeof raw.tool_call_id === "string" ? raw.tool_call_id : undefined;
      const body = extractRawText(m)?.trim() ?? "";
      let patched = false;
      for (let k = entries.length - 1; k >= 0; k--) {
        const e = entries[k];
        if (e.kind !== "tool") continue;
        if (toolCallId && e.toolCallId && e.toolCallId === toolCallId) {
          const pvw = body.length > 240 ? `${body.slice(0, 240)}…` : body;
          const fileArtifact = fileArtifactWithToolCallId(
            mergeFileArtifact(e.fileArtifact, e.toolName ?? "tool", e.toolInput, body),
            e.toolCallId ?? toolCallId,
          );
          entries[k] = {
            ...e,
            toolResult: body,
            toolStatus: "done",
            text: pvw || e.text,
            fileArtifact,
          };
          patched = true;
          break;
        }
      }
      if (!patched && toolCallId) {
        for (let k = entries.length - 1; k >= 0; k--) {
          const e = entries[k];
          if (e.kind === "tool" && !(e.toolResult && e.toolResult.trim())) {
            const pvw = body.length > 240 ? `${body.slice(0, 240)}…` : body;
            const fileArtifact = fileArtifactWithToolCallId(
              mergeFileArtifact(e.fileArtifact, e.toolName ?? "tool", e.toolInput, body),
              e.toolCallId ?? toolCallId,
            );
            entries[k] = {
              ...e,
              toolCallId: e.toolCallId ?? toolCallId,
              toolResult: body,
              toolStatus: "done",
              text: pvw || e.text,
              fileArtifact,
            };
            patched = true;
            break;
          }
        }
      }
      if (!patched) {
        const pvw = body.length > 200 ? `${body.slice(0, 200)}…` : body;
        const fileArtifact = fileArtifactWithToolCallId(
          mergeFileArtifact(undefined, "tool output", undefined, body),
          toolCallId,
        );
        entries.push({
          id: `h:toolmsg:${idx++}`,
          role: "system",
          text: pvw,
          kind: "tool",
          toolName: "tool output",
          toolCallId,
          toolResult: body || undefined,
          toolStatus: "done",
          fileArtifact,
        });
      }
    }
  }

  const rehydrated = rehydrateToolFileArtifacts(key, entries);
  for (const e of rehydrated) {
    syncFileArtifactCache(model, e);
  }

  const toolRows = rehydrated.filter((e) => e.kind === "tool");
  filePreviewDebug("chat.history:loaded", {
    entryCount: rehydrated.length,
    toolRowCount: toolRows.length,
    toolRowsWithFileArtifact: toolRows.filter((e) => e.fileArtifact).length,
  });

  model.entries = rehydrated;
  model.streaming = "";
  model.streamingThinking = null;
  model.activity = null;
  model.activeRunId = null;
  model.sending = false;
}

// ---------------------------------------------------------------------------
// Send / abort
// ---------------------------------------------------------------------------

export async function chatSend(
  client: OpenClawMinimalClient,
  model: ChatSurfaceModel,
  message: string,
): Promise<void> {
  const key = model.sessionKey.trim();
  const msg = message.trim();
  if (!key || !msg) {
    model.lastError = !key ? "Set a session key." : "Enter a message.";
    return;
  }
  if (model.sessionActivityStartMs == null) {
    model.sessionActivityStartMs = Date.now();
  }
  model.lastError = null;
  const runId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const queued = Boolean(model.activeRunId);
  const newEntries: ChatEntry[] = [{ id: `u:${runId}`, role: "user", text: msg }];
  if (queued) {
    newEntries.push({
      id: `sys:queued:${runId}`,
      role: "system",
      text: "Queued — waiting for current run",
      kind: "status",
    });
  }

  model.entries = [...model.entries, ...newEntries];
  model.sending = true;
  if (!queued) {
    model.activeRunId = runId;
  }
  model.streaming = "";
  model.streamingThinking = null;

  try {
    const ack = (await client.request("chat.send", {
      sessionKey: key,
      message: msg,
      deliver: false,
      idempotencyKey: runId,
    })) as { runId?: string; status?: string };
    if (typeof ack.runId === "string" && ack.runId.length > 0) {
      model.activeRunId = ack.runId;
    }
    if (queued) {
      model.sending = false;
    }
  } catch (e) {
    model.sending = false;
    model.activeRunId = queued ? model.activeRunId : null;
    model.streaming = "";
    model.streamingThinking = null;
    model.lastError = e instanceof Error ? e.message : String(e);
    model.entries = [
      ...model.entries,
      { id: `sys:sendfail:${runId}`, role: "system", text: `Send failed: ${model.lastError}` },
    ];
  }
}

export async function chatAbort(client: OpenClawMinimalClient, model: ChatSurfaceModel): Promise<void> {
  const key = model.sessionKey.trim();
  if (!key) {
    return;
  }
  try {
    if (model.activeRunId) {
      await client.request("chat.abort", { sessionKey: key, runId: model.activeRunId });
    } else {
      await client.request("chat.abort", { sessionKey: key });
    }
  } catch (e) {
    model.lastError = e instanceof Error ? e.message : String(e);
  }
}

// ---------------------------------------------------------------------------
// Session listing
// ---------------------------------------------------------------------------

export type SessionInfo = {
  key: string;
  label: string;
  kind: "main" | "group" | "cron" | "hook" | "chat" | "task" | "unknown";
  channel: string | null;
  updatedAt: number | null;
  contextTokens: number | null;
};

function inferSessionKind(key: string): SessionInfo["kind"] {
  if (key.includes(":cron:") || key.startsWith("cron:")) return "cron";
  if (key.includes(":hook:") || key.startsWith("hook:")) return "hook";
  if (key.includes(":group:")) return "group";
  if (key.includes(":chat-")) return "chat";
  if (key.includes(":task-") || key.includes(":task:")) return "task";
  if (key.endsWith(":main")) return "main";
  return "unknown";
}

function inferChannel(key: string): string | null {
  const parts = key.split(":");
  const providers = ["telegram", "discord", "slack", "whatsapp", "matrix", "irc"];
  for (const p of parts) {
    if (providers.includes(p)) return p;
  }
  return null;
}

function buildLabel(key: string, raw: Record<string, unknown>): string {
  if (typeof raw.displayName === "string" && raw.displayName) return raw.displayName;
  if (typeof raw.subject === "string" && raw.subject) return raw.subject;

  const parts = key.split(":");
  if (parts.length <= 2) return key;
  const tail = parts.slice(2).join(":");

  if (tail === "main") return "Main";
  if (tail.startsWith("chat-")) return `Chat ${tail.slice(5, 11)}`;
  if (tail.startsWith("task-")) return `Task ${tail.slice(5, 11)}`;

  const channel = inferChannel(key);
  if (channel) {
    const afterChannel = parts.slice(parts.indexOf(channel) + 1).join(":");
    const shortId = afterChannel.length > 12 ? `…${afterChannel.slice(-8)}` : afterChannel;
    return `${channel[0].toUpperCase()}${channel.slice(1)} ${shortId}`;
  }

  return tail.length > 24 ? `…${tail.slice(-20)}` : tail;
}

export function parseSessionList(res: unknown): SessionInfo[] {
  if (!res || typeof res !== "object") return [];
  const r = res as Record<string, unknown>;
  const sessions = r.sessions ?? r.items ?? r.list;
  if (!Array.isArray(sessions)) return [];

  const infos: SessionInfo[] = [];
  for (const s of sessions) {
    if (!s || typeof s !== "object") continue;
    const raw = s as Record<string, unknown>;
    const key = typeof raw.key === "string" ? raw.key : null;
    if (!key) continue;

    infos.push({
      key,
      label: buildLabel(key, raw),
      kind: inferSessionKind(key),
      channel: inferChannel(key),
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : null,
      contextTokens: typeof raw.contextTokens === "number" ? raw.contextTokens : null,
    });
  }

  infos.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return infos;
}

export function pickSessionKeysFromList(res: unknown): string[] {
  return parseSessionList(res).map((s) => s.key);
}

export async function chatLoadSessions(client: OpenClawMinimalClient): Promise<SessionInfo[]> {
  const res = await client.request("sessions.list", {
    includeGlobal: true,
    includeUnknown: true,
  });
  return parseSessionList(res);
}
