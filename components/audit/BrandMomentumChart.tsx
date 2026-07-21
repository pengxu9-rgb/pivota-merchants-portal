'use client';

/**
 * Momentum — baseline → current (dumbbell rows).
 *
 * One row per brand-rollup dimension (Identity, Content, Routability, Citation),
 * plotting the PREVIOUS run's median → the CURRENT run's median on a shared
 * 0–100 track: two dots joined by a segment, the pair of values as right-aligned
 * monospace text ("40 → 70"), and the current value's band label alongside.
 *
 * Prior-run values: the report envelope carries no `reaudit_delta` (it does not
 * exist in this codebase — brand_rollup.tracking.history trends visibility/
 * attribution, NOT the four catalog dimensions), so `BrandMomentumPanel` fetches
 * the previous completed run via the SAME runs-list endpoint the page already
 * uses (apiClient.listAuditRuns / getAuditRunDetail) and reads its
 * brand_rollup.dimensions. When there is no prior run — or a dimension has no
 * prior median — that row renders the single-measurement state (one dot +
 * "first measurement"). We NEVER fabricate a delta.
 *
 * Presentation (`BrandMomentumChart`) is split from data-loading
 * (`BrandMomentumPanel`) so the chart is trivially previewable/testable with
 * injected prior data.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, Loader2 } from 'lucide-react';
import { SurfaceCard } from '@/components/ui/merchant-primitives';
import { apiClient } from '@/lib/api-client';
import type {
  AgentCenterBrandRollup,
  BrandDimensionStat,
  BrandDimensionStats,
  SkuScoreBand,
} from '@/lib/types/ai-readiness';

// The four dimensions, in the page's established order (Citation last — it's the
// outcome the other three drive).
const DIMENSIONS: { key: keyof BrandDimensionStats; label: string }[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'content_richness', label: 'Content' },
  { key: 'routability', label: 'Routability' },
  { key: 'citation', label: 'Citation' },
];

// Band → merchant-safe label + text color. Mirrors the copy/color layer used by
// the per-SKU cards so the momentum rows read identically to the rest of the
// report. (The page's own helpers aren't exported; kept local + in sync.)
type Band = SkuScoreBand | 'unscored';
const BAND_LABEL: Record<string, string> = {
  agent_ready: 'Agent-ready',
  ready: 'Ready',
  partial: 'Needs work',
  blocked: 'Not yet visible',
  unscored: 'Not measured',
};
function bandTextClass(band: string): string {
  switch (band) {
    case 'agent_ready':
      return 'text-green-700';
    case 'ready':
      return 'text-emerald-700';
    case 'partial':
      return 'text-amber-700';
    case 'unscored':
      return 'text-slate-400';
    case 'blocked':
    default:
      return 'text-red-700';
  }
}
function bandFromScore(score: number | null | undefined): Band {
  if (score == null) return 'unscored';
  if (score < 40) return 'blocked';
  if (score < 70) return 'partial';
  if (score < 85) return 'ready';
  return 'agent_ready';
}
function bandOf(stat: BrandDimensionStat | undefined): Band {
  if (!stat) return 'unscored';
  return stat.band ?? bandFromScore(stat.median);
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

type Row = {
  key: string;
  label: string;
  current: number | null;
  prior: number | null;
  band: Band;
  bandLabel: string;
};

function buildRows(
  current: BrandDimensionStats,
  prior: BrandDimensionStats | null,
): Row[] {
  return DIMENSIONS.map(({ key, label }) => {
    const cur = current?.[key];
    const pri = prior?.[key];
    const band = bandOf(cur);
    return {
      key: String(key),
      label: cur?.dimension_label ?? label,
      current: cur?.median ?? null,
      prior: pri?.median ?? null,
      band,
      bandLabel: cur?.band_label ?? BAND_LABEL[band],
    };
  });
}

// ---------------------------------------------------------------------------
// Presentational chart. `prior === null` (or a row whose prior median is null)
// renders the single-measurement state for that row — a lone dot, no segment.
// ---------------------------------------------------------------------------
export function BrandMomentumChart({
  current,
  prior,
}: {
  current: BrandDimensionStats;
  prior: BrandDimensionStats | null;
}) {
  const rows = buildRows(current, prior);
  // Show the delta framing only when at least one dimension actually has a prior
  // AND a current value to compare — otherwise it's a pure first measurement.
  const anyComparable = rows.some((r) => r.prior != null && r.current != null);

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <MomentumRow key={row.key} row={row} showPrior={anyComparable} />
      ))}
      <p className="pt-1 text-[11px] text-[color:var(--merchant-muted)]">
        {anyComparable
          ? 'Each row shows your previous run’s median → this run’s median for that dimension, on a 0–100 scale. The band label reflects where you stand now.'
          : 'First measurement — no prior run to compare against yet. Re-audit after you act on the plan and the movement shows up here.'}
      </p>
    </div>
  );
}

function MomentumRow({ row, showPrior }: { row: Row; showPrior: boolean }) {
  const hasCurrent = row.current != null;
  const hasPrior = showPrior && row.prior != null;
  const both = hasCurrent && hasPrior;
  const delta =
    both && row.current != null && row.prior != null ? row.current - row.prior : null;

  const curPct = hasCurrent ? clampPct(row.current as number) : 0;
  const priPct = hasPrior ? clampPct(row.prior as number) : 0;
  const segLeft = Math.min(curPct, priPct);
  const segWidth = Math.abs(curPct - priPct);

  return (
    <div className="flex items-center gap-3">
      {/* Dimension label */}
      <div className="w-24 shrink-0 text-xs font-medium text-[color:var(--merchant-ink)]">
        {row.label}
      </div>

      {/* 0–100 track with dumbbell */}
      <div className="relative h-5 flex-1">
        {/* subtle track */}
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[color:var(--merchant-surface-muted)]" />
        {both ? (
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[color:var(--merchant-line-strong)]"
            style={{ left: `${segLeft}%`, width: `${segWidth}%` }}
          />
        ) : null}
        {/* prior dot — hollow/muted (the baseline) */}
        {hasPrior ? (
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--merchant-muted)] bg-[color:var(--merchant-surface)]"
            style={{ left: `${priPct}%` }}
            title={`Previous: ${row.prior}`}
            aria-label={`Previous ${row.label} ${row.prior}`}
          />
        ) : null}
        {/* current dot — filled, band-colored via the merchant band text colors */}
        {hasCurrent ? (
          <span
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[color:var(--merchant-surface)] ${dotBg(
              row.band,
            )}`}
            style={{ left: `${curPct}%` }}
            title={`Current: ${row.current}`}
            aria-label={`Current ${row.label} ${row.current}`}
          />
        ) : null}
      </div>

      {/* values — monospace, right-aligned */}
      <div className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-[color:var(--merchant-ink)]">
        {both ? (
          <>
            <span className="text-[color:var(--merchant-muted)]">{row.prior}</span>
            <span className="mx-1 text-[color:var(--merchant-muted)]">→</span>
            <span>{row.current}</span>
          </>
        ) : hasCurrent ? (
          <span>{row.current}</span>
        ) : (
          <span className="text-[color:var(--merchant-muted)]">—</span>
        )}
      </div>

      {/* delta + band label */}
      <div className="w-28 shrink-0">
        {delta != null ? (
          <span
            className={`text-[11px] font-semibold tabular-nums ${
              delta > 0 ? 'text-green-700' : delta < 0 ? 'text-red-700' : 'text-slate-500'
            }`}
          >
            {delta === 0 ? 'no change' : `${delta > 0 ? '+' : ''}${delta}`}
          </span>
        ) : null}
        {hasCurrent ? (
          <div className={`text-[10px] font-medium ${bandTextClass(row.band)}`}>
            {row.bandLabel}
          </div>
        ) : (
          <div className="text-[10px] text-slate-400">Not measured</div>
        )}
      </div>
    </div>
  );
}

// Filled current-dot background matched to the band text color.
function dotBg(band: Band): string {
  switch (band) {
    case 'agent_ready':
      return 'bg-green-600';
    case 'ready':
      return 'bg-emerald-600';
    case 'partial':
      return 'bg-amber-500';
    case 'unscored':
      return 'bg-slate-300';
    case 'blocked':
    default:
      return 'bg-red-600';
  }
}

// ---------------------------------------------------------------------------
// Data-loading wrapper. Fetches the previous completed run's brand_rollup
// dimensions and renders the chart inside a SurfaceCard.
//
// Per-surface prior-run detail fetch: the readiness page reads a raw run row
// (`getAuditRunDetail` → report_jsonb.brand_rollup.dimensions) while the
// AI-Visibility page reads the shaped url-readiness envelope
// (`getUrlAuditRunDetail` → brand_rollup.dimensions at the top level). The
// fetcher is selected by `subjectType` so callers just say which surface they
// are, and both paths soft-fail to null (first-measurement state) on any
// missing field — never fabricate a delta.
// ---------------------------------------------------------------------------
async function fetchPriorDimensionsForRun(
  runId: string,
  subjectType: string,
): Promise<BrandDimensionStats | null> {
  if (subjectType === 'merchant_url') {
    const detail = (await apiClient.getUrlAuditRunDetail(runId)) as {
      brand_rollup?: { dimensions?: BrandDimensionStats | null } | null;
    };
    return detail?.brand_rollup?.dimensions ?? null;
  }
  const detail = await apiClient.getAuditRunDetail(runId);
  return detail?.report_jsonb?.brand_rollup?.dimensions ?? null;
}

export function BrandMomentumPanel({
  rollup,
  currentRunId,
  subjectType = 'merchant',
  fetchPriorDimensions,
  embedded = false,
  prefetchedPrior,
}: {
  rollup: AgentCenterBrandRollup;
  currentRunId?: string | null;
  /** Scopes the run history AND selects the per-surface detail fetch:
   *  'merchant' (readiness, default) or 'merchant_url' (AI-Visibility). */
  subjectType?: string;
  /** Override the prior-run dimensions fetch entirely (dev previews/tests). */
  fetchPriorDimensions?: (runId: string) => Promise<BrandDimensionStats | null>;
  /** Render without the SurfaceCard shell — for composition inside a parent
   *  card (the unified Momentum card on the AI-Visibility page). */
  embedded?: boolean;
  /** Pre-fetched prior dimensions (the PUBLIC shared view, whose reader has
   *  no merchant JWT — the share payload carries them inline). When set —
   *  including explicitly null for "no prior run" — the panel renders
   *  synchronously and never calls the authed run-list endpoints. */
  prefetchedPrior?: BrandDimensionStats | null;
}) {
  const [prior, setPrior] = useState<BrandDimensionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (prefetchedPrior !== undefined) {
      setPrior(prefetchedPrior ?? null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPrior(null);
    (async () => {
      try {
        const runs = await apiClient.listAuditRuns(20, subjectType);
        // Completed, openable runs only (a failed run stamps completed_at but has
        // no report). Newest first, as returned.
        const done = runs.filter(
          (r) =>
            r.run_id &&
            !!r.completed_at &&
            (r.status || '').toLowerCase() !== 'failed',
        );
        // Find the run immediately OLDER than the current one. If the current run
        // is in the list, take its next neighbor; if it isn't (e.g. a just-finished
        // run not yet indexed), the newest completed run that isn't it IS the prior.
        let priorRunId: string | null = null;
        const idx = currentRunId
          ? done.findIndex((r) => r.run_id === currentRunId)
          : -1;
        if (idx >= 0) {
          priorRunId = done[idx + 1]?.run_id ?? null;
        } else {
          const candidate = done.find((r) => r.run_id !== currentRunId);
          priorRunId = candidate?.run_id ?? null;
        }
        if (!priorRunId) {
          if (!cancelled) setLoading(false);
          return;
        }
        const dims = fetchPriorDimensions
          ? await fetchPriorDimensions(priorRunId)
          : await fetchPriorDimensionsForRun(priorRunId, subjectType);
        if (!cancelled) setPrior(dims ?? null);
      } catch {
        // Soft-fail to the first-measurement state — never fabricate a delta.
        if (!cancelled) setPrior(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRunId, subjectType, prefetchedPrior]);

  if (!rollup?.dimensions) return null;

  const body = loading ? (
    <div className="flex items-center gap-2 py-6 text-sm text-[color:var(--merchant-muted)]">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Checking your previous audit…</span>
    </div>
  ) : (
    <>
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--merchant-muted)]">
        <TrendingUp className="h-3.5 w-3.5" />
        Previous run → this run
      </div>
      <BrandMomentumChart current={rollup.dimensions} prior={prior} />
    </>
  );

  // Embedded: the parent card owns the header/shell (unified Momentum card).
  if (embedded) return <div>{body}</div>;

  return (
    <SurfaceCard
      title="Momentum — where you moved"
      description="Baseline → current for each readiness dimension. We compare this run against your previous audit; a dimension with no prior run shows its first measurement."
    >
      <div className="px-5 py-4">{body}</div>
    </SurfaceCard>
  );
}

export default BrandMomentumPanel;
