/** Best-effort text extraction from gateway chat message shapes (OpenClaw-style). */
export function extractRawText(message: unknown): string | null {
  if (message == null) {
    return null;
  }
  if (typeof message === "string") {
    return message;
  }
  if (typeof message !== "object") {
    return null;
  }
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        if (!p || typeof p !== "object") {
          return null;
        }
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        if (item.type === "image") {
          return "[image]";
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  if (typeof m.text === "string") {
    return m.text;
  }
  return null;
}

export function messageRole(message: unknown): string {
  if (message && typeof message === "object" && typeof (message as { role?: string }).role === "string") {
    return (message as { role: string }).role.toLowerCase();
  }
  return "";
}
