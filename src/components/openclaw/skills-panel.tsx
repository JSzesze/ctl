"use client";

import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { btnClass } from "@/components/control-button-classes";
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
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

type SkillUiStatus = {
  label: "Ready" | "Not Ready";
  title: string;
  detail: "ready" | "disabled" | "inactive";
};

/** Derived UI status from gateway `disabled` + `eligible` (see OpenClaw skills docs). */
function skillRowStatus(s: SkillStatusEntry): SkillUiStatus {
  if (s.disabled) {
    return {
      label: "Not Ready",
      title: "Turned off in skills config (e.g. skills.entries.*.enabled).",
      detail: "disabled",
    };
  }
  if (s.eligible) {
    return {
      label: "Ready",
      title: "Eligible for this session: can be included in the agent prompt and snapshot.",
      detail: "ready",
    };
  }
  return {
    label: "Not Ready",
    title:
      "Enabled in config, but not eligible yet (allowlists, allowBundled, or SKILL.md metadata gates).",
    detail: "inactive",
  };
}

function codeSnippet(s: string): ReactNode {
  return <code className="rounded bg-muted px-1 py-px font-mono text-[0.65rem]">{s}</code>;
}

function StatusInactiveTooltip({ skill }: { skill: SkillStatusEntry }) {
  return (
    <div className="space-y-2 text-xs leading-relaxed">
      <p className="font-medium text-foreground">Why not ready?</p>
      <p className="text-muted-foreground">
        The skill is enabled in config, but OpenClaw does not treat it as eligible yet. Common causes:
      </p>
      <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
        <li>
          <span className="text-foreground">Agent allowlist</span> — when{" "}
          {codeSnippet("agents.defaults.skills")} or {codeSnippet("agents.list[].skills")} is set, only listed skills
          are eligible.
        </li>
        <li>
          <span className="text-foreground">Bundled allowlist</span> — {codeSnippet("skills.allowBundled")} can restrict
          which bundled skills qualify.
        </li>
        <li>
          <span className="text-foreground">SKILL.md metadata</span> — {codeSnippet("metadata.openclaw.requires")}{" "}
          (bins on PATH, env vars, config flags) or {codeSnippet("os")} gating not satisfied.
        </li>
      </ul>
      {skill.blockedByAllowlist ? (
        <p className="text-muted-foreground">
          This row is flagged as blocked by the effective agent allowlist.
        </p>
      ) : null}
      <p className="text-[0.65rem] text-muted-foreground">
        <a
          href="https://docs.openclaw.ai/tools/skills"
          className="text-foreground underline-offset-2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Skills
        </a>
        {" · "}
        <a
          href="https://docs.openclaw.ai/tools/skills-config"
          className="text-foreground underline-offset-2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Skills config
        </a>
      </p>
    </div>
  );
}

function SkillStatusCell({ skill }: { skill: SkillStatusEntry }) {
  const status = skillRowStatus(skill);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dotted border-muted-foreground/60 text-muted-foreground underline-offset-2">
          {status.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-[min(22rem,calc(100vw-2rem))]">
        {status.detail === "inactive" ? (
          <StatusInactiveTooltip skill={skill} />
        ) : (
          <p className="max-w-[18rem] text-xs leading-relaxed">{status.title}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
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
  const [toggleKey, setToggleKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectSkill, setInspectSkill] = useState<SkillStatusEntry | null>(null);
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

  const openInspector = useCallback((s: SkillStatusEntry) => {
    setInspectSkill(s);
    setInspectOpen(true);
    setInspectCopyNotice(null);
  }, []);

  const onInspectOpenChange = useCallback((open: boolean) => {
    setInspectOpen(open);
    if (!open) {
      setInspectSkill(null);
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
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="ctl-skills-workspace" className="mb-0.5 block text-[0.65rem] font-medium text-label">
                Workspace
              </label>
              <select
                id="ctl-skills-workspace"
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
            <p className="text-sm text-muted-foreground">No skills in the status report for this workspace.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border-muted">
              <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-muted bg-surface-status/90 text-xs text-label">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="max-w-[6.5rem] px-3 py-2 font-medium">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="cursor-help border-b border-dotted border-muted-foreground/50">
                            Status
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="start" className="max-w-[18rem] text-xs leading-relaxed">
                          <p>
                            <span className="font-medium text-foreground">Ready</span> — enabled in config and eligible
                            for prompt and snapshot. <span className="font-medium text-foreground">Not Ready</span> — either
                            turned off in config or not eligible yet; hover a cell for details.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </th>
                    <th className="px-3 py-2 font-medium">Path</th>
                    <th className="w-0 px-3 py-2 font-medium whitespace-nowrap">Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((s, i) => {
                    const rowKey = s.skillKey ?? s.name ?? `skill-${i}`;
                    const configKey = s.skillKey ?? s.name;
                    const disabled = Boolean(s.disabled);
                    const toggling = configKey ? toggleKey === configKey : false;
                    const nameForA11y = s.name?.trim() || "skill";
                    const onRowActivate = () => openInspector(s);
                    const onRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowActivate();
                      }
                    };
                    return (
                      <tr
                        key={`${rowKey}-${i}`}
                        tabIndex={0}
                        className="cursor-pointer border-b border-border-muted/80 last:border-0 hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-label={`Open details for ${nameForA11y}`}
                        onClick={onRowActivate}
                        onKeyDown={onRowKeyDown}
                      >
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
                        <td className="px-3 py-2 text-xs">
                          <SkillStatusCell skill={s} />
                        </td>
                        <td className="max-w-[18rem] px-3 py-2 font-mono text-[0.65rem] text-foreground/90">
                          <span className="break-all" title={s.filePath}>
                            {s.filePath ?? s.baseDir ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {configKey ? (
                            <Switch
                              checked={!disabled}
                              disabled={toggling}
                              aria-label={`${nameForA11y} skill`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onCheckedChange={() => {
                                void onToggleSkillEnabled(configKey, disabled);
                              }}
                            />
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
              {inspectSkill
                ? ` · ${skillRowStatus(inspectSkill).label === "Ready" ? "ready" : "not ready"}`
                : ""}
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
                  The gateway may not include full <code className="text-foreground">SKILL.md</code> in{" "}
                  <code className="text-foreground">skills.status</code>. Open the file on the host when needed.
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
