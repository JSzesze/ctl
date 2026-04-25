/**
 * Canonical in-app destinations for the command palette and quick links.
 * (Inspired by TenacitOS dock / global nav, scoped to CTL routes.)
 */
export type CtlNavRoute = {
  href: string;
  label: string;
  /** Extra tokens matched by the command palette (lowercased). */
  keywords: string[];
  group: "Command" | "OpenClaw" | "Integrations";
};

export const CTL_NAV_ROUTES: CtlNavRoute[] = [
  { href: "/", label: "Today", keywords: ["home", "dashboard", "start"], group: "Command" },
  { href: "/projects", label: "Projects", keywords: ["kanban", "work"], group: "Command" },
  { href: "/meetings", label: "Meetings", keywords: ["calendar", "video"], group: "Command" },
  { href: "/radar", label: "Radar", keywords: ["scan", "watch"], group: "Command" },
  {
    href: "/finance",
    label: "Finance",
    keywords: ["budget", "money", "transactions", "0budget", "categorization", "uncategorized"],
    group: "Command",
  },
  { href: "/chat", label: "Chat", keywords: ["message", "openclaw"], group: "OpenClaw" },
  {
    href: "/agents",
    label: "Agents",
    keywords: ["workspace", "files", "AGENTS.md", "memory"],
    group: "OpenClaw",
  },
  {
    href: "/skills",
    label: "Skills",
    keywords: ["skill", "SKILL.md", "openclaw", "workspace", "clawhub"],
    group: "OpenClaw",
  },
  { href: "/usage", label: "Usage", keywords: ["cost", "sessions", "metrics"], group: "OpenClaw" },
  { href: "/automation", label: "Automation", keywords: ["cron", "schedule"], group: "OpenClaw" },
  { href: "/environment", label: "Environment", keywords: ["config", "gateway"], group: "OpenClaw" },
  { href: "/config", label: "Config", keywords: ["connect", "token", "settings"], group: "OpenClaw" },
  {
    href: "/integrations/transcribe",
    label: "Transcribe",
    keywords: ["audio", "documents", "integration", "local", "debug", "gateway", "agents"],
    group: "Integrations",
  },
];
