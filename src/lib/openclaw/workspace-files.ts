/**
 * Server-side workspace file utilities.
 *
 * Reads files from the OpenClaw agent workspace on disk.
 * Uses `OPENCLAW_WORKSPACE` env var or defaults to `~/.openclaw/workspace`.
 */

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, extname, basename, sep } from "node:path";

const SESSION_DIR_PREFIX = "ctl-sessions";

function resolveHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(2));
  }
  return p;
}

let _cachedConfigWorkspace: string | null | undefined;

/**
 * Read `agents.defaults.workspace` from `~/.openclaw/openclaw.json`.
 * Cached after first read; returns `null` if missing or unreadable.
 */
function readConfigWorkspace(): string | null {
  if (_cachedConfigWorkspace !== undefined) return _cachedConfigWorkspace;
  try {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const ws = parsed?.agents?.defaults?.workspace;
    _cachedConfigWorkspace = typeof ws === "string" && ws.trim() ? ws.trim() : null;
  } catch {
    _cachedConfigWorkspace = null;
  }
  return _cachedConfigWorkspace;
}

export function getWorkspacePath(): string {
  const env = process.env.OPENCLAW_WORKSPACE?.trim();
  if (env) return resolveHome(env);

  const fromConfig = readConfigWorkspace();
  if (fromConfig) return resolveHome(fromConfig);

  return join(homedir(), ".openclaw", "workspace");
}

/**
 * Sanitize a session key for use as a directory name.
 * Replaces colons, slashes, and other filesystem-unsafe chars with underscores.
 */
function sanitizeSessionKey(key: string): string {
  return key
    .trim()
    .replace(/[/:\\<>"|?*\x00-\x1f]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function sessionDirName(sessionKey: string): string {
  return sanitizeSessionKey(sessionKey);
}

export function sessionDirPath(sessionKey: string): string {
  const ws = getWorkspacePath();
  return join(ws, SESSION_DIR_PREFIX, sessionDirName(sessionKey));
}

/** Relative path from workspace root to the session folder (for agent context). */
export function sessionDirRelative(sessionKey: string): string {
  return `${SESSION_DIR_PREFIX}/${sessionDirName(sessionKey)}`;
}

export async function ensureSessionDir(sessionKey: string): Promise<string> {
  const dir = sessionDirPath(sessionKey);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Workspace skill — ctl-ui
// ---------------------------------------------------------------------------

const CTL_SKILL_DIR = "skills/ctl-ui";
const CTL_SKILL_FILE = "SKILL.md";

const CTL_SKILL_CONTENT = `---
name: ctl_ui
description: Control UI integration — session file viewer, workspace file panel, and output conventions.
metadata: { "openclaw": { "always": true } }
---

# Control UI File Viewer

The Control web UI has a file panel that shows workspace files modified during
the current session. Users can click any file to preview it in a side panel
with syntax highlighting and rendered markdown.

## Session working directory

Each Control UI session creates a folder under \`ctl-sessions/\` in the
workspace (e.g. \`ctl-sessions/agent_main_main/\`). The exact path is provided
in the \`<ctl-ui>\` context block attached to messages from the Control UI.

When creating **new** output files (reports, analysis, generated code, etc.),
prefer writing them into the session working directory so they appear in the
Control UI file panel automatically.

For **editing existing** workspace files (AGENTS.md, SOUL.md, config, scripts),
write to their normal location — the file panel picks up any workspace file
modified during the session.

## Context block

Messages from the Control UI include a \`<ctl-ui>\` block with dynamic state:

- \`dir\` — the session working directory (relative to workspace root)
- \`preview\` — the file currently open in the preview panel (if any)
- \`recent\` — a list of recently modified workspace files visible to the user

Use this context to be aware of what the user sees and where output files
should go.
`;

/**
 * Ensure the `ctl-ui` workspace skill exists on disk.
 * Writes only if the file is missing (never overwrites user edits).
 */
export async function ensureCtlSkill(): Promise<void> {
  const ws = getWorkspacePath();
  const dir = join(ws, CTL_SKILL_DIR);
  const file = join(dir, CTL_SKILL_FILE);

  if (existsSync(file)) return;

  await mkdir(dir, { recursive: true });
  await writeFile(file, CTL_SKILL_CONTENT, "utf-8");
}

export type WorkspaceFileEntry = {
  /**
   * Relative path: from session folder root for `listSessionFiles`, or from workspace root for
   * `listRecentWorkspaceFiles` / workspace reads (see each function’s docs).
   */
  name: string;
  /** Just the filename (basename). */
  filename: string;
  /** Lowercase extension without dot. */
  ext: string;
  size: number;
  modifiedAtMs: number;
};

/** Directory name segments to skip when scanning the whole workspace (noise / large trees). */
const WORKSPACE_SCAN_EXCLUDED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "canvas",
  "memory",
  ".next",
  "dist",
  "build",
]);

/** Extensions treated as non-text for workspace scan listing (keep in sync with preview UX). */
const BINARY_LIKE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "svg",
  "avif",
  "bmp",
  "mp3",
  "mp4",
  "wav",
  "webm",
  "ogg",
  "pdf",
  "zip",
  "gz",
  "tar",
  "rar",
  "7z",
  "wasm",
  "exe",
  "dmg",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
]);

const MAX_WORKSPACE_SCAN_DEPTH = 12;

/** Max bytes for reading file contents in the Control UI preview. */
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

function isBinaryLikeExtension(extLower: string): boolean {
  if (!extLower) return false;
  return BINARY_LIKE_EXTENSIONS.has(extLower.toLowerCase());
}

