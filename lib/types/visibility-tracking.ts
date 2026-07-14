/**
 * AI-visibility tracking series — the W2 (pinned measurement basis) payoff.
 *
 * Mirrors the backend contract from
 *   routes/merchant_audit_routes.py → get_merchant_visibility_tracking
 *   services/audit_tracking_series.py → build_tracking_series
 *
 * GET /api/merchant-center/audit/tracking?limit=50 (merchant JWT).
 *
 * The load-bearing field is `comparable_with_prev`: a trend line only means
 * something when two consecutive points were measured on the SAME pinned prompt
 * set. Points on different bases aren't a real rise/fall — they're different
 * questions. The chart connects a line ONLY across same-basis (comparable)
 * points and breaks (annotates) where the basis changed.
 */

/** The three brand-level scores, each 0–100. Any value may be null. */
export interface TrackingScores {
  visibility: number | null;
  attribution: number | null;
  category_visibility: number | null;
}

/** Per-engine sub-scores. The whole object may be null (older/thin runs). */
export interface TrackingProviderScores {
  gemini?: number | null;
  chatgpt?: number | null;
  // The backend may emit additional providers over time; keep it open.
  [provider: string]: number | null | undefined;
}

export interface TrackingPoint {
  run_id: string | null;
  /** ISO8601 timestamp of the audit run. May be null in edge cases. */
  date: string | null;
  scores: TrackingScores;
  /** May be null when the run predates per-provider capture. */
  provider_scores: TrackingProviderScores | null;
  /** The pinned prompt-set id. Null for pre-pinning runs. */
  basis_id: string | null;
  /**
   * THE KEY FLAG. True when this point shares the previous point's basis, so a
   * connecting line between them is an honest comparison. Always false for the
   * first point and wherever the basis changed.
   */
  comparable_with_prev: boolean;
  /**
   * SKU-coverage disclosure (the second honesty axis): every brand score on
   * this point is an AVERAGE over `sku_count` measured products. Null (or
   * absent, pre-upgrade backend) = unknown — never assume 0.
   */
  sku_count?: number | null;
  /** Products the run TRIED to measure (measured + failed). Null = unknown. */
  attempted_sku_count?: number | null;
  /** Order-independent identity of the measured SKU set. Null = unknown. */
  panel_id?: string | null;
}

/**
 * One point of a per-SKU mini-series — the SKU's OWN verdict scores for a run
 * that measured it (not the brand average). Same comparability semantics as
 * TrackingPoint; per-provider scores aren't emitted per-SKU today.
 */
export interface SkuTrackingPoint {
  run_id: string | null;
  date: string | null;
  scores: TrackingScores;
  basis_id: string | null;
  comparable_with_prev: boolean;
  provider_scores?: TrackingProviderScores | null;
}

/** A single product's honest mini-series, exploded from the same run history. */
export interface SkuTrackingSeries {
  title: string | null;
  pdp_url: string | null;
  /** OLDEST → newest — only the runs that measured THIS product. */
  points: SkuTrackingPoint[];
  /** Same basis-segmentation rule as the brand-level series. */
  segments: TrackingSegment[];
  basis_changes: number[];
}

/** Consecutive same-basis points the chart connects as one continuous line. */
export interface TrackingSegment {
  basis_id: string | null;
  /** Point indices (into `points`) belonging to this segment. */
  indices: number[];
}

export interface VisibilityTrackingResponse {
  merchant_id: string;
  /** True when there are <2 runs — nothing to trend yet (show a baseline note). */
  is_baseline_only: boolean;
  /** OLDEST → newest, one per completed audit. */
  points: TrackingPoint[];
  /** Point indices where the basis changed (draw a break/marker here). */
  basis_changes: number[];
  segments: TrackingSegment[];
  /**
   * Point indices where the measured SKU set differs from the previous check —
   * annotate "tracked products changed": a composition shift, not a score
   * movement. Absent on pre-upgrade backends.
   */
  panel_changes?: number[];
  /** Per-SKU mini-series keyed by the backend's stable sku_key hash. */
  per_sku?: Record<string, SkuTrackingSeries>;
  /** True when >50 SKUs exist and only the most-covered series are included. */
  per_sku_truncated?: boolean;
}
