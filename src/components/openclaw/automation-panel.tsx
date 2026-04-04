"use client";

import { useCallback, useState } from "react";
import { btnClass } from "@/components/control-button-classes";
import { useControlConnection } from "@/components/control-provider";
import { JsonPreview } from "@/components/openclaw/json-preview";
import { OpenClawDisconnectedHint } from "@/components/openclaw/disconnected-hint";
import { GatewayRequestError } from "@/lib/openclaw";

export function AutomationPanel() {
  const { connected, rpc } = useControlConnection();
  const [status, setStatus] = useState<unknown>(null);
  const [jobs, setJobs] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [st, list] = await Promise.all([
        rpc("cron.status", {}),
        rpc("cron.list", {
          includeDisabled: true,
          limit: 100,
          offset: 0,
          enabled: "all",
        }),
      ]);
      setStatus(st);
      setJobs(list);
    } catch (e) {
      const msg =
        e instanceof GatewayRequestError
          ? `${e.gatewayCode}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
      setStatus(null);
      setJobs(null);
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  if (!connected) {
    return <OpenClawDisconnectedHint />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Read-only view of gateway cron scheduler state (
        <code className="text-xs text-foreground">cron.status</code>,{" "}
        <code className="text-xs text-foreground">cron.list</code>). Editing jobs stays in the stock Control
        UI or CLI for now.
      </p>
      <button type="button" className={btnClass} disabled={loading} onClick={() => void load()}>
        {loading ? "Loading…" : "Refresh"}
      </button>
      {error ? (
        <p className="rounded-md border border-err-border bg-surface-status px-3 py-2 text-sm text-err-text">{error}</p>
      ) : null}
      {status != null ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-heading">Status</h2>
          <JsonPreview value={status} maxHeightClassName="max-h-48" />
        </section>
      ) : null}
      {jobs != null ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-heading">Jobs</h2>
          <JsonPreview value={jobs} />
        </section>
      ) : null}
    </div>
  );
}
