import { readFile, writeFile } from "node:fs/promises";

import { resolveCategorizationPlanPath } from "@/lib/finance/categorization-plan";

export type UpdateProposedResult = { ok: true } | { ok: false; error: string };

/**
 * Updates `proposedCategory` for one transaction in categorization_plan.json on disk.
 * Preserves all other JSON structure and extra keys on transaction objects.
 */
export async function updateProposedCategoryOnDisk(
  transactionId: string,
  proposedCategory: string | null,
): Promise<UpdateProposedResult> {
  if (typeof transactionId !== "string" || transactionId.trim() === "") {
    return { ok: false, error: "Missing transaction id." };
  }

  const disabled = process.env.FINANCE_DISABLE_PLAN_WRITE?.trim();
  if (disabled === "1" || disabled?.toLowerCase() === "true") {
    return { ok: false, error: "Plan writes are disabled (FINANCE_DISABLE_PLAN_WRITE)." };
  }

  const normalized =
    proposedCategory == null || proposedCategory.trim() === "" ? null : proposedCategory;

  const filePath = resolveCategorizationPlanPath();
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Could not read plan file.";
    return { ok: false, error: msg };
  }

  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON in categorization plan." };
  }

  if (typeof data !== "object" || data === null || !("transactions" in data)) {
    return { ok: false, error: "Plan file is missing transactions." };
  }

  const rawTx = (data as { transactions: unknown }).transactions;
  if (!Array.isArray(rawTx)) {
    return { ok: false, error: "Plan transactions must be an array." };
  }

  let found = false;
  for (let i = 0; i < rawTx.length; i++) {
    const tx = rawTx[i];
    if (typeof tx !== "object" || tx === null) {
      continue;
    }
    const rec = tx as Record<string, unknown>;
    if (rec.id === transactionId) {
      rec.proposedCategory = normalized;
      found = true;
      break;
    }
  }

  if (!found) {
    return { ok: false, error: `No transaction with id "${transactionId}".` };
  }

  const out = `${JSON.stringify(data, null, 2)}\n`;
  try {
    await writeFile(filePath, out, "utf8");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Could not write plan file.";
    return { ok: false, error: msg };
  }

  return { ok: true };
}
