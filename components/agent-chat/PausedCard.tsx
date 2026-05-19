"use client";

/**
 * Terminal "paused" screen.
 *
 * Distinct from Screen 07 (Done) because the catalog ISN'T covered —
 * the merchant chose to come back later, or marked the remaining
 * products as "no answer known." Pivota's voice is honest: surface
 * exactly what's still missing, with a clear path back into authoring.
 *
 * Codex review caught two ways the prior code landed merchants here
 * accidentally on Screen 07 with copy that said "the catalog is covered":
 *   - DeferCard routed to "done" with a non-empty queue
 *   - markUnknown removed the last product without transitioning
 * Both now route here instead.
 */

import { ArrowRight, Clock } from "lucide-react";

import { useMerchantFashionStore } from "@/lib/merchant-fashion-store";

import { AgentBubble } from "./AgentBubble";
import { ReplyChip } from "./ReplyChip";

export function PausedCard() {
  const queueLength = useMerchantFashionStore((s) => s.queue.length);
  const cadence = useMerchantFashionStore((s) => s.cadence);
  const unknownCount = useMerchantFashionStore((s) => s.unknownProductIds.length);
  const setScreen = useMerchantFashionStore((s) => s.setScreen);

  const cadenceLabel = cadence
    ? cadenceCopy[cadence]
    : "I'll bring this back next time you sync";

  return (
    <AgentBubble>
      <h2
        className="p-serif"
        style={{
          fontSize: 22,
          margin: 0,
          marginBottom: 8,
          color: "var(--p-neutral-900)",
        }}
      >
        Paused — your catalog is live with what we have.
      </h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
        {queueLength > 0 ? (
          <>
            <strong>{queueLength}</strong>{" "}
            {queueLength === 1 ? "product" : "products"} still missing fashion details.
            They&apos;ll surface in search without those fields — agents that ask
            about fabric or care will say <em>not specified</em>.
          </>
        ) : unknownCount > 0 ? (
          <>
            <strong>{unknownCount}</strong>{" "}
            {unknownCount === 1 ? "product" : "products"} marked as &quot;no answer known.&quot;
            I won&apos;t prompt for these again unless you ask.
          </>
        ) : (
          <>You&apos;re paused. I&apos;ll check in on the next sync.</>
        )}
      </p>

      <div
        className="p-tip p-tip--info"
        style={{ marginBottom: 14 }}
      >
        <Clock size={14} strokeWidth={1.8} style={{ flex: "0 0 14px", marginTop: 2 }} />
        <div>
          <div className="p-tip-title">Reminder set</div>
          <div>{cadenceLabel}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {queueLength > 0 ? (
          <ReplyChip
            variant="primary"
            icon={ArrowRight}
            onClick={() => setScreen("structured")}
          >
            Pick up where I left off
          </ReplyChip>
        ) : null}
        <ReplyChip onClick={() => setScreen("trigger")}>
          See what&apos;s still missing
        </ReplyChip>
      </div>
    </AgentBubble>
  );
}

const cadenceCopy: Record<NonNullable<ReturnType<typeof useMerchantFashionStore.getState>["cadence"]>, string> = {
  "1d": "Your browser will remind you tomorrow if you come back to this page.",
  "1w": "Your browser will remind you in a week if you come back to this page.",
  "next-sync": "Next time a sync adds fashion products, I'll surface this again.",
  never: "I won't bring this back automatically. You can return any time from the sidebar.",
};
