"use client";

import { useState } from "react";
import { AgentChatSurface } from "./AgentChatSurface";
import { BeautyAgentChatSurface } from "./BeautyAgentChatSurface";

type Category = "fashion" | "beauty";

const TABS: { id: Category; label: string; sub: string }[] = [
  { id: "fashion", label: "Fashion", sub: "Material · Care · Size guide" },
  { id: "beauty", label: "Beauty", sub: "Ingredients · How-to · Skin concerns" },
];

export function AgentChatTabs() {
  const [active, setActive] = useState<Category>("fashion");

  return (
    <div>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--p-border)",
          padding: "0 16px",
          marginBottom: 0,
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
                borderBottom: isActive ? "2px solid var(--p-neutral-900)" : "2px solid transparent",
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

      {/* Surface */}
      {active === "fashion" ? <AgentChatSurface /> : <BeautyAgentChatSurface />}
    </div>
  );
}
