import { useCallback, useEffect, useRef, useState } from "react";
import type { GatewayEventNotification, GatewayHelloOk } from "@/lib/openclaw";
import { OpenClawMinimalClient } from "@/lib/openclaw";
import { normalizeGatewayWebSocketUrl } from "@/lib/openclaw/gateway-url";

export type GatewayConnectionState = "disconnected" | "connecting" | "connected";

export type OpenClawGatewayCallbacks = {
  onLog: (line: string) => void;
  onHello: (hello: GatewayHelloOk) => void;
  /** Runs right after hello; use for RPC that needs an open client (avoids TDZ on `clientRef` in provider). */
  onConnected?: (client: OpenClawMinimalClient) => void;
  onGatewayEvent: (evt: GatewayEventNotification) => void;
  onClose: (info: { code: number; reason: string }) => void;
};

/**
 * Owns {@link OpenClawMinimalClient} lifecycle: single socket, generation guard for stale
 * close handlers, explicit connect/disconnect, unmount cleanup (Nerve-style).
 */
export function useOpenClawGateway(callbacks: OpenClawGatewayCallbacks) {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const clientRef = useRef<OpenClawMinimalClient | null>(null);
  const connectGenRef = useRef(0);

  const [connectionState, setConnectionState] = useState<GatewayConnectionState>("disconnected");

  const disconnect = useCallback(() => {
    connectGenRef.current += 1;
    clientRef.current?.stop();
    clientRef.current = null;
    setConnectionState("disconnected");
  }, []);

  const connect = useCallback((url: string, auth: { token?: string; password?: string }) => {
    const normalized = normalizeGatewayWebSocketUrl(url);
    if (!normalized.ok) {
      cbRef.current.onLog(`[gateway] ${normalized.error}`);
      return;
    }

    if (clientRef.current) {
      clientRef.current.stop();
      clientRef.current = null;
    }

    const gen = (connectGenRef.current += 1);
    setConnectionState("connecting");

    const client = new OpenClawMinimalClient({
      url: normalized.url,
      token: auth.token,
      password: auth.password,
      onLog: (line) => cbRef.current.onLog(line),
      onHello: (hello) => {
        if (gen !== connectGenRef.current) {
          return;
        }
        setConnectionState("connected");
        cbRef.current.onHello(hello);
        const c = clientRef.current;
        if (c) {
          cbRef.current.onConnected?.(c);
        }
      },
      onGatewayEvent: (evt) => cbRef.current.onGatewayEvent(evt),
      onClose: (info) => {
        if (gen !== connectGenRef.current) {
          return;
        }
        clientRef.current = null;
        setConnectionState("disconnected");
        cbRef.current.onClose(info);
      },
    });
    clientRef.current = client;
    client.start();
  }, []);

  useEffect(() => {
    return () => {
      connectGenRef.current += 1;
      clientRef.current?.stop();
      clientRef.current = null;
    };
  }, []);

  return {
    clientRef,
    connectionState,
    connect,
    disconnect,
  };
}
