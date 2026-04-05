"use client";

import { useCallback, useEffect, useState } from "react";
import { btnClass, primaryBtnClass } from "@/components/control-button-classes";
import { useControlConnection } from "@/components/control-provider";
import { JsonPreview } from "@/components/openclaw/json-preview";
import { OpenClawDisconnectedHint } from "@/components/openclaw/disconnected-hint";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { STORAGE_SELECTED_AGENT_ID } from "@/config/storage-keys";
import { GatewayRequestError } from "@/lib/openclaw";

type AgentRow = { id: string; name?: string };
type AgentsListPayload = { defaultId?: string; agents?: AgentRow[] };

/** OpenClaw `skills.status` row (`buildWorkspaceSkillStatus`) + optional future fields. */
type SkillStatusEntry = {
  name?: string;
  description?: string;
  source?: string;
  bundled?: boolean;
  filePath?: string;
  baseDir?: string;
  skillKey?: string;
  eligible?: boolean;
  disabled?: boolean;
  blockedByAllowlist?: boolean;
  /** If the gateway ever adds full body (e.g. `content`), show it in the inspector. */
  content?: string;
  /** Original JSON row for the debug section. */
  raw?: unknown;
};

type SkillStatusReport = {
  workspaceDir?: string;
  managedSkillsDir?: string;
  skills?: SkillStatusEntry[];
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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const SKILL_FOLDER_RE = /^[a-z][a-z0-9_]*$/;

function extractNameFromFrontmatter(text: string): string | null {
  const t = text.trimStart();
  if (!t.startsWith("---")) {
    return null;
  }
  const end = t.indexOf("\n---", 3);
  if (end < 0) {
    return null;
  }
  const fm = t.slice(3, end);
  const m = fm.match(/^name:\s*(.+)$/m);
  if (!m?.[1]) {
    return null;
  }
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function localSkillTemplate(folderName: string): string {
  return `---
name: ${folderName}
description: >-
  TODO: One line for the agent — when to use this skill.
---

# ${folderName.replace(/_/g, " ")}

## When to use

-

## Instructions


`;
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeSkillStatusRow(row: unknown): SkillStatusEntry {
  const r = asRecord(row) ?? {};
  const contentRaw = r.content ?? r.body ?? r.markdown ?? r.skillMd;
  const content =
    typeof contentRaw === "string"
      ? contentRaw
      : contentRaw && typeof contentRaw === "object" && typeof (contentRaw as { text?: unknown }).text === "string"
        ? String((contentRaw as { text: string }).text)
        : undefined;
  return {
    name: typeof r.name === "string" ? r.name : undefined,
    description: typeof r.description === "string" ? r.description : undefined,
    source: typeof r.source === "string" ? r.source : undefined,
    bundled: typeof r.bundled === "boolean" ? r.bundled : undefined,
    filePath: typeof r.filePath === "string" ? r.filePath : undefined,
    baseDir: typeof r.baseDir === "string" ? r.baseDir : undefined,
    skillKey: typeof r.skillKey === "string" ? r.skillKey : undefined,
    eligible: typeof r.eligible === "boolean" ? r.eligible : undefined,
    disabled: typeof r.disabled === "boolean" ? r.disabled : undefined,
    blockedByAllowlist: typeof r.blockedByAllowlist === "boolean" ? r.blockedByAllowlist : undefined,
    content,
    raw: row,
  };
}

export function SkillsPanel() {
  const { connected, rpc } = useControlConnection();
  const [agentsPayload, setAgentsPayload] = useState<AgentsListPayload | null>(null);
  const [agentId, setAgentId] = useState("");
  const [statusReport, setStatusReport] = useState<SkillStatusReport | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [installLoading, setInstallLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [toggleKey, setToggleKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clawhubSlug, setClawhubSlug] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<unknown>(null);
  const [localFolderName, setLocalFolderName] = useState("distill");
  const [localSkillBody, setLocalSkillBody] = useState(() => localSkillTemplate("distill"));
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectSkill, setInspectSkill] = useState<SkillStatusEntry | null>(null);
  const [clawhubInspect, setClawhubInspect] = useState<unknown>(null);
  const [clawhubInspectLoading, setClawhubInspectLoading] = useState(false);
  const [clawhubInspectErr, setClawhubInspectErr] = useState<string | null>(null);
  const [inspectCopyNotice, setInspectCopyNotice] = useState<string | null>(null);

  const agents = agentsPayload?.agents ?? [];
  const skills = statusReport?.skills ?? [];

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

  const loadStatus = useCallback(async () => {
    if (!agentId.trim()) {
      setStatusReport(null);
      return;
    }
    setStatusLoading(true);
    setError(null);
    try {
      const raw = (await rpc("skills.status", { agentId })) as unknown;
      const rec = asRecord(raw);
      setStatusReport({
        workspaceDir: typeof rec?.workspaceDir === "string" ? rec.workspaceDir : undefined,
        managedSkillsDir: typeof rec?.managedSkillsDir === "string" ? rec.managedSkillsDir : undefined,
        skills: Array.isArray(rec?.skills) ? (rec.skills as unknown[]).map(normalizeSkillStatusRow) : [],
      });
    } catch (e) {
      setError(formatError(e));
      setStatusReport(null);
    } finally {
      setStatusLoading(false);
    }
  }, [agentId, rpc]);

  useEffect(() => {
    if (!connected) {
      return;
    }
    void loadAgents();
  }, [connected, loadAgents]);

  useEffect(() => {
    if (!connected || !agentId) {
      return;
    }
    void loadStatus();
  }, [agentId, connected, loadStatus]);

  const inspectSlug =
    inspectSkill?.skillKey?.trim() || inspectSkill?.name?.trim() || "";

  useEffect(() => {
    if (!inspectOpen || !inspectSkill || !inspectSlug) {
      setClawhubInspect(null);
      setClawhubInspectErr(null);
      setClawhubInspectLoading(false);
      return;
    }
    let cancelled = false;
    setClawhubInspectLoading(true);
    setClawhubInspect(null);
    setClawhubInspectErr(null);
    void rpc("skills.detail", { slug: inspectSlug })
      .then((d) => {
        if (!cancelled) {
          setClawhubInspect(d);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setClawhubInspectErr(formatError(e));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setClawhubInspectLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inspectOpen, inspectSkill, inspectSlug, rpc]);

  const openInspector = useCallback((s: SkillStatusEntry) => {
    setInspectSkill(s);
    setInspectOpen(true);
    setInspectCopyNotice(null);
  }, []);

  const onInspectOpenChange = useCallback((open: boolean) => {
    setInspectOpen(open);
    if (!open) {
      setInspectSkill(null);
      setClawhubInspect(null);
      setClawhubInspectErr(null);
      setInspectCopyNotice(null);
    }
  }, []);

  const copyInspectPath = useCallback(() => {
    const p = inspectSkill?.filePath ?? inspectSkill?.baseDir;
    if (!p) {
      setInspectCopyNotice("No path on this row.");
      return;
    }
    void navigator.clipboard.writeText(p).then(
      () => setInspectCopyNotice("Copied path."),
      () => setInspectCopyNotice("Could not copy."),
    );
  }, [inspectSkill?.baseDir, inspectSkill?.filePath]);

  const onPickAgent = useCallback((id: string) => {
    setAgentId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_SELECTED_AGENT_ID, id);
    }
  }, []);

  const onInstallClawhub = useCallback(async () => {
    const slug = clawhubSlug.trim();
    if (!slug || installLoading) {
      return;
    }
    setInstallLoading(true);
    setError(null);
    try {
      await rpc("skills.install", { source: "clawhub", slug });
      setClawhubSlug("");
      await loadStatus();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setInstallLoading(false);
    }
  }, [clawhubSlug, installLoading, loadStatus, rpc]);

  const onSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q || searchLoading) {
      return;
    }
    setSearchLoading(true);
    setError(null);
    try {
      const raw = (await rpc("skills.search", { query: q, limit: 15 })) as { results?: unknown };
      setSearchResults(raw?.results ?? raw);
    } catch (e) {
      setError(formatError(e));
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  }, [rpc, searchLoading, searchQuery]);

  const onUpdateClawhubAll = useCallback(async () => {
    if (updateLoading) {
      return;
    }
    setUpdateLoading(true);
    setError(null);
    try {
      await rpc("skills.update", { source: "clawhub", all: true });
      await loadStatus();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setUpdateLoading(false);
    }
  }, [loadStatus, rpc, updateLoading]);

  const onToggleSkillEnabled = useCallback(
    async (skillKey: string, isDisabledNow: boolean) => {
      if (!skillKey.trim() || toggleKey) {
        return;
      }
      setToggleKey(skillKey);
      setError(null);
      try {
        await rpc("skills.update", {
          skillKey,
          enabled: !isDisabledNow,
        });
        await loadStatus();
      } catch (e) {
        setError(formatError(e));
      } finally {
        setToggleKey(null);
      }
    },
    [loadStatus, rpc, toggleKey],
  );

  const selectClass =
    "max-w-md rounded-md border border-border-input bg-surface-input px-2 py-1.5 text-sm text-foreground";
  const textareaClass =
    "min-h-[14rem] w-full max-w-3xl rounded-md border border-border-input bg-surface-input px-3 py-2 font-mono text-sm leading-relaxed text-foreground";

  const resolvedSkillPath =
    statusReport?.workspaceDir && localFolderName.trim()
      ? `${statusReport.workspaceDir.replace(/\/+$/, "")}/skills/${localFolderName.trim()}/SKILL.md`
      : `skills/${localFolderName.trim() || "<folder>"}/SKILL.md`;

  const onLocalMdFile = useCallback((file: File | null) => {
    setLocalNotice(null);
    if (!file) {
      return;
    }
    void file.text().then((text) => {
      setLocalSkillBody(text);
      const fromFm = extractNameFromFrontmatter(text);
      if (fromFm && SKILL_FOLDER_RE.test(fromFm)) {
        setLocalFolderName(fromFm);
      }
      setLocalNotice(`Loaded ${file.name} (${text.length} chars).`);
    });
  }, []);

  const onDownloadLocalSkill = useCallback(() => {
    setLocalNotice(null);
    const folder = localFolderName.trim();
    if (!SKILL_FOLDER_RE.test(folder)) {
      setLocalNotice("Folder name must be snake_case: a–z start, then a–z, 0–9, underscores.");
      return;
    }
    const body = localSkillBody;
    if (!body.trim()) {
      setLocalNotice("Paste or upload SKILL.md content first.");
      return;
    }
    triggerDownload("SKILL.md", body);
    setLocalNotice(`Downloaded SKILL.md — place it at ${resolvedSkillPath} on the gateway host, then Refresh skills.`);
  }, [localFolderName, localSkillBody, resolvedSkillPath]);

  const onCopyLocalSkill = useCallback(() => {
    setLocalNotice(null);
    const body = localSkillBody;
    if (!body.trim()) {
      setLocalNotice("Nothing to copy.");
      return;
    }
    void navigator.clipboard.writeText(body).then(
      () => setLocalNotice("Copied SKILL.md contents to clipboard."),
      () => setLocalNotice("Could not copy (permission denied)."),
    );
  }, [localSkillBody]);

  const onFillTemplate = useCallback(() => {
    const folder = localFolderName.trim();
    if (!SKILL_FOLDER_RE.test(folder)) {
      setLocalNotice("Set a valid folder name first (snake_case).");
      return;
    }
    setLocalSkillBody(localSkillTemplate(folder));
    setLocalNotice("Filled template — edit frontmatter and body, then download or copy.");
  }, [localFolderName]);

  if (!connected) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <OpenClawDisconnectedHint />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="shrink-0 border-b border-border bg-background px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-heading">Skills</h1>
            <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Gateway RPCs <code className="text-foreground">skills.status</code>,{" "}
              <code className="text-foreground">skills.search</code>, <code className="text-foreground">skills.install</code>
              , <code className="text-foreground">skills.update</code>. Workspace{" "}
              <code className="text-foreground">skills/*/SKILL.md</code> is{" "}
              <span className="text-foreground">not</span> editable through{" "}
              <code className="text-foreground">agents.files.*</code> (those RPCs only allow fixed bootstrap names like{" "}
              <code className="text-foreground">AGENTS.md</code>). Edit SKILL files on disk at the path shown below, or
              install from{" "}
              <a href="https://clawhub.ai" className="text-foreground underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                ClawHub
              </a>{" "}
              (published slugs only — 404 means not on ClawHub). There is no gateway RPC to push arbitrary skill files
              from the browser; use{" "}
              <span className="text-foreground">Local skill</span> below to download or copy, then save on the machine
              that hosts the workspace.
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li>
                <a
                  href="https://docs.openclaw.ai/tools/creating-skills#creating-skills"
                  className="text-foreground underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Creating skills
                </a>
              </li>
              <li>
                <a
                  href="https://docs.openclaw.ai/tools/skills-config"
                  className="text-foreground underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Skills config
                </a>
              </li>
              <li>
                <a
                  href="https://docs.openclaw.ai/tools/skills"
                  className="text-foreground underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Skills (load order &amp; allowlists)
                </a>
              </li>
            </ul>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="ctl-skills-agent" className="mb-0.5 block text-[0.65rem] font-medium text-label">
                Agent
              </label>
              <select
                id="ctl-skills-agent"
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
            <button type="button" className={btnClass} disabled={statusLoading || !agentId} onClick={() => void loadStatus()}>
              {statusLoading ? "Loading…" : "Refresh skills"}
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-err-border bg-surface-status px-4 py-2 sm:px-5">
          <p className="text-sm text-err-text">{error}</p>
        </div>
      ) : null}

      <div className="space-y-6 px-4 py-4 sm:px-5">
        <section className="space-y-3 rounded-xl border border-border-muted bg-surface-status/60 p-4">
          <h2 className="text-sm font-medium text-heading">ClawHub</h2>
          <div className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="ctl-clawhub-slug" className="mb-0.5 block text-[0.65rem] font-medium text-label">
                Install slug
              </label>
              <input
                id="ctl-clawhub-slug"
                className={selectClass}
                placeholder="skill-slug"
                value={clawhubSlug}
                onChange={(e) => setClawhubSlug(e.target.value)}
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              className={primaryBtnClass}
              disabled={installLoading || !clawhubSlug.trim()}
              onClick={() => void onInstallClawhub()}
            >
              {installLoading ? "Installing…" : "Install"}
            </button>
            <button type="button" className={btnClass} disabled={updateLoading} onClick={() => void onUpdateClawhubAll()}>
              {updateLoading ? "Updating…" : "Update all (ClawHub)"}
            </button>
          </div>
          <p className="text-[0.65rem] text-muted-foreground">
            <code className="text-foreground">skills.install</code> / ClawHub updates use the gateway&apos;s default
            agent workspace; switch the main agent in OpenClaw config if installs land in the wrong folder.
          </p>
          <div className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="ctl-skills-search" className="mb-0.5 block text-[0.65rem] font-medium text-label">
                Search ClawHub
              </label>
              <input
                id="ctl-skills-search"
                className={selectClass}
                placeholder="query"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
            </div>
            <button type="button" className={btnClass} disabled={searchLoading || !searchQuery.trim()} onClick={() => void onSearch()}>
              {searchLoading ? "Searching…" : "Search"}
            </button>
          </div>
          {searchResults != null ? (
            <JsonPreview value={searchResults} maxHeightClassName="max-h-56" />
          ) : null}
          <p className="text-[0.65rem] text-muted-foreground">
            A <code className="text-foreground">404 Skill not found</code> from ClawHub means that slug was never
            published there — it is not something CTL can fix. Use the next section for your own markdown.
          </p>
        </section>

        <section className="space-y-3 rounded-xl border border-border-muted bg-surface-status/60 p-4">
          <h2 className="text-sm font-medium text-heading">Local skill (paste or upload)</h2>
          <p className="max-w-3xl text-[0.65rem] leading-relaxed text-muted-foreground">
            Save as <code className="text-foreground">SKILL.md</code> inside{" "}
            <code className="text-foreground">skills/&lt;folder&gt;/</code> on the gateway host (folder name should match{" "}
            <code className="text-foreground">name:</code> in YAML). Then click <span className="text-foreground">Refresh skills</span>{" "}
            or start a new session. Publishing to ClawHub is optional.
          </p>
          <div className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="ctl-local-skill-folder" className="mb-0.5 block text-[0.65rem] font-medium text-label">
                Folder under skills/ (snake_case)
              </label>
              <input
                id="ctl-local-skill-folder"
                className={selectClass}
                value={localFolderName}
                onChange={(e) => setLocalFolderName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[0.65rem] font-medium text-label">Upload .md</label>
              <input
                type="file"
                accept=".md,text/markdown,text/plain"
                className="max-w-xs text-xs file:mr-2"
                onChange={(e) => onLocalMdFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnClass} onClick={onFillTemplate}>
              Fill template
            </button>
            <button type="button" className={primaryBtnClass} onClick={onDownloadLocalSkill}>
              Download SKILL.md
            </button>
            <button type="button" className={btnClass} onClick={onCopyLocalSkill}>
              Copy to clipboard
            </button>
          </div>
          <p className="break-all font-mono text-[0.65rem] text-foreground/90" title={resolvedSkillPath}>
            Target: <code className="text-foreground">{resolvedSkillPath}</code>
          </p>
          <textarea
            className={textareaClass}
            spellCheck={false}
            value={localSkillBody}
            onChange={(e) => setLocalSkillBody(e.target.value)}
            aria-label="Local SKILL.md content"
          />
          {localNotice ? <p className="text-xs text-muted-foreground">{localNotice}</p> : null}
        </section>

        {statusReport?.workspaceDir ? (
          <p className="truncate text-[0.65rem] text-muted-foreground" title={statusReport.workspaceDir}>
            <span className="text-label">Workspace</span>{" "}
            <code className="text-foreground">{statusReport.workspaceDir}</code>
          </p>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-heading">Loaded skills</h2>
          {statusLoading && skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills in the status report for this agent.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border-muted">
              <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-muted bg-surface-status/90 text-xs text-label">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Eligible</th>
                    <th className="px-3 py-2 font-medium">Path</th>
                    <th className="px-3 py-2 font-medium">View</th>
                    <th className="px-3 py-2 font-medium">Config</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((s, i) => {
                    const rowKey = s.skillKey ?? s.name ?? `skill-${i}`;
                    const configKey = s.skillKey ?? s.name;
                    const eligible = Boolean(s.eligible);
                    const disabled = Boolean(s.disabled);
                    const toggling = configKey ? toggleKey === configKey : false;
                    return (
                      <tr key={`${rowKey}-${i}`} className="border-b border-border-muted/80 last:border-0">
                        <td className="max-w-[12rem] px-3 py-2">
                          <div className="font-medium text-foreground">{s.name ?? "—"}</div>
                          {s.description ? (
                            <div className="mt-0.5 text-[0.65rem] text-muted-foreground line-clamp-2">{s.description}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {s.source ?? "—"}
                          {s.bundled ? " · bundled" : ""}
                          {s.blockedByAllowlist ? " · allowlist" : ""}
                        </td>
                        <td className="px-3 py-2 text-xs">{eligible ? "yes" : "no"}</td>
                        <td className="max-w-[18rem] px-3 py-2 font-mono text-[0.65rem] text-foreground/90">
                          <span className="break-all" title={s.filePath}>
                            {s.filePath ?? s.baseDir ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" className={btnClass} onClick={() => openInspector(s)}>
                            View
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          {configKey ? (
                            <button
                              type="button"
                              className={btnClass}
                              disabled={toggling}
                              onClick={() => void onToggleSkillEnabled(configKey, disabled)}
                            >
                              {toggling ? "…" : disabled ? "Enable" : "Disable"}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <details className="rounded-xl border border-border-muted bg-surface-status/50">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-label">Raw skills.status response</summary>
          <div className="border-t border-border-muted p-3">
            <JsonPreview value={statusReport} maxHeightClassName="max-h-48" />
          </div>
        </details>
      </div>

      <Sheet open={inspectOpen} onOpenChange={onInspectOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="shrink-0 border-b border-border-muted px-4 py-3 text-left sm:px-5">
            <SheetTitle className="pr-10">{inspectSkill?.name ?? "Skill"}</SheetTitle>
            <SheetDescription className="text-xs">
              {inspectSkill?.source ?? "—"}
              {inspectSkill?.bundled ? " · bundled" : ""}
              {typeof inspectSkill?.eligible === "boolean" ? ` · eligible: ${inspectSkill.eligible ? "yes" : "no"}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
            {inspectSkill?.description ? (
              <section className="mb-4 space-y-1">
                <h3 className="text-xs font-medium text-label">Description</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{inspectSkill.description}</p>
              </section>
            ) : null}

            {(inspectSkill?.filePath || inspectSkill?.baseDir) && (
              <section className="mb-4 space-y-1">
                <h3 className="text-xs font-medium text-label">On disk</h3>
                <p className="break-all font-mono text-xs text-foreground/90">{inspectSkill.filePath ?? inspectSkill.baseDir}</p>
                <button type="button" className={btnClass} onClick={copyInspectPath}>
                  Copy path
                </button>
                {inspectCopyNotice ? <p className="text-xs text-muted-foreground">{inspectCopyNotice}</p> : null}
                <p className="text-[0.65rem] text-muted-foreground">
                  The gateway does not stream full <code className="text-foreground">SKILL.md</code> in{" "}
                  <code className="text-foreground">skills.status</code>. Open the file on the host, or use{" "}
                  <span className="text-foreground">Local skill</span> above to author a copy here.
                </p>
              </section>
            )}

            {inspectSkill?.content ? (
              <section className="mb-4 space-y-1">
                <h3 className="text-xs font-medium text-label">Skill file body</h3>
                <pre className="max-h-[50vh] overflow-auto rounded-md border border-border-muted bg-muted/30 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                  {inspectSkill.content}
                </pre>
              </section>
            ) : null}

            <section className="mb-4 space-y-1">
              <h3 className="text-xs font-medium text-label">ClawHub package</h3>
              {inspectSlug ? (
                <p className="text-[0.65rem] text-muted-foreground">
                  Tried <code className="text-foreground">skills.detail</code> with slug{" "}
                  <code className="text-foreground">{inspectSlug}</code> (metadata only — not the same as your local file).
                </p>
              ) : null}
              {clawhubInspectLoading ? <p className="text-xs text-muted-foreground">Loading ClawHub…</p> : null}
              {clawhubInspectErr ? <p className="text-xs text-err-text">{clawhubInspectErr}</p> : null}
              {clawhubInspect != null && !clawhubInspectLoading ? (
                <JsonPreview value={clawhubInspect} maxHeightClassName="max-h-48" />
              ) : null}
            </section>

            <details className="rounded-md border border-border-muted bg-surface-status/40">
              <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium text-label">
                Raw skills.status row
              </summary>
              <div className="border-t border-border-muted p-2">
                <JsonPreview value={inspectSkill?.raw ?? null} maxHeightClassName="max-h-40" />
              </div>
            </details>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
