import type { ReactNode } from "react";

type CtlEmptyPanelProps = {
  title: string;
  body: string;
  footnote?: ReactNode;
};

export function CtlEmptyPanel({ title, body, footnote }: CtlEmptyPanelProps) {
  return (
    <section
      className="rounded-lg border border-dashed border-border-muted bg-surface-status/30 px-4 py-8 text-center sm:px-6"
      aria-label={title}
    >
      <h2 className="text-sm font-medium text-heading">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {footnote ? <div className="mt-4 text-xs text-hint">{footnote}</div> : null}
    </section>
  );
}
