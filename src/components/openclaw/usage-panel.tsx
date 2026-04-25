"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  CircleHelp,
  Coins,
  Layers,
  MessageSquare,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useControlConnection } from "@/components/control-provider";
import { CtlMetricCard } from "@/components/ctl-metric-card";
import { CtlSectionHeader } from "@/components/ctl-section-header";
import { JsonPreview } from "@/components/openclaw/json-preview";
import { OpenClawDisconnectedHint } from "@/components/openclaw/disconnected-hint";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  localDateRangeForPreset,
  utcOffsetLabelFromBrowser,
  type UsageDateRangePreset,
} from "@/lib/format-iso-date";
import {
  buildUsageDashboard,
  emptyUsageTotals,
  formatShortDate,
  formatUsageTokensCompact,
  formatUsageUsd,
  type DailyBreakdownRow,
  type UsageDashboardData,
  type UsageTotalsParsed,
} from "@/lib/openclaw/usage-model";
import { GatewayRequestError } from "@/lib/openclaw";
import { cn } from "@/lib/utils";

const SESSIONS_USAGE_LIMIT = 500;

const MIX_LEGEND = [
  { key: "out", label: "Out", className: "bg-violet-500/90" },
  { key: "in", label: "In", className: "bg-blue-500/90" },
  { key: "cw", label: "Cache W", className: "bg-amber-500/90" },
  { key: "cr", label: "Cache R", className: "bg-emerald-500/90" },
] as const;

function dayScalarTotal(d: DailyBreakdownRow, mode: "tokens" | "cost"): number {
  if (mode === "cost") {
    return d.totalCost;
  }
  return d.totalTokens > 0 ? d.totalTokens : d.input + d.output + d.cacheRead + d.cacheWrite;
}

function dayHasBreakdownForMode(d: DailyBreakdownRow, mode: "tokens" | "cost"): boolean {
  if (mode === "cost") {
    return (
      d.inputCost > 0 ||
      d.outputCost > 0 ||
      d.cacheReadCost > 0 ||
      d.cacheWriteCost > 0
    );
  }
  return d.input > 0 || d.output > 0 || d.cacheRead > 0 || d.cacheWrite > 0;
}

/** Per-day segments: real breakdown when the gateway sends it; else split each day using range-wide proportions. */
function mixSegmentsForDay(
  d: DailyBreakdownRow,
  mode: "tokens" | "cost",
  rangeTotals: UsageTotalsParsed,
): Array<{ value: number; className: string }> {
  const isCost = mode === "cost";
  if (dayHasBreakdownForMode(d, mode)) {
    return isCost
      ? [
          { value: d.outputCost, className: "bg-violet-500/90" },
          { value: d.inputCost, className: "bg-blue-500/90" },
          { value: d.cacheWriteCost, className: "bg-amber-500/90" },
          { value: d.cacheReadCost, className: "bg-emerald-500/90" },
        ]
      : [
          { value: d.output, className: "bg-violet-500/90" },
          { value: d.input, className: "bg-blue-500/90" },
          { value: d.cacheWrite, className: "bg-amber-500/90" },
          { value: d.cacheRead, className: "bg-emerald-500/90" },
        ];
  }
  const out = isCost ? rangeTotals.outputCost : rangeTotals.output;
  const inn = isCost ? rangeTotals.inputCost : rangeTotals.input;
  const cw = isCost ? rangeTotals.cacheWriteCost : rangeTotals.cacheWrite;
  const cr = isCost ? rangeTotals.cacheReadCost : rangeTotals.cacheRead;
  const sum = out + inn + cw + cr;
  const dayT = dayScalarTotal(d, mode);
  if (sum <= 0 || dayT <= 0) {
    return [];
  }
  return [
    { value: (out / sum) * dayT, className: "bg-violet-500/90" },
    { value: (inn / sum) * dayT, className: "bg-blue-500/90" },
    { value: (cw / sum) * dayT, className: "bg-amber-500/90" },
    { value: (cr / sum) * dayT, className: "bg-emerald-500/90" },
  ];
}

