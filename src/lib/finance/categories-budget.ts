import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { stripBom } from "@/lib/finance/json-coerce";
import {
  parseCategoriesBudgetFromData,
  type CategoriesBudgetFile,
} from "@/lib/finance/categories-budget-core";

export type { BudgetCategoryRow, CategoriesBudgetFile } from "@/lib/finance/categories-budget-core";

export { parseCategoriesBudgetFromData, parseCategoriesBudgetJson } from "@/lib/finance/categories-budget-core";

export function defaultCategoriesBudgetPath(): string {
  return path.join(
    /* turbopackIgnore: true */
    homedir(),
    "0budget",
    "categories.json",
  );
}

export function resolveCategoriesBudgetPath(): string {
  const fromEnv = process.env.FINANCE_CATEGORIES_JSON_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return defaultCategoriesBudgetPath();
}

export type LoadCategoriesBudgetResult =
  | { ok: true; path: string; budget: CategoriesBudgetFile }
  | { ok: false; path: string; error: string };

export async function loadCategoriesBudget(): Promise<LoadCategoriesBudgetResult> {
  const resolved = resolveCategoriesBudgetPath();
  try {
    const text = await readFile(resolved, "utf8");
    let data: unknown;
    try {
      data = JSON.parse(stripBom(text)) as unknown;
    } catch (e: unknown) {
      const msg = e instanceof SyntaxError ? e.message : String(e);
      return { ok: false, path: resolved, error: `Invalid JSON: ${msg}` };
    }
    const budget = parseCategoriesBudgetFromData(data);
    if (!budget) {
      return {
        ok: false,
        path: resolved,
        error:
          "categories.json does not match the expected shape (monthKey, month, categories[] with id, name, group, planned, spent, type, color, …).",
      };
    }
    return { ok: true, path: resolved, budget };
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
        error: `File not found. Set FINANCE_CATEGORIES_JSON_PATH or place categories.json in ~/0budget/.`,
      };
    }
    return { ok: false, path: resolved, error: message };
  }
}
