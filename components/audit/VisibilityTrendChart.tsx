'use client';

/**
 * VisibilityTrendChart — the payoff of the pinned-measurement-basis (W2) work.
 *
 * Renders a merchant's AI-visibility scores over time from
 *   GET /api/merchant-center/audit/tracking   (apiClient.getVisibilityTracking)
 *
 * THE ONE NON-NEGOTIABLE RULE (this is the whole point):
 *   Only connect a line between two points when they share a pinned prompt set
 *   (the backend groups same-basis points into a `segment`). Where a NEW basis
 *   first appears (a `basis_changes` index) we draw a marker "Measurement basis
 *   refreshed — comparison resets here."
 *
 *   Rationale baked into the copy: two points measured on different prompts
 *   aren't a real rise/fall — they're different questions. Connecting them would
 *   be a lie. Same basis = a true comparison — regardless of whether a
 *   differently-based check ran in between (a merchant alternating two URL
 *   sets still gets one connected line per set).
 *
 * We implement this by giving each metric one Recharts <Line> PER SEGMENT
 * (all points sharing a basis, not necessarily consecutive). A point's value
 * only populates its own segment's dataKey (null elsewhere), and each segment
 * line sets connectNulls so it spans interleaved other-basis points — while
 * every point still renders its dot.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { LineChart as LineChartIcon, Loader2, Info } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { SurfaceCard, EmptyState } from '@/components/ui/merchant-primitives';
import type {
  VisibilityTrackingResponse,
  TrackingPoint,
  TrackingSegment,
  TrackingScores,
  TrackingProviderScores,
} from '@/lib/types/visibility-tracking';

// The three brand-level metrics. Distinct in HUE (not just lightness) so they
// stay separable for color-vision-deficient readers, and dark enough for the
// warm light canvas.
const METRICS = [
  { key: 'visibility' as const, label: 'Visibility', color: '#534AB7' },
  { key: 'attribution' as const, label: 'Attribution', color: '#0F766E' },
  { key: 'category_visibility' as const, label: 'Category visibility', color: '#B45309' },
];

// Optional per-engine sub-lines (behind a toggle). Rendered dashed + thinner so
// they read as secondary detail under the brand-level lines.
const PROVIDERS = [
  { key: 'gemini' as const, label: 'Gemini', color: '#2563EB' },
  { key: 'chatgpt' as const, label: 'ChatGPT', color: '#059669' },
];

// Stable empty fallbacks so derived memos keep a steady reference when `data`
// hasn't changed (avoids `?? []` allocating a fresh array every render).
const EMPTY_POINTS: TrackingPoint[] = [];
const EMPTY_SEGMENTS: TrackingSegment[] = [];
const EMPTY_INDICES: number[] = [];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shortDate(iso: string | null): string {
  const d = parseDate(iso);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fullDate(iso: string | null): string {
  const d = parseDate(iso);
  if (!d) return 'Unknown date';
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

function fmtScore(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : String(Math.round(v));
}

// ---------------------------------------------------------------------------
// Chart-row shape. Each row carries per-(metric|provider, segment) keys the
// <Line>s read, plus the raw point data the custom tooltip reads back.
// ---------------------------------------------------------------------------
type ChartRow = {
  x: string; // stringified point index — the category-axis key
  dateLabel: string;
  __dateISO: string | null;
  __comparable: boolean;
  __isBreak: boolean; // a NEW basis first appeared at this point (and it isn't the first)
  __thread: string | null; // thread letter (A, B, …) when the point is on a connected line
  __scores: TrackingScores;
  __providers: TrackingProviderScores | null;
  [seriesKey: string]: string | number | boolean | null | TrackingScores | TrackingProviderScores;
};

function segmentKey(metricOrProvider: string, segmentIndex: number): string {
  return `${metricOrProvider}__s${segmentIndex}`;
}

function buildRows(
  points: TrackingPoint[],
  segments: TrackingSegment[],
  threadLetterBySegment: Map<number, string>,
): ChartRow[] {
  // point index -> which segment it belongs to
  const segOf = new Map<number, number>();
  segments.forEach((seg, si) => seg.indices.forEach((i) => segOf.set(i, si)));

  return points.map((p, i) => {
    const si = segOf.get(i) ?? 0;
    const row: ChartRow = {
      x: String(i),
      dateLabel: shortDate(p.date),
      __dateISO: p.date,
      __comparable: !!p.comparable_with_prev,
      __isBreak: i > 0 && !p.comparable_with_prev,
      __thread: threadLetterBySegment.get(si) ?? null,
      __scores: p.scores,
      __providers: p.provider_scores,
    };
    for (const m of METRICS) {
      row[segmentKey(m.key, si)] = p.scores?.[m.key] ?? null;
    }
    for (const pr of PROVIDERS) {
      row[segmentKey(pr.key, si)] = p.provider_scores?.[pr.key] ?? null;
    }
    return row;
  });
}

// ---------------------------------------------------------------------------
// Custom tooltip — reads the raw point back off the row so we show each metric
// exactly once (the per-segment fan-out would otherwise list null duplicates),
// plus whether this point is comparable to the one before it.
// ---------------------------------------------------------------------------
function ChartTooltip({
  active,
  payload,
  showProviders,
  metrics,
  allIsolated,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  showProviders: boolean;
  metrics: typeof METRICS;
  allIsolated: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div
      style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 8px 24px rgba(48,37,26,0.10)',
        fontSize: 12,
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#231f1a' }}>
        {fullDate(row.__dateISO)}
      </div>
      {metrics.map((m) => (
        <div
          key={m.key}
          style={{ display: 'flex', justifyContent: 'space-between', gap: 16, lineHeight: 1.6 }}
        >
          <span style={{ color: m.color }}>{m.label}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', color: '#231f1a' }}>
            {fmtScore(row.__scores?.[m.key])}
          </span>
        </div>
      ))}
      {showProviders && row.__providers
        ? PROVIDERS.map((pr) => (
            <div
              key={pr.key}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 16, lineHeight: 1.6 }}
            >
              <span style={{ color: pr.color }}>{pr.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#786f65' }}>
                {fmtScore(row.__providers?.[pr.key])}
              </span>
            </div>
          ))
        : null}
      <div
        style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: '1px solid #f0ece5',
          color: row.__comparable ? '#3f765f' : '#786f65',
        }}
      >
        {row.__comparable
          ? `✓ Same prompt set${row.__thread ? ` (thread ${row.__thread})` : ''} — comparable to the earlier checks on its line.`
          : allIsolated
            ? 'Independent snapshot — its own prompt set.'
            : row.__isBreak
              ? row.__thread
                ? `⟳ New prompt set — starts comparison thread ${row.__thread}.`
                : '⟳ New prompt set — not comparable to any earlier check.'
              : 'Baseline point.'}
      </div>
    </div>
  );
}

// Compact vertical-line marker at a basis change.
function BreakLabel({ viewBox }: { viewBox?: { x?: number; y?: number } }) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  return (
    <g>
      <circle cx={x} cy={y + 4} r={7} fill="#fff" stroke="#B45309" strokeWidth={1.5} />
      <text x={x} y={y + 4} textAnchor="middle" dominantBaseline="central" fontSize={9} fill="#B45309">
        ⟳
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
export function VisibilityTrendChart({
  limit = 50,
  reloadKey,
  subjectType = 'merchant',
}: {
  limit?: number;
  /** Bump to refetch (e.g. after a new audit completes). */
  reloadKey?: number | string;
  /**
   * Which run kind to trend: 'merchant' (per-SKU catalog audits) or
   * 'merchant_url' (the URL-visibility wedge). The two are measured on
   * different subjects and never mix in one series — the URL-audit page
   * passes 'merchant_url' so the chart reflects the audits run there.
   */
  subjectType?: 'merchant' | 'merchant_url';
}) {
  const [data, setData] = useState<VisibilityTrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProviders, setShowProviders] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .getVisibilityTracking(limit, subjectType)
      .then((res) => {
        if (cancelled) return;
        setData(res);
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
  }, [limit, reloadKey, subjectType]);

  // Derive off the (stable-per-fetch) `data` reference so the memos below don't
  // rebuild on every render from freshly-allocated `?? []` fallbacks.
  const points = data?.points ?? EMPTY_POINTS;
  const segments = data?.segments ?? EMPTY_SEGMENTS;
  const basisChanges = data?.basis_changes ?? EMPTY_INDICES;

  // A "thread" is a connected comparison line — a segment with >= 2 points.
  // With two or more threads, same-metric strands are visually ambiguous (same
  // color), so: threads get stable letters (A, B, … by first appearance) for
  // the tooltip, and the thread holding the MOST RECENT check renders at full
  // strength while earlier threads are dimmed. One thread → nothing to
  // disambiguate, everything renders full-strength as before.
  const threadInfo = useMemo(() => {
    const letterBySegment = new Map<number, string>();
    let currentSegment: number | null = null;
    let latestPoint = -1;
    segments.forEach((s, si) => {
      if (s.indices.length < 2) return;
      letterBySegment.set(si, String.fromCharCode(65 + (letterBySegment.size % 26)));
      const last = Math.max(...s.indices);
      if (last > latestPoint) {
        latestPoint = last;
        currentSegment = si;
      }
    });
    return { letterBySegment, currentSegment, threadCount: letterBySegment.size };
  }, [segments]);

  const rows = useMemo(
    () => buildRows(points, segments, threadInfo.letterBySegment),
    [points, segments, threadInfo],
  );

  // Dim a segment's line when it's an EARLIER thread sitting under the current
  // one — never the current thread, never singletons (they have no line).
  const isDimmedSegment = (si: number) =>
    threadInfo.threadCount >= 2 &&
    threadInfo.letterBySegment.has(si) &&
    si !== threadInfo.currentSegment;

  // Only plot metrics that actually have data. A metric that's null across every
  // run (e.g. category_visibility on URL-wedge runs) would otherwise sit in the
  // legend as a dead entry and reserve a color that never renders — pure noise.
  const activeMetrics = useMemo(
    () => METRICS.filter((m) => points.some((p) => p.scores?.[m.key] != null)),
    [points],
  );

  // When NO two consecutive checks share a prompt set, nothing connects — the
  // chart degrades to a scatter of independent snapshots. In that case the
  // per-point ⟳ break markers fire on every column and become noise, so we drop
  // them and reframe the caption around "independent snapshots" instead of a
  // string of "not comparable" breaks.
  const allIsolated = useMemo(
    () => points.length >= 2 && segments.every((s) => s.indices.length < 2),
    [points, segments],
  );

  // A break is only worth annotating when it actually separates something
  // comparable — i.e. a connected run (segment length >= 2) sits on at least one
  // side of it. Breaks between two lone snapshots say nothing a scatter doesn't
  // already show, so we suppress them.
  const meaningfulBreaks = useMemo(() => {
    const lenAt = new Map<number, number>();
    segments.forEach((s) => s.indices.forEach((i) => lenAt.set(i, s.indices.length)));
    return basisChanges.filter(
      (idx) => (lenAt.get(idx) ?? 1) >= 2 || (lenAt.get(idx - 1) ?? 1) >= 2,
    );
  }, [basisChanges, segments]);

  // Only offer the per-engine toggle when there's actually provider data.
  const hasProviderData = useMemo(
    () =>
      points.some(
        (p) =>
          p.provider_scores &&
          PROVIDERS.some((pr) => {
            const v = p.provider_scores?.[pr.key];
            return v !== null && v !== undefined;
          }),
      ),
    [points],
  );

  const isBaseline = !!data && (data.is_baseline_only || points.length < 2);

  // --- Loading ---------------------------------------------------------------
  if (loading) {
    return (
      <SurfaceCard title="Visibility over time" eyebrow="AI visibility · trend">
        <div className="flex items-center justify-center gap-2 px-5 py-16 text-[color:var(--merchant-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading your visibility trend…</span>
        </div>
      </SurfaceCard>
    );
  }

  // --- Error -----------------------------------------------------------------
  if (error) {
    return (
      <SurfaceCard title="Visibility over time" eyebrow="AI visibility · trend">
        <div className="px-5 py-8 text-sm text-[color:var(--merchant-critical)]">
          {error}
        </div>
      </SurfaceCard>
    );
  }

  // --- No data yet (points: []) ---------------------------------------------
  if (points.length === 0) {
    return (
      <SurfaceCard title="Visibility over time" eyebrow="AI visibility · trend">
        <EmptyState
          icon={LineChartIcon}
          title="No visibility history yet"
          description="Run your first AI visibility check to start tracking how AI shopping agents see your products over time."
        />
      </SurfaceCard>
    );
  }

  // --- Baseline (1 run, or backend says baseline-only) -----------------------
  if (isBaseline) {
    const only = points[points.length - 1];
    return (
      <SurfaceCard
        title="Visibility over time"
        eyebrow="AI visibility · trend"
        description="Baseline established — re-audit to see movement."
      >
        <div className="px-5 py-5">
          <div className="grid grid-cols-3 gap-3">
            {METRICS.map((m) => (
              <div
                key={m.key}
                className="rounded-lg border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-3 py-3"
              >
                <div className="text-xs" style={{ color: m.color }}>
                  {m.label}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-[color:var(--merchant-ink)]">
                  {fmtScore(only?.scores?.[m.key])}
                  <span className="text-sm font-normal text-[color:var(--merchant-muted)]">
                    {' '}
                    / 100
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs text-[color:var(--merchant-muted)]">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              One check is a starting line, not a trend. Re-audit on the same
              prompt set and we&apos;ll plot the movement — and only connect points
              that are truly comparable.
            </span>
          </p>
        </div>
      </SurfaceCard>
    );
  }

  // --- The trend chart -------------------------------------------------------
  const nSegments = Math.max(segments.length, 1);

  // Explicit legend payload — one entry per metric (and per engine when shown).
  // We fan each metric out into one <Line> per segment for the honest breaks,
  // so an auto-generated legend would list every metric once per segment; this
  // collapses it back to a single entry each.
  // Recharts' legend icon renderer reads `entry.payload.strokeDasharray`, so
  // each item needs a nested `payload` (solid for metrics, dashed for engines).
  const legendPayload = [
    ...activeMetrics.map((m) => ({
      value: m.label,
      id: m.key,
      type: 'plainline' as const,
      color: m.color,
      inactive: false,
      payload: { strokeDasharray: '' },
    })),
    ...(showProviders
      ? PROVIDERS.map((pr) => ({
          value: pr.label,
          id: pr.key,
          type: 'plainline' as const,
          color: pr.color,
          inactive: false,
          payload: { strokeDasharray: '5 4' },
        }))
      : []),
  ];

  return (
    <SurfaceCard
      title="Visibility over time"
      eyebrow="AI visibility · trend"
      description={
        allIsolated
          ? 'Brand-level scores from each completed check. Every check so far used a different prompt set, so these are independent snapshots — hover any point for its scores.'
          : 'Brand-level scores across your completed checks. We connect a line only between checks measured on the same prompt set — a true comparison.'
      }
      action={
        hasProviderData ? (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[color:var(--merchant-muted-strong)]">
            <input
              type="checkbox"
              checked={showProviders}
              onChange={(e) => setShowProviders(e.target.checked)}
              className="h-3.5 w-3.5 accent-[color:var(--merchant-brand)]"
            />
            Show per-engine
          </label>
        ) : null
      }
    >
      <div className="px-2 py-4 sm:px-4">
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 20, right: 24, left: 4, bottom: 48 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="x"
                type="category"
                // Show a day label only when it differs from the point before it,
                // so a cluster of same-day checks (e.g. five on Jul 3) reads as one
                // labelled group instead of the same date repeated five times. The
                // tooltip still carries each point's exact date + time.
                tickFormatter={(x: string) => {
                  const i = Number(x);
                  const cur = rows[i]?.dateLabel ?? '';
                  const prev = i > 0 ? rows[i - 1]?.dateLabel : null;
                  return cur && cur !== prev ? cur : '';
                }}
                tick={{ fontSize: 11, fill: '#786f65' }}
                angle={-35}
                textAnchor="end"
                height={56}
                interval={0}
                stroke="#d8cfc2"
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fontSize: 11, fill: '#786f65' }}
                width={36}
                stroke="#d8cfc2"
              />
              <Tooltip
                content={
                  <ChartTooltip
                    showProviders={showProviders}
                    metrics={activeMetrics}
                    allIsolated={allIsolated}
                  />
                }
                cursor={{ stroke: '#c9bfb0', strokeDasharray: '3 3' }}
              />
              <Legend
                payload={legendPayload}
                wrapperStyle={{ paddingTop: 8, fontSize: 12 }}
                iconType="plainline"
              />

              {/* Basis-change breaks: vertical dashed line + ⟳ marker. The line
                  is already broken here (segments don't share a dataKey); this
                  annotates WHY. Only drawn for breaks that separate something
                  comparable — a pure scatter of one-off checks gets none. */}
              {meaningfulBreaks.map((idx) => (
                <ReferenceLine
                  key={`break-${idx}`}
                  x={String(idx)}
                  stroke="#B45309"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                  label={<BreakLabel />}
                  ifOverflow="extendDomain"
                />
              ))}

              {/* One <Line> per (metric, segment). Same metric → same color;
                  only the first segment carries the legend entry + name. A white
                  halo on each dot keeps points legible where they overlap or
                  cluster on the same day. connectNulls is REQUIRED: a segment's
                  points need not be consecutive (same-basis checks with another
                  URL set's check interleaved), and the rows in between hold null
                  for this segment's dataKey — the line must span them. */}
              {activeMetrics.flatMap((m) =>
                Array.from({ length: nSegments }, (_, si) => {
                  const dimmed = isDimmedSegment(si);
                  return (
                    <Line
                      key={`${m.key}-${si}`}
                      dataKey={segmentKey(m.key, si)}
                      name={m.label}
                      stroke={m.color}
                      strokeWidth={dimmed ? 1.5 : 2}
                      strokeOpacity={dimmed ? 0.35 : 1}
                      type="monotone"
                      connectNulls
                      dot={{
                        r: 3.5,
                        fill: m.color,
                        stroke: '#fff',
                        strokeWidth: 1.5,
                        fillOpacity: dimmed ? 0.45 : 1,
                      }}
                      activeDot={{ r: 5.5, stroke: '#fff', strokeWidth: 2 }}
                      legendType={si === 0 ? 'plainline' : 'none'}
                      isAnimationActive={false}
                    />
                  );
                }),
              )}

              {/* Per-engine sub-lines (dashed, thinner) — only when toggled. */}
              {showProviders
                ? PROVIDERS.flatMap((pr) =>
                    Array.from({ length: nSegments }, (_, si) => {
                      const dimmed = isDimmedSegment(si);
                      return (
                        <Line
                          key={`${pr.key}-${si}`}
                          dataKey={segmentKey(pr.key, si)}
                          name={pr.label}
                          stroke={pr.color}
                          strokeWidth={dimmed ? 1 : 1.5}
                          strokeOpacity={dimmed ? 0.35 : 1}
                          strokeDasharray="5 4"
                          type="monotone"
                          connectNulls
                          dot={{
                            r: 2,
                            fill: pr.color,
                            strokeWidth: 0,
                            fillOpacity: dimmed ? 0.45 : 1,
                          }}
                          activeDot={{ r: 4 }}
                          legendType={si === 0 ? 'plainline' : 'none'}
                          isAnimationActive={false}
                        />
                      );
                    }),
                  )
                : null}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Multi-thread hint — only when two or more connected lines share the
            chart and same-metric strands would otherwise be ambiguous. */}
        {threadInfo.threadCount >= 2 ? (
          <p className="mt-2 px-3 text-xs text-[color:var(--merchant-muted)]">
            You have {threadInfo.threadCount} comparison threads — separate
            prompt sets, each with its own line. The thread with your most
            recent check is drawn at full strength; earlier threads are dimmed.
            Hover any point to see which thread it belongs to.
          </p>
        ) : null}

        {/* The honesty caption — the rule, in plain words. Three cases:
            a pure scatter (nothing comparable yet), a mix of connected runs
            with refresh breaks, or one fully-comparable series. */}
        {allIsolated ? (
          <p className="mt-2 px-3 text-xs text-[color:var(--merchant-muted)]">
            Each point is one check, plotted by date. Every check so far used a
            different prompt set, so we show them as independent snapshots rather
            than a connected trend — a rise or fall between different prompts
            wouldn&apos;t be real. Re-check on the same prompt set and we&apos;ll
            connect those points into a true trend line.
          </p>
        ) : meaningfulBreaks.length > 0 ? (
          <p className="mt-2 flex items-start gap-2 px-3 text-xs text-[color:var(--merchant-muted)]">
            <span className="mt-0.5 text-[#B45309]">⟳</span>
            <span>
              A <span className="font-medium text-[#B45309]">⟳ break</span> marks
              where a new measurement basis first appeared — a fresh comparison
              thread starts there. We only connect checks measured on the same
              prompt set (even when other checks ran in between): different
              prompts answer different questions, so a rise or fall between them
              wouldn&apos;t be real.
            </span>
          </p>
        ) : (
          <p className="mt-2 px-3 text-xs text-[color:var(--merchant-muted)]">
            All checks shown were measured on the same prompt set, so every
            segment is a true like-for-like comparison.
          </p>
        )}
      </div>
    </SurfaceCard>
  );
}

export default VisibilityTrendChart;
