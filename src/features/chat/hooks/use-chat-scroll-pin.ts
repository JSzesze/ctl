import { useCallback, useLayoutEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 80;

/**
 * Tracks whether the scroll container is "near bottom" and auto-scrolls
 * on content changes only when pinned. Stops auto-scrolling when the user
 * scrolls up to read history.
 *
 * Uses useLayoutEffect so the scroll snap happens before the browser paints,
 * preventing a visible jump when entries are replaced (e.g. history reload).
 */
export function useChatScrollPin(deps: unknown[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distFromBottom <= NEAR_BOTTOM_PX;
  }, []);

  useLayoutEffect(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
  }, []);

  return { scrollRef, onScroll, scrollToBottom, pinnedRef };
}