function DailyUsageChart({
  daily,
  mode,
  rangeTotals,
  toolbarEnd,
}: {
  daily: DailyBreakdownRow[];
  mode: "tokens" | "cost";
  rangeTotals: UsageTotalsParsed;
  toolbarEnd?: ReactNode;
}) {
  if (daily.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-muted bg-surface-status/40 px-4 py-10 text-center text-sm text-muted-foreground">
        No data for this range.
      </div>
    );
  }

  const isCost = mode === "cost";
  const values = daily.map((d) => dayScalarTotal(d, mode));
  const maxVal = Math.max(...values, isCost ? 0.0001 : 1);
  const nonZero = values.filter((v) => v > 0);
  const minNonZero = nonZero.length > 0 ? Math.min(...nonZero) : maxVal;
  const spread = maxVal / minNonZero;
  const chartH = 160;
  const minBarPx = 6;

  const barHeights = values.map((v) => {
    if (v <= 0) {
      return 0;
    }
    const ratio = spread > 50 ? Math.sqrt(v / maxVal) : v / maxVal;
    return Math.max(minBarPx, ratio * chartH);
  });

  const barMaxW = daily.length > 30 ? 10 : daily.length > 20 ? 14 : daily.length > 14 ? 20 : 28;

  return (
    <div className="rounded-xl border border-border-muted bg-surface-status/80 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {MIX_LEGEND.map((item) => (
            <li key={item.key} className="flex items-center gap-1">
              <span className={cn("size-1.5 shrink-0 rounded-sm", item.className)} aria-hidden />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        {toolbarEnd ? <div className="flex shrink-0 flex-wrap gap-1">{toolbarEnd}</div> : null}
      </div>
      <div className="flex min-h-[208px] items-end justify-start gap-px overflow-x-auto pb-6 pt-1">
        {daily.map((d, idx) => {
          const h = barHeights[idx] ?? 0;
          const label = daily.length > 24 ? d.date.slice(8, 10) : formatShortDate(d.date);
          const colW = Math.min(36, barMaxW + 12);
          const segs = mixSegmentsForDay(d, mode, rangeTotals).filter((s) => s.value > 0);
          const segSum = segs.reduce((a, s) => a + s.value, 0) || 1;
          return (
            <div
              key={d.date}
              className="flex shrink-0 flex-col items-center justify-end gap-1"
              style={{ width: colW }}
              title={`${d.date}: ${isCost ? formatUsageUsd(d.totalCost) : formatUsageTokensCompact(dayScalarTotal(d, "tokens")) + " tokens"}`}
            >
              <div
                className="flex w-full max-w-[32px] flex-col-reverse overflow-hidden rounded-t-sm bg-muted"
                style={{ height: chartH }}
              >
                {h > 0 && segs.length > 0 ? (
                  segs.map((s, si) => (
                    <div
                      key={`${d.date}-${si}`}
                      className={cn("w-full", s.className)}
                      style={{ height: `${(s.value / segSum) * h}px`, minHeight: 2 }}
                    />
                  ))
                ) : h > 0 ? (
                  <div
                    className={cn("w-full rounded-t-sm", isCost ? "bg-amber-500/80" : "bg-primary/70")}
                    style={{ height: h }}
                  />
                ) : null}
              </div>
              <span className="max-w-full truncate text-[10px] tabular-nums text-muted-foreground">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionsTable({
  rows,
  sort,
}: {
  rows: UsageDashboardData["sessions"];
  sort: "tokens" | "cost";
}) {
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const ta = a.totals ?? emptyUsageTotals();
      const tb = b.totals ?? emptyUsageTotals();
      const va = sort === "cost" ? ta.totalCost : ta.totalTokens;
      const vb = sort === "cost" ? tb.totalCost : tb.totalTokens;
      return vb - va;
    });
    return copy;
  }, [rows, sort]);

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">No sessions.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-muted">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border-muted bg-surface-status/90 text-xs text-label">
            <th className="px-3 py-2 font-medium">Session</th>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 text-right font-medium tabular-nums">Tokens</th>
            <th className="px-3 py-2 text-right font-medium tabular-nums">Cost</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const t = s.totals ?? emptyUsageTotals();
            return (
              <tr key={s.key} className="border-b border-border-muted/80 last:border-0 hover:bg-surface-status/50">
                <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-xs" title={s.key}>
                  {s.label}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-2 text-xs text-muted-foreground" title={s.model}>
                  {s.model ?? "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{formatUsageTokensCompact(t.totalTokens)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{formatUsageUsd(t.totalCost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TopModelsTable({ rows }: { rows: UsageDashboardData["byModel"] }) {
  if (rows.length === 0) {
    return null;
  }
  const top = rows.slice(0, 12);
  return (
    <div className="overflow-x-auto rounded-xl border border-border-muted">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border-muted bg-surface-status/90 text-xs text-label">
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 text-right font-medium tabular-nums">Calls</th>
            <th className="px-3 py-2 text-right font-medium tabular-nums">Tokens</th>
            <th className="px-3 py-2 text-right font-medium tabular-nums">Cost</th>
          </tr>
        </thead>
        <tbody>
          {top.map((m, i) => (
            <tr key={`${m.model}-${i}`} className="border-b border-border-muted/80 last:border-0 hover:bg-surface-status/50">
              <td className="max-w-[18rem] truncate px-3 py-2 text-xs" title={m.provider ? `${m.provider} · ${m.model}` : m.model}>
                {m.model}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{m.count}</td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                {formatUsageTokensCompact(m.totals.totalTokens)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{formatUsageUsd(m.totals.totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RangePicker = UsageDateRangePreset | "custom";

export function UsagePanel() {
  const { connected, rpc } = useControlConnection();
  const [startDate, setStartDate] = useState(() => localDateRangeForPreset("today").start);
  const [endDate, setEndDate] = useState(() => localDateRangeForPreset("today").end);
  const [rangePreset, setRangePreset] = useState<RangePicker>("today");
  const [sessionsUsage, setSessionsUsage] = useState<unknown>(null);
  const [costUsage, setCostUsage] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<"tokens" | "cost">("tokens");
  const [sessionSort, setSessionSort] = useState<"tokens" | "cost">("tokens");

  const inputClass =
    "h-7 rounded-md border border-border-input bg-surface-input px-2 text-xs tabular-nums text-foreground";
  const tzLabel = utcOffsetLabelFromBrowser();

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
          limit: SESSIONS_USAGE_LIMIT,
          /** Context weight is for system-prompt breakdown only; keep off so totals match transcript math. */
          includeContextWeight: false,
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

  const applyPreset = useCallback((p: UsageDateRangePreset) => {
    const r = localDateRangeForPreset(p);
    setStartDate(r.start);
    setEndDate(r.end);
    setRangePreset(p);
  }, []);

  useEffect(() => {
    if (!connected) {
      return;
    }
    void load();
  }, [connected, load]);

  const dashboard = useMemo(() => {
    if (sessionsUsage == null) {
      return null;
    }
    return buildUsageDashboard(sessionsUsage, costUsage, { sessionsRequestLimit: SESSIONS_USAGE_LIMIT });
  }, [sessionsUsage, costUsage]);

  if (!connected) {
    return <OpenClawDisconnectedHint />;
  }

  return (
    <div className="w-full max-w-none space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div
            className="inline-flex w-fit flex-wrap gap-0.5 rounded-lg border border-border-muted bg-muted/25 p-0.5 dark:bg-muted/15"
            data-slot="button-group"
            role="group"
            aria-label="Quick range"
          >
            <Button
              type="button"
              size="sm"
              variant={rangePreset === "today" ? "default" : "ghost"}
              className={cn(
                "shadow-none",
                rangePreset !== "today" && "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => applyPreset("today")}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant={rangePreset === "week" ? "default" : "ghost"}
              className={cn(
                "shadow-none",
                rangePreset !== "week" && "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => applyPreset("week")}
            >
              This week
            </Button>
            <Button
              type="button"
              size="sm"
              variant={rangePreset === "month" ? "default" : "ghost"}
              className={cn(
                "shadow-none",
                rangePreset !== "month" && "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => applyPreset("month")}
            >
              This month
            </Button>
          </div>
          <div className="hidden h-6 w-px shrink-0 bg-border sm:block" aria-hidden />
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="usage-start" className="shrink-0 text-xs text-muted-foreground">
                Start
              </label>
              <input
                id="usage-start"
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setRangePreset("custom");
                }}
              />
            </div>
            <span className="hidden text-muted-foreground sm:inline" aria-hidden>
              –
            </span>
            <div className="flex items-center gap-2">
              <label htmlFor="usage-end" className="shrink-0 text-xs text-muted-foreground">
                End
              </label>
              <input
                id="usage-end"
                type="date"
                className={inputClass}
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setRangePreset("custom");
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label="About this data"
              >
                <CircleHelp className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-[18rem] space-y-2 text-xs leading-relaxed">
              <p>
                Loaded via{" "}
                <code className="rounded bg-muted px-1 py-px font-mono text-[0.7rem]">sessions.usage</code> and{" "}
                <code className="rounded bg-muted px-1 py-px font-mono text-[0.7rem]">usage.cost</code>.
              </p>
              <p className="text-muted-foreground">
                Dates use your browser calendar ({tzLabel}). <strong className="font-medium text-foreground">This week</strong> is Monday
                through today.
              </p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={loading}
                aria-label={loading ? "Loading" : "Reload from gateway"}
                onClick={() => void load()}
              >
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              {loading ? "Loading…" : "Reload now (same range)"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-err-border bg-surface-status px-3 py-2 text-sm text-err-text">{error}</p>
      ) : null}

      {loading && dashboard == null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-border-muted bg-surface-status/60"
            />
          ))}
        </div>
      ) : null}

      {dashboard ? (
        <>
          <section className="space-y-2.5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CtlMetricCard
                icon={Sparkles}
                value={formatUsageTokensCompact(dashboard.totals.totalTokens)}
                label="Total tokens"
                hint={dashboard.sessionsLimitHint ? `≤${SESSIONS_USAGE_LIMIT} sessions` : undefined}
                change={dashboard.sessionsLimitHint ? "capped" : undefined}
                changeTone={dashboard.sessionsLimitHint ? "warning" : "muted"}
              />
              <CtlMetricCard
                icon={Coins}
                value={formatUsageUsd(dashboard.totals.totalCost)}
                label="Est. cost"
                hint={
                  dashboard.totals.missingCostEntries > 0
                    ? `${dashboard.totals.missingCostEntries} without cost`
                    : undefined
                }
                change={dashboard.totals.missingCostEntries > 0 ? "gaps" : undefined}
                changeTone={dashboard.totals.missingCostEntries > 0 ? "warning" : "muted"}
              />
              <CtlMetricCard icon={Layers} value={dashboard.sessions.length} label="Sessions" />
              <CtlMetricCard
                icon={MessageSquare}
                value={dashboard.aggregates?.messagesTotal ?? "—"}
                label="Messages"
              />
            </div>
          </section>

          <section>
            <DailyUsageChart
              daily={dashboard.daily}
              mode={chartMode}
              rangeTotals={dashboard.totals}
              toolbarEnd={
                <>
                  <Button
                    type="button"
                    size="xs"
                    variant={chartMode === "tokens" ? "default" : "outline"}
                    onClick={() => setChartMode("tokens")}
                  >
                    Tokens
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={chartMode === "cost" ? "default" : "outline"}
                    onClick={() => setChartMode("cost")}
                  >
                    Cost
                  </Button>
                </>
              }
            />
          </section>

          <div
            className={cn(
              "grid gap-6 xl:items-start",
              dashboard.byModel.length > 0 ? "xl:grid-cols-2" : "",
            )}
          >
            {dashboard.byModel.length > 0 ? (
              <section className="min-w-0 space-y-2.5">
                <CtlSectionHeader label="Top models" />
                <TopModelsTable rows={dashboard.byModel} />
              </section>
            ) : null}
            <section className="min-w-0 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CtlSectionHeader label="Sessions" />
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant={sessionSort === "tokens" ? "default" : "outline"}
                    onClick={() => setSessionSort("tokens")}
                  >
                    By tokens
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={sessionSort === "cost" ? "default" : "outline"}
                    onClick={() => setSessionSort("cost")}
                  >
                    By cost
                  </Button>
                </div>
              </div>
              <SessionsTable rows={dashboard.sessions} sort={sessionSort} />
            </section>
          </div>

          <section className="space-y-2">
            <details className="group rounded-xl border border-border-muted bg-surface-status/50">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-label [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  <BarChart3 className="size-3.5" aria-hidden />
                  Raw JSON
                </span>
              </summary>
              <div className="space-y-3 border-t border-border-muted p-3">
                <JsonPreview value={sessionsUsage} maxHeightClassName="max-h-48" />
                <JsonPreview value={costUsage} maxHeightClassName="max-h-48" />
              </div>
            </details>
          </section>
        </>
      ) : sessionsUsage != null && dashboard == null && !loading && !error ? (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-surface-status px-3 py-2 text-sm">
          <p className="text-amber-800 dark:text-amber-200">Unrecognized response.</p>
          <JsonPreview value={sessionsUsage} maxHeightClassName="max-h-40" />
        </div>
      ) : !loading && !error && sessionsUsage == null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}
    </div>
  );
}
