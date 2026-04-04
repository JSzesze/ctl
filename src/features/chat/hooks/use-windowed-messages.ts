import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatEntry } from "@/features/chat/chat-model";

export const DEFAULT_VISIBLE_COUNT = 80;
export const LOAD_MORE_BATCH = 50;

export type WindowedSlice = {
  visible: ChatEntry[];
  /** Global index of `visible[0]` in the full `entries` array. */
  startOffset: number;
  hasMore: boolean;
};

/**
 * Keeps a capped slice of the tail of `entries` in React state for list performance.
 * Call `resetWindow()` after full history replace (e.g. Load history).
 */
export function useWindowedMessages(
  entries: readonly ChatEntry[],
  resetToken: string,
): WindowedSlice & { loadMore: () => void; resetWindow: () => void } {
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_COUNT);

  useEffect(() => {
    setVisibleCount(DEFAULT_VISIBLE_COUNT);
  }, [resetToken]);

  const total = entries.length;
  const floorVisible = Math.min(DEFAULT_VISIBLE_COUNT, total);
  const effectiveVisible = Math.min(total, Math.max(visibleCount, floorVisible));
  const startOffset = Math.max(0, total - effectiveVisible);
  const visible = useMemo(
    () => entries.slice(startOffset),
    [entries, startOffset],
  );
  const hasMore = startOffset > 0;

  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(total, c + LOAD_MORE_BATCH));
  }, [total]);

  const resetWindow = useCallback(() => {
    setVisibleCount(Math.min(DEFAULT_VISIBLE_COUNT, total));
  }, [total]);

  return { visible, startOffset, hasMore, loadMore, resetWindow };
}
