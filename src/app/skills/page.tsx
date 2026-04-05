import type { Metadata } from "next";
import { SkillsPanel } from "@/components/openclaw/skills-panel";

export const metadata: Metadata = {
  title: "Skills",
};

export default function SkillsPage() {
  return <SkillsPanel />;
}
