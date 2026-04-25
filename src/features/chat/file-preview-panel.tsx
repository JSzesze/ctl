"use client";

import { AlertCircle, Check, ClipboardCopy, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { fetchWorkspaceFileContent } from "@/app/chat/actions";
import type { WorkspaceReadResult } from "@/lib/openclaw/workspace-files";
import type { FileArtifact } from "@/features/chat/file-artifact";
import { basenameFromPath, extFromPath } from "@/features/chat/file-artifact";
import { CodeViewer } from "@/features/chat/code-viewer";
import { useFilePreview } from "@/features/chat/file-preview-context";
import { streamdownComponents, streamdownPlugins } from "@/features/chat/streamdown-config";

const LIVE_POLL_MS = 1_500;

type PreviewError = {
  message: string;
  detail?: string;
};

function describeReadFailure(
  result: Extract<WorkspaceReadResult, { ok: false }>,
): PreviewError {
  switch (result.reason) {
    case "too-large":
      return {
        message: "File too large to preview",
        detail:
          result.size != null && result.maxSize != null
            ? `${(result.size / 1024 / 1024).toFixed(2)} MB (limit ${(result.maxSize / 1024 / 1024).toFixed(0)} MB)`
            : undefined,
      };
    case "binary":
      return { message: "Binary file — preview not supported" };
    case "not-found":
      return { message: "File not found on disk" };
    case "invalid-path":
      return { message: "Invalid file path" };
    case "hidden":
      return { message: "Hidden files are not previewable" };
    case "not-a-file":
      return { message: "Path is not a regular file" };
    case "read-error":
      return { message: "Failed to read file" };
    default:
      return { message: "Unable to load file" };
  }
}

function PreviewBody({ artifact }: { artifact: FileArtifact }) {
  const { ext, content } = artifact;

  if (ext === "md") {
    return (
      <div className="min-w-0 text-[0.8125rem] leading-relaxed">
        <Streamdown mode="static" plugins={streamdownPlugins} components={streamdownComponents}>
          {content}
        </Streamdown>
      </div>
    );
  }

  return <CodeViewer key={`${artifact.path}:${artifact.toolCallId ?? ""}`} code={content} language={ext} />;
}

function PreviewErrorState({
  error,
  onRetry,
}: {
  error: PreviewError;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex min-w-0 flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3 text-[0.8125rem] text-foreground"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />
        <span className="font-medium">{error.message}</span>
      </div>
      {error.detail && (
        <p className="pl-6 font-mono text-xs text-muted-foreground">{error.detail}</p>
      )}
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="ml-6 font-normal"
        onClick={onRetry}
      >
        <RotateCw className="mr-1 size-3.5" aria-hidden />
        Retry
      </Button>
    </div>
  );
}

/**
 * Right-hand file preview: filename header + rendered body (scrolls independently).
 */
export function FilePreviewPanel() {
  const { artifact, open, close } = useFilePreview();
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<PreviewError | null>(null);
  /** Monotonic request id — drop stale fetches when a newer one wins. */
  const reqSeqRef = useRef(0);
  /** Reset-trigger for manual "Retry" attempts. */
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const contentRef = useRef(artifact?.content ?? "");
  useEffect(() => {
    contentRef.current = artifact?.content ?? "";
  }, [artifact?.content]);

  /** Keep the latest toolCallId available inside the interval without re-subscribing. */
  const toolCallIdRef = useRef<string | undefined>(artifact?.toolCallId);
  useEffect(() => {
    toolCallIdRef.current = artifact?.toolCallId;
  }, [artifact?.toolCallId]);

  // Clear any prior error when the path changes (new file opened).
  useEffect(() => {
    setError(null);
  }, [artifact?.path]);

  useEffect(() => {
    const path = artifact?.path;
    if (!path) return;

    let cancelled = false;

    const tick = async () => {
      const mySeq = ++reqSeqRef.current;
      try {
        const result = await fetchWorkspaceFileContent(path);
        if (cancelled || mySeq !== reqSeqRef.current) return;

        if (!result.ok) {
          // `not-found` during the live poll is common and not actionable: the tool's
          // artifact path may be bare (e.g. `foo.md`) or session-relative, while the
          // read resolves against the workspace root. We already have authoritative
          // content from the tool result, so keep displaying it and skip this refresh.
          if (result.reason === "not-found") return;
          setError(describeReadFailure(result));
          return;
        }

        if (error) setError(null);

        if (result.content !== contentRef.current) {
          contentRef.current = result.content;
          open({
            path,
            filename: basenameFromPath(path),
            ext: extFromPath(path),
            content: result.content,
            ...(toolCallIdRef.current ? { toolCallId: toolCallIdRef.current } : {}),
          });
        }
      } catch {
        if (cancelled || mySeq !== reqSeqRef.current) return;
        // Network/IPC errors during the background poll shouldn't replace working content.
        // Only surface these if the user explicitly retries (which re-runs this tick).
      }
    };

    // Kick off an immediate refresh so "Retry" feels responsive;
    // the interval handles live updates from there.
    void tick();
    const id = setInterval(() => void tick(), LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // `error` intentionally omitted — we read it via the closure and
    // only use it to suppress redundant state resets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact?.path, open, retryTick]);

  const handleRetry = useCallback(() => {
    setError(null);
    setRetryTick((n) => n + 1);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [artifact]);

  const body = useMemo(() => {
    if (!artifact) return null;
    if (error) return <PreviewErrorState error={error} onRetry={handleRetry} />;
    return <PreviewBody artifact={artifact} />;
  }, [artifact, error, handleRetry]);

  if (!artifact) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 truncate font-mono text-xs font-medium text-foreground" title={artifact.path}>
          {artifact.filename}
        </span>
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          .{artifact.ext}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="font-normal"
            aria-label={copied ? "Copied" : "Copy file contents"}
            onClick={() => void handleCopy()}
          >
            {copied ? (
              <>
                <Check className="mr-1 size-3.5" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <ClipboardCopy className="mr-1 size-3.5" aria-hidden />
                Copy
              </>
            )}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close preview" onClick={close}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-3">
        {body}
      </div>
    </div>
  );
}
