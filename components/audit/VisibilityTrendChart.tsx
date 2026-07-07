'use client';

/**
 * VisibilityTrendChart — the payoff of the pinned-measurement-basis (W2) work.
 *
 * Renders a merchant's AI-visibility scores over time from
 *   GET /api/merchant-center/audit/tracking   (apiClient.getVisibilityTracking)
 *
 * THE ONE NON-NEGOTIABLE RULE (this is the whole point):
 *   Only connect a line between two consecutive points when the later point's
 *   `comparable_with_prev` is true (same pinned prompt set). Where it's false
 *   (a `basis_changes` index / new segment) we BREAK the line and draw a marker
 *   "Measurement basis refreshed — comparison resets here."
 *
 *   Rationale baked into the copy: two points measured on different prompts
 *   aren't a real rise/fall — they're different questions. Connecting them would
 *   be a lie. Same basis = a true comparison.
 *
 * We implement the break by giving each metric one Recharts <Line> PER SEGMENT
 * (a run of consecutive same-basis points). A point's value only populates its
 * own segment's dataKey (null elsewhere), so lines connect within a segment and
 * gap between segments — while every point still renders its dot.
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
  __isBreak: boolean; // basis changed at this point (and it isn't the first)
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
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  showProviders: boolean;
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
      {METRICS.map((m) => (
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
          color: row.__isBreak ? '#B45309' : '#3f765f',
        }}
      >
        {row.__isBreak
          ? '⟳ New measurement basis — not comparable to the previous check.'
          : row.__comparable
            ? '✓ Same basis — comparable to the previous check.'
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
}: {
  limit?: number;
  /** Bump to refetch (e.g. after a new audit completes). */
  reloadKey?: number | string;
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
      .getVisibilityTracking(limit)
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
  }, [limit, reloadKey]);

  // Derive off the (stable-per-fetch) `data` reference so the memos below don't
  // rebuild on every render from freshly-allocated `?? []` fallbacks.
  const points = data?.points ?? EMPTY_POINTS;
  const segments = data?.segments ?? EMPTY_SEGMENTS;
  const basisChanges = data?.basis_changes ?? EMPTY_INDICES;

  const rows = useMemo(() => buildRows(points, segments), [points, segments]);

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
    ...METRICS.map((m) => ({
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
      description="Brand-level scores across your completed checks. We connect a line only between checks measured on the same prompt set — a true comparison."
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
                tickFormatter={(x: string) => rows[Number(x)]?.dateLabel ?? ''}
                tick={{ fontSize: 11, fill: '#786f65' }}
                angle={-35}
                textAnchor="end"
                height={56}
                interval="preserveStartEnd"
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
                content={<ChartTooltip showProviders={showProviders} />}
                cursor={{ stroke: '#c9bfb0', strokeDasharray: '3 3' }}
              />
              <Legend
                payload={legendPayload}
                wrapperStyle={{ paddingTop: 8, fontSize: 12 }}
                iconType="plainline"
              />

              {/* Basis-change breaks: vertical dashed line + ⟳ marker. The line
                  is already broken here (segments don't share a dataKey); this
                  annotates WHY. */}
              {basisChanges.map((idx) => (
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
                  only the first segment carries the legend entry + name. */}
              {METRICS.flatMap((m) =>
                Array.from({ length: nSegments }, (_, si) => (
                  <Line
                    key={`${m.key}-${si}`}
                    dataKey={segmentKey(m.key, si)}
                    name={m.label}
                    stroke={m.color}
                    strokeWidth={2}
                    type="monotone"
                    connectNulls={false}
                    dot={{ r: 3, fill: m.color, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    legendType={si === 0 ? 'plainline' : 'none'}
                    isAnimationActive={false}
                  />
                )),
              )}

              {/* Per-engine sub-lines (dashed, thinner) — only when toggled. */}
              {showProviders
                ? PROVIDERS.flatMap((pr) =>
                    Array.from({ length: nSegments }, (_, si) => (
                      <Line
                        key={`${pr.key}-${si}`}
                        dataKey={segmentKey(pr.key, si)}
                        name={pr.label}
                        stroke={pr.color}
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                        type="monotone"
                        connectNulls={false}
                        dot={{ r: 2, fill: pr.color, strokeWidth: 0 }}
                        activeDot={{ r: 4 }}
                        legendType={si === 0 ? 'plainline' : 'none'}
                        isAnimationActive={false}
                      />
                    )),
                  )
                : null}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* The honesty caption — the rule, in plain words. */}
        {basisChanges.length > 0 ? (
          <p className="mt-2 flex items-start gap-2 px-3 text-xs text-[color:var(--merchant-muted)]">
            <span className="mt-0.5 text-[#B45309]">⟳</span>
            <span>
              A <span className="font-medium text-[#B45309]">⟳ break</span> marks
              where the measurement basis was refreshed — comparison resets there.
              Points across a refresh aren&apos;t connected because they were
              measured on different prompts: they answer different questions, so a
              rise or fall between them wouldn&apos;t be real.
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
