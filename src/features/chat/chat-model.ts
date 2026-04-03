import { extractRawText, messageRole } from "@/features/chat/message-text";
import type { OpenClawMinimalClient } from "@/lib/openclaw";

export type ChatEntry = {
  role: "user" | "assistant" | "system";
  text: string;
};

export type ChatSurfaceModel = {
  sessionKey: string;
  entries: ChatEntry[];
  streaming: string;
  activeRunId: string | null;
  sending: boolean;
  lastError: string | null;
};

export function createChatModel(initialSessionKey: string): ChatSurfaceModel {
  return {
    sessionKey: initialSessionKey.trim(),
    entries: [],
    streaming: "",
    activeRunId: null,
    sending: false,
    lastError: null,
  };
}

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

function assistantFromFinalMessage(message: unknown, fallbackStream: string): string {
  const fromMsg = extractRawText(message);
  if (fromMsg?.trim()) {
    return fromMsg;
  }
  return fallbackStream.trim();
}

/** Apply a `chat` gateway event to the model; returns whether UI should refresh. */
export function applyChatGatewayEvent(model: ChatSurfaceModel, payload: unknown): boolean {
  const p = parseChatPayload(payload);
  if (!p?.sessionKey || p.sessionKey !== model.sessionKey) {
    return false;
  }

  const runId = typeof p.runId === "string" ? p.runId : "";
  const state = p.state;

  if (state === "delta") {
    if (!model.activeRunId || runId !== model.activeRunId) {
      return false;
    }
    const next = extractRawText(p.message);
    if (typeof next === "string") {
      model.streaming = next;
    }
    return true;
  }

  if (state === "final") {
    if (!model.activeRunId || runId !== model.activeRunId) {
      return false;
    }
    const text = assistantFromFinalMessage(p.message, model.streaming);
    if (text) {
      model.entries = [...model.entries, { role: "assistant", text }];
    }
    model.streaming = "";
    model.activeRunId = null;
    model.sending = false;
    return true;
  }

  if (state === "aborted") {
    if (!model.activeRunId || runId !== model.activeRunId) {
      return false;
    }
    const text = assistantFromFinalMessage(p.message, model.streaming);
    if (text) {
      model.entries = [...model.entries, { role: "assistant", text: `${text}\n[aborted]` }];
    } else {
      model.entries = [...model.entries, { role: "system", text: "[aborted]" }];
    }
    model.streaming = "";
    model.activeRunId = null;
    model.sending = false;
    return true;
  }

  if (state === "error") {
    if (model.activeRunId && runId !== model.activeRunId) {
      return false;
    }
    model.lastError = p.errorMessage ?? "chat error";
    model.streaming = "";
    model.activeRunId = null;
    model.sending = false;
    return true;
  }

  return false;
}

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
  const res = (await client.request("chat.history", {
    sessionKey: key,
    limit: 200,
  })) as { messages?: unknown[] };
  const messages = Array.isArray(res.messages) ? res.messages : [];
  const entries: ChatEntry[] = [];
  for (const m of messages) {
    const role = messageRole(m);
    const text = extractRawText(m)?.trim() ?? "";
    if (role === "user") {
      entries.push({ role: "user", text: text || "[message]" });
    } else if (role === "assistant") {
      if (text) {
        entries.push({ role: "assistant", text });
      }
    }
  }
  model.entries = entries;
  model.streaming = "";
}

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
  model.lastError = null;
  const runId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  model.entries = [...model.entries, { role: "user", text: msg }];
  model.sending = true;
  model.activeRunId = runId;
  model.streaming = "";

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
  } catch (e) {
    model.sending = false;
    model.activeRunId = null;
    model.streaming = "";
    model.lastError = e instanceof Error ? e.message : String(e);
    model.entries = [
      ...model.entries,
      { role: "system", text: `Send failed: ${model.lastError}` },
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

export function pickSessionKeysFromList(res: unknown): string[] {
  if (!res || typeof res !== "object") {
    return [];
  }
  const r = res as Record<string, unknown>;
  const sessions = r.sessions ?? r.items ?? r.list;
  if (!Array.isArray(sessions)) {
    return [];
  }
  const keys: string[] = [];
  for (const s of sessions) {
    if (s && typeof s === "object" && typeof (s as { key?: string }).key === "string") {
      keys.push((s as { key: string }).key);
    }
  }
  return keys;
}

export async function chatLoadSessions(client: OpenClawMinimalClient): Promise<string[]> {
  const res = await client.request("sessions.list", {
    includeGlobal: true,
    includeUnknown: true,
  });
  return pickSessionKeysFromList(res);
}
