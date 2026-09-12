'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '@/lib/api-client';

type Estimate = { positive: number; n: number; rate: number | null; ci95: [number, number] | null; unknown: number };
type Tier = { attempted: number; provider_failed: number; brand_mentioned: Estimate; source_visible: Estimate };
type Answer = { observation_id: string; query: string; provider: string; brand_mentioned: boolean | null; unknown_reason?: string; prompt_contract?: string;
  cited_sources?: {uri?: string; url?: string; title?: string}[];
  evidence?: { text?: string | null; model?: string | null; complete?: boolean }; };
type Query = { query: string; matched_products?: { title?: string; product_key?: string }[] };
export type Recovery = {
  builder_version: string;
  selection: { mixed_execution_providers?: string[]; answers?: Answer[]; excluded_diagnostics?: number; observations: number; tiers: Record<string, Tier>; unclassified: number; unavailable_reason?: string; limitation: string };
  selection_gap?: { gaps: Query[]; won_queries: Query[]; lost_queries_without_product: Query[]; counts: { lost_queries: number; won_queries: number } } | null;
  stages: { stage: string; status: string; unverified_reason?: string; findings: { type: string; summary: string }[] }[];
  headline: { dimensions: { dimension: string; label: string; band_label?: string; n?: number; median?: number; p25?: number; p75?: number }[] };
  actions_locked?: boolean;
  catalog_available?: boolean;
};

function sourceLink(source: {uri?: string; url?: string}): string | null {
  try {
    const url = new URL(source.uri || source.url || '');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function MetricLabel({ label, explanation }: { label: string; explanation: string }) {
  const id = useId();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [position]);
  const show = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setPosition({ top: Math.min(rect.bottom + 8, window.innerHeight - 180), left: Math.max(12, Math.min(rect.left, window.innerWidth - 300)) });
  };
  return <span className="inline-flex items-center gap-1" onMouseLeave={() => setPosition(null)}>
    {label}<button type="button" aria-label={`About ${label}`} aria-describedby={position ? id : undefined}
      aria-expanded={!!position} onMouseEnter={e => show(e.currentTarget)} onFocus={e => show(e.currentTarget)}
      onClick={e => show(e.currentTarget)} onBlur={() => setPosition(null)} onKeyDown={e => { if (e.key === 'Escape') setPosition(null); }}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">
      <span aria-hidden="true">ⓘ</span>
    </button>
    {position ? createPortal(<span id={id} role="tooltip" style={position} className="fixed z-50 w-72 max-w-[calc(100vw-24px)] rounded-lg border border-slate-200 bg-white p-3 text-left text-sm font-normal text-slate-700 shadow-lg">{explanation}</span>, document.body) : null}
  </span>;
}

function EstimateValue({ estimate }: { estimate: Estimate }) {
  if (!estimate.n || estimate.rate == null) return <span>Not measured{estimate.unknown > 0 ? ` · ${estimate.unknown} unknown` : ''}</span>;
  return <span><strong>{Math.round(estimate.rate * 100)}%</strong> · {estimate.positive}/{estimate.n}
    {estimate.ci95 ? <span className="block text-xs text-slate-500">95% interval {Math.round(estimate.ci95[0] * 100)}–{Math.round(estimate.ci95[1] * 100)}%</span> : null}
    {estimate.unknown > 0 ? <span className="block text-xs text-slate-500">{estimate.unknown} unknown, excluded</span> : null}
  </span>;
}

const tierLabels = { branded: 'When shoppers name you', unbranded: 'When shoppers ask about the category', dupe: 'When shoppers ask for alternatives' };
const stageLabels: Record<string, string> = { get_selected: 'Get selected', get_cited: 'Get cited', convert_sales: 'Convert sales' };

export function isRecoveryCompatible(value: unknown): value is Recovery {
  const data = value as Recovery | null;
  const selection = data?.selection;
  const validEstimate = (e: Estimate | undefined) => !!e &&
    Number.isFinite(e.n) && e.n >= 0 && Number.isFinite(e.positive) &&
    Number.isFinite(e.unknown) && (e.rate === null || Number.isFinite(e.rate)) &&
    (e.ci95 === null || (Array.isArray(e.ci95) && e.ci95.length === 2 && e.ci95.every(Number.isFinite)));
  return !!selection?.tiers && Object.keys(tierLabels).every(key => {
    const tier = selection.tiers[key];
    return !!tier && validEstimate(tier.brand_mentioned) && validEstimate(tier.source_visible);
  }) && Array.isArray(data?.stages) && data.stages.every(stage => stage && Array.isArray(stage.findings)) &&
    Array.isArray(data?.headline?.dimensions) &&
    (!data.selection_gap || (Array.isArray(data.selection_gap.gaps) &&
      Array.isArray(data.selection_gap.won_queries) && Array.isArray(data.selection_gap.lost_queries_without_product) &&
      !!data.selection_gap.counts));
}

