"use client";

import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { apiClient } from "@/lib/api-client";
import {
  selectCurrentBeautyProduct,
  useBeautyStore,
} from "./BeautyStoreContext";
import {
  BEAUTY_FIELD_LABELS,
  FIELDS_FOR_SUBCATEGORY,
  SUBCATEGORY_LABELS,
  beautyProductKey,
} from "@/types/beauty-authoring";
import type {
  BeautyFieldName,
  BeautyFieldsDraft,
  FieldStateSummary,
} from "@/types/beauty-authoring";

import { AgentBubble } from "./AgentBubble";
import { ReplyChip } from "./ReplyChip";

const SKIN_CONCERNS = [
  "oily", "dry", "combination", "normal", "sensitive",
  "acne-prone", "aging", "hyperpigmentation", "redness", "dullness",
] as const;

// ── per-field placeholder copy ──────────────────────────────────────────────

const PLACEHOLDERS: Partial<Record<BeautyFieldName, string>> = {
  raw_inci: "Aqua, Glycerin, Niacinamide, …",
  how_to_use_text: "Apply 2–3 drops to cleansed skin, massage gently…",
  tool_material: "Synthetic bristles, stainless steel ferrule, bamboo handle",
  use_with: "Foundation, concealer, setting powder",
  care_instructions: "Rinse bristles with warm water after each use…",
};

// ── sub-components ──────────────────────────────────────────────────────────

function TextAreaField({
  fieldName,
  value,
  status,
  confidence,
  onChange,
}: {
  fieldName: BeautyFieldName;
  value: string;
  status: FieldStateSummary["status"];
  confidence?: number | null;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const locked = status === "merchant-payload-locked";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label htmlFor={id} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--p-neutral-900)" }}>
          {BEAUTY_FIELD_LABELS[fieldName]}
        </label>
        <StatusBadge status={status} confidence={confidence} />
      </div>
      <textarea
        id={id}
        value={locked ? "" : value}
        placeholder={locked ? "Owned by Shopify — edit there" : PLACEHOLDERS[fieldName] ?? ""}
        readOnly={locked}
        rows={fieldName === "raw_inci" ? 4 : 3}
        onChange={(e) => !locked && onChange(e.target.value)}
        className={`p-input${locked ? " p-input--locked" : ""}`}
        style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
      />
    </div>
  );
}

function TextInputField({
  fieldName,
  value,
  status,
  confidence,
  onChange,
}: {
  fieldName: BeautyFieldName;
  value: string;
  status: FieldStateSummary["status"];
  confidence?: number | null;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const locked = status === "merchant-payload-locked";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label htmlFor={id} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--p-neutral-900)" }}>
          {BEAUTY_FIELD_LABELS[fieldName]}
        </label>
        <StatusBadge status={status} confidence={confidence} />
      </div>
      <input
        id={id}
        type="text"
        value={locked ? "" : value}
        placeholder={locked ? "Owned by Shopify — edit there" : PLACEHOLDERS[fieldName] ?? ""}
        readOnly={locked}
        onChange={(e) => !locked && onChange(e.target.value)}
        className={`p-input${locked ? " p-input--locked" : ""}`}
      />
    </div>
  );
}

