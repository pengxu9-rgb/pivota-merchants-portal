'use client';

/**
 * MomentumTrend — the compact, disciplined trend view inside the unified
 * Momentum card (redesign after the founder saw a real ~29-run history render
 * as an unreadable point-cloud).
 *
 * Chart discipline, in order:
 *  - WINDOWED: the most recent N checks only (default 10), after keeping just
 *    the LATEST check per day (same-day re-runs are retries, not movement).
 *    The header says exactly what's shown ("Last N checks · latest per day").
 *  - Marks: 2px lines, NO per-point dots — one emphasized final point per
 *    series with a direct end-label (metric + final value), so the reader
 *    never round-trips through a legend.
 *  - Time-proportional x (a two-week gap LOOKS like a gap); sparse ticks:
 *    first + last date and at most two between. Y fixed 0–100, faint grid.
 *  - Nulls are GAPS, never zero-dips. A prompt-set (basis) change also breaks
 *    the line — points across a break aren't comparable, and we say so.
 *  - Series restraint: Visibility renders as the one full-size line; the
 *    other metrics render as small-multiple rows beneath on the same window
 *    and scale. (Tried 3 lines in one plot first: visibility/attribution sit
 *    in the same 25–55 band in real data and braid; minis stay legible.)
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import type {
  TrackingPoint,
  VisibilityTrackingResponse,
} from '@/lib/types/visibility-tracking';

// Same hues as the legacy trend chart (kept for continuity across surfaces).
const PRIMARY_METRIC = { key: 'visibility' as const, label: 'Visibility', color: '#534AB7' };
const SECONDARY_METRICS = [
  { key: 'attribution' as const, label: 'Attribution', color: '#0F766E' },
  { key: 'category_visibility' as const, label: 'Category visibility', color: '#B45309' },
];

export type MetricKey = 'visibility' | 'attribution' | 'category_visibility';

export interface WindowedPoint {
  t: number; // epoch ms
  dateISO: string;
  basisId: string | null;
  scores: Partial<Record<MetricKey, number | null>>;
}

export interface WindowedTrend {
  points: WindowedPoint[];
  /** True when same-day dedup actually dropped at least one check. */
  dedupedSameDay: boolean;
  /** True when the window dropped older checks beyond N. */
  truncated: boolean;
  totalChecks: number;
}

/**
 * Same-day dedup (keep the LATEST check per local day) then window to the
 * most recent `maxPoints`. Exported so the card can gate its layout on the
 * WINDOWED depth (29 checks across 2 days is still a 2-point story).
 */
export function windowTrendPoints(
  data: VisibilityTrackingResponse | null,
  maxPoints = 10,
): WindowedTrend {
  const raw = (data?.points ?? []).filter(
    (p): p is TrackingPoint => !!p && !!p.date && !Number.isNaN(new Date(p.date!).getTime()),
  );
  // Oldest → newest by timestamp (the API promises this order; sort defensively).
  const sorted = [...raw].sort(
    (a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime(),
  );
  // Latest check per local day.
  const byDay = new Map<string, TrackingPoint>();
  for (const p of sorted) {
    const day = new Date(p.date!).toLocaleDateString();
    byDay.set(day, p); // later entries (newer) overwrite earlier same-day ones
  }
  const deduped = [...byDay.values()].sort(
    (a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime(),
  );
  const windowed = deduped.slice(-maxPoints);
  return {
    points: windowed.map((p) => ({
      t: new Date(p.date!).getTime(),
      dateISO: p.date!,
      basisId: p.basis_id ?? null,
      scores: {
        visibility: p.scores?.visibility ?? null,
        attribution: p.scores?.attribution ?? null,
        category_visibility: p.scores?.category_visibility ?? null,
      },
    })),
    dedupedSameDay: deduped.length < sorted.length,
    truncated: windowed.length < deduped.length,
    totalChecks: sorted.length,
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function useMeasuredWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      setW(width);
    });
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Time-proportional x scale; falls back to index spacing on a zero span. */
function makeXScale(points: WindowedPoint[], x0: number, x1: number) {
  const t0 = points[0]?.t ?? 0;
  const t1 = points[points.length - 1]?.t ?? 0;
  const span = t1 - t0;
  if (span <= 0) {
    const n = Math.max(points.length - 1, 1);
    return (_t: number, i: number) => x0 + ((x1 - x0) * i) / n;
  }
  return (t: number, _i: number) => x0 + ((x1 - x0) * (t - t0)) / span;
}

const yScale = (v: number, yTop: number, yBottom: number) =>
  yBottom - ((yBottom - yTop) * Math.max(0, Math.min(100, v))) / 100;

/**
 * Segments a metric across the window: consecutive non-null points connect
 * ONLY when they share the measurement basis; a null or a basis change opens
 * a gap. Returns polyline point-lists (index refs into `points`).
 */
function buildSegments(points: WindowedPoint[], key: MetricKey): number[][] {
  const segs: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const v = points[i].scores[key];
    if (v == null) {
      if (cur.length) segs.push(cur);
      cur = [];
      continue;
    }
    if (cur.length) {
      const prev = points[cur[cur.length - 1]];
      if (prev.basisId !== points[i].basisId) {
        segs.push(cur);
        cur = [];
      }
    }
    cur.push(i);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

function lastMeasuredIndex(points: WindowedPoint[], key: MetricKey): number {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].scores[key] != null) return i;
  }
  return -1;
}

