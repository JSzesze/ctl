import { readBootstrapFromUrl } from "@/config/bootstrap-url";
import {
  STORAGE_GATEWAY_TOKEN,
  STORAGE_GATEWAY_WS_URL,
  STORAGE_SESSION_KEY,
} from "@/config/storage-keys";
import {
  applyChatGatewayEvent,
  chatAbort,
  chatLoadHistory,
  chatLoadSessions,
  chatSend,
  createChatModel,
  type ChatSurfaceModel,
} from "@/features/chat/chat-model";
import { GatewayRequestError, OpenClawMinimalClient } from "@/lib/openclaw";

const ROOT_ID = "app";

export function mountApp(): void {
  const boot = readBootstrapFromUrl();

  const root = document.querySelector(`#${ROOT_ID}`);
  if (!root) {
    return;
  }

  root.innerHTML = `
    <h1>OpenClaw minimal control</h1>
    <p class="hint">
      Dev UI for a remote gateway. Open this app as <strong>http://localhost</strong> (any port) or <strong>https</strong> so the browser exposes WebCrypto; plain <code>http://10.x…</code> cannot sign device identity.
      Set
      <a href="https://docs.openclaw.ai/web/control-ui" target="_blank" rel="noopener">gateway.controlUi.allowedOrigins</a>
      to this origin. Approve the browser with <code>openclaw devices approve …</code> when pairing is required.
    </p>
    <fieldset>
      <legend>Connection</legend>
      <div class="row">
        <label for="ws">Gateway WebSocket URL</label>
        <input id="ws" type="text" placeholder="wss://your-host:18789" autocomplete="off" />
      </div>
      <div class="row">
        <label for="tok">Gateway token</label>
        <input id="tok" type="password" placeholder="from wizard / OPENCLAW_GATEWAY_TOKEN" autocomplete="off" />
      </div>
      <div class="row">
        <label for="pw">Gateway password (optional, if using password auth)</label>
        <input id="pw" type="password" autocomplete="off" />
      </div>
      <label style="display:flex;align-items:center;gap:0.4rem;margin-top:0.5rem;font-size:0.8rem;">
        <input type="checkbox" id="remember" />
        Remember token in localStorage (this machine only)
      </label>
    </fieldset>
    <fieldset>
      <legend>Chat</legend>
      <div class="row">
        <label for="session">Session key</label>
        <input id="session" type="text" placeholder="e.g. agent:main:main or paste from sessions list" autocomplete="off" />
      </div>
      <div class="actions" style="margin-top:0.5rem;">
        <button type="button" id="btn-chat-sessions" disabled>List sessions</button>
        <button type="button" id="btn-chat-history" disabled>Load history</button>
        <button type="button" id="btn-chat-stop" disabled>Stop run</button>
      </div>
      <p class="hint" style="margin:0.35rem 0 0.5rem;">Use <strong>List sessions</strong> to copy a key, or set the default main session your gateway uses.</p>
      <div class="chat-err" id="chat-err"></div>
      <div class="chat-transcript" id="chat-transcript" aria-live="polite"></div>
      <div class="chat-stream" id="chat-stream" hidden></div>
      <div class="row">
        <label for="chat-input">Message</label>
        <textarea id="chat-input" class="chat-input" placeholder="Message… (sent with deliver: false)" autocomplete="off"></textarea>
      </div>
      <div class="actions">
        <button type="button" class="primary" id="btn-chat-send" disabled>Send</button>
      </div>
    </fieldset>
    <div class="actions">
      <button type="button" class="primary" id="btn-connect">Connect</button>
      <button type="button" id="btn-disconnect" disabled>Disconnect</button>
      <button type="button" id="btn-status" disabled>Call status</button>
      <button type="button" id="btn-clear-log">Clear log</button>
    </div>
    <div class="status" id="status">Disconnected.</div>
    <pre class="log" id="log"></pre>
  `;

  const elWs = root.querySelector<HTMLInputElement>("#ws")!;
  const elTok = root.querySelector<HTMLInputElement>("#tok")!;
  const elPw = root.querySelector<HTMLInputElement>("#pw")!;
  const elRemember = root.querySelector<HTMLInputElement>("#remember")!;
  const elSession = root.querySelector<HTMLInputElement>("#session")!;
  const btnConnect = root.querySelector<HTMLButtonElement>("#btn-connect")!;
  const btnDisconnect = root.querySelector<HTMLButtonElement>("#btn-disconnect")!;
  const btnStatus = root.querySelector<HTMLButtonElement>("#btn-status")!;
  const btnClearLog = root.querySelector<HTMLButtonElement>("#btn-clear-log")!;
  const btnChatSessions = root.querySelector<HTMLButtonElement>("#btn-chat-sessions")!;
  const btnChatHistory = root.querySelector<HTMLButtonElement>("#btn-chat-history")!;
  const btnChatSend = root.querySelector<HTMLButtonElement>("#btn-chat-send")!;
  const btnChatStop = root.querySelector<HTMLButtonElement>("#btn-chat-stop")!;
  const elChatInput = root.querySelector<HTMLTextAreaElement>("#chat-input")!;
  const elChatTranscript = root.querySelector<HTMLDivElement>("#chat-transcript")!;
  const elChatStream = root.querySelector<HTMLDivElement>("#chat-stream")!;
  const elChatErr = root.querySelector<HTMLDivElement>("#chat-err")!;
  const elStatus = root.querySelector<HTMLDivElement>("#status")!;
  const elLog = root.querySelector<HTMLPreElement>("#log")!;

  elWs.value = boot.gatewayUrl ?? "";
  elTok.value = boot.token ?? "";
  elRemember.checked = Boolean(localStorage.getItem(STORAGE_GATEWAY_TOKEN));
  elSession.value = localStorage.getItem(STORAGE_SESSION_KEY) ?? "";

  const chatModel: ChatSurfaceModel = createChatModel(elSession.value);

  let client: OpenClawMinimalClient | null = null;

  function log(line: string): void {
    elLog.textContent += `${line}\n`;
    elLog.scrollTop = elLog.scrollHeight;
  }

  function setStatus(text: string, kind: "idle" | "ok" | "err"): void {
    elStatus.textContent = text;
    elStatus.classList.remove("ok", "err");
    if (kind === "ok") {
      elStatus.classList.add("ok");
    }
    if (kind === "err") {
      elStatus.classList.add("err");
    }
  }

  function syncSessionFromInput(): void {
    chatModel.sessionKey = elSession.value.trim();
    if (chatModel.sessionKey) {
      localStorage.setItem(STORAGE_SESSION_KEY, chatModel.sessionKey);
    } else {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  }

  function renderChat(): void {
    elChatErr.textContent = chatModel.lastError ?? "";
    elChatTranscript.replaceChildren(
      ...chatModel.entries.map((e) => {
        const div = document.createElement("div");
        div.className = `chat-msg ${e.role}`;
        div.textContent = `${e.role === "user" ? "You" : e.role === "assistant" ? "Assistant" : "—"}: ${e.text}`;
        return div;
      }),
    );
    elChatTranscript.scrollTop = elChatTranscript.scrollHeight;

    const showStream = chatModel.sending || Boolean(chatModel.streaming);
    if (showStream) {
      elChatStream.hidden = false;
      elChatStream.textContent = chatModel.streaming || "…";
    } else {
      elChatStream.hidden = true;
      elChatStream.textContent = "";
    }

    btnChatStop.disabled = !client?.connected || !chatModel.activeRunId;
    btnChatSend.disabled = !client?.connected || chatModel.sending;
  }

  function setRpcEnabled(on: boolean): void {
    btnStatus.disabled = !on;
    btnChatSessions.disabled = !on;
    btnChatHistory.disabled = !on;
    btnChatSend.disabled = !on || chatModel.sending;
    btnChatStop.disabled = !on || !chatModel.activeRunId;
  }

  function persistInputs(): void {
    const u = elWs.value.trim();
    if (u) {
      localStorage.setItem(STORAGE_GATEWAY_WS_URL, u);
    } else {
      localStorage.removeItem(STORAGE_GATEWAY_WS_URL);
    }
    if (elRemember.checked) {
      const t = elTok.value.trim();
      if (t) {
        localStorage.setItem(STORAGE_GATEWAY_TOKEN, t);
      }
    } else {
      localStorage.removeItem(STORAGE_GATEWAY_TOKEN);
    }
  }

  elSession.addEventListener("change", () => {
    syncSessionFromInput();
  });

  renderChat();

  btnConnect.addEventListener("click", () => {
    if (client) {
      return;
    }
    const url = elWs.value.trim();
    if (!url) {
      setStatus("Enter a WebSocket URL (ws:// or wss://).", "err");
      return;
    }
    persistInputs();
    syncSessionFromInput();
    setStatus("Connecting…", "idle");
    btnConnect.disabled = true;

    client = new OpenClawMinimalClient({
      url,
      token: elTok.value.trim() || undefined,
      password: elPw.value.trim() || undefined,
      onLog: log,
      onHello: (hello) => {
        setStatus(`Connected. Protocol ${hello.protocol ?? "?"}.`, "ok");
        setRpcEnabled(true);
        btnDisconnect.disabled = false;
        log(`hello: ${JSON.stringify(hello, null, 2)}`);
        void (async () => {
          try {
            await client!.request("sessions.subscribe", {});
          } catch {
            // optional
          }
        })();
        renderChat();
      },
      onGatewayEvent: (evt) => {
        if (evt.event === "chat") {
          if (applyChatGatewayEvent(chatModel, evt.payload)) {
            renderChat();
          }
        }
      },
      onClose: ({ code, reason }) => {
        const r = (reason || "").toLowerCase();
        const pairing = r.includes("pairing");
        if (pairing) {
          setStatus(
            "Pairing required — on the gateway host run: openclaw devices list  then  openclaw devices approve <requestId>",
            "err",
          );
          log(
            "Docs: https://docs.openclaw.ai/web/control-ui#device-pairing-first-connection\n" +
              "Only 127.0.0.1 is auto-approved; remote browsers need one-time approval per device profile.",
          );
        } else {
          setStatus(`Closed (${code}) ${reason || ""}`.trim(), "err");
          if (code === 1006) {
            log(
              "1006 = abnormal close (often TLS/proxy/network). Retry; confirm wss:// URL matches your gateway.",
            );
          }
        }
        btnConnect.disabled = false;
        btnDisconnect.disabled = true;
        setRpcEnabled(false);
        client = null;
        chatModel.sending = false;
        chatModel.activeRunId = null;
        renderChat();
      },
    });
    client.start();
  });

  btnDisconnect.addEventListener("click", () => {
    client?.stop();
    client = null;
    btnConnect.disabled = false;
    btnDisconnect.disabled = true;
    setRpcEnabled(false);
    chatModel.sending = false;
    chatModel.activeRunId = null;
    setStatus("Disconnected.", "idle");
    renderChat();
  });

  btnStatus.addEventListener("click", async () => {
    if (!client?.connected) {
      return;
    }
    try {
      const res = await client.request("status", {});
      log(`status: ${JSON.stringify(res, null, 2)}`);
    } catch (e) {
      const msg =
        e instanceof GatewayRequestError ? `${e.gatewayCode}: ${e.message}` : String(e);
      log(`status error: ${msg}`);
    }
  });

  btnClearLog.addEventListener("click", () => {
    elLog.textContent = "";
  });

  btnChatSessions.addEventListener("click", async () => {
    if (!client?.connected) {
      return;
    }
    syncSessionFromInput();
    try {
      const keys = await chatLoadSessions(client);
      log(`sessions (${keys.length}): ${keys.join("\n") || "(none)"}`);
      if (keys.length > 0 && !chatModel.sessionKey) {
        elSession.value = keys[0];
        syncSessionFromInput();
      }
    } catch (e) {
      log(`sessions.list error: ${e instanceof Error ? e.message : e}`);
    }
    renderChat();
  });

  btnChatHistory.addEventListener("click", async () => {
    if (!client?.connected) {
      return;
    }
    syncSessionFromInput();
    await chatLoadHistory(client, chatModel);
    renderChat();
  });

  async function doSendChat(): Promise<void> {
    if (!client?.connected) {
      return;
    }
    syncSessionFromInput();
    const text = elChatInput.value;
    elChatInput.value = "";
    await chatSend(client, chatModel, text);
    renderChat();
  }

  btnChatSend.addEventListener("click", () => void doSendChat());

  elChatInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      void doSendChat();
    }
  });

  btnChatStop.addEventListener("click", async () => {
    if (!client?.connected) {
      return;
    }
    syncSessionFromInput();
    await chatAbort(client, chatModel);
    renderChat();
  });
}
