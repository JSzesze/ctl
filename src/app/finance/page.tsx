import type { Metadata } from "next";
import { CtlSectionHeader } from "@/components/ctl-section-header";
import { CtlViewShell } from "@/components/ctl-view-shell";
import { BudgetCategoriesTable } from "@/components/finance/budget-categories-table";
import { UncategorizedTransactionsTable } from "@/components/finance/uncategorized-transactions-table";
import { loadCategoriesBudget } from "@/lib/finance/categories-budget";
import { loadCategorizationPlan, uncategorizedFromPlan } from "@/lib/finance/categorization-plan";

export const metadata: Metadata = {
  title: "Finance",
};

/** Always read the latest files from disk (local 0budget workflow). */
export const dynamic = "force-dynamic";

function FileErrorCard({
  title,
  message,
  path,
}: {
  title: string;
  message: string;
  path: string;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-status/40 px-4 py-3 text-sm">
      <p className="font-medium text-heading">{title}</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
      <p className="mt-2 font-mono text-xs text-muted-foreground break-all">{path}</p>
    </div>
  );
}

export default async function FinancePage() {
  const [planLoaded, categoriesLoaded] = await Promise.all([
    loadCategorizationPlan(),
    loadCategoriesBudget(),
  ]);

  const uncategorizedCount =
    planLoaded.ok ? uncategorizedFromPlan(planLoaded.plan).length : 0;

  return (
    <CtlViewShell
      title="Finance"
      lede="Budget and categorization plan from your 0budget folder; reloads on each visit."
    >
      <div className="w-full max-w-none space-y-8">
        <section className="space-y-2.5">
          <CtlSectionHeader label="Budget & categories" />
          {!categoriesLoaded.ok ? (
            <FileErrorCard
              title="Could not load categories.json"
              message={categoriesLoaded.error}
              path={categoriesLoaded.path}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{categoriesLoaded.budget.month}</span>
                  <span className="text-border-muted"> · </span>
                  <span className="font-mono tabular-nums">{categoriesLoaded.budget.monthKey}</span>
                </span>
                <span className="text-border-muted">·</span>
                <span>
                  <span className="font-medium text-foreground tabular-nums">
                    {categoriesLoaded.budget.categories.length}
                  </span>{" "}
                  categories
                  <span className="text-border-muted"> · </span>
                  <span className="font-medium text-foreground tabular-nums">
                    {categoriesLoaded.budget.groups.length}
                  </span>{" "}
                  groups
                  <span className="text-border-muted"> · </span>
                  <span className="tabular-nums">totalCategories: {categoriesLoaded.budget.totalCategories}</span>
                </span>
              </div>
              <p className="font-mono text-[0.65rem] text-muted-foreground/80 break-all">{categoriesLoaded.path}</p>
              <BudgetCategoriesTable
                rows={categoriesLoaded.budget.categories}
                groupOrder={categoriesLoaded.budget.groups}
              />
            </>
          )}
        </section>

        <section className="space-y-2.5">
          <CtlSectionHeader label="Transactions" />
          {!planLoaded.ok ? (
            <FileErrorCard
              title="Could not load categorization_plan.json"
              message={planLoaded.error}
              path={planLoaded.path}
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {planLoaded.plan.transactions.length}
                </span>{" "}
                transactions
                <span className="text-border-muted"> · </span>
                <span className="font-medium text-foreground tabular-nums">{uncategorizedCount}</span>{" "}
                uncategorized
              </p>
              <UncategorizedTransactionsTable
                rows={planLoaded.plan.transactions}
                categoryOptions={
                  categoriesLoaded.ok
                    ? [...categoriesLoaded.budget.categories]
                        .sort(
                          (a, b) =>
                            a.group.localeCompare(b.group) || a.name.localeCompare(b.name),
                        )
                        .map((c) => ({ name: c.name, group: c.group }))
                    : null
                }
              />
              <details className="rounded-xl border border-border-muted bg-surface-status/50">
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-label [&::-webkit-details-marker]:hidden">
                  Plan file &amp; instructions
                </summary>
                <div className="space-y-2 border-t border-border-muted px-3 pb-3 pt-2 text-xs text-muted-foreground">
                  <p className="font-mono text-[0.65rem] break-all">{planLoaded.path}</p>
                  <p>
                    Generated{" "}
                    <time className="tabular-nums text-foreground" dateTime={planLoaded.plan.generatedAt}>
                      {planLoaded.plan.generatedAt}
                    </time>
                  </p>
                  <p className="leading-relaxed">{planLoaded.plan.instructions}</p>
                </div>
              </details>
            </>
          )}
        </section>
      </div>
    </CtlViewShell>
  );
}
