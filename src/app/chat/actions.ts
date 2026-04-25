"use server";

import {
  ensureCtlSkill,
  ensureSessionDir,
  listRecentWorkspaceFiles,
  listSessionFiles,
  readSessionFile,
  readWorkspaceFile,
  sessionDirRelative,
  type WorkspaceFileEntry,
  type WorkspaceReadResult,
} from "@/lib/openclaw/workspace-files";

export type { WorkspaceReadResult } from "@/lib/openclaw/workspace-files";

export type SessionFolderInfo = {
  /** Relative path from workspace root, e.g. `ctl-sessions/agent_main_main`. */
  relativePath: string;
};

/**
 * Ensure the session folder exists and return its relative path
 * (called once when a session loads).
 */
export async function initSessionFolder(sessionKey: string): Promise<SessionFolderInfo> {
  await Promise.all([ensureSessionDir(sessionKey), ensureCtlSkill()]);
  return { relativePath: sessionDirRelative(sessionKey) };
}

export async function fetchSessionFiles(sessionKey: string): Promise<WorkspaceFileEntry[]> {
  return listSessionFiles(sessionKey);
}

export async function fetchSessionFileContent(
  sessionKey: string,
  relPath: string,
): Promise<{ content: string; size: number } | null> {
  return readSessionFile(sessionKey, relPath);
}

/** Files under the OpenClaw workspace modified after `sinceMs` (workspace-relative paths). */
export async function fetchRecentWorkspaceFiles(sinceMs: number): Promise<WorkspaceFileEntry[]> {
  return listRecentWorkspaceFiles(sinceMs);
}

/** Read a file by path relative to the workspace root. */
export async function fetchWorkspaceFileContent(
  workspaceRelPath: string,
): Promise<WorkspaceReadResult> {
  return readWorkspaceFile(workspaceRelPath);
}
