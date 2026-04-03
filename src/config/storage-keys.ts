/** localStorage keys for persisted UI state (URLs/tokens are sensitive — treat like secrets). */
export const STORAGE_GATEWAY_WS_URL = "openclaw-minimal.gatewayWsUrl";
export const STORAGE_GATEWAY_TOKEN = "openclaw-minimal.gatewayToken";
export const STORAGE_SESSION_KEY = "openclaw-minimal.sessionKey";
export const STORAGE_THEME = "openclaw-minimal.theme";

/** Transcribe HTTP integration (see project `docs/http-api.md` for upstream contract). */
export const STORAGE_TRANSCRIBE_ENABLED = "ctl.transcribe.enabled";
export const STORAGE_TRANSCRIBE_BASE_URL = "ctl.transcribe.baseUrl";
export const STORAGE_TRANSCRIBE_LIST_PATH = "ctl.transcribe.listPath";
export const STORAGE_TRANSCRIBE_API_KEY = "ctl.transcribe.apiKey";
