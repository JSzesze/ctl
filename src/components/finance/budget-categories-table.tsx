import type { BudgetCategoryRow } from "@/lib/finance/categories-budget-core";
import { BudgetGroupsOverview } from "@/components/finance/budget-groups-overview";

type BudgetCategoriesTableProps = {
  rows: BudgetCategoryRow[];
  /** Order of groups as in categories.json; categories are grouped and listed in this order. */
  groupOrder?: string[];
};

export function BudgetCategoriesTable({ rows, groupOrder }: BudgetCategoriesTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No categories in this budget file.</p>
    );
  }

  return <BudgetGroupsOverview rows={rows} groupOrder={groupOrder} />;
}