function SkinConcernsField({
  value,
  status,
  onChange,
}: {
  value: string;
  status: FieldStateSummary["status"];
  onChange: (v: string) => void;
}) {
  const selected = new Set(value.split(",").map((s) => s.trim()).filter(Boolean));
  const locked = status === "merchant-payload-locked";

  function toggle(concern: string) {
    if (locked) return;
    const next = new Set(selected);
    if (next.has(concern)) next.delete(concern);
    else next.add(concern);
    onChange([...next].join(", "));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--p-neutral-900)" }}>
          Skin concerns
        </span>
        <StatusBadge status={status} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SKIN_CONCERNS.map((c) => {
          const active = selected.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              disabled={locked}
              className={`p-pill ${active ? "p-pill--teal" : "p-pill--ghost"}`}
              style={{
                fontSize: 11,
                padding: "4px 10px",
                cursor: locked ? "default" : "pointer",
                opacity: locked ? 0.5 : 1,
              }}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  confidence,
}: {
  status: FieldStateSummary["status"];
  confidence?: number | null;
}) {
  const map: Record<typeof status, { label: string; cls: string }> = {
    missing: { label: "Missing", cls: "p-pill--coral" },
    "filled-by-llm": {
      label: confidence != null ? `Auto-filled · ${Math.round(confidence * 100)}%` : "Auto-filled",
      cls: "p-pill--tip",
    },
    "merchant-authored": { label: "You wrote this", cls: "p-pill--teal" },
    "merchant-payload-locked": { label: "Shopify owns this", cls: "p-pill--locked" },
    inherited: { label: "Inherited", cls: "p-pill--teal" },
  };
  const { label, cls } = map[status] ?? map.missing;
  return <span className={`p-pill ${cls}`}>{label}</span>;
}

// ── main editor ─────────────────────────────────────────────────────────────

export function BeautyStructuredEditor() {
  const product = useBeautyStore(selectCurrentBeautyProduct);
  const cursor = useBeautyStore((s) => s.cursor);
  const queueLength = useBeautyStore((s) => s.queue.length);
  const drafts = useBeautyStore((s) => s.drafts);
  const setDraft = useBeautyStore((s) => s.setDraft);
  const advanceCursor = useBeautyStore((s) => s.advanceCursor);
  const retreatCursor = useBeautyStore((s) => s.retreatCursor);
  const recordOutcomes = useBeautyStore((s) => s.recordOutcomes);
  const markUnknown = useBeautyStore((s) => s.markUnknown);
  const setScreen = useBeautyStore((s) => s.setScreen);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [cursor]);

  if (!product) return null;

  const pKey = beautyProductKey(product);
  const draft: BeautyFieldsDraft = drafts[pKey] ?? {};
  const applicableFields = FIELDS_FOR_SUBCATEGORY[product.subcategory_kind];

  function fieldValue(fieldName: BeautyFieldName): string {
    const draftVal = (draft as Record<string, unknown>)[fieldName];
    if (typeof draftVal === "string") return draftVal;
    const existing = product!.fields[fieldName];
    if (existing?.value && typeof existing.value === "string") return existing.value;
    return "";
  }

  function onFieldChange(fieldName: BeautyFieldName, value: string) {
    setDraft(pKey, { [fieldName]: value });
  }

  async function handleSave() {
    if (!product) return;
    setSaving(true);
    setSaveError(null);
    const payload: Record<string, string | null> = {};
    for (const fieldName of applicableFields) {
      const val = fieldValue(fieldName);
      if (val.trim()) payload[fieldName] = val.trim();
    }
    try {
      const result = await apiClient.updateMerchantProductBeautyFields(
        product.platform,
        product.platform_product_id,
        payload
      );
      recordOutcomes(pKey, result.outcomes as any);
      advanceCursor();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed — try again");
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    markUnknown(pKey);
  }

  const hasAnyValue = applicableFields.some((f) => fieldValue(f).trim().length > 0);

  return (
    <div ref={containerRef}>
      <AgentBubble>
        {/* Progress */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span
            style={{
              fontSize: 10.5,
              color: "var(--p-neutral-400)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {cursor + 1} / {queueLength}
          </span>
          <span
            style={{
              fontSize: 10.5,
              background: "var(--p-tip-bg)",
              color: "var(--p-tip-icon)",
              borderRadius: 5,
              padding: "2px 7px",
              fontWeight: 500,
            }}
          >
            {SUBCATEGORY_LABELS[product.subcategory_kind]}
          </span>
        </div>

        {/* Product header */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
          {product.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.title}
              style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
            />
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--p-neutral-900)", lineHeight: 1.3 }}>
              {product.title}
            </div>
            {product.sku && (
              <div style={{ fontSize: 11, color: "var(--p-neutral-400)", marginTop: 2 }}>
                SKU {product.sku}
              </div>
            )}
          </div>
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {applicableFields.map((fieldName) => {
            const fieldState = product.fields[fieldName] ?? { status: "missing" as const };
            const val = fieldValue(fieldName);

            if (fieldName === "skin_concerns") {
              return (
                <SkinConcernsField
                  key={fieldName}
                  value={val}
                  status={fieldState.status}
                  onChange={(v) => onFieldChange(fieldName, v)}
                />
              );
            }
            const isLong = fieldName === "raw_inci" || fieldName === "how_to_use_text" || fieldName === "care_instructions";
            return isLong ? (
              <TextAreaField
                key={fieldName}
                fieldName={fieldName}
                value={val}
                status={fieldState.status}
                confidence={fieldState.confidence}
                onChange={(v) => onFieldChange(fieldName, v)}
              />
            ) : (
              <TextInputField
                key={fieldName}
                fieldName={fieldName}
                value={val}
                status={fieldState.status}
                confidence={fieldState.confidence}
                onChange={(v) => onFieldChange(fieldName, v)}
              />
            );
          })}
        </div>

        {saveError && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12.5,
              color: "var(--p-coral-icon)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <AlertTriangle size={13} />
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          {cursor > 0 && (
            <ReplyChip icon={ArrowLeft} onClick={retreatCursor}>
              Back
            </ReplyChip>
          )}
          <ReplyChip
            icon={saving ? undefined : ArrowRight}
            onClick={handleSave}
            disabled={saving || !hasAnyValue}
          >
            {saving ? "Saving…" : "Save + next"}
          </ReplyChip>
          <ReplyChip onClick={handleSkip}>
            No answer known — skip
          </ReplyChip>
          <ReplyChip onClick={() => setScreen("defer")}>
            Come back later
          </ReplyChip>
        </div>
      </AgentBubble>
    </div>
  );
}
