import {
  coerceBooleanLoose,
  coerceFiniteNumber,
  coerceString,
  stripBom,
} from "@/lib/finance/json-coerce";

export type CategorizationPlanTransaction = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  /** Account / sub-account label from the plan (e.g. checking name). */
  account: string | null;
  description: string;
  isPending: boolean;
  proposedCategory: string | null;
  confidence: string | null;
  notes: string | null;
  /** Keys present in the JSON beyond the standard fields above (forward-compatible). */
  extras?: Record<string, unknown>;
};

export type CategorizationPlan = {
  generatedAt: string;
  totalTransactions: number;
  instructions: string;
  transactions: CategorizationPlanTransaction[];
};

/** Matches the plan rules: null, empty, or SKIP means not assigned to a budget category. */
export function isUncategorizedTransaction(t: CategorizationPlanTransaction): boolean {
  const c = t.proposedCategory;
  if (c == null || c.trim() === "") {
    return true;
  }
  return c === "SKIP";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseTransaction(raw: unknown): CategorizationPlanTransaction | null {
  if (!isRecord(raw)) {
    return null;
  }
  const id = coerceString(raw.id);
  const date = coerceString(raw.date);
  const merchant = coerceString(raw.merchant);
  const amount = coerceFiniteNumber(raw.amount);
  const description = coerceString(raw.description);
  if (
    id == null ||
    id === "" ||
    date == null ||
    merchant == null ||
    amount == null ||
    description == null
  ) {
    return null;
  }
  let isPending: boolean;
  if (raw.isPending === undefined) {
    isPending = false;
  } else {
    const p = coerceBooleanLoose(raw.isPending);
    if (p === null) {
      return null;
    }
    isPending = p;
  }
  const account =
    raw.account === null || raw.account === undefined || raw.account === ""
      ? null
      : coerceString(raw.account);
  const proposedCategory =
    raw.proposedCategory === null || raw.proposedCategory === undefined
      ? null
      : coerceString(raw.proposedCategory);
  const confidence =
    raw.confidence === null || raw.confidence === undefined
      ? null
      : coerceString(raw.confidence);
  const notes =
    raw.notes === null || raw.notes === undefined ? null : coerceString(raw.notes);

  const knownKeys = new Set([
    "id",
    "date",
    "merchant",
    "amount",
    "account",
    "description",
    "isPending",
    "proposedCategory",
    "confidence",
    "notes",
  ]);
  const extras: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key)) {
      extras[key] = raw[key];
    }
  }

  const row: CategorizationPlanTransaction = {
    id,
    date,
    merchant,
    amount,
    account,
    description,
    isPending,
    proposedCategory,
    confidence,
    notes,
  };
  if (Object.keys(extras).length > 0) {
    row.extras = extras;
  }
  return row;
}

/** Parse already-parsed JSON value (used for clearer loader errors). */
export function parseCategorizationPlanFromData(data: unknown): CategorizationPlan | null {
  if (!isRecord(data)) {
    return null;
  }
  const generatedAt =
    typeof data.generatedAt === "string"
      ? data.generatedAt
      : coerceString(data.generatedAt) ?? "";
  const instructions =
    typeof data.instructions === "string"
      ? data.instructions
      : coerceString(data.instructions) ?? "";
  const rawTx = data.transactions;
  let rawTxList: unknown[];
  if (rawTx === undefined || rawTx === null) {
    rawTxList = [];
  } else if (Array.isArray(rawTx)) {
    rawTxList = rawTx;
  } else {
    return null;
  }
  const transactions: CategorizationPlanTransaction[] = [];
  for (const item of rawTxList) {
    const t = parseTransaction(item);
    if (t) {
      transactions.push(t);
    }
  }
  const totalFromFile = coerceFiniteNumber(data.totalTransactions);
  const totalTransactions = totalFromFile ?? transactions.length;
  return { generatedAt, totalTransactions, instructions, transactions };
}

export function parseCategorizationPlanJson(text: string): CategorizationPlan | null {
  let data: unknown;
  try {
    data = JSON.parse(stripBom(text)) as unknown;
  } catch {
    return null;
  }
  return parseCategorizationPlanFromData(data);
}

export function uncategorizedFromPlan(plan: CategorizationPlan): CategorizationPlanTransaction[] {
  return plan.transactions.filter(isUncategorizedTransaction);
}

export function formatUsdAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
