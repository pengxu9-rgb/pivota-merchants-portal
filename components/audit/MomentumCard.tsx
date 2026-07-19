'use client';

/**
 * MomentumCard — the ONE unified "Momentum" card on the AI-Visibility page
 * (founder direction, PR #191 round 2). A section-level merge of two views
 * that used to render as separate cards:
 *   - the visibility-over-time trend (tracking time-series:
 *     visibility / attribution / category_visibility per run), and
 *   - the momentum dumbbells (previous run → this run across the four
 *     readiness dimensions).
 * NOT one combined chart: the two track different measures on different
 * shapes, and a mixed-scale multi-line would be a lie.
 *
 * Adaptive by history depth:
 *   - ≤ 2 tracked checks → the dumbbells are the primary (and only) view.
 *     A 2-point line is a worse dumbbell, so the trend lines are omitted.
 *   - ≥ 3 tracked checks → the trend lines lead, with the dumbbells beneath
 *     showing the latest-step delta.
 *
 * Vocabulary note (metric-naming hygiene): the trend's "Visibility" (run-level
 * average visibility score) and the dumbbells' "Citation · outcome" (median
 * per-product citation score) are RELATED but numerically distinct measures —
 * the demo data shows visibility 30 vs citation 52 on the same run. They keep
 * their own labels (collapsing them into one label would assert an equivalence
 * the data doesn't have); the section captions below say what each tracks so
 * the two vocabularies can't be misread as one number diverging from itself.
 *
 * One tracking fetch, owned here: the depth decision and the embedded trend
 * render from the same response (passed down via the chart's `tracking` prop).
 */

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { SurfaceCard } from '@/components/ui/merchant-primitives';
import { ReportSectionBoundary } from '@/components/audit/ReportSectionBoundary';
import { VisibilityTrendChart } from '@/components/audit/VisibilityTrendChart';
import { BrandMomentumPanel } from '@/components/audit/BrandMomentumChart';
import type { AgentCenterBrandRollup } from '@/lib/types/ai-readiness';
import type { VisibilityTrackingResponse } from '@/lib/types/visibility-tracking';

export function MomentumCard({
  rollup,
  currentRunId,
  subjectType = 'merchant_url',
  reloadKey,
}: {
  rollup?: AgentCenterBrandRollup | null;
  currentRunId?: string | null;
  subjectType?: 'merchant' | 'merchant_url';
  /** Bump to refetch the tracking series (e.g. after a new check completes). */
  reloadKey?: number | string;
}) {
  const [data, setData] = useState<VisibilityTrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .getVisibilityTracking(50, subjectType)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          (e as Error)?.message ||
          'Could not load your visibility trend.';
        setError(typeof msg === 'string' ? msg : 'Could not load your visibility trend.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, subjectType]);

  const pointCount = data?.points?.length ?? 0;
  // ≥3 comparable-history points → lines earn their place; below that a
  // 2-point line is a worse dumbbell, so the dumbbells carry the card alone.
  const showTrend = !error && pointCount >= 3;
  const hasDumbbells = !!rollup?.dimensions;

  // Nothing measurable on either axis → no card at all (never an empty shell,
  // never fabricated content). While the tracking fetch is in flight we still
  // render when the dumbbells alone justify the card.
  if (!hasDumbbells && !showTrend && !loading) return null;
  if (!hasDumbbells && loading) return null;

  return (
    <SurfaceCard
      title="Momentum"
      eyebrow="AI visibility · momentum"
      description={
        showTrend
          ? 'Your visibility over time, and what moved since your previous check.'
          : 'What moved since your previous check. Trend lines appear once three checks are tracked.'
      }
    >
      <div className="space-y-5 px-5 py-4">
        {showTrend ? (
          <ReportSectionBoundary section="momentum-trend" silent>
            <VisibilityTrendChart
              embedded
              subjectType={subjectType}
              tracking={{ data, loading, error }}
            />
          </ReportSectionBoundary>
        ) : null}
        {hasDumbbells && rollup ? (
          <ReportSectionBoundary section="momentum-dumbbells" silent>
            <div>
              {showTrend ? (
                <p className="mb-2 text-xs text-[color:var(--merchant-muted)]">
                  Readiness dimensions, latest step — the trend above tracks
                  run-level visibility scores; these are the four per-product
                  readiness dimensions (citation is the per-product outcome
                  score, measured separately from run visibility).
                </p>
              ) : null}
              <BrandMomentumPanel
                embedded
                rollup={rollup}
                currentRunId={currentRunId}
                subjectType={subjectType}
              />
            </div>
          </ReportSectionBoundary>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

export default MomentumCard;
