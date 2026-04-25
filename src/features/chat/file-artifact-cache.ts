import type { FileArtifact } from "@/features/chat/file-artifact";

/**
 * In-memory cache so file previews survive `chat.history` reloads when the API omits full tool args.
 *
 * Bounded LRU: long sessions with many tool calls would otherwise grow this map without limit.
 * `Map` preserves insertion order, so we evict the oldest entry when over capacity and re-insert
 * on read to refresh recency.
 */
const MAX_ENTRIES = 256;
const store = new Map<string, FileArtifact>();

function cacheKey(sessionKey: string, toolCallId: string): string {
  return `${sessionKey.trim()}:${toolCallId}`;
}

function touch(key: string, artifact: FileArtifact): void {
  if (store.has(key)) store.delete(key);
  store.set(key, artifact);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export function rememberFileArtifact(
  sessionKey: string,
  toolCallId: string | null | undefined,
  artifact: FileArtifact | undefined,
): void {
  if (!toolCallId?.trim() || !artifact) return;
  touch(cacheKey(sessionKey, toolCallId), artifact);
}

export function recallFileArtifact(
  sessionKey: string,
  toolCallId: string | null | undefined,
): FileArtifact | undefined {
  if (!toolCallId?.trim()) return undefined;
  const key = cacheKey(sessionKey, toolCallId);
  const found = store.get(key);
  if (found) touch(key, found);
  return found;
}

export function clearFileArtifactCache(): void {
  store.clear();
}
