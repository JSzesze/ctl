import type { Metadata } from "next";
import { OpenClawChatView } from "@/features/chat/openclaw-chat-view";

export const metadata: Metadata = {
  title: "Chat",
};

export default function ChatPage() {
  return <OpenClawChatView />;
}
