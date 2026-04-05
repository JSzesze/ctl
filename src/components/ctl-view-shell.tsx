import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CtlViewShellProps = {
  title: string;
  /** Optional; omit for dense pages (e.g. dashboards). */
  lede?: string;
  children?: ReactNode;
  /** When lede is set, let it span the content width (e.g. full-width dashboards). */
  ledeFullWidth?: boolean;
};

/**
 * Shared chrome for CTL command views: title, optional one-line purpose, then content.
 */
export function CtlViewShell({ title, lede, children, ledeFullWidth }: CtlViewShellProps) {
  const hasLede = Boolean(lede?.trim());
  return (
    <div className="w-full space-y-6">
      <header
        className={cn("border-b border-border-muted", hasLede ? "space-y-1.5 pb-5" : "pb-4")}
      >
        <h1 className="text-xl font-semibold tracking-tight text-heading">{title}</h1>
        {hasLede ? (
          <p
            className={cn(
              "text-sm leading-relaxed text-muted-foreground",
              !ledeFullWidth && "max-w-2xl",
            )}
          >
            {lede}
          </p>
        ) : null}
      </header>
      {children ? <div className="w-full pb-2">{children}</div> : null}
    </div>
  );
}
