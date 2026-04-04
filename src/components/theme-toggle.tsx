"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import type { ThemePreference } from "@/lib/theme-preference";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const CYCLE: ThemePreference[] = ["system", "light", "dark"];

export function ThemeToggle({
  variant = "default",
}: {
  variant?: "default" | "sidebar";
}) {
  const { preference, setPreference, ready } = useTheme();

  const isSidebar = variant === "sidebar";

  return (
    <label
      className={cn(
        "flex items-center gap-1.5 text-xs",
        isSidebar ? "text-sidebar-foreground/80" : "text-muted-foreground",
      )}
    >
      <span className="whitespace-nowrap">Theme</span>
      <select
        className={cn(
          "cursor-pointer rounded-md border px-1.5 py-1 text-[0.8rem] disabled:opacity-50",
          isSidebar
            ? "border-sidebar-border bg-sidebar-accent text-sidebar-foreground"
            : "border-border-input bg-surface-input text-foreground",
        )}
        value={preference}
        disabled={!ready}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "dark" || v === "light" || v === "system") {
            setPreference(v);
          }
        }}
        aria-label="Color theme"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Compact control for narrow sidebars (e.g. icon-collapsed rail). */
export function ThemeCycleIconButton() {
  const { preference, setPreference, ready } = useTheme();

  const cycle = () => {
    const i = CYCLE.indexOf(preference);
    setPreference(CYCLE[(i + 1) % CYCLE.length]!);
  };

  const label = OPTIONS.find((o) => o.value === preference)?.label ?? "Theme";

  const Icon = preference === "dark" ? Moon : preference === "light" ? Sun : Monitor;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          disabled={!ready}
          onClick={cycle}
          aria-label={`Theme: ${label}. Click to cycle.`}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        Theme: {label} (click to cycle)
      </TooltipContent>
    </Tooltip>
  );
}
