"use client";

/**
 * v2.1 beauty editor — renders fields generically from the backend's
 * per-product field_schemas list. The same component renders skincare,
 * makeup, and tools forms because the schema (label, placeholder, type,
 * allowed_values) comes from `current.field_schemas` rather than
 * hard-coded UI logic.
 *
 * Cursor / save / skip / markUnknown / Back-to-overview mirror
 * StructuredEditor. Future refactor could extract the shared
 * scaffolding into a base component; v2.1 keeps the duplication so the
 * fashion path stays untouched while beauty stabilizes.
 *
 * Codex review-style concerns carried over from v2.0:
 *   - inflightRef race guard on save (double-click safe)
 *   - product_not_found visible warning + no auto-advance
 *   - merchant_payload-locked fields render as read-only with explanation
 */

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { useId, useRef, useState } from "react";

import { apiClient } from "@/lib/api-client";
import {
  selectCurrentProduct,
  useMerchantFashionStore,
} from "@/lib/merchant-fashion-store";
import type {
  BeautyFieldName,
  BeautyFieldsDraft,
  FieldSchema,
  IncompleteBeautyProduct,
} from "@/types/fashion-authoring";
import { productKey } from "@/types/fashion-authoring";

import { AgentBubble } from "./AgentBubble";
import { ReplyChip } from "./ReplyChip";

