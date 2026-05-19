"use client";

/**
 * Top-level merchant-agent surface. Drives the state machine and
 * dispatches to the per-screen content components.
 *
 * State map (matches design handoff artboard 10):
 *   A · Fully covered — sidebar/silent; renders empty state
 *   C · Action needed — Screen 04 (Trigger)
 *   D · Authoring     — Screen 06 (Structured one-by-one)
 *   E · Paused        — Screen 09 (Defer state) / PausedCard
 *   F · Conflict      — Screen 08 (Honest feedback)
 *   G · Genuinely unknown — equivalent to E (silent until cadence)
 *
 * The store persists `screen` so navigating away + back resumes at the
 * same point. Initial load fetches the fashion-completeness payload
 * from the backend (PR #565) and routes:
 *   - empty queue (all products covered) → A · Fully covered
 *   - non-empty queue → keep persisted screen, defaulting to Trigger
 */

import { useEffect, useMemo, useState } from "react";

import { apiClient } from "@/lib/api-client";
import {
  selectCurrentProduct,
  useMerchantFashionStore,
} from "@/lib/merchant-fashion-store";
import type {
  BeautyFieldName,
  CategoryKind,
  CategoryTotals,
  FashionFieldName,
  FieldStateSummary,
  FieldStatus,
  IncompleteProduct,
} from "@/types/fashion-authoring";

import { BeautyEditor } from "./BeautyEditor";
import { DeferCard } from "./DeferCard";
import { DoneCard } from "./DoneCard";
import { HonestFeedbackCard } from "./HonestFeedbackCard";
import { PausedCard } from "./PausedCard";
import { QueueSidebar } from "./QueueSidebar";
import { StructuredEditor } from "./StructuredEditor";
import { TriggerCard } from "./TriggerCard";

const _VALID_STATUSES: ReadonlySet<FieldStatus> = new Set([
  "missing",
  "filled-by-llm",
  "merchant-authored",
  "merchant-payload-locked",
  "inherited",
]);

function _normalizeStatus(s: unknown): FieldStatus {
  if (typeof s === "string" && _VALID_STATUSES.has(s as FieldStatus)) {
    return s as FieldStatus;
  }
  return "missing";
}

function _normalizeFieldState(raw: unknown): FieldStateSummary {
  if (!raw || typeof raw !== "object") return { status: "missing" };
  const r = raw as Record<string, unknown>;
  const status = _normalizeStatus(r.status);
  const value = r.value;
  const confidence =
    typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1
      ? r.confidence
      : null;
  return {
    status,
    value: (typeof value === "string" || (value && typeof value === "object")) ? value as string | Record<string, any> : null,
    confidence,
  };
}

/**
 * Defensive shaper for the per-category completeness payloads.
 * Same outer shape (data.queue + data.totals) — the per-product
 * field set differs by category. The shaper switches on the
 * category param and produces a discriminated-union queue.
 */
function _shapeQueue(
  payload: unknown,
  category: CategoryKind,
): {
  queue: IncompleteProduct[];
  totals: CategoryTotals | null;
} {
  if (!payload || typeof payload !== "object") return { queue: [], totals: null };
  const root = payload as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object")
    ? (root.data as Record<string, unknown>)
    : root;
  const rawQueue = data.queue;
  if (!Array.isArray(rawQueue)) return { queue: [], totals: _shapeTotals(data.totals, category) };

  const queue: IncompleteProduct[] = [];
  for (const item of rawQueue) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (typeof it.platform !== "string" || typeof it.platform_product_id !== "string") continue;
    const rawFields = (it.fields && typeof it.fields === "object")
      ? (it.fields as Record<string, unknown>)
      : {};
    const base = {
      platform: it.platform,
      platform_product_id: it.platform_product_id,
      title: typeof it.title === "string" ? it.title : "Untitled product",
      image_url: typeof it.image_url === "string" ? it.image_url : null,
      sku: typeof it.sku === "string" ? it.sku : null,
    };
    if (category === "fashion") {
      const fields: Record<FashionFieldName, FieldStateSummary> = {
        material: _normalizeFieldState(rawFields.material),
        care: _normalizeFieldState(rawFields.care),
        size_guide: _normalizeFieldState(rawFields.size_guide),
      };
      queue.push({ ...base, category_kind: "fashion", fields });
    } else {
      const fields: Record<BeautyFieldName, FieldStateSummary> = {
        raw_inci: _normalizeFieldState(rawFields.raw_inci),
        how_to_use_text: _normalizeFieldState(rawFields.how_to_use_text),
        skin_concerns: _normalizeFieldState(rawFields.skin_concerns),
      };
      queue.push({ ...base, category_kind: "beauty", fields });
    }
  }
  return { queue, totals: _shapeTotals(data.totals, category) };
}

