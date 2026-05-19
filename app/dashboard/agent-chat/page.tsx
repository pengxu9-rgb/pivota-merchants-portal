import { AgentChatSurface } from "@/components/agent-chat/AgentChatSurface";

// Server component — the page is a thin wrapper around the client
// `AgentChatSurface`. Marking the page itself as "use client" was
// unnecessary (codex 🟢).
export default function AgentChatPage() {
  return <AgentChatSurface />;
}
