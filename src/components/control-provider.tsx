"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { loadPersistedConnectionForm } from "@/config/load-connection-form";
import { readOpenclawControlUiSettings } from "@/config/openclaw-control-ui-import";
import { STORAGE_GATEWAY_TOKEN, STORAGE_GATEWAY_WS_URL, STORAGE_SESSION_KEY } from "@/config/storage-keys";
import {
  chatDebug,
  chatModelSnapshot,
  getChatDebugLevel,
  logVerbosePayload,
  summarizeAgentWsPayload,
  summarizeChatWsPayload,
} from "@/features/chat/chat-debug";
import {
  applyAgentGatewayEvent,
  applyChatGatewayEvent,
  applySessionMessageEvent,
  chatAbort,
  chatLoadHistory,
  chatLoadSessions,
  chatSend,
  createChatModel,
  type ChatSurfaceModel,
  type SessionInfo,
} from "@/features/chat/chat-model";
import { useOpenClawGateway } from "@/hooks/use-openclaw-gateway";
import { normalizeGatewayWebSocketUrl } from "@/lib/openclaw/gateway-url";
import { GatewayRequestError } from "@/lib/openclaw";

export type StatusKind = "idle" | "ok" | "err";

/** Gateway form, connection state, RPC — does not include log or chat UI state (avoids list re-renders on every log line). */
export type ControlConnectionValue = {
  hydrated: boolean;
  gatewayUrl: string;
  setGatewayUrl: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  remember: boolean;
  setRemember: (v: boolean) => void;
  sessionKey: string;
  setSessionKey: (v: string) => void;
  connected: boolean;
  connecting: boolean;
  statusText: string;
  statusKind: StatusKind;
  handleConnect: () => void;
  handleDisconnect: () => void;
  handleStatus: () => Promise<void>;
  clearLog: () => void;
  rpc: (method: string, params?: unknown) => Promise<unknown>;
};

export type ControlLogValue = {
  logText: string;
  setLogText: Dispatch<SetStateAction<string>>;
};

export type ControlChatValue = {
  chatModelRef: RefObject<ChatSurfaceModel | null>;
  chatTick: number;
  /** Re-read chat model from ref into React (after mutating the model). */
  refreshChat: () => void;
  chatInput: string;
  setChatInput: (v: string) => void;
  sessionList: SessionInfo[];
  handleChatSessions: () => Promise<void>;
  handleChatHistory: () => Promise<void>;
  handleSendChat: () => Promise<void>;
  handleStopChat: () => Promise<void>;
};

export type ControlContextValue = ControlConnectionValue & ControlLogValue & ControlChatValue;

const ControlConnectionContext = createContext<ControlConnectionValue | null>(null);
const ControlLogContext = createContext<ControlLogValue | null>(null);
const ControlChatContext = createContext<ControlChatValue | null>(null);

export function useControlConnection(): ControlConnectionValue {
  const v = useContext(ControlConnectionContext);
  if (!v) {
    throw new Error("useControlConnection must be used within ControlProvider");
  }
  return v;
}

export function useControlLog(): ControlLogValue {
  const v = useContext(ControlLogContext);
  if (!v) {
    throw new Error("useControlLog must be used within ControlProvider");
  }
  return v;
}

export function useControlChat(): ControlChatValue {
  const v = useContext(ControlChatContext);
  if (!v) {
    throw new Error("useControlChat must be used within ControlProvider");
  }
  return v;
}

