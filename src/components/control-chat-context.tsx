"use client";

import { createContext, useContext, type RefObject } from "react";
import type { ChatSurfaceModel, SessionInfo } from "@/features/chat/chat-model";

/** Chat UI that changes with history, sessions, send/stop — not token deltas. */
export type ControlChatLayoutValue = {
  chatModelRef: RefObject<ChatSurfaceModel | null>;
  chatLayoutTick: number;
  /** Re-read chat model from ref into React (after mutating the model). */
  refreshChat: () => void;
  chatInput: string;
  setChatInput: (v: string) => void;
  sessionList: SessionInfo[];
  handleChatSessions: () => Promise<void>;
  handleChatHistory: () => Promise<void>;
  handleSendChat: () => Promise<void>;
  handleStopChat: () => Promise<void>;
};

/** Isolated from layout so token streaming does not re-render the composer or session bar. */
export type ControlChatStreamValue = {
  chatStreamTick: number;
};

export const ControlChatLayoutContext = createContext<ControlChatLayoutValue | null>(null);
export const ControlChatStreamContext = createContext<ControlChatStreamValue | null>(null);

export function useControlChatLayout(): ControlChatLayoutValue {
  const v = useContext(ControlChatLayoutContext);
  if (!v) {
    throw new Error("useControlChatLayout must be used within ControlProvider");
  }
  return v;
}

export function useControlChatStream(): ControlChatStreamValue {
  const v = useContext(ControlChatStreamContext);
  if (!v) {
    throw new Error("useControlChatStream must be used within ControlProvider");
  }
  return v;
}
