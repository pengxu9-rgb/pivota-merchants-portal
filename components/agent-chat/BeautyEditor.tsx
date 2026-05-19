"use client";

/**
 * Beauty parallel of StructuredEditor. Same cursor/queue/save shape;
 * different fields (raw_inci / how_to_use_text / skin_concerns).
 *
 * Walks the merchant's beauty queue one-at-a-time. Fields:
 *   - raw_inci          → free-text INCI list (textarea — these are long)
 *   - how_to_use_text   → free-text usage instructions (textarea)
 *   - skin_concerns     → multi-select from a fixed enum surfaced by the
 *                         GET /beauty_completeness response
 *
 * The structured editor's pattern (header, footer, save/skip/markUnknown
 * affordances, race-safe inflightRef, product_not_found warning) is
 * preserved. Future refactor could extract the shared scaffolding into
 * a base; for v2.0 alpha the duplication is intentional — keeps the
 * fashion code path untouched while beauty stabilizes.
 */

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { useRef, useState } from "react";

import { apiClient } from "@/lib/api-client";
import {
  selectCurrentProduct,
  useMerchantFashionStore,
} from "@/lib/merchant-fashion-store";
import type {
  BeautyFieldsDraft,
  IncompleteBeautyProduct,
  SkinConcern,
} from "@/types/fashion-authoring";
import {
  ALLOWED_SKIN_CONCERNS,
  productKey,
} from "@/types/fashion-authoring";

import { AgentBubble } from "./AgentBubble";
import { ReplyChip } from "./ReplyChip";

