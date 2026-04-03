"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useControl } from "@/components/control-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const PRIMARY: Array<{ href: string; label: string }> = [
  { href: "/", label: "Today" },
  { href: "/projects", label: "Projects" },
  { href: "/meetings", label: "Meetings" },
  { href: "/radar", label: "Radar" },
];

const UTIL: Array<{ href: string; label: string }> = [
  { href: "/chat", label: "Chat" },
  { href: "/config", label: "Config" },
];

function navLinkClass(pathname: string, href: string): string {
  const base = "no-underline hover:text-nav-hover";
  const active =
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return active
    ? `text-nav-active underline decoration-1 underline-offset-[0.2em] ${base}`
    : `text-nav ${base}`;
}

export function AppNav() {
  const pathname = usePathname();
  const { connected, hydrated } = useControl();

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border bg-surface-nav px-5 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
        <span className="shrink-0 text-[0.95rem] font-semibold tracking-tight text-brand">CTL</span>
        <span className="hidden text-xs text-muted sm:inline" aria-hidden="true">
          ·
        </span>
        <span className="text-[0.7rem] font-normal uppercase tracking-wider text-muted sm:text-xs sm:normal-case sm:tracking-normal">
          command station
        </span>
      </div>
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Primary">
        {PRIMARY.map((item, i) => (
          <span key={item.href} className="flex items-center gap-x-2">
            {i > 0 ? (
              <span className="select-none text-muted" aria-hidden="true">
                ·
              </span>
            ) : null}
            <Link href={item.href} className={navLinkClass(pathname, item.href)}>
              {item.label}
            </Link>
          </span>
        ))}
      </nav>
      <span className="hidden h-4 w-px bg-border-muted sm:block" aria-hidden="true" />
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="OpenClaw">
        {UTIL.map((item, i) => (
          <span key={item.href} className="flex items-center gap-x-2">
            {i > 0 ? (
              <span className="select-none text-muted" aria-hidden="true">
                ·
              </span>
            ) : null}
            <Link href={item.href} className={navLinkClass(pathname, item.href)}>
              {item.label}
            </Link>
          </span>
        ))}
      </nav>
      <div className="ml-auto flex max-[520px]:ml-0 max-[520px]:w-full max-[520px]:justify-end flex-wrap items-center gap-x-4 gap-y-2">
        {hydrated ? (
          <span
            className={`text-xs tabular-nums ${connected ? "text-status-on" : "text-status-off"}`}
            title={connected ? "Gateway connected" : "Gateway offline"}
          >
            {connected ? "● live" : "○ offline"}
          </span>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
