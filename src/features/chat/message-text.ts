export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; toolName: string; input: string; toolCallId?: string }
  | { type: "tool_result"; toolName: string | null; text: string; toolCallId?: string }
  | { type: "thinking"; text: string };

function serializeBlockArgs(value: unknown): string {
  if (value == null) return "";
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** OpenAI / gateway tool call id on a content part or message.tool_calls item. */
function readToolCallId(p: Record<string, unknown>): string | undefined {
  const id =
    (typeof p.id === "string" && p.id) ||
    (typeof p.call_id === "string" && p.call_id) ||
    (typeof p.tool_call_id === "string" && p.tool_call_id) ||
    (typeof p.tool_use_id === "string" && p.tool_use_id);
  return id || undefined;
}

/** Append OpenAI-style `message.tool_calls` to block list (may coexist with string/array content). */
function appendMessageToolCalls(m: Record<string, unknown>, blocks: ContentBlock[]): void {
  const toolCalls = m.tool_calls;
  if (!Array.isArray(toolCalls)) return;
  const seenIds = new Set(
    blocks
      .filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use")
      .map((b) => b.toolCallId)
      .filter((id): id is string => Boolean(id)),
  );
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== "object") continue;
    const t = tc as Record<string, unknown>;
    const fn = t.function as Record<string, unknown> | undefined;
    const name =
      (fn && typeof fn.name === "string" && fn.name) ||
      (typeof t.name === "string" && t.name) ||
      "tool";
    const args = fn?.arguments ?? t.arguments;
    const input = serializeBlockArgs(args);
    const toolCallId = readToolCallId(t);
    if (toolCallId && seenIds.has(toolCallId)) continue;
    if (toolCallId) seenIds.add(toolCallId);
    blocks.push({ type: "tool_use", toolName: name, input, toolCallId });
  }
}

/** Map a single content-array part to tool_use when applicable. */
function contentPartToToolUse(p: Record<string, unknown>): Extract<ContentBlock, { type: "tool_use" }> | null {
  const typ = typeof p.type === "string" ? p.type : "";

  if (typ === "tool_use") {
    const name = typeof p.name === "string" ? p.name : "tool";
    let input = "";
    if (p.input != null) {
      input = serializeBlockArgs(p.input);
    }
    return { type: "tool_use", toolName: name, input, toolCallId: readToolCallId(p) };
  }

  if (typ === "function_call" || typ === "function") {
    const fn = (p.function as Record<string, unknown> | undefined) ?? {};
    const name =
      (typeof fn.name === "string" && fn.name) ||
      (typeof p.name === "string" && p.name) ||
      "tool";
    const args = p.arguments ?? fn.arguments ?? p.args ?? fn.args ?? p.input;
    const input = serializeBlockArgs(args);
    return { type: "tool_use", toolName: name, input, toolCallId: readToolCallId(p) };
  }

  return null;
}

/** Best-effort text extraction from gateway chat message shapes (OpenClaw-style). */
export function extractRawText(message: unknown): string | null {
  if (message == null) {
    return null;
  }
  if (typeof message === "string") {
    return message;
  }
  if (typeof message !== "object") {
    return null;
  }
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        if (!p || typeof p !== "object") {
          return null;
        }
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        if (item.type === "image") {
          return "[image]";
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  if (typeof m.text === "string") {
    return m.text;
  }
  return null;
}

/** Extract all typed content blocks from a message for rich rendering. */
export function extractContentBlocks(message: unknown): ContentBlock[] {
  if (!message || typeof message !== "object") return [];
  const m = message as Record<string, unknown>;
  const content = m.content;

  if (typeof content === "string") {
    const blocks: ContentBlock[] = [];
    if (content.trim()) blocks.push({ type: "text", text: content });
    appendMessageToolCalls(m, blocks);
    return blocks;
  }

  if (!Array.isArray(content)) {
    const blocks: ContentBlock[] = [];
    if (typeof m.text === "string" && m.text.trim()) {
      blocks.push({ type: "text", text: m.text });
    }
    appendMessageToolCalls(m, blocks);
    return blocks;
  }

  const blocks: ContentBlock[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const p = part as Record<string, unknown>;

    if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
      blocks.push({ type: "text", text: p.text });
      continue;
    }

    const asTool = contentPartToToolUse(p);
    if (asTool) {
      blocks.push(asTool);
      continue;
    }

    if (p.type === "tool_result") {
      let resultContent = "";
      const c = p.content;
      if (typeof c === "string") {
        resultContent = c;
      } else if (c != null) {
        try {
          resultContent = JSON.stringify(c, null, 2);
        } catch {
          resultContent = String(c);
        }
      }
      const tn = typeof p.name === "string" ? p.name : null;
      const toolCallId =
        (typeof p.tool_use_id === "string" && p.tool_use_id) ||
        (typeof p.tool_call_id === "string" && p.tool_call_id) ||
        undefined;
      blocks.push({ type: "tool_result", toolName: tn, text: resultContent, toolCallId });
      continue;
    }

    if (p.type === "thinking") {
      const th =
        typeof p.thinking === "string"
          ? p.thinking
          : typeof p.text === "string"
            ? p.text
            : "";
      if (th.trim()) blocks.push({ type: "thinking", text: th });
      continue;
    }

    if (p.type === "redacted_thinking") {
      const th =
        typeof p.data === "string"
          ? p.data
          : typeof p.text === "string"
            ? p.text
            : typeof p.thinking === "string"
              ? p.thinking
              : "";
      if (th.trim()) blocks.push({ type: "thinking", text: th });
      continue;
    }

    if (p.type === "reasoning" || p.type === "reasoning_content") {
      const th =
        typeof p.text === "string"
          ? p.text
          : typeof p.reasoning === "string"
            ? p.reasoning
            : typeof p.content === "string"
              ? p.content
              : "";
      if (th.trim()) blocks.push({ type: "thinking", text: th });
      continue;
    }

    if (p.type === "image") {
      blocks.push({ type: "text", text: "[image]" });
    }
  }

  appendMessageToolCalls(m, blocks);
  return blocks;
}

