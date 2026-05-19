"use client";

/**
 * Right-side panel inside the agent chat surface.
 *
 * Shows the merchant the full queue of products needing fashion-field
 * review, lets them search/filter, and lets them jump the structured-
 * editor cursor to any product without walking sequentially. v1.4 add
 * after preview testing surfaced that the cursor-walk pattern alone
 * left merchants feeling stuck — they wanted to scan the list and
 * pick what they had answers for.
 *
 * Visible only on the `structured` screen. On the trigger / paused /
 * done / honest_feedback screens the panel hides — those have their
 * own framing and a side list would dilute them.
 */

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  selectCurrentProduct,
  useMerchantFashionStore,
} from "@/lib/merchant-fashion-store";
import type { FieldName, IncompleteProduct } from "@/types/fashion-authoring";
import { productKey } from "@/types/fashion-authoring";

const FIELD_PILL_LABELS: Record<FieldName, string> = {
  material: "M",
  care: "C",
  size_guide: "SG",
};

interface QueueSidebarProps {
  /** Hide the panel entirely. Used by the surface to suppress the
   *  panel on non-structured screens without unmounting state. */
  hidden?: boolean;
}

export function QueueSidebar({ hidden }: QueueSidebarProps) {
  const queue = useMerchantFashionStore((s) => s.queue);
  const current = useMerchantFashionStore(selectCurrentProduct);
  const totals = useMerchantFashionStore((s) => s.totals);
  const jumpToProduct = useMerchantFashionStore((s) => s.jumpToProduct);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | FieldName>("all");
  // Collapsed mode keeps the panel out of the way without losing state.
  // Default open so the value is discoverable; merchant can collapse
  // for a wider chat column.
  const [collapsed, setCollapsed] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return queue.filter((p) => {
      if (q) {
        if (!p.title.toLowerCase().includes(q) && !p.platform_product_id.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filter !== "all") {
        if (p.fields[filter].status !== "missing") return false;
      }
      return true;
    });
  }, [queue, query, filter]);

  if (hidden) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Show queue"
        style={{
          position: "sticky",
          top: 16,
          right: 0,
          alignSelf: "flex-start",
          width: 32,
          height: 96,
          background: "var(--p-surface)",
          border: "0.5px solid var(--p-border-strong)",
          borderRight: "none",
          borderRadius: "8px 0 0 8px",
          cursor: "pointer",
          writingMode: "vertical-rl",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--p-primary)",
          padding: "12px 6px",
        }}
      >
        Queue · {queue.length}
      </button>
    );
  }

  return (
    <aside
      style={{
        flex: "0 0 300px",
        maxHeight: "calc(100vh - 140px)",
        position: "sticky",
        top: 16,
        display: "flex",
        flexDirection: "column",
        background: "var(--p-surface)",
        border: "0.5px solid var(--p-border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
      aria-label="Products needing review"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          borderBottom: "0.5px solid var(--p-border)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--p-neutral-900)" }}>
            Products needing review
          </div>
          <div style={{ fontSize: 11, color: "var(--p-neutral-500)", marginTop: 2 }}>
            {totals
              ? `${queue.length} in this batch · ${totals.total_incomplete} total`
              : `${queue.length} in this batch`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse queue"
          style={{
            background: "none",
            border: "none",
            color: "var(--p-neutral-500)",
            cursor: "pointer",
            padding: 4,
          }}
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>

      {/* Search + filter */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "0.5px solid var(--p-border)",
          background: "var(--p-bg)",
        }}
      >
        <div style={{ position: "relative", marginBottom: 8 }}>
          <Search
            size={12}
            strokeWidth={1.8}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--p-neutral-400)",
              pointerEvents: "none",
            }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or SKU"
            aria-label="Search products"
            className="p-input"
            style={{
              paddingLeft: 26,
              fontSize: 12,
              minHeight: 30,
              background: "var(--p-surface)",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="All"
            count={queue.length}
          />
          <FilterChip
            active={filter === "material"}
            onClick={() => setFilter("material")}
            label="Need material"
            count={queue.filter((p) => p.fields.material.status === "missing").length}
          />
          <FilterChip
            active={filter === "care"}
            onClick={() => setFilter("care")}
            label="Need care"
            count={queue.filter((p) => p.fields.care.status === "missing").length}
          />
          <FilterChip
            active={filter === "size_guide"}
            onClick={() => setFilter("size_guide")}
            label="Need size"
            count={queue.filter((p) => p.fields.size_guide.status === "missing").length}
          />
        </div>
      </div>

      {/* List — virtualization would matter past ~500; for v1 (≤500)
          the simple render is fast enough. */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 6,
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--p-neutral-500)",
              padding: "20px 12px",
              textAlign: "center",
            }}
          >
            {query || filter !== "all"
              ? "Nothing matches that filter."
              : "Queue is empty — nice work."}
          </div>
        ) : (
          filtered.map((product) => {
            const key = productKey(product);
            const isActive = current && productKey(current) === key;
            return (
              <QueueRow
                key={key}
                product={product}
                active={!!isActive}
                onClick={() => jumpToProduct(key)}
              />
            );
          })
        )}
      </div>
    </aside>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: active ? "var(--p-primary-50)" : "var(--p-surface)",
        border: active
          ? "1px solid var(--p-primary)"
          : "0.5px solid var(--p-border-strong)",
        color: active ? "var(--p-primary-800)" : "var(--p-neutral-500)",
        borderRadius: 999,
        padding: "3px 9px",
        fontSize: 10.5,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        display: "inline-flex",
        gap: 4,
        alignItems: "center",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          opacity: 0.7,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function QueueRow({
  product,
  active,
  onClick,
}: {
  product: IncompleteProduct;
  active: boolean;
  onClick: () => void;
}) {
  const missingFields = (Object.entries(product.fields) as Array<[FieldName, { status: string }]>)
    .filter(([, state]) => state.status === "missing")
    .map(([f]) => f);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      style={{
        width: "100%",
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "8px 10px",
        background: active ? "var(--p-primary-50)" : "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 160ms var(--p-easing)",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--p-surface-muted)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          width: 28,
          height: 36,
          flex: "0 0 28px",
          borderRadius: 4,
          background: product.image_url
            ? `url(${product.image_url}) center/cover`
            : "linear-gradient(135deg, #efe7dc, #f4f4f2)",
        }}
        aria-hidden
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: active ? 600 : 500,
            color: "var(--p-neutral-900)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.3,
          }}
        >
          {product.title}
        </div>
        <div
          style={{
            display: "flex",
            gap: 3,
            marginTop: 3,
            alignItems: "center",
          }}
        >
          {missingFields.length === 0 ? (
            <span
              className="p-pill p-pill--teal"
              style={{ fontSize: 9, padding: "1px 6px" }}
            >
              All set
            </span>
          ) : (
            missingFields.map((f) => (
              <span
                key={f}
                className="p-pill p-pill--coral"
                style={{ fontSize: 9, padding: "1px 6px" }}
                title={`Needs ${f}`}
              >
                {FIELD_PILL_LABELS[f]}
              </span>
            ))
          )}
        </div>
      </div>
    </button>
  );
}
