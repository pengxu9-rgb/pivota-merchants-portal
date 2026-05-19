"use client";

/**
 * Screen 09 — Defer / come back later.
 *
 * Merchant chose "remind me later." Acknowledge graciously, surface the
 * cadence picker (1d / 1w default / next-sync / never), persist via the
 * store, and tip the merchant about the "no answer known" path.
 *
 * Cadence persistence in v1 lives in localStorage via the Zustand
 * persist middleware. A future iteration will sync it to a backend
 * "notification preferences" surface; for now the agent on next page
 * load reads from local state.
 */

import { Check, Clock } from "lucide-react";

import { useMerchantFashionStore } from "@/lib/merchant-fashion-store";
import type { ReminderCadence } from "@/types/fashion-authoring";

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

export function DeferCard() {
  const cadence = useMerchantFashionStore((s) => s.cadence) || DEFAULT_CADENCE;
  const setCadence = useMerchantFashionStore((s) => s.setCadence);
  const setScreen = useMerchantFashionStore((s) => s.setScreen);
  const queueLength = useMerchantFashionStore((s) => s.queue.length);

  return (
    <>
      <UserBubble>Remind me later — I&apos;m slammed today.</UserBubble>

      <AgentBubble>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.6,
            margin: 0,
            marginBottom: 14,
          }}
        >
          No problem. Your <strong>{queueLength} products will still surface in search</strong>,
          just without the material field. I&apos;ll surface this thread again the
          next time you open the agent chat — or whenever a new sync changes the
          count.
        </p>

        <div className="p-card p-card-md" style={{ overflow: "hidden", padding: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: "var(--p-primary-50)",
                color: "var(--p-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 32px",
              }}
              aria-hidden
            >
              <Clock size={15} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Reminder cadence</div>
              <div style={{ fontSize: 11.5, color: "var(--p-neutral-500)" }}>
                How often I&apos;ll bring this back. You can change it anytime.
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
            }}
          >
            {CADENCE_OPTIONS.map((opt) => {
              const selected = cadence === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCadence(opt.value)}
                  style={{
                    background: selected ? "var(--p-primary-50)" : "var(--p-surface)",
                    border: selected
                      ? "1.5px solid var(--p-neutral-900)"
                      : "0.5px solid var(--p-border-strong)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 180ms var(--p-easing)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: selected ? "var(--p-primary-800)" : "var(--p-neutral-500)",
                      marginTop: 2,
                    }}
                  >
                    {opt.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            fontSize: 11.5,
            color: "var(--p-neutral-500)",
            marginTop: 10,
          }}
        >
          If you want to start sooner, this thread is in your sidebar under{" "}
          <strong>Agent chat</strong> — click any time.
        </div>

        <div style={{ marginTop: 14 }}>
          <AiTip variant="info" title="If you genuinely don't know the answer">
            Mark a product as <strong>&quot;no answer known&quot;</strong>. I won&apos;t re-prompt
            for it, and the PDP renders without the field. You can change your
            mind from the catalog.
          </AiTip>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <ReplyChip
            variant="primary"
            icon={Check}
            onClick={() => {
              // Persist cadence; transition to the `paused` terminal screen.
              // Codex review: routing to `done` here was misleading — DoneCard's
              // copy says "the catalog is covered" even when the queue is
              // non-empty. PausedCard surfaces what's still missing honestly.
              setCadence(cadence);
              setScreen("paused");
            }}
          >
            Sounds good
          </ReplyChip>
          <ReplyChip onClick={() => setScreen("structured")}>
            Actually, do a few now
          </ReplyChip>
        </div>
      </AgentBubble>
    </>
  );
}
