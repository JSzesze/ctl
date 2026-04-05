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
      lede="Optional browser-only check against your Transcribe HTTP API. OpenClaw agents do not use this path — give them a gateway tool, MCP server, or documented skill that calls Transcribe with server-side config."
    >
      <TranscribeIntegrationPanel />
    </CtlViewShell>
  );
}
