"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, ChevronDown, Cpu, PanelLeft, Plus, Search } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SessionInfo } from "@/features/chat/chat-model";
import { openCtlCommandPalette } from "@/lib/ctl-command-palette";
import { cn } from "@/lib/utils";

export type ChatSessionBarProps = {
  sessionKey: string;
  onSessionKeyChange: (v: string) => void;
  connected: boolean;
  error: string | null;
  sessionList: SessionInfo[];
  onLoadSessions: () => void;
  onNewSession: () => void;
  rpc: (method: string, params?: unknown) => Promise<unknown>;
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

// ---------------------------------------------------------------------------
// Model picker
// ---------------------------------------------------------------------------

type ModelEntry = { id: string; label: string; provider: string };

/** Inferred vendor prefix from ids like `anthropic/claude-…` when `models.list` omits `provider`. */
function providerFromModelId(modelId: string): string {
  const i = modelId.indexOf("/");
  if (i <= 0) return "";
  return modelId.slice(0, i);
}

function displayProvider(modelId: string, explicit: string): string {
  const t = explicit.trim();
  if (t) return t;
  return providerFromModelId(modelId);
}

function parseModelList(res: unknown): ModelEntry[] {
  if (!res || typeof res !== "object") return [];
  const r = res as Record<string, unknown>;
  const models = r.models ?? r.items ?? r.list;
  if (!Array.isArray(models)) return [];
  const out: ModelEntry[] = [];
  for (const m of models) {
    if (!m || typeof m !== "object") continue;
    const raw = m as Record<string, unknown>;
    const id =
      typeof raw.id === "string" ? raw.id :
      typeof raw.name === "string" ? raw.name :
      typeof raw.model === "string" ? raw.model : null;
    if (!id) continue;
    const explicitProvider = typeof raw.provider === "string" ? raw.provider : "";
    const label = typeof raw.label === "string" ? raw.label : id;
    const provider = displayProvider(id, explicitProvider);
    out.push({ id, label, provider });
  }
  return out;
}

/** Read `agents.defaults.model.primary` (or string `model`) from merged gateway config. */
function extractDefaultModelFromConfig(config: Record<string, unknown> | null | undefined): string | null {
  if (!config || typeof config !== "object") return null;
  const agents = config.agents as Record<string, unknown> | undefined;
  if (!agents || typeof agents !== "object") return null;
  const defaults = agents.defaults as Record<string, unknown> | undefined;
  if (!defaults || typeof defaults !== "object") return null;
  const model = defaults.model;
  if (typeof model === "string" && model.trim()) return model.trim();
  if (model && typeof model === "object") {
    const m = model as Record<string, unknown>;
    const primary = typeof m.primary === "string" ? m.primary.trim() : "";
    if (primary) return primary;
  }
  return null;
}

function parseConfigGetPayload(res: unknown): string | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  const raw = r.config ?? r.parsed ?? r;
  const fromMain =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? extractDefaultModelFromConfig(raw as Record<string, unknown>)
      : null;
  if (fromMain) return fromMain;
  const resolved = r.resolved;
  if (resolved && typeof resolved === "object" && !Array.isArray(resolved)) {
    return extractDefaultModelFromConfig(resolved as Record<string, unknown>);
  }
  return null;
}

/**
 * Gateway `sessions.list` rows (`buildGatewaySessionRow`) expose `model` / `modelProvider` (effective,
 * including overrides). `sessions.get` only returns `{ messages }`, so it must not be used for model state.
 */
function parseSessionModelFields(s: Record<string, unknown>): {
  modelOverride: string | null;
  effectiveModel: string | null;
  modelProvider: string | null;
} {
  const entry = s.entry && typeof s.entry === "object" ? (s.entry as Record<string, unknown>) : null;
  const nested = s.session && typeof s.session === "object" ? (s.session as Record<string, unknown>) : null;
  const modelOverride =
    (typeof s.modelOverride === "string" ? s.modelOverride : null) ??
    (entry && typeof entry.modelOverride === "string" ? entry.modelOverride : null) ??
    (nested && typeof nested.modelOverride === "string" ? nested.modelOverride : null);
  const effectiveModel =
    (typeof s.model === "string" && s.model.trim() ? s.model : null) ??
    (entry && typeof entry.model === "string" && entry.model.trim() ? entry.model : null) ??
    (nested && typeof nested.model === "string" && nested.model.trim() ? nested.model : null);
  const modelProvider =
    (typeof s.modelProvider === "string" ? s.modelProvider : null) ??
    (entry && typeof entry.modelProvider === "string" ? entry.modelProvider : null) ??
    (nested && typeof nested.modelProvider === "string" ? nested.modelProvider : null);
  return { modelOverride, effectiveModel, modelProvider };
}

