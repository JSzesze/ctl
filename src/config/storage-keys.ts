/** localStorage keys for persisted UI state (URLs/tokens are sensitive — treat like secrets). */
export const STORAGE_GATEWAY_WS_URL = "openclaw-minimal.gatewayWsUrl";
export const STORAGE_GATEWAY_TOKEN = "openclaw-minimal.gatewayToken";
export const STORAGE_SESSION_KEY = "openclaw-minimal.sessionKey";
/** Selected agent on the Agents / workspace page (non-secret id string). */
export const STORAGE_SELECTED_AGENT_ID = "openclaw-minimal.selectedAgentId";
export const STORAGE_THEME = "openclaw-minimal.theme";

/** Browser-only Transcribe test panel — not sent to OpenClaw agents (see `docs/http-api.md` for upstream contract). */
export const STORAGE_TRANSCRIBE_ENABLED = "ctl.transcribe.enabled";
export const STORAGE_TRANSCRIBE_BASE_URL = "ctl.transcribe.baseUrl";
export const STORAGE_TRANSCRIBE_LIST_PATH = "ctl.transcribe.listPath";
export const STORAGE_TRANSCRIBE_API_KEY = "ctl.transcribe.apiKey";

/** Scratch notes on Today (TenacitOS-style notepad). */
export const STORAGE_CTL_NOTEPAD = "ctl.notepad.v1";
