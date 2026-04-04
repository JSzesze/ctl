import type { Metadata } from "next";
import { OpenClawChatView } from "@/features/chat";

export const metadata: Metadata = {
  title: "Chat",
};

export default function ChatPage() {
  return <OpenClawChatView />;
}
