"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Save,
  Settings,
} from "lucide-react";
import { btnClass, primaryBtnClass } from "@/components/control-button-classes";
import { CtlSectionHeader } from "@/components/ctl-section-header";
import { useControlConnection } from "@/components/control-provider";
import { OpenClawDisconnectedHint } from "@/components/openclaw/disconnected-hint";
import { GatewayRequestError } from "@/lib/openclaw";
import { cn } from "@/lib/utils";

type ConfigData = {
  path?: string;
  config?: Record<string, unknown>;
  resolved?: Record<string, unknown>;
};

const REDACTED = "__OPENCLAW_REDACTED__";

const inputSearchClass =
  "w-full max-w-2xl rounded-md border border-border-input bg-surface-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";

function configKeyBelongsToSection(sectionPrefix: string, fullKey: string | null): boolean {
  if (!fullKey) {
    return false;
  }
  return fullKey === sectionPrefix || fullKey.startsWith(`${sectionPrefix}.`);
}

/**
 * Live <code>config.get</code> tree with search and <code>config.set</code> — flat rows like the Today dashboard.
 */
export function GatewayConfigDashboard() {
  const { connected, rpc } = useControlConnection();
  const [configData, setConfigData] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!connected) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = (await rpc("config.get", {})) as Record<string, unknown> | null;
      const r = result ?? {};
      const raw = r.config ?? r.parsed ?? r;
      const configObj =
        raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      setConfigData({
        path: typeof r.path === "string" ? r.path : undefined,
        config: configObj,
        resolved:
          r.resolved && typeof r.resolved === "object" && !Array.isArray(r.resolved)
            ? (r.resolved as Record<string, unknown>)
            : undefined,
      });
    } catch (e) {
      const msg =
        e instanceof GatewayRequestError
          ? `${e.gatewayCode}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [connected, rpc]);

  useEffect(() => {
    if (connected) {
      void refresh();
    } else {
      setConfigData(null);
      setError(null);
      setEditKey(null);
    }
  }, [connected, refresh]);

  const handleSave = useCallback(async () => {
    if (!editKey) {
      return;
    }
    setSaving(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(editValue);
      } catch {
        parsed = editValue;
      }
      await rpc("config.set", { key: editKey, value: parsed });
      setSaved(editKey);
      setEditKey(null);
      setTimeout(() => setSaved(null), 2000);
      await refresh();
    } catch (e) {
      const msg =
        e instanceof GatewayRequestError
          ? `${e.gatewayCode}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [editKey, editValue, refresh, rpc]);

  const handleEdit = useCallback((key: string, value: unknown) => {
    setEditKey(key);
    setEditValue(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  }, []);

  const handleCancelEdit = useCallback(() => setEditKey(null), []);

  const config = configData?.config ?? {};
  const sections = useMemo(() => {
    const base = configData?.config ?? {};
    return Object.keys(base).filter((key) => {
      if (!search) {
        return true;
      }
      const q = search.toLowerCase();
      if (key.toLowerCase().includes(q)) {
        return true;
      }
      const val = JSON.stringify(base[key] ?? "").toLowerCase();
      return val.includes(q);
    });
  }, [configData?.config, search]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <CtlSectionHeader label="Gateway configuration" />
          <p className="text-xs text-muted-foreground">
            <code className="text-[11px] text-foreground">config.get</code>
            {configData?.path ? (
              <>
                {" "}
                <span className="font-mono text-[11px]" title={configData.path}>
                  {configData.path}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className={`${btnClass} gap-2`}
          disabled={loading || !connected}
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {!connected ? (
        <OpenClawDisconnectedHint />
      ) : (
        <>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sections and values…"
            className={inputSearchClass}
            aria-label="Search configuration"
          />

          {error ? (
            <div className="flex max-w-2xl items-center gap-2 rounded-md border border-err-border bg-surface-status px-3 py-2 text-sm text-err-text">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          ) : null}

          {loading && !configData ? (
            <div className="flex py-12">
              <Loader2 className="size-7 animate-spin text-muted-foreground" />
            </div>
          ) : sections.length === 0 ? (
            <div className="py-12 text-center">
              <Settings className="mx-auto mb-2 size-10 text-muted-foreground opacity-40" />
              <p className="text-sm font-medium text-heading">No configuration data</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Empty response, or nothing matches your search.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border-muted border-t border-border-muted">
              {sections.map((section) => (
                <ConfigSection
                  key={section}
                  name={section}
                  data={config[section]}
                  prefix={section}
                  editKey={editKey}
                  editValue={
                    configKeyBelongsToSection(section, editKey) ? editValue : ""
                  }
                  saving={saving}
                  saved={
                    saved !== null && configKeyBelongsToSection(section, saved) ? saved : null
                  }
                  onEdit={handleEdit}
                  onSave={handleSave}
                  onCancel={handleCancelEdit}
                  onEditValueChange={setEditValue}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const ConfigSection = memo(function ConfigSection({
  name,
  data,
  prefix,
  editKey,
  editValue,
  saving,
  saved,
  onEdit,
  onSave,
  onCancel,
  onEditValueChange,
}: {
  name: string;
  data: unknown;
  prefix: string;
  editKey: string | null;
  editValue: string;
  saving: boolean;
  saved: string | null;
  onEdit: (key: string, value: unknown) => void;
  onSave: () => void;
  onCancel: () => void;
  onEditValueChange: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isObject = data !== null && typeof data === "object" && !Array.isArray(data);
  const entries = isObject ? Object.entries(data as Record<string, unknown>) : [];

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 py-3 text-left hover:bg-muted/30"
      >
        {expanded ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-medium text-heading">{name}</span>
        <span className="text-xs text-muted-foreground">
          {isObject ? `${entries.length} keys` : typeof data}
        </span>
      </button>

      {expanded ? (
        <div className="border-border-muted pb-3 pl-6 sm:pl-8">
          {isObject ? (
            <div className="divide-y divide-border-muted/80 border-t border-border-muted/80">
              {entries.map(([key, value]) => {
                const fullKey = `${prefix}.${key}`;
                const isNested = value !== null && typeof value === "object";
                const isEditing = editKey === fullKey;
                const isSaved = saved === fullKey;
                const displayValue = isNested ? JSON.stringify(value, null, 2) : String(value ?? "");
                const isRedacted = displayValue.includes(REDACTED);

                return (
                  <div key={key} className="py-3 first:pt-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 font-mono text-xs font-medium text-foreground">{fullKey}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        {isSaved ? <Check className="size-3.5 text-emerald-500" aria-label="Saved" /> : null}
                        {!isEditing && !isRedacted ? (
                          <button
                            type="button"
                            onClick={() => onEdit(fullKey, value)}
                            className="text-xs font-medium text-link hover:text-link-hover"
                          >
                            Edit
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={editValue}
                          onChange={(e) => onEditValueChange(e.target.value)}
                          rows={isNested ? Math.min(displayValue.split("\n").length, 12) : 2}
                          className="w-full max-w-4xl rounded-md border border-border-input bg-surface-input px-2 py-1.5 font-mono text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={`${primaryBtnClass} gap-2`} disabled={saving} onClick={onSave}>
                            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                            Save
                          </button>
                          <button type="button" className={btnClass} onClick={onCancel}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre
                        className={cn(
                          "mt-1 max-w-4xl whitespace-pre-wrap break-all font-mono text-xs",
                          isRedacted ? "text-muted-foreground opacity-70" : "text-foreground/90",
                        )}
                      >
                        {isNested
                          ? displayValue.length > 280
                            ? `${displayValue.slice(0, 280)}…`
                            : displayValue
                          : displayValue}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/90">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
});
