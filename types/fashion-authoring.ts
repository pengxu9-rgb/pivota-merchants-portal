/**
 * Types for the merchant fashion-field authoring agent surface.
 *
 * Backend contract anchors:
 *   - PR #563 (pivota-backend) — PUT /merchant/products/{platform}/{id}/fashion_fields
 *   - readiness/summary.py reason codes for the GET side
 *
 * State-machine names mirror the design handoff state map (artboard 10).
 */

/**
 * Field names per category. v2.1 adds beauty subcategory fields
 * (tools-specific: tool_material / use_with / care_instructions).
 *
 * The agent surface dispatches the editor based on the current
 * product's `subcategory_kind`; each side speaks its category's field
 * names. The discriminated union on IncompleteProduct narrows down
 * to the right Record shape so components don't need to type-cast.
 */
export type FashionFieldName = "material" | "care" | "size_guide";
export type BeautyFieldName =
  // Skincare-shape (also used by haircare / bath / body / makeup)
  | "raw_inci"
  | "how_to_use_text"
  | "skin_concerns"
  // Tools-shape (v2.1 — brushes / sponges / applicators)
  | "tool_material"
  | "use_with"
  | "care_instructions";
export type FieldName = FashionFieldName | BeautyFieldName;

/**
 * v2.1 beauty subcategory discriminator. Backend's
 * /beauty_completeness payload returns `subcategory_kind` per product;
 * UI uses it to pick the right form. Out-of-scope subcategories
 * (fragrance, accessories) aren't in the queue today.
 */
export type BeautySubcategoryKind =
  | "skincare"
  | "haircare"
  | "bath"
  | "body"
  | "makeup"
  | "tools";

/**
 * Field metadata surfaced by the backend's subcategory_schemas list.
 * The form is rendered generically from this — UI doesn't hard-code
 * which fields apply to which subcategory.
 */
export interface FieldSchema {
  name: string;
  type: "text" | "textarea" | "enum" | "enum_multi";
  label: string;
  placeholder?: string;
  hint?: string;
  allowed_values?: string[];
}

/**
 * Category discriminator on every product in the queue. The store
 * walks ONE category at a time; the discriminator is on the product
 * so a future mixed-queue surfacing both categories together doesn't
 * need a type refactor.
 */
export type CategoryKind = "fashion" | "beauty";

/**
 * Closed enum of allowed skin_concerns values. Mirrors
 * services/beauty_field_authoring.ALLOWED_SKIN_CONCERNS — keep in
 * sync. The GET response also surfaces this list so the multi-select
 * can read it from the API instead of the constant; the constant is
 * still here for typing.
 */
export const ALLOWED_SKIN_CONCERNS = [
  "oily",
  "dry",
  "combination",
  "normal",
  "sensitive",
  "acne-prone",
  "aging",
  "hyperpigmentation",
  "redness",
  "dullness",
] as const;
export type SkinConcern = (typeof ALLOWED_SKIN_CONCERNS)[number];

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
 * Sourced from the category-specific completeness endpoint.
 *
 * The discriminated union keeps the per-category field-name set tight
 * (fashion has material/care/size_guide; beauty has
 * raw_inci/how_to_use_text/skin_concerns) so a component switching on
 * `category_kind` gets the right narrowing without dynamic type
 * assertions.
 */
interface IncompleteProductBase {
  platform: string;
  platform_product_id: string;
  title: string;
  image_url?: string | null;
  sku?: string | null;
}

export interface IncompleteFashionProduct extends IncompleteProductBase {
  category_kind: "fashion";
  fields: Record<FashionFieldName, FieldStateSummary>;
}

export interface IncompleteBeautyProduct extends IncompleteProductBase {
  category_kind: "beauty";
  /** v2.1: which beauty subcategory this product belongs to. Drives
   *  which field set the editor renders. */
  subcategory_kind: BeautySubcategoryKind;
  /** Human-readable subcategory label ("Skincare" / "Beauty tools"). */
  subcategory_label?: string;
  /** Canonical category_path from catalog_products — useful for
   *  surfacing context to the merchant ("beauty/tools/brush"). */
  category_path?: string | null;
  /** Per-product field schema list. Maps 1:1 to keys in `fields`.
   *  v2.1 backend surfaces this so the UI renders the form generically. */
  field_schemas: FieldSchema[];
  /** Per-field state for THIS subcategory's fields only. Indexed by
   *  field name; the keys are a subset of BeautyFieldName matching the
   *  subcategory's schema. */
  fields: Partial<Record<BeautyFieldName, FieldStateSummary>>;
}

