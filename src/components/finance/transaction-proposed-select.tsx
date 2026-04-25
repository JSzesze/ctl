"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTransactionProposedCategory } from "@/app/finance/actions";
import { cn } from "@/lib/utils";

export type CategoryOption = { name: string; group: string };

/** Value for null / uncategorized in the select (Radix requires non-empty item values). */
const EMPTY_VALUE = "__proposed_empty__";

function toSelectValue(v: string | null): string {
  if (v == null || v.trim() === "") {
    return EMPTY_VALUE;
  }
  return v;
}

function fromSelectValue(v: string): string | null {
  if (v === EMPTY_VALUE) {
    return null;
  }
  return v;
}

type TransactionProposedSelectProps = {
  transactionId: string;
  initialProposed: string | null;
  categoryOptions: CategoryOption[] | null;
};

/** Radix Select (portaled, scrollable) so the list works inside virtualized grids; native selects are often clipped. */
export function TransactionProposedSelect({
  transactionId,
  initialProposed,
  categoryOptions,
}: TransactionProposedSelectProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [raw, setRaw] = useState<string | null>(initialProposed);
  const [persistError, setPersistError] = useState<string | null>(null);

  useEffect(() => {
    setRaw(initialProposed);
  }, [initialProposed]);

  const selectValue = toSelectValue(raw);

  const options = useMemo((): CategoryOption[] => {
    if (categoryOptions == null) {
      return [];
    }
    const seen = new Set<string>();
    const out: CategoryOption[] = [];
    for (const c of categoryOptions) {
      if (seen.has(c.name)) {
        continue;
      }
      seen.add(c.name);
      out.push(c);
    }
    return out;
  }, [categoryOptions]);

  const budgetNames = useMemo(() => new Set(options.map((c) => c.name)), [options]);

  const orphan =
    raw != null && raw !== "SKIP" && !budgetNames.has(raw) ? raw : null;

  const byGroup = useMemo(() => {
    const m = new Map<string, CategoryOption[]>();
    for (const c of options) {
      const list = m.get(c.group) ?? [];
      list.push(c);
      m.set(c.group, list);
    }
    return m;
  }, [options]);

  const groups = useMemo(
    () => [...byGroup.keys()].sort((a, b) => a.localeCompare(b)),
    [byGroup],
  );

  async function persist(next: string | null) {
    setPersistError(null);
    const prev = raw;
    setRaw(next);
    setSaving(true);
    try {
      const result = await updateTransactionProposedCategory(transactionId, next);
      if (!result.ok) {
        setRaw(prev);
        setPersistError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (categoryOptions == null) {
    return (
      <span className="text-muted-foreground" title="Load categories.json to enable the picker.">
        {raw ?? "—"}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Select
        value={selectValue}
        disabled={saving}
        onValueChange={(v) => {
          void persist(fromSelectValue(v));
        }}
      >
        <SelectTrigger
          size="sm"
          className={cn(
            "h-7 min-w-[13rem] max-w-[20rem] text-xs",
            "data-placeholder:text-muted-foreground",
            saving && "cursor-wait opacity-70",
          )}
          aria-busy={saving}
          aria-label="Proposed category"
        >
          <SelectValue placeholder="Proposed category" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          sideOffset={4}
          className="max-h-[min(320px,55vh)] w-[var(--radix-select-trigger-width)] min-w-[12rem]"
        >
          <SelectGroup>
            <SelectLabel className="text-[0.65rem]">Presets</SelectLabel>
            <SelectItem value={EMPTY_VALUE} className="text-xs">
              — Leave uncategorized (null)
            </SelectItem>
            <SelectItem value="SKIP" className="text-xs">
              SKIP
            </SelectItem>
            {orphan != null ? (
              <SelectItem value={orphan} className="text-xs">
                {`${orphan} (not in budget)`}
              </SelectItem>
            ) : null}
          </SelectGroup>
          {groups.map((g) => (
            <SelectGroup key={g}>
              <SelectLabel className="text-[0.65rem]">{g}</SelectLabel>
              {byGroup.get(g)?.map((c) => (
                <SelectItem key={`${g}:${c.name}`} value={c.name} className="text-xs">
                  {c.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {persistError ? (
        <p className="max-w-[20rem] text-[0.65rem] leading-snug text-red-600 dark:text-red-400" role="alert">
          {persistError}
        </p>
      ) : null}
    </div>
  );
}
