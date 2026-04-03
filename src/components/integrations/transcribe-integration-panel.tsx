"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { btnClass, primaryBtnClass } from "@/components/control-button-classes";
import {
  STORAGE_TRANSCRIBE_API_KEY,
  STORAGE_TRANSCRIBE_BASE_URL,
  STORAGE_TRANSCRIBE_ENABLED,
  STORAGE_TRANSCRIBE_LIST_PATH,
} from "@/config/storage-keys";
import {
  formatTranscribeCell,
  transcribeDocumentColumnKeys,
  type TranscribeDocumentRow,
} from "@/lib/transcribe-documents";

const inputClass =
  "w-full max-w-[40rem] rounded-md border border-border-input bg-surface-input px-2 py-1.5 text-sm text-foreground";

type ListResponse =
  | { ok: true; documents: TranscribeDocumentRow[]; requestedUrl: string }
  | { error: string; status?: number; snippet?: string; body?: unknown };

export function TranscribeIntegrationPanel() {
  const [hydrated, setHydrated] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [listPath, setListPath] = useState("/documents");
  const [apiKey, setApiKey] = useState("");

  const [rows, setRows] = useState<TranscribeDocumentRow[]>([]);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(STORAGE_TRANSCRIBE_ENABLED) === "1");
      setBaseUrl(localStorage.getItem(STORAGE_TRANSCRIBE_BASE_URL)?.trim() ?? "");
      setListPath(localStorage.getItem(STORAGE_TRANSCRIBE_LIST_PATH)?.trim() || "/documents");
      setApiKey(localStorage.getItem(STORAGE_TRANSCRIBE_API_KEY) ?? "");
    } catch {
      /* private mode */
    }
    setHydrated(true);
  }, []);

  const persistSettings = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_TRANSCRIBE_ENABLED, enabled ? "1" : "0");
      localStorage.setItem(STORAGE_TRANSCRIBE_BASE_URL, baseUrl.trim());
      localStorage.setItem(STORAGE_TRANSCRIBE_LIST_PATH, listPath.trim() || "/documents");
      localStorage.setItem(STORAGE_TRANSCRIBE_API_KEY, apiKey);
    } catch {
      /* */
    }
  }, [apiKey, baseUrl, enabled, listPath]);

  const columns = useMemo(() => transcribeDocumentColumnKeys(rows), [rows]);

  const fetchDocuments = useCallback(async () => {
    if (!enabled) {
      setError("Turn the integration on to load documents.");
      return;
    }
    const bu = baseUrl.trim();
    if (!bu) {
      setError("Set a base URL first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transcribe/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: bu,
          listPath: listPath.trim() || "/documents",
          apiKey: apiKey.trim() || undefined,
        }),
      });
      const json = (await res.json()) as ListResponse;
      if (!res.ok || !("ok" in json) || !json.ok) {
        const err = json as { error?: string; snippet?: string };
        const extra = err.snippet ? ` ${err.snippet}` : "";
        setRows([]);
        setLastUrl(null);
        setError(err.error ? `${err.error}${extra}` : `Request failed (${res.status}).`);
        return;
      }
      setRows(json.documents);
      setLastUrl(json.requestedUrl);
    } catch (e) {
      setRows([]);
      setLastUrl(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiKey, baseUrl, enabled, listPath]);

  if (!hydrated) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-heading">Settings</h2>
        <p className="max-w-2xl text-sm text-muted">
          CTL calls your Transcribe HTTP API through a same-origin proxy (
          <code className="text-xs text-foreground">POST /api/transcribe/documents</code>
          ) so the browser is not blocked by CORS. Match{" "}
          <code className="text-xs text-foreground">baseUrl</code> and{" "}
          <code className="text-xs text-foreground">listPath</code> to{" "}
          <code className="text-xs text-foreground">docs/http-api.md</code> in your Transcribe project.
        </p>

        <label className="flex max-w-[40rem] cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-border-input"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable Transcribe integration
        </label>

        <div className="space-y-1.5">
          <label htmlFor="tr-base" className="text-xs text-label">
            Base URL
          </label>
          <input
            id="tr-base"
            className={inputClass}
            placeholder="http://127.0.0.1:8787"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tr-path" className="text-xs text-label">
            Documents list path
          </label>
          <input
            id="tr-path"
            className={inputClass}
            placeholder="/documents"
            value={listPath}
            onChange={(e) => setListPath(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tr-key" className="text-xs text-label">
            API key (optional)
          </label>
          <input
            id="tr-key"
            type="password"
            className={inputClass}
            placeholder="Bearer token if your API requires it"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryBtnClass} onClick={persistSettings}>
            Save settings
          </button>
          <button
            type="button"
            className={btnClass}
            disabled={loading || !enabled || !baseUrl.trim()}
            onClick={() => void fetchDocuments()}
          >
            {loading ? "Loading…" : "Refresh documents"}
          </button>
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-err-border bg-surface-status px-3 py-2 text-sm text-err-text">{error}</p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-heading">Documents</h2>
          {lastUrl ? (
            <p className="max-w-full truncate text-xs text-muted" title={lastUrl}>
              Last request: <span className="font-mono text-[0.7rem] text-foreground/80">{lastUrl}</span>
            </p>
          ) : null}
        </div>

        {rows.length === 0 && !loading ? (
          <p className="rounded-lg border border-dashed border-border-muted bg-surface-status/40 px-4 py-6 text-center text-sm text-muted">
            {lastUrl
              ? "The response had no document rows we could parse. Check listPath and that the JSON uses an array or a documents/items/data envelope (see normalizeTranscribeDocumentList)."
              : "No rows yet. Save settings, enable the integration, then refresh."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border-muted">
            <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border-muted bg-surface-status/60">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wide text-label"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={`${String(row.id ?? row._id ?? "")}-${i}`}
                    className="border-b border-border-muted/80 odd:bg-background even:bg-surface-status/30"
                  >
                    {columns.map((col) => (
                      <td key={col} className="max-w-[14rem] truncate px-3 py-2 font-mono text-xs text-foreground/90" title={formatTranscribeCell(row[col])}>
                        {formatTranscribeCell(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
