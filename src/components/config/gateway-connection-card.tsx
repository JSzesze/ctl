"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Activity,
  Expand,
  Loader2,
  Plug,
  Trash2,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useControlConnection, useControlLog } from "@/components/control-provider";
import { cn } from "@/lib/utils";

const cardClass =
  "flex flex-col rounded-lg border border-border/60 bg-card p-3.5 text-card-foreground";

const inputClass =
  "h-8 w-full rounded-md border border-border-input bg-surface-input px-2 py-0 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:outline-none";

const labelClass = "mb-0.5 block text-[11px] font-medium text-muted-foreground";

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(cardClass, className)}>{children}</div>;
}

function CardLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2.5 text-[10px] font-semibold tracking-widest text-muted-foreground/80 uppercase">
      {children}
    </h3>
  );
}

export function GatewayConnectionCard() {
  const [logOpen, setLogOpen] = useState(false);

  const {
    hydrated,
    gatewayUrl,
    setGatewayUrl,
    token,
    setToken,
    password,
    setPassword,
    remember,
    setRemember,
    connected,
    connecting,
    statusText,
    statusKind,
    handleConnect,
    handleDisconnect,
    handleStatus,
    clearLog,
  } = useControlConnection();
  const { logText } = useControlLog();

  if (!hydrated) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
        <div className="h-32 animate-pulse rounded-lg border border-border/50 bg-muted/15" />
        <div className="h-32 animate-pulse rounded-lg border border-border/50 bg-muted/15" />
        <div className="h-32 animate-pulse rounded-lg border border-border/50 bg-muted/15 sm:col-span-2 lg:col-span-1" />
      </div>
    );
  }

  const shortStatus =
    connected ? "Connected" : connecting ? "Connecting…" : "Offline";

  const hasRpcLine =
    statusKind === "err" || (statusKind === "ok" && statusText.length > 0);

  return (
    <>
      <h2 className="sr-only">Gateway connection</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Connection */}
        <Card>
          <div className="mb-2.5 flex items-center justify-between">
            <CardLabel>Connection</CardLabel>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium",
                connected && "text-emerald-600 dark:text-emerald-400",
                connecting && "text-amber-600 dark:text-amber-400",
                !connected && !connecting && "text-muted-foreground/60",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  connected && "bg-emerald-500",
                  connecting && "animate-pulse bg-amber-500",
                  !connected && !connecting && "bg-muted-foreground/40",
                )}
              />
              {shortStatus}
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-2">
            <div>
              <label htmlFor="gw-ws" className={labelClass}>URL</label>
              <input
                id="gw-ws"
                type="text"
                className={cn(inputClass, "font-mono text-xs tabular-nums")}
                placeholder="wss://host:18789"
                autoComplete="off"
                spellCheck={false}
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              <Button
                type="button"
                size="xs"
                disabled={connecting || connected}
                onClick={handleConnect}
                className="h-6 gap-1 px-2 text-[11px] shadow-none"
              >
                {connecting ? <Loader2 className="size-3 animate-spin" /> : <Plug className="size-3" />}
                Connect
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      disabled={!connected}
                      onClick={handleDisconnect}
                      aria-label="Disconnect"
                    >
                      <Unplug className="size-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">Disconnect</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </Card>

        {/* Credentials */}
        <Card>
          <CardLabel>Credentials</CardLabel>
          <div className="flex flex-1 flex-col gap-2">
            <div>
              <label htmlFor="gw-tok" className={labelClass}>Token</label>
              <input
                id="gw-tok"
                type="password"
                className={inputClass}
                placeholder="Gateway token"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="gw-pw" className={labelClass}>Password</label>
              <input
                id="gw-pw"
                type="password"
                className={inputClass}
                placeholder="Optional"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <label className="mt-auto flex cursor-pointer items-center gap-1.5 pt-1 text-[11px]">
              <input
                type="checkbox"
                className="size-3 shrink-0 rounded border-border-input"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="text-muted-foreground">Remember</span>
            </label>
          </div>
        </Card>

        {/* Log & status */}
        <Card className="sm:col-span-2 lg:col-span-1">
          <div className="mb-2.5 flex items-center justify-between">
            <CardLabel>Log</CardLabel>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      disabled={!connected}
                      onClick={() => void handleStatus()}
                      aria-label="Fetch status"
                    >
                      <Activity className="size-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">Fetch status</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => clearLog()}
                      aria-label="Clear log"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">Clear</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setLogOpen(true)}
                    aria-label="Expand log"
                  >
                    <Expand className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Expand</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <LogPreview logText={logText} hasRpcLine={hasRpcLine} statusKind={statusKind} statusText={statusText} />

          <p className="mt-2 text-[10px] text-muted-foreground/70">
            <span className="text-foreground/60">localhost</span> or <span className="text-foreground/60">HTTPS</span> required
            <span className="px-1">·</span>
            <a
              href="https://docs.openclaw.ai/web/control-ui"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground/80"
            >
              Docs
            </a>
            <span className="px-1">·</span>
            <Link href="/chat" className="hover:text-foreground/80">Chat</Link>
          </p>
        </Card>
      </div>

      <Sheet open={logOpen} onOpenChange={setLogOpen}>
        <SheetContent
          side="right"
          showCloseButton
          className={cn(
            "flex w-full flex-col gap-0 overflow-hidden p-0",
            "h-[100dvh] max-h-[100dvh]",
            "sm:max-w-[min(100vw-1rem,42rem)]",
          )}
        >
          <SheetHeader className="shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 pr-11">
            <div>
              <SheetTitle className="text-sm">Connection log</SheetTitle>
              <SheetDescription className="sr-only">Gateway WebSocket and RPC debug output</SheetDescription>
            </div>
            <Button type="button" variant="ghost" size="xs" className="h-7 gap-1 text-[11px]" onClick={() => clearLog()}>
              <Trash2 className="size-3" />
              Clear
            </Button>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3">
            <pre
              className="whitespace-pre-wrap break-words rounded-md border border-border-muted bg-surface-status/50 p-3 font-mono text-[11px] leading-relaxed text-foreground/90"
              aria-label="Connection debug log"
            >
              {logText || "—"}
            </pre>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

const LOG_TAIL_LINES = 8;

function LogPreview({
  logText,
  hasRpcLine,
  statusKind,
  statusText,
}: {
  logText: string;
  hasRpcLine: boolean;
  statusKind: string;
  statusText: string;
}) {
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logText, statusText]);

  const tail = logText
    ? logText.split("\n").slice(-LOG_TAIL_LINES).join("\n")
    : "";

  const hasContent = tail.length > 0 || hasRpcLine;

  return (
    <pre
      ref={scrollRef}
      className={cn(
        "flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-md border px-2 py-1.5 font-mono text-[11px] leading-relaxed",
        "max-h-28 min-h-[4.5rem]",
        hasRpcLine && statusKind === "err"
          ? "border-err-border bg-surface-status"
          : "border-border/40 bg-muted/5",
      )}
      aria-label="Connection log preview"
    >
      {hasRpcLine && (
        <span className={statusKind === "err" ? "text-err-text" : "text-foreground/80"}>
          {statusText}
          {tail ? "\n" : ""}
        </span>
      )}
      {tail ? <span className="text-foreground/70">{tail}</span> : null}
      {!hasContent && <span className="text-muted-foreground/40 select-none">—</span>}
    </pre>
  );
}
