import type { BudgetCategoryRow } from "@/lib/finance/categories-budget-core";

/**
 * How a budget line behaves in totals and charts. Export uses free-form `type` strings.
 */
export type BudgetCashflowKind = "income" | "expense";

/**
 * Classify a category `type` for rollup KPIs. Non-income strings are treated as outflows
 * (expenses, transfers-as-spend, etc.) so we do not sum salary with rent as one "planned" pool.
 */
export function budgetCategoryCashflowKind(type: string): BudgetCashflowKind {
  const t = type.trim().toLowerCase();
  if (
    t === "income" ||
    t.includes("income") ||
    t === "inflow" ||
    t === "credit" ||
    t === "deposit"
  ) {
    return "income";
  }
  return "expense";
}

export type BudgetCashflowTotals = {
  plannedExpense: number;
  plannedIncome: number;
  spentExpense: number;
  spentIncome: number;
  remainingAll: number;
  pendingAll: number;
  categoryCount: number;
};

export function sumBudgetCashflowTotals(rows: BudgetCategoryRow[]): BudgetCashflowTotals {
  let plannedExpense = 0;
  let plannedIncome = 0;
  let spentExpense = 0;
  let spentIncome = 0;
  let remainingAll = 0;
  let pendingAll = 0;
  for (const r of rows) {
    const k = budgetCategoryCashflowKind(r.type);
    if (k === "income") {
      plannedIncome += r.planned;
      spentIncome += r.spent;
    } else {
      plannedExpense += r.planned;
      spentExpense += r.spent;
    }
    remainingAll += r.remaining;
    pendingAll += r.pending;
  }
  return {
    plannedExpense,
    plannedIncome,
    spentExpense,
    spentIncome,
    remainingAll,
    pendingAll,
    categoryCount: rows.length,
  };
}
