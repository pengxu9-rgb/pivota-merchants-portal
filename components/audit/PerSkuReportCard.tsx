'use client';

/**
 * Per-product report card for the URL audit (one pasted URL → one card).
 *
 * Reordered around the merchant's real questions, leading with the HONEST
 * agentic picture (recommended vs merely findable, per model) instead of a
 * single inflated "appears" number or the catalog-dominated dimension band:
 *   1. Does AI recommend you?      (ProductCompetitivenessPanel)
 *   2. Who wins & what AI said?    (PromptEvidencePanel — verbatim answers)
 *   3. Where does AI send buyers?  (ChannelAppearancePanel)
 *   4. What do I do?               (StrategicBriefPanel)
 * The catalog-only dimensions (identity/content/routability) + the 0–100
 * citation score by model are demoted into the expandable "details" drawer —
 * they're the connect-store funnel, not the headline, and the score-by-model
 * strip is kept apart from the appearance-by-model line to avoid conflating two
 * different "by model" numbers.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Quote } from 'lucide-react';
import { AgenticVisibilityPanels } from './AgenticVisibilityPanels';
import { agenticVerdict, verdictPillClasses } from '@/lib/audit/agenticVerdict';
import type {
  AgentCenterPerSkuReport,
  SkuDimensionScore,
  SkuProviderCitation,
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

function DimensionCell({
  label,
  score,
  highlight,
  unavailable,
}: {
  label: string;
  score?: SkuDimensionScore | null;
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
  // A missing dimension (sparse payload) renders as unscored, never throws.
  const band = score?.band ?? bandFromScore(score?.score);
  const bandLabel = score?.band_label ?? BAND_LABEL[band] ?? '';
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        highlight
          ? 'border-[color:var(--merchant-accent,#6366f1)] bg-white/80'
          : 'border-[color:var(--merchant-line)] bg-white/40'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide opacity-60">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-lg font-bold ${bandTextClass(band)}`}>
          {score?.score == null ? '—' : score.score}
        </span>
        {bandLabel ? (
          <span className={`text-[10px] font-semibold ${bandTextClass(band)}`}>
            {bandLabel}
          </span>
        ) : null}
      </div>
      {score?.meaning ? (
        <div className="mt-0.5 text-[10px] leading-snug opacity-60">{score?.meaning}</div>
      ) : null}
    </div>
  );
}

function CitationScoreByModel({
  citationByProvider,
}: {
  citationByProvider?: Record<string, SkuProviderCitation>;
}) {
  const entries = Object.entries(citationByProvider || {});
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        Citation score by model{' '}
        <span className="font-normal lowercase opacity-60">(0–100)</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
      </div>
    </div>
  );
}

export function PerSkuReportCard({
  report,
  index,
  catalogDimensionsAvailable = false,
  pdpUrl,
  runId,
}: {
  report: AgentCenterPerSkuReport;
  index?: number;
  catalogDimensionsAvailable?: boolean;
  pdpUrl?: string | null;
  runId?: string | null;
}) {
  // Collapsed by default: the verbatim AI answers already show above in the
  // always-visible PromptEvidencePanel; this drawer holds secondary detail
  // (catalog dimensions + score-by-model), so it stays tucked until asked for.
  const [expanded, setExpanded] = useState(false);
  const evidence = report.verbatim_grounding_evidence || [];
  const verdict = agenticVerdict(report);

  return (
    <div className={`rounded-lg border-2 ${bandBorderClass(report.band)}`}>
      <div className="px-4 pt-3">
        <div className="flex items-start justify-between gap-3">
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
          {verdict ? (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${verdictPillClasses(
                verdict.tone,
              )}`}
              title={verdict.meaning}
            >
              {verdict.label}
            </span>
          ) : null}
        </div>
      </div>

      <div className="px-4 pb-4">
        {/* The merchant's four questions, honest split leading. */}
        <AgenticVisibilityPanels report={report} runId={runId} />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex w-full items-center justify-between gap-2 rounded-md border border-[color:var(--merchant-line)] bg-white/30 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide opacity-70"
        >
          <span>Pivota readiness scores &amp; raw evidence</span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 opacity-60" />
          ) : (
            <ChevronDown className="h-4 w-4 opacity-60" />
          )}
        </button>

        {expanded ? (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <DimensionCell label="Cited by AI" score={report.scores?.citation} highlight />
              <DimensionCell
                label="Identity"
                score={report.scores?.identity}
                unavailable={!catalogDimensionsAvailable}
              />
              <DimensionCell
                label="Content"
                score={report.scores?.content_richness}
                unavailable={!catalogDimensionsAvailable}
              />
              <DimensionCell
                label="Routability"
                score={report.scores?.routability}
                unavailable={!catalogDimensionsAvailable}
              />
            </div>

            <CitationScoreByModel citationByProvider={report.citation_by_provider} />

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
                  Branded findability — what AI said when asked for you by name
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
