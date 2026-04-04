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
      lede="config.schema reference from the gateway. The live merged config and editing live on Config. OS env vars are not listed here."
    >
      <EnvironmentPanel />
    </CtlViewShell>
  );
}
