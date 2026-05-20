/**
 * Types for the merchant beauty-field authoring agent surface.
 *
 * Backend contract anchors:
 *   - PUT /merchant/products/{platform}/{id}/beauty_fields
 *   - GET /merchant/products/beauty_completeness
 *   - services/beauty_field_authoring.py — per-subcategory field schemas (v2.1)
 *
 * Fields are subcategory-dependent (v2.1 fix for the "brush gets INCI prompt" bug):
 *   skincare/haircare/bath/body  → raw_inci, how_to_use_text, skin_concerns
 *   makeup                       → raw_inci, skin_concerns
 *   tools                        → tool_material, use_with, care_instructions
 *   fragrance                    → raw_inci (INCI notes; fragrance-family deferred to v2)
 */

export type BeautySubcategoryKind =
  | "skincare"
  | "haircare"
  | "bath"
  | "body"
  | "makeup"
  | "tools"
  | "fragrance";

/** All possible beauty field names across every subcategory. */
export type BeautyFieldName =
  | "raw_inci"
  | "how_to_use_text"
  | "skin_concerns"
  | "tool_material"
  | "use_with"
  | "care_instructions";

export type BeautyFieldOutcome =
  | "written"
  | "skipped_payload_owned"
  | "product_not_found"
  | "unchanged";

export type FieldStatus =
  | "missing"
  | "filled-by-llm"
  | "merchant-authored"
  | "merchant-payload-locked"
  | "inherited";

export type ReminderCadence = "1d" | "1w" | "next-sync" | "never";

export interface FieldStateSummary {
  status: FieldStatus;
  value?: string | Record<string, any> | null;
  confidence?: number | null;
}

export interface IncompleteBeautyProduct {
  platform: string;
  platform_product_id: string;
  title: string;
  image_url?: string | null;
  sku?: string | null;
  subcategory_kind: BeautySubcategoryKind;
  /** Only the fields applicable to this subcategory_kind are present. */
  fields: Partial<Record<BeautyFieldName, FieldStateSummary>>;
}

/** Per-product draft — all possible fields; undefined = no change. */
export interface BeautyFieldsDraft {
  raw_inci?: string | null;
  how_to_use_text?: string | null;
  skin_concerns?: string | null;
  tool_material?: string | null;
  use_with?: string | null;
  care_instructions?: string | null;
}

export type BeautyFieldOutcomeMap = Partial<Record<BeautyFieldName, BeautyFieldOutcome>>;

export interface BeautyTotals {
  beauty_total: number;
  total_incomplete: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface BeautyThreadState {
  threadId: string;
  screen: "trigger" | "structured" | "done" | "honest_feedback" | "defer" | "paused";
  cursor: number;
  queue: IncompleteBeautyProduct[];
  outcomes: Record<string, BeautyFieldOutcomeMap>;
  drafts: Record<string, BeautyFieldsDraft>;
  cadence?: ReminderCadence;
  unknownProductIds: string[];
  totals: BeautyTotals | null;
}

/** Human-readable labels for each beauty field name. */
export const BEAUTY_FIELD_LABELS: Record<BeautyFieldName, string> = {
  raw_inci: "Ingredients (INCI)",
  how_to_use_text: "How to use",
  skin_concerns: "Skin concerns",
  tool_material: "Tool material",
  use_with: "Use with",
  care_instructions: "Care instructions",
};

/** Which fields apply to each subcategory (matches backend _SUBCATEGORY_SCHEMAS). */
export const FIELDS_FOR_SUBCATEGORY: Record<BeautySubcategoryKind, BeautyFieldName[]> = {
  skincare:   ["raw_inci", "how_to_use_text", "skin_concerns"],
  haircare:   ["raw_inci", "how_to_use_text", "skin_concerns"],
  bath:       ["raw_inci", "how_to_use_text", "skin_concerns"],
  body:       ["raw_inci", "how_to_use_text", "skin_concerns"],
  makeup:     ["raw_inci", "skin_concerns"],
  tools:      ["tool_material", "use_with", "care_instructions"],
  fragrance:  ["raw_inci"],
};

export const SUBCATEGORY_LABELS: Record<BeautySubcategoryKind, string> = {
  skincare:  "Skincare",
  haircare:  "Haircare",
  bath:      "Bath",
  body:      "Body",
  makeup:    "Makeup",
  tools:     "Tools",
  fragrance: "Fragrance",
};

export function beautyProductKey(p: { platform: string; platform_product_id: string }): string {
  return `${p.platform}::${p.platform_product_id}`;
}
