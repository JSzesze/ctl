import type { Metadata } from "next";
import { CtlViewShell } from "@/components/ctl-view-shell";
import { AutomationPanel } from "@/components/openclaw/automation-panel";

export const metadata: Metadata = {
  title: "Automation",
};

export default function AutomationPage() {
  return (
    <CtlViewShell
      title="Automation"
      lede="Gateway cron scheduler: status and job list. This is read-only in CTL; create or edit schedules where you manage the gateway."
    >
      <AutomationPanel />
    </CtlViewShell>
  );
}
