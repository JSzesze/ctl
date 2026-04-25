"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

/** Live assistant output is plain text so token updates stay cheap; history rows use Streamdown. */
export type StreamingRowProps = {
  text: string;
  activity: string | null;
  thinkingText: string | null;
  /**
   * True when the gateway still has an active run (matches composer Stop).
   * Used to show a fallback “Working…” line when chat `final` cleared `sending`
   * but agent/tool events kept the run alive.
   */
  runActive?: boolean;
};

export function StreamingRow({
  text,
  activity,
  thinkingText,
  runActive = false,
}: StreamingRowProps) {
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const showThinking = Boolean(thinkingText?.trim());
  const showBody = Boolean(text?.trim());
  const trimmedActivity = activity?.trim() ? activity.trim() : null;
  const effectiveActivity =
    trimmedActivity ?? (runActive ? "Working…" : null);

  if (!showBody && !showThinking && effectiveActivity) {
    return (
      <div
        className="flex items-center gap-2 py-1 text-xs text-muted-foreground"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="size-3 animate-spin" />
        <span className="min-w-0 flex-1">{effectiveActivity}</span>
      </div>
    );
  }

  return (
    <div
      className="min-w-0 max-w-full text-[0.8125rem] leading-relaxed text-foreground"
      aria-live="polite"
      aria-busy={Boolean(runActive || trimmedActivity || showThinking || showBody)}
    >
      {effectiveActivity ? (
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 shrink-0 animate-spin" />
          <span className="min-w-0 flex-1">{effectiveActivity}</span>
        </div>
      ) : null}

      {showThinking ? (
        <div className="mb-2 rounded-lg border border-border/50 bg-muted/25">
          <button
            type="button"
            onClick={() => setThinkingOpen((o) => !o)}
            className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/40"
          >
            {thinkingOpen ? (
              <ChevronDown className="size-3 shrink-0" />
            ) : (
              <ChevronRight className="size-3 shrink-0" />
            )}
            <span className="font-medium text-foreground/80">Thinking</span>
            {thinkingText ? (
              <span className="ml-auto text-[10px] text-muted-foreground/80">
                {thinkingText.length.toLocaleString()} chars
              </span>
            ) : null}
          </button>
          {thinkingOpen ? (
            <div className="border-t border-border/40 px-2.5 py-2 text-xs leading-relaxed">
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground">
                {thinkingText ?? ""}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showBody ? (
        <div className="min-w-0 whitespace-pre-wrap break-words">
          {text}
          {runActive ? (
            <span
              className="ml-px inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse rounded-sm bg-primary align-middle"
              aria-hidden
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
