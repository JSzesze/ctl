import type { LucideIcon } from "lucide-react";

type CtlMetricCardProps = {
  icon: LucideIcon;
  value: string | number;
  label: string;
  /** Optional short hint under the label (e.g. last updated). */
  hint?: string;
  change?: string;
  changeTone?: "positive" | "negative" | "warning" | "muted";
};

const toneClass: Record<NonNullable<CtlMetricCardProps["changeTone"]>, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  muted: "text-muted-foreground",
};

/**
 * Compact stat tile (TenacitOS MetricCard-style) using CTL design tokens.
 */
export function CtlMetricCard({
  icon: Icon,
  value,
  label,
  hint,
  change,
  changeTone = "muted",
}: CtlMetricCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-muted bg-surface-status/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        {change ? (
          <span className={`text-[11px] font-semibold tracking-wide ${toneClass[changeTone]}`}>{change}</span>
        ) : null}
      </div>
      <div className="font-mono text-2xl font-bold tabular-nums tracking-tight text-heading">{value}</div>
      <div className="text-xs font-medium text-label">{label}</div>
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
