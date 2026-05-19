/**
 * Types for the merchant fashion-field authoring agent surface.
 *
 * Backend contract anchors:
 *   - PR #563 (pivota-backend) — PUT /merchant/products/{platform}/{id}/fashion_fields
 *   - readiness/summary.py reason codes for the GET side
 *
 * State-machine names mirror the design handoff state map (artboard 10).
 */

export type FieldName = "material" | "care" | "size_guide";

/** Backend per-field outcome from PUT /fashion_fields. */
export type FieldOutcome =
  | "written"
  | "skipped_payload_owned"
  | "product_not_found"
  | "unchanged";

/** What the UI shows on a per-field row inside the structured editor. */
export type FieldStatus =
  | "missing" // NULL or empty, no inheritance
  | "filled-by-llm" // catalog_products.<field>_source = 'llm_extraction_v1'
  | "merchant-authored" // source = 'merchant_authored'
  | "merchant-payload-locked" // source = 'merchant_payload' — Shopify owns it
  | "inherited"; // surfaced via cross-PDP coalesce (canonical view)

/** Reminder cadence per design Screen 09. */
export type ReminderCadence = "1d" | "1w" | "next-sync" | "never";

/** State machine — design handoff state map (artboard 10). */
export type ChatState =
  | "A_fully_covered"
  | "C_action_needed"
  | "D_authoring"
  | "E_paused"
  | "F_conflict_pending"
  | "G_unknown";

/**
 * Per-product summary as displayed in the trigger and structured editor.
 * Sourced from /merchant/readiness/optimization (per-product blockers).
 */
export interface IncompleteProduct {
  platform: string;
  platform_product_id: string;
  title: string;
  image_url?: string | null;
  sku?: string | null;
  // Per-field current state, derived from the readiness payload.
  fields: Record<FieldName, FieldStateSummary>;
}

export interface FieldStateSummary {
  status: FieldStatus;
  /** Current value when status !== "missing" — for the LLM-filled preview etc. */
  value?: string | Record<string, any> | null;
  /** When status === "filled-by-llm", show the confidence. */
  confidence?: number | null;
}

/**
 * Per-product draft (what the merchant has typed but not yet saved).
 * undefined = no change; explicit null = "leave unchanged" passed to backend.
 */
export interface FashionFieldsDraft {
  material?: string | null;
  care?: string | null;
  size_guide?: string | Record<string, any> | null;
}

/** Per-product map of field -> outcome from the most recent PUT. */
export type FieldOutcomeMap = Partial<Record<FieldName, FieldOutcome>>;

export interface ScopeSummary {
  /** Total products in the merchant's catalog (any category). */
  total_catalog_products?: number;
  /** Total fashion products. */
  fashion_total: number;
  /** Per-field totals (across all fashion products). */
  per_field: Record<FieldName, { populated: number; missing: number }>;
  /** Representative slice of products needing attention (UI shows 3, link "See all N"). */
  sample: IncompleteProduct[];
  /** Total products currently missing at least one fashion field. */
  total_missing: number;
}

/** What survives across renders (persisted by Zustand). */
export interface FashionThreadState {
  /** Stable id for the thread; persists cursor across sidebar collapse, etc. */
  threadId: string;
  /** What overall screen the chat is rendering right now. */
  screen: "trigger" | "structured" | "done" | "honest_feedback" | "defer";
  /** Cursor through the per-product editor; 0-indexed. */
  cursor: number;
  /** The ordered list of products the editor steps through. */
  queue: IncompleteProduct[];
  /** Per-product accumulated PUT outcomes (so honest-feedback can read them). */
  outcomes: Record<string, FieldOutcomeMap>;
  /** Per-product current draft values (unsaved). */
  drafts: Record<string, FashionFieldsDraft>;
  /** Reminder cadence the merchant picked on Screen 09. */
  cadence?: ReminderCadence;
  /** Set of platform_product_ids the merchant marked "no answer known"
   *  (state G; never re-prompt). Queue-exclusion list per Open Q §4. */
  unknownProductIds: string[];
}

/** Key helper — products are identified end-to-end by (platform, id). */
export function productKey(p: { platform: string; platform_product_id: string }): string {
  return `${p.platform}::${p.platform_product_id}`;
}