function _shapeTotals(raw: unknown, category: CategoryKind): CategoryTotals | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (k: string): number => typeof r[k] === "number" ? r[k] as number : 0;
  if (category === "fashion") {
    return {
      category: "fashion",
      category_total: n("fashion_total"),
      total_incomplete: n("total_incomplete"),
      missing_per_field: {
        material: n("missing_material"),
        care: n("missing_care"),
        size_guide: n("missing_size_guide"),
      },
      has_more: typeof r.has_more === "boolean" ? r.has_more : false,
      page_size: n("page_size") || 50,
    };
  }
  return {
    category: "beauty",
    category_total: n("beauty_total"),
    total_incomplete: n("total_incomplete"),
    missing_per_field: {
      raw_inci: n("missing_inci"),
      how_to_use_text: n("missing_how_to_use"),
      skin_concerns: n("missing_concerns"),
    },
    has_more: typeof r.has_more === "boolean" ? r.has_more : false,
    page_size: n("page_size") || 50,
  };
}

export function AgentChatSurface() {
  const screen = useMerchantFashionStore((s) => s.screen);
  const setScreen = useMerchantFashionStore((s) => s.setScreen);
  const setQueue = useMerchantFashionStore((s) => s.setQueue);
  const queueLength = useMerchantFashionStore((s) => s.queue.length);
  const category = useMerchantFashionStore((s) => s.category);
  const current = useMerchantFashionStore(selectCurrentProduct);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        // Pull a wide page so the cursor walks the full queue. Backend
        // caps at 500; for larger catalogs `totals.has_more` is the
        // paging hook (v2.x).
        const fetch =
          category === "fashion"
            ? apiClient.getMerchantFashionCompleteness({ page: 1, page_size: 200 })
            : apiClient.getMerchantBeautyCompleteness({ page: 1, page_size: 200 });
        const payload = await fetch;
        if (cancelled) return;
        const { queue, totals } = _shapeQueue(payload, category);
        setQueue(queue, totals);
        if (queue.length === 0) {
          if (screen !== "paused") setScreen("done");
        } else if (screen === "done") {
          setScreen("trigger");
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load completeness");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // Re-fetch on category change too — the queue + totals are per-
    // category. setCategory in the store clears state before this
    // effect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const content = useMemo(() => {
    if (loading) return <LoadingBubble />;
    if (loadError)
      return (
        <div style={{ color: "var(--p-coral-icon)", fontSize: 13 }}>
          Couldn&apos;t load your catalog state: {loadError}
        </div>
      );
    if (queueLength === 0 && screen === "done") {
      return <FullyCoveredIdle />;
    }
    // v1.2 fix: if we somehow land on `structured` with an empty queue
    // (e.g. user persisted into that state then navigated back, or
    // burned through the queue via "No answer known" elsewhere),
    // recover by sending them to PausedCard rather than rendering the
    // confusing "No products left in the queue" stub. Mutating screen
    // here is intentional — it's a recovery path, not a normal route.
    if (queueLength === 0 && screen === "structured") {
      return <PausedCard />;
    }
    switch (screen) {
      case "trigger":
        return <TriggerCard />;
      case "structured":
        // Dispatch the per-category editor based on the current
        // product's discriminator. Both editors share the cursor
        // (advanceCursor / markUnknown / etc.) via the store.
        return current && current.category_kind === "beauty" ? (
          <BeautyEditor />
        ) : (
          <StructuredEditor />
        );
      case "done":
        return <DoneCard />;
      case "honest_feedback":
        return <HonestFeedbackCard />;
      case "defer":
        return <DeferCard />;
      case "paused":
        return <PausedCard />;
      default:
        return <TriggerCard />;
    }
  }, [loading, loadError, queueLength, screen, current]);

  // Two-column layout only on the structured screen — that's where the
  // queue sidebar adds value. Trigger / done / paused / honest_feedback
  // / defer all stay single-column so their messaging stays focused.
  const showSidebar = screen === "structured" && queueLength > 0;

  return (
    <div
      className="agent-chat-surface"
      style={{
        display: "flex",
        flexDirection: showSidebar ? "row" : "column",
        gap: 16,
        minHeight: "calc(100vh - 120px)",
        padding: "24px 16px 32px",
        maxWidth: showSidebar ? 1200 : 880,
        margin: "0 auto",
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {content}
      </div>
      {showSidebar ? <QueueSidebar /> : null}
      {/*
        v1 uses action chips to drive the flow; free-text input would
        require an NLP layer we haven't built yet. Hiding the composer
        entirely instead of showing a disabled stub avoids the
        "I clicked the box and nothing happened" UX that surfaced in
        preview testing.
      */}
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
