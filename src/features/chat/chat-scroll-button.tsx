"use client";

import { ArrowDown } from "lucide-react";

export type ChatScrollButtonProps = {
  visible: boolean;
  onClick: () => void;
};

export function ChatScrollButton({ visible, onClick }: ChatScrollButtonProps) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm transition-opacity hover:bg-accent"
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="size-3" />
      New messages
    </button>
  );
}
