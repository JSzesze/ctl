/** Helpers so real-world budget JSON (string numbers, 0/1 booleans, etc.) still parses. */

export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "").trim();
}

export function coerceFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

export function coerceBooleanLoose(v: unknown): boolean | null {
  if (typeof v === "boolean") {
    return v;
  }
  if (v === 0 || v === 1) {
    return v === 1;
  }
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") {
      return true;
    }
    if (s === "false" || s === "0" || s === "no") {
      return false;
    }
  }
  return null;
}

/** Accept string or number ids from generators. */
export function coerceString(v: unknown): string | null {
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(v);
  }
  return null;
}
