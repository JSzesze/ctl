import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 80;

/**
 * Tracks whether the scroll container is "near bottom" and auto-scrolls
 * on content changes only when pinned. Stops auto-scrolling when the user
 * scrolls up to read history.
 *
 * Streaming auto-scroll uses a ResizeObserver on the content element so
 * we only touch scrollTop when the content actually grows — no per-tick
 * forced layouts during React's commit phase.
 *
 * Structural changes (session switch, history load) still use
 * useLayoutEffect for flicker-free snaps before paint.
 */
export function useChatScrollPin(structuralDeps: unknown[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distFromBottom <= NEAR_BOTTOM_PX;
  }, []);

  // Snap to bottom before paint on structural changes (session switch, history load).
  useLayoutEffect(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, structuralDeps);

  // Auto-scroll during streaming: ResizeObserver fires only when the
  // content element's box size actually changes, avoiding the per-tick
  // useLayoutEffect that forced 2-3 synchronous reflows per frame.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const ro = new ResizeObserver(() => {
      if (!pinnedRef.current) return;
      const scroller = scrollRef.current;
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
  }, []);

  return { scrollRef, contentRef, onScroll, scrollToBottom, pinnedRef };
}
