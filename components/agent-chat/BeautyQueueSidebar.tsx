"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  selectCurrentBeautyProduct,
  useMerchantBeautyStore,
} from "@/lib/merchant-beauty-store";
import {
  beautyProductKey,
  FIELDS_FOR_SUBCATEGORY,
  SUBCATEGORY_LABELS,
} from "@/types/beauty-authoring";
import type { IncompleteBeautyProduct } from "@/types/beauty-authoring";

function missingCount(p: IncompleteBeautyProduct): number {
  const fields = FIELDS_FOR_SUBCATEGORY[p.subcategory_kind];
  return fields.filter((f) => (p.fields[f]?.status ?? "missing") === "missing").length;
}

export function BeautyQueueSidebar() {
  const queue = useMerchantBeautyStore((s) => s.queue);
  const current = useMerchantBeautyStore(selectCurrentBeautyProduct);
  const totals = useMerchantBeautyStore((s) => s.totals);
  const jumpToProduct = useMerchantBeautyStore((s) => s.jumpToProduct);

  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return queue.filter(
      (p) =>
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.platform_product_id.toLowerCase().includes(q)
    );
  }, [queue, query]);

  const totalIncomplete = totals?.total_incomplete ?? queue.length;
  const currentKey = current ? beautyProductKey(current) : null;

  return (
    <aside
      style={{
        width: collapsed ? 40 : 280,
        flexShrink: 0,
        borderLeft: "1px solid var(--p-border)",
        paddingLeft: collapsed ? 0 : 16,
        transition: "width 0.2s",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{
          fontSize: 10.5,
          color: "var(--p-neutral-400)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 0",
          marginBottom: 8,
          display: "block",
        }}
        aria-label={collapsed ? "Expand queue" : "Collapse queue"}
      >
        {collapsed ? "›" : "‹ Queue"}
      </button>

      {!collapsed && (
        <>
          <div style={{ fontSize: 11, color: "var(--p-neutral-500)", marginBottom: 8 }}>
            {totalIncomplete} product{totalIncomplete !== 1 ? "s" : ""} incomplete
          </div>

          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search
              size={12}
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
              placeholder="Search products…"
              style={{
                width: "100%",
                padding: "5px 8px 5px 24px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid var(--p-border)",
                background: "var(--p-surface)",
                color: "var(--p-neutral-900)",
                boxSizing: "border-box",
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--p-neutral-400)",
                  padding: 0,
                }}
                aria-label="Clear search"
              >
                <X size={11} />
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 520, overflowY: "auto" }}>
            {filtered.map((p) => {
              const key = beautyProductKey(p);
              const isActive = key === currentKey;
              const missing = missingCount(p);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => jumpToProduct(key)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    padding: "7px 8px",
                    borderRadius: 6,
                    border: isActive ? "1.5px solid var(--p-teal)" : "1px solid transparent",
                    background: isActive ? "var(--p-teal-bg)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--p-neutral-900)", lineHeight: 1.3 }}>
                    {p.title}
                  </div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--p-neutral-400)" }}>
                      {SUBCATEGORY_LABELS[p.subcategory_kind]}
                    </span>
                    {missing > 0 && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 600,
                          background: "var(--p-coral-bg)",
                          color: "var(--p-coral-icon)",
                          borderRadius: 4,
                          padding: "1px 5px",
                        }}
                      >
                        {missing} missing
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--p-neutral-400)", padding: "8px 4px" }}>
                No products match.
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
