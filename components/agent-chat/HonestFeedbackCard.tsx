"use client";

/**
 * Screen 08 — Honest feedback (`skipped_payload_owned`).
 *
 * Surfaces writes that didn't take because Shopify metafields are
 * authoritative. Shows the merchant what Shopify said vs what they said
 * verbatim, and offers two paths:
 *   - "Open Shopify to fix there" — deep-link out (correct path, per
 *     current backend policy that Shopify wins).
 *   - "Leave it — move on" — accept Shopify's value as truth (primary).
 *
 * "Override Shopify on these N" is gated on Open Q §5 (policy decision).
 * Until resolved, it routes to a CSM-request flow rather than actually
 * overwriting — the backend treats Shopify as authoritative today.
 */

import { CheckCircle, ExternalLink, Lock } from "lucide-react";

import {
  selectSkippedProducts,
  useMerchantFashionStore,
} from "@/lib/merchant-fashion-store";
import type { FieldName } from "@/types/fashion-authoring";

import { AgentBubble } from "./AgentBubble";
import { ReplyChip } from "./ReplyChip";

const FIELD_LABELS: Record<FieldName, string> = {
  material: "Material",
  care: "Care",
  size_guide: "Size guide",
};

export function HonestFeedbackCard() {
  const skipped = useMerchantFashionStore(selectSkippedProducts);
  const drafts = useMerchantFashionStore((s) => s.drafts);
  const outcomes = useMerchantFashionStore((s) => s.outcomes);
  const setScreen = useMerchantFashionStore((s) => s.setScreen);

  // Count writes that did land vs those that didn't.
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
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.6,
          margin: 0,
          marginBottom: 14,
        }}
      >
        Saved for <strong>{savedCount} fields</strong>.{" "}
        {keptCount > 0 ? (
          <>
            <strong>{keptCount}</strong> already had values in your Shopify store —
            I kept your Shopify value there so you don&apos;t have it set in two
            places telling different stories.
          </>
        ) : null}
      </p>

      <div className="p-card p-card-md" style={{ overflow: "hidden" }}>
        {/* Saved row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: 14,
            borderBottom: "0.5px solid var(--p-border)",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "var(--p-teal-bg)",
              color: "var(--p-teal-icon)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 28px",
            }}
            aria-hidden
          >
            <CheckCircle size={14} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-neutral-900)" }}>
              {savedCount} saved — written to fashion fields
            </div>
            <div style={{ fontSize: 11.5, color: "var(--p-neutral-500)", marginTop: 2 }}>
              Source set to <span className="p-mono">merchant_authored</span>
            </div>
          </div>
        </div>

        {/* Kept row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: 14,
            borderBottom: skipped.length > 0 ? "0.5px solid var(--p-border)" : "none",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "var(--p-tip-bg)",
              color: "var(--p-tip-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 28px",
            }}
            aria-hidden
          >
            <Lock size={14} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-neutral-900)" }}>
              {keptCount} kept — Shopify metafield already set
            </div>
            <div style={{ fontSize: 11.5, color: "var(--p-neutral-500)", marginTop: 2 }}>
              Your Shopify value wins by default. To change it, edit it in Shopify
              and re-sync — or override here (CSM-routed in v1).
            </div>
          </div>
        </div>

        {/* Per-product disclosure */}
        {skipped.length > 0 ? (
          <div style={{ padding: 14 }}>
            <div className="p-eyebrow" style={{ marginBottom: 10 }}>
              The {skipped.length === 1 ? "one" : skipped.length} we kept
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {skipped.map(({ product, skippedFields }) => {
                const draft = drafts[`${product.platform}::${product.platform_product_id}`] || {};
                return (
                  <div
                    key={`${product.platform}-${product.platform_product_id}`}
                    style={{
                      border: "0.5px solid var(--p-border)",
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 44,
                          borderRadius: 6,
                          background: product.image_url
                            ? `url(${product.image_url}) center/cover`
                            : "linear-gradient(135deg, #efe7dc, #f4f4f2)",
                          flex: "0 0 36px",
                        }}
                        aria-hidden
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {product.title}
                        </div>
                        <div className="p-mono" style={{ fontSize: 10.5, color: "var(--p-neutral-500)" }}>
                          {product.sku || product.platform_product_id}
                        </div>
                      </div>
                    </div>
                    {skippedFields.map((f) => (
                      <div
                        key={f}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "80px 1fr",
                          gap: 8,
                          padding: "4px 0",
                          fontSize: 12,
                          borderTop: "0.5px solid var(--p-border)",
                        }}
                      >
                        <div style={{ color: "var(--p-neutral-500)" }}>{FIELD_LABELS[f]}</div>
                        <div>
                          <div style={{ marginBottom: 4 }}>
                            <span
                              className="p-eyebrow"
                              style={{ marginRight: 6, fontSize: 9.5 }}
                            >
                              In Shopify
                            </span>
                            <span style={{ color: "var(--p-neutral-500)" }}>
                              (authoritative)
                            </span>
                          </div>
                          <div>
                            <span
                              className="p-eyebrow"
                              style={{ marginRight: 6, fontSize: 9.5 }}
                            >
                              You said
                            </span>
                            <span style={{ color: "var(--p-neutral-900)" }}>
                              {String((draft as Record<string, unknown>)[f] || "—")}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <ReplyChip variant="primary" onClick={() => setScreen("done")}>
          Leave it — move on
        </ReplyChip>
        <ReplyChip
          icon={ExternalLink}
          onClick={() => {
            // Routing to Shopify admin per platform_product_id is a
            // backend-mapped link; in v1 we use the products dashboard
            // until that mapping lands.
            window.location.href = "/dashboard/integrations";
          }}
        >
          Open Shopify to fix there
        </ReplyChip>
      </div>

      <div
        style={{
          fontSize: 11.5,
          color: "var(--p-neutral-500)",
          marginTop: 10,
        }}
      >
        The PDP will show whichever value is closer to your truth. Right now that&apos;s
        Shopify&apos;s — until you decide otherwise.
      </div>
    </AgentBubble>
  );
}
