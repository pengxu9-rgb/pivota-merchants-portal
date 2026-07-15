'use client';

/**
 * Compact list of measured prompt-evidence rows — the probes an action's
 * prescription actually consumed (contract 1.1: niche-first, spec-matched
 * losses lead; broad head terms only appear when they're all that was
 * measured). Shared by the Start-here panel's per-action disclosures.
 */

import type { ReportSummaryPromptEvidence } from '@/lib/types/ai-readiness';

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  openai: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
};

const SPEC_MATCHED_SOURCES = new Set(['llm_winnable', 'llm_scenario']);

export function PromptEvidenceList({
  prompts,
}: {
  prompts: ReportSummaryPromptEvidence[];
}) {
  const rows = (prompts || []).filter((p) => p && p.query);
  if (rows.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {rows.map((p, i) => (
        <li
          key={i}
          className="rounded-md border border-[color:var(--merchant-line)] bg-white/60 px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium">&ldquo;{p.query}&rdquo;</span>
            {p.provider ? (
              <span className="rounded-full border border-[color:var(--merchant-line)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-60">
                {PROVIDER_LABELS[p.provider.toLowerCase()] || p.provider}
              </span>
            ) : null}
            {p.prompt_source && SPEC_MATCHED_SOURCES.has(p.prompt_source) ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                Spec-matched
              </span>
            ) : null}
          </div>
          {p.reason ? (
            <p className="merchant-text-muted mt-1 text-[11px] leading-snug">{p.reason}</p>
          ) : null}
          {p.competitors_named && p.competitors_named.length > 0 ? (
            <p className="mt-1 text-[11px] leading-snug">
              <span className="merchant-text-muted">Named instead: </span>
              {p.competitors_named.join(', ')}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
