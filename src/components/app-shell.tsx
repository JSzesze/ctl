"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { CtlCommandPalette } from "@/components/ctl-command-palette";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openCtlCommandPalette } from "@/lib/ctl-command-palette";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullWidth =
    pathname === "/" ||
    pathname === "/config" ||
    pathname.startsWith("/config/") ||
    pathname === "/agents" ||
    pathname === "/skills" ||
    pathname === "/usage";
  const immersive = pathname === "/chat";
  /** Full-height flex column, no outer scroll — page owns the viewport (e.g. agents / skills editors). */
  const studio = pathname === "/agents" || pathname === "/skills";

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <CtlCommandPalette />
        <AppSidebar />
        <SidebarInset className="max-h-svh overflow-hidden">
          {!immersive && (
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
              <div className="flex min-w-0 items-center gap-2">
                <SidebarTrigger className="-ml-1 shrink-0" />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label="Jump to page"
                    onClick={() => openCtlCommandPalette()}
                  >
                    <Search className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Jump to page · ⌘K</TooltipContent>
              </Tooltip>
            </header>
          )}
          <div
            className={
              immersive || studio
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : fullWidth
                  ? "min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-10 pt-5 sm:px-6 lg:px-8"
                  : "mx-auto min-h-0 w-full max-w-[56rem] flex-1 overflow-y-auto overscroll-y-contain px-5 pb-10 pt-5"
            }
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
