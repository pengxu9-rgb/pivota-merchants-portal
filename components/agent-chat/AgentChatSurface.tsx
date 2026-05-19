"use client";

/**
 * Top-level merchant-agent surface. Drives the state machine and
 * dispatches to the per-screen content components.
 *
 * State map (matches design handoff artboard 10):
 *   A · Fully covered — sidebar/silent; renders empty state
 *   C · Action needed — Screen 04 (Trigger)
 *   D · Authoring     — Screen 06 (Structured one-by-one)
 *   E · Paused        — Screen 09 (Defer state)
 *   F · Conflict      — Screen 08 (Honest feedback)
 *   G · Genuinely unknown — equivalent to E (silent until cadence)
 *
 * The store persists `screen` so navigating away + back resumes at the
 * same point. Initial load fetches the readiness payload and:
 *   - If lane has no missing-data products → A (idle / fully-covered card)
 *   - Otherwise → C (Trigger) on first visit, or whatever screen was last
 *     persisted (D/E/F).
 */

import { useEffect, useMemo, useState } from "react";

import { apiClient } from "@/lib/api-client";
import { useMerchantFashionStore } from "@/lib/merchant-fashion-store";
import type {
  FieldName,
  FieldStateSummary,
  IncompleteProduct,
} from "@/types/fashion-authoring";

import { Composer } from "./Composer";
import { DeferCard } from "./DeferCard";
import { DoneCard } from "./DoneCard";
import { HonestFeedbackCard } from "./HonestFeedbackCard";
import { StructuredEditor } from "./StructuredEditor";
import { TriggerCard } from "./TriggerCard";

/**
 * Pull the per-product fashion-field state from a readiness-optimization
 * response and shape it into the queue our store expects.
 *
 * The backend returns a list of products with `reason_codes` per
 * product. For each fashion-categorized product missing material/
 * care/size_guide, we promote it into the queue. The shape here is
 * defensive — readiness payload schemas have evolved a few times.
 */
function toIncompleteQueue(payload: unknown): IncompleteProduct[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  // The endpoint returns `{ queue: [...] }` or `{ data: { queue: [...] } }`
  // historically; api-client.ts already unwraps `.data` at the outer layer.
  const queue =
    (root.queue as unknown[] | undefined) ||
    (root.products as unknown[] | undefined) ||
    [];
  const fashion: IncompleteProduct[] = [];
  for (const item of queue) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const codes = (it.reason_codes as string[] | undefined) || [];
    const lacksMaterial = codes.includes("product_material_or_ingredient_info_missing");
    const lacksSizeGuide = codes.includes("product_size_guidance_missing");
    if (!lacksMaterial && !lacksSizeGuide) continue;
    const fields: Record<FieldName, FieldStateSummary> = {
      material: lacksMaterial
        ? { status: "missing" }
        : { status: "merchant-authored", value: null },
      // The readiness payload doesn't differentiate care today — surface
      // care as missing whenever material is, since for now they cluster.
      care: lacksMaterial ? { status: "missing" } : { status: "merchant-authored" },
      size_guide: lacksSizeGuide
        ? { status: "missing" }
        : { status: "merchant-authored" },
    };
    fashion.push({
      platform: String(it.platform || "shopify"),
      platform_product_id: String(it.platform_product_id || it.id || ""),
      title: String(it.title || it.product_title || "Untitled product"),
      image_url: (it.image_url as string | null) || null,
      sku: (it.sku as string | null) || null,
      fields,
    });
  }
  return fashion;
}

export function AgentChatSurface() {
  const screen = useMerchantFashionStore((s) => s.screen);
  const setScreen = useMerchantFashionStore((s) => s.setScreen);
  const setQueue = useMerchantFashionStore((s) => s.setQueue);
  const queueLength = useMerchantFashionStore((s) => s.queue.length);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const payload = await apiClient.getMerchantReadinessOptimization({
          queue_mode: "page",
          page: 1,
          page_size: 50,
          // The trigger surface specifically wants fashion-related blockers.
          // The backend filters by reason-code via `issue_bucket`.
          issue_bucket: "product_fit_composition_completeness",
        });
        if (cancelled) return;
        const queue = toIncompleteQueue(payload);
        setQueue(queue);
        // First-visit screen routing: if the queue is empty, go to "done"
        // (or rather, the A · Fully covered idle state which we render
        // inline below as an empty state). Otherwise stay on the persisted
        // screen — typically "trigger" on first arrival.
        if (queue.length === 0) {
          setScreen("done");
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load readiness");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // Intentionally only run on mount — refreshes happen via explicit
    // action chips, not a polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const content = useMemo(() => {
    if (loading) return <LoadingBubble />;
    if (loadError)
      return (
        <div style={{ color: "var(--p-coral-icon)", fontSize: 13 }}>
          Couldn't load your catalog state: {loadError}
        </div>
      );
    if (queueLength === 0 && screen === "done") {
      return <FullyCoveredIdle />;
    }
    switch (screen) {
      case "trigger":
        return <TriggerCard />;
      case "structured":
        return <StructuredEditor />;
      case "done":
        return <DoneCard />;
      case "honest_feedback":
        return <HonestFeedbackCard />;
      case "defer":
        return <DeferCard />;
      default:
        return <TriggerCard />;
    }
  }, [loading, loadError, queueLength, screen]);

  return (
    <div
      className="agent-chat-surface"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 120px)",
        padding: "24px 16px 32px",
        maxWidth: 880,
        margin: "0 auto",
        gap: 16,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
        {content}
      </div>
      <Composer disabled />
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="p-bubble">
      <div className="p-bubble-avatar" aria-hidden />
      <div
        className="p-bubble-body"
        style={{ color: "var(--p-neutral-500)", fontSize: 13 }}
      >
        Checking your catalog…
      </div>
    </div>
  );
}

function FullyCoveredIdle() {
  return (
    <div className="p-card" style={{ padding: 20, textAlign: "center" }}>
      <div className="p-serif" style={{ fontSize: 20, marginBottom: 6 }}>
        Your fashion catalog is covered.
      </div>
      <div style={{ color: "var(--p-neutral-500)", fontSize: 13.5 }}>
        Every product has material, care, and size guide info. Agents searching for
        fabric or care details will find you with full detail.
      </div>
    </div>
  );
}
