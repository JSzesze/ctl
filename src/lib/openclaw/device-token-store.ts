/**
 * Per-device gateway-issued token after pairing (hello-ok.auth.deviceToken).
 * Shape aligned with OpenClaw shared store.
 */
const STORAGE_KEY = "openclaw.device.auth.v1";

export type DeviceAuthEntry = {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
};

export type DeviceAuthStore = {
  version: 1;
  deviceId: string;
  tokens: Record<string, DeviceAuthEntry>;
};

function readStore(): DeviceAuthStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DeviceAuthStore;
    if (!parsed || parsed.version !== 1) {
      return null;
    }
    if (!parsed.deviceId || typeof parsed.deviceId !== "string") {
      return null;
    }
    if (!parsed.tokens || typeof parsed.tokens !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStore(store: DeviceAuthStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function loadDeviceAuthToken(deviceId: string, role: string): DeviceAuthEntry | null {
  const store = readStore();
  if (!store || store.deviceId !== deviceId) {
    return null;
  }
  const entry = store.tokens[role.trim()];
  if (!entry || typeof entry.token !== "string") {
    return null;
  }
  return entry;
}

export function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): void {
  const role = params.role.trim();
  const existing = readStore();
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: params.deviceId,
    tokens:
      existing && existing.deviceId === params.deviceId && existing.tokens
        ? { ...existing.tokens }
        : {},
  };
  next.tokens[role] = {
    token: params.token,
    role,
    scopes: Array.isArray(params.scopes) ? [...params.scopes] : [],
    updatedAtMs: Date.now(),
  };
  writeStore(next);
}

export function clearDeviceAuthToken(deviceId: string, role: string): void {
  const store = readStore();
  if (!store || store.deviceId !== deviceId) {
    return;
  }
  const r = role.trim();
  if (!store.tokens[r]) {
    return;
  }
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: store.deviceId,
    tokens: { ...store.tokens },
  };
  delete next.tokens[r];
  writeStore(next);
}
