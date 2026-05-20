"use client";

import { Check } from "lucide-react";

import { useBeautyStore } from "./BeautyStoreContext";
import type { ReminderCadence } from "@/types/beauty-authoring";
import { AgentBubble } from "./AgentBubble";
import { AiTip } from "./AiTip";
import { ReplyChip } from "./ReplyChip";
import { UserBubble } from "./UserBubble";

interface CadenceOption {
  value: ReminderCadence;
  label: string;
  sub: string;
}

const CADENCE_OPTIONS: CadenceOption[] = [
  { value: "1d", label: "In 1 day", sub: "Tomorrow morning" },
  { value: "1w", label: "In 1 week", sub: "Recommended" },
  { value: "next-sync", label: "Next sync", sub: "Whenever it runs" },
  { value: "never", label: "Never", sub: "I'll come back myself" },
];

const DEFAULT_CADENCE: ReminderCadence = "1w";

export function BeautyDeferCard() {
  const cadence = useBeautyStore((s) => s.cadence) || DEFAULT_CADENCE;
  const setCadence = useBeautyStore((s) => s.setCadence);
  const setScreen = useBeautyStore((s) => s.setScreen);
  const queueLength = useBeautyStore((s) => s.queue.length);

  return (
    <>
      <UserBubble>Remind me later — I&apos;m slammed today.</UserBubble>
      <AgentBubble>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
          No problem. Your <strong>{queueLength} products will still surface in search</strong>,
          just without ingredient and care details. When would you like me to follow up?
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {CADENCE_OPTIONS.map((opt) => {
            const active = cadence === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCadence(opt.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: active
                    ? "1.5px solid var(--p-teal)"
                    : "1px solid var(--p-border)",
                  background: active ? "var(--p-teal-bg)" : "var(--p-surface)",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-neutral-900)" }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--p-neutral-500)" }}>{opt.sub}</div>
                </div>
                {active && <Check size={14} style={{ color: "var(--p-teal)" }} />}
              </button>
            );
          })}
        </div>

        <AiTip title="Good to know">
          If a product gets removed or fully filled before I follow up, I&apos;ll skip it automatically.
        </AiTip>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <ReplyChip onClick={() => setScreen("paused")}>Done — save cadence</ReplyChip>
          <ReplyChip onClick={() => setScreen("structured")}>
            Actually, let&apos;s keep going
          </ReplyChip>
        </div>
      </AgentBubble>
    </>
  );
}
