import type { Metadata } from "next";
import { ControlChatView } from "@/components/control-chat-view";

export const metadata: Metadata = {
  title: "Chat",
};

export default function ChatPage() {
  return <ControlChatView />;
}
