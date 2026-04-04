"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { btnClass } from "@/components/control-button-classes";
import { useControlConnection } from "@/components/control-provider";
import { JsonPreview } from "@/components/openclaw/json-preview";
import { OpenClawDisconnectedHint } from "@/components/openclaw/disconnected-hint";
import { GatewayRequestError } from "@/lib/openclaw";

export function EnvironmentPanel() {
  const { connected, rpc } = useControlConnection();
  const [schemaMeta, setSchemaMeta] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sch = await rpc("config.schema", {});
      setSchemaMeta(sch);
    } catch (e) {
      const msg =
        e instanceof GatewayRequestError
          ? `${e.gatewayCode}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
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
      <p className="text-sm text-muted-foreground">
        Schema hints from <code className="text-xs text-foreground">config.schema</code>. For the full merged
        configuration and editing, use{" "}
        <Link href="/config" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
          Config
        </Link>
        .
      </p>
      <button type="button" className={btnClass} disabled={loading} onClick={() => void load()}>
        {loading ? "Loading…" : "Load schema"}
      </button>
      {error ? (
        <p className="rounded-md border border-err-border bg-surface-status px-3 py-2 text-sm text-err-text">{error}</p>
      ) : null}
      {schemaMeta != null ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-heading">config.schema</h2>
          <JsonPreview value={schemaMeta} maxHeightClassName="max-h-[32rem]" />
        </section>
      ) : null}
    </div>
  );
}
