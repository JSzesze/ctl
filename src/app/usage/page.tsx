import type { Metadata } from "next";
import { CtlViewShell } from "@/components/ctl-view-shell";
import { UsagePanel } from "@/components/openclaw/usage-panel";

export const metadata: Metadata = {
  title: "Usage",
};

export default function UsagePage() {
  return (
    <CtlViewShell
      title="Usage"
      lede="Session and cost aggregates from the gateway for a date range. Load when you need a snapshot; nothing polls in the background."
    >
      <UsagePanel />
    </CtlViewShell>
  );
}
