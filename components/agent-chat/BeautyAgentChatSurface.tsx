"use client";

import { useEffect, useMemo, useState } from "react";

import { apiClient } from "@/lib/api-client";
import {
  selectCurrentBeautyProduct,
  useMerchantBeautyStore,
} from "@/lib/merchant-beauty-store";
import type {
  BeautyFieldName,
  BeautySubcategoryKind,
  BeautyTotals,
  FieldStateSummary,
  IncompleteBeautyProduct,
} from "@/types/beauty-authoring";
import { beautyProductKey, FIELDS_FOR_SUBCATEGORY } from "@/types/beauty-authoring";

import { BeautyDeferCard } from "./BeautyDeferCard";
import { BeautyDoneCard } from "./BeautyDoneCard";
import { BeautyHonestFeedbackCard } from "./BeautyHonestFeedbackCard";
import { BeautyPausedCard } from "./BeautyPausedCard";
import { BeautyStructuredEditor } from "./BeautyStructuredEditor";
import { BeautyTriggerCard } from "./BeautyTriggerCard";
import { BeautyQueueSidebar } from "./BeautyQueueSidebar";

const VALID_STATUSES = new Set([
  "missing",
  "filled-by-llm",
  "merchant-authored",
  "merchant-payload-locked",
  "inherited",
]);

function normalizeStatus(s: unknown): FieldStateSummary["status"] {
  if (typeof s === "string" && VALID_STATUSES.has(s)) {
    return s as FieldStateSummary["status"];
  }
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

function shapeQueue(payload: unknown): {
  queue: IncompleteBeautyProduct[];
  totals: BeautyTotals | null;
} {
  if (!payload || typeof payload !== "object") return { queue: [], totals: null };
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object"
    ? (root.data as Record<string, unknown>)
    : root;
  const rawQueue = data.queue;
  if (!Array.isArray(rawQueue)) return { queue: [], totals: shapeTotals(data.totals) };

  const queue: IncompleteBeautyProduct[] = [];
  for (const item of rawQueue) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (
      typeof it.platform !== "string" ||
      typeof it.platform_product_id !== "string"
    ) continue;

    const rawKind = it.subcategory_kind as string;
    const subcategory_kind: BeautySubcategoryKind = VALID_SUBCATEGORY_KINDS.has(rawKind)
      ? (rawKind as BeautySubcategoryKind)
      : "skincare";

    const applicableFields = FIELDS_FOR_SUBCATEGORY[subcategory_kind];
    const rawFields = (it.fields && typeof it.fields === "object")
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

export function BeautyAgentChatSurface() {
  const screen = useMerchantBeautyStore((s) => s.screen);
  const setScreen = useMerchantBeautyStore((s) => s.setScreen);
  const setQueue = useMerchantBeautyStore((s) => s.setQueue);
  const queueLength = useMerchantBeautyStore((s) => s.queue.length);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        const { queue, totals } = shapeQueue(payload);
        setQueue(queue, totals);
        if (queue.length === 0) {
          if (screen !== "paused") setScreen("done");
        } else if (screen === "done") {
          setScreen("trigger");
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load beauty completeness"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const content = useMemo(() => {
    if (loading) return <LoadingBubble />;
    if (loadError)
      return (
        <div style={{ color: "var(--p-coral-icon)", fontSize: 13 }}>
          Couldn&apos;t load your beauty catalog state: {loadError}
        </div>
      );
    if (queueLength === 0 && screen === "done") return <BeautyFullyCoveredIdle />;
    if (queueLength === 0 && screen === "structured") return <BeautyPausedCard />;
    switch (screen) {
      case "trigger":        return <BeautyTriggerCard />;
      case "structured":     return <BeautyStructuredEditor />;
      case "done":           return <BeautyDoneCard />;
      case "honest_feedback": return <BeautyHonestFeedbackCard />;
      case "defer":          return <BeautyDeferCard />;
      case "paused":         return <BeautyPausedCard />;
      default:               return <BeautyTriggerCard />;
    }
  }, [loading, loadError, queueLength, screen]);

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

function LoadingBubble() {
  return (
    <div className="p-bubble">
      <div className="p-bubble-avatar" aria-hidden />
      <div className="p-bubble-body" style={{ color: "var(--p-neutral-500)", fontSize: 13 }}>
        Checking your beauty catalog…
      </div>
    </div>
  );
}

function BeautyFullyCoveredIdle() {
  return (
    <div className="p-card" style={{ padding: 20, textAlign: "center" }}>
      <div className="p-serif" style={{ fontSize: 20, marginBottom: 6 }}>
        Your beauty catalog is covered.
      </div>
      <div style={{ color: "var(--p-neutral-500)", fontSize: 13.5 }}>
        Every product has its required fields — ingredients, how-to-use, and care info
        where applicable. AI agents will be able to answer detailed product questions.
      </div>
    </div>
  );
}
