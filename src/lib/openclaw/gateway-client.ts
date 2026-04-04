import { normalizeGatewayWebSocketUrl } from "@/lib/openclaw/gateway-url";
import { buildDeviceAuthPayload } from "@/lib/openclaw/device-auth-payload";
import { loadDeviceAuthToken, storeDeviceAuthToken } from "@/lib/openclaw/device-token-store";
import {
  loadOrCreateDeviceIdentity,
  signDevicePayload,
  type DeviceIdentity,
} from "@/lib/openclaw/device-identity";

const PROTOCOL = 3 as const;
const ROLE = "operator";
const SCOPES = [
  "operator.admin",
  "operator.read",
  "operator.write",
  "operator.approvals",
  "operator.pairing",
] as const;

/** Same client id/mode as stock Control UI handshake. */
const CLIENT = {
  id: "openclaw-control-ui",
  version: "minimal-ui",
  platform: typeof navigator !== "undefined" ? navigator.platform || "web" : "web",
  mode: "webchat",
} as const;

const CONNECT_FAILED_CLOSE_CODE = 4008;

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export type GatewayHelloOk = {
  type: string;
  protocol?: number;
  auth?: { deviceToken?: string; role?: string; scopes?: string[] };
  policy?: { tickIntervalMs?: number };
};

type ResFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string; details?: unknown };
};

type EventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export class GatewayRequestError extends Error {
  readonly gatewayCode: string;
  readonly details?: unknown;

  constructor(error: { code: string; message: string; details?: unknown }) {
    super(error.message);
    this.name = "GatewayRequestError";
    this.gatewayCode = error.code;
    this.details = error.details;
  }
}

export type GatewayEventNotification = {
  event: string;
  payload?: unknown;
  seq?: number;
};

export type OpenClawClientOptions = {
  url: string;
  /** Shared gateway token (from wizard / config). */
  token?: string;
  password?: string;
  onLog?: (line: string) => void;
  onHello?: (hello: GatewayHelloOk) => void;
  onClose?: (info: { code: number; reason: string }) => void;
  /** All gateway events after connect (e.g. `chat`, `agent`). */
  onGatewayEvent?: (evt: GatewayEventNotification) => void;
};

