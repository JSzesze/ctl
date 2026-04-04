"use client";

import { memo, useState } from "react";
import { CheckCircle2, ChevronRight, Lightbulb, Loader2, Wrench, XCircle } from "lucide-react";
import { Streamdown } from "streamdown";
import type { ChatEntry } from "@/features/chat/chat-model";
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
  const status = entry.toolStatus ?? "done";
  const { badge, border } = statusStyles(status);
  const hasDetails = Boolean(entry.toolInput?.trim() || entry.toolResult?.trim());

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch">
      <div
        className={`max-w-[min(100%,42rem)] rounded-lg border border-border/50 border-l-2 bg-muted/20 ${border} shadow-sm`}
      >
        <button
          type="button"
          onClick={() => hasDetails && setOpen(!open)}
          className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors ${
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

function ThinkingRow({ entry }: { entry: ChatEntry }) {
  const [open, setOpen] = useState(false);
  const collapsedHint =
    entry.text.length > 120 ? `${entry.text.slice(0, 120).trim()}…` : entry.text;
  return (
    <div className="flex w-full min-w-0 flex-col items-stretch">
      <div className="max-w-[min(100%,42rem)] rounded-lg border border-border/50 border-l-2 border-l-amber-500/50 bg-muted/20 shadow-sm">
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
          <div className="border-t border-border/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
            <pre className="whitespace-pre-wrap font-sans">{entry.text}</pre>
          </div>
        ) : (
          <div className="border-t border-border/40 px-2.5 py-1.5 text-[11px] italic text-muted-foreground/90">
            {collapsedHint}
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