export type IncompleteProduct = IncompleteFashionProduct | IncompleteBeautyProduct;

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

/** Beauty per-product draft. Carries every possible field across all
 *  subcategories; the editor reads only the ones in the product's
 *  field_schemas. skin_concerns is a multi-select list; the rest are
 *  free-text. */
export interface BeautyFieldsDraft {
  raw_inci?: string | null;
  how_to_use_text?: string | null;
  skin_concerns?: SkinConcern[] | null;
  // v2.1 tool fields
  tool_material?: string | null;
  use_with?: string | null;
  care_instructions?: string | null;
}

/** Union over both per-category drafts; store keys per product by
 *  productKey() and the draft shape comes from the product's
 *  category_kind. Components narrow via the discriminator. */
export type FieldsDraft = FashionFieldsDraft | BeautyFieldsDraft;

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

/**
 * What `GET /merchant/products/fashion_completeness` returns under
 * `data.totals`. The `queue` is page-limited (default page_size=50,
 * max 200), so any UI that shows "you have N products missing X" must
 * read from this struct rather than from `queue.length` — that's the
 * preview-test bug fixed in v1.2.
 */
export interface FashionTotals {
  fashion_total: number;
  missing_material: number;
  missing_care: number;
  missing_size_guide: number;
  total_incomplete: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

/** What `GET /merchant/products/beauty_completeness` returns under
 *  `data.totals`. Same shape as fashion's but per beauty fields. */
export interface BeautyTotals {
  beauty_total: number;
  missing_inci: number;
  missing_how_to_use: number;
  missing_concerns: number;
  total_incomplete: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

/** Generic counts the trigger card surfaces — derived from either
 *  category's totals payload. Keeps the trigger's render logic
 *  agnostic to which category it's showing. */
export interface CategoryTotals {
  category: CategoryKind;
  category_total: number;
  total_incomplete: number;
  missing_per_field: Partial<Record<FieldName, number>>;
  has_more: boolean;
  page_size: number;
  /** v2.1 beauty: per-subcategory breakdown ("tools: 608, skincare: 3").
   *  Null for fashion (single category). */
  per_subcategory?: Partial<
    Record<
      BeautySubcategoryKind,
      { total: number; missing_per_field: Partial<Record<FieldName, number>> }
    >
  >;
}

/** What survives across renders (persisted by Zustand). */
export interface FashionThreadState {
  /** Stable id for the thread; persists cursor across sidebar collapse, etc. */
  threadId: string;
  /**
   * What overall screen the chat is rendering right now.
   *
   * State map (handoff artboard 10):
   *   - trigger          → Screen 04
   *   - structured       → Screen 06
   *   - done             → Screen 07 (only when something was actually covered)
   *   - honest_feedback  → Screen 08 (skipped_payload_owned outcomes)
   *   - defer            → Screen 09 (cadence picker)
   *   - paused           → Terminal state for the merchant who chose
   *                        "remind me later" OR who marked everything
   *                        "no answer known". Distinct from `done`
   *                        because the catalog isn't actually covered.
   */
  screen: "trigger" | "structured" | "done" | "honest_feedback" | "defer" | "paused";
  /** Cursor through the per-product editor; 0-indexed. */
  cursor: number;
  /** The ordered list of products the editor steps through. */
  queue: IncompleteProduct[];
  /** Per-product accumulated PUT outcomes (so honest-feedback can read them). */
  outcomes: Record<string, FieldOutcomeMap>;
  /** Per-product current draft values (unsaved). Keyed by productKey().
   *  Type-wise this is a union — the discriminator on the matching
   *  product in `queue` tells the editor which shape to expect. */
  drafts: Record<string, FieldsDraft>;
  /** Reminder cadence the merchant picked on Screen 09. */
  cadence?: ReminderCadence;
  /** Set of platform_product_ids the merchant marked "no answer known"
   *  (state G; never re-prompt). Queue-exclusion list per Open Q §4. */
  unknownProductIds: string[];
  /**
   * Snapshot of merchant-wide totals from the last completeness fetch
   * for the active category. queue is page-limited; UI counts must
   * read from here, not queue.length. Null until the first
   * successful load.
   */
  totals: CategoryTotals | null;
  /**
   * Which category the surface is currently walking. The trigger card
   * has a toggle to switch; switching clears the queue + outcomes +
   * drafts for the previous category and fetches the new one.
   */
  category: CategoryKind;
}

/** Key helper — products are identified end-to-end by (platform, id). */
export function productKey(p: { platform: string; platform_product_id: string }): string {
  return `${p.platform}::${p.platform_product_id}`;
}
