export type TranscribeDocumentRow = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * Normalize list responses from the Transcribe HTTP API.
 * Adjust keys here if your `docs/http-api.md` uses a different envelope.
 */
export function normalizeTranscribeDocumentList(json: unknown): TranscribeDocumentRow[] {
  if (Array.isArray(json)) {
    return json.filter(isPlainObject);
  }
  if (!isPlainObject(json)) {
    return [];
  }
  const envelopeKeys = ["documents", "items", "data", "results", "records", "document"] as const;
  for (const key of envelopeKeys) {
    const v = json[key];
    if (Array.isArray(v)) {
      return v.filter(isPlainObject);
    }
  }
  return [];
}

const PREFERRED_COLUMN_ORDER = [
  "id",
  "title",
  "name",
  "status",
  "state",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
];

export function transcribeDocumentColumnKeys(rows: TranscribeDocumentRow[]): string[] {
  if (rows.length === 0) {
    return [];
  }
  const keys = new Set<string>();
  for (const row of rows.slice(0, 80)) {
    for (const k of Object.keys(row)) {
      keys.add(k);
    }
  }
  const preferred = PREFERRED_COLUMN_ORDER.filter((k) => keys.has(k));
  const rest = [...keys].filter((k) => !preferred.includes(k)).sort();
  return [...preferred, ...rest].slice(0, 14);
}

export function formatTranscribeCell(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
