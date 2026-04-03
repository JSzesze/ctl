import type { Metadata } from "next";
import { CtlViewShell } from "@/components/ctl-view-shell";
import { TranscribeIntegrationPanel } from "@/components/integrations/transcribe-integration-panel";

export const metadata: Metadata = {
  title: "Transcribe",
};

export default function TranscribeIntegrationPage() {
  return (
    <CtlViewShell
      title="Transcribe"
      lede="Connect CTL to your Transcribe HTTP service: store base URL and optional API key locally, then list documents in a simple table."
    >
      <TranscribeIntegrationPanel />
    </CtlViewShell>
  );
}
