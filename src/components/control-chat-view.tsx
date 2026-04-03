"use client";

import Link from "next/link";
import { btnClass, primaryBtnClass } from "@/components/control-button-classes";
import { useControl } from "@/components/control-provider";

const inputClass =
  "w-full max-w-[40rem] rounded-md border border-border-input bg-surface-input px-2 py-1.5 text-sm text-foreground";

export function ControlChatView() {
  const {
    hydrated,
    chatModelRef,
    chatTick,
    sessionKey,
    setSessionKey,
    chatInput,
    setChatInput,
    connected,
    handleChatSessions,
    handleChatHistory,
    handleSendChat,
    handleStopChat,
  } = useControl();

  const m = chatModelRef.current;
  const showStream = Boolean(m && (m.sending || m.streaming));
  const rpcEnabled = connected;
  const chatSending = Boolean(m?.sending);
  const activeRunId = m?.activeRunId ?? null;

  if (!hydrated) {
    return <p className="p-4 text-sm text-hint">Loading…</p>;
  }

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold text-heading">Chat</h1>
      <p className="mb-4 text-sm text-hint">
        OpenClaw gateway session. Connect in{" "}
        <Link href="/config" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
          Config
        </Link>
        . Use <strong className="text-foreground">List sessions</strong> to copy a key, or set the default main session
        your gateway uses.
      </p>

      <fieldset
        data-chat-version={chatTick}
        className="mb-4 rounded-lg border border-border-muted px-4 pb-4 pt-3"
      >
        <legend className="px-1.5 text-xs text-legend">Chat</legend>
        <div className="mb-2.5">
          <label htmlFor="session" className="mb-0.5 block text-xs text-label">
            Session key
          </label>
          <input
            id="session"
            type="text"
            className={inputClass}
            placeholder="e.g. agent:main:main or paste from sessions list"
            autoComplete="off"
            value={sessionKey}
            onChange={(e) => setSessionKey(e.target.value)}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btnClass} disabled={!rpcEnabled} onClick={() => void handleChatSessions()}>
            List sessions
          </button>
          <button type="button" className={btnClass} disabled={!rpcEnabled} onClick={() => void handleChatHistory()}>
            Load history
          </button>
          <button
            type="button"
            className={btnClass}
            disabled={!rpcEnabled || !activeRunId}
            onClick={() => void handleStopChat()}
          >
            Stop run
          </button>
        </div>
        <div className="my-1.5 min-h-4 text-sm text-err">{m?.lastError ?? ""}</div>
        <div
          className="mb-2 max-h-[22rem] min-h-48 overflow-auto rounded-lg border border-border-chat bg-surface-chat p-2 text-sm"
          aria-live="polite"
        >
          {(m?.entries ?? []).map((e, i) => (
            <div
              key={i}
              className={`mb-2.5 break-words whitespace-pre-wrap rounded-md px-2 py-1.5 last:mb-0 ${
                e.role === "user"
                  ? "border-l-[3px] border-l-accent-chat-user bg-surface-chat-user"
                  : e.role === "assistant"
                    ? "border-l-[3px] border-l-accent-chat-assistant bg-surface-chat-assistant"
                    : "border-l-[3px] border-l-accent-chat-system bg-surface-chat-system text-sm text-chat-system"
              }`}
            >
              {e.role === "user" ? "You" : e.role === "assistant" ? "Assistant" : "—"}: {e.text}
            </div>
          ))}
        </div>
        {showStream ? (
          <div className="chat-stream mb-2 min-h-6 rounded-md border border-dashed border-border-stream bg-surface-chat-stream px-2 py-1.5 text-sm text-stream whitespace-pre-wrap">
            {m?.streaming || "…"}
          </div>
        ) : null}
        <div className="mb-2.5">
          <label htmlFor="chat-input" className="mb-0.5 block text-xs text-label">
            Message
          </label>
          <textarea
            id="chat-input"
            className={`${inputClass} min-h-16 resize-y font-inherit`}
            placeholder="Message… (sent with deliver: false)"
            autoComplete="off"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                void handleSendChat();
              }
            }}
          />
        </div>
        <div className="my-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryBtnClass}
            disabled={!rpcEnabled || chatSending}
            onClick={() => void handleSendChat()}
          >
            Send
          </button>
        </div>
      </fieldset>
    </>
  );
}