/**
 * Strip the gateway's sender-metadata envelope from user message bodies.
 * Format: "Sender (untrusted metadata):\n```json\n{...}\n```\n[timestamp] actual text"
 * Also handles bare timestamp prefix: "[Sat 2026-04-04 15:42 UTC] text"
 */
export function stripEnvelope(text: string): string {
  let s = text;

  const envelopeRe = /^Sender\s*\(untrusted metadata\)\s*:\s*```[\s\S]*?```\s*/i;
  s = s.replace(envelopeRe, "");

  const convInfoRe =
    /^Conversation\s+info\s*\(untrusted metadata\)\s*:\s*```[\s\S]*?```\s*/i;
  s = s.replace(convInfoRe, "");

  const tsRe = /^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+\w+\]\s*/;
  s = s.replace(tsRe, "");

  return s.trim() || text.trim();
}

/**
 * Thinking embedded in plain-text streams (OpenClaw strips these for visible `extractText()`;
 * we peel them into the live thinking panel instead).
 */
const THINK_TAG_PATTERNS = [
  /<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi,
  /<\s*redacted_thinking\s*>([\s\S]*?)<\s*\/\s*redacted_thinking\s*>/gi,
];

export function extractTaggedThinking(text: string): string | null {
  const chunks: string[] = [];
  for (const re of THINK_TAG_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const inner = (m[1] ?? "").trim();
      if (inner) chunks.push(inner);
    }
  }
  if (chunks.length === 0) return null;
  return chunks.join("\n\n");
}

export function stripTaggedThinking(text: string): string {
  let s = text;
  for (const re of THINK_TAG_PATTERNS) {
    s = s.replace(re, "");
  }
  return s;
}

/** Unwrap nested gateway shapes: stringified JSON, `{ delta, message }` shells. */
export function unwrapGatewayChatMessage(message: unknown): unknown {
  if (message == null) return message;
  if (typeof message === "string") {
    const t = message.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return unwrapGatewayChatMessage(JSON.parse(t) as unknown);
      } catch {
        return message;
      }
    }
    return message;
  }
  if (typeof message !== "object") return message;
  const o = message as Record<string, unknown>;
  if (o.delta != null && typeof o.delta === "object") {
    return unwrapGatewayChatMessage(o.delta);
  }
  if (o.message != null && typeof o.message === "object") {
    return unwrapGatewayChatMessage(o.message);
  }
  return message;
}

const EVENT_REASON_KEYS = [
  "reasoning",
  "thinking",
  "reasoning_content",
  "reasoningContent",
  "thinkingText",
  "thinking_text",
] as const;

