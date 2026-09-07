'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

type Estimate = { positive: number; n: number; rate: number | null; ci95: [number, number] | null; unknown: number };
type Tier = { attempted: number; provider_failed: number; brand_mentioned: Estimate; source_visible: Estimate };
type Query = { query: string; matched_products?: { title?: string; product_key?: string }[] };
export type Recovery = {
  builder_version: string;
  selection: { observations: number; tiers: Record<string, Tier>; unclassified: number; unavailable_reason?: string; limitation: string };
  selection_gap?: { gaps: Query[]; won_queries: Query[]; lost_queries_without_product: Query[]; counts: { lost_queries: number; won_queries: number } } | null;
  stages: { stage: string; status: string; unverified_reason?: string; findings: { type: string; summary: string }[] }[];
  headline: { dimensions: { dimension: string; label: string; band_label?: string; n?: number; median?: number; p25?: number; p75?: number }[] };
  actions_locked?: boolean;
  catalog_available?: boolean;
};

function EstimateValue({ estimate }: { estimate: Estimate }) {
  if (!estimate.n || estimate.rate == null) return <span>Not measured{estimate.unknown > 0 ? ` · ${estimate.unknown} unknown` : ''}</span>;
  return <span><strong>{Math.round(estimate.rate * 100)}%</strong> · {estimate.positive}/{estimate.n}
    {estimate.ci95 ? <span className="block text-xs text-slate-500">95% interval {Math.round(estimate.ci95[0] * 100)}–{Math.round(estimate.ci95[1] * 100)}%</span> : null}
    {estimate.unknown > 0 ? <span className="block text-xs text-slate-500">{estimate.unknown} unknown, excluded</span> : null}
  </span>;
}

const tierLabels = { branded: 'When shoppers name you', unbranded: 'When shoppers ask about the category', dupe: 'When shoppers ask for alternatives' };
const stageLabels: Record<string, string> = { get_selected: 'Get selected', get_cited: 'Get cited', convert_sales: 'Convert sales' };

export function RecoveryView({ data }: { data: Recovery }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-6" aria-label="Revenue recovery">
    <header><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Revenue recovery</p>
      <h2 className="mt-1 text-xl font-semibold">Where AI finds you — and where you can grow</h2>
      <p className="mt-2 text-sm text-slate-600">Each observation is one product, question and AI response. Answer mentions and cited-source visibility measure different things.</p></header>
    {data.selection.unavailable_reason ? <p className="rounded-lg bg-amber-50 p-3 text-sm">{data.selection.unavailable_reason} Older reports cannot establish a response-level mention rate.</p> : null}
    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b"><th className="p-2">Shopper question</th><th className="p-2">Brand mentioned in answer</th><th className="p-2">Brand in cited sources</th><th className="p-2">Responses</th></tr></thead><tbody>
      {Object.entries(tierLabels).map(([tier, label]) => { const t = data.selection.tiers[tier]; return t ? <tr key={tier} className="border-b align-top"><th className="p-2 font-medium">{label}</th><td className="p-2"><EstimateValue estimate={t.brand_mentioned} /></td><td className="p-2"><EstimateValue estimate={t.source_visible} /></td><td className="p-2">{data.selection.unavailable_reason ? 'Not retained' : `${t.attempted} attempted`}{t.provider_failed > 0 ? <span className="block text-amber-700">{t.provider_failed} failed, excluded</span> : null}</td></tr> : null; })}
    </tbody></table></div>
    <p className="text-xs text-slate-500">{data.selection.limitation}{data.selection.unclassified > 0 ? ` ${data.selection.unclassified} responses have an unknown question type and are excluded from the three groups.` : ''}</p>
    <div className="grid gap-3 md:grid-cols-3">{data.stages.map(stage => <div key={stage.stage} className="rounded-lg bg-slate-50 p-4"><h3 className="font-semibold">{stageLabels[stage.stage] || stage.stage}</h3><p className="mt-1 text-sm">{stage.status === 'UNVERIFIED' ? 'Not verified' : stage.status === 'NO_FINDINGS' ? 'No findings in the available checks' : 'Findings available'}</p>{stage.unverified_reason ? <p className="mt-2 text-xs text-slate-500">{stage.unverified_reason}</p> : null}<ul className="mt-2 space-y-2 text-sm">{stage.findings.map((finding, i) => <li key={`${finding.type}-${i}`}>{finding.summary}</li>)}</ul></div>)}</div>
    {data.actions_locked ? <p className="text-sm">Your query action plan is available on a paid plan.</p> : data.selection_gap ? <div className="grid gap-5 md:grid-cols-2">
      <div><h3 className="font-semibold">Queries to win · {data.selection_gap.counts.lost_queries}</h3><ul className="mt-2 space-y-3">{data.selection_gap.gaps.map(q => <li key={q.query} className="text-sm"><strong>“{q.query}”</strong><p className="text-slate-500">Products matching this query: {q.matched_products?.map(p => p.title || p.product_key).join(', ')}</p></li>)}</ul>{data.selection_gap.lost_queries_without_product.length > 0 ? <details className="mt-3 text-sm"><summary>Queries without a confident product match</summary><ul>{data.selection_gap.lost_queries_without_product.map(q => <li key={q.query}>{q.query}</li>)}</ul></details> : null}</div>
      <div><h3 className="font-semibold">Queries already won · {data.selection_gap.counts.won_queries}</h3><ul className="mt-2 space-y-2 text-sm">{data.selection_gap.won_queries.map(q => <li key={q.query}>“{q.query}”</li>)}</ul><p className="mt-2 text-xs text-slate-500">Query lists use the report’s product-citation evidence. They are not the answer-mention rate above. Long lists may be truncated.</p></div>
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
