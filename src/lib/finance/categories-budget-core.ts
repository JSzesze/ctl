import {
  coerceBooleanLoose,
  coerceFiniteNumber,
  coerceString,
  stripBom,
} from "@/lib/finance/json-coerce";

export type BudgetCategoryRow = {
  id: string;
  name: string;
  group: string;
  groupId: string;
  planned: number;
  spent: number;
  remaining: number;
  pending: number;
  type: string;
  isRecurring: boolean;
  color: string;
  extras?: Record<string, unknown>;
};

export type CategoriesBudgetFile = {
  monthKey: string;
  month: string;
  groups: string[];
  totalCategories: number;
  categories: BudgetCategoryRow[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 0budget-style file: groups are objects with nested categories (not a flat categories[] with id/groupId). */
function isNestedGroupsBudgetFormat(data: Record<string, unknown>): boolean {
  const g = data.groups;
  if (!Array.isArray(g) || g.length === 0) {
    return false;
  }
  const first = g[0];
  if (!isRecord(first)) {
    return false;
  }
  return typeof first.name === "string" && Array.isArray(first.categories);
}

const NESTED_CATEGORY_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#64748b",
];

function parseNestedGroupsBudget(data: Record<string, unknown>): CategoriesBudgetFile | null {
  const monthKey = data.monthKey;
  if (typeof monthKey !== "string") {
    return null;
  }
  const month = typeof data.month === "string" ? data.month : monthKey;
  const groupsRaw = data.groups;
  if (!Array.isArray(groupsRaw)) {
    return null;
  }

  const groups: string[] = [];
  const categories: BudgetCategoryRow[] = [];
  let colorIdx = 0;

  for (const g of groupsRaw) {
    if (!isRecord(g)) {
      continue;
    }
    const groupName = typeof g.name === "string" ? g.name : null;
    if (!groupName) {
      continue;
    }
    const cats = g.categories;
    if (!Array.isArray(cats)) {
      continue;
    }
    groups.push(groupName);

    for (const raw of cats) {
      if (!isRecord(raw)) {
        continue;
      }
      const name = typeof raw.name === "string" ? raw.name : null;
      if (!name) {
        continue;
      }
      const planned = coerceFiniteNumber(raw.planned);
      if (planned == null) {
        continue;
      }
      const spent = coerceFiniteNumber(raw.spent ?? raw.received);
      if (spent == null) {
        continue;
      }
      let remaining = coerceFiniteNumber(raw.remaining);
      if (remaining == null) {
        remaining = planned - spent;
      }
      const pending = coerceFiniteNumber(raw.pending) ?? 0;
      const type = groupName.toLowerCase().includes("income") ? "income" : "expense";
      const id = `${groupName}::${name}`;
      const color = NESTED_CATEGORY_COLORS[colorIdx % NESTED_CATEGORY_COLORS.length];
      colorIdx += 1;

      categories.push({
        id,
        name,
        group: groupName,
        groupId: groupName,
        planned,
        spent,
        remaining,
        pending,
        type,
        isRecurring: false,
        color,
      });
    }
  }

  const totalFromFile = coerceFiniteNumber(data.totalCategories);
  const totalCategories = totalFromFile ?? categories.length;
  return { monthKey, month, groups, totalCategories, categories };
}

function parseCategory(raw: unknown): BudgetCategoryRow | null {
  if (!isRecord(raw)) {
    return null;
  }
  const id = coerceString(raw.id);
  const name = coerceString(raw.name);
  const group = coerceString(raw.group);
  const groupId = coerceString(raw.groupId);
  const planned = coerceFiniteNumber(raw.planned);
  const spent = coerceFiniteNumber(raw.spent);
  const remaining = coerceFiniteNumber(raw.remaining);
  const pending = coerceFiniteNumber(raw.pending);
  const type = typeof raw.type === "string" ? raw.type : null;
  const color = typeof raw.color === "string" ? raw.color : null;
  if (
    id == null ||
    id === "" ||
    name == null ||
    group == null ||
    groupId == null ||
    planned == null ||
    spent == null ||
    remaining == null ||
    pending == null ||
    type == null ||
    color == null
  ) {
    return null;
  }
  let isRecurring: boolean;
  if (raw.isRecurring === undefined) {
    isRecurring = false;
  } else {
    const b = coerceBooleanLoose(raw.isRecurring);
    if (b === null) {
      return null;
    }
    isRecurring = b;
  }
  const knownKeys = new Set([
    "id",
    "name",
    "group",
    "groupId",
    "planned",
    "spent",
    "remaining",
    "pending",
    "type",
    "isRecurring",
    "color",
  ]);
  const extras: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key)) {
      extras[key] = raw[key];
    }
  }
  const row: BudgetCategoryRow = {
    id,
    name,
    group,
    groupId,
    planned,
    spent,
    remaining,
    pending,
    type,
    isRecurring,
    color,
  };
  if (Object.keys(extras).length > 0) {
    row.extras = extras;
  }
  return row;
}

/** Parse already-parsed JSON value (used for clearer loader errors). */
export function parseCategoriesBudgetFromData(data: unknown): CategoriesBudgetFile | null {
  if (!isRecord(data)) {
    return null;
  }
  if (isNestedGroupsBudgetFormat(data)) {
    return parseNestedGroupsBudget(data);
  }
  const monthKey = data.monthKey;
  if (typeof monthKey !== "string") {
    return null;
  }
  const month = typeof data.month === "string" ? data.month : monthKey;
  const groupsRaw = data.groups;
  const rawCats = data.categories;
  const groups: string[] = [];
  if (groupsRaw === undefined || groupsRaw === null) {
    /* empty */
  } else if (Array.isArray(groupsRaw)) {
    for (const g of groupsRaw) {
      if (typeof g !== "string") {
        return null;
      }
      groups.push(g);
    }
  } else {
    return null;
  }
  let rawCatsList: unknown[];
  if (rawCats === undefined || rawCats === null) {
    rawCatsList = [];
  } else if (Array.isArray(rawCats)) {
    rawCatsList = rawCats;
  } else {
    return null;
  }
  const categories: BudgetCategoryRow[] = [];
  for (const item of rawCatsList) {
    const c = parseCategory(item);
    if (c) {
      categories.push(c);
    }
  }
  const totalFromFile = coerceFiniteNumber(data.totalCategories);
  const totalCategories = totalFromFile ?? categories.length;
  return { monthKey, month, groups, totalCategories, categories };
}

export function parseCategoriesBudgetJson(text: string): CategoriesBudgetFile | null {
  let data: unknown;
  try {
    data = JSON.parse(stripBom(text)) as unknown;
  } catch {
    return null;
  }
  return parseCategoriesBudgetFromData(data);
}
