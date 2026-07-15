'use client';

/**
 * Wave-2 A3: every probed prompt across all products in ONE filterable table
 * (the monitoring competitors' prompt-centric view; ours was buried per-SKU).
 * Pure client-side flatten of per_sku_reports[].opportunity.per_prompt —
 * includes the prompts you WON, not just losses. CSV export is client-side.
 */

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';

type Row = {
  query: string;
  sku: string;
  axis: string;
  specMatched: boolean;
  won: boolean;
  providers: Record<string, string>;
  competitors: string[];
};

function flatten(perSku: AgentCenterPerSkuReport[]): Row[] {
  const rows: Row[] = [];
  for (const r of perSku ?? []) {
    const perPrompt =
      (r as { opportunity?: { per_prompt?: Record<string, unknown>[] } })
        .opportunity?.per_prompt ?? [];
    for (const p of perPrompt) {
      const query = String((p as { query?: unknown }).query ?? '').trim();
      if (!query) continue;
      const summary = (p as { source_summary?: Record<string, unknown> })
        .source_summary ?? {};
      const won =
        Number(summary.merchant_cited_runs ?? 0) > 0 ||
        Number(summary.sku_cited_runs ?? 0) > 0;
      const src = String((p as { prompt_source?: unknown }).prompt_source ?? '');
      rows.push({
        query,
        sku: String(r.sku_title ?? r.sku_key ?? ''),
        axis: String((p as { axis?: unknown }).axis ?? ''),
        specMatched: src === 'llm_winnable' || src === 'llm_scenario',
        won,
        providers:
          ((p as { provider_verdicts?: Record<string, string> })
            .provider_verdicts as Record<string, string>) ?? {},
        competitors: (
          ((p as { competitors?: unknown[] }).competitors as unknown[]) ?? []
        ).map((c) => String(c)),
      });
    }
  }
  return rows;
}

function toCsv(rows: Row[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = 'query,product,axis,spec_matched,outcome,engines,competitors';
  return [
    head,
    ...rows.map((r) =>
      [
        esc(r.query),
        esc(r.sku),
        esc(r.axis),
        r.specMatched ? 'yes' : 'no',
        r.won ? 'cited' : 'not_cited',
        esc(
          Object.entries(r.providers)
            .map(([k, v]) => `${k}:${v}`)
            .join(' '),
        ),
        esc(r.competitors.join('; ')),
      ].join(','),
    ),
  ].join('\n');
}

export function PromptExplorer({
  perSku,
}: {
  perSku: AgentCenterPerSkuReport[];
}) {
  const all = useMemo(() => flatten(perSku), [perSku]);
  const [outcome, setOutcome] = useState<'all' | 'won' | 'lost'>('all');
  const [axis, setAxis] = useState('all');
  const [sku, setSku] = useState('all');

  if (all.length === 0) return null;
  const axes = Array.from(new Set(all.map((r) => r.axis).filter(Boolean)));
  const skus = Array.from(new Set(all.map((r) => r.sku).filter(Boolean)));
  const rows = all.filter(
    (r) =>
      (outcome === 'all' || (outcome === 'won') === r.won) &&
      (axis === 'all' || r.axis === axis) &&
      (sku === 'all' || r.sku === sku),
  );

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pivota-prompts.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const select =
    'rounded-md border border-[color:var(--merchant-line)] bg-white px-2 py-1 text-xs';
  return (
    <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
          Prompt explorer — every prompt we probed ({rows.length}/{all.length})
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className={select} aria-label="Filter by outcome">
            <option value="all">All outcomes</option>
            <option value="won">Cited</option>
            <option value="lost">Not cited</option>
          </select>
          <select value={axis} onChange={(e) => setAxis(e.target.value)} className={select} aria-label="Filter by prompt type">
            <option value="all">All types</option>
            {axes.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
          {skus.length > 1 ? (
            <select value={sku} onChange={(e) => setSku(e.target.value)} className={select} aria-label="Filter by product">
              <option value="all">All products</option>
              {skus.map((t) => (
                <option key={t} value={t}>{t.slice(0, 40)}</option>
              ))}
            </select>
          ) : null}
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1 rounded-md border border-[color:var(--merchant-line)] px-2 py-1 text-xs font-medium hover:border-[color:var(--merchant-accent,#6366f1)]">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-[color:var(--merchant-line)] text-[10px] uppercase tracking-wide opacity-60">
              <th className="py-1.5 pr-3">Prompt</th>
              <th className="py-1.5 pr-3">Outcome</th>
              <th className="py-1.5 pr-3">Engines</th>
              <th className="py-1.5 pr-3">Named instead</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-black/5 align-top">
                <td className="max-w-[280px] py-1.5 pr-3">
                  &ldquo;{r.query}&rdquo;
                  {r.specMatched ? (
                    <span className="ml-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                      Spec-matched
                    </span>
                  ) : null}
                  {skus.length > 1 && r.sku ? (
                    <div className="truncate text-[10px] opacity-50">{r.sku}</div>
                  ) : null}
                </td>
                <td className="py-1.5 pr-3">
                  {r.won ? (
                    <span className="font-medium text-emerald-700">Cited</span>
                  ) : (
                    <span className="text-red-700">Not cited</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">
                  {Object.entries(r.providers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ') || '—'}
                </td>
                <td className="max-w-[200px] py-1.5">
                  {r.competitors.slice(0, 4).join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