function parseSessionsListRows(res: unknown): Record<string, unknown>[] {
  if (!res || typeof res !== "object") return [];
  const r = res as Record<string, unknown>;
  const sessions = r.sessions ?? r.items ?? r.list;
  if (!Array.isArray(sessions)) return [];
  const out: Record<string, unknown>[] = [];
  for (const s of sessions) {
    if (s && typeof s === "object" && !Array.isArray(s)) out.push(s as Record<string, unknown>);
  }
  return out;
}

/** Match `sessions.list` row for the active session key (canonical `key` on each row). */
function findSessionRowByKey(res: unknown, sessionKey: string): Record<string, unknown> | null {
  const sk = sessionKey.trim();
  if (!sk) return null;
  for (const row of parseSessionsListRows(res)) {
    if (typeof row.key === "string" && row.key === sk) return row;
  }
  return null;
}

/** Gateway `sessions.list` includes `defaults` from `getSessionDefaults(cfg)` — use this (not only `config.get`) so comparison matches session rows. */
function parseSessionsListDefaults(res: unknown): {
  model: string | null;
  modelProvider: string | null;
} {
  if (!res || typeof res !== "object") return { model: null, modelProvider: null };
  const d = (res as Record<string, unknown>).defaults;
  if (!d || typeof d !== "object") return { model: null, modelProvider: null };
  const def = d as Record<string, unknown>;
  const model = typeof def.model === "string" && def.model.trim() ? def.model.trim() : null;
  const modelProvider =
    typeof def.modelProvider === "string" && def.modelProvider.trim()
      ? def.modelProvider.trim()
      : null;
  return { model, modelProvider };
}

/** True when ids refer to the same model (exact or same tail after `/`, e.g. catalog vs gateway forms). */
function modelsEffectivelyEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const xa = a.trim();
  const xb = b.trim();
  if (xa === xb) return true;
  const tail = (s: string) => (s.includes("/") ? s.slice(s.lastIndexOf("/") + 1) : s);
  return tail(xa) === tail(xb);
}

