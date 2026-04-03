"use client";

import Link from "next/link";
import { btnClass, primaryBtnClass } from "@/components/control-button-classes";
import { useControl } from "@/components/control-provider";

const inputClass =
  "w-full max-w-[40rem] rounded-md border border-border-input bg-surface-input px-2 py-1.5 text-sm text-foreground";

export function ControlConfigView() {
  const {
    hydrated,
    gatewayUrl,
    setGatewayUrl,
    token,
    setToken,
    password,
    setPassword,
    remember,
    setRemember,
    logText,
    connected,
    connecting,
    statusText,
    statusKind,
    handleConnect,
    handleDisconnect,
    handleStatus,
    clearLog,
  } = useControl();

  const rpcEnabled = connected;

  if (!hydrated) {
    return <p className="p-4 text-sm text-hint">Loading…</p>;
  }

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold text-heading">Configuration</h1>
      <p className="mb-4 text-sm text-hint">
        Open this app as <strong className="text-foreground">http://localhost</strong> (any port) or{" "}
        <strong className="text-foreground">https</strong> so the browser exposes WebCrypto; plain{" "}
        <code className="text-foreground">http://10.x…</code> cannot sign device identity. Set{" "}
        <a
          href="https://docs.openclaw.ai/web/control-ui"
          target="_blank"
          rel="noopener noreferrer"
          className="text-link underline underline-offset-[0.15em] hover:text-link-hover"
        >
          gateway.controlUi.allowedOrigins
        </a>{" "}
        to this origin (e.g. <code className="text-foreground">http://localhost:3000</code>). Approve the browser with{" "}
        <code className="text-foreground">openclaw devices approve …</code> when pairing is required. Return to{" "}
        <Link href="/" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
          Chat
        </Link>{" "}
        after connecting.
      </p>

      <fieldset className="mb-4 rounded-lg border border-border-muted px-4 pb-4 pt-3">
        <legend className="px-1.5 text-xs text-legend">Connection</legend>
        <div className="mb-2.5">
          <label htmlFor="ws" className="mb-0.5 block text-xs text-label">
            Gateway WebSocket URL
          </label>
          <input
            id="ws"
            type="text"
            className={inputClass}
            placeholder="wss://your-host:18789"
            autoComplete="off"
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
          />
        </div>
        <div className="mb-2.5">
          <label htmlFor="tok" className="mb-0.5 block text-xs text-label">
            Gateway token
          </label>
          <input
            id="tok"
            type="password"
            className={inputClass}
            placeholder="from wizard / OPENCLAW_GATEWAY_TOKEN"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <div className="mb-2.5">
          <label htmlFor="pw" className="mb-0.5 block text-xs text-label">
            Gateway password (optional, if using password auth)
          </label>
          <input
            id="pw"
            type="password"
            className={inputClass}
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-[0.8rem] text-label">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember token in localStorage (this machine only)
        </label>
      </fieldset>

      <div className="my-3 flex flex-wrap gap-2">
        <button type="button" className={primaryBtnClass} disabled={connecting || connected} onClick={handleConnect}>
          Connect
        </button>
        <button type="button" className={btnClass} disabled={!connected} onClick={handleDisconnect}>
          Disconnect
        </button>
        <button type="button" className={btnClass} disabled={!rpcEnabled} onClick={() => void handleStatus()}>
          Call status
        </button>
        <button type="button" className={btnClass} onClick={clearLog}>
          Clear log
        </button>
      </div>

      <div
        className={`mb-3 rounded-md border p-2 text-sm bg-surface-status ${
          statusKind === "ok"
            ? "border-ok-border text-ok-text"
            : statusKind === "err"
              ? "border-err-border text-err-text"
              : "border-border-status text-foreground"
        }`}
      >
        {statusText}
      </div>

      <h2 className="mb-1 text-[0.8rem] font-semibold text-log-heading">Debug log</h2>
      <pre
        className="max-h-[min(50vh,22rem)] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-log bg-surface-log p-2.5 text-xs"
        aria-label="Debug log"
      >
        {logText}
      </pre>
    </>
  );
}
