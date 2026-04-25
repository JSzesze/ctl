"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { ChatEntry } from "@/features/chat/chat-model";
import { MessageRow, ToolClusterRow } from "@/features/chat/message-row";

type ViewChunk =
  | { kind: "single"; entry: ChatEntry }
  | { kind: "tool-cluster"; entries: ChatEntry[] };

function chunkEntriesForView(entries: readonly ChatEntry[]): ViewChunk[] {
  const out: ViewChunk[] = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    if (e.kind === "tool") {
      const group: ChatEntry[] = [e];
      let j = i + 1;
      while (j < entries.length && entries[j].kind === "tool") {
        group.push(entries[j]);
        j++;
      }
      if (group.length >= 2) {
        const anyFileArtifact = group.some((t) => t.fileArtifact);
        if (anyFileArtifact) {
          for (const te of group) {
            out.push({ kind: "single", entry: te });
          }
        } else {
          out.push({ kind: "tool-cluster", entries: group });
        }
      } else {
        out.push({ kind: "single", entry: group[0] });
      }
      i = j;
    } else {
      out.push({ kind: "single", entry: e });
      i++;
    }
  }
  return out;
}

/** Memoized so streaming deltas do not re-run Streamdown for every history row. */
const ChatMessageBlocks = memo(function ChatMessageBlocks({
  entries,
}: {
  entries: readonly ChatEntry[];
}) {
  const chunks = useMemo(() => chunkEntriesForView(entries), [entries]);
  return (
    <>
      {chunks.map((chunk) => {
        const key =
          chunk.kind === "tool-cluster"
            ? `cluster:${chunk.entries[0]?.id ?? "t"}`
            : chunk.entry.id;
        return (
          <div key={key} className="cv-msg">
            {chunk.kind === "tool-cluster" ? (
              <ToolClusterRow entries={chunk.entries} />
            ) : (
              <MessageRow entry={chunk.entry} />
            )}
          </div>
        );
      })}
    </>
  );
});

export type ChatViewportProps = {
  entries: readonly ChatEntry[];
  hasMore: boolean;
  onLoadMore: () => void;
  leadingEntryId: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  children?: React.ReactNode;
};

export function ChatViewport({
  entries,
  hasMore,
  onLoadMore,
  leadingEntryId,
  scrollRef,
  contentRef,
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

  // Passive scroll listener — cannot block the compositor thread.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, onScroll]);

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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain"
    >
      <div ref={contentRef} className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-4">
        {hasMore ? (
          <div ref={sentinelRef} className="h-1 w-full shrink-0" aria-hidden="true" />
        ) : null}
        <ChatMessageBlocks entries={entries} />
        {children}
      </div>
    </div>
  );
}
