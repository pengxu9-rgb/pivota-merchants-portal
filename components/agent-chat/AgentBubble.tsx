/**
 * Pivota agent message bubble.
 *
 * Visual: 32px purple-gradient avatar circle with a Sparkles glyph,
 * 12px gap to the body content. Body has no chrome — it inherits
 * the chat surface background.
 *
 * Per the design handoff, agent bubbles can contain rich content
 * (stat strips, cards, action chips), so this component accepts
 * arbitrary children rather than a string.
 */
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function AgentBubble({ children }: { children: ReactNode }) {
  return (
    <div className="p-bubble">
      <div className="p-bubble-avatar" aria-hidden>
        <Sparkles size={16} strokeWidth={2.2} />
      </div>
      <div className="p-bubble-body">{children}</div>
    </div>
  );
}
