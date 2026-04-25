"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { initSessionFolder } from "@/app/chat/actions";
import { useControlChatLayout } from "@/components/control-chat-context";
import { useControlConnection } from "@/components/control-provider";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ChatComposer } from "@/features/chat/chat-composer";
import { ChatSessionBar } from "@/features/chat/chat-session-bar";
import { ChatThreadBody } from "@/features/chat/chat-thread-body";
import { clearFileArtifactCache } from "@/features/chat/file-artifact-cache";
import type { ChatSurfaceModel } from "@/features/chat/chat-model";
import type { FileArtifact } from "@/features/chat/file-artifact";
import { FilePreviewPanel } from "@/features/chat/file-preview-panel";
import { FilePreviewProvider, useFilePreview } from "@/features/chat/file-preview-context";
import { useWindowedMessages } from "@/features/chat/hooks/use-windowed-messages";
import { SessionFilesBar } from "@/features/chat/session-files-bar";
import type { RefObject } from "react";

function ChatWithOptionalPanel({ children }: { children: ReactNode }) {
  const { artifact } = useFilePreview();
  if (!artifact) {
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  }
  return (
    <ResizablePanelGroup orientation="horizontal" className="flex min-h-0 flex-1">
      <ResizablePanel defaultSize={60} minSize={35} className="flex min-h-0 min-w-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={40} minSize={20} className="flex min-h-0 min-w-0">
        <FilePreviewPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/** Opens the file preview when a live tool result sets `pendingOpenFileArtifact` on the model. */
function PendingFilePreviewOpener({
  chatModelRef,
  chatLayoutTick,
}: {
  chatModelRef: RefObject<ChatSurfaceModel | null>;
  chatLayoutTick: number;
}) {
  const { open } = useFilePreview();

  useLayoutEffect(() => {
    void chatLayoutTick;
    const m = chatModelRef.current;
    const pending = m?.pendingOpenFileArtifact;
    if (!pending || !m) return;
    m.pendingOpenFileArtifact = null;
    open(pending);
  }, [chatLayoutTick, chatModelRef, open]);

  return null;
}

/**
 * Keeps the open file preview in sync with the chat model as tool args/results stream in
 * (preview state is otherwise a stale snapshot).
 */
function FilePreviewLiveSync({
  chatModelRef,
  chatLayoutTick,
}: {
  chatModelRef: RefObject<ChatSurfaceModel | null>;
  chatLayoutTick: number;
}) {
  const { artifact, open } = useFilePreview();

  useLayoutEffect(() => {
    void chatLayoutTick;
    const a = artifact;
    if (!a) return;
    const m = chatModelRef.current;
    if (!m) return;

    let next: FileArtifact | undefined;
    if (a.toolCallId) {
      const e = m.entries.find((x) => x.kind === "tool" && x.toolCallId === a.toolCallId);
      next = e?.fileArtifact;
    } else {
      const path = a.path;
      for (let i = m.entries.length - 1; i >= 0; i--) {
        const e = m.entries[i];
        if (e.kind === "tool" && e.fileArtifact?.path === path) {
          next = e.fileArtifact;
          break;
        }
      }
    }

    if (!next) return;
    if (
      next.content === a.content &&
      next.path === a.path &&
      (next.toolCallId ?? "") === (a.toolCallId ?? "")
    ) {
      return;
    }
    open({
      ...next,
      toolCallId: next.toolCallId ?? a.toolCallId,
    });
  }, [chatLayoutTick, artifact, chatModelRef, open]);

  return null;
}

/** Avoid showing another session’s file in the preview after switching sessions. */
function ClosePreviewOnSessionChange({
  sessionKey,
  chatModelRef,
  historyEpoch,
}: {
  sessionKey: string;
  chatModelRef: RefObject<ChatSurfaceModel | null>;
  historyEpoch: number;
}) {
  const { close } = useFilePreview();
  const prevKey = useRef<string | null>(null);
  const prevEpoch = useRef(historyEpoch);

  useLayoutEffect(() => {
    const keyChanged = prevKey.current !== null && prevKey.current !== sessionKey;
    const epochChanged = prevEpoch.current !== historyEpoch;
    const entriesEmpty = epochChanged && (chatModelRef.current?.entries.length ?? 0) === 0;

    if (keyChanged || entriesEmpty) {
      close();
    }
    prevKey.current = sessionKey;
    prevEpoch.current = historyEpoch;
  }, [sessionKey, historyEpoch, chatModelRef, close]);

  return null;
}

export function OpenClawChatView() {
  const { hydrated, sessionKey, setSessionKey, connected, rpc } = useControlConnection();
  const {
    chatModelRef,
    chatLayoutTick,
    refreshChat,
    chatInput,
    setChatInput,
    sessionList,
    handleChatSessions,
    handleChatHistory,
    handleSendChat,
    handleStopChat,
  } = useControlChatLayout();

  const [historyEpoch, setHistoryEpoch] = useState(0);
  const [filesRefresh, bumpFilesRefresh] = useReducer((x: number) => x + 1, 0);
  /** Drives `SessionFilesBar` workspace scan window; synced from `chatModelRef` activity start. */
  const [sessionFilesSinceMs, setSessionFilesSinceMs] = useState(() => Date.now());

  const wrappedLoadHistory = useCallback(async () => {
    await handleChatHistory();
    setHistoryEpoch((e) => e + 1);
    const m = chatModelRef.current;
    if (m && m.entries.length === 0) {
      m.sessionActivityStartMs = Date.now();
      setSessionFilesSinceMs(m.sessionActivityStartMs);
    }
    bumpFilesRefresh();
  }, [handleChatHistory, chatModelRef]);

  void chatLayoutTick;
  const m = chatModelRef.current;

  const FS_TOOLS = new Set(["write", "edit", "apply_patch", "exec", "bash"]);
  const doneToolCount = (m?.entries ?? []).filter(
    (e) => e.kind === "tool" && e.toolStatus === "done" && e.toolName && FS_TOOLS.has(e.toolName),
  ).length;
  const prevDoneRef = useRef(doneToolCount);
  useEffect(() => {
    if (doneToolCount > prevDoneRef.current) {
      bumpFilesRefresh();
    }
    prevDoneRef.current = doneToolCount;
  }, [doneToolCount]);
  const entries = m?.entries ?? [];
  const windowResetKey = `${sessionKey}:${historyEpoch}`;
  const { visible, hasMore, loadMore } = useWindowedMessages(entries, windowResetKey);

  const activeRunId = m?.activeRunId ?? null;
  const runActive = activeRunId !== null;
  const rpcEnabled = connected;
  const chatSending = Boolean(m?.sending);
  const leadingEntryId = visible[0]?.id ?? "";

  const scrollToBottomRef = useRef<(() => void) | null>(null);

  const handleComposerSend = useCallback(async () => {
    scrollToBottomRef.current?.();
    await handleSendChat();
  }, [handleSendChat]);

  const handleNewSession = useCallback(async () => {
    if (!connected) return;
    try {
      await rpc("chat.send", { sessionKey, message: "/new", deliver: false });
    } catch { /* ignore */ }
  }, [connected, rpc, sessionKey]);

  /** Sync model + clear stale messages immediately when the session key changes (before history fetch). */
  useLayoutEffect(() => {
    if (!hydrated) return;
    const model = chatModelRef.current;
    if (!model) return;
    const sk = sessionKey.trim();
    const prevSk = model.sessionKey.trim();
    if (prevSk !== sk) {
      clearFileArtifactCache();
      model.pendingOpenFileArtifact = null;
      model.sessionActivityStartMs = Date.now();
      setSessionFilesSinceMs(model.sessionActivityStartMs);
    } else if (sk && model.sessionActivityStartMs == null) {
      model.sessionActivityStartMs = Date.now();
      setSessionFilesSinceMs(model.sessionActivityStartMs);
    }
    model.sessionKey = sk;
    model.entries = [];
    model.streaming = "";
    model.streamingThinking = null;
    model.activeRunId = null;
    model.activity = null;
    model.sending = false;
    model.lastError = null;
    refreshChat();
  }, [hydrated, sessionKey, refreshChat]);

  /** Create the session folder on disk and ensure the ctl-ui skill exists. */
  useEffect(() => {
    const sk = sessionKey.trim();
    if (!sk) return;
    void initSessionFolder(sk);
  }, [sessionKey]);

  useEffect(() => {
    if (!connected || !sessionKey.trim()) return;
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
    <FilePreviewProvider>
      <ClosePreviewOnSessionChange sessionKey={sessionKey} chatModelRef={chatModelRef} historyEpoch={historyEpoch} />
      <PendingFilePreviewOpener chatModelRef={chatModelRef} chatLayoutTick={chatLayoutTick} />
      <FilePreviewLiveSync chatModelRef={chatModelRef} chatLayoutTick={chatLayoutTick} />
      <ChatWithOptionalPanel>
        <ChatSessionBar
          sessionKey={sessionKey}
          onSessionKeyChange={setSessionKey}
          connected={connected}
          error={m?.lastError ?? null}
          sessionList={sessionList}
          onLoadSessions={() => void handleChatSessions()}
          onNewSession={() => void handleNewSession()}
          rpc={rpc}
        />

        <ChatThreadBody
          chatModelRef={chatModelRef}
          visible={visible}
          hasMore={hasMore}
          onLoadMore={loadMore}
          leadingEntryId={leadingEntryId}
          chatLayoutTick={chatLayoutTick}
          entryCount={entries.length}
          scrollToBottomRef={scrollToBottomRef}
        />

        <SessionFilesBar
          chatModelRef={chatModelRef}
          sessionKey={sessionKey}
          refreshSignal={filesRefresh}
          sinceMs={sessionFilesSinceMs}
        />

        <ChatComposer
          value={chatInput}
          onChange={setChatInput}
          onSend={() => void handleComposerSend()}
          onStop={() => void handleStopChat()}
          disabled={!rpcEnabled}
          sending={chatSending}
          hasActiveRun={runActive}
        />
      </ChatWithOptionalPanel>
    </FilePreviewProvider>
  );
}
