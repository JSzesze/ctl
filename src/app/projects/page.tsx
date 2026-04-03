import type { Metadata } from "next";
import Link from "next/link";
import { CtlEmptyPanel } from "@/components/ctl-empty-panel";
import { CtlViewShell } from "@/components/ctl-view-shell";

export const metadata: Metadata = {
  title: "Projects",
};

export default function ProjectsPage() {
  return (
    <CtlViewShell
      title="Projects"
      lede="See what’s active, what’s blocked, and what needs a nudge. OpenClaw holds projects and goals; CTL is where you steer them—without replacing your source systems."
    >
      <CtlEmptyPanel
        title="Nothing wired yet"
        body="When OpenClaw is connected, active projects and goals will show here so you can decide what gets attention today."
        footnote={
          <>
            Gateway and session setup:{" "}
            <Link href="/config" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
              Config
            </Link>
            .
          </>
        }
      />
    </CtlViewShell>
  );
}
