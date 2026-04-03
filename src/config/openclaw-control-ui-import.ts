/**
 * Read persisted settings written by the stock OpenClaw Control UI
 * (`ui/src/ui/storage.ts` in openclaw-src) so CTL can share gateway URL,
 * session selection, theme mode, and (from sessionStorage) the gateway token.
 *
 * We only read; we do not overwrite OpenClaw keys. Import runs when CTL has
 * no value yet for a given field (see load-connection-form / providers).
 */

import type { ThemePreference } from "@/lib/theme-preference";

/** @see openclaw ui/src/ui/storage.ts */
export const OPENCLAW_CONTROL_SETTINGS_PREFIX = "openclaw.control.settings.v1:";
export const OPENCLAW_CONTROL_SETTINGS_LEGACY = "openclaw.control.settings.v1";
export const OPENCLAW_CONTROL_TOKEN_PREFIX = "openclaw.control.token.v1:";

type PersistedUiSettings = {
  gatewayUrl?: string;
  sessionKey?: string;
  lastActiveSessionKey?: string;
  sessionsByGateway?: Record<
    string,
    { sessionKey?: string; lastActiveSessionKey?: string }
  >;
  theme?: string;
  themeMode?: string;
};

function normalizeGatewayTokenScope(gatewayUrl: string): string {
  const trimmed = gatewayUrl.trim();
  if (!trimmed) {
    return "default";
  }
  try {
    const base =
      typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.host}${window.location.pathname || "/"}`
        : undefined;
    const parsed = base ? new URL(trimmed, base) : new URL(trimmed);
    const pathname =
      parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "") || parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return trimmed;
  }
}

function settingsKeyForGateway(gatewayUrl: string): string {
  return `${OPENCLAW_CONTROL_SETTINGS_PREFIX}${normalizeGatewayTokenScope(gatewayUrl)}`;
}

function tokenSessionKeyForGateway(gatewayUrl: string): string {
  return `${OPENCLAW_CONTROL_TOKEN_PREFIX}${normalizeGatewayTokenScope(gatewayUrl)}`;
}

function parseSettingsJson(raw: string): PersistedUiSettings | null {
  try {
    const parsed = JSON.parse(raw) as PersistedUiSettings;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readRawSettingsBlob(storage: Storage): string | null {
  const keysToTry = [
    OPENCLAW_CONTROL_SETTINGS_LEGACY,
    `${OPENCLAW_CONTROL_SETTINGS_PREFIX}default`,
  ];
  for (const k of keysToTry) {
    const raw = storage.getItem(k);
    if (raw?.trim()) {
      return raw;
    }
  }
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k?.startsWith(OPENCLAW_CONTROL_SETTINGS_PREFIX) || k === `${OPENCLAW_CONTROL_SETTINGS_PREFIX}default`) {
      continue;
    }
    const raw = storage.getItem(k);
    if (raw?.trim()) {
      const p = parseSettingsJson(raw);
      if (p?.gatewayUrl?.trim()) {
        return raw;
      }
    }
  }
  return null;
}

/** Parsed Control UI settings from localStorage (any scope we can find). */
export function readOpenclawControlUiSettings(): {
  gatewayUrl: string;
  sessionKey: string;
  themePreference: ThemePreference | null;
} | null {
  if (typeof window === "undefined") {
    return null;
  }
  const storage = window.localStorage;
  let raw = readRawSettingsBlob(storage);
  let parsed: PersistedUiSettings | null = raw ? parseSettingsJson(raw) : null;

  const firstUrl = parsed?.gatewayUrl?.trim();
  if (firstUrl) {
    const scopedRaw = storage.getItem(settingsKeyForGateway(firstUrl));
    if (scopedRaw?.trim()) {
      const scopedParsed = parseSettingsJson(scopedRaw);
      if (scopedParsed) {
        parsed = scopedParsed;
        raw = scopedRaw;
      }
    }
  }

  if (!parsed) {
    return null;
  }

  const gatewayUrl = parsed.gatewayUrl?.trim() ?? "";
  if (!gatewayUrl) {
    return null;
  }

  const scope = normalizeGatewayTokenScope(gatewayUrl);
  const scopedSessions = parsed.sessionsByGateway?.[scope];
  const sessionKey =
    scopedSessions?.lastActiveSessionKey?.trim() ||
    scopedSessions?.sessionKey?.trim() ||
    parsed.lastActiveSessionKey?.trim() ||
    parsed.sessionKey?.trim() ||
    "";

  const mode = parsed.themeMode?.trim().toLowerCase();
  let themePreference: ThemePreference | null = null;
  if (mode === "system" || mode === "light" || mode === "dark") {
    themePreference = mode;
  }

  return {
    gatewayUrl,
    sessionKey,
    themePreference,
  };
}

/** Gateway token stored by Control UI in sessionStorage (per gateway scope). */
export function readOpenclawControlUiSessionToken(gatewayUrl: string): string {
  if (typeof window === "undefined" || !gatewayUrl.trim()) {
    return "";
  }
  try {
    return window.sessionStorage.getItem(tokenSessionKeyForGateway(gatewayUrl))?.trim() ?? "";
  } catch {
    return "";
  }
}
