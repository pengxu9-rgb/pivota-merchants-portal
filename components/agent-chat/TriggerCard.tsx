"use client";

import { Clock, Layers, RefreshCcw, Shirt } from "lucide-react";

import { useMerchantFashionStore } from "@/lib/merchant-fashion-store";
import type { FieldName } from "@/types/fashion-authoring";

import { AgentBubble } from "./AgentBubble";
import { ProductChip } from "./ProductChip";
import { ReplyChip } from "./ReplyChip";
import { StatStrip } from "./StatStrip";

/**
 * Screen 04 — Trigger surface.
 *
 * First-time the merchant sees the agent prompt after a sync that added
 * or changed fashion products lacking material/care/size_guide info.
 *
 * Per design handoff: context strip pill (sync recency), Cormorant
 * headline, body with inline emphasis, 3-col stat strip, sample chips,
 * follow-up text, and 3 response chips.
 *
 * Tap routing per design:
 *   - "Tell you about the whole line" → defer to Screen 06 in v1
 *     (Screen 05 bulk free-text is deferred; see plan Open Q §3)
 *   - "Go one product at a time" → Screen 06 (Structured)
 *   - "Remind me later" → Screen 09 (Defer)
 */
export function TriggerCard() {
  const queue = useMerchantFashionStore((s) => s.queue);
  const setScreen = useMerchantFashionStore((s) => s.setScreen);

  // Per-field populated count for the stat strip. The store's queue is
  // products that need attention — so "missing" is the queue size. We
  // count per-field within the queue.
  const total = queue.length;
  const populated: Record<FieldName, number> = {
    material: 0,
    care: 0,
    size_guide: 0,
  };
  for (const p of queue) {
    (Object.keys(populated) as FieldName[]).forEach((f) => {
      if (p.fields[f].status !== "missing") populated[f] += 1;
    });
  }
  // The stat-strip "missing" bar reads from populated relative to total.
  // We pass the populated counts; the strip computes missing internally.

  const sample = queue.slice(0, 3);
  const remaining = Math.max(0, queue.length - sample.length);

  return (
    <AgentBubble>
      {/* Context strip */}
      <div
        style={{
          display: "flex",
          marginBottom: 12,
        }}
      >
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
            Sync · just now · <strong>{queue.length}</strong>{" "}
            {queue.length === 1 ? "product" : "products"} missing fashion details
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
        Quick one — some of your fashion products are missing material info.
      </h2>

      {/* Body */}
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
        After this sync, <strong>{total} of your fashion products</strong> have no
        material listed. They&apos;ll still show up in shopping searches, but
        agents that ask <em>&quot;is this satin or polyester?&quot;</em> will say{" "}
        <em>not specified</em> instead of pulling your answer.
      </p>

      {/* Stat strip */}
      <div style={{ marginBottom: 14 }}>
        <StatStrip populated={populated} total={total} />
      </div>

      {/* Sample preview */}
      {sample.length > 0 ? (
        <>
          <div
            style={{
              fontSize: 11,
              color: "var(--p-neutral-500)",
              marginBottom: 8,
            }}
          >
            A few of the ones missing material:
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
            {remaining > 0 ? (
              <a
                href="/dashboard/product-optimization"
                style={{
                  fontSize: 12,
                  color: "var(--p-primary)",
                  fontWeight: 500,
                  marginTop: 2,
                  alignSelf: "flex-end",
                }}
              >
                See all {queue.length} →
              </a>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Follow-up */}
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.6,
          margin: 0,
          marginBottom: 14,
          color: "var(--p-neutral-900)",
        }}
      >
        Want to fill these in together? You can answer once for the whole line, or go
        one product at a time. I won&apos;t make anything up — if you skip a product,
        its PDP just shows without the field.
      </p>

      {/* Response chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ReplyChip
          variant="primary"
          icon={Layers}
          onClick={() => setScreen("structured")}
          // Per Open Q §3 — bulk free-text (Screen 05) is deferred to v2.
          // Until grouping is ready, this falls back to structured editing.
        >
          Tell me about the whole line
        </ReplyChip>
        <ReplyChip icon={Shirt} onClick={() => setScreen("structured")}>
          Go one product at a time
        </ReplyChip>
        <ReplyChip icon={Clock} onClick={() => setScreen("defer")}>
          Remind me later
        </ReplyChip>
      </div>
    </AgentBubble>
  );
}