export function ControlProvider({ children }: { children: ReactNode }) {
  const chatModelRef = useRef<ChatSurfaceModel | null>(null);
  const [chatTick, bumpChat] = useReducer((x: number) => x + 1, 0);

  const [hydrated, setHydrated] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [sessionKey, setSessionKey] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [sessionList, setSessionList] = useState<SessionInfo[]>([]);
  const [logText, setLogText] = useState("");

  const [statusText, setStatusText] = useState("Disconnected.");
  const [statusKind, setStatusKind] = useState<StatusKind>("idle");

  const refreshChat = useCallback(() => {
    bumpChat();
  }, []);

  const appendLog = useCallback((line: string) => {
    setLogText((prev) => `${prev}${line}\n`);
  }, []);

  const { clientRef, connectionState, connect: connectGateway, disconnect: disconnectGateway } =
    useOpenClawGateway({
      onLog: appendLog,
      onHello: (hello) => {
        setStatusText(`Connected. Protocol ${hello.protocol ?? "?"}.`);
        setStatusKind("ok");
        appendLog(`hello: ${JSON.stringify(hello, null, 2)}`);
        refreshChat();
      },
      onConnected: (c) => {
        void (async () => {
          try {
            await c.request("sessions.subscribe", {});
          } catch {
            /* optional */
          }
        })();
      },
      onGatewayEvent: (evt) => {
        const m = chatModelRef.current;
        if (!m) return;
        if (evt.event === "chat") {
          if (getChatDebugLevel() === "verbose") {
            logVerbosePayload(`ws chat seq=${evt.seq ?? "?"}`, evt.payload);
          }
          chatDebug("ws ← chat", {
            seq: evt.seq ?? null,
            ...summarizeChatWsPayload(evt.payload),
          });
          const applied = applyChatGatewayEvent(m, evt.payload);
          if (applied === "reload") {
            chatDebug("ws chat → history reload", chatModelSnapshot(m));
            const c = clientRef.current;
            if (c?.connected) {
              void chatLoadHistory(c, m).then(() => refreshChat());
            } else {
              refreshChat();
            }
          } else if (applied) {
            chatDebug("ws chat → UI refresh", chatModelSnapshot(m));
            refreshChat();
          }
        } else if (evt.event === "agent") {
          if (getChatDebugLevel() === "verbose") {
            logVerbosePayload(`ws agent seq=${evt.seq ?? "?"}`, evt.payload);
          }
          chatDebug("ws ← agent", {
            seq: evt.seq ?? null,
            ...summarizeAgentWsPayload(evt.payload),
          });
          const applied = applyAgentGatewayEvent(m, evt.payload);
          if (applied) {
            chatDebug("ws agent → UI refresh", chatModelSnapshot(m));
            refreshChat();
          }
        } else if (
          evt.event === "session.message" ||
          evt.event === "sessions.message" ||
          evt.event === "session.transcript"
        ) {
          if (applySessionMessageEvent(m, evt.payload)) refreshChat();
        }
      },
      onClose: ({ code, reason }) => {
        const r = (reason || "").toLowerCase();
        const pairing = r.includes("pairing");
        if (pairing) {
          setStatusText(
            "Pairing required — on the gateway host run: openclaw devices list  then  openclaw devices approve <requestId>",
          );
          setStatusKind("err");
          appendLog(
            "Docs: https://docs.openclaw.ai/web/control-ui#device-pairing-first-connection\n" +
              "Only 127.0.0.1 is auto-approved; remote browsers need one-time approval per device profile.",
          );
        } else {
          setStatusText(`Closed (${code}) ${reason || ""}`.trim());
          setStatusKind("err");
          if (code === 1006) {
            appendLog(
              "1006 = abnormal close (often TLS/proxy/network). Retry; confirm wss:// URL matches your gateway.",
            );
          }
        }
        if (chatModelRef.current) {
          chatModelRef.current.sending = false;
          chatModelRef.current.activeRunId = null;
          chatModelRef.current.activity = null;
          chatModelRef.current.streamingThinking = null;
        }
        refreshChat();
      },
    });

  useEffect(() => {
    const form = loadPersistedConnectionForm();
    let initialSession = localStorage.getItem(STORAGE_SESSION_KEY)?.trim() ?? "";
    if (!initialSession) {
      const imported = readOpenclawControlUiSettings()?.sessionKey?.trim();
      if (imported) {
        initialSession = imported;
      }
    }
    chatModelRef.current = createChatModel(initialSession);
    setSessionKey(initialSession);
    setGatewayUrl(form.gatewayUrl);
    setToken(form.token);
    setRemember(form.remember);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const id = window.setTimeout(() => {
      const u = gatewayUrl.trim();
      if (u) {
        localStorage.setItem(STORAGE_GATEWAY_WS_URL, u);
      } else {
        localStorage.removeItem(STORAGE_GATEWAY_WS_URL);
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [hydrated, gatewayUrl]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const m = chatModelRef.current;
    if (!m) {
      return;
    }
    const sk = sessionKey.trim();
    m.sessionKey = sk;
    if (sk) {
      localStorage.setItem(STORAGE_SESSION_KEY, sk);
    } else {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  }, [hydrated, sessionKey]);

  const subscribedMsgSessionRef = useRef<string | null>(null);
  useEffect(() => {
    const c = clientRef.current;
    const sk = sessionKey.trim();
    const isConnected = connectionState === "connected";
    if (!isConnected || !sk || !c?.connected) {
      if (subscribedMsgSessionRef.current && c?.connected) {
        void c.request("sessions.messages.unsubscribe", { sessionKey: subscribedMsgSessionRef.current }).catch(() => {});
      }
      subscribedMsgSessionRef.current = null;
      return;
    }
    if (subscribedMsgSessionRef.current === sk) return;

    if (subscribedMsgSessionRef.current) {
      void c.request("sessions.messages.unsubscribe", { sessionKey: subscribedMsgSessionRef.current }).catch(() => {});
    }
    void c.request("sessions.messages.subscribe", { sessionKey: sk }).catch(() => {});
    subscribedMsgSessionRef.current = sk;

    return () => {
      if (subscribedMsgSessionRef.current && c?.connected) {
        void c.request("sessions.messages.unsubscribe", { sessionKey: subscribedMsgSessionRef.current }).catch(() => {});
        subscribedMsgSessionRef.current = null;
      }
    };
  }, [connectionState, sessionKey]);

  const persistConnection = useCallback(() => {
    const u = gatewayUrl.trim();
    if (u) {
      localStorage.setItem(STORAGE_GATEWAY_WS_URL, u);
    } else {
      localStorage.removeItem(STORAGE_GATEWAY_WS_URL);
    }
    if (remember) {
      const t = token.trim();
      if (t) {
        localStorage.setItem(STORAGE_GATEWAY_TOKEN, t);
      }
    } else {
      localStorage.removeItem(STORAGE_GATEWAY_TOKEN);
    }
  }, [gatewayUrl, remember, token]);

  const handleConnect = useCallback(() => {
    const normalized = normalizeGatewayWebSocketUrl(gatewayUrl);
    if (!normalized.ok) {
      setStatusText(normalized.error);
      setStatusKind("err");
      return;
    }
    persistConnection();
    setStatusText("Connecting…");
    setStatusKind("idle");
    connectGateway(normalized.url, {
      token: token.trim() || undefined,
      password: password.trim() || undefined,
    });
  }, [connectGateway, gatewayUrl, password, persistConnection, token]);

  const autoConnectAttemptedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || autoConnectAttemptedRef.current) {
      return;
    }
    autoConnectAttemptedRef.current = true;
    const normalized = normalizeGatewayWebSocketUrl(gatewayUrl);
    if (!normalized.ok) {
      setStatusText(normalized.error);
      setStatusKind("err");
      return;
    }
    persistConnection();
    setStatusText("Connecting…");
    setStatusKind("idle");
    connectGateway(normalized.url, {
      token: token.trim() || undefined,
      password: password.trim() || undefined,
    });
  }, [hydrated, gatewayUrl, token, password, connectGateway, persistConnection]);

  const handleDisconnect = useCallback(() => {
    disconnectGateway();
    if (chatModelRef.current) {
      chatModelRef.current.sending = false;
      chatModelRef.current.activeRunId = null;
    }
    setStatusText("Disconnected.");
    setStatusKind("idle");
    refreshChat();
  }, [disconnectGateway, refreshChat]);

  const handleStatus = useCallback(async () => {
    const c = clientRef.current;
    if (!c?.connected) {
      return;
    }
    try {
      const res = await c.request("status", {});
      appendLog(`status: ${JSON.stringify(res, null, 2)}`);
    } catch (e) {
      const msg =
        e instanceof GatewayRequestError ? `${e.gatewayCode}: ${e.message}` : String(e);
      appendLog(`status error: ${msg}`);
    }
  }, [appendLog, clientRef]);

  const handleChatSessions = useCallback(async () => {
    const c = clientRef.current;
    if (!c?.connected) {
      return;
    }
    try {
      const infos = await chatLoadSessions(c);
      setSessionList(infos);
      const keys = infos.map((s) => s.key);
      appendLog(`sessions (${keys.length}): ${keys.join("\n") || "(none)"}`);
      if (keys.length > 0 && !sessionKey.trim()) {
        setSessionKey(keys[0]);
      }
    } catch (e) {
      appendLog(`sessions.list error: ${e instanceof Error ? e.message : e}`);
    }
    refreshChat();
  }, [appendLog, refreshChat, sessionKey]);

  const handleChatHistory = useCallback(async () => {
    const c = clientRef.current;
    const m = chatModelRef.current;
    if (!c?.connected || !m) {
      return;
    }
    await chatLoadHistory(c, m);
    refreshChat();
  }, [refreshChat]);

  const handleSendChat = useCallback(async () => {
    const c = clientRef.current;
    const m = chatModelRef.current;
    if (!c?.connected || !m) {
      return;
    }
    const text = chatInput;
    setChatInput("");
    await chatSend(c, m, text);
    refreshChat();
  }, [chatInput, refreshChat]);

  const handleStopChat = useCallback(async () => {
    const c = clientRef.current;
    const m = chatModelRef.current;
    if (!c?.connected || !m) {
      return;
    }
    await chatAbort(c, m);
    refreshChat();
  }, [refreshChat]);

  const clearLog = useCallback(() => {
    setLogText("");
  }, []);

  const rpc = useCallback(async (method: string, params?: unknown) => {
    const c = clientRef.current;
    if (!c?.connected) {
      throw new Error("Not connected to gateway");
    }
    return c.request(method, params);
  }, []);

  const connected = connectionState === "connected";
  const connecting = connectionState === "connecting";

  const connectionValue = useMemo<ControlConnectionValue>(
    () => ({
      hydrated,
      gatewayUrl,
      setGatewayUrl,
      token,
      setToken,
      password,
      setPassword,
      remember,
      setRemember,
      sessionKey,
      setSessionKey,
      connected,
      connecting,
      statusText,
      statusKind,
      handleConnect,
      handleDisconnect,
      handleStatus,
      clearLog,
      rpc,
    }),
    [
      hydrated,
      gatewayUrl,
      token,
      password,
      remember,
      sessionKey,
      connected,
      connecting,
      statusText,
      statusKind,
      handleConnect,
      handleDisconnect,
      handleStatus,
      clearLog,
      rpc,
    ],
  );

  const logValue = useMemo<ControlLogValue>(() => ({ logText, setLogText }), [logText]);

  const chatValue = useMemo<ControlChatValue>(
    () => ({
      chatModelRef,
      chatTick,
      refreshChat,
      chatInput,
      setChatInput,
      sessionList,
      handleChatSessions,
      handleChatHistory,
      handleSendChat,
      handleStopChat,
    }),
    [
      chatTick,
      refreshChat,
      chatInput,
      sessionList,
      handleChatSessions,
      handleChatHistory,
      handleSendChat,
      handleStopChat,
    ],
  );

  return (
    <ControlConnectionContext.Provider value={connectionValue}>
      <ControlLogContext.Provider value={logValue}>
        <ControlChatContext.Provider value={chatValue}>{children}</ControlChatContext.Provider>
      </ControlLogContext.Provider>
    </ControlConnectionContext.Provider>
  );
}
