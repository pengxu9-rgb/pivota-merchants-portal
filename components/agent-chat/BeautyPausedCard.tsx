"use client";

import { ArrowRight } from "lucide-react";

import { useBeautyStore } from "./BeautyStoreContext";
import { AgentBubble } from "./AgentBubble";
import { ReplyChip } from "./ReplyChip";

const cadenceCopy: Record<string, string> = {
  "1d": "I'll remind you tomorrow",
  "1w": "I'll remind you in a week",
  "next-sync": "I'll bring this back on the next catalog sync",
  never: "Come back whenever you're ready",
};

export function BeautyPausedCard() {
  const queueLength = useBeautyStore((s) => s.queue.length);
  const cadence = useBeautyStore((s) => s.cadence);
  const unknownCount = useBeautyStore((s) => s.unknownProductIds.length);
  const setScreen = useBeautyStore((s) => s.setScreen);

  const cadenceLabel = cadence
    ? cadenceCopy[cadence]
    : "I'll bring this back next time you sync";

  return (
    <AgentBubble>
      <h2
        className="p-serif"
        style={{ fontSize: 22, margin: 0, marginBottom: 8, color: "var(--p-neutral-900)" }}
      >
        Paused — your beauty catalog is live with what we have.
      </h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
        {queueLength > 0 ? (
          <>
            <strong>{queueLength}</strong>{" "}
            {queueLength === 1 ? "product" : "products"} still missing beauty details.
            They&apos;ll appear in search without those fields — AI agents that ask
            about ingredients or skin concerns will say <em>not specified</em>.
          </>
        ) : unknownCount > 0 ? (
          <>
            <strong>{unknownCount}</strong>{" "}
            {unknownCount === 1 ? "product" : "products"} marked as &quot;no answer known.&quot;
            I won&apos;t prompt for these again unless you ask.
          </>
        ) : null}
      </p>
      <p style={{ fontSize: 12.5, color: "var(--p-neutral-500)", margin: 0, marginBottom: 16 }}>
        {cadenceLabel}.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ReplyChip icon={ArrowRight} onClick={() => setScreen("trigger")}>
          Pick back up now
        </ReplyChip>
      </div>
    </AgentBubble>
  );
}
