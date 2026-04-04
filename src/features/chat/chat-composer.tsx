"use client";

import { useRef, useEffect, useCallback } from "react";
import { ArrowUp, Square } from "lucide-react";

export type ChatComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled: boolean;
  sending: boolean;
  hasActiveRun: boolean;
};

const MAX_ROWS = 6;
const LINE_HEIGHT = 20;
const PAD = 18;

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  sending,
  hasActiveRun,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxH = LINE_HEIGHT * MAX_ROWS + PAD;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, []);

  useEffect(() => resize(), [value, resize]);

  const canSend = !disabled && !sending && value.trim().length > 0;

  return (
    <div className="shrink-0 bg-background pb-3">
      <div className="mx-auto max-w-2xl px-4">
        <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-muted/30 px-3 py-2 shadow-sm transition-colors focus-within:border-ring focus-within:bg-background">
          <textarea
            ref={textareaRef}
            className="min-h-[1.75rem] flex-1 resize-none bg-transparent text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Message…"
            autoComplete="off"
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                if (canSend) onSend();
              }
            }}
          />
          {hasActiveRun ? (
            <button
              type="button"
              onClick={onStop}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
              aria-label="Stop generation"
            >
              <Square className="size-3" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSend}
              onClick={() => void onSend()}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-20"
              aria-label="Send message"
            >
              <ArrowUp className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
