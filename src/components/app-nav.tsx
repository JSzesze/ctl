"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useControl } from "@/components/control-provider";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppNav() {
  const pathname = usePathname();
  const { connected, hydrated } = useControl();

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border bg-surface-nav px-5 py-2.5">
      <span className="text-[0.95rem] font-semibold text-brand">OpenClaw control</span>
      <nav className="flex items-center gap-2 text-sm" aria-label="Main">
        <Link
          href="/"
          className={
            pathname === "/"
              ? "text-nav-active underline decoration-1 underline-offset-[0.2em]"
              : "text-nav no-underline hover:text-nav-hover"
          }
        >
          Chat
        </Link>
        <span className="select-none text-muted" aria-hidden="true">
          ·
        </span>
        <Link
          href="/config"
          className={
            pathname === "/config"
              ? "text-nav-active underline decoration-1 underline-offset-[0.2em]"
              : "text-nav no-underline hover:text-nav-hover"
          }
        >
          Config
        </Link>
      </nav>
      <div className="ml-auto flex max-[520px]:ml-0 max-[520px]:w-full max-[520px]:justify-end flex-wrap items-center gap-x-4 gap-y-2">
        {hydrated ? (
          <span
            className={`text-xs tabular-nums ${connected ? "text-status-on" : "text-status-off"}`}
            title={connected ? "Connected" : "Disconnected"}
          >
            {connected ? "● live" : "○ offline"}
          </span>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
