/**
 * Detect file-like tool payloads (path + text body) for preview in the chat side panel.
 * Tool shapes are untyped; we parse JSON and common field names heuristically.
 */

import { filePreviewDebug } from "@/features/chat/chat-debug";

function clip(s: string | undefined, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(+${s.length - max} chars)`;
}

export type FileArtifact = {
  path: string;
  filename: string;
  content: string;
  /** Lowercase extension without dot, e.g. "md", "ts". */
  ext: string;
  /** When set, the file preview can follow this tool row as content updates. */
  toolCallId?: string;
};

/** Attach stable tool correlation for live preview updates. */
export function fileArtifactWithToolCallId(
  artifact: FileArtifact | undefined,
  toolCallId: string | null | undefined,
): FileArtifact | undefined {
  if (!artifact) return undefined;
  const id = toolCallId?.trim();
  if (!id) return artifact;
  return { ...artifact, toolCallId: id };
}

/**
 * Extensions we render in the file preview panel.
 * Single source of truth — imported by `session-files-bar.tsx`.
 */
export const PREVIEW_EXT: ReadonlySet<string> = new Set([
  "md",
  "txt",
  "json",
  "yaml",
  "yml",
  "csv",
  "xml",
  "html",
  "css",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "sh",
  "sql",
  "toml",
  "env",
  "log",
]);

export function isPreviewableExt(ext: string): boolean {
  return PREVIEW_EXT.has(ext.trim().toLowerCase());
}

const PATH_KEYS = [
  "path",
  "file_path",
  "filePath",
  "targetPath",
  "filepath",
  "target",
  "filename",
  "file",
  "uri",
  /** Common in agent tool schemas */
  "target_file",
  "targetFile",
  "to",
  "destination",
  "relative_path",
  "relPath",
] as const;

const CONTENT_KEYS = [
  "content",
  "contents",
  "text",
  "body",
  "new_string",
  "newString",
  "source",
  "data",
  "code",
  "message",
  "markdown",
] as const;

/**
 * Parse a JSON string into records we can scan for path/content.
 * Returns `[]` when the input is not a JSON object/array.
 * When the root is an array of objects (common for batched tool results),
 * each object is returned as a candidate record.
 */
function parseJsonRecords(s: string | undefined): Record<string, unknown>[] {
  if (!s?.trim()) return [];
  const t = s.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return [];
  try {
    const v = JSON.parse(t) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return [v as Record<string, unknown>];
    }
    if (Array.isArray(v)) {
      return v.filter(
        (item): item is Record<string, unknown> =>
          item != null && typeof item === "object" && !Array.isArray(item),
      );
    }
    return [];
  } catch {
    return [];
  }
}


export function basenameFromPath(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts.length > 0 ? (parts[parts.length - 1] ?? p) : p;
}

export function extFromPath(path: string): string {
  const base = basenameFromPath(path);
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Bare filename with extension, e.g. `foo.md` (no slash). */
function looksLikeFilePath(t: string): boolean {
  if (t.includes("/") || t.includes("\\")) return true;
  if (t.includes(".")) return true;
  return /\.[a-zA-Z0-9]{1,12}$/.test(t.trim());
}

function readPath(obj: Record<string, unknown>): string | null {
  for (const k of PATH_KEYS) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) {
      const t = v.trim();
      if (looksLikeFilePath(t)) {
        return t;
      }
    }
  }
  return null;
}

function readContent(obj: Record<string, unknown>): string | null {
  for (const k of CONTENT_KEYS) {
    const v = obj[k];
    if (typeof v === "string") return v;
  }
  return null;
}

function shallowMerge(a: Record<string, unknown> | null, b: Record<string, unknown> | null): Record<string, unknown> {
  return { ...(a ?? {}), ...(b ?? {}) };
}

/** Include root + one level of nested plain objects (e.g. `args.file: { path, content }`). */
function flattenSearchObjects(root: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [root];
  for (const v of Object.values(root)) {
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      out.push(v as Record<string, unknown>);
    }
  }
  return out;
}

function findPathAndContentInRecords(records: Record<string, unknown>[]): {
  path: string | null;
  content: string | null;
} {
  let path: string | null = null;
  let content: string | null = null;
  for (const o of records) {
    if (!path) path = readPath(o);
    if (!content) content = readContent(o);
    if (path && content) break;
  }
  return { path, content };
}

/** True if `s` looks like prose/source rather than a short status JSON line. */
function looksLikeFileBody(s: string): boolean {
  const t = s.trim();
  if (t.length < 4) return false;
  if (t.length > 400) return true;
  if (t.includes("\n")) return true;
  const lower = t.toLowerCase();
  if (
    lower === "ok" ||
    lower === "success" ||
    lower === "done" ||
    lower.startsWith("wrote ") ||
    lower.startsWith("saved ") ||
    /^error\b/i.test(t)
  ) {
    return false;
  }
  return true;
}

/**
 * Best-effort: extract path + content from tool input/result for previewable files.
 */
export function detectFileArtifact(
  toolName: string,
  toolInput?: string,
  toolResult?: string,
): FileArtifact | null {
  const nameLower = toolName.toLowerCase();
  const hintsFile =
    /write|save|edit|create|patch|apply|str_replace|search_replace|replace|append|touch|mkdir/.test(
      nameLower,
    );

  const inputRecords = parseJsonRecords(toolInput);
  const resultRecords = parseJsonRecords(toolResult);
  const inputObj = inputRecords[0] ?? null;
  const resultObj = resultRecords[0] ?? null;
  const merged = shallowMerge(inputObj, resultObj);

  filePreviewDebug("detect:start", {
    toolName,
    toolInputLen: toolInput?.length ?? 0,
    toolResultLen: toolResult?.length ?? 0,
    inputParsedAsJson: Boolean(inputObj),
    inputIsArray: inputRecords.length > 1,
    resultParsedAsJson: Boolean(resultObj),
    resultIsArray: resultRecords.length > 1,
    mergedTopKeys: Object.keys(merged).slice(0, 24),
    inputPreview: clip(toolInput, 200),
    resultPreview: clip(toolResult, 120),
  });

  const mergedFlat = flattenSearchObjects(merged);
  const inputFlat = inputRecords.flatMap((r) => flattenSearchObjects(r));
  const resultFlat = resultRecords.flatMap((r) => flattenSearchObjects(r));

  const fromMerged = findPathAndContentInRecords(mergedFlat);
  const fromInput = findPathAndContentInRecords(inputFlat);
  const fromResult = findPathAndContentInRecords(resultFlat);

  let path = fromMerged.path ?? fromInput.path ?? fromResult.path;
  let content = fromMerged.content ?? fromInput.content ?? fromResult.content;

  filePreviewDebug("detect:candidates", {
    toolName,
    pathFound: Boolean(path),
    path: path ?? "(none)",
    contentLen: content?.length ?? 0,
    fromMergedPath: Boolean(fromMerged.path),
    fromInputPath: Boolean(fromInput.path),
    fromResultPath: Boolean(fromResult.path),
  });

  if (!content && toolResult && !resultObj && looksLikeFileBody(toolResult)) {
    content = toolResult;
    filePreviewDebug("detect:content-from-raw-result", { len: toolResult.length });
  }

  if (!path && hintsFile && content && inputFlat.length > 0) {
    const maybe = findPathAndContentInRecords(inputFlat).path;
    if (maybe) path = maybe;
  }

  if (!path) {
    filePreviewDebug("detect:reject:no-path", {
      toolName,
      hintsFile,
      mergedKeys: Object.keys(merged),
      inputPreview: clip(toolInput, 320),
    });
    return null;
  }

  const ext = extFromPath(path);
  if (!ext || !PREVIEW_EXT.has(ext)) {
    filePreviewDebug("detect:reject:bad-ext", {
      toolName,
      path,
      ext: ext || "(empty)",
      allowed: false,
    });
    return null;
  }

  if (content == null || content === "") {
    filePreviewDebug("detect:reject:no-content", {
      toolName,
      path,
      ext,
    });
    return null;
  }

  filePreviewDebug("detect:ok", {
    toolName,
    path,
    ext,
    contentLen: content.length,
  });

  return {
    path,
    filename: basenameFromPath(path),
    content,
    ext,
  };
}

/**
 * Merge a richer artifact when result arrives (e.g. content only in result JSON).
 * Keeps `existing` if `detect` returns null (e.g. short "success" result).
 */
export function mergeFileArtifact(
  existing: FileArtifact | undefined,
  toolName: string,
  toolInput?: string,
  toolResult?: string,
): FileArtifact | undefined {
  filePreviewDebug("merge:start", {
    toolName,
    hadExisting: Boolean(existing),
    existingPath: existing?.path,
    toolInputLen: toolInput?.length ?? 0,
    toolResultLen: toolResult?.length ?? 0,
    toolResultPreview: clip(toolResult, 160),
  });

  const next = detectFileArtifact(toolName, toolInput, toolResult);
  if (!existing) {
    filePreviewDebug("merge:first-only", { ok: Boolean(next), path: next?.path ?? null });
    return next ?? undefined;
  }
  if (!next) {
    filePreviewDebug("merge:keep-existing", {
      reason: "detect-returned-null-on-result",
      path: existing.path,
      contentLen: existing.content.length,
    });
    return existing;
  }
  const out: FileArtifact = {
    ...next,
    path: next.path || existing.path,
    filename: next.filename || existing.filename,
    ext: next.ext || existing.ext,
    content: next.content.trim() ? next.content : existing.content,
    ...(existing.toolCallId ? { toolCallId: existing.toolCallId } : {}),
  };
  filePreviewDebug("merge:combined", {
    path: out.path,
    ext: out.ext,
    contentLen: out.content.length,
    keptContentFrom: next.content.trim() ? "result" : "start",
  });
  return out;
}
