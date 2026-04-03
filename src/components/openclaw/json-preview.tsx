"use client";

export function JsonPreview({ value, maxHeightClassName = "max-h-[28rem]" }: { value: unknown; maxHeightClassName?: string }) {
  const text = JSON.stringify(value, null, 2) ?? "null";
  return (
    <pre
      className={`no-scrollbar overflow-auto rounded-lg border border-border-muted bg-surface-status/50 p-3 text-left text-xs leading-relaxed text-foreground ${maxHeightClassName}`}
    >
      {text}
    </pre>
  );
}