function shouldSkipWorkspaceScanSegment(segment: string): boolean {
  if (!segment || segment === "." || segment === "..") return true;
  if (segment.startsWith(".")) return true;
  return WORKSPACE_SCAN_EXCLUDED_SEGMENTS.has(segment);
}

/**
 * Recursively collect files under the workspace root modified after `sinceMs`.
 * Paths in `name` are relative to the workspace root (POSIX-style `/`).
 */
export async function listRecentWorkspaceFiles(sinceMs: number): Promise<WorkspaceFileEntry[]> {
  const root = getWorkspacePath();
  const results: WorkspaceFileEntry[] = [];

  async function walk(absDir: string, relPosix: string, depth: number): Promise<void> {
    if (depth > MAX_WORKSPACE_SCAN_DEPTH) return;
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (shouldSkipWorkspaceScanSegment(entry.name)) continue;

      const relName = relPosix ? `${relPosix}/${entry.name}` : entry.name;
      const fullPath = join(absDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath, relName, depth + 1);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).replace(/^\./, "").toLowerCase();
        if (isBinaryLikeExtension(ext)) continue;
        try {
          const st = await stat(fullPath);
          if (!st.isFile()) continue;
          if (st.mtimeMs <= sinceMs) continue;
          results.push({
            name: relName.split(sep).join("/"),
            filename: entry.name,
            ext,
            size: st.size,
            modifiedAtMs: st.mtimeMs,
          });
        } catch {
          /* skip */
        }
      }
    }
  }

  await walk(root, "", 0);
  results.sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);
  return results;
}

/** Resolve `relPath` under the workspace root; rejects traversal outside the root. */
function resolveWorkspaceFilePath(relPath: string): string | null {
  const root = getWorkspacePath();
  const trimmed = relPath.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.includes("\0")) return null;
  const segments = trimmed.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.some((s) => s === "..")) return null;
  if (segments.some((s) => s.startsWith("."))) return null;

  const full = join(root, ...segments);
  const rel = relative(root, full);
  if (!rel || rel.startsWith("..") || rel.startsWith("/") || rel.includes("..")) {
    return null;
  }
  return full;
}

/**
 * Result shape for workspace file reads.
 * Failure carries a `reason` so the UI can surface a meaningful message
 * (too large, binary, missing, unreadable) instead of an empty pane.
 */
export type WorkspaceReadReason =
  | "invalid-path"
  | "hidden"
  | "binary"
  | "not-found"
  | "not-a-file"
  | "too-large"
  | "read-error";

export type WorkspaceReadResult =
  | { ok: true; content: string; size: number }
  | { ok: false; reason: WorkspaceReadReason; size?: number; maxSize?: number };

/** Max bytes surfaced to clients (mirrors `MAX_FILE_SIZE`). */
export const WORKSPACE_MAX_FILE_SIZE = MAX_FILE_SIZE;

/**
 * Read a text file by path relative to the OpenClaw workspace root.
 * Always resolves to a discriminated result; callers can show the reason on failure.
 */
export async function readWorkspaceFile(relPath: string): Promise<WorkspaceReadResult> {
  const full = resolveWorkspaceFilePath(relPath);
  if (!full) return { ok: false, reason: "invalid-path" };

  const base = basename(full);
  if (base.startsWith(".")) return { ok: false, reason: "hidden" };

  const ext = extname(base).replace(/^\./, "").toLowerCase();
  if (isBinaryLikeExtension(ext)) return { ok: false, reason: "binary" };

  let st;
  try {
    st = await stat(full);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return { ok: false, reason: "not-found" };
    return { ok: false, reason: "read-error" };
  }
  if (!st.isFile()) return { ok: false, reason: "not-a-file" };
  if (st.size > MAX_FILE_SIZE) {
    return { ok: false, reason: "too-large", size: st.size, maxSize: MAX_FILE_SIZE };
  }

  try {
    const content = await readFile(full, "utf-8");
    return { ok: true, content, size: st.size };
  } catch {
    return { ok: false, reason: "read-error", size: st.size };
  }
}

const IGNORE_PATTERNS = new Set([".DS_Store", "Thumbs.db", ".gitkeep"]);
const MAX_DEPTH = 4;

async function walkDir(
  root: string,
  prefix: string,
  depth: number,
): Promise<WorkspaceFileEntry[]> {
  if (depth > MAX_DEPTH) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: WorkspaceFileEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORE_PATTERNS.has(entry.name)) continue;
    const fullPath = join(root, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const sub = await walkDir(fullPath, relPath, depth + 1);
      results.push(...sub);
    } else if (entry.isFile()) {
      try {
        const st = await stat(fullPath);
        const ext = extname(entry.name).replace(/^\./, "").toLowerCase();
        results.push({
          name: relPath,
          filename: entry.name,
          ext,
          size: st.size,
          modifiedAtMs: st.mtimeMs,
        });
      } catch {
        /* skip unreadable files */
      }
    }
  }
  return results;
}

export async function listSessionFiles(sessionKey: string): Promise<WorkspaceFileEntry[]> {
  const dir = sessionDirPath(sessionKey);
  const files = await walkDir(dir, "", 0);
  files.sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);
  return files;
}

export async function readSessionFile(
  sessionKey: string,
  relPath: string,
): Promise<{ content: string; size: number } | null> {
  const dir = sessionDirPath(sessionKey);
  const full = join(dir, relPath);

  const resolved = relative(dir, full);
  if (resolved.startsWith("..") || resolved.startsWith("/")) {
    return null;
  }

  try {
    const st = await stat(full);
    if (!st.isFile() || st.size > MAX_FILE_SIZE) return null;
    const content = await readFile(full, "utf-8");
    return { content, size: st.size };
  } catch {
    return null;
  }
}
