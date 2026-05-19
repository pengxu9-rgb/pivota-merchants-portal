"use client";

/**
 * Screen 06 — Structured one-by-one authoring.
 *
 * The merchant pages through their incomplete fashion products, fills in
 * material / care / size_guide per product, and saves to the backend.
 *
 * Per-field state badges read off the catalog_products row's *_source
 * column (surfaced by the readiness payload). Locked fields show the
 * Shopify metafield owner; LLM-filled fields show the confidence and
 * invite review. Missing fields get static curated sample chips that
 * insert into the input — never auto-fill from those (Pivota does not
 * fabricate).
 *
 * Footer:
 *   - "I don't know — skip" → sets terminal exclusion (state G); advances
 *   - "Apply to similar N" → bulk-PUT (deferred, posts a CSM note in v1)
 *   - "Save + next" → PUT with the current draft; record outcomes;
 *     advance cursor. The store's advanceCursor() handles the
 *     done / honest_feedback transition past the last product.
 */

import { ArrowRight, Pencil } from "lucide-react";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";
import {
  selectCurrentProduct,
  useMerchantFashionStore,
} from "@/lib/merchant-fashion-store";
import type {
  FashionFieldsDraft,
  FieldName,
} from "@/types/fashion-authoring";
import { productKey } from "@/types/fashion-authoring";

import { AgentBubble } from "./AgentBubble";
import { FormField } from "./FormField";
import { ReplyChip } from "./ReplyChip";

const MATERIAL_SAMPLES = [
  "100% cotton",
  "Satin · polyester blend",
  "90% nylon 10% spandex",
];
const CARE_SAMPLES = [
  "Machine wash cold; tumble dry low",
  "Hand wash cold; lay flat to dry",
  "Dry clean only",
];
const SIZE_GUIDE_SAMPLES = [
  "See size chart in description",
  "Runs true to size",
];

