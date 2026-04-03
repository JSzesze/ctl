import type { Metadata } from "next";
import Link from "next/link";
import { CtlEmptyPanel } from "@/components/ctl-empty-panel";
import { CtlViewShell } from "@/components/ctl-view-shell";

export const metadata: Metadata = {
  title: "Today",
};

export default function TodayPage() {
  return (
    <CtlViewShell
      title="Today"
      lede="One screen to start the day: what matters now, what’s on the calendar, and what needs a decision. CTL sits above OpenClaw—you steer here; systems of record stay where they belong."
    >
      <div className="space-y-4">
        <ul className="list-inside list-disc space-y-1.5 text-sm text-muted">
          <li>Tasks and meetings for today (from OpenClaw coordination)</li>
          <li>Quick jumps to Calendar, mail, and Teams when you need the source</li>
          <li>No duplicate inbox—just enough to answer “what matters today?”</li>
        </ul>
        <CtlEmptyPanel
          title="Today’s feed isn’t connected"
          body="Hook up OpenClaw in Config, then this view will summarize today’s tasks and meetings. Until then, use your usual apps; CTL will stay out of the way."
          footnote={
            <>
              <Link href="/config" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
                Config
              </Link>
              {" · "}
              <Link href="/chat" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
                Chat
              </Link>
            </>
          }
        />
      </div>
    </CtlViewShell>
  );
}
