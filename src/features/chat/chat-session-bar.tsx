"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, PanelLeft, Search } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import type { SessionInfo } from "@/features/chat/chat-model";
import { openCtlCommandPalette } from "@/lib/ctl-command-palette";

export type ChatSessionBarProps = {
  sessionKey: string;
  onSessionKeyChange: (v: string) => void;
  connected: boolean;
  error: string | null;
  sessionList: SessionInfo[];
  onLoadSessions: () => void;
};

const KIND_BADGES: Record<SessionInfo["kind"], { label: string; cls: string }> = {
  main: { label: "Main", cls: "bg-emerald-500/15 text-emerald-400" },
  chat: { label: "Chat", cls: "bg-blue-500/15 text-blue-400" },
  group: { label: "Group", cls: "bg-violet-500/15 text-violet-400" },
  cron: { label: "Cron", cls: "bg-amber-500/15 text-amber-400" },
  hook: { label: "Hook", cls: "bg-orange-500/15 text-orange-400" },
  task: { label: "Task", cls: "bg-cyan-500/15 text-cyan-400" },
  unknown: { label: "Other", cls: "bg-muted text-muted-foreground" },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function ChatSessionBar({
  sessionKey,
  onSessionKeyChange,
  connected,
  error,
  sessionList,
  onLoadSessions,
}: ChatSessionBarProps) {
  const { toggleSidebar } = useSidebar();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const handleOpen = useCallback(() => {
    setOpen((v) => !v);
    onLoadSessions();
  }, [onLoadSessions]);

  const handlePick = useCallback(
    (key: string) => {
      onSessionKeyChange(key);
      setOpen(false);
    },
    [onSessionKeyChange],
  );

  const currentInfo = sessionList.find((s) => s.key === sessionKey);
  const displayLabel = currentInfo?.label ?? sessionKey ?? "No session";

  return (
    <div className="relative shrink-0 border-b border-border/50">
      <div className="flex h-11 items-center gap-1.5 px-2">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-4" />
        </button>

        <div className="mx-1 h-4 w-px shrink-0 bg-border/60" />

        <div
          className={`size-1.5 shrink-0 rounded-full ${connected ? "bg-emerald-500" : "bg-neutral-400"}`}
          title={connected ? "Connected" : "Disconnected"}
        />

        <button
          type="button"
          onClick={handleOpen}
          className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent"
        >
          <span className="truncate text-muted-foreground">{displayLabel}</span>
          <ChevronDown className={`size-3 shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        <div className="flex-1" />

        {error ? (
          <span className="shrink-0 truncate text-[10px] text-destructive" title={error}>
            {error}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => openCtlCommandPalette()}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Search"
        >
          <Search className="size-3.5" />
        </button>
      </div>

      {open ? (
        <div
          ref={pickerRef}
          className="absolute left-2 top-full z-20 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-background shadow-lg"
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {sessionList.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {connected ? "No sessions found" : "Not connected"}
              </p>
            ) : (
              sessionList.map((info) => {
                const badge = KIND_BADGES[info.kind];
                const active = info.key === sessionKey;
                return (
                  <button
                    key={info.key}
                    type="button"
                    onClick={() => handlePick(info.key)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent ${
                      active ? "bg-accent/50" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className={`truncate text-xs ${active ? "font-medium text-foreground" : "text-foreground/80"}`}>
                          {info.label}
                        </span>
                      </div>
                      {info.channel ? (
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          via {info.channel}
                        </span>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      {info.updatedAt ? (
                        <span className="block text-[10px] text-muted-foreground">{timeAgo(info.updatedAt)}</span>
                      ) : null}
                      {info.contextTokens ? (
                        <span className="block text-[10px] text-muted-foreground/60">{formatTokens(info.contextTokens)} ctx</span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
