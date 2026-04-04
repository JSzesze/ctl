"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ChatEntry } from "@/features/chat/chat-model";
import { MessageRow } from "@/features/chat/message-row";

export type ChatViewportProps = {
  entries: readonly ChatEntry[];
  hasMore: boolean;
  onLoadMore: () => void;
  leadingEntryId: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  children?: React.ReactNode;
};

export function ChatViewport({
  entries,
  hasMore,
  onLoadMore,
  leadingEntryId,
  scrollRef,
  onScroll,
  children,
}: ChatViewportProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const runLoadMore = useCallback(() => {
    const container = scrollRef.current;
    if (!container || loadingMore.current || !hasMoreRef.current) return;
    loadingMore.current = true;
    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;

    onLoadMoreRef.current();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) {
          el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
        }
        loadingMore.current = false;
      });
    });
  }, [scrollRef]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore) return;

    const observer = new IntersectionObserver(
      (observed) => {
        if (!observed[0]?.isIntersecting || loadingMore.current || !hasMoreRef.current) return;
        runLoadMore();
      },
      { root, rootMargin: "120px 0px 0px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, runLoadMore, leadingEntryId, scrollRef]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-4">
        {hasMore ? (
          <div ref={sentinelRef} className="h-1 w-full shrink-0" aria-hidden="true" />
        ) : null}
        {entries.map((entry) => (
          <MessageRow key={entry.id} entry={entry} />
        ))}
        {children}
      </div>
    </div>
  );
}
