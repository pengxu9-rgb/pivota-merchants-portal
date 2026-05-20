"use client";

import { ArrowRight, Clock, RefreshCcw } from "lucide-react";

import { useBeautyStore } from "./BeautyStoreContext";
import { SUBCATEGORY_LABELS } from "@/types/beauty-authoring";
import type { IncompleteBeautyProduct } from "@/types/beauty-authoring";

import { AgentBubble } from "./AgentBubble";
import { AiTip } from "./AiTip";
import { ReplyChip } from "./ReplyChip";

function BeautyProductChip({ product }: { product: IncompleteBeautyProduct }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: "var(--p-surface)",
        border: "0.5px solid var(--p-border)",
        borderRadius: 8,
        maxWidth: 220,
      }}
    >
      {product.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_url}
          alt={product.title}
          style={{ width: 30, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
        />
      )}
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--p-neutral-900)", lineHeight: 1.3 }}>
        {product.title}
      </span>
    </div>
  );
}

export function BeautyTriggerCard() {
  const queue = useBeautyStore((s) => s.queue);
  const totals = useBeautyStore((s) => s.totals);
  const setScreen = useBeautyStore((s) => s.setScreen);

  const totalBeauty = totals?.beauty_total ?? queue.length;
  const totalIncomplete = totals?.total_incomplete ?? queue.length;
  const sample = queue.slice(0, 3);

  // Show the top subcategory breakdown
  const subcategoryCount = queue.reduce<Record<string, number>>((acc, p) => {
    acc[p.subcategory_kind] = (acc[p.subcategory_kind] ?? 0) + 1;
    return acc;
  }, {});
  const topSubcategories = Object.entries(subcategoryCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <AgentBubble>
      <h2
        className="p-serif"
        style={{ fontSize: 22, margin: 0, marginBottom: 8, color: "var(--p-neutral-900)" }}
      >
        {totalIncomplete === 1
          ? "1 beauty product needs ingredient and usage info."
          : `${totalIncomplete} beauty products need ingredient and usage info.`}
      </h2>

      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
        You have <strong>{totalBeauty}</strong> beauty product
        {totalBeauty !== 1 ? "s" : ""} in your catalog.{" "}
        <strong>{totalIncomplete}</strong> of them are missing fields that AI agents
        use when shoppers ask about ingredients, how to apply, or skin compatibility.
        I can walk through them one at a time.
      </p>

      {topSubcategories.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {topSubcategories.map(([kind, count]) => (
            <span
              key={kind}
              style={{
                fontSize: 11,
                fontWeight: 500,
                background: "var(--p-tip-bg)",
                color: "var(--p-tip-icon)",
                borderRadius: 6,
                padding: "3px 8px",
              }}
            >
              {SUBCATEGORY_LABELS[kind as keyof typeof SUBCATEGORY_LABELS] ?? kind} · {count}
            </span>
          ))}
        </div>
      )}

      {sample.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {sample.map((p) => (
            <BeautyProductChip key={`${p.platform}::${p.platform_product_id}`} product={p} />
          ))}
        </div>
      )}

      <AiTip title="Why beauty fields matter">
        AI agents that answer &ldquo;Is this fragrance-free?&rdquo; or &ldquo;Can I use this on sensitive skin?&rdquo;
        pull from ingredients and skin concern fields. Without them, the agent says &ldquo;not specified.&rdquo;
      </AiTip>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <ReplyChip icon={ArrowRight} onClick={() => setScreen("structured")}>
          Fill them in — one at a time
        </ReplyChip>
        <ReplyChip icon={Clock} onClick={() => setScreen("defer")}>
          Remind me later
        </ReplyChip>
        <ReplyChip icon={RefreshCcw} onClick={() => window.location.reload()}>
          Refresh
        </ReplyChip>
      </div>
    </AgentBubble>
  );
}
