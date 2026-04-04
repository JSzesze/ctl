"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CTL_NAV_ROUTES } from "@/config/ctl-nav-routes";
import { CTL_OPEN_COMMAND_PALETTE_EVENT } from "@/lib/ctl-command-palette";
import { cn } from "@/lib/utils";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function matchesRoute(q: string, route: (typeof CTL_NAV_ROUTES)[number]): boolean {
  if (!q) {
    return true;
  }
  const n = normalize(q);
  if (normalize(route.label).includes(n)) {
    return true;
  }
  if (normalize(route.href).includes(n.replace(/^\/+/, ""))) {
    return true;
  }
  return route.keywords.some((k) => k.includes(n) || n.includes(k));
}

export function CtlCommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return CTL_NAV_ROUTES.filter((r) => matchesRoute(query, r));
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelected(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      router.push(href);
      close();
    },
    [router, close],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        setSelected(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const openFromUi = () => setOpen(true);
    window.addEventListener(CTL_OPEN_COMMAND_PALETTE_EVENT, openFromUi);
    return () => window.removeEventListener(CTL_OPEN_COMMAND_PALETTE_EVENT, openFromUi);
  }, []);

  useEffect(() => {
    if (open) {
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selected]) {
        e.preventDefault();
        go(filtered[selected].href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, selected, go]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[min(20vh,8rem)] backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          close();
        }
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
        role="dialog"
        aria-label="Go to page"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Jump to…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-autocomplete="list"
            aria-controls="ctl-command-list"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            esc
          </kbd>
        </div>
        <ul id="ctl-command-list" className="max-h-[min(50vh,20rem)] overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No matches.</li>
          ) : (
            filtered.map((route, i) => {
              const active = pathname === route.href || (route.href !== "/" && pathname.startsWith(`${route.href}/`));
              const sel = i === selected;
              return (
                <li key={route.href} role="option" aria-selected={sel}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                      sel ? "bg-accent text-accent-foreground" : "hover:bg-muted/80",
                    )}
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => go(route.href)}
                  >
                    <span className="w-24 shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {route.group}
                    </span>
                    <span className="flex-1 font-medium">{route.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{route.href}</span>
                    {active ? (
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">here</span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          TenacitOS-style jump menu · <kbd className="rounded bg-muted px-1 font-mono">⌘K</kbd> /{" "}
          <kbd className="rounded bg-muted px-1 font-mono">Ctrl+K</kbd>
        </p>
      </div>
    </div>
  );
}
