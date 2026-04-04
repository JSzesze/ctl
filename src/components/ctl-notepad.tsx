"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StickyNote, Trash2 } from "lucide-react";
import { STORAGE_CTL_NOTEPAD } from "@/config/storage-keys";

const inputClass =
  "min-h-[10rem] w-full resize-y rounded-md border border-border-input bg-surface-input px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * Local scratch pad with debounced autosave (pattern from TenacitOS Notepad).
 */
export function CtlNotepad() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CTL_NOTEPAD);
      if (!raw) {
        return;
      }
      const data = JSON.parse(raw) as { text?: string; ts?: string };
      setText(typeof data.text === "string" ? data.text : "");
      setLastSaved(data.ts ? new Date(data.ts) : null);
    } catch {
      /* */
    }
  }, []);

  const persist = useCallback((next: string) => {
    const now = new Date();
    try {
      localStorage.setItem(STORAGE_CTL_NOTEPAD, JSON.stringify({ text: next, ts: now.toISOString() }));
    } catch {
      /* private mode */
    }
    setSaved(true);
    setLastSaved(now);
  }, []);

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    setSaved(false);
    saveTimerRef.current = setTimeout(() => {
      persist(text);
    }, 2000);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [text, persist]);

  const clear = () => {
    setText("");
    try {
      localStorage.removeItem(STORAGE_CTL_NOTEPAD);
    } catch {
      /* */
    }
    setSaved(true);
    setLastSaved(null);
  };

  return (
    <div className="flex h-full min-h-[12rem] flex-col overflow-hidden rounded-xl border border-border-muted bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border-muted px-3 py-2">
        <StickyNote className="size-3.5 shrink-0 text-amber-500" aria-hidden />
        <span className="flex-1 text-xs font-medium text-muted-foreground">Notepad</span>
        {!saved ? <span className="text-[0.65rem] text-muted-foreground">Saving…</span> : null}
        {saved && lastSaved ? (
          <span className="text-[0.65rem] tabular-nums text-muted-foreground">
            Saved {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
        <button
          type="button"
          onClick={clear}
          title="Clear notepad"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <textarea
        className={inputClass}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Quick notes for today…"
        spellCheck
        aria-label="Scratch notepad"
      />
    </div>
  );
}