export function BeautyEditor() {
  const current = useMerchantFashionStore(selectCurrentProduct) as
    | IncompleteBeautyProduct
    | undefined;
  const cursor = useMerchantFashionStore((s) => s.cursor);
  const total = useMerchantFashionStore((s) => s.queue.length);
  const drafts = useMerchantFashionStore((s) => s.drafts);
  const setDraft = useMerchantFashionStore((s) => s.setDraft);
  const advance = useMerchantFashionStore((s) => s.advanceCursor);
  const recordOutcomes = useMerchantFashionStore((s) => s.recordOutcomes);
  const markUnknown = useMerchantFashionStore((s) => s.markUnknown);
  const setScreen = useMerchantFashionStore((s) => s.setScreen);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notFoundWarning, setNotFoundWarning] = useState<string | null>(null);
  const inflightRef = useRef(false);

  if (!current || current.category_kind !== "beauty") {
    return null;
  }

  const key = productKey(current);
  const draft: BeautyFieldsDraft =
    (drafts[key] as BeautyFieldsDraft | undefined) || {};

  function getDraftValue(field: BeautyFieldName): string | string[] | null {
    const v = (draft as Record<string, unknown>)[field];
    if (v == null) return null;
    if (typeof v === "string" || Array.isArray(v)) return v as string | string[];
    return null;
  }

  function setText(field: BeautyFieldName, next: string) {
    setSaveError(null);
    setDraft(key, { [field]: next } as Partial<BeautyFieldsDraft>);
  }

  function toggleEnumValue(field: BeautyFieldName, value: string) {
    setSaveError(null);
    const existing = (draft as Record<string, unknown>)[field];
    const list: string[] = Array.isArray(existing) ? (existing as string[]) : [];
    const next = list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
    setDraft(key, { [field]: next } as Partial<BeautyFieldsDraft>);
  }

  async function save() {
    if (!current) return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    setSaving(true);
    setSaveError(null);
    setNotFoundWarning(null);
    try {
      const body: Record<string, string | string[]> = {};
      for (const schema of current.field_schemas) {
        const v = (draft as Record<string, unknown>)[schema.name];
        if (schema.type === "enum_multi") {
          if (Array.isArray(v) && v.length > 0) {
            body[schema.name] = v as string[];
          }
        } else if (typeof v === "string" && v.trim().length > 0) {
          body[schema.name] = v.trim();
        }
      }
      if (Object.keys(body).length === 0) {
        advance();
        return;
      }
      const resp = await apiClient.updateMerchantProductBeautyFields(
        current.platform,
        current.platform_product_id,
        body as Parameters<typeof apiClient.updateMerchantProductBeautyFields>[2],
      );
      const outcomes = resp.outcomes || {};
      recordOutcomes(key, outcomes);
      if (Object.values(outcomes).some((o) => o === "product_not_found")) {
        setNotFoundWarning(
          "We couldn't find this product in your synced catalog. Re-sync from your platform and try again.",
        );
        return;
      }
      advance();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      inflightRef.current = false;
      setSaving(false);
    }
  }

  function skip() {
    if (inflightRef.current) return;
    advance();
  }

  function markUnknownAndAdvance() {
    if (inflightRef.current) return;
    markUnknown(key);
  }

  return (
    <AgentBubble>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
          Let&apos;s go one at a time. Fill in what you know; skip what you
          don&apos;t.
        </p>
        <button
          type="button"
          onClick={() => {
            if (inflightRef.current) return;
            setScreen("trigger");
          }}
          disabled={saving}
          style={{
            background: "none",
            border: "none",
            color: "var(--p-primary)",
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.5 : 1,
            padding: 4,
          }}
        >
          <ArrowLeft size={12} strokeWidth={1.8} />
          Back to overview
        </button>
      </div>

      <div className="p-card p-card-md" style={{ overflow: "hidden" }}>
        {/* Product header row */}
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
                alignItems: "center",
              }}
            >
              <span
                className="p-pill"
                style={{
                  background: "var(--p-primary-50)",
                  color: "var(--p-primary-800)",
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {(current.subcategory_label || current.subcategory_kind).toUpperCase()}
              </span>
              {current.category_path ? (
                <span className="p-mono" style={{ fontSize: 10 }}>
                  {current.category_path}
                </span>
              ) : null}
              <span style={{ textTransform: "capitalize" }}>{current.platform}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--p-neutral-500)" }}>
            {cursor + 1} of {total}
          </div>
        </div>

        {/* Form — render each field generically based on its schema. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            padding: 14,
          }}
        >
          {current.field_schemas.map((schema) => {
            const fieldName = schema.name as BeautyFieldName;
            const fieldState = current.fields[fieldName];
            return (
              <SchemaField
                key={schema.name}
                schema={schema}
                status={fieldState?.status || "missing"}
                currentValue={fieldState?.value ?? null}
                draftValue={getDraftValue(fieldName)}
                onTextChange={(v) => setText(fieldName, v)}
                onEnumToggle={(v) => toggleEnumValue(fieldName, v)}
              />
            );
          })}
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
            disabled={saving}
            style={{
              border: "none",
              background: "none",
              fontSize: 12,
              color: "var(--p-neutral-500)",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.5 : 1,
            }}
          >
            I don&apos;t know — skip
          </button>
          <div style={{ flex: 1 }} />
          <ReplyChip
            icon={Pencil}
            onClick={markUnknownAndAdvance}
            disabled={saving}
          >
            No answer known
          </ReplyChip>
          <ReplyChip
            variant="primary"
            icon={ArrowRight}
            onClick={save}
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : cursor + 1 === total
                ? "Save + finish"
                : "Save + next"}
          </ReplyChip>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--p-neutral-500)", marginTop: 8 }}>
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
      {notFoundWarning ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            fontSize: 12.5,
            color: "var(--p-tip-fg)",
            background: "var(--p-tip-bg)",
            padding: "8px 12px",
            borderRadius: 10,
            marginTop: 8,
          }}
        >
          <AlertTriangle
            size={14}
            strokeWidth={1.8}
            style={{ flex: "0 0 14px", marginTop: 2 }}
          />
          <div>{notFoundWarning}</div>
        </div>
      ) : null}
    </AgentBubble>
  );
}

/** One field row, type-dispatched by schema.type. */
function SchemaField({
  schema,
  status,
  currentValue,
  draftValue,
  onTextChange,
  onEnumToggle,
}: {
  schema: FieldSchema;
  status: string;
  currentValue: string | string[] | Record<string, unknown> | null | undefined;
  draftValue: string | string[] | null;
  onTextChange: (v: string) => void;
  onEnumToggle: (v: string) => void;
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const locked = status === "merchant-payload-locked";

  const draftText = typeof draftValue === "string" ? draftValue : "";
  const draftMultiList = Array.isArray(draftValue) ? draftValue : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label
          htmlFor={inputId}
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--p-neutral-900)",
          }}
        >
          {schema.label}
        </label>
        <FieldStatusBadge status={status} />
      </div>

      {schema.type === "textarea" ? (
        <textarea
          id={inputId}
          value={locked ? "" : draftText}
          placeholder={locked ? "Shopify metafield value is authoritative" : schema.placeholder}
          readOnly={locked}
          aria-describedby={schema.hint ? hintId : undefined}
          onChange={locked ? undefined : (e) => onTextChange(e.target.value)}
          rows={3}
          className={`p-input ${locked ? "p-input--locked" : ""}`}
          style={{
            minHeight: 64,
            fontSize: 12.5,
            fontFamily: "inherit",
            resize: "vertical",
            lineHeight: 1.5,
          }}
        />
      ) : schema.type === "text" ? (
        <input
          id={inputId}
          type="text"
          value={locked ? "" : draftText}
          placeholder={locked ? "Shopify metafield value is authoritative" : schema.placeholder}
          readOnly={locked}
          aria-describedby={schema.hint ? hintId : undefined}
          onChange={locked ? undefined : (e) => onTextChange(e.target.value)}
          className={`p-input ${locked ? "p-input--locked" : ""}`}
        />
      ) : schema.type === "enum" ? (
        <select
          id={inputId}
          value={draftText || (typeof currentValue === "string" ? currentValue : "")}
          disabled={locked}
          onChange={(e) => onTextChange(e.target.value)}
          className={`p-input ${locked ? "p-input--locked" : ""}`}
          style={{ fontSize: 12.5 }}
        >
          <option value="">Pick one…</option>
          {(schema.allowed_values || []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <EnumMulti
          allowed={schema.allowed_values || []}
          selected={
            draftMultiList.length > 0
              ? draftMultiList
              : Array.isArray(currentValue)
                ? currentValue
                : []
          }
          locked={locked}
          onToggle={onEnumToggle}
        />
      )}

      {/* Show existing value as context when merchant hasn't started typing. */}
      {!locked && draftText.length === 0 && draftMultiList.length === 0 && currentValue ? (
        <div style={{ fontSize: 11, color: "var(--p-neutral-500)", lineHeight: 1.4 }}>
          Current value:{" "}
          <span style={{ color: "var(--p-neutral-900)" }}>
            {Array.isArray(currentValue)
              ? currentValue.join(", ")
              : typeof currentValue === "string"
                ? currentValue.slice(0, 200) + (currentValue.length > 200 ? "…" : "")
                : JSON.stringify(currentValue)}
          </span>
        </div>
      ) : null}

      {schema.hint ? (
        <div id={hintId} style={{ fontSize: 11, color: "var(--p-neutral-500)" }}>
          {schema.hint}
        </div>
      ) : null}
    </div>
  );
}

function EnumMulti({
  allowed,
  selected,
  locked,
  onToggle,
}: {
  allowed: string[];
  selected: string[];
  locked: boolean;
  onToggle: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {allowed.map((value) => {
        const isOn = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={locked ? undefined : () => onToggle(value)}
            disabled={locked}
            aria-pressed={isOn}
            style={{
              background: isOn ? "var(--p-primary-50)" : "var(--p-surface)",
              border: isOn
                ? "1px solid var(--p-primary)"
                : "0.5px solid var(--p-border-strong)",
              color: isOn ? "var(--p-primary-800)" : "var(--p-neutral-500)",
              borderRadius: 999,
              padding: "5px 11px",
              fontSize: 11.5,
              fontWeight: isOn ? 600 : 500,
              cursor: locked ? "not-allowed" : "pointer",
              opacity: locked ? 0.6 : 1,
              transition: "background 160ms var(--p-easing)",
            }}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

function FieldStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "missing":
      return <span className="p-pill p-pill--coral">Missing</span>;
    case "merchant-payload-locked":
      return <span className="p-pill p-pill--locked">Shopify owns this</span>;
    case "filled-by-llm":
      return <span className="p-pill p-pill--tip">Auto-filled · review</span>;
    case "merchant-authored":
      return <span className="p-pill p-pill--teal">You wrote this</span>;
    case "inherited":
      return <span className="p-pill p-pill--teal">Inherited</span>;
    default:
      return null;
  }
}
