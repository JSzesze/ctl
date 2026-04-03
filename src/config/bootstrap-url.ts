import {
  STORAGE_GATEWAY_TOKEN,
  STORAGE_GATEWAY_WS_URL,
} from "@/config/storage-keys";

/**
 * Reads optional `gatewayUrl` / `token` from the current URL, strips them from the address bar,
 * then falls back to localStorage (see OpenClaw Control UI bootstrap behavior).
 */
export function readBootstrapFromUrl(): { gatewayUrl: string | null; token: string | null } {
  const params = new URLSearchParams(window.location.search);
  let gatewayUrl = params.get("gatewayUrl");
  const hashRaw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hash = new URLSearchParams(hashRaw);
  let token = hash.get("token") ?? params.get("token");

  if (gatewayUrl || token) {
    const next = new URL(window.location.href);
    next.searchParams.delete("gatewayUrl");
    next.searchParams.delete("token");
    next.hash = "";
    window.history.replaceState({}, "", next.toString());
  }

  if (!gatewayUrl) {
    gatewayUrl = localStorage.getItem(STORAGE_GATEWAY_WS_URL);
  }
  if (!token) {
    token = localStorage.getItem(STORAGE_GATEWAY_TOKEN);
  }

  return {
    gatewayUrl: gatewayUrl?.trim() || null,
    token: token?.trim() || null,
  };
}
