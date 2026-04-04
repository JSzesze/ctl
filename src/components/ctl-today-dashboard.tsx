"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AudioLines,
  Cable,
  ListOrdered,
  MessageSquare,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CtlEmptyPanel } from "@/components/ctl-empty-panel";
import { CtlMetricCard } from "@/components/ctl-metric-card";
import { CtlNotepad } from "@/components/ctl-notepad";
import { CtlSectionHeader } from "@/components/ctl-section-header";
import { useControlConnection } from "@/components/control-provider";
import { STORAGE_TRANSCRIBE_ENABLED } from "@/config/storage-keys";
import { pickSessionKeysFromList } from "@/features/chat/chat-model";
import { GatewayRequestError } from "@/lib/openclaw";

export function CtlTodayDashboard() {
  const { connected, statusText, clearLog, rpc } = useControlConnection();
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [sessionErr, setSessionErr] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [transcribeOn, setTranscribeOn] = useState(false);

  useEffect(() => {
    try {
      setTranscribeOn(localStorage.getItem(STORAGE_TRANSCRIBE_ENABLED) === "1");
    } catch {
      /* */
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!connected) {
      setSessionCount(null);
      setSessionErr("Connect in Config first.");
      return;
    }
    setLoadingSessions(true);
    setSessionErr(null);
    try {
      const res = await rpc("sessions.list", {
        includeGlobal: true,
        includeUnknown: true,
      });
      setSessionCount(pickSessionKeysFromList(res).length);
    } catch (e) {
      const msg =
        e instanceof GatewayRequestError
          ? `${e.gatewayCode}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setSessionErr(msg);
      setSessionCount(null);
    } finally {
      setLoadingSessions(false);
    }
  }, [connected, rpc]);

  useEffect(() => {
    if (connected) {
      void refreshSessions();
    } else {
      setSessionCount(null);
      setSessionErr(null);
    }
  }, [connected, refreshSessions]);

  const gatewayValue = connected ? "Live" : "Offline";
  const gatewayHint = statusText.length > 72 ? `${statusText.slice(0, 72)}…` : statusText;

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <section className="space-y-2.5">
        <CtlSectionHeader label="At a glance" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CtlMetricCard
            icon={Cable}
            value={gatewayValue}
            label="Gateway"
            hint={gatewayHint}
            change={connected ? "connected" : "disconnected"}
            changeTone={connected ? "positive" : "muted"}
          />
          <CtlMetricCard
            icon={ListOrdered}
            value={sessionCount === null ? "—" : sessionCount}
            label="Sessions"
            hint={sessionErr ?? (loadingSessions ? "Loading…" : connected ? "sessions.list" : "Offline")}
            change={loadingSessions ? "…" : undefined}
            changeTone="muted"
          />
          <CtlMetricCard
            icon={AudioLines}
            value={transcribeOn ? "On" : "Off"}
            label="Transcribe"
            hint={transcribeOn ? "Enabled in settings." : "Integrations → Transcribe"}
            change={transcribeOn ? "enabled" : "disabled"}
            changeTone={transcribeOn ? "positive" : "muted"}
          />
        </div>
      </section>

      {/* Quick actions + Scratchpad side by side at lg */}
      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-2.5">
          <CtlSectionHeader label="Quick actions" />
          <div className="flex flex-wrap gap-1.5">
            <Button asChild size="sm">
              <Link href="/config"><Settings2 className="size-3.5" />Config</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/chat"><MessageSquare className="size-3.5" />Chat</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!connected || loadingSessions}
              onClick={() => void refreshSessions()}
            >
              <RefreshCw className={`size-3.5 ${loadingSessions ? "animate-spin" : ""}`} />
              Refresh sessions
            </Button>
            <Button variant="outline" size="sm" onClick={() => clearLog()}>
              <Trash2 className="size-3.5" />
              Clear log
            </Button>
          </div>
        </div>

        <div className="space-y-2.5">
          <CtlSectionHeader label="Scratchpad" />
          <CtlNotepad />
        </div>
      </section>

      {/* Feed placeholder */}
      <section className="space-y-2.5">
        <CtlSectionHeader label="Today feed" />
        <CtlEmptyPanel
          title="Feed not connected"
          body="Connect in Config to surface today's tasks and meetings."
          footnote={
            <>
              <Link href="/config" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
                Config
              </Link>
              {" · "}
              <Link href="/chat" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
                Chat
              </Link>
            </>
          }
        />
      </section>
    </div>
  );
}
