import type { BudgetCategoryRow } from "@/lib/finance/categories-budget-core";
import { budgetCategoryCashflowKind } from "@/lib/finance/budget-cashflow";

export type BudgetGroupAggregate = {
  group: string;
  categoryCount: number;
  planned: number;
  spent: number;
  /** Spent rolled up from expense-type lines only (excludes income "spent"). */
  spentExpense: number;
  remaining: number;
  pending: number;
  /** Color from the category with the largest planned amount in this group. */
  color: string;
};

function pickGroupColor(catRows: BudgetCategoryRow[]): string {
  if (catRows.length === 0) {
    return "#737373";
  }
  const top = [...catRows].sort((a, b) => b.planned - a.planned)[0];
  const c = top?.color?.trim();
  if (!c) {
    return "#737373";
  }
  if (/^#[0-9a-f]{3,8}$/i.test(c)) {
    return c;
  }
  if (/^(rgb|hsl)a?\(/i.test(c)) {
    return c;
  }
  return "#737373";
}

/**
 * Roll categories up to budget groups, ordered by `groupOrder` when provided,
 * then any remaining groups alphabetically.
 */
export function buildBudgetGroupAggregates(
  rows: BudgetCategoryRow[],
  groupOrder: string[] | undefined,
): BudgetGroupAggregate[] {
  const byGroup = new Map<string, BudgetCategoryRow[]>();
  for (const r of rows) {
    const list = byGroup.get(r.group) ?? [];
    list.push(r);
    byGroup.set(r.group, list);
  }

  const seen = new Set<string>();
  const out: BudgetGroupAggregate[] = [];

  const push = (g: string, catRows: BudgetCategoryRow[]) => {
    let planned = 0;
    let spent = 0;
    let spentExpense = 0;
    let remaining = 0;
    let pending = 0;
    for (const c of catRows) {
      planned += c.planned;
      spent += c.spent;
      if (budgetCategoryCashflowKind(c.type) === "expense") {
        spentExpense += c.spent;
      }
      remaining += c.remaining;
      pending += c.pending;
    }
    out.push({
      group: g,
      categoryCount: catRows.length,
      planned,
      spent,
      spentExpense,
      remaining,
      pending,
      color: pickGroupColor(catRows),
    });
  };

  if (groupOrder?.length) {
    for (const g of groupOrder) {
      const catRows = byGroup.get(g);
      if (catRows?.length) push(g, catRows);
      seen.add(g);
    }
  }

  const rest = [...byGroup.keys()].filter((k) => !seen.has(k)).sort((a, b) => a.localeCompare(b));
  for (const g of rest) {
    const catRows = byGroup.get(g);
    if (catRows?.length) push(g, catRows);
  }

  return out;
}

export function sumBudgetGroupTotals(aggregates: BudgetGroupAggregate[]): {
  planned: number;
  spent: number;
  remaining: number;
  pending: number;
  categoryCount: number;
} {
  let planned = 0;
  let spent = 0;
  let remaining = 0;
  let pending = 0;
  let categoryCount = 0;
  for (const g of aggregates) {
    planned += g.planned;
    spent += g.spent;
    remaining += g.remaining;
    pending += g.pending;
    categoryCount += g.categoryCount;
  }
  return { planned, spent, remaining, pending, categoryCount };
}
