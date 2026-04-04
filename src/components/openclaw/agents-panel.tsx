"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { btnClass, primaryBtnClass } from "@/components/control-button-classes";
import { useControlConnection } from "@/components/control-provider";
import { OpenClawDisconnectedHint } from "@/components/openclaw/disconnected-hint";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STORAGE_SELECTED_AGENT_ID } from "@/config/storage-keys";
import { GatewayRequestError } from "@/lib/openclaw";

type AgentRow = {
  id: string;
  name?: string;
  workspace?: string;
};

type AgentsListPayload = {
  defaultId?: string;
  agents?: AgentRow[];
};

type WorkspaceFileRow = {
  name: string;
  missing?: boolean;
  size?: number;
  updatedAtMs?: number;
};

type FilesListPayload = {
  agentId?: string;
  workspace?: string;
  files?: WorkspaceFileRow[];
};

type FileGetPayload = {
  file?: {
    name: string;
    content: string;
    size?: number;
    updatedAtMs?: number;
  };
};

function formatError(e: unknown): string {
  if (e instanceof GatewayRequestError) {
    return `${e.gatewayCode}: ${e.message}`;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return String(e);
}

function fileTabLabel(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] || name;
}

export function AgentsPanel() {
  const { connected, rpc } = useControlConnection();
  const [agentsPayload, setAgentsPayload] = useState<AgentsListPayload | null>(null);
  const [agentId, setAgentId] = useState("");
  const [filesPayload, setFilesPayload] = useState<FilesListPayload | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [loadedMeta, setLoadedMeta] = useState<{ size?: number; updatedAtMs?: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  const [listLoading, setListLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agents = agentsPayload?.agents ?? [];
  const workspacePath = filesPayload?.workspace ?? "";
  const allFiles = filesPayload?.files ?? [];
  const openableFiles = useMemo(() => allFiles.filter((f) => !f.missing), [allFiles]);

  const loadAgents = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const raw = (await rpc("agents.list", {})) as AgentsListPayload;
      setAgentsPayload(raw);
      const rows = raw.agents ?? [];
      const persisted =
        typeof window !== "undefined" ? localStorage.getItem(STORAGE_SELECTED_AGENT_ID)?.trim() : "";
      const pick =
        (persisted && rows.some((a) => a.id === persisted) ? persisted : null) ??
        (raw.defaultId && rows.some((a) => a.id === raw.defaultId) ? raw.defaultId : null) ??
        rows[0]?.id ??
        "";
      setAgentId(pick);
      if (pick && typeof window !== "undefined") {
        localStorage.setItem(STORAGE_SELECTED_AGENT_ID, pick);
      }
    } catch (e) {
      setError(formatError(e));
      setAgentsPayload(null);
      setAgentId("");
    } finally {
      setListLoading(false);
    }
  }, [rpc]);

  const loadFileContent = useCallback(
    async (id: string, name: string) => {
      setFileLoading(true);
      setError(null);
      try {
        const raw = (await rpc("agents.files.get", { agentId: id, name })) as FileGetPayload;
        const f = raw.file;
        if (!f) {
          setEditorText("");
          setLoadedMeta(null);
          setDirty(false);
          return;
        }
        setEditorText(f.content ?? "");
        setLoadedMeta({ size: f.size, updatedAtMs: f.updatedAtMs });
        setDirty(false);
      } catch (e) {
        setError(formatError(e));
        setEditorText("");
        setLoadedMeta(null);
      } finally {
        setFileLoading(false);
      }
    },
    [rpc],
  );

  const loadFiles = useCallback(
    async (id: string, options?: { keepSelection?: boolean; silent?: boolean }) => {
      if (!id.trim()) {
        setFilesPayload(null);
        return;
      }
      if (!options?.silent) {
        setFilesLoading(true);
      }
      setError(null);
      try {
        const raw = (await rpc("agents.files.list", { agentId: id })) as FilesListPayload;
        setFilesPayload(raw);
        if (!options?.keepSelection) {
          const open = (raw.files ?? []).filter((f) => !f.missing);
          const first = open[0]?.name ?? null;
          setSelectedFile(first);
          setEditorText("");
          setLoadedMeta(null);
          setDirty(false);
          if (first) {
            await loadFileContent(id, first);
          }
        }
      } catch (e) {
        setError(formatError(e));
        setFilesPayload(null);
      } finally {
        if (!options?.silent) {
          setFilesLoading(false);
        }
      }
    },
    [loadFileContent, rpc],
  );

  useEffect(() => {
    if (!connected) return;
    void loadAgents();
  }, [connected, loadAgents]);

  useEffect(() => {
    if (!connected || !agentId) return;
    void loadFiles(agentId);
  }, [agentId, connected, loadFiles]);

  const onPickAgent = useCallback((id: string) => {
    setAgentId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_SELECTED_AGENT_ID, id);
    }
  }, []);

  const onTabChange = useCallback(
    (next: string) => {
      if (next === selectedFile) return;
      if (dirty) {
        if (!window.confirm("Discard unsaved changes in this file?")) {
          return;
        }
      }
      setSelectedFile(next);
      void loadFileContent(agentId, next);
    },
    [agentId, dirty, loadFileContent, selectedFile],
  );

  const onSave = useCallback(async () => {
    if (!agentId || !selectedFile || saveLoading) return;
    setSaveLoading(true);
    setError(null);
    try {
      const raw = (await rpc("agents.files.set", {
        agentId,
        name: selectedFile,
        content: editorText,
      })) as FileGetPayload;
      const f = raw.file;
      if (f) {
        setLoadedMeta({ size: f.size, updatedAtMs: f.updatedAtMs });
        setEditorText(f.content ?? editorText);
      }
      setDirty(false);
      await loadFiles(agentId, { keepSelection: true, silent: true });
      if (selectedFile) {
        await loadFileContent(agentId, selectedFile);
      }
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaveLoading(false);
    }
  }, [agentId, editorText, loadFileContent, loadFiles, rpc, saveLoading, selectedFile]);

  const selectClass =
    "max-w-md rounded-md border border-border-input bg-surface-input px-2 py-1.5 text-sm text-foreground";

  const agentLabel = useMemo(() => {
    const row = agents.find((a) => a.id === agentId);
    if (!row) return "";
    return row.name?.trim() ? `${row.name} (${row.id})` : row.id;
  }, [agents, agentId]);

  if (!connected) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <OpenClawDisconnectedHint />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border bg-background px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-heading">Agents</h1>
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
              Gateway workspace files via <code className="text-foreground">agents.files.*</code> — same RPCs as
              the stock Control UI.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="ctl-agent-workspace" className="mb-0.5 block text-[0.65rem] font-medium text-label">
                Agent
              </label>
              <select
                id="ctl-agent-workspace"
                className={selectClass}
                disabled={listLoading || agents.length === 0}
                value={agentId}
                onChange={(e) => onPickAgent(e.target.value)}
              >
                {agents.length === 0 ? (
                  <option value="">No agents</option>
                ) : (
                  agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name?.trim() ? `${a.name} — ${a.id}` : a.id}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button type="button" className={btnClass} disabled={listLoading} onClick={() => void loadAgents()}>
              {listLoading ? "Loading…" : "Refresh agents"}
            </button>
          </div>
        </div>
        {workspacePath ? (
          <p className="mt-2 truncate text-[0.65rem] text-muted-foreground" title={workspacePath}>
            <span className="text-label">Workspace</span>{" "}
            <code className="text-foreground">{workspacePath}</code>
          </p>
        ) : null}
      </header>

      {error ? (
        <div className="shrink-0 border-b border-err-border bg-surface-status px-4 py-2 sm:px-5">
          <p className="text-sm text-err-text">{error}</p>
        </div>
      ) : null}

      {filesLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading files…</div>
      ) : openableFiles.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
          <p>{agentId ? "No workspace files to open for this agent." : "Select an agent."}</p>
          {allFiles.some((f) => f.missing) ? (
            <p className="max-w-md text-xs">Some entries are missing on disk and are hidden from tabs.</p>
          ) : null}
        </div>
      ) : (
        <Tabs
          value={selectedFile ?? ""}
          onValueChange={onTabChange}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 border-b border-border bg-muted/20 px-2 py-2 sm:px-4">
            <TabsList className="w-full justify-start rounded-md border-0 bg-transparent p-0">
              {openableFiles.map((f) => (
                <TabsTrigger
                  key={f.name}
                  value={f.name}
                  title={f.name}
                  className="max-w-[10rem] sm:max-w-[14rem]"
                >
                  <span className="truncate">{fileTabLabel(f.name)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {openableFiles.map((f) => (
            <TabsContent key={f.name} value={f.name} className="flex min-h-0 flex-1 flex-col">
              {selectedFile === f.name ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border-muted px-4 py-2 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-foreground" title={f.name}>
                        {agentLabel ? <span className="text-muted-foreground">{agentLabel} · </span> : null}
                        {f.name}
                      </p>
                      {loadedMeta && !fileLoading ? (
                        <p className="text-[0.65rem] text-muted-foreground">
                          {loadedMeta.size != null ? `${loadedMeta.size} bytes` : null}
                          {loadedMeta.size != null && loadedMeta.updatedAtMs != null ? " · " : null}
                          {loadedMeta.updatedAtMs != null
                            ? `Updated ${new Date(loadedMeta.updatedAtMs).toLocaleString()}`
                            : null}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className={btnClass}
                        disabled={fileLoading}
                        onClick={() => void loadFileContent(agentId, f.name)}
                      >
                        {fileLoading ? "Loading…" : "Reload"}
                      </button>
                      <button
                        type="button"
                        className={primaryBtnClass}
                        disabled={saveLoading || fileLoading || !dirty}
                        onClick={() => void onSave()}
                      >
                        {saveLoading ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="min-h-0 w-full flex-1 resize-none border-0 bg-surface-input px-4 py-3 font-mono text-sm leading-relaxed text-foreground outline-none focus-visible:ring-0 sm:px-5"
                    spellCheck={false}
                    disabled={fileLoading}
                    value={editorText}
                    onChange={(e) => {
                      setEditorText(e.target.value);
                      setDirty(true);
                    }}
                    placeholder={fileLoading ? "Loading…" : "No content."}
                    aria-label={`Workspace file ${f.name}`}
                  />
                </div>
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
