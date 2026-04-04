import type { Metadata } from "next";
import { AgentsPanel } from "@/components/openclaw/agents-panel";

export const metadata: Metadata = {
  title: "Agents",
};

export default function AgentsPage() {
  return <AgentsPanel />;
}
