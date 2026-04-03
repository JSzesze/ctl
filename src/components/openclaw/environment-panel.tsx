"use client";

import { useCallback, useState } from "react";
import { btnClass } from "@/components/control-button-classes";
import { useControl } from "@/components/control-provider";
import { JsonPreview } from "@/components/openclaw/json-preview";
import { OpenClawDisconnectedHint } from "@/components/openclaw/disconnected-hint";
import { GatewayRequestError } from "@/lib/openclaw";

export function EnvironmentPanel() {
  const { connected, rpc } = useControl();
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [schemaMeta, setSchemaMeta] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, sch] = await Promise.all([
        rpc("config.get", {}),
        rpc("config.schema", {}),
      ]);
      setSnapshot(cfg);
      setSchemaMeta(sch);
    } catch (e) {
      const msg =
        e instanceof GatewayRequestError
          ? `${e.gatewayCode}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
      setSnapshot(null);
      setSchemaMeta(null);
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  if (!connected) {
    return <OpenClawDisconnectedHint />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Gateway configuration snapshot and schema hints from{" "}
        <code className="text-xs text-foreground">config.get</code> and{" "}
        <code className="text-xs text-foreground">config.schema</code>. Host environment variables are not
        listed here—they are applied when the gateway process starts. Treat this output as sensitive.
      </p>
      <button type="button" className={btnClass} disabled={loading} onClick={() => void load()}>
        {loading ? "Loading…" : "Load config"}
      </button>
      {error ? (
        <p className="rounded-md border border-err-border bg-surface-status px-3 py-2 text-sm text-err-text">{error}</p>
      ) : null}
      {snapshot != null ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-heading">config.get</h2>
          <JsonPreview value={snapshot} />
        </section>
      ) : null}
      {schemaMeta != null ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-heading">config.schema</h2>
          <JsonPreview value={schemaMeta} maxHeightClassName="max-h-64" />
        </section>
      ) : null}
    </div>
  );
}
