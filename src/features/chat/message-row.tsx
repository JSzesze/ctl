"use client";

import { memo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Loader2,
  Wrench,
  XCircle,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import type { ChatEntry } from "@/features/chat/chat-model";
import { useFilePreviewOptional } from "@/features/chat/file-preview-context";
import { streamdownComponents, streamdownPlugins } from "@/features/chat/streamdown-config";

export type MessageRowProps = {
  entry: ChatEntry;
};

function statusStyles(status: ChatEntry["toolStatus"]) {
  if (status === "running") {
    return {
      badge: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
      border: "border-l-violet-500/60",
    };
  }
  if (status === "error") {
    return {
      badge: "bg-destructive/15 text-destructive",
      border: "border-l-destructive/60",
    };
  }
  return {
    badge: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
    border: "border-l-emerald-500/50",
  };
}

function ToolRow({ entry }: { entry: ChatEntry }) {
  const [open, setOpen] = useState(false);
  const filePreview = useFilePreviewOptional();
  const status = entry.toolStatus ?? "done";
  const { badge, border } = statusStyles(status);
  const hasDetails = Boolean(entry.toolInput?.trim() || entry.toolResult?.trim());
  const fileArtifact = entry.fileArtifact;

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch">
      <div
        className={`max-w-[min(100%,42rem)] rounded-lg border border-border/50 border-l-2 bg-muted/20 ${border} shadow-sm`}
      >
        <div className="flex w-full items-center gap-2 px-2.5 py-2">
          <button
            type="button"
            onClick={() => hasDetails && setOpen(!open)}
            className={`flex min-w-0 flex-1 items-center gap-2 text-left text-xs transition-colors ${
              hasDetails ? "hover:bg-muted/40" : "cursor-default"
            }`}
            aria-expanded={open}
          >
            {status === "running" ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-violet-600 dark:text-violet-400" />
            ) : status === "error" ? (
              <XCircle className="size-3.5 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            <Wrench className="size-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
              {entry.toolName ?? "tool"}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge}`}>
              {status === "running" ? "Running" : status === "error" ? "Error" : "Done"}
            </span>
            {hasDetails ? (
              <ChevronRight
                className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
              />
            ) : null}
          </button>
          {fileArtifact && filePreview ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="shrink-0 font-normal"
              onClick={() => filePreview.open(fileArtifact)}
            >
              Open
            </Button>
          ) : null}
        </div>
        {open && hasDetails ? (
          <div className="space-y-2 border-t border-border/40 px-2.5 py-2">
            {entry.toolInput?.trim() ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Input
                </div>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-snug text-muted-foreground">
                  {entry.toolInput}
                </pre>
              </div>
            ) : null}
            {entry.toolResult?.trim() ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Result
                </div>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-snug text-muted-foreground">
                  {entry.toolResult}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
        {!open && entry.text?.trim() && !hasDetails ? (
          <div className="border-t border-border/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            {entry.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type ToolClusterRowProps = {
  entries: readonly ChatEntry[];
};

/** Overlapping circular “avatars” for consecutive tool calls; expand for full cards. */
export function ToolClusterRow({ entries }: ToolClusterRowProps) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;

  const n = entries.length;
  const anyRunning = entries.some((e) => (e.toolStatus ?? "done") === "running");

  return (
    <div
      className="flex w-full min-w-0 flex-col items-stretch"
      role="group"
      aria-label={`${n} tool ${n === 1 ? "call" : "calls"}`}
    >
      <div className="flex max-w-[min(100%,42rem)] flex-row flex-wrap items-center gap-2">
        <div className="flex flex-row items-center pl-0.5">
          {entries.map((entry, i) => {
            const status = entry.toolStatus ?? "done";
            const initial = entry.toolName
              ? (Array.from(entry.toolName.trim())[0] ?? "?").toUpperCase()
              : "?";
            return (
              <div
                key={entry.id}
                className={`relative flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-muted to-muted/70 text-xs font-semibold text-foreground/90 shadow-md ring-1 ring-border/50 ${
                  status === "running"
                    ? "ring-2 ring-violet-500/45"
                    : status === "error"
                      ? "ring-2 ring-destructive/40"
                      : ""
                } ${i > 0 ? "-ml-3" : ""}`}
                style={{ zIndex: i + 1 }}
                title={entry.toolName ?? "tool"}
              >
                {status === "running" ? (
                  <Loader2 className="size-4 animate-spin text-violet-600 dark:text-violet-400" aria-hidden />
                ) : status === "error" ? (
                  <XCircle className="size-4 text-destructive" aria-hidden />
                ) : (
                  <span className="select-none" aria-hidden>
                    {initial}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50"
          aria-expanded={expanded}
        >
          <Wrench className="size-3 shrink-0 opacity-70" aria-hidden />
          <span className="font-medium text-foreground/85">
            {n} tool{n === 1 ? "" : "s"}
            {anyRunning ? " · running" : ""}
          </span>
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 opacity-70" aria-hidden />
          )}
        </button>
      </div>
      {expanded ? (
        <div className="mt-2 flex min-w-0 flex-col gap-2 border-l-2 border-border/40 pl-3">
          {entries.map((entry) => (
            <ToolRow key={entry.id} entry={entry} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ThinkingBody({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <Streamdown
        mode="static"
        className="max-w-none text-xs leading-relaxed text-muted-foreground [&_p]:my-1 [&_h1]:my-2 [&_h2]:my-2 [&_ul]:my-1 [&_ol]:my-1"
        plugins={streamdownPlugins}
        components={streamdownComponents}
      >
        {text}
      </Streamdown>
    </div>
  );
}

function ThinkingRow({ entry }: { entry: ChatEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full min-w-0 flex-col items-stretch">
      <div className="max-w-[min(100%,42rem)] rounded-lg border border-border/50 bg-muted/20 shadow-sm">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40"
          aria-expanded={open}
        >
          <Lightbulb className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="font-medium text-foreground/80">Thought process</span>
          <span className="ml-auto text-[10px] text-muted-foreground/80">
            {entry.text.length.toLocaleString()} chars
          </span>
          <ChevronRight
            className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>
        {open ? (
          <div className="border-t border-border/40 px-2.5 py-2 text-xs leading-relaxed">
            <div className="max-h-64 overflow-y-auto">
              <ThinkingBody text={entry.text} />
            </div>
          </div>
        ) : (
          <div className="relative border-t border-border/40 px-2.5 py-1.5">
            <div className="max-h-[4.25rem] overflow-hidden">
              <ThinkingBody text={entry.text} />
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-muted/20 to-transparent"
              aria-hidden
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MessageRowInner({ entry }: MessageRowProps) {
  if (entry.kind === "tool") {
    return <ToolRow entry={entry} />;
  }

  if (entry.kind === "thinking") {
    return <ThinkingRow entry={entry} />;
  }

  if (entry.kind === "status") {
    return (
      <div className="flex justify-center py-0.5">
        <span className="rounded-full bg-muted/40 px-2.5 py-0.5 text-[10px] text-muted-foreground/70">
          {entry.text}
        </span>
      </div>
    );
  }

  if (entry.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[0.8125rem] leading-relaxed text-primary-foreground whitespace-pre-wrap">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.role === "assistant") {
    return (
      <div className="group flex justify-start">
        <div className="max-w-full min-w-0 text-[0.8125rem] leading-relaxed text-foreground">
          <Streamdown mode="static" plugins={streamdownPlugins} components={streamdownComponents}>
            {entry.text}
          </Streamdown>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center py-1">
      <span className="rounded-full bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground">
        {entry.text}
      </span>
    </div>
  );
}

export const MessageRow = memo(MessageRowInner);
