"use client";

import { ArrowRight, Clock, RefreshCcw } from "lucide-react";

import { useMerchantFashionStore } from "@/lib/merchant-fashion-store";
import type { FieldName } from "@/types/fashion-authoring";

import { AgentBubble } from "./AgentBubble";
import { AiTip } from "./AiTip";
import { ProductChip } from "./ProductChip";
import { ReplyChip } from "./ReplyChip";
import { StatStrip } from "./StatStrip";

/**
 * Screen 04 — Trigger surface.
 *
 * First touchpoint after a sync that landed fashion products lacking
 * material/care/size_guide info.
 *
 * v1.2 fixes from preview testing:
 *   - Headline count now reads from `totals.total_incomplete` instead
 *     of `queue.length` (queue was page-limited at 50; the merchant
 *     actually has 146 incomplete on PawStyle)
 *   - StatStrip reads per-field counts from totals, not from the
 *     page-sliced queue
 *   - Dropped the "Tell me about the whole line" chip — it routed to
 *     the same per-product editor as "one at a time" (Screen 05 bulk
 *     free-text is deferred to v2). The misleading framing left users
 *     confused about what they were about to do.
 *   - Dropped the "See all N →" link (no dedicated catalog-fashion-
 *     issues list page exists in v1)
 */
export function TriggerCard() {
  const queue = useMerchantFashionStore((s) => s.queue);
  const totals = useMerchantFashionStore((s) => s.totals);
  const setScreen = useMerchantFashionStore((s) => s.setScreen);

  // Real merchant-wide counts come from totals (queue is page-limited).
  const totalFashion = totals?.fashion_total ?? queue.length;
  const totalIncomplete = totals?.total_incomplete ?? queue.length;
  const populated: Record<FieldName, number> = {
    material: Math.max(0, totalFashion - (totals?.missing_material ?? 0)),
    care: Math.max(0, totalFashion - (totals?.missing_care ?? 0)),
    size_guide: Math.max(0, totalFashion - (totals?.missing_size_guide ?? 0)),
  };

  const sample = queue.slice(0, 3);

  return (
    <AgentBubble>
      {/* Context strip */}
      <div style={{ display: "flex", marginBottom: 12 }}>
        <span
          className="p-pill"
          style={{
            background: "var(--p-surface-muted)",
            padding: "6px 12px",
            cursor: "default",
            fontSize: 11,
          }}
        >
          <RefreshCcw size={12} strokeWidth={1.8} />
          <span>
            Catalog scan · <strong>{totalIncomplete}</strong>{" "}
            {totalIncomplete === 1 ? "product" : "products"} missing fashion details
          </span>
        </span>
      </div>

      {/* Headline */}
      <h2
        className="p-serif"
        style={{
          fontSize: 22,
          margin: 0,
          marginBottom: 8,
          color: "var(--p-neutral-900)",
        }}
      >
        {totalIncomplete > 0
          ? "Quick one — some of your fashion products are missing material info."
          : "Your fashion catalog is fully covered."}
      </h2>

      {/* Body */}
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
        <strong>{totalIncomplete} of your {totalFashion} fashion products</strong>{" "}
        are missing at least one of material, care, or size guide. They&apos;ll still
        show up in shopping searches, but agents asking{" "}
        <em>&quot;is this satin or polyester?&quot;</em> will say{" "}
        <em>not specified</em> instead of pulling your answer.
      </p>

      {/* Stat strip — uses totals so the bars reflect the full catalog */}
      <div style={{ marginBottom: 14 }}>
        <StatStrip populated={populated} total={totalFashion} />
      </div>

      {/* Sample preview — first 3 of whatever's in the current page. */}
      {sample.length > 0 ? (
        <>
          <div
            style={{
              fontSize: 11,
              color: "var(--p-neutral-500)",
              marginBottom: 8,
            }}
          >
            {sample.length === 1
              ? "Sample product missing fashion info:"
              : "A few products missing fashion info:"}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginBottom: 14,
            }}
          >
            {sample.map((p) => (
              <ProductChip key={`${p.platform}-${p.platform_product_id}`} product={p} />
            ))}
          </div>
        </>
      ) : null}

      {/* Follow-up */}
      {totalIncomplete > 0 ? (
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.6,
            margin: 0,
            marginBottom: 14,
            color: "var(--p-neutral-900)",
          }}
        >
          I&apos;ll walk you through them one at a time. Type what you know and skip
          what you don&apos;t — I won&apos;t make anything up.
        </p>
      ) : null}

      {/* Overflow note — surfaces when the merchant has more than what
          the current fetch loaded. v1 loads up to 200 in one request;
          backend supports up to 500. Bigger catalogs need v2's bulk
          paths. Telling the merchant honestly is better than letting
          them wonder why they "ran out" mid-flow. */}
      {totals?.has_more ? (
        <div style={{ marginBottom: 14 }}>
          <AiTip variant="info" title="There are more to come">
            You have <strong>{totalIncomplete}</strong> products needing review.
            I&apos;ll walk you through the first batch now — when you finish,
            come back to this chat and I&apos;ll load the next.
          </AiTip>
        </div>
      ) : null}

      {/* Response chips — simplified to two clear actions. v1.2: dropped
          "Tell me about the whole line" (was Screen 05 bulk free-text,
          deferred to v2); the previous "one at a time" chip is now the
          primary action with clearer copy. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {totalIncomplete > 0 ? (
          <>
            <ReplyChip
              variant="primary"
              icon={ArrowRight}
              onClick={() => setScreen("structured")}
            >
              Start filling these in
            </ReplyChip>
            <ReplyChip icon={Clock} onClick={() => setScreen("defer")}>
              Remind me later
            </ReplyChip>
          </>
        ) : (
          <ReplyChip onClick={() => setScreen("done")}>
            See coverage
          </ReplyChip>
        )}
      </div>
    </AgentBubble>
  );
}