export class OpenClawMinimalClient {
  private ws: WebSocket | null = null;
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  >();
  private closed = false;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: OpenClawClientOptions) {}

  private log(msg: string): void {
    this.opts.onLog?.(`[${new Date().toISOString()}] ${msg}`);
  }

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    for (const [, p] of this.pending) {
      p.reject(new Error("stopped"));
    }
    this.pending.clear();
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("not connected"));
    }
    const id = generateId();
    const frame = { type: "req", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws!.send(JSON.stringify(frame));
    });
  }

  private connect(): void {
    if (this.closed) {
      return;
    }
    const normalized = normalizeGatewayWebSocketUrl(this.opts.url);
    if (!normalized.ok) {
      this.log(`Invalid WebSocket URL: ${normalized.error}`);
      queueMicrotask(() => this.opts.onClose?.({ code: CONNECT_FAILED_CLOSE_CODE, reason: normalized.error }));
      return;
    }
    const wsUrl = normalized.url;
    this.log(`WebSocket opening ${wsUrl}`);
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "The string did not match the expected pattern.";
      this.log(`WebSocket constructor failed: ${msg}`);
      queueMicrotask(() => this.opts.onClose?.({ code: CONNECT_FAILED_CLOSE_CODE, reason: msg }));
      return;
    }
    this.ws = socket;
    this.ws.addEventListener("open", () => this.queueConnect());
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data ?? "")));
    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      this.log(`WebSocket closed ${ev.code} ${reason}`);
      this.ws = null;
      for (const [, p] of this.pending) {
        p.reject(new Error(`closed: ${reason}`));
      }
      this.pending.clear();
      this.opts.onClose?.({ code: ev.code, reason });
    });
    this.ws.addEventListener("error", () => {
      this.log("WebSocket error");
    });
  }

  private queueConnect(): void {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
    }
    this.connectTimer = setTimeout(() => {
      void this.sendConnect();
    }, 750);
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const frame = parsed as { type?: string };

    if (frame.type === "event") {
      const evt = parsed as EventFrame;
      if (evt.event === "connect.challenge") {
        const nonce =
          evt.payload && typeof (evt.payload as { nonce?: unknown }).nonce === "string"
            ? (evt.payload as { nonce: string }).nonce
            : null;
        if (nonce) {
          this.connectNonce = nonce;
          void this.sendConnect();
        }
        return;
      }
      this.opts.onGatewayEvent?.({
        event: evt.event,
        payload: evt.payload,
        seq: typeof evt.seq === "number" ? evt.seq : undefined,
      });
      return;
    }

    if (frame.type === "res") {
      const res = parsed as ResFrame;
      const pending = this.pending.get(res.id);
      if (!pending) {
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(
          new GatewayRequestError({
            code: res.error?.code ?? "UNAVAILABLE",
            message: res.error?.message ?? "request failed",
            details: res.error?.details,
          }),
        );
      }
    }
  }

  private selectAuth(deviceId: string | null): { authToken?: string; authPassword?: string } {
    const explicit = this.opts.token?.trim() || undefined;
    const password = this.opts.password?.trim() || undefined;
    if (!deviceId) {
      return { authToken: explicit, authPassword: password };
    }
    const stored = loadDeviceAuthToken(deviceId, ROLE);
    const storedToken = stored?.token;
    const authToken = explicit ?? (password ? undefined : storedToken);
    return { authToken, authPassword: password };
  }

  private buildAuth(authToken?: string, authPassword?: string) {
    if (!(authToken || authPassword)) {
      return undefined;
    }
    return {
      token: authToken,
      password: authPassword,
    };
  }

  private async buildDeviceBlock(
    identity: DeviceIdentity,
    connectNonce: string,
    authToken?: string,
  ): Promise<{
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce: string;
  }> {
    const signedAtMs = Date.now();
    const nonce = connectNonce;
    const payload = buildDeviceAuthPayload({
      deviceId: identity.deviceId,
      clientId: CLIENT.id,
      clientMode: CLIENT.mode,
      role: ROLE,
      scopes: [...SCOPES],
      signedAtMs,
      token: authToken ?? null,
      nonce,
    });
    const signature = await signDevicePayload(identity.privateKey, payload);
    return {
      id: identity.deviceId,
      publicKey: identity.publicKey,
      signature,
      signedAt: signedAtMs,
      nonce,
    };
  }

  private async sendConnect(): Promise<void> {
    if (this.connectSent || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const secure = typeof crypto !== "undefined" && !!crypto.subtle;
    if (!secure) {
      this.log(
        "No WebCrypto (page is not a secure context). Connecting without device identity — same as stock Control UI on http://LAN. Prefer http://localhost or https for this dev app. Gateway may require gateway.controlUi.allowInsecureAuth or HTTPS.",
      );
    }

    let identity: DeviceIdentity | null = null;
    if (secure) {
      try {
        identity = await loadOrCreateDeviceIdentity();
      } catch (e) {
        this.log(`Device identity failed: ${e}`);
        this.ws.close(CONNECT_FAILED_CLOSE_CODE, "identity");
        return;
      }
    }

    const authSel = this.selectAuth(identity?.deviceId ?? null);
    const auth = this.buildAuth(authSel.authToken, authSel.authPassword);

    if (!auth) {
      this.log(
        "Missing auth: enter gateway token or password. (Without WebCrypto, cached device tokens are not used — you need the shared gateway token.)",
      );
      this.ws.close(CONNECT_FAILED_CLOSE_CODE, "no auth");
      return;
    }

    const nonce = this.connectNonce ?? "";
    let device:
      | {
          id: string;
          publicKey: string;
          signature: string;
          signedAt: number;
          nonce: string;
        }
      | undefined;
    if (identity) {
      try {
        device = await this.buildDeviceBlock(identity, nonce, authSel.authToken);
      } catch (e) {
        this.log(`Sign failed: ${e}`);
        this.ws.close(CONNECT_FAILED_CLOSE_CODE, "sign");
        return;
      }
    }

    const params: Record<string, unknown> = {
      minProtocol: PROTOCOL,
      maxProtocol: PROTOCOL,
      client: {
        id: CLIENT.id,
        version: CLIENT.version,
        platform: CLIENT.platform,
        mode: CLIENT.mode,
      },
      role: ROLE,
      scopes: [...SCOPES],
      caps: ["tool-events"],
      auth,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "openclaw-minimal",
      locale: typeof navigator !== "undefined" ? navigator.language : "en-US",
    };
    if (device) {
      params.device = device;
    }

    this.log(
      identity
        ? `connect (device ${identity.deviceId.slice(0, 12)}…)`
        : "connect (no device identity — token/password only)",
    );

    try {
      const hello = (await this.request("connect", params)) as GatewayHelloOk;
      if (hello?.auth?.deviceToken && identity) {
        storeDeviceAuthToken({
          deviceId: identity.deviceId,
          role: hello.auth.role ?? ROLE,
          token: hello.auth.deviceToken,
          scopes: hello.auth.scopes ?? [],
        });
        this.log("Stored gateway device token for reconnects.");
      }
      this.opts.onHello?.(hello);
    } catch (err) {
      this.log(`connect failed: ${err instanceof Error ? err.message : err}`);
      this.ws.close(CONNECT_FAILED_CLOSE_CODE, "connect failed");
    }
  }
}
