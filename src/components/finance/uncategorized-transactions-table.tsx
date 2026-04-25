"use client";

import { useMemo } from "react";
import {
  TransactionProposedSelect,
  type CategoryOption,
} from "@/components/finance/transaction-proposed-select";
import {
  formatUsdAmount,
  type CategorizationPlanTransaction,
} from "@/lib/finance/categorization-plan-core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type UncategorizedTransactionsTableProps = {
  rows: CategorizationPlanTransaction[];
  categoryOptions: CategoryOption[] | null;
  /** Optional class on the scroll/overflow wrapper (e.g. `h-full max-h-none`). */
  scrollAreaClassName?: string;
};

const NO_ACCOUNT_KEY = "__none__";
const TAB_ALL = "all";

function accountTabValue(accountKey: string): string {
  return `account:${accountKey}`;
}

function partitionByAccount(
  rows: CategorizationPlanTransaction[],
): Array<{ accountKey: string; label: string; rows: CategorizationPlanTransaction[] }> {
  const map = new Map<string, CategorizationPlanTransaction[]>();
  for (const r of rows) {
    const raw = (r.account ?? "").trim();
    const key = raw === "" ? NO_ACCOUNT_KEY : raw;
    const list = map.get(key);
    if (list) {
      list.push(r);
    } else {
      map.set(key, [r]);
    }
  }
  const entries = [...map.entries()];
  entries.sort(([a], [b]) => {
    if (a === NO_ACCOUNT_KEY) return 1;
    if (b === NO_ACCOUNT_KEY) return -1;
    return a.localeCompare(b);
  });
  return entries.map(([k, rowList]) => ({
    accountKey: k,
    label: k === NO_ACCOUNT_KEY ? "No account" : k,
    rows: rowList,
  }));
}

const defaultScroll = "max-h-[min(72vh,720px)]";

type SingleAccountTableProps = {
  rows: CategorizationPlanTransaction[];
  categoryOptions: CategoryOption[] | null;
  scrollAreaClassName?: string;
};

function SingleAccountTable({ rows, categoryOptions, scrollAreaClassName }: SingleAccountTableProps) {
  return (
    <div
      className={cn(
        "overflow-x-auto overflow-y-auto rounded-xl border border-border-muted",
        scrollAreaClassName ?? defaultScroll,
      )}
    >
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border-muted bg-surface-status/90 text-xs text-label">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Merchant</th>
            <th className="px-3 py-2 text-right font-medium tabular-nums">Amount</th>
            <th className="px-3 py-2 font-medium">Pending</th>
            <th className="min-w-[10rem] px-3 py-2 font-medium">Notes</th>
            <th className="min-w-[14rem] px-3 py-2 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border-muted/80 last:border-0 hover:bg-surface-status/50"
            >
              <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                {row.date}
              </td>
              <td className="max-w-[14rem] truncate px-3 py-2 text-xs" title={row.merchant}>
                {row.merchant}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                {formatUsdAmount(row.amount)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                {row.isPending ? "Yes" : "No"}
              </td>
              <td className="max-w-[16rem] px-3 py-2 text-xs">
                <span
                  className="line-clamp-2 text-muted-foreground"
                  title={row.notes ?? ""}
                >
                  {row.notes ?? "—"}
                </span>
              </td>
              <td className="px-3 py-2 align-middle">
                <TransactionProposedSelect
                  transactionId={row.id}
                  initialProposed={row.proposedCategory}
                  categoryOptions={categoryOptions}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllTransactionsTable({
  rows,
  categoryOptions,
  scrollAreaClassName,
}: SingleAccountTableProps) {
  return (
    <div
      className={cn(
        "overflow-x-auto overflow-y-auto rounded-xl border border-border-muted",
        scrollAreaClassName ?? defaultScroll,
      )}
    >
      <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border-muted bg-surface-status/90 text-xs text-label">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Merchant</th>
            <th className="px-3 py-2 font-medium">Account</th>
            <th className="px-3 py-2 text-right font-medium tabular-nums">Amount</th>
            <th className="px-3 py-2 font-medium">Pending</th>
            <th className="min-w-[10rem] px-3 py-2 font-medium">Notes</th>
            <th className="min-w-[14rem] px-3 py-2 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border-muted/80 last:border-0 hover:bg-surface-status/50"
            >
              <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                {row.date}
              </td>
              <td className="max-w-[14rem] truncate px-3 py-2 text-xs" title={row.merchant}>
                {row.merchant}
              </td>
              <td
                className={cn(
                  "max-w-[12rem] truncate px-3 py-2 text-xs",
                  row.account ? "text-foreground" : "text-muted-foreground",
                )}
                title={row.account ?? ""}
              >
                {row.account ?? "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                {formatUsdAmount(row.amount)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                {row.isPending ? "Yes" : "No"}
              </td>
              <td className="max-w-[16rem] px-3 py-2 text-xs">
                <span
                  className="line-clamp-2 text-muted-foreground"
                  title={row.notes ?? ""}
                >
                  {row.notes ?? "—"}
                </span>
              </td>
              <td className="px-3 py-2 align-middle">
                <TransactionProposedSelect
                  transactionId={row.id}
                  initialProposed={row.proposedCategory}
                  categoryOptions={categoryOptions}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UncategorizedTransactionsTable({
  rows,
  categoryOptions,
  scrollAreaClassName,
}: UncategorizedTransactionsTableProps) {
  const byAccount = useMemo(() => partitionByAccount(rows), [rows]);

  const scrollClass = scrollAreaClassName ?? defaultScroll;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No transactions in the categorization plan.</p>
    );
  }

  return (
    <Tabs defaultValue={TAB_ALL} className="w-full gap-0">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <TabsList
          aria-label="Transaction scope"
          className="inline-flex h-8 max-w-full flex-wrap justify-end gap-0.5 rounded-lg border border-border-muted bg-muted/40 p-0.5 shadow-sm"
        >
          <TabsTrigger
            value={TAB_ALL}
            className="rounded-md px-2.5 py-1 text-[11px] data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            All
          </TabsTrigger>
          {byAccount.map((g) => (
            <TabsTrigger
              key={g.accountKey}
              value={accountTabValue(g.accountKey)}
              className="max-w-[12rem] truncate rounded-md px-2.5 py-1 text-[11px] data-[state=active]:bg-background data-[state=active]:shadow-sm"
              title={g.label}
            >
              {g.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value={TAB_ALL} className="mt-0">
        <AllTransactionsTable
          rows={rows}
          categoryOptions={categoryOptions}
          scrollAreaClassName={scrollClass}
        />
      </TabsContent>
      {byAccount.map((g) => (
        <TabsContent key={g.accountKey} value={accountTabValue(g.accountKey)} className="mt-0 space-y-2">
          <p className="text-xs tabular-nums text-muted-foreground">
            {g.rows.length} transaction{g.rows.length === 1 ? "" : "s"}
          </p>
          <SingleAccountTable
            rows={g.rows}
            categoryOptions={categoryOptions}
            scrollAreaClassName={scrollClass}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