function ModelPicker({
  sessionKey,
  rpc,
  connected,
}: {
  sessionKey: string;
  rpc: (method: string, params?: unknown) => Promise<unknown>;
  connected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelEntry[]>([]);
  /** Set only when the user has a per-session override (`sessions.patch` / `/model`). */
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  /** Resolved effective model from the gateway (`sessions.list`), including config default. */
  const [effectiveModel, setEffectiveModel] = useState<string | null>(null);
  const [modelProvider, setModelProvider] = useState<string | null>(null);
  /** Gateway default model id (prefer `sessions.list` `defaults.model`, else `config.get`). */
  const [gatewayDefaultModelId, setGatewayDefaultModelId] = useState<string | null>(null);
  const [sessionModelLoaded, setSessionModelLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  /** Cached `agents.defaults.model.primary` from `config.get` (same for all sessions on this gateway). */
  const defaultModelCacheRef = useRef<string | null | undefined>(undefined);

  const loadSessionModel = useCallback(async () => {
    if (!connected || !sessionKey.trim()) {
      setSessionModelLoaded(false);
      return;
    }
    setSessionModelLoaded(false);
    try {
      const listRes = await rpc("sessions.list", {
        includeGlobal: true,
        includeUnknown: true,
      });
      const listDefaults = parseSessionsListDefaults(listRes);
      let defaultM = listDefaults.model;
      if (!defaultM) {
        if (defaultModelCacheRef.current === undefined) {
          try {
            const cfgRes = await rpc("config.get", {});
            defaultModelCacheRef.current = parseConfigGetPayload(cfgRes);
          } catch {
            defaultModelCacheRef.current = null;
          }
        }
        defaultM = defaultModelCacheRef.current ?? null;
      }
      setGatewayDefaultModelId(defaultM);

      const row = findSessionRowByKey(listRes, sessionKey);
      let mo: string | null = null;
      let em: string | null = null;
      let mp: string | null = null;
      if (row) {
        const parsed = parseSessionModelFields(row);
        mo = parsed.modelOverride;
        em = parsed.effectiveModel;
        mp = parsed.modelProvider;
      }
      if (!em) {
        em = defaultM;
      }
      // Only show "Reset" when the effective model differs from gateway defaults (same source as rows).
      if (!mo && em && defaultM && !modelsEffectivelyEqual(em, defaultM)) {
        mo = em;
      } else if (mo && em && defaultM && modelsEffectivelyEqual(em, defaultM)) {
        mo = null;
      }
      setModelOverride(mo);
      setEffectiveModel(em);
      setModelProvider(mp);
    } catch { /* ignore */ } finally {
      setSessionModelLoaded(true);
    }
  }, [connected, rpc, sessionKey]);

  useEffect(() => {
    if (!connected) {
      defaultModelCacheRef.current = undefined;
      setGatewayDefaultModelId(null);
    }
  }, [connected]);

  const loadCatalog = useCallback(async () => {
    if (!connected) return;
    try {
      const listRes = await rpc("models.list", {});
      setModels(parseModelList(listRes));
    } catch { /* ignore */ }
  }, [connected, rpc]);

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      await Promise.all([loadCatalog(), loadSessionModel()]);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [connected, loadCatalog, loadSessionModel]);

  useEffect(() => {
    void loadSessionModel();
  }, [loadSessionModel]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handlePick = useCallback(
    async (modelId: string) => {
      try {
        await rpc("sessions.patch", { key: sessionKey.trim(), model: modelId });
        setEffectiveModel(modelId);
        setModelOverride(
          gatewayDefaultModelId && !modelsEffectivelyEqual(modelId, gatewayDefaultModelId)
            ? modelId
            : null,
        );
      } catch {
        /* ignore */
      }
      setOpen(false);
      setFilter("");
    },
    [rpc, sessionKey, gatewayDefaultModelId],
  );

  const handleClear = useCallback(async () => {
    try {
      await rpc("sessions.patch", { key: sessionKey.trim(), model: null });
      setModelOverride(null);
      await loadSessionModel();
    } catch { /* ignore */ }
    setOpen(false);
    setFilter("");
  }, [rpc, sessionKey, loadSessionModel]);

  /** Catalog plus current effective model if missing (e.g. config default not in `models.list`). */
  const pickerList = useMemo(() => {
    const ids = new Set(models.map((m) => m.id));
    const list = [...models];
    if (effectiveModel?.trim() && !ids.has(effectiveModel)) {
      list.unshift({
        id: effectiveModel,
        label: effectiveModel.includes("/")
          ? (effectiveModel.split("/").pop() ?? effectiveModel)
          : effectiveModel,
        provider: displayProvider(effectiveModel, modelProvider ?? ""),
      });
    }
    return list;
  }, [models, effectiveModel, modelProvider]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pickerList;
    return pickerList.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        (m.provider && m.provider.toLowerCase().includes(q)),
    );
  }, [pickerList, filter]);

  const resetDefaultShort = gatewayDefaultModelId
    ? gatewayDefaultModelId.includes("/")
      ? (gatewayDefaultModelId.split("/").pop() ?? gatewayDefaultModelId)
      : gatewayDefaultModelId
    : null;

  const displayId = effectiveModel ?? modelOverride;
  const displayLabel = displayId
    ? displayId.split("/").pop() ?? displayId
    : sessionModelLoaded
      ? "Default"
      : "…";
  const titleParts = [
    displayId ?? (sessionModelLoaded ? "Gateway default model" : "Loading…"),
    modelProvider ? `@ ${modelProvider}` : null,
    sessionModelLoaded ? (modelOverride ? "(session override)" : "(config default)") : null,
  ].filter(Boolean);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!connected}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          title={titleParts.join(" ")}
        >
          <Cpu className="size-3 shrink-0" />
          <span className="max-w-[7rem] truncate">{displayLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b border-border px-2 py-1.5">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter models…"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {loading ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">Loading…</p>
          ) : pickerList.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">No models</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matches</p>
          ) : (
            <>
              {modelOverride ? (
                <button
                  type="button"
                  onClick={() => void handleClear()}
                  title={
                    gatewayDefaultModelId
                      ? `Use gateway default: ${gatewayDefaultModelId}`
                      : "Clear session override (config default unavailable)"
                  }
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent"
                >
                  {resetDefaultShort
                    ? `Reset to ${resetDefaultShort}`
                    : "Reset to gateway default"}
                </button>
              ) : null}
              {filtered.map((m) => {
                const selected = Boolean(effectiveModel && m.id === effectiveModel);
                const prov = m.provider || providerFromModelId(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => void handlePick(m.id)}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 py-1.5 pr-3 pl-2 text-left text-xs transition-colors hover:bg-accent/80",
                      selected
                        ? "border-l-[3px] border-l-emerald-500 bg-emerald-500/12 dark:bg-emerald-500/18"
                        : "border-l-[3px] border-l-transparent",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
                      <span
                        className={cn(
                          "shrink-0 rounded-full",
                          selected
                            ? "size-2 bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.22)]"
                            : "size-1.5 bg-muted-foreground/30",
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        selected
                          ? "font-medium text-emerald-800 dark:text-emerald-200"
                          : "text-foreground/80",
                      )}
                    >
                      {m.label}
                    </span>
                    <span
                      className="shrink-0 max-w-[5.5rem] truncate text-[10px] text-muted-foreground/70"
                      title={prov ? `Provider: ${prov}` : "Provider unknown"}
                    >
                      {prov || "—"}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Thinking level picker
// ---------------------------------------------------------------------------

const THINKING_LEVELS = [
  { value: "", label: "Default" },
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
] as const;

function ThinkingPicker({
  sessionKey,
  rpc,
  connected,
}: {
  sessionKey: string;
  rpc: (method: string, params?: unknown) => Promise<unknown>;
  connected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string>("");

  useEffect(() => {
    if (!open || !connected) return;
    void (async () => {
      try {
        const res = await rpc("sessions.list", {
          includeGlobal: true,
          includeUnknown: true,
        });
        const row = findSessionRowByKey(res, sessionKey);
        const tl =
          row && typeof row.thinkingLevel === "string" ? row.thinkingLevel : "";
        setCurrent(tl);
      } catch { /* ignore */ }
    })();
  }, [open, connected, rpc, sessionKey]);

  const handlePick = useCallback(async (level: string) => {
    try {
      await rpc("sessions.patch", { key: sessionKey.trim(), thinkingLevel: level || null });
      setCurrent(level);
    } catch { /* ignore */ }
    setOpen(false);
  }, [rpc, sessionKey]);

  const activeLabel = THINKING_LEVELS.find((l) => l.value === current)?.label ?? "Thinking";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!connected}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          title={`Thinking: ${activeLabel}`}
        >
          <Brain className="size-3 shrink-0" />
          <span>{activeLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-0">
        <div className="py-1">
          {THINKING_LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              onClick={() => void handlePick(level.value)}
              className={`flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                level.value === current ? "bg-accent/50 font-medium text-foreground" : "text-foreground/80"
              }`}
            >
              {level.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Main session bar
// ---------------------------------------------------------------------------

export function ChatSessionBar({
  sessionKey,
  onSessionKeyChange,
  connected,
  error,
  sessionList,
  onLoadSessions,
  onNewSession,
  rpc,
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
      <div className="flex h-11 items-center gap-1 px-2">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-4" />
        </button>

        <div className="mx-0.5 h-4 w-px shrink-0 bg-border/60" />

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

        <button
          type="button"
          onClick={onNewSession}
          disabled={!connected}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          aria-label="New session"
          title="New session (/new)"
        >
          <Plus className="size-3.5" />
        </button>

        <div className="mx-0.5 h-4 w-px shrink-0 bg-border/60" />

        <ModelPicker sessionKey={sessionKey} rpc={rpc} connected={connected} />
        <ThinkingPicker sessionKey={sessionKey} rpc={rpc} connected={connected} />

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
