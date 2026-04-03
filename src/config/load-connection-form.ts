import { readBootstrapFromUrl } from "@/config/bootstrap-url";
import { STORAGE_GATEWAY_TOKEN, STORAGE_GATEWAY_WS_URL } from "@/config/storage-keys";

/** Safe on SSR (returns empty); on client reads localStorage + URL bootstrap (same order as before). */
export function loadPersistedConnectionForm(): {
  gatewayUrl: string;
  token: string;
  remember: boolean;
} {
  if (typeof window === "undefined") {
    return { gatewayUrl: "", token: "", remember: false };
  }
  const storedUrl = localStorage.getItem(STORAGE_GATEWAY_WS_URL)?.trim() ?? "";
  const storedToken = localStorage.getItem(STORAGE_GATEWAY_TOKEN) ?? "";
  const boot = readBootstrapFromUrl();
  const bootUrl = boot.gatewayUrl?.trim() ?? "";
  const bootTok = boot.token?.trim() ?? "";
  return {
    gatewayUrl: bootUrl || storedUrl,
    token: bootTok || storedToken,
    remember: Boolean(storedToken),
  };
}
