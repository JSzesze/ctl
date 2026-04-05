"use client";

import { memo, useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useControlChatStream } from "@/components/control-chat-context";
import type { ChatEntry, ChatSurfaceModel } from "@/features/chat/chat-model";
import { ChatScrollButton } from "@/features/chat/chat-scroll-button";
import { ChatViewport } from "@/features/chat/chat-viewport";
import { useChatScrollPin } from "@/features/chat/hooks/use-chat-scroll-pin";
import { StreamingRow } from "@/features/chat/streaming-row";

/**
 * Self-subscribing streaming component. Only THIS tiny component re-renders
 * on every token delta — not the full viewport or message list.
 *
 * Reads directly from the mutable model ref so it always has fresh data
 * without any ancestor needing to re-render.
 */
function StreamingRowLive({ chatModelRef }: { chatModelRef: RefObject<ChatSurfaceModel | null> }) {
  const { chatStreamTick } = useControlChatStream();
  void chatStreamTick;

  const m = chatModelRef.current;
  const activeRunId = m?.activeRunId ?? null;
  const runActive = activeRunId !== null;
  const show = Boolean(
    m && (m.sending || runActive || m.streaming || m.activity || m.streamingThinking),
  );

  if (!show) return null;

  return (
    <StreamingRow
      text={m?.streaming ?? ""}
      activity={m?.activity ?? null}
      thinkingText={m?.streamingThinking ?? null}
      runActive={runActive}
    />
  );
}

export type ChatThreadBodyProps = {
  chatModelRef: RefObject<ChatSurfaceModel | null>;
  visible: readonly ChatEntry[];
  hasMore: boolean;
  onLoadMore: () => void;
  leadingEntryId: string;
  chatLayoutTick: number;
  entryCount: number;
  scrollToBottomRef: RefObject<(() => void) | null>;
};

/**
 * Renders the scrollable message list + streaming row.
 *
 * No longer subscribes to {@link useControlChatStream} — streaming deltas
 * only re-render the inner {@link StreamingRowLive} via React context
 * propagation through the memo boundary (no ChatThreadBody or ChatViewport
 * re-render needed).
 */
export const ChatThreadBody = memo(function ChatThreadBody({
  chatModelRef,
  visible,
  hasMore,
  onLoadMore,
  leadingEntryId,
  chatLayoutTick,
  entryCount,
  scrollToBottomRef,
}: ChatThreadBodyProps) {
  const { scrollRef, contentRef, onScroll, scrollToBottom, pinnedRef } = useChatScrollPin([
    chatLayoutTick,
    visible.length,
  ]);

  useLayoutEffect(() => {
    scrollToBottomRef.current = scrollToBottom;
    return () => {
      scrollToBottomRef.current = null;
    };
  }, [scrollToBottom, scrollToBottomRef]);

  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollBtnTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const handleScroll = useCallback(() => {
    onScroll();
    if (scrollBtnTimer.current) clearTimeout(scrollBtnTimer.current);
    scrollBtnTimer.current = setTimeout(() => {
      setShowScrollBtn(!pinnedRef.current && entryCount > 0);
    }, 100);
  }, [onScroll, pinnedRef, entryCount]);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
    setShowScrollBtn(false);
  }, [scrollToBottom]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ChatViewport
        entries={visible}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        leadingEntryId={leadingEntryId}
        scrollRef={scrollRef}
        contentRef={contentRef}
        onScroll={handleScroll}
      >
        <StreamingRowLive chatModelRef={chatModelRef} />
      </ChatViewport>

      <ChatScrollButton visible={showScrollBtn} onClick={handleScrollToBottom} />
    </div>
  );
});
