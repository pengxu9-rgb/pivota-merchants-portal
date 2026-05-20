"use client";

import { useState } from "react";

import {
  useMerchantBeautyCareStore,
  useMerchantBeautyToolsStore,
} from "@/lib/merchant-beauty-store";
import type { BeautySubcategoryKind } from "@/types/beauty-authoring";

import { AgentChatSurface } from "./AgentChatSurface";
import { BeautyAgentChatSurface } from "./BeautyAgentChatSurface";

type Category = "fashion" | "beauty-care" | "beauty-tools";

// In Zustand v4 the hook returned by create() IS the StoreApi — it carries
// getState / setState / subscribe. Pass the hooks directly as the store prop.
const beautyCareStore = useMerchantBeautyCareStore;
const beautyToolsStore = useMerchantBeautyToolsStore;

const CARE_SUBCATEGORIES = new Set<BeautySubcategoryKind>([
  "skincare", "haircare", "bath", "body", "makeup", "fragrance",
]);

const TOOLS_SUBCATEGORIES = new Set<BeautySubcategoryKind>(["tools"]);

const TABS: { id: Category; label: string; sub: string }[] = [
  { id: "fashion",      label: "Fashion",      sub: "Material · Care · Size guide" },
  { id: "beauty-care",  label: "Beauty Care",  sub: "Ingredients · How-to · Skin concerns" },
  { id: "beauty-tools", label: "Beauty Tools",  sub: "Material · Use-with · Care" },
];

export function AgentChatTabs() {
  const [active, setActive] = useState<Category>("fashion");

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--p-border)",
          padding: "0 16px",
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "10px 14px",
                background: "none",
                border: "none",
                borderBottom: isActive
                  ? "2px solid var(--p-neutral-900)"
                  : "2px solid transparent",
                cursor: "pointer",
                gap: 1,
                marginBottom: -1,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--p-neutral-900)" : "var(--p-neutral-500)",
                }}
              >
                {tab.label}
              </span>
              <span style={{ fontSize: 10.5, color: "var(--p-neutral-400)" }}>{tab.sub}</span>
            </button>
          );
        })}
      </div>

      {active === "fashion" && <AgentChatSurface />}

      {active === "beauty-care" && (
        <BeautyAgentChatSurface
          store={beautyCareStore}
          subcategoryFilter={CARE_SUBCATEGORIES}
          idleMessage="Your beauty care catalog is fully covered."
          loadingLabel="Checking your skincare & cosmetics catalog…"
        />
      )}

      {active === "beauty-tools" && (
        <BeautyAgentChatSurface
          store={beautyToolsStore}
          subcategoryFilter={TOOLS_SUBCATEGORIES}
          idleMessage="Your beauty tools catalog is fully covered."
          loadingLabel="Checking your beauty tools catalog…"
        />
      )}
    </div>
  );
}
