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
      lede="Token and cost totals from the gateway for the dates you select. Changing the range fetches fresh data automatically."
    >
      <UsagePanel />
    </CtlViewShell>
  );
}
