"use client";

import { useEffect, useMemo, useState } from "react";
import type { StoreApi } from "zustand";

import { apiClient } from "@/lib/api-client";
import type { BeautyStore } from "@/lib/merchant-beauty-store";
import {
  BeautyStoreProvider,
  useBeautyStore,
} from "./BeautyStoreContext";

import type {
  BeautyFieldName,
  BeautySubcategoryKind,
  BeautyTotals,
  FieldStateSummary,
  IncompleteBeautyProduct,
} from "@/types/beauty-authoring";
import { FIELDS_FOR_SUBCATEGORY, beautyProductKey } from "@/types/beauty-authoring";

import { BeautyDeferCard } from "./BeautyDeferCard";
import { BeautyDoneCard } from "./BeautyDoneCard";
import { BeautyHonestFeedbackCard } from "./BeautyHonestFeedbackCard";
import { BeautyPausedCard } from "./BeautyPausedCard";
import { BeautyQueueSidebar } from "./BeautyQueueSidebar";
import { BeautyStructuredEditor } from "./BeautyStructuredEditor";
import { BeautyTriggerCard } from "./BeautyTriggerCard";

// ── payload shaping ─────────────────────────────────────────────────────────

const VALID_STATUSES = new Set([
  "missing", "filled-by-llm", "merchant-authored",
  "merchant-payload-locked", "inherited",
]);

function normalizeStatus(s: unknown): FieldStateSummary["status"] {
  if (typeof s === "string" && VALID_STATUSES.has(s)) return s as FieldStateSummary["status"];
  return "missing";
}

function normalizeFieldState(raw: unknown): FieldStateSummary {
  if (!raw || typeof raw !== "object") return { status: "missing" };
  const r = raw as Record<string, unknown>;
  return {
    status: normalizeStatus(r.status),
    value:
      typeof r.value === "string" || (r.value && typeof r.value === "object")
        ? (r.value as string | Record<string, any>)
        : null,
    confidence:
      typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1
        ? r.confidence
        : null,
  };
}

const VALID_SUBCATEGORY_KINDS = new Set<string>([
  "skincare", "haircare", "bath", "body", "makeup", "tools", "fragrance",
]);

function shapeQueue(
  payload: unknown,
  subcategoryFilter: ReadonlySet<BeautySubcategoryKind>
): { queue: IncompleteBeautyProduct[]; totals: BeautyTotals | null } {
  if (!payload || typeof payload !== "object") return { queue: [], totals: null };
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const rawQueue = data.queue;
  if (!Array.isArray(rawQueue)) return { queue: [], totals: shapeTotals(data.totals) };

  const queue: IncompleteBeautyProduct[] = [];
  for (const item of rawQueue) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (typeof it.platform !== "string" || typeof it.platform_product_id !== "string")
      continue;

    const rawKind = it.subcategory_kind as string;
    if (!VALID_SUBCATEGORY_KINDS.has(rawKind)) continue;
    const subcategory_kind = rawKind as BeautySubcategoryKind;

    // Filter to only the subcategories this surface handles.
    if (!subcategoryFilter.has(subcategory_kind)) continue;

    const applicableFields = FIELDS_FOR_SUBCATEGORY[subcategory_kind];
    const rawFields =
      it.fields && typeof it.fields === "object"
        ? (it.fields as Record<string, unknown>)
        : {};

    const fields: Partial<Record<BeautyFieldName, FieldStateSummary>> = {};
    for (const fieldName of applicableFields) {
      fields[fieldName] = normalizeFieldState(rawFields[fieldName]);
    }

    queue.push({
      platform: it.platform,
      platform_product_id: it.platform_product_id,
      title: typeof it.title === "string" ? it.title : "Untitled product",
      image_url: typeof it.image_url === "string" ? it.image_url : null,
      sku: typeof it.sku === "string" ? it.sku : null,
      subcategory_kind,
      fields,
    });
  }
  return { queue, totals: shapeTotals(data.totals) };
}

function shapeTotals(raw: unknown): BeautyTotals | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (k: string): number => (typeof r[k] === "number" ? (r[k] as number) : 0);
  return {
    beauty_total: n("beauty_total"),
    total_incomplete: n("total_incomplete"),
    page: n("page"),
    page_size: n("page_size") || 50,
    has_more: typeof r.has_more === "boolean" ? r.has_more : false,
  };
}

// ── inner component (runs inside the provider, can read context) ────────────

function BeautyAgentChatInner({
  idleMessage,
}: {
  idleMessage: string;
}) {
  const screen = useBeautyStore((s) => s.screen);
  const queueLength = useBeautyStore((s) => s.queue.length);

  const content = useMemo(() => {
    if (queueLength === 0 && screen === "done") {
      return <BeautyFullyCoveredIdle message={idleMessage} />;
    }
    if (queueLength === 0 && screen === "structured") return <BeautyPausedCard />;
    switch (screen) {
      case "trigger":         return <BeautyTriggerCard />;
      case "structured":      return <BeautyStructuredEditor />;
      case "done":            return <BeautyDoneCard />;
      case "honest_feedback": return <BeautyHonestFeedbackCard />;
      case "defer":           return <BeautyDeferCard />;
      case "paused":          return <BeautyPausedCard />;
      default:                return <BeautyTriggerCard />;
    }
  }, [queueLength, screen, idleMessage]);

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
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {content}
      </div>
      {showSidebar ? <BeautyQueueSidebar /> : null}
    </div>
  );
}

// ── exported surface (owns data-fetch + store seeding) ──────────────────────

export interface BeautyAgentChatSurfaceProps {
  /** Zustand store instance to use for this surface. */
  store: StoreApi<BeautyStore>;
  /** Which subcategory_kinds this surface handles. */
  subcategoryFilter: ReadonlySet<BeautySubcategoryKind>;
  /** Shown when the queue is empty and the merchant is done. */
  idleMessage: string;
  /** Label for the loading bubble. */
  loadingLabel?: string;
}

export function BeautyAgentChatSurface({
  store,
  subcategoryFilter,
  idleMessage,
  loadingLabel = "Checking your beauty catalog…",
}: BeautyAgentChatSurfaceProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Read screen outside the inner component so we can seed routing.
  const screen = store.getState().screen;
  const setScreen = store.getState().setScreen;
  const setQueue = store.getState().setQueue;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const payload = await apiClient.getMerchantBeautyCompleteness({
          page: 1,
          page_size: 200,
        });
        if (cancelled) return;
        const { queue, totals } = shapeQueue(payload, subcategoryFilter);
        setQueue(queue, totals);
        const currentScreen = store.getState().screen;
        if (queue.length === 0) {
          if (currentScreen !== "paused") setScreen("done");
        } else if (currentScreen === "done") {
          setScreen("trigger");
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load beauty catalog data"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "24px 16px" }}>
        <div className="p-bubble">
          <div className="p-bubble-avatar" aria-hidden />
          <div className="p-bubble-body" style={{ color: "var(--p-neutral-500)", fontSize: 13 }}>
            {loadingLabel}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: "24px 16px", color: "var(--p-coral-icon)", fontSize: 13 }}>
        Couldn&apos;t load catalog data: {loadError}
      </div>
    );
  }

  return (
    <BeautyStoreProvider store={store}>
      <BeautyAgentChatInner idleMessage={idleMessage} />
    </BeautyStoreProvider>
  );
}

function BeautyFullyCoveredIdle({ message }: { message: string }) {
  return (
    <div className="p-card" style={{ padding: 20, textAlign: "center" }}>
      <div className="p-serif" style={{ fontSize: 20, marginBottom: 6 }}>
        {message}
      </div>
    </div>
  );
}
