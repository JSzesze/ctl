import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { stripBom } from "@/lib/finance/json-coerce";
import { parseCategorizationPlanFromData, type CategorizationPlan } from "@/lib/finance/categorization-plan-core";

export type {
  CategorizationPlan,
  CategorizationPlanTransaction,
} from "@/lib/finance/categorization-plan-core";

export {
  formatUsdAmount,
  isUncategorizedTransaction,
  parseCategorizationPlanFromData,
  parseCategorizationPlanJson,
  uncategorizedFromPlan,
} from "@/lib/finance/categorization-plan-core";

export function defaultCategorizationPlanPath(): string {
  return path.join(
    /* turbopackIgnore: true — home directory is only known at runtime */
    homedir(),
    "0budget",
    "categorization_plan.json",
  );
}

export function resolveCategorizationPlanPath(): string {
  const fromEnv = process.env.FINANCE_CATEGORIZATION_PLAN_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return defaultCategorizationPlanPath();
}

export type LoadCategorizationPlanResult =
  | { ok: true; path: string; plan: CategorizationPlan }
  | { ok: false; path: string; error: string };

export async function loadCategorizationPlan(): Promise<LoadCategorizationPlanResult> {
  const resolved = resolveCategorizationPlanPath();
  try {
    const text = await readFile(resolved, "utf8");
    let data: unknown;
    try {
      data = JSON.parse(stripBom(text)) as unknown;
    } catch (e: unknown) {
      const msg = e instanceof SyntaxError ? e.message : String(e);
      let full = `Invalid JSON: ${msg}`;
      if (/\.\.\./.test(text) && /transactions/i.test(text)) {
        full +=
          " This file looks like a placeholder (e.g. “…75 transactions…”) — replace it with real JSON from your 0budget export.";
      }
      return { ok: false, path: resolved, error: full };
    }
    const plan = parseCategorizationPlanFromData(data);
    if (!plan) {
      return {
        ok: false,
        path: resolved,
        error:
          "categorization_plan.json does not match the expected shape (transactions[] with id, date, merchant, amount, description, …).",
      };
    }
    return { ok: true, path: resolved, plan };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const code =
      typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string"
        ? (e as { code: string }).code
        : "";
    if (code === "ENOENT") {
      return {
        ok: false,
        path: resolved,
        error: `File not found. Set FINANCE_CATEGORIZATION_PLAN_PATH or place categorization_plan.json in ~/0budget/.`,
      };
    }
    return { ok: false, path: resolved, error: message };
  }
}
