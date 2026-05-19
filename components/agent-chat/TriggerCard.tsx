"use client";

import { ArrowRight, Clock, RefreshCcw } from "lucide-react";

import { useMerchantFashionStore } from "@/lib/merchant-fashion-store";
import type { CategoryKind, FieldName } from "@/types/fashion-authoring";

import { AgentBubble } from "./AgentBubble";
import { AiTip } from "./AiTip";
import { ProductChip } from "./ProductChip";
import { ReplyChip } from "./ReplyChip";
import { StatStrip } from "./StatStrip";

/**
 * Screen 04 — Trigger surface.
 *
 * v2.0 update: category-aware. Top-of-card toggle between Fashion and
 * Beauty; counts + stat strip + body copy update based on selection.
 *
 * Reads:
 *   - store.category for the active category
 *   - store.totals — already category-aware (CategoryTotals) so the
 *     same render path works for fashion + beauty
 *
 * v1.2 fixes still in place:
 *   - Counts read from totals.total_incomplete (queue is page-limited)
 *   - StatStrip reads per-field counts from totals
 *   - Simplified to two clear actions: "Start filling these in" + "Remind me later"
 */

const CATEGORY_LABEL: Record<CategoryKind, string> = {
  fashion: "Fashion",
  beauty: "Beauty",
};

// Per-category headline copy reflects what the merchant is actually
// missing in that category. Free-text strings keep it conversational.
const PER_CATEGORY_HEADLINE: Record<CategoryKind, (n: number) => string> = {
  fashion: (n) =>
    n > 0
      ? "Quick one — some of your fashion products are missing material info."
      : "Your fashion catalog is fully covered.",
  beauty: (n) =>
    n > 0
      ? "Quick one — some of your beauty products are missing ingredient info."
      : "Your beauty catalog is fully covered.",
};

const PER_CATEGORY_BODY: Record<
  CategoryKind,
  (missing: number, total: number) => React.ReactNode
> = {
  fashion: (missing, total) => (
    <>
      <strong>
        {missing} of your {total} fashion products
      </strong>{" "}
      are missing at least one of material, care, or size guide. They&apos;ll
      still show up in shopping searches, but agents asking{" "}
      <em>&quot;is this satin or polyester?&quot;</em> will say{" "}
      <em>not specified</em> instead of pulling your answer.
    </>
  ),
  beauty: (missing, total) => (
    <>
      <strong>
        {missing} of your {total} beauty products
      </strong>{" "}
      are missing at least one of ingredient list, how-to-use, or skin
      concerns. They&apos;ll still appear in shopping searches, but agents
      asking <em>&quot;does this have parabens?&quot;</em> or{" "}
      <em>&quot;is this good for oily skin?&quot;</em> will say{" "}
      <em>not specified</em>.
    </>
  ),
};

export function TriggerCard() {
  const queue = useMerchantFashionStore((s) => s.queue);
  const totals = useMerchantFashionStore((s) => s.totals);
  const category = useMerchantFashionStore((s) => s.category);
  const setScreen = useMerchantFashionStore((s) => s.setScreen);
  const setCategory = useMerchantFashionStore((s) => s.setCategory);

  const totalForCategory = totals?.category_total ?? queue.length;
  const totalIncomplete = totals?.total_incomplete ?? queue.length;

  // StatStrip wants populated counts per field. Build per-category.
  const populated: Record<FieldName, number> = {} as Record<FieldName, number>;
  if (category === "fashion") {
    populated.material = Math.max(0, totalForCategory - (totals?.missing_per_field.material ?? 0));
    populated.care = Math.max(0, totalForCategory - (totals?.missing_per_field.care ?? 0));
    populated.size_guide = Math.max(0, totalForCategory - (totals?.missing_per_field.size_guide ?? 0));
  } else {
    populated.raw_inci = Math.max(0, totalForCategory - (totals?.missing_per_field.raw_inci ?? 0));
    populated.how_to_use_text = Math.max(0, totalForCategory - (totals?.missing_per_field.how_to_use_text ?? 0));
    populated.skin_concerns = Math.max(0, totalForCategory - (totals?.missing_per_field.skin_concerns ?? 0));
  }

  const sample = queue.slice(0, 3);

  return (
    <AgentBubble>
      {/* Category toggle — top of the card so the merchant always sees
          which category's numbers they're looking at. */}
      <div
        role="tablist"
        aria-label="Product category"
        style={{
          display: "inline-flex",
          gap: 4,
          background: "var(--p-surface-muted)",
          borderRadius: 999,
          padding: 2,
          marginBottom: 14,
        }}
      >
        {(["fashion", "beauty"] as const).map((cat) => {
          const active = category === cat;
          return (
            <button
              key={cat}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setCategory(cat)}
              style={{
                background: active ? "var(--p-surface)" : "transparent",
                color: active ? "var(--p-neutral-900)" : "var(--p-neutral-500)",
                border: "none",
                borderRadius: 999,
                padding: "5px 14px",
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                boxShadow: active ? "var(--p-shadow-sm)" : "none",
                transition: "all 160ms var(--p-easing)",
              }}
            >
              {CATEGORY_LABEL[cat]}
            </button>
          );
        })}
      </div>

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
            {category} {totalIncomplete === 1 ? "product" : "products"} missing details
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
        {PER_CATEGORY_HEADLINE[category](totalIncomplete)}
      </h2>

      {/* Body */}
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
        {totalIncomplete > 0
          ? PER_CATEGORY_BODY[category](totalIncomplete, totalForCategory)
          : null}
      </p>

      {/* Stat strip — populated counts per category. */}
      <div style={{ marginBottom: 14 }}>
        <StatStrip
          populated={populated}
          total={totalForCategory}
          category={category}
        />
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
            {sample.length === 1
              ? "Sample product missing info:"
              : `A few ${category} products missing info:`}
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

      {/* Overflow note */}
      {totals?.has_more ? (
        <div style={{ marginBottom: 14 }}>
          <AiTip variant="info" title="There are more to come">
            You have <strong>{totalIncomplete}</strong> {category} products needing
            review. I&apos;ll walk you through the first batch now — when you finish,
            come back to this chat and I&apos;ll load the next.
          </AiTip>
        </div>
      ) : null}

      {/* Response chips */}
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
          <ReplyChip onClick={() => setScreen("done")}>See coverage</ReplyChip>
        )}
      </div>
    </AgentBubble>
  );
}
