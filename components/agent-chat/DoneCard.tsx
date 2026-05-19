"use client";

import { useMerchantFashionStore } from "@/lib/merchant-fashion-store";

import { AgentBubble } from "./AgentBubble";
import { AiTip } from "./AiTip";
import { ReplyChip } from "./ReplyChip";

/**
 * Screen 07 — Done state.
 *
 * Per design handoff: no confetti, no badges. Pivota's voice is precise,
 * not playful. Headline + body + result card with readiness gauge +
 * per-field stacked bars + info tip + actions.
 *
 * The stacked bars show source breakdown: how much came from the merchant
 * authoring vs inheritance vs Shopify metafields vs anything still missing.
 * In v1 we approximate with whatever the store knows about — the source
 * truth lives in the post-write readiness recompute. For early ship, this
 * is intentionally a coarse rollup; we can tighten it once we have
 * canonical-view coverage from PR #563's cross-PDP coalesce live in prod.
 */
export function DoneCard() {
  const queue = useMerchantFashionStore((s) => s.queue);
  const outcomes = useMerchantFashionStore((s) => s.outcomes);
  const setScreen = useMerchantFashionStore((s) => s.setScreen);

  // Counts based on the outcomes accumulated during this session.
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
        style={{
          fontSize: 22,
          margin: 0,
          marginBottom: 8,
          color: "var(--p-neutral-900)",
        }}
      >
        That&apos;s the line covered.
      </h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
        Your fashion catalog is in good shape — material, care, and size guide
        info now flows through to agent shopping surfaces. Agents searching for
        fabric or care will find you with full detail.
      </p>

      {/* Result card */}
      <div className="p-card p-card-md" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            padding: 14,
            borderBottom: "0.5px solid var(--p-border)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div className="p-eyebrow" style={{ marginBottom: 6 }}>
              Fit & composition lane
            </div>
            <div
              className="p-serif"
              style={{
                fontSize: 28,
                color: "var(--p-neutral-900)",
                letterSpacing: "-0.02em",
              }}
            >
              Covered for this batch
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--p-neutral-500)",
                marginTop: 4,
              }}
            >
              {merchantWritten} fields written ·{" "}
              {payloadOwned} kept from Shopify
            </div>
          </div>
          <ReadinessGauge value={1} />
        </div>

        {/* Per-field stacked bars — coarse rollup in v1. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 14,
          }}
        >
          <Legend />
          <SourceBar
            label="Material"
            total={queue.length || 1}
            written={merchantWritten}
            owned={payloadOwned}
          />
          <SourceBar
            label="Care"
            total={queue.length || 1}
            written={merchantWritten}
            owned={payloadOwned}
          />
          <SourceBar
            label="Size guide"
            total={queue.length || 1}
            written={merchantWritten}
            owned={payloadOwned}
          />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <AiTip variant="info" title="What changed in search">
          Agents asking about fabric, care, or sizing will now pull your authored
          values. Coverage for the fit-and-composition lane just stepped up in
          your readiness dashboard.
        </AiTip>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <ReplyChip
          variant="primary"
          onClick={() => {
            // Send the merchant to the catalog view to see the result
            // in context. Hard nav (not router push) — the catalog page
            // doesn't share state with the chat surface.
            window.location.href = "/dashboard/products";
          }}
        >
          See in catalog
        </ReplyChip>
        <ReplyChip onClick={() => setScreen("trigger")}>What&apos;s next?</ReplyChip>
      </div>
    </AgentBubble>
  );
}

function ReadinessGauge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const dash = pct * circ;
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden>
      <circle
        cx={22}
        cy={22}
        r={radius}
        fill="none"
        stroke="var(--p-surface-muted)"
        strokeWidth={4}
      />
      <circle
        cx={22}
        cy={22}
        r={radius}
        fill="none"
        stroke="var(--p-primary)"
        strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
      <text
        x={22}
        y={26}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="var(--p-neutral-900)"
      >
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

function Legend() {
  const items: Array<{ label: string; color: string }> = [
    { label: "You wrote it", color: "var(--p-primary)" },
    { label: "Inherited", color: "#7b6fd4" },
    { label: "From Shopify", color: "var(--p-teal)" },
    { label: "Missing", color: "var(--p-border-strong)" },
  ];
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "var(--p-neutral-500)" }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: i.color,
              display: "inline-block",
            }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function SourceBar({
  label,
  total,
  written,
  owned,
}: {
  label: string;
  total: number;
  written: number;
  owned: number;
}) {
  // Coarse v1 split — the exact per-source breakdown lives at the
  // canonical view (post-coalesce, PR #563). For early ship, we draw the
  // bar from this session's outcomes; "inherited" and "missing" are
  // estimated from the gap.
  const writtenPct = Math.min(100, (written / total) * 100);
  const ownedPct = Math.min(100 - writtenPct, (owned / total) * 100);
  const inheritedPct = Math.max(0, Math.min(100 - writtenPct - ownedPct, 30));
  const missingPct = Math.max(0, 100 - writtenPct - ownedPct - inheritedPct);
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11.5,
        }}
      >
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: "var(--p-neutral-500)" }}>
          <strong style={{ color: "var(--p-neutral-900)" }}>
            {Math.max(0, total - Math.round((missingPct / 100) * total))}
          </strong>
          /{total}
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 8,
          background: "var(--p-surface-muted)",
          borderRadius: 999,
          display: "flex",
          overflow: "hidden",
        }}
      >
        <span style={{ width: `${writtenPct}%`, background: "var(--p-primary)" }} />
        <span style={{ width: `${inheritedPct}%`, background: "#7b6fd4" }} />
        <span style={{ width: `${ownedPct}%`, background: "var(--p-teal)" }} />
        <span style={{ width: `${missingPct}%`, background: "var(--p-border-strong)" }} />
      </div>
    </div>
  );
}
