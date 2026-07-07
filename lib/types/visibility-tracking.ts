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
}
