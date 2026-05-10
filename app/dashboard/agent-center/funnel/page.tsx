'use client';

/**
 * APM funnel chart page.
 *
 * Renders the canonical 6-stage funnel from PR-5's funnel_events
 * (impression → profile_visit → click → pdp_view → add_to_cart →
 * conversion) with per-stage counts + drop-off rates, plus a per-
 * channel breakdown so the merchant can pick which channel to
 * drill into.
 *
 * Backend: GET /api/merchant-center/funnel?channel=&window_days=
 *
 * Honest empty state: when funnel_events has zero rows for the
 * window, every stage shows count=0 and we surface a "no events
 * tracked yet" notice instead of a misleading flat funnel.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Filter, RefreshCw, Loader2, TrendingDown } from 'lucide-react';

import {
  apiClient,
  type ApmFunnelResponse,
  type ApmFunnelStageRow,
  type ApmSourceChannel,
} from '@/lib/api-client';
import {
  PageHeader,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';


const WINDOW_OPTIONS: { label: string; value: number }[] = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];


const CHANNEL_LABELS: Record<ApmSourceChannel, string> = {
  ai_grounded_search: 'AI grounded search',
  ai_agent: 'AI shopping agent',
  social_own: 'Social (own)',
  social_kol: 'Social (KOL)',
  editorial: 'Editorial / press',
  seo_organic: 'SEO organic',
  retail: 'Retail / marketplace',
  direct: 'Direct',
  unknown: 'Unknown',
};


const STAGE_LABELS: Record<string, string> = {
  impression: 'Impression',
  profile_visit: 'Profile visit',
  click: 'Click',
  pdp_view: 'PDP view',
  add_to_cart: 'Add to cart',
  conversion: 'Conversion',
};


export default function FunnelPage() {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [channel, setChannel] = useState<string>('');
  const [data, setData] = useState<ApmFunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getApmFunnel({
        window_days: windowDays,
        channel: channel || undefined,
      });
      setData(res);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ??
        (e as { message?: string }).message ??
        'Failed to load funnel';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [windowDays, channel]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalEvents = data?.total_events ?? 0;
  const noData = !loading && data && totalEvents === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="APM"
        title="Conversion funnel"
        description="Stage-by-stage drop-off across AI, social, editorial, retail, and SEO channels — based on tracked impressions, clicks, and conversions in the trailing window."
        actions={
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <SurfaceCard
        title="Window & channel"
        description="Pick the trailing window and (optionally) drill into one source channel."
      >
        <div className="px-5 py-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Window
            </span>
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setWindowDays(opt.value)}
                className={`rounded px-3 py-1.5 text-sm transition ${
                  windowDays === opt.value
                    ? 'bg-slate-800 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Channel
            </span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
            >
              <option value="">All channels</option>
              {(Object.keys(CHANNEL_LABELS) as ApmSourceChannel[]).map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
            {data ? (
              <span className="text-xs text-slate-500">
                {totalEvents.toLocaleString()} events in window
              </span>
            ) : null}
          </div>
        </div>
      </SurfaceCard>

      {error ? (
        <SurfaceCard>
          <div className="px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        </SurfaceCard>
      ) : null}

      {loading && !data ? (
        <SurfaceCard>
          <div className="flex items-center gap-2 px-5 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading funnel…
          </div>
        </SurfaceCard>
      ) : null}

      {data ? (
        <SurfaceCard
          title="Funnel"
          eyebrow={
            channel
              ? CHANNEL_LABELS[channel as ApmSourceChannel] || channel
              : 'All channels'
          }
          description={
            noData
              ? 'No tracked events in this window. funnel_events populates as PR-5 instrumentation captures live API calls and orders. If the merchant just onboarded, expect this to fill in over the next few days; if it stays empty after a week, the upstream api_call_events / order_events tables may be missing utm_source / referrer fields needed for channel inference.'
              : `${data.stages.length} canonical stages · ${windowDays}-day window`
          }
        >
          <div className="px-5 py-4">
            <FunnelChart stages={data.stages} totalEvents={totalEvents} />
          </div>
        </SurfaceCard>
      ) : null}

      {data && data.channel_breakdown.length > 0 ? (
        <SurfaceCard
          title="Channel breakdown"
          description="Which source channels are producing tracked events. Drill into one via the dropdown above."
        >
          <div className="px-5 py-4">
            <ChannelBreakdown
              rows={data.channel_breakdown}
              totalEvents={totalEvents}
              activeChannel={channel}
              onSelect={setChannel}
            />
          </div>
        </SurfaceCard>
      ) : null}
    </div>
  );
}


function FunnelChart({
  stages,
  totalEvents,
}: {
  stages: ApmFunnelStageRow[];
  totalEvents: number;
}) {
  // Bar widths are normalized against the largest count in the funnel
  // (typically the impression stage). When totalEvents == 0, render a
  // muted skeleton instead of zero-width bars.
  const maxCount = useMemo(
    () => stages.reduce((m, s) => (s.count > m ? s.count : m), 0),
    [stages],
  );

  if (totalEvents === 0) {
    return (
      <div className="space-y-2">
        {stages.map((stage) => (
          <div
            key={stage.stage}
            className="flex items-center gap-3 rounded border border-dashed border-slate-200 bg-slate-50 p-3"
          >
            <span className="w-32 text-sm font-medium text-slate-500">
              {STAGE_LABELS[stage.stage] || stage.stage}
            </span>
            <span className="text-xs italic text-slate-400">no events</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const widthPct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
        const isLast = i === stages.length - 1;
        return (
          <div key={stage.stage} className="space-y-1">
            <div className="flex items-end justify-between gap-3">
              <span className="text-sm font-medium text-slate-800">
                {STAGE_LABELS[stage.stage] || stage.stage}
              </span>
              <span className="text-xs text-slate-500">
                {stage.count.toLocaleString()} event
                {stage.count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="relative h-7 w-full overflow-hidden rounded bg-slate-100">
              <div
                className="h-full rounded bg-gradient-to-r from-blue-500 to-blue-600"
                style={{ width: `${widthPct.toFixed(2)}%` }}
              />
            </div>
            {!isLast ? (
              <ConversionDelta stage={stage} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}


function ConversionDelta({ stage }: { stage: ApmFunnelStageRow }) {
  if (stage.conversion_to_next === null || stage.drop_off_pct === null) {
    return (
      <div className="ml-3 flex items-center gap-1 text-[11px] text-slate-400">
        <TrendingDown className="h-3 w-3" /> conversion undefined (zero
        events upstream)
      </div>
    );
  }
  const conv = (stage.conversion_to_next * 100).toFixed(1);
  const drop = (stage.drop_off_pct * 100).toFixed(1);
  // Highlight large drops (>= 80%) — common red flag in conversion
  // optimization.
  const severe = stage.drop_off_pct >= 0.8;
  return (
    <div
      className={`ml-3 flex items-center gap-1 text-[11px] ${
        severe ? 'text-red-600 font-semibold' : 'text-slate-500'
      }`}
    >
      <TrendingDown className="h-3 w-3" />
      {conv}% convert · {drop}% drop-off to next stage
    </div>
  );
}


function ChannelBreakdown({
  rows,
  totalEvents,
  activeChannel,
  onSelect,
}: {
  rows: { source_channel: ApmSourceChannel; total_events: number }[];
  totalEvents: number;
  activeChannel: string;
  onSelect: (c: string) => void;
}) {
  const maxCount = rows.reduce(
    (m, r) => (r.total_events > m ? r.total_events : m),
    0,
  );
  const sorted = [...rows].sort((a, b) => b.total_events - a.total_events);

  return (
    <ul className="space-y-2">
      {sorted.map((row) => {
        const widthPct = maxCount > 0 ? (row.total_events / maxCount) * 100 : 0;
        const sharePct =
          totalEvents > 0
            ? ((row.total_events / totalEvents) * 100).toFixed(1)
            : '0.0';
        const active = row.source_channel === activeChannel;
        return (
          <li key={row.source_channel}>
            <button
              onClick={() =>
                onSelect(active ? '' : row.source_channel)
              }
              className={`block w-full rounded border-2 p-2.5 text-left transition ${
                active
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-sm font-medium text-slate-800">
                    {CHANNEL_LABELS[row.source_channel]}
                  </span>
                </div>
                <span className="text-xs text-slate-600">
                  {row.total_events.toLocaleString()} ({sharePct}%)
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-100">
                <div
                  className={`h-full rounded ${
                    active ? 'bg-blue-500' : 'bg-slate-400'
                  }`}
                  style={{ width: `${widthPct.toFixed(2)}%` }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
