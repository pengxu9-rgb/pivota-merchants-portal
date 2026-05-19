"use client";

import { ExternalLink, Lock } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";

import type { FieldStatus } from "@/types/fashion-authoring";

type BadgeKind = "missing" | "auto-filled" | "locked" | "merchant-authored";

interface FormFieldProps {
  /** Display label like "Material" / "Care" / "Size guide". */
  label: string;
  /** Current input value. */
  value: string;
  /** Optional placeholder shown when value is empty. */
  placeholder?: string;
  /** Backend-derived per-field state. Drives badge + locked-mode chrome. */
  status: FieldStatus;
  /** Confidence shown beneath "filled-by-llm" hint. */
  confidence?: number | null;
  /** Static, curated sample chips. NEVER auto-fill on click — they
   *  insert the sample into the input so the merchant can edit it. */
  samples?: string[];
  /** Optional override link (locked case — opens external in Shopify admin). */
  externalLink?: { href: string; label: string };
  /** Merchant typed. */
  onChange?: (next: string) => void;
}

const BADGE_TEXT: Record<BadgeKind, string> = {
  missing: "Missing",
  "auto-filled": "Auto-filled · review",
  locked: "Shopify owns this",
  "merchant-authored": "You wrote this",
};

const BADGE_CLASS: Record<BadgeKind, string> = {
  missing: "p-pill--coral",
  "auto-filled": "p-pill--tip",
  locked: "p-pill--locked",
  "merchant-authored": "p-pill--teal",
};

function badgeFor(status: FieldStatus): BadgeKind {
  switch (status) {
    case "missing":
      return "missing";
    case "filled-by-llm":
      return "auto-filled";
    case "merchant-payload-locked":
      return "locked";
    case "merchant-authored":
    case "inherited":
      return "merchant-authored";
  }
}

export function FormField({
  label,
  value,
  placeholder,
  status,
  confidence,
  samples,
  externalLink,
  onChange,
}: FormFieldProps) {
  const locked = status === "merchant-payload-locked";
  const badge = badgeFor(status);

  const hint = hintFor(status, confidence);

  function pickSample(s: string) {
    if (locked) return;
    onChange?.(s);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--p-neutral-900)" }}>
          {label}
        </span>
        <span className={`p-pill ${BADGE_CLASS[badge]}`}>
          {badge === "locked" ? <Lock size={9} strokeWidth={2} /> : null}
          {BADGE_TEXT[badge]}
        </span>
        <div style={{ flex: 1 }} />
        {sourceLabel(status) ? (
          <span style={{ fontSize: 10.5, color: "var(--p-neutral-400)" }}>
            {sourceLabel(status)}
          </span>
        ) : null}
      </div>
      <input
        type="text"
        value={locked ? "" : value}
        placeholder={locked ? "Shopify metafield value is authoritative" : placeholder}
        readOnly={locked}
        onChange={
          locked
            ? undefined
            : (e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)
        }
        className={`p-input ${locked ? "p-input--locked" : ""}`}
      />
      {hint ? (
        <div style={{ fontSize: 11, color: "var(--p-neutral-500)" }}>{hint}</div>
      ) : null}
      {!locked && samples && samples.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
          {samples.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSample(s)}
              className="p-pill p-pill--ghost"
              style={{
                fontSize: 10.5,
                padding: "3px 10px",
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {locked && externalLink ? (
        <a
          href={externalLink.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11.5,
            color: "var(--p-primary)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 2,
          }}
        >
          {externalLink.label}
          <ExternalLink size={11} strokeWidth={1.8} />
        </a>
      ) : null}
    </div>
  );
}

function sourceLabel(status: FieldStatus): string | null {
  switch (status) {
    case "filled-by-llm":
      return "LLM extraction";
    case "merchant-payload-locked":
      return "Shopify metafield";
    case "merchant-authored":
      return "Authored";
    case "inherited":
      return "Inherited from canonical PDP";
    default:
      return null;
  }
}

function hintFor(status: FieldStatus, confidence?: number | null): ReactNode {
  switch (status) {
    case "filled-by-llm":
      return (
        <>
          Pulled from your description with{" "}
          {confidence != null ? `${Math.round(confidence * 100)}%` : "an unspecified"}{" "}
          confidence. Edit or confirm.
        </>
      );
    case "merchant-payload-locked":
      return "Shopify metafield is authoritative — we won't overwrite it here.";
    default:
      return null;
  }
}
