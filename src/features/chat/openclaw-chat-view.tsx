"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useControlChat, useControlConnection } from "@/components/control-provider";
import { ChatComposer } from "@/features/chat/chat-composer";
import { ChatScrollButton } from "@/features/chat/chat-scroll-button";
import { ChatSessionBar } from "@/features/chat/chat-session-bar";
import { ChatViewport } from "@/features/chat/chat-viewport";
import { useChatScrollPin } from "@/features/chat/hooks/use-chat-scroll-pin";
import { useWindowedMessages } from "@/features/chat/hooks/use-windowed-messages";
import { StreamingRow } from "@/features/chat/streaming-row";

export function OpenClawChatView() {
  const { hydrated, sessionKey, setSessionKey, connected } = useControlConnection();
  const {
    chatModelRef,
    chatTick,
    chatInput,
    setChatInput,
    sessionList,
    handleChatSessions,
    handleChatHistory,
    handleSendChat,
    handleStopChat,
  } = useControlChat();

  const [historyEpoch, setHistoryEpoch] = useState(0);

  const wrappedLoadHistory = useCallback(async () => {
    await handleChatHistory();
    setHistoryEpoch((e) => e + 1);
  }, [handleChatHistory]);

  const m = chatModelRef.current;
  const entries = m?.entries ?? [];
  const windowResetKey = `${sessionKey}:${historyEpoch}`;
  const { visible, hasMore, loadMore } = useWindowedMessages(entries, windowResetKey);

  const activeRunId = m?.activeRunId ?? null;
  /** Match composer Stop: keep an in-thread row whenever a run is active, not only while `sending` is true. */
  const runActive = activeRunId !== null;
  const showStream = Boolean(
    m && (m.sending || runActive || m.streaming || m.activity || m.streamingThinking),
  );
  const rpcEnabled = connected;
  const chatSending = Boolean(m?.sending);
  const leadingEntryId = visible[0]?.id ?? "";

  const { scrollRef, onScroll, scrollToBottom, pinnedRef } = useChatScrollPin([
    chatTick,
    visible.length,
  ]);

  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollBtnTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const handleScroll = useCallback(() => {
    onScroll();
    if (scrollBtnTimer.current) clearTimeout(scrollBtnTimer.current);
    scrollBtnTimer.current = setTimeout(() => {
      setShowScrollBtn(!pinnedRef.current && entries.length > 0);
    }, 100);
  }, [onScroll, pinnedRef, entries.length]);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
    setShowScrollBtn(false);
  }, [scrollToBottom]);

  const autoLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!connected || !sessionKey.trim()) return;
    const loadKey = `${sessionKey}`;
    if (autoLoadedRef.current === loadKey) return;
    autoLoadedRef.current = loadKey;
    void wrappedLoadHistory();
  }, [connected, sessionKey, wrappedLoadHistory]);

  if (!hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatSessionBar
        sessionKey={sessionKey}
        onSessionKeyChange={setSessionKey}
        connected={connected}
        error={m?.lastError ?? null}
        sessionList={sessionList}
        onLoadSessions={() => void handleChatSessions()}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <ChatViewport
          entries={visible}
          hasMore={hasMore}
          onLoadMore={loadMore}
          leadingEntryId={leadingEntryId}
          scrollRef={scrollRef}
          onScroll={handleScroll}
        >
          {showStream ? (
            <StreamingRow
              text={m?.streaming ?? ""}
              activity={m?.activity ?? null}
              thinkingText={m?.streamingThinking ?? null}
              runActive={runActive}
            />
          ) : null}
        </ChatViewport>

        <ChatScrollButton visible={showScrollBtn} onClick={handleScrollToBottom} />
      </div>

      <ChatComposer
        value={chatInput}
        onChange={setChatInput}
        onSend={handleSendChat}
        onStop={() => void handleStopChat()}
        disabled={!rpcEnabled}
        sending={chatSending}
        hasActiveRun={runActive}
      />
    </div>
  );
}
