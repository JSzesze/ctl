import type { Metadata } from "next";
import { ControlConfigView } from "@/components/control-config-view";
import { CtlViewShell } from "@/components/ctl-view-shell";

export const metadata: Metadata = {
  title: "Config",
};

export default function ConfigPage() {
  return (
    <CtlViewShell
      title="Config"
      lede="Connect to the gateway, then browse and edit live configuration."
    >
      <ControlConfigView />
    </CtlViewShell>
  );
}
