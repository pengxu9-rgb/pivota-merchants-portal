/**
 * Display helpers for the Report Summary Contract v1 (report_summary).
 *
 * Rendering rules the contract fixes (docs/report_summary_contract_v1 in
 * pivota-backend): the 0–10 display score is BACKEND-computed and shown at one
 * decimal — never re-derived or integer-rounded here (42→47 must render
 * 4.2→4.7 so the do-action→score-moves loop stays visible); band labels map
 * the contract enum to merchant-safe copy in one place.
 */

import type {
  ReportSummary,
  ReportSummaryAction,
  ReportSummaryScore,
} from '@/lib/types/ai-readiness';

export const SUMMARY_BAND_LABEL: Record<string, string> = {
  needs_work: 'Needs work',
  pass: 'Pass',
  good: 'Good',
  excellent: 'Excellent',
};

/** Badge tone (merchant-status-*) per contract band. */
export const SUMMARY_BAND_TONE: Record<
  string,
  'critical' | 'warning' | 'success' | 'brand' | 'neutral'
> = {
  needs_work: 'warning',
  pass: 'brand',
  good: 'success',
  excellent: 'success',
};

/** "4.2" — the backend's one-decimal display value, formatted verbatim.
 * Null/undefined → null (render an em-dash, never a fabricated 0). */
export function formatDisplayScore(
  display: number | null | undefined,
): string | null {
  if (typeof display !== 'number' || !Number.isFinite(display)) return null;
  return display.toFixed(1);
}

/** "+0.5" / "−0.3" on the 0–10 display scale from a RAW (0–100) delta.
 * Zero is real signal ("no movement") and renders as "±0.0". */
export function formatDisplayDelta(
  rawDelta: number | null | undefined,
): string | null {
  if (typeof rawDelta !== 'number' || !Number.isFinite(rawDelta)) return null;
  const display = rawDelta / 10;
  if (display > 0) return `+${display.toFixed(1)}`;
  if (display < 0) return `−${Math.abs(display).toFixed(1)}`;
  return '±0.0';
}

export function bandLabel(band: string | null | undefined): string | null {
  if (!band) return null;
  return SUMMARY_BAND_LABEL[band] ?? null;
}

export function bandTone(
  band: string | null | undefined,
): 'critical' | 'warning' | 'success' | 'brand' | 'neutral' {
  return (band && SUMMARY_BAND_TONE[band]) || 'neutral';
}

/** Actions whose supporting prompts may render: a real backend join exists
 * (basis stamped ≠ 'none') AND prompts are present. The honesty rule from the
 * contract — the client never infers or backfills evidence. */
export function actionSupportingPrompts(
  action: ReportSummaryAction | null | undefined,
) {
  if (!action) return [];
  const basis = action.supporting_prompts_basis;
  if (!basis || basis === 'none') return [];
  return (action.supporting_prompts ?? []).filter((p) => p && p.query);
}

/** True when the summary has enough to lead the page: a score or a verdict.
 * An empty/degraded summary (backend build returned nulls) must not replace
 * the full report with a blank hero. */
export function summaryRenderable(
  summary: ReportSummary | null | undefined,
): boolean {
  if (!summary) return false;
  const hasScore =
    typeof summary.score?.display === 'number' &&
    Number.isFinite(summary.score.display);
  const hasVerdict = Boolean(summary.verdict?.headline);
  return hasScore || hasVerdict;
}

/** Subscore rows that actually carry a value (backend omits unmeasured axes —
 * per_sku runs have no category_visibility — but stay defensive). */
export function measuredSubscores(score: ReportSummaryScore | null | undefined) {
  return (score?.subscores ?? []).filter(
    (s) => s && typeof s.display === 'number' && Number.isFinite(s.display),
  );
}

export const SUBSCORE_LABEL: Record<string, string> = {
  visibility: 'AI visibility',
  attribution: 'Your-URL attribution',
  category_visibility: 'Category visibility',
};
