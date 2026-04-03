"use client";

import { useTheme } from "@/components/theme-provider";
import type { ThemePreference } from "@/lib/theme-preference";

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const { preference, setPreference, ready } = useTheme();

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      <span className="whitespace-nowrap">Theme</span>
      <select
        className="cursor-pointer rounded-md border border-border-input bg-surface-input px-1.5 py-1 text-[0.8rem] text-foreground disabled:opacity-50"
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
