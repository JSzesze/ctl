import type { Metadata } from "next";
import { CtlViewShell } from "@/components/ctl-view-shell";
import { EnvironmentPanel } from "@/components/openclaw/environment-panel";

export const metadata: Metadata = {
  title: "Environment",
};

export default function EnvironmentPage() {
  return (
    <CtlViewShell
      title="Environment"
      lede="Effective gateway configuration (merged settings and schema metadata). OS-level env vars are not shown—only what the gateway exposes over the wire."
    >
      <EnvironmentPanel />
    </CtlViewShell>
  );
}
