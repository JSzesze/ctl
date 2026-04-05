/** Defensive parsing for `sessions.usage` / `usage.cost` gateway payloads (OpenClaw Control UI shape). */

export type UsageTotalsParsed = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
};

export type DailyBreakdownRow = UsageTotalsParsed & { date: string };

export type SessionUsageRow = {
  key: string;
  label: string;
  model?: string;
  provider?: string;
  totals: UsageTotalsParsed | null;
};

export type ModelUsageRow = {
  model: string;
  provider?: string;
  count: number;
  totals: UsageTotalsParsed;
};

export type UsageDashboardData = {
  sessionsUsageUpdatedAt: number | null;
  costUpdatedAt: number | null;
  startDate: string;
  endDate: string;
  totals: UsageTotalsParsed;
  sessions: SessionUsageRow[];
  /** True when the session list may be capped by the request limit. */
  sessionsLimitHint: boolean;
  daily: DailyBreakdownRow[];
  /** Aggregate message / tool stats when the gateway returns them. */
  aggregates: {
    messagesTotal: number;
    errors: number;
    toolCalls: number;
    toolUnique: number;
  } | null;
  byModel: ModelUsageRow[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function emptyUsageTotals(): UsageTotalsParsed {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    missingCostEntries: 0,
  };
}

export function parseUsageTotalsFromUnknown(v: unknown): UsageTotalsParsed {
  const o = asRecord(v);
  if (!o) {
    return emptyUsageTotals();
  }
  return {
    input: num(o.input),
    output: num(o.output),
    cacheRead: num(o.cacheRead),
    cacheWrite: num(o.cacheWrite),
    totalTokens: num(o.totalTokens),
    totalCost: num(o.totalCost),
    inputCost: num(o.inputCost),
    outputCost: num(o.outputCost),
    cacheReadCost: num(o.cacheReadCost),
    cacheWriteCost: num(o.cacheWriteCost),
    missingCostEntries: num(o.missingCostEntries),
  };
}

function parseSessionEntry(e: unknown): SessionUsageRow | null {
  const o = asRecord(e);
  if (!o) {
    return null;
  }
  const key = typeof o.key === "string" ? o.key : "";
  if (!key) {
    return null;
  }
  const usage = o.usage;
  return {
    key,
    label: typeof o.label === "string" && o.label.trim() ? o.label : key,
    model: typeof o.model === "string" ? o.model : undefined,
    provider: typeof o.provider === "string" ? o.provider : undefined,
    totals: usage == null ? null : parseUsageTotalsFromUnknown(usage),
  };
}

function parseDailyFromCostEntry(d: unknown): DailyBreakdownRow | null {
  const o = asRecord(d);
  if (!o || typeof o.date !== "string") {
    return null;
  }
  const t = parseUsageTotalsFromUnknown(o);
  return { date: o.date, ...t };
}

function parseDailyFromAggEntry(d: unknown): DailyBreakdownRow | null {
  const o = asRecord(d);
  if (!o || typeof o.date !== "string") {
    return null;
  }
  const tokens = num(o.tokens);
  const cost = num(o.cost);
  return {
    date: o.date,
    ...emptyUsageTotals(),
    totalTokens: tokens,
    totalCost: cost,
  };
}

function parseModelRow(m: unknown): ModelUsageRow | null {
  const o = asRecord(m);
  if (!o) {
    return null;
  }
  const model = typeof o.model === "string" ? o.model : "";
  const id = model || (typeof o.provider === "string" ? o.provider : "");
  if (!id) {
    return null;
  }
  return {
    model: model || id,
    provider: typeof o.provider === "string" ? o.provider : undefined,
    count: num(o.count),
    totals: parseUsageTotalsFromUnknown(o.totals),
  };
}

/**
 * Build dashboard rows from raw RPC payloads. Returns null only when `sessionsPayload` is not an object.
 */
export function buildUsageDashboard(
  sessionsPayload: unknown,
  costPayload: unknown,
  options?: { sessionsRequestLimit?: number },
): UsageDashboardData | null {
  const sr = asRecord(sessionsPayload);
  if (!sr) {
    return null;
  }

  const limit = options?.sessionsRequestLimit ?? 500;
  const totals = parseUsageTotalsFromUnknown(sr.totals);
  const sessionsRaw = Array.isArray(sr.sessions) ? sr.sessions : [];
  const sessions = sessionsRaw
    .map(parseSessionEntry)
    .filter((row): row is SessionUsageRow => row != null);

  const agg = asRecord(sr.aggregates);
  let daily: DailyBreakdownRow[] = [];
  const cr = asRecord(costPayload);
  const costDaily = cr && Array.isArray(cr.daily) ? cr.daily : [];

  if (costDaily.length > 0) {
    daily = costDaily.map(parseDailyFromCostEntry).filter((row): row is DailyBreakdownRow => row != null);
  } else if (agg && Array.isArray(agg.daily)) {
    daily = agg.daily
      .map(parseDailyFromAggEntry)
      .filter((row): row is DailyBreakdownRow => row != null);
  }

  let aggregates: UsageDashboardData["aggregates"] = null;
  if (agg) {
    const mc = asRecord(agg.messages);
    const tu = asRecord(agg.tools);
    if (mc || tu) {
      aggregates = {
        messagesTotal: mc ? num(mc.total) : 0,
        errors: mc ? num(mc.errors) : 0,
        toolCalls: tu ? num(tu.totalCalls) : 0,
        toolUnique: tu ? num(tu.uniqueTools) : 0,
      };
    }
  }

  let byModel: ModelUsageRow[] = [];
  if (agg && Array.isArray(agg.byModel)) {
    byModel = agg.byModel
      .map(parseModelRow)
      .filter((row): row is ModelUsageRow => row != null)
      .toSorted((a, b) => b.totals.totalTokens - a.totals.totalTokens);
  }

  return {
    sessionsUsageUpdatedAt: typeof sr.updatedAt === "number" ? sr.updatedAt : null,
    costUpdatedAt: cr && typeof cr.updatedAt === "number" ? cr.updatedAt : null,
    startDate: typeof sr.startDate === "string" ? sr.startDate : "",
    endDate: typeof sr.endDate === "string" ? sr.endDate : "",
    totals,
    sessions,
    sessionsLimitHint: sessions.length >= limit,
    daily,
    aggregates,
    byModel,
  };
}

export function formatUsageTokensCompact(n: number): string {
  const v = Math.abs(n);
  if (v >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (v >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return String(Math.round(n));
}

export function formatUsageUsd(n: number): string {
  if (!Number.isFinite(n)) {
    return "—";
  }
  const abs = Math.abs(n);
  if (abs >= 1) {
    return `$${n.toFixed(2)}`;
  }
  if (abs >= 0.01) {
    return `$${n.toFixed(3)}`;
  }
  if (abs === 0) {
    return "$0.00";
  }
  return `$${n.toFixed(4)}`;
}

export function formatShortDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(isoDate)) {
    return isoDate;
  }
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${m}/${d}`;
}