/** Shallow recursive scan of a chat event payload for reasoning strings (delta wrapper shapes). */
export function extractReasoningFromEventPayload(root: unknown): string | null {
  const found: string[] = [];
  function walk(v: unknown, depth: number) {
    if (v == null || depth > 5) return;
    if (typeof v === "string") return;
    if (typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    for (const k of EVENT_REASON_KEYS) {
      const val = o[k];
      if (typeof val === "string" && val.trim().length > 8) {
        found.push(val.trim());
      }
    }
    for (const val of Object.values(o)) {
      if (Array.isArray(val)) {
        for (const x of val) walk(x, depth + 1);
      } else if (val && typeof val === "object") {
        walk(val, depth + 1);
      }
    }
  }
  walk(root, 0);
  if (found.length === 0) return null;
  return found.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Reasoning / thinking on the message object (not always inside `content[]`). */
export function readTopLevelReasoning(m: Record<string, unknown>): string | null {
  const tryString = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const direct =
    tryString(m.reasoning) ??
    tryString(m.thinking) ??
    tryString(m.reasoning_content) ??
    tryString(m.reasoningContent) ??
    tryString(m.reasoningText) ??
    tryString(m.internal_monologue);
  if (direct) return direct;
  const nested = m.reasoning;
  if (nested && typeof nested === "object") {
    const r = nested as Record<string, unknown>;
    const t =
      tryString(r.text) ?? tryString(r.content) ?? tryString(r.summary) ?? tryString(r.value);
    if (t) return t;
  }
  return null;
}

/** Split assistant message content for streaming UI: visible text vs thinking vs tool activity. */
export function extractAssistantDeltaParts(message: unknown): {
  visibleText: string;
  thinkingText: string | null;
  toolActivity: string | null;
} {
  if (message == null) {
    return { visibleText: "", thinkingText: null, toolActivity: null };
  }
  if (typeof message === "string") {
    const t = message.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return extractAssistantDeltaParts(JSON.parse(t) as unknown);
      } catch {
        /* fall through */
      }
    }
    const tagged = extractTaggedThinking(message);
    const visible = stripTaggedThinking(message);
    return { visibleText: visible, thinkingText: tagged, toolActivity: null };
  }
  if (typeof message !== "object") {
    return { visibleText: "", thinkingText: null, toolActivity: null };
  }
  const m = message as Record<string, unknown>;
  const content = m.content;

  if (typeof content === "string") {
    const tl = readTopLevelReasoning(m);
    const tagged = extractTaggedThinking(content);
    const visible = stripTaggedThinking(content);
    const thinkingMerged =
      [tl, tagged].filter((x): x is string => Boolean(x && x.trim())).join("\n\n") || null;
    return { visibleText: visible, thinkingText: thinkingMerged, toolActivity: null };
  }
  if (!Array.isArray(content)) {
    const t = typeof m.text === "string" ? m.text : "";
    const tl = readTopLevelReasoning(m);
    const tagged = extractTaggedThinking(t);
    const visible = stripTaggedThinking(t);
    const thinkingMerged =
      [tl, tagged].filter((x): x is string => Boolean(x && x.trim())).join("\n\n") || null;
    return { visibleText: visible, thinkingText: thinkingMerged, toolActivity: null };
  }

  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  let toolActivity: string | null = null;

  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const p = part as Record<string, unknown>;
    const typ = typeof p.type === "string" ? p.type : "";

    if (typ === "text" && typeof p.text === "string") {
      textParts.push(p.text);
    } else if (typ === "thinking") {
      const th =
        typeof p.thinking === "string"
          ? p.thinking
          : typeof p.text === "string"
            ? p.text
            : "";
      if (th) thinkingParts.push(th);
    } else if (typ === "redacted_thinking") {
      const th =
        typeof p.data === "string"
          ? p.data
          : typeof p.text === "string"
            ? p.text
            : typeof p.thinking === "string"
              ? p.thinking
              : "";
      if (th) thinkingParts.push(th);
    } else if (typ === "reasoning" || typ === "reasoning_content") {
      const th =
        typeof p.text === "string"
          ? p.text
          : typeof p.reasoning === "string"
            ? p.reasoning
            : typeof p.content === "string"
              ? p.content
              : "";
      if (th) thinkingParts.push(th);
    } else if (typ === "tool_use" || typ === "function_call" || typ === "function") {
      const fn = p.function as Record<string, unknown> | undefined;
      const name =
        typeof p.name === "string"
          ? p.name
          : fn && typeof fn.name === "string"
            ? fn.name
            : typeof p.toolName === "string"
              ? p.toolName
              : "tool";
      toolActivity = `Using ${name}`;
    }
  }

  const joinedVisible = textParts.join("");
  const tagExtra = extractTaggedThinking(joinedVisible);
  const visibleStripped = stripTaggedThinking(joinedVisible);

  const fromBlocks = thinkingParts.length > 0 ? thinkingParts.join("\n") : null;
  const top = readTopLevelReasoning(m);
  const thinkingPieces = [fromBlocks, top, tagExtra].filter(
    (x): x is string => Boolean(x && x.trim()),
  );
  const thinkingJoined = thinkingPieces.length > 0 ? thinkingPieces.join("\n\n") : null;

  return {
    visibleText: visibleStripped,
    thinkingText: thinkingJoined,
    toolActivity,
  };
}

export function messageRole(message: unknown): string {
  if (message && typeof message === "object" && typeof (message as { role?: string }).role === "string") {
    return (message as { role: string }).role.toLowerCase();
  }
  return "";
}
