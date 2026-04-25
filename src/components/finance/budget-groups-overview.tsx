"use client";

import { useMemo } from "react";
import { BarChart3, Table2 } from "lucide-react";
import type { BudgetCategoryRow } from "@/lib/finance/categories-budget-core";
import { formatUsdAmount } from "@/lib/finance/categorization-plan-core";
import { sumBudgetCashflowTotals } from "@/lib/finance/budget-cashflow";
import {
  buildBudgetGroupAggregates,
  type BudgetGroupAggregate,
} from "@/lib/finance/budget-group-aggregates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type BudgetGroupsOverviewProps = {
  rows: BudgetCategoryRow[];
  groupOrder?: string[];
};

function formatAxisAmount(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

function HorizontalPairBar({
  label,
  planned,
  spent,
  scaleMax,
  spentColor,
}: {
  label: string;
  planned: number;
  spent: number;
  scaleMax: number;
  spentColor: string;
}) {
  const p = scaleMax > 0 ? Math.min(100, (Math.max(0, planned) / scaleMax) * 100) : 0;
  const s = scaleMax > 0 ? Math.min(100, (Math.max(0, spent) / scaleMax) * 100) : 0;
  const over = spent > planned && planned >= 0;

  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-2 gap-y-1 text-xs sm:grid-cols-[minmax(0,9rem)_1fr]">
      <div className="truncate pt-0.5 font-medium text-heading" title={label}>
        {label}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[0.65rem] text-muted-foreground">Planned</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted">
            <div
              className="h-full rounded-sm bg-muted-foreground/35"
              style={{ width: `${p}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[0.65rem] text-muted-foreground">Spent</span>
          <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted">
            <div
              className={cn("h-full rounded-sm", over && "ring-1 ring-amber-500/80")}
              style={{
                width: `${s}%`,
                backgroundColor: spentColor,
                opacity: 0.85,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Share of outflow spending by group (expense-type lines only; excludes income). */
function SpentShareStrip({ aggregates }: { aggregates: BudgetGroupAggregate[] }) {
  const totalExpenseSpent = aggregates.reduce((a, g) => a + Math.max(0, g.spentExpense), 0);
  if (totalExpenseSpent <= 0) {
    return (
      <p className="text-[0.7rem] text-muted-foreground">
        No outflow spend to split—add expense lines or check category types.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
        Outflow share by group
      </p>
      <div
        className="flex h-3 w-full overflow-hidden rounded-md ring-1 ring-border-muted"
        role="img"
        aria-label="Share of expense spending by budget group"
      >
        {aggregates.map((g) => {
          const w = (Math.max(0, g.spentExpense) / totalExpenseSpent) * 100;
          if (w <= 0) return null;
          return (
            <div
              key={g.group}
              className="h-full min-w-px"
              style={{ width: `${w}%`, backgroundColor: g.color }}
              title={`${g.group}: ${formatUsdAmount(g.spentExpense)} outflows (${w.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
        {aggregates.map((g) => {
          const pct =
            totalExpenseSpent > 0 ? (Math.max(0, g.spentExpense) / totalExpenseSpent) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <li key={g.group} className="flex items-center gap-1">
              <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} />
              <span className="max-w-[10rem] truncate" title={g.group}>
                {g.group}
              </span>
              <span className="font-mono tabular-nums">{pct.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GroupDetailTable({ aggregates }: { aggregates: BudgetGroupAggregate[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-muted">
      <table className="w-full min-w-[36rem] text-left text-xs">
        <thead className="border-b border-border-muted bg-muted/40">
          <tr>
            <th className="px-2 py-1.5 font-medium text-muted-foreground">Group</th>
            <th className="px-2 py-1.5 font-medium text-muted-foreground">Categories</th>
            <th className="px-2 py-1.5 text-end font-medium text-muted-foreground">Planned</th>
            <th className="px-2 py-1.5 text-end font-medium text-muted-foreground">Spent</th>
            <th className="px-2 py-1.5 text-end font-medium text-muted-foreground">Remaining</th>
            <th className="px-2 py-1.5 text-end font-medium text-muted-foreground">Pending</th>
          </tr>
        </thead>
        <tbody>
          {aggregates.map((g) => (
            <tr key={g.group} className="border-b border-border-muted/60 last:border-0">
              <td className="px-2 py-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: g.color }}
                    aria-hidden
                  />
                  <span className="font-medium text-heading">{g.group}</span>
                </span>
              </td>
              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{g.categoryCount}</td>
              <td className="px-2 py-1.5 text-end font-mono tabular-nums">{formatUsdAmount(g.planned)}</td>
              <td className="px-2 py-1.5 text-end font-mono tabular-nums">{formatUsdAmount(g.spent)}</td>
              <td
                className={cn(
                  "px-2 py-1.5 text-end font-mono tabular-nums",
                  g.remaining < 0 && "text-red-600 dark:text-red-400",
                )}
              >
                {formatUsdAmount(g.remaining)}
              </td>
              <td className="px-2 py-1.5 text-end font-mono tabular-nums text-muted-foreground">
                {formatUsdAmount(g.pending)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BudgetGroupsOverview({ rows, groupOrder }: BudgetGroupsOverviewProps) {
  const aggregates = useMemo(
    () => buildBudgetGroupAggregates(rows, groupOrder),
    [rows, groupOrder],
  );

  const cashflow = useMemo(() => sumBudgetCashflowTotals(rows), [rows]);

  /** Shared X-axis cap for planned vs spent bars (per-group). */
  const barScaleMax = useMemo(() => {
    let m = 1;
    for (const g of aggregates) {
      m = Math.max(m, g.planned, g.spent);
    }
    return m;
  }, [aggregates]);

  return (
    <div className="space-y-4 rounded-xl border border-border-muted bg-surface-status/80 p-4 shadow-sm">
      <Tabs defaultValue="table" className="w-full gap-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-muted pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <BarChart3 className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <h3 className="truncate text-sm font-semibold text-heading">By group</h3>
          </div>
          <TabsList
            aria-label="Budget view"
            className="flex h-8 shrink-0 gap-0.5 rounded-lg border border-border-muted bg-muted/40 p-0.5 shadow-sm"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="table"
                  className="size-7 rounded-md p-0 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  aria-label="Table"
                >
                  <Table2 className="size-3.5" aria-hidden />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Table
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="overview"
                  className="size-7 rounded-md p-0 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  aria-label="Chart"
                >
                  <BarChart3 className="size-3.5" aria-hidden />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Chart
              </TooltipContent>
            </Tooltip>
          </TabsList>
        </div>

        <div className="grid gap-2 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border-muted/80 bg-background/50 px-3 py-2">
            <p className="text-[0.65rem] font-medium text-muted-foreground">Planned outflows</p>
            <p className="font-mono text-base font-semibold tabular-nums text-heading sm:text-lg">
              {formatUsdAmount(cashflow.plannedExpense)}
            </p>
            <p className="mt-0.5 text-[0.6rem] text-muted-foreground">Expense-type lines</p>
          </div>
          <div className="rounded-lg border border-border-muted/80 bg-background/50 px-3 py-2">
            <p className="text-[0.65rem] font-medium text-muted-foreground">Planned inflows</p>
            <p className="font-mono text-base font-semibold tabular-nums text-heading sm:text-lg">
              {formatUsdAmount(cashflow.plannedIncome)}
            </p>
            <p className="mt-0.5 text-[0.6rem] text-muted-foreground">Income-type lines</p>
          </div>
          <div className="rounded-lg border border-border-muted/80 bg-background/50 px-3 py-2">
            <p className="text-[0.65rem] font-medium text-muted-foreground">Spent outflows</p>
            <p className="font-mono text-base font-semibold tabular-nums text-heading sm:text-lg">
              {formatUsdAmount(cashflow.spentExpense)}
            </p>
            <p className="mt-0.5 text-[0.6rem] text-muted-foreground">Expense-type only</p>
          </div>
          <div className="rounded-lg border border-border-muted/80 bg-background/50 px-3 py-2">
            <p className="text-[0.65rem] font-medium text-muted-foreground">Remaining (all)</p>
            <p
              className={cn(
                "font-mono text-base font-semibold tabular-nums sm:text-lg",
                cashflow.remainingAll < 0 ? "text-red-600 dark:text-red-400" : "text-heading",
              )}
            >
              {formatUsdAmount(cashflow.remainingAll)}
            </p>
            <p className="mt-0.5 text-[0.6rem] text-muted-foreground">From file per line</p>
          </div>
        </div>

        <div className="mt-4">
          <TabsContent value="overview" className="mt-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-border-muted pb-2 text-[0.65rem] text-muted-foreground">
              <span>
                Axis scale · max {formatAxisAmount(barScaleMax)} (largest planned or spent in any group)
              </span>
            </div>
            <div
              className="space-y-3"
              role="region"
              aria-label="Planned versus spent by budget group"
            >
              {aggregates.map((g) => (
                <HorizontalPairBar
                  key={g.group}
                  label={g.group}
                  planned={g.planned}
                  spent={g.spent}
                  scaleMax={barScaleMax}
                  spentColor={g.color}
                />
              ))}
            </div>
            <div className="border-t border-border-muted pt-4">
              <SpentShareStrip aggregates={aggregates} />
            </div>
          </TabsContent>
          <TabsContent value="table" className="mt-0">
            <GroupDetailTable aggregates={aggregates} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
