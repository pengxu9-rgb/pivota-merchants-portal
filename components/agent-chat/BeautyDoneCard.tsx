"use client";

import { useBeautyStore } from "./BeautyStoreContext";
import { AgentBubble } from "./AgentBubble";
import { AiTip } from "./AiTip";
import { ReplyChip } from "./ReplyChip";

export function BeautyDoneCard() {
  const outcomes = useBeautyStore((s) => s.outcomes);
  const setScreen = useBeautyStore((s) => s.setScreen);

  let merchantWritten = 0;
  let payloadOwned = 0;
  for (const productOutcomes of Object.values(outcomes)) {
    for (const o of Object.values(productOutcomes)) {
      if (o === "written") merchantWritten += 1;
      if (o === "skipped_payload_owned") payloadOwned += 1;
    }
  }

  return (
    <AgentBubble>
      <h2
        className="p-serif"
        style={{ fontSize: 22, margin: 0, marginBottom: 8, color: "var(--p-neutral-900)" }}
      >
        Done — your beauty catalog is more complete.
      </h2>

      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
        {merchantWritten > 0 && (
          <>
            You authored <strong>{merchantWritten}</strong> field
            {merchantWritten !== 1 ? "s" : ""}. AI agents can now answer ingredient,
            usage, and skin-type questions for those products.{" "}
          </>
        )}
        {payloadOwned > 0 && (
          <>
            <strong>{payloadOwned}</strong> field
            {payloadOwned !== 1 ? "s were" : " was"} managed by Shopify — we left those untouched.{" "}
          </>
        )}
      </p>

      <AiTip title="What changes for shoppers">
        Shoppers who ask &ldquo;Does this have parabens?&rdquo; or &ldquo;Is this safe for sensitive skin?&rdquo;
        will now get accurate answers pulled directly from what you just added.
      </AiTip>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <ReplyChip onClick={() => setScreen("trigger")}>
          Review remaining products
        </ReplyChip>
      </div>
    </AgentBubble>
  );
}
