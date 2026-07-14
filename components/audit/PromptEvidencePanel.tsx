'use client';

/**
 * "See what AI actually answered" — the verbatim proof layer, folded in from the
 * retired hero SkuIntelligenceCard prompt matrix. Reads
 * report.opportunity.per_prompt[]: for each probed query it shows the per-engine
 * verdict, the VERBATIM cited_evidence.excerpt (the single richest, most-ignored
 * field — it literally shows what the AI said and who it recommended), and the
 * per-row substitution ("AI named X instead of you").
 *
 * Honest semantics: a "win" on a discovery query that was appearance_via_listing
 * is labelled "via your listing" (findability), not endorsement. Rows are
 * ordered to lead with the actionable discovery losses that carry an excerpt.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Quote, ArrowLeftRight } from 'lucide-react';
import type { AgentCenterPerSkuReport, SkuPerPromptRow } from '@/lib/types/ai-readiness';

const DISCOVERY_AXES = new Set(['category', 'category_head', 'problem_jtbd', 'constraint']);

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  openai: 'ChatGPT',
  claude: 'Claude',
};

function providerLabel(p?: string | null): string {
  if (!p) return '';
  return PROVIDER_LABELS[p.toLowerCase()] || p;
}

function isDiscovery(row: SkuPerPromptRow): boolean {
  return DISCOVERY_AXES.has((row.axis || '').toLowerCase());
}

function verdictTone(v: string): string {
  if (v === 'win') return 'text-emerald-700 border-emerald-200 bg-emerald-50';
  if (v === 'loss') return 'text-red-700 border-red-200 bg-red-50';
  return 'text-slate-500 border-[color:var(--merchant-line)]';
}

function VerdictChip({
  provider,
  verdict,
  viaListing,
}: {
  provider: string;
  verdict: string;
  viaListing?: boolean;
}) {
  const label = verdict === 'win' ? (viaListing ? 'listed' : 'appears') : verdict === 'loss' ? 'absent' : '—';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${verdictTone(
        verdict,
      )}`}
      title={
        verdict === 'win' && viaListing
          ? 'Found via your own/retail listing (findability), not an independent recommendation'
          : undefined
      }
    >
      <span>{providerLabel(provider)}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}

function Row({ row }: { row: SkuPerPromptRow }) {
  const verdicts = Object.entries(row.provider_verdicts || {}).filter(
    ([p]) => p.toLowerCase() !== 'deepseek',
  );
  const ev = row.cited_evidence;
  const sub = row.substitution;
  const hosts = ev?.cited_hosts && ev.cited_hosts.length > 0 ? ev.cited_hosts : null;
  return (
    <li className="border-t border-[color:var(--merchant-line)] py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-medium">&ldquo;{row.query}&rdquo;</span>
        {isDiscovery(row) ? (
          <span className="rounded bg-black/5 px-1 text-[10px] uppercase tracking-wide opacity-60">
            discovery
          </span>
        ) : null}
        <span className="ml-auto flex flex-wrap gap-1">
          {verdicts.map(([p, v]) => (
            <VerdictChip
              key={p}
              provider={p}
              verdict={String(v)}
              viaListing={row.appearance_via_listing}
            />
          ))}
        </span>
      </div>

      {ev?.excerpt ? (
        <div className="mt-1 flex gap-1.5 rounded bg-white/60 px-2 py-1.5 text-[11px] italic leading-snug opacity-80">
          <Quote className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
          <span>
            {ev.excerpt}
            {hosts ? (
              <span className="not-italic opacity-60">
                {' '}
                — citing {hosts.slice(0, 3).join(', ')}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {sub?.present && sub.substituted_by ? (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-red-700">
          <ArrowLeftRight className="h-3 w-3 shrink-0" />
          AI named <span className="font-semibold">{sub.substituted_by}</span> instead of you
          {sub.engines?.length ? (
            <span className="opacity-60"> ({sub.engines.join(', ')})</span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function rankRow(row: SkuPerPromptRow): number {
  // Lead with the actionable proof: discovery rows that carry a verbatim
  // excerpt, then any excerpt, then discovery, then the rest.
  let score = 0;
  if (isDiscovery(row)) score += 2;
  if (row.cited_evidence?.excerpt) score += 4;
  if (row.substitution?.present) score += 1;
  return -score;
}

export function PromptEvidencePanel({
  report,
  // Open by default: this IS the "see what AI answered" surface, and hiding the
  // verbatim answers behind a click defeated it (the header alone reads like a
  // summary line, so merchants never expanded it).
  defaultOpen = true,
}: {
  report: AgentCenterPerSkuReport;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rows = (report.opportunity?.per_prompt || []).filter(
    (r): r is SkuPerPromptRow => !!r && !!r.query,
  );
  if (rows.length === 0) return null;

  const withExcerpt = rows.filter((r) => r.cited_evidence?.excerpt).length;
  const ordered = [...rows].sort((a, b) => rankRow(a) - rankRow(b));

  return (
    <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
          <Quote className="h-3.5 w-3.5" />
          See what AI actually answered
          <span className="font-normal lowercase opacity-60">
            · {rows.length} prompt{rows.length === 1 ? '' : 's'}
            {withExcerpt > 0 ? `, ${withExcerpt} with the verbatim answer` : ''}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 opacity-60" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        )}
      </button>
      {open ? (
        <ul className="px-3 pb-2">
          {ordered.map((r, i) => (
            <Row key={`${r.normalized_query || r.query}-${i}`} row={r} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