export function StructuredEditor() {
  const current = useMerchantFashionStore(selectCurrentProduct);
  const cursor = useMerchantFashionStore((s) => s.cursor);
  const total = useMerchantFashionStore((s) => s.queue.length);
  const drafts = useMerchantFashionStore((s) => s.drafts);
  const setDraft = useMerchantFashionStore((s) => s.setDraft);
  const advance = useMerchantFashionStore((s) => s.advanceCursor);
  const recordOutcomes = useMerchantFashionStore((s) => s.recordOutcomes);
  const markUnknown = useMerchantFashionStore((s) => s.markUnknown);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!current) {
    return (
      <AgentBubble>
        <div style={{ color: "var(--p-neutral-500)", fontSize: 13 }}>
          No products left in the queue.
        </div>
      </AgentBubble>
    );
  }

  const key = productKey(current);
  const draft: FashionFieldsDraft = drafts[key] || {};

  function field(name: FieldName): string {
    const v = draft[name];
    if (v == null) return "";
    if (typeof v === "string") return v;
    // size_guide may come back as a dict from a prior load; show its raw text
    if (typeof v === "object" && "raw" in v) return String((v as { raw: unknown }).raw ?? "");
    return "";
  }

  function update(name: FieldName, next: string) {
    setSaveError(null);
    setDraft(key, { [name]: next });
  }

  async function save() {
    if (!current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: FashionFieldsDraft = {};
      // null means "leave unchanged" per backend; we send only fields the
      // merchant actually typed into (non-empty).
      (Object.keys(draft) as FieldName[]).forEach((f) => {
        const v = draft[f];
        if (typeof v === "string" && v.trim().length > 0) {
          body[f] = v.trim();
        }
      });
      if (Object.keys(body).length === 0) {
        // Nothing to save; just advance.
        advance();
        return;
      }
      const resp = await apiClient.updateMerchantProductFashionFields(
        current.platform,
        current.platform_product_id,
        body,
      );
      recordOutcomes(key, resp.outcomes || {});
      advance();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function skip() {
    // "I don't know — skip" is documented as a soft skip in the design
    // (advance, do NOT mark unknown). State G is the explicit terminal
    // opt-out; in v1 we surface that via the Defer screen's tip block.
    advance();
  }

  return (
    <AgentBubble>
      {/* Conversation header */}
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, marginBottom: 12 }}>
        Let&apos;s go one at a time. Fill in what you know; skip what you don&apos;t.
      </p>

      <div className="p-card p-card-md" style={{ overflow: "hidden" }}>
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderBottom: "0.5px solid var(--p-border)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 56,
              borderRadius: 8,
              background: current.image_url
                ? `url(${current.image_url}) center/cover`
                : "linear-gradient(135deg, #efe7dc, #f4f4f2)",
              flex: "0 0 44px",
            }}
            aria-hidden
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: "var(--p-neutral-900)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {current.title}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--p-neutral-500)",
                marginTop: 2,
                display: "flex",
                gap: 8,
              }}
            >
              <span className="p-mono">
                {current.sku || current.platform_product_id}
              </span>
              <span>·</span>
              <span style={{ textTransform: "capitalize" }}>{current.platform}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--p-neutral-500)" }}>
            {cursor + 1} of {total}
          </div>
        </div>

        {/* Form */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: 14,
          }}
        >
          <FormField
            label="Material"
            status={current.fields.material.status}
            confidence={current.fields.material.confidence}
            value={field("material")}
            placeholder="100% mulberry silk"
            samples={current.fields.material.status === "missing" ? MATERIAL_SAMPLES : undefined}
            onChange={(next) => update("material", next)}
          />
          <FormField
            label="Care"
            status={current.fields.care.status}
            confidence={current.fields.care.confidence}
            value={field("care")}
            placeholder="Hand wash cold; lay flat to dry"
            samples={current.fields.care.status === "missing" ? CARE_SAMPLES : undefined}
            onChange={(next) => update("care", next)}
          />
          <FormField
            label="Size guide"
            status={current.fields.size_guide.status}
            confidence={current.fields.size_guide.confidence}
            value={field("size_guide")}
            placeholder="See size chart below for measurements"
            samples={current.fields.size_guide.status === "missing" ? SIZE_GUIDE_SAMPLES : undefined}
            externalLink={
              current.fields.size_guide.status === "merchant-payload-locked"
                ? { href: "#", label: "View Shopify size chart" }
                : undefined
            }
            onChange={(next) => update("size_guide", next)}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            background: "var(--p-bg)",
            borderTop: "0.5px solid var(--p-border)",
          }}
        >
          <button
            type="button"
            onClick={skip}
            style={{
              border: "none",
              background: "none",
              fontSize: 12,
              color: "var(--p-neutral-500)",
              cursor: "pointer",
            }}
          >
            I don&apos;t know — skip
          </button>
          <div style={{ flex: 1 }} />
          <ReplyChip
            icon={Pencil}
            onClick={() => {
              if (current) markUnknown(key);
            }}
          >
            No answer known
          </ReplyChip>
          <ReplyChip
            variant="primary"
            icon={ArrowRight}
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : cursor + 1 === total ? "Save + finish" : "Save + next"}
          </ReplyChip>
        </div>
      </div>

      {/* Status / progress / errors */}
      <div
        style={{
          fontSize: 12,
          color: "var(--p-neutral-500)",
          marginTop: 8,
        }}
      >
        You&apos;re {cursor + 1} of {total} through. Pause anytime — I&apos;ll keep your spot.
      </div>
      {saveError ? (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--p-coral-icon)",
            background: "var(--p-coral-bg)",
            padding: "8px 12px",
            borderRadius: 10,
            marginTop: 8,
          }}
        >
          Couldn&apos;t save: {saveError}. Try again — your typing isn&apos;t lost.
        </div>
      ) : null}
    </AgentBubble>
  );
}
