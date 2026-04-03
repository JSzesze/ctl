"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { loadPersistedConnectionForm } from "@/config/load-connection-form";
import { STORAGE_GATEWAY_TOKEN, STORAGE_GATEWAY_WS_URL, STORAGE_SESSION_KEY } from "@/config/storage-keys";
import {
  applyChatGatewayEvent,
  chatAbort,
  chatLoadHistory,
  chatLoadSessions,
  chatSend,
  createChatModel,
  type ChatSurfaceModel,
} from "@/features/chat/chat-model";
import { useOpenClawGateway } from "@/hooks/use-openclaw-gateway";
import { GatewayRequestError } from "@/lib/openclaw";

export type StatusKind = "idle" | "ok" | "err";

export type ControlContextValue = {
  hydrated: boolean;
  chatModelRef: RefObject<ChatSurfaceModel | null>;
  chatTick: number;
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
  chatInput: string;
  setChatInput: (v: string) => void;
  logText: string;
  setLogText: Dispatch<SetStateAction<string>>;
  connected: boolean;
  connecting: boolean;
  statusText: string;
  statusKind: StatusKind;
  handleConnect: () => void;
  handleDisconnect: () => void;
  handleStatus: () => Promise<void>;
  handleChatSessions: () => Promise<void>;
  handleChatHistory: () => Promise<void>;
  handleSendChat: () => Promise<void>;
  handleStopChat: () => Promise<void>;
  clearLog: () => void;
};

const ControlContext = createContext<ControlContextValue | null>(null);

export function useControl(): ControlContextValue {
  const v = useContext(ControlContext);
  if (!v) {
    throw new Error("useControl must be used within ControlProvider");
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
        if (evt.event === "chat" && chatModelRef.current) {
          if (applyChatGatewayEvent(chatModelRef.current, evt.payload)) {
            refreshChat();
          }
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
        }
        refreshChat();
      },
    });

  useEffect(() => {
    const form = loadPersistedConnectionForm();
    chatModelRef.current = createChatModel(localStorage.getItem(STORAGE_SESSION_KEY) ?? "");
    setSessionKey(localStorage.getItem(STORAGE_SESSION_KEY) ?? "");
    setGatewayUrl(form.gatewayUrl);
    setToken(form.token);
    setRemember(form.remember);
    setHydrated(true);
  }, []);

  /** Keep last gateway URL on disk so refresh can restore it (even before a successful connect). */
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
    const url = gatewayUrl.trim();
    if (!url) {
      setStatusText("Enter a WebSocket URL (ws:// or wss://).");
      setStatusKind("err");
      return;
    }
    persistConnection();
    setStatusText("Connecting…");
    setStatusKind("idle");
    connectGateway(url, {
      token: token.trim() || undefined,
      password: password.trim() || undefined,
    });
  }, [connectGateway, gatewayUrl, password, persistConnection, token]);

  /** One shot after hydrate: reconnect if URL was persisted; if empty, still consume so typing later does not auto-connect. */
  const autoConnectAttemptedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || autoConnectAttemptedRef.current) {
      return;
    }
    autoConnectAttemptedRef.current = true;
    const url = gatewayUrl.trim();
    if (!url) {
      return;
    }
    persistConnection();
    setStatusText("Connecting…");
    setStatusKind("idle");
    connectGateway(url, {
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
      const keys = await chatLoadSessions(c);
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

  const connected = connectionState === "connected";
  const connecting = connectionState === "connecting";

  const value: ControlContextValue = {
    hydrated,
    chatModelRef,
    chatTick,
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
    chatInput,
    setChatInput,
    logText,
    setLogText,
    connected,
    connecting,
    statusText,
    statusKind,
    handleConnect,
    handleDisconnect,
    handleStatus,
    handleChatSessions,
    handleChatHistory,
    handleSendChat,
    handleStopChat,
    clearLog,
  };

  return <ControlContext.Provider value={value}>{children}</ControlContext.Provider>;
}