// Saved projections can still carry conclusions derived only from score bands.
// Neutralize that specific legacy contract without rewriting unrelated findings.
export function recoveryFindingSummary(finding: { type: string; summary: string }): string {
  const dimensions: Record<string, string> = {
    product_identity_unresolvable: 'Identity',
    category_citation_weak: 'Citation',
    content_too_thin_to_cite: 'Content',
  };
  const label = dimensions[finding.type];
  if (label && new RegExp(`^${label}: (Not yet visible|Needs work|Ready|Agent.ready)`).test(finding.summary)) {
    return `${label}: diagnostic checks need review.`;
  }
  if (label) {
    const score = finding.summary.match(new RegExp(`^${label}: diagnostic score (\\d+(?:\\.\\d+)?)/100\\.`));
    if (score && finding.summary.slice(score[0].length).trim() === 'This score does not establish verified AI identification, mention, or recommendation. Review the underlying evidence before changing the product page.') return `${label}: ${score[1]}/100 · diagnostic score`;
  }
  return finding.summary;
}

export function RecoveryView({ data }: { data: Recovery }) {
  // A successful HTTP response can still carry an older projection contract.
  // Keep the saved action workspace usable during mixed-version rollouts.
  if (!isRecoveryCompatible(data)) return <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">New recovery metrics are not available for this saved report. Your existing report and actions remain below.</p>;
  return <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-6" aria-label="Revenue recovery">
    <header><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Revenue recovery</p>
      <h2 className="mt-1 text-xl font-semibold">Where AI finds you — and where you can grow</h2>
      <p className="mt-2 text-sm text-slate-600">See where your brand appears in AI answers and their sources.</p></header>
    {data.selection.unavailable_reason ? <p className="rounded-lg bg-amber-50 p-3 text-sm">{data.selection.unavailable_reason} Older reports cannot establish a response-level mention rate.</p> : null}
    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b"><th className="p-2">Shopper question</th><th className="p-2"><MetricLabel label="Your brand mentioned" explanation="The share of measured answers that name your brand. For example, 2/2 means both answers mention it. A mention can be a comparison or criticism; it does not necessarily recommend your product." /></th><th className="p-2"><MetricLabel label="Sources mentioning you" explanation="The share of measured answers with at least one cited source that matches your website or names your brand in its title or label. For example, 1/2 means one of two answers has a matching source. Retailer and review sources can count too; this does not mean the full source page was checked." /></th><th className="p-2"><MetricLabel label="Answers checked" explanation="How many AI responses we attempted to collect for this question group. Each percentage uses its own measured-answer count. Failed or unknown responses are shown separately and excluded." /></th></tr></thead><tbody>
      {Object.entries(tierLabels).map(([tier, label]) => { const t = data.selection.tiers[tier]; return t ? <tr key={tier} className="border-b align-top"><th className="p-2 font-medium">{label}</th><td className="p-2"><EstimateValue estimate={t.brand_mentioned} /></td><td className="p-2"><EstimateValue estimate={t.source_visible} /></td><td className="p-2">{data.selection.unavailable_reason ? 'Not retained' : `${t.attempted} attempted`}{t.provider_failed > 0 ? <span className="block text-amber-700">{t.provider_failed} failed, excluded</span> : null}</td></tr> : null; })}
    </tbody></table></div>
    <details className="text-sm text-slate-600"><summary className="cursor-pointer font-medium">How to read these results</summary>
      <div className="mt-2 space-y-2"><p>{data.selection.limitation}</p>
      <p>Readiness scores describe diagnostic checks, not verified brand mentions, product recommendations or sales. Use the answer evidence and action plan to decide what to investigate next.</p>
      {data.selection.unclassified > 0 ? <p>{data.selection.unclassified} responses have an unknown question type and are excluded from the three groups.</p> : null}
      {data.stages.filter(stage => stage.unverified_reason).map(stage => <p key={stage.stage}>{stageLabels[stage.stage] || stage.stage}: {stage.unverified_reason}</p>)}
      </div></details>
    {data.selection.mixed_execution_providers?.length ? <p className="text-sm text-amber-800">Different search settings were retained for the same AI provider. Its answer-mention rate is unmeasured because these conditions cannot be combined.</p> : null}
    {Array.isArray(data.selection.answers) && data.selection.answers.length > 0 ? <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">Consumer answer evidence · {data.selection.answers.length}</summary>
      <p className="mt-2 text-sm text-slate-500">These responses use the shopper question without adding your brand or product context. Only completed answers with verifiable citations contribute to the answer-mention rate. Other responses remain unmeasured.</p>
      {data.selection.answers.filter(a => a && typeof a.query === 'string').map((a, i) => <details key={`${a.observation_id}-${i}`} className="mt-3 border-t pt-3">
        <summary className="cursor-pointer text-sm">{a.query} · {typeof a.provider === 'string' ? a.provider : 'Unknown provider'} · {typeof a.brand_mentioned !== 'boolean' ? 'Not measured' : a.brand_mentioned ? 'Brand mentioned' : 'Brand not mentioned'}</summary>
        {typeof a.brand_mentioned !== 'boolean' ? <p className="mt-2 text-sm text-amber-800">{a.unknown_reason === 'answer_sources_missing' ? 'This response has no verifiable citations, so it cannot establish whether your brand was selected.' : 'This response could not be verified as a completed, cited answer. It is excluded from the rate.'}</p> : null}
        <p className="mt-2 text-xs text-slate-500">{a.prompt_contract === 'consumer_query_openai_web_required_v2' ? 'Web search required · separate measurement conditions from automatic search' : 'Legacy or automatic search conditions'}</p>
        <p className="mt-2 text-xs text-slate-500">{typeof a.evidence?.model === 'string' ? a.evidence.model : 'Model not retained'}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">{typeof a.evidence?.text === 'string' ? a.evidence.text : 'Answer text was not retained.'}</p>
        {Array.isArray(a.cited_sources) && a.cited_sources.length > 0 ? <ul className="mt-2 space-y-1 text-xs" aria-label="Cited sources">{a.cited_sources.filter(source => source && sourceLink(source)).map((source, index) => <li key={index}><a className="underline" href={sourceLink(source)!} target="_blank" rel="noopener noreferrer">{typeof source.title === 'string' && source.title ? source.title : sourceLink(source)}</a></li>)}</ul> : null}
      </details>)}
    </details> : null}
    <div className="grid gap-3 md:grid-cols-3">{data.stages.map(stage => <div key={stage.stage} className="rounded-lg bg-slate-50 p-4"><h3 className="font-semibold">{stageLabels[stage.stage] || stage.stage}</h3><p className="mt-1 text-sm">{stage.status === 'UNVERIFIED' ? 'Not verified' : stage.status === 'NO_FINDINGS' ? 'No findings in the available checks' : 'Findings available'}</p><ul className="mt-2 space-y-2 text-sm">{stage.findings.map((finding, i) => <li key={`${finding.type}-${i}`}>{recoveryFindingSummary(finding)}</li>)}</ul></div>)}</div>
    {data.actions_locked ? <p className="text-sm">Your query action plan is available on a paid plan.</p> : data.selection_gap ? <div className="grid gap-5 md:grid-cols-2">
      <div><h3 className="font-semibold">Queries to win · {data.selection_gap.counts.lost_queries}</h3><ul className="mt-2 space-y-3">{data.selection_gap.gaps.map(q => <li key={q.query} className="text-sm"><strong>“{q.query}”</strong><p className="text-slate-500">Products matching this query: {q.matched_products?.map(p => p.title || p.product_key).join(', ')}</p></li>)}</ul>{data.selection_gap.lost_queries_without_product.length > 0 ? <details open={data.selection_gap.gaps.length === 0} className="mt-3 text-sm"><summary>Queries without a confident product match · {data.selection_gap.lost_queries_without_product.length}</summary><p className="my-2 text-slate-500">These queries lack a confident product match in this report. Review the existing action plan below before choosing a product to improve.</p><ul>{data.selection_gap.lost_queries_without_product.map(q => <li key={q.query}>{q.query}</li>)}</ul></details> : null}</div>
      <div><h3 className="font-semibold">Queries with product citations · {data.selection_gap.counts.won_queries}</h3><ul className="mt-2 space-y-2 text-sm">{data.selection_gap.won_queries.map(q => <li key={q.query}>“{q.query}”</li>)}</ul><p className="mt-2 text-xs text-slate-500">Query lists use the report’s product-citation evidence. They are not the answer-mention rate above. Long lists may be truncated.</p></div>
    </div> : <p className="text-sm text-slate-500">This report has no catalog-matched query plan. Missing evidence is not a clean bill of health.</p>}
    <details><summary className="cursor-pointer text-sm font-medium">Readiness diagnostics</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{data.headline.dimensions.map(d => <div key={d.dimension} className="text-sm"><strong>{d.label}</strong> · {d.band_label || 'Not measured'}<p className="text-slate-500">Median {d.median ?? '—'} · middle 50% {d.p25 ?? '—'}–{d.p75 ?? '—'} · {d.n ?? 'unknown'} products</p></div>)}</div>{data.catalog_available === false ? <p className="mt-3 text-sm text-slate-500">Catalog routing is not measured for URL-only audits.</p> : null}</details>
  </section>;
}

export function RevenueRecovery({ runId }: { runId?: string | null }) {
  const [state, setState] = useState<{ id: string; data?: Recovery; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    apiClient.getRevenueRecovery(runId).then(data => {
      if (!cancelled) setState({ id: runId, data });
    }).catch(() => { if (!cancelled) setState({ id: runId, error: 'The recovery view is unavailable. Your saved diagnostics remain below.' }); });
    return () => { cancelled = true; };
  }, [runId, retry]);
  if (!runId) return null;
  if (state?.id !== runId) return <p className="text-sm text-slate-500" role="status">Loading recovery evidence…</p>;
  if (state.data) return <RecoveryView data={state.data} />;
  return <p className="text-sm text-amber-800">{state.error} <button className="underline" onClick={() => { setState(null); setRetry(r => r + 1); }}>Retry</button></p>;
}
