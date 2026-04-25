"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AlertCircle, FileText, RefreshCw } from "lucide-react";
import { fetchRecentWorkspaceFiles, fetchWorkspaceFileContent } from "@/app/chat/actions";
import type { ChatSurfaceModel } from "@/features/chat/chat-model";
import type { WorkspaceFileEntry } from "@/lib/openclaw/workspace-files";
import type { FileArtifact } from "@/features/chat/file-artifact";
import { PREVIEW_EXT } from "@/features/chat/file-artifact";
import { useFilePreview } from "@/features/chat/file-preview-context";
import { cn } from "@/lib/utils";

function entryToArtifact(entry: WorkspaceFileEntry, content: string): FileArtifact {
  return {
    path: entry.name,
    filename: entry.filename,
    ext: entry.ext,
    content,
  };
}

export type SessionFilesBarProps = {
  sessionKey: string;
  /** Incremented when history loads or a run completes so we re-fetch immediately. */
  refreshSignal?: number;
  /** Lower bound for workspace `mtime` scan (epoch ms). */
  sinceMs: number;
  chatModelRef: RefObject<ChatSurfaceModel | null>;
};

const POLL_INTERVAL_MS = 4_000;

export function SessionFilesBar({
  sessionKey,
  refreshSignal,
  sinceMs,
  chatModelRef,
}: SessionFilesBarProps) {
  const { open, artifact } = useFilePreview();
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<{ path: string; message: string } | null>(null);
  const mountedRef = useRef(true);
  /** mtime of the file when we last opened/refreshed the preview. */
  const openMtimeRef = useRef<number>(0);
  /** Monotonic counter so out-of-order list fetches don't overwrite newer results. */
  const listSeqRef = useRef(0);

  const prevSessionRef = useRef(sessionKey);
  useEffect(() => {
    if (prevSessionRef.current !== sessionKey) {
      setFiles([]);
      setListError(null);
      setOpenError(null);
      openMtimeRef.current = 0;
    }
    prevSessionRef.current = sessionKey;
  }, [sessionKey]);

  const refreshOpenPreview = useCallback(
    async (freshFiles: WorkspaceFileEntry[]) => {
      const openPath = artifact?.path;
      if (!openPath) return;
      const match = freshFiles.find((f) => f.name === openPath);
      if (!match) return;
      if (match.modifiedAtMs <= openMtimeRef.current) return;
      try {
        const result = await fetchWorkspaceFileContent(openPath);
        if (!mountedRef.current) return;
        if (!result.ok) {
          // The file-preview-panel handles its own error surface via polling;
          // swallow here to avoid double-reporting.
          return;
        }
        openMtimeRef.current = match.modifiedAtMs;
        open(entryToArtifact(match, result.content));
      } catch {
        /* panel will surface any lingering error via its own poll. */
      }
    },
    [artifact?.path, open],
  );

  const doFetch = useCallback(async () => {
    const sk = sessionKey.trim();
    if (!sk) {
      setFiles([]);
      return;
    }
    const activityStart = chatModelRef.current?.sessionActivityStartMs ?? sinceMs;
    const mySeq = ++listSeqRef.current;
    try {
      const result = await fetchRecentWorkspaceFiles(activityStart);
      if (!mountedRef.current || mySeq !== listSeqRef.current) return;
      const previewable = result.filter((f) => PREVIEW_EXT.has(f.ext));
      setFiles(previewable);
      setListError(null);
      void refreshOpenPreview(previewable);
    } catch (err) {
      if (!mountedRef.current || mySeq !== listSeqRef.current) return;
      setListError(err instanceof Error ? err.message : "Failed to load recent files");
    }
  }, [sessionKey, sinceMs, chatModelRef, refreshOpenPreview]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void doFetch();
  }, [doFetch]);

  useEffect(() => {
    if (refreshSignal === 0) return;
    const t = setTimeout(() => void doFetch(), 600);
    return () => clearTimeout(t);
  }, [refreshSignal, doFetch]);

  useEffect(() => {
    if (!sessionKey.trim()) return;
    const id = setInterval(() => void doFetch(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sessionKey, doFetch]);

  const handleOpen = useCallback(
    async (entry: WorkspaceFileEntry) => {
      setLoading(true);
      setOpenError(null);
      try {
        const result = await fetchWorkspaceFileContent(entry.name);
        if (!mountedRef.current) return;
        if (!result.ok) {
          const msg =
            result.reason === "too-large"
              ? "File too large to preview"
              : result.reason === "binary"
                ? "Binary file — preview not supported"
                : result.reason === "not-found"
                  ? "File no longer exists"
                  : "Failed to load file";
          setOpenError({ path: entry.name, message: msg });
          return;
        }
        openMtimeRef.current = entry.modifiedAtMs;
        open(entryToArtifact(entry, result.content));
      } catch (err) {
        if (!mountedRef.current) return;
        setOpenError({
          path: entry.name,
          message: err instanceof Error ? err.message : "Failed to load file",
        });
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [open],
  );

  // Hide entirely until a session is active so nothing renders on login screens.
  if (!sessionKey.trim()) {
    return null;
  }

  const isEmpty = files.length === 0;

  return (
    <div className="shrink-0 border-t border-border/50 bg-muted/10 px-4 py-2">
      <div className="mx-auto max-w-2xl">
        <div className="mb-1.5 flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recent workspace files
          </p>
          <button
            type="button"
            onClick={() => void doFetch()}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            title="Refresh file list"
          >
            <RefreshCw className="size-2.5" />
          </button>
        </div>

        {listError && (
          <div
            role="alert"
            className="mb-1.5 flex items-center gap-1.5 text-[11px] text-destructive"
          >
            <AlertCircle className="size-3 shrink-0" aria-hidden />
            <span className="truncate">Couldn’t refresh file list: {listError}</span>
          </div>
        )}

        {openError && (
          <div
            role="alert"
            className="mb-1.5 flex items-center gap-1.5 text-[11px] text-destructive"
          >
            <AlertCircle className="size-3 shrink-0" aria-hidden />
            <span className="truncate" title={openError.path}>
              {openError.message}: {openError.path}
            </span>
          </div>
        )}

        {isEmpty ? (
          <p className="text-[11px] text-muted-foreground/70">
            No files written yet in this session. Ask the agent to create or edit a file.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f) => {
              const active = artifact?.path === f.name;
              return (
                <button
                  key={f.name}
                  type="button"
                  disabled={loading}
                  onClick={() => void handleOpen(f)}
                  className={cn(
                    "inline-flex max-w-[min(100%,14rem)] items-center gap-1 rounded-md border px-2 py-1 text-left text-xs transition-colors",
                    active
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/60 bg-background/80 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground",
                  )}
                  title={f.name}
                >
                  <FileText className="size-3 shrink-0 opacity-70" aria-hidden />
                  <span className="min-w-0 truncate font-mono">{f.filename}</span>
                  {f.ext && (
                    <span className="shrink-0 rounded bg-muted/80 px-1 py-px font-mono text-[10px] text-muted-foreground">
                      .{f.ext}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
