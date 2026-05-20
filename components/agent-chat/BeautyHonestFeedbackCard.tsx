"use client";

import { ExternalLink } from "lucide-react";

import {
  selectSkippedBeautyProducts,
  useBeautyStore,
} from "./BeautyStoreContext";
import { BEAUTY_FIELD_LABELS } from "@/types/beauty-authoring";
import { AgentBubble } from "./AgentBubble";
import { ReplyChip } from "./ReplyChip";

export function BeautyHonestFeedbackCard() {
  const skipped = useBeautyStore(selectSkippedBeautyProducts);
  const outcomes = useBeautyStore((s) => s.outcomes);
  const setScreen = useBeautyStore((s) => s.setScreen);

  let savedCount = 0;
  let keptCount = 0;
  for (const productOutcomes of Object.values(outcomes)) {
    for (const o of Object.values(productOutcomes)) {
      if (o === "written") savedCount += 1;
      if (o === "skipped_payload_owned") keptCount += 1;
    }
  }

  return (
    <AgentBubble>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
        {savedCount > 0 && (
          <>
            Saved <strong>{savedCount}</strong> field{savedCount !== 1 ? "s" : ""}.{" "}
          </>
        )}
        {keptCount > 0 && (
          <>
            <strong>{keptCount}</strong> field{keptCount !== 1 ? "s were" : " was"} owned
            by Shopify — we kept Shopify&apos;s value rather than overwriting it.
          </>
        )}
      </p>

      {skipped.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {skipped.map(({ product, skippedFields }) => (
            <div
              key={`${product.platform}::${product.platform_product_id}`}
              style={{
                background: "var(--p-surface-2)",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12.5,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--p-neutral-900)" }}>
                {product.title}
              </div>
              <div style={{ color: "var(--p-neutral-500)" }}>
                Shopify controls:{" "}
                {skippedFields
                  .map((f) => BEAUTY_FIELD_LABELS[f as keyof typeof BEAUTY_FIELD_LABELS] ?? f)
                  .join(", ")}
              </div>
              <a
                href="https://admin.shopify.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11.5,
                  color: "var(--p-primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 6,
                }}
              >
                Edit in Shopify admin <ExternalLink size={11} strokeWidth={1.8} />
              </a>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ReplyChip onClick={() => setScreen("done")}>Leave it — move on</ReplyChip>
        <ReplyChip onClick={() => setScreen("trigger")}>Back to overview</ReplyChip>
      </div>
    </AgentBubble>
  );
}
