import type { Metadata } from "next";
import { CtlTodayDashboard } from "@/components/ctl-today-dashboard";
import { CtlViewShell } from "@/components/ctl-view-shell";

export const metadata: Metadata = {
  title: "Today",
};

export default function TodayPage() {
  return (
    <CtlViewShell
      title="Today"
      lede="Gateway status, sessions, quick actions, and scratchpad."
    >
      <CtlTodayDashboard />
    </CtlViewShell>
  );
}
