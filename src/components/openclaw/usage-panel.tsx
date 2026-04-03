"use client";

import { useCallback, useMemo, useState } from "react";
import { btnClass } from "@/components/control-button-classes";
import { useControl } from "@/components/control-provider";
import { JsonPreview } from "@/components/openclaw/json-preview";
import { OpenClawDisconnectedHint } from "@/components/openclaw/disconnected-hint";
import { localIsoDate, utcOffsetLabelFromBrowser } from "@/lib/format-iso-date";
import { GatewayRequestError } from "@/lib/openclaw";

export function UsagePanel() {
  const { connected, rpc } = useControl();
  const [startDate, setStartDate] = useState(() => localIsoDate(new Date()));
  const [endDate, setEndDate] = useState(() => localIsoDate(new Date()));
  const [sessionsUsage, setSessionsUsage] = useState<unknown>(null);
  const [costUsage, setCostUsage] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    "rounded-md border border-border-input bg-surface-input px-2 py-1.5 text-sm text-foreground";

  const dateBody = useMemo(
    () => ({
      startDate,
      endDate,
      mode: "specific" as const,
      utcOffset: utcOffsetLabelFromBrowser(),
    }),
    [startDate, endDate],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [su, cu] = await Promise.all([
        rpc("sessions.usage", {
          ...dateBody,
          limit: 500,
          includeContextWeight: true,
        }),
        rpc("usage.cost", dateBody),
      ]);
      setSessionsUsage(su);
      setCostUsage(cu);
    } catch (e) {
      const msg =
        e instanceof GatewayRequestError
          ? `${e.gatewayCode}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
      setSessionsUsage(null);
      setCostUsage(null);
    } finally {
      setLoading(false);
    }
  }, [dateBody, rpc]);

  if (!connected) {
    return <OpenClawDisconnectedHint />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Session usage and cost for the selected local calendar days (same RPCs as the stock Control UI:
        <code className="mx-1 text-xs text-foreground">sessions.usage</code> and
        <code className="mx-1 text-xs text-foreground">usage.cost</code>). Requires operator scopes your
        gateway allows.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="usage-start" className="mb-0.5 block text-xs text-label">
            Start
          </label>
          <input
            id="usage-start"
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="usage-end" className="mb-0.5 block text-xs text-label">
            End
          </label>
          <input
            id="usage-end"
            type="date"
            className={inputClass}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <button type="button" className={btnClass} disabled={loading} onClick={() => void load()}>
          {loading ? "Loading…" : "Load usage"}
        </button>
      </div>
      {error ? (
        <p className="rounded-md border border-err-border bg-surface-status px-3 py-2 text-sm text-err-text">{error}</p>
      ) : null}
      {sessionsUsage != null ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-heading">Sessions usage</h2>
          <JsonPreview value={sessionsUsage} />
        </section>
      ) : null}
      {costUsage != null ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-heading">Cost summary</h2>
          <JsonPreview value={costUsage} />
        </section>
      ) : null}
    </div>
  );
}
