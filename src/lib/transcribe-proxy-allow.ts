/**
 * Basic guardrails for the server-side Transcribe list proxy (SSRF).
 * Extend the blocklist if your deployment needs stricter rules.
 */
const BLOCKED_HOSTNAMES = new Set(
  ["169.254.169.254", "metadata.google.internal", "metadata.goog"].map((h) => h.toLowerCase()),
);

export class TranscribeProxyTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscribeProxyTargetError";
  }
}

export function assertTranscribeProxyTargetAllowed(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TranscribeProxyTargetError("Only http and https URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (!host) {
    throw new TranscribeProxyTargetError("Missing hostname.");
  }
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new TranscribeProxyTargetError("That host is not allowed.");
  }
}
