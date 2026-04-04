export type NormalizeGatewayWsResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Strip invisible chars often pasted from docs / chat apps. */
function stripInvisible(s: string): string {
  return s.replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/**
 * Normalize user input into a URL WebKit/Safari accepts for `new WebSocket(url)`.
 * Accepts https:// → wss://, http:// → ws://, and host:port without a scheme (defaults to wss://).
 */
export function normalizeGatewayWebSocketUrl(raw: string): NormalizeGatewayWsResult {
  let s = stripInvisible(raw).trim();
  if (!s) {
    return { ok: false, error: "Enter a WebSocket URL (ws:// or wss://)." };
  }

  const lower = s.toLowerCase();
  if (lower.startsWith("http://")) {
    s = `ws://${s.slice(7)}`;
  } else if (lower.startsWith("https://")) {
    s = `wss://${s.slice(8)}`;
  } else if (!/^wss?:\/\//i.test(s)) {
    s = `wss://${s.replace(/^\/+/, "")}`;
  }

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return {
      ok: false,
      error:
        "Invalid URL. Example: wss://gateway.example.com:18789 (https:// is converted to wss://).",
    };
  }

  if (u.protocol !== "ws:" && u.protocol !== "wss:") {
    return { ok: false, error: "URL must use ws:// or wss://." };
  }

  return { ok: true, url: u.href };
}