const CONCERN_LABELS: Record<SkinConcern, string> = {
  oily: "Oily",
  dry: "Dry",
  combination: "Combination",
  normal: "Normal",
  sensitive: "Sensitive",
  "acne-prone": "Acne-prone",
  aging: "Aging",
  hyperpigmentation: "Hyperpigmentation",
  redness: "Redness",
  dullness: "Dullness",
};

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
    // AgentChatSurface dispatches to PausedCard for empty queue and to
    // StructuredEditor for fashion — this branch is defensive only.
    return null;
  }

  const key = productKey(current);
  const draft: BeautyFieldsDraft =
    (drafts[key] as BeautyFieldsDraft | undefined) || {};

  function readText(name: "raw_inci" | "how_to_use_text"): string {
    const v = draft[name];
    return typeof v === "string" ? v : "";
  }

  function readConcerns(): SkinConcern[] {
    const v = draft.skin_concerns;
    return Array.isArray(v) ? v : [];
  }

  function updateText(name: "raw_inci" | "how_to_use_text", next: string) {
    setSaveError(null);
    setDraft(key, { [name]: next });
  }

  function toggleConcern(concern: SkinConcern) {
    setSaveError(null);
    const current = readConcerns();
    const next = current.includes(concern)
      ? current.filter((c) => c !== concern)
      : [...current, concern];
    setDraft(key, { skin_concerns: next });
  }

  async function save() {
    if (!current) return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    setSaving(true);
    setSaveError(null);
    setNotFoundWarning(null);
    try {
      const body: {
        raw_inci?: string;
        how_to_use_text?: string;
        skin_concerns?: SkinConcern[];
      } = {};
      const inci = draft.raw_inci;
      if (typeof inci === "string" && inci.trim().length > 0) {
        body.raw_inci = inci.trim();
      }
      const how = draft.how_to_use_text;
      if (typeof how === "string" && how.trim().length > 0) {
        body.how_to_use_text = how.trim();
      }
      const concerns = readConcerns();
      if (concerns.length > 0) {
        body.skin_concerns = concerns;
      }

      if (Object.keys(body).length === 0) {
        advance();
        return;
      }
      const resp = await apiClient.updateMerchantProductBeautyFields(
        current.platform,
        current.platform_product_id,
        body,
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
    if (current) markUnknown(key);
  }

  const fields = current.fields;
  const inciStatus = fields.raw_inci.status;
  const howStatus = fields.how_to_use_text.status;
  const concernsStatus = fields.skin_concerns.status;

  return (
    <AgentBubble>
      {/* Header */}
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
                BEAUTY
              </span>
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
            gap: 18,
            padding: 14,
          }}
        >
          <BeautyTextarea
            label="Ingredient list (INCI)"
            placeholder="Aqua / Water, Glycerin, Niacinamide, …"
            value={readText("raw_inci")}
            status={inciStatus}
            onChange={(v) => updateText("raw_inci", v)}
            hint="Paste the full INCI list. Shopping agents use this to answer ingredient questions like &quot;does this have parabens?&quot;"
            sampleValue={fields.raw_inci.value as string | null}
          />
          <BeautyTextarea
            label="How to use"
            placeholder="Apply morning and evening to clean skin. Follow with moisturizer."
            value={readText("how_to_use_text")}
            status={howStatus}
            onChange={(v) => updateText("how_to_use_text", v)}
            hint="Application instructions or routine notes."
            sampleValue={fields.how_to_use_text.value as string | null}
          />
          <ConcernsMultiSelect
            selected={readConcerns()}
            status={concernsStatus}
            currentValue={fields.skin_concerns.value as string[] | null}
            onToggle={toggleConcern}
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

/** Long-text editor for INCI / how-to-use. Renders the existing
 *  value as a hint when the field is filled but the merchant hasn't
 *  edited yet (so they can read what's there before deciding to
 *  override). */
function BeautyTextarea({
  label,
  placeholder,
  value,
  status,
  hint,
  sampleValue,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  status: string;
  hint?: string;
  sampleValue?: string | null;
  onChange: (v: string) => void;
}) {
  const locked = status === "merchant-payload-locked";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--p-neutral-900)",
          }}
        >
          {label}
        </label>
        <FieldStatusBadge status={status} />
      </div>
      <textarea
        value={locked ? "" : value}
        placeholder={
          locked
            ? "Shopify metafield value is authoritative"
            : placeholder
        }
        readOnly={locked}
        onChange={locked ? undefined : (e) => onChange(e.target.value)}
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
      {sampleValue && !locked ? (
        <div style={{ fontSize: 11, color: "var(--p-neutral-500)", lineHeight: 1.4 }}>
          Current value:{" "}
          <span style={{ color: "var(--p-neutral-900)" }}>{sampleValue.slice(0, 200)}{sampleValue.length > 200 ? "…" : ""}</span>
        </div>
      ) : null}
      {hint ? (
        <div style={{ fontSize: 11, color: "var(--p-neutral-500)" }}>{hint}</div>
      ) : null}
    </div>
  );
}

function ConcernsMultiSelect({
  selected,
  status,
  currentValue,
  onToggle,
}: {
  selected: SkinConcern[];
  status: string;
  currentValue?: string[] | null;
  onToggle: (concern: SkinConcern) => void;
}) {
  const locked = status === "merchant-payload-locked";
  // If selected is empty and the product already has stored concerns,
  // show those as the baseline so the merchant sees "you already said
  // X; click to deselect or add more." Pre-fill the draft on first
  // render via the parent's draft init — but we don't have a hook
  // here. For v1 we just display them with selected styling if they
  // match.
  const displayed = selected.length > 0 ? selected : ((currentValue || []).filter((v): v is SkinConcern =>
    (ALLOWED_SKIN_CONCERNS as readonly string[]).includes(v),
  ));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--p-neutral-900)",
          }}
        >
          Skin concerns this product targets
        </label>
        <FieldStatusBadge status={status} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ALLOWED_SKIN_CONCERNS.map((concern) => {
          const isOn = displayed.includes(concern);
          return (
            <button
              key={concern}
              type="button"
              onClick={locked ? undefined : () => onToggle(concern)}
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
              {CONCERN_LABELS[concern]}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--p-neutral-500)" }}>
        Pick all that apply. These tag the product for shopper searches like &quot;serum
        for oily skin.&quot;
      </div>
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
