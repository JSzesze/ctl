"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Binary,
  Bot,
  CalendarDays,
  Command,
  FolderKanban,
  Library,
  MessageSquare,
  Mic,
  ScanLine,
  Settings2,
  Timer,
  Video,
} from "lucide-react";
import { useControlConnection } from "@/components/control-provider";
import { ThemeCycleIconButton, ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PRIMARY: Array<{ href: string; label: string; icon: typeof CalendarDays }> = [
  { href: "/", label: "Today", icon: CalendarDays },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/radar", label: "Radar", icon: ScanLine },
];

const INTEGRATIONS: Array<{ href: string; label: string; icon: typeof Mic }> = [
  { href: "/integrations/transcribe", label: "Transcribe", icon: Mic },
];

const OPENCLAW: Array<{ href: string; label: string; icon: typeof MessageSquare }> = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/skills", label: "Skills", icon: Library },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/automation", label: "Automation", icon: Timer },
  { href: "/environment", label: "Environment", icon: Binary },
  { href: "/config", label: "Config", icon: Settings2 },
];

function pathActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarStatusAndTheme() {
  const { connected, hydrated } = useControlConnection();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const statusDot = hydrated ? (
    <span
      className={`text-sm tabular-nums ${connected ? "text-emerald-500" : "text-sidebar-foreground/45"}`}
      aria-hidden
    >
      {connected ? "●" : "○"}
    </span>
  ) : null;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        {hydrated ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
                aria-label={connected ? "Gateway connected" : "Gateway offline"}
              >
                {statusDot}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              {connected ? "Gateway connected" : "Gateway offline"}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <ThemeCycleIconButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-xs text-sidebar-foreground/60">Gateway</span>
        {hydrated ? (
          <span
            className={`text-xs tabular-nums ${connected ? "text-emerald-500" : "text-sidebar-foreground/50"}`}
            title={connected ? "Connected" : "Disconnected"}
          >
            {connected ? "● live" : "○ offline"}
          </span>
        ) : (
          <span className="text-xs text-sidebar-foreground/40">…</span>
        )}
      </div>
      <ThemeToggle variant="sidebar" />
      <p className="text-[0.65rem] leading-snug text-sidebar-foreground/60">
        <span className="font-mono text-[0.6rem]">⌘B</span>
        <span className="mx-1 text-sidebar-foreground/40">·</span>
        <span className="font-mono text-[0.6rem]">Ctrl+B</span>
        <span className="ml-1.5">toggle sidebar</span>
      </p>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={{ children: "CTL · Today" }}>
              <Link href="/">
                <Command className="text-sidebar-primary" />
                <span className="font-semibold tracking-tight">CTL</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Command</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PRIMARY.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathActive(pathname, item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Integrations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {INTEGRATIONS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathActive(pathname, item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>OpenClaw</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {OPENCLAW.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathActive(pathname, item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarStatusAndTheme />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
