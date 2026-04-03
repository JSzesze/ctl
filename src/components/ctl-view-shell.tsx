import type { ReactNode } from "react";

type CtlViewShellProps = {
  title: string;
  lede: string;
  children?: ReactNode;
};

/**
 * Shared chrome for CTL command views: title, one-line purpose, then content.
 */
export function CtlViewShell({ title, lede, children }: CtlViewShellProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5 border-b border-border-muted pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-heading">{title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">{lede}</p>
      </header>
      {children ? <div className="pb-2">{children}</div> : null}
    </div>
  );
}
