import type { Metadata } from "next";
import { CtlEmptyPanel } from "@/components/ctl-empty-panel";
import { CtlViewShell } from "@/components/ctl-view-shell";

export const metadata: Metadata = {
  title: "Radar",
};

export default function RadarPage() {
  return (
    <CtlViewShell
      title="Radar"
      lede="Catch what’s slipping before it drops. Stale tasks, quiet threads, and risks bubble up so you can act—not to hoard data, but to stay oriented."
    >
      <CtlEmptyPanel
        title="Clear skies for now"
        body="Alerts and at-risk items from OpenClaw will land here. Operational truth still lives in Calendar, mail, Teams, and your other tools."
        footnote={
          <>
            Apple Notes, Calendar, Outlook, Teams, iMessage, Budget, Embr, Savit, RePen—CTL links out; it doesn’t replace them.
          </>
        }
      />
    </CtlViewShell>
  );
}
