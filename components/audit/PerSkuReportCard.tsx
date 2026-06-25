'use client';

/**
 * Per-product report card for the URL audit (one pasted URL → one card).
 *
 * Renders an AgentCenterPerSkuReport: citation is the PRIMARY signal (it's the
 * only dimension measurable from a pasted URL with no synced catalog), shown
 * with the per-model strip. The catalog-only dimensions (identity / content /
 * routability) are rendered as "Connect store to measure" when
 * `catalogDimensionsAvailable` is false, rather than a misleading low score —
 * that's the connect-store funnel. The action plan reuses PerSkuNextStep.
 *
 * Visual patterns mirror the ai-readiness PerSkuCard so the two surfaces feel
 * like one product; kept as a standalone component (not extracted from the
 * 4k-line ai-readiness page) to avoid coupling.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Quote } from 'lucide-react';
import { StrategicBriefPanel } from './StrategicBriefPanel';
import { ChannelAppearancePanel } from './ChannelAppearancePanel';
import { ProductCompetitivenessPanel } from './ProductCompetitivenessPanel';
import type {
  AgentCenterPerSkuReport,
  SkuDimensionScore,
  SkuProviderCitation,
  ModelsCited,
} from '@/lib/types/ai-readiness';

const BAND_LABEL: Record<string, string> = {
  agent_ready: 'Agent-ready',
  ready: 'Ready',
  partial: 'Needs work',
  blocked: 'Not yet visible',
  unscored: 'Not measured',
};

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  openai: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
};

function providerLabel(p: string): string {
  return PROVIDER_LABELS[p.toLowerCase()] || p;
}

function bandFromScore(score: number | null | undefined): string {
  if (score == null) return 'unscored';
  if (score >= 80) return 'agent_ready';
  if (score >= 60) return 'ready';
  if (score >= 35) return 'partial';
  return 'blocked';
}

function bandTextClass(band: string): string {
  switch (band) {
    case 'agent_ready':
    case 'ready':
      return 'text-emerald-700';
    case 'partial':
      return 'text-amber-700';
    case 'blocked':
      return 'text-red-700';
    default:
      return 'text-slate-400';
  }
}

function bandBorderClass(band: string): string {
  switch (band) {
    case 'agent_ready':
    case 'ready':
      return 'border-emerald-200 bg-emerald-50/40';
    case 'partial':
      return 'border-amber-200 bg-amber-50/40';
    case 'blocked':
      return 'border-red-200 bg-red-50/40';
    default:
      return 'border-[color:var(--merchant-line)]';
  }
}

function skuDisplayName(report: AgentCenterPerSkuReport): string {
  return (
    report.identity?.name ||
    report.sku_title ||
    report.sku_key ||
    'This product'
  );
}

function BandPill({ band, label }: { band: string; label?: string }) {
  const text = label || BAND_LABEL[band] || band;
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${bandBorderClass(
        band,
      )} ${bandTextClass(band)}`}
    >
      {text}
    </span>
  );
}

function DimensionCell({
  label,
  score,
  highlight,
  unavailable,
}: {
  label: string;
  score: SkuDimensionScore;
  highlight?: boolean;
  unavailable?: boolean;
}) {
  // Catalog-only dimensions on a URL audit: render the connect-store funnel
  // instead of the (misleading) low score the pipeline produced with no catalog.
  if (unavailable) {
    return (
      <div className="rounded border border-dashed border-[color:var(--merchant-line)] bg-white/40 px-2 py-1.5">
        <div className="text-[10px] uppercase tracking-wide opacity-60">{label}</div>
        <div className="mt-0.5 text-[11px] font-medium text-slate-500">
          Connect store to measure
        </div>
      </div>
    );
  }
  const band = score.band ?? bandFromScore(score.score);
  const bandLabel = score.band_label ?? BAND_LABEL[band] ?? '';
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        highlight
          ? 'border-[color:var(--merchant-accent,#6366f1)] bg-white/80'
          : 'border-[color:var(--merchant-line)] bg-white/40'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide opacity-60">
        {label}
        {highlight ? ' · outcome' : ''}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-lg font-bold ${bandTextClass(band)}`}>
          {score.score == null ? '—' : score.score}
        </span>
        {bandLabel ? (
          <span className={`text-[10px] font-semibold ${bandTextClass(band)}`}>
            {bandLabel}
          </span>
        ) : null}
      </div>
      {score.meaning ? (
        <div className="mt-0.5 text-[10px] leading-snug opacity-60">{score.meaning}</div>
      ) : null}
    </div>
  );
}

function ModelStrip({
  citationByProvider,
  modelsCited,
}: {
  citationByProvider?: Record<string, SkuProviderCitation>;
  modelsCited?: ModelsCited;
}) {
  const entries = Object.entries(citationByProvider || {});
  if (entries.length === 0 && !modelsCited) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        By model
      </span>
      {entries.map(([provider, entry]) => {
        const failed = entry?.status === 'probe_failed';
        return (
          <span
            key={provider}
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--merchant-line)] bg-white/60 px-2 py-0.5 text-[11px]"
            title={failed ? 'This model failed to respond on this run' : undefined}
          >
            <span className="font-medium">{providerLabel(provider)}</span>
            <span className="opacity-70">
              {failed ? 'no response' : entry?.score == null ? '—' : entry.score}
            </span>
          </span>
        );
      })}
      {modelsCited && modelsCited.of > 0 ? (
        <span className="ml-1 text-[11px] opacity-70">
          cited in {modelsCited.cited}/{modelsCited.of} model
          {modelsCited.of === 1 ? '' : 's'}
        </span>
      ) : null}
    </div>
  );
}

export function PerSkuReportCard({
  report,
  index,
  catalogDimensionsAvailable = false,
  pdpUrl,
}: {
  report: AgentCenterPerSkuReport;
  index?: number;
  catalogDimensionsAvailable?: boolean;
  pdpUrl?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const citationBand =
    report.scores?.citation?.band ?? bandFromScore(report.scores?.citation?.score);
  const evidence = report.verbatim_grounding_evidence || [];

  return (
    <div className={`rounded-lg border-2 ${bandBorderClass(report.band)}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold leading-snug">
            {index != null ? (
              <span className="mr-1.5 opacity-50">#{index + 1}</span>
            ) : null}
            {skuDisplayName(report)}
          </div>
          {pdpUrl ? (
            <div className="mt-0.5 truncate text-[11px] opacity-60">{pdpUrl}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BandPill band={report.band_display?.band ?? report.band} label={report.band_display?.label} />
          {expanded ? (
            <ChevronUp className="h-4 w-4 opacity-60" />
          ) : (
            <ChevronDown className="h-4 w-4 opacity-60" />
          )}
        </div>
      </button>

      <div className="px-4 pb-4">
        {/* Citation is the measurable outcome for a URL audit; the catalog dims
            sit behind the connect-store funnel. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DimensionCell
            label="Cited by AI"
            score={report.scores.citation}
            highlight
          />
          <DimensionCell
            label="Identity"
            score={report.scores.identity}
            unavailable={!catalogDimensionsAvailable}
          />
          <DimensionCell
            label="Content"
            score={report.scores.content_richness}
            unavailable={!catalogDimensionsAvailable}
          />
          <DimensionCell
            label="Routability"
            score={report.scores.routability}
            unavailable={!catalogDimensionsAvailable}
          />
        </div>

        <ModelStrip
          citationByProvider={report.citation_by_provider}
          modelsCited={report.models_cited}
        />

        {/* PRODUCT competitiveness FIRST: does the product win non-branded
            discovery demand (where the brand gains new buyers) + who wins
            instead. Branded queries shown as low-value. */}
        <ProductCompetitivenessPanel report={report} />

        {/* Then CHANNEL context: where it shows up — own site vs the channels
            AI cites instead. */}
        <ChannelAppearancePanel report={report} />

        {/* Consultant-grade action plan: root cause (why you lose) + the
            decision + concrete first moves + honest you-vs-Pivota. */}
        <StrategicBriefPanel report={report} />

        {expanded ? (
          <div className="mt-3 space-y-3">
            {report.primary_gaps?.length ? (
              <div className="rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  Why AI isn&apos;t citing this yet
                </div>
                <ul className="mt-1 space-y-1">
                  {report.primary_gaps.slice(0, 4).map((g, i) => (
                    <li key={i} className="text-xs">
                      <span className="font-medium">{g.label}</span>
                      {g.why ? <span className="opacity-70"> — {g.why}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {evidence.length ? (
              <div className="rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  What AI actually said
                </div>
                <ul className="mt-1 space-y-2">
                  {evidence.slice(0, 4).map((e, i) => {
                    const hosts = (e.grounding_sources || e.grounded_sources || [])
                      .map((s) => s.host)
                      .filter(Boolean) as string[];
                    return (
                      <li key={i} className="text-xs">
                        {e.query || e.prompt ? (
                          <div className="font-medium">{e.query || e.prompt}</div>
                        ) : null}
                        {e.evidence_excerpt ? (
                          <div className="mt-0.5 flex gap-1 italic opacity-70">
                            <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{e.evidence_excerpt}</span>
                          </div>
                        ) : null}
                        {hosts.length ? (
                          <div className="mt-0.5 opacity-60">
                            Cited: {Array.from(new Set(hosts)).slice(0, 5).join(', ')}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