function hasAnyBasisBreak(points: WindowedPoint[], keys: MetricKey[]): boolean {
  // A break = two adjacent measured points whose prompt-set basis differs.
  return keys.some((k) =>
    points.some(
      (p, i) =>
        i > 0 &&
        p.scores[k] != null &&
        points[i - 1].scores[k] != null &&
        points[i - 1].basisId !== p.basisId,
    ),
  );
}

function shortDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** First + last + at most two between, deduped by rendered label. */
function pickTicks(points: WindowedPoint[]): WindowedPoint[] {
  if (points.length <= 2) return points;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const targets = [t0 + (t1 - t0) / 3, t0 + (2 * (t1 - t0)) / 3];
  const between = targets.map((target) =>
    points.reduce((best, p) =>
      Math.abs(p.t - target) < Math.abs(best.t - target) ? p : best,
    ),
  );
  const picked = [points[0], ...between, points[points.length - 1]];
  const seen = new Set<string>();
  return picked.filter((p) => {
    const label = shortDate(p.t);
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export function MomentumTrend({
  data,
  maxPoints = 10,
}: {
  data: VisibilityTrackingResponse | null;
  maxPoints?: number;
}) {
  const [ref, measuredW] = useMeasuredWidth();
  const trend = windowTrendPoints(data, maxPoints);
  const { points } = trend;
  if (points.length < 3) return null;

  const w = Math.max(measuredW, 320); // never lay out at 0 (hidden/first paint)
  const primaryLast = lastMeasuredIndex(points, PRIMARY_METRIC.key);

  // Secondary metrics render only when they carry ≥2 measured points in the
  // window (one point is a caption, not a trend row).
  const minis = SECONDARY_METRICS.filter(
    (m) => points.filter((p) => p.scores[m.key] != null).length >= 2,
  );
  const anyBasisBreak = hasAnyBasisBreak(points, [
    PRIMARY_METRIC.key,
    ...minis.map((m) => m.key),
  ]);

  // --- primary chart geometry ---
  const H = 168;
  const M = { top: 10, right: 116, bottom: 22, left: 30 };
  const plotX0 = M.left;
  const plotX1 = w - M.right;
  const plotY0 = M.top;
  const plotY1 = H - M.bottom;
  const xOf = makeXScale(points, plotX0, plotX1);
  const yOf = (v: number) => yScale(v, plotY0, plotY1);
  const ticks = pickTicks(points);

  const primarySegs = buildSegments(points, PRIMARY_METRIC.key);
  const primaryFinal =
    primaryLast >= 0 ? points[primaryLast].scores[PRIMARY_METRIC.key] : null;

  const windowNote = [
    `Last ${points.length} check${points.length === 1 ? '' : 's'}`,
    trend.dedupedSameDay ? 'latest check per day' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div ref={ref}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--merchant-muted)]">
          Visibility over time
        </div>
        <span className="text-[11px] text-[color:var(--merchant-muted)]">{windowNote}</span>
      </div>

      {/* Primary: the one full-size line. */}
      <svg width={w} height={H} className="mt-1 block" role="img"
        aria-label={`Visibility over the last ${points.length} checks`}>
        {/* faint grid */}
        {[0, 25, 50, 75, 100].map((g) => (
          <line
            key={g}
            x1={plotX0}
            x2={plotX1}
            y1={yOf(g)}
            y2={yOf(g)}
            stroke="#000"
            strokeOpacity={g === 0 ? 0.14 : 0.06}
          />
        ))}
        {[0, 50, 100].map((g) => (
          <text
            key={g}
            x={plotX0 - 6}
            y={yOf(g) + 3}
            textAnchor="end"
            fontSize={10}
            fill="#786f65"
          >
            {g}
          </text>
        ))}
        {/* sparse x ticks */}
        {ticks.map((p, i) => (
          <text
            key={i}
            x={xOf(p.t, points.indexOf(p))}
            y={H - 6}
            textAnchor="middle"
            fontSize={10}
            fill="#786f65"
          >
            {shortDate(p.t)}
          </text>
        ))}
        {/* the line: 2px, gaps for nulls/basis changes, no per-point dots.
            A SINGLETON segment (an isolated measurement between gaps) still
            renders as a small dot — measured data must never be invisible. */}
        {primarySegs.map((seg, si) =>
          seg.length === 1 ? (
            <circle
              key={si}
              cx={xOf(points[seg[0]].t, seg[0])}
              cy={yOf(points[seg[0]].scores[PRIMARY_METRIC.key]!)}
              r={2.5}
              fill={PRIMARY_METRIC.color}
              fillOpacity={0.55}
            />
          ) : (
            <polyline
              key={si}
              points={seg
                .map((i) => `${xOf(points[i].t, i)},${yOf(points[i].scores[PRIMARY_METRIC.key]!)}`)
                .join(' ')}
              fill="none"
              stroke={PRIMARY_METRIC.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ),
        )}
        {/* emphasized final point + direct end label */}
        {primaryLast >= 0 && primaryFinal != null ? (
          <>
            <circle
              cx={xOf(points[primaryLast].t, primaryLast)}
              cy={yOf(primaryFinal)}
              r={3.5}
              fill={PRIMARY_METRIC.color}
            />
            <text
              x={xOf(points[primaryLast].t, primaryLast) + 9}
              y={yOf(primaryFinal) + 4}
              fontSize={12}
              fontWeight={600}
              fill={PRIMARY_METRIC.color}
            >
              {PRIMARY_METRIC.label} {Math.round(primaryFinal)}
            </text>
          </>
        ) : null}
      </svg>

      {/* Small multiples: same window, same 0–100 scale, one row per metric. */}
      {minis.length > 0 ? (
        <div className="mt-1 space-y-1.5">
          {minis.map((m) => {
            const segs = buildSegments(points, m.key);
            const li = lastMeasuredIndex(points, m.key);
            const finalV = li >= 0 ? points[li].scores[m.key] : null;
            const mh = 34;
            const mx0 = M.left;
            const mx1 = w - M.right;
            const mxOf = makeXScale(points, mx0, mx1);
            const myOf = (v: number) => yScale(v, 4, mh - 4);
            return (
              <div key={m.key} className="flex items-center">
                <svg width={w} height={mh} className="block" role="img"
                  aria-label={`${m.label} over the same window`}>
                  <line
                    x1={mx0}
                    x2={mx1}
                    y1={myOf(0)}
                    y2={myOf(0)}
                    stroke="#000"
                    strokeOpacity={0.08}
                  />
                  {segs.map((seg, si) =>
                    seg.length === 1 ? (
                      <circle
                        key={si}
                        cx={mxOf(points[seg[0]].t, seg[0])}
                        cy={myOf(points[seg[0]].scores[m.key]!)}
                        r={2.2}
                        fill={m.color}
                        fillOpacity={0.5}
                      />
                    ) : (
                      <polyline
                        key={si}
                        points={seg
                          .map((i) => `${mxOf(points[i].t, i)},${myOf(points[i].scores[m.key]!)}`)
                          .join(' ')}
                        fill="none"
                        stroke={m.color}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity={0.85}
                      />
                    ),
                  )}
                  {li >= 0 && finalV != null ? (
                    <>
                      <circle
                        cx={mxOf(points[li].t, li)}
                        cy={myOf(finalV)}
                        r={2.8}
                        fill={m.color}
                      />
                      <text
                        x={mxOf(points[li].t, li) + 8}
                        y={myOf(finalV) + 3.5}
                        fontSize={11}
                        fontWeight={600}
                        fill={m.color}
                      >
                        {m.label} {Math.round(finalV)}
                      </text>
                    </>
                  ) : null}
                </svg>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="mt-1.5 text-[11px] leading-snug text-[color:var(--merchant-muted)]">
        Latest check per day, 0–100.
        {anyBasisBreak
          ? ' Line breaks mark a prompt-set change — points across a break aren’t comparable.'
          : ' All shown checks used the same prompt set — a true comparison.'}
      </p>
    </div>
  );
}

export default MomentumTrend;
