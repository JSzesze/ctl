import type { Metadata } from "next";
import Link from "next/link";
import { CtlEmptyPanel } from "@/components/ctl-empty-panel";
import { CtlViewShell } from "@/components/ctl-view-shell";

export const metadata: Metadata = {
  title: "Meetings",
};

export default function MeetingsPage() {
  return (
    <CtlViewShell
      title="Meetings"
      lede="Process what happened into follow-ups. Long-form capture stays in Savit; artifacts stay in RePen/Canopy. Here you route outcomes to the right place."
    >
      <CtlEmptyPanel
        title="No meetings surfaced"
        body="Recent and upcoming meetings with open follow-ups will appear here once coordination data flows from OpenClaw."
        footnote={
          <>
            Need to talk to the gateway?{" "}
            <Link href="/chat" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
              Chat
            </Link>
            .
          </>
        }
      />
    </CtlViewShell>
  );
}
