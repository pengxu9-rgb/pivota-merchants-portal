'use client';

/**
 * Report Summary Contract v1 — the condensed "3-page" first view of an audit:
 *   Page 1  Your score + the one-sentence verdict (with run-over-run delta)
 *   Page 2  What we found (top findings + who AI cites instead)
 *   Page 3  What to do next (top actions, each with its measured AI answers
 *           collapsed behind a disclosure)
 *
 * Everything here renders the backend's `report_summary` VERBATIM — prose is
 * authored by the narrative layer, the 0–10 display score is backend-computed,
 * and an action's supporting prompts only render when the backend stamped a
 * real evidence join (basis ≠ 'none'). The full report stays available below
 * this view; this is the read-first layer, not a replacement.
 */

import { useState } from 'react';
import { ArrowRight, Download, Gauge, ListChecks, Loader2, Search } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { StatusBadge, SurfaceCard } from '@/components/ui/merchant-primitives';
import { Disclosure } from '@/components/ui/Disclosure';
import {
  actionSupportingPrompts,
  bandLabel,
  bandTone,
  formatDisplayDelta,
  formatDisplayScore,
  measuredSubscores,
  SUBSCORE_LABEL,
} from '@/lib/audit/reportSummary';
import type {
  ReportSummary,
  ReportSummaryFinding,
  ReportSummaryPromptEvidence,
} from '@/lib/types/ai-readiness';

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  openai: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
};

function providerLabel(p: string | null | undefined): string | null {
  if (!p) return null;
  return PROVIDER_LABELS[p.toLowerCase()] || p;
}

function severityDotClass(severity: string | null | undefined): string {
  switch (severity) {
    case 'high':
      return 'bg-red-500';
    case 'medium':
      return 'bg-amber-500';
    default:
      return 'bg-slate-400';
  }
}

function PromptEvidenceRow({ prompt }: { prompt: ReportSummaryPromptEvidence }) {
  const provider = providerLabel(prompt.provider);
  return (
    <li className="rounded-md border border-[color:var(--merchant-line)] bg-white/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium">&ldquo;{prompt.query}&rdquo;</span>
        {provider ? (
          <span className="rounded-full border border-[color:var(--merchant-line)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-60">
            {provider}
          </span>
        ) : null}
        {prompt.axis ? (
          <span className="rounded-full border border-[color:var(--merchant-line)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-60">
            {prompt.axis.replace(/_/g, ' ')}
          </span>
        ) : null}
      </div>
      {prompt.reason ? (
        <p className="merchant-text-muted mt-1 text-[11px] leading-snug">
          {prompt.reason}
        </p>
      ) : null}
      {prompt.competitors_named && prompt.competitors_named.length > 0 ? (
        <p className="mt-1 text-[11px] leading-snug">
          <span className="merchant-text-muted">Named instead: </span>
          {prompt.competitors_named.join(', ')}
        </p>
      ) : null}
    </li>
  );
}

function FindingRow({ finding }: { finding: ReportSummaryFinding }) {
  if (!finding.evidence_summary && !finding.title) return null;
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDotClass(finding.severity)}`}
        aria-hidden
      />
      <div className="min-w-0">
        {finding.title ? (
          <div className="text-sm font-medium leading-snug">{finding.title}</div>
        ) : null}
        {finding.evidence_summary ? (
          <p className="merchant-text-muted mt-0.5 text-xs leading-relaxed">
            {finding.evidence_summary}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function ExportDeckButton({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportDeck() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { blob } = await apiClient.exportReportDeck(runId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pivota-ai-readiness-${runId}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setError(
        status === 402
          ? 'Not enough credits — top up or upgrade on the Billing page.'
          : "Couldn't export the deck right now — try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={exportDeck}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--merchant-line)] px-2.5 py-1.5 text-xs font-semibold transition hover:border-[color:var(--merchant-accent,#6366f1)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {busy ? 'Exporting…' : 'Export deck (PPT)'}
      </button>
      {error ? <p className="max-w-56 text-right text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}

export function ReportSummaryView({
  summary,
  runId,
}: {
  summary: ReportSummary;
  /** Enables the PPT export button (free tier gets a watermarked preview
   *  slide; paid tier gets the full deck, credits billed by the backend). */
  runId?: string | null;
}) {
  const score = summary.score ?? {};
  const display = formatDisplayScore(score.display);
  const label = bandLabel(score.band);
  const delta = formatDisplayDelta(score.delta?.raw);
  const subscores = measuredSubscores(score);
  const findings = (summary.top_findings ?? []).filter(
    (f) => f && (f.title || f.evidence_summary),
  );
  const actions = (summary.top_actions ?? []).filter((a) => a && a.headline);
  const snapshot = summary.competitive_snapshot;
  const limits = summary.meta?.honest_limits ?? [];

  return (
    <div className="space-y-4">
      {/* Page 1 — score + verdict. */}
      <SurfaceCard
        eyebrow="Your AI-readiness"
        strong
        action={runId ? <ExportDeckButton runId={runId} /> : undefined}
      >
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-baseline gap-1">
              <Gauge className="mr-1 h-5 w-5 self-center opacity-50" aria-hidden />
              <span className="text-3xl font-bold tabular-nums">
                {display ?? '—'}
              </span>
              <span className="merchant-text-muted text-sm">
                / {score.scale_max ?? 10}
              </span>
            </div>
            {label ? <StatusBadge tone={bandTone(score.band)}>{label}</StatusBadge> : null}
            {delta ? (
              <span className="merchant-text-muted text-xs">
                {delta} since your last audit
                {typeof score.delta?.days_since_last_audit === 'number'
                  ? ` (${score.delta.days_since_last_audit} days ago)`
                  : ''}
              </span>
            ) : null}
          </div>
          {summary.verdict?.headline ? (
            <p className="text-sm font-medium leading-relaxed">
              {summary.verdict.headline}
            </p>
          ) : null}
          {summary.verdict?.explanation ? (
            <p className="merchant-text-muted text-xs leading-relaxed">
              {summary.verdict.explanation}
            </p>
          ) : null}
          {subscores.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {subscores.map((s) => (
                <span
                  key={s.key}
                  className="inline-flex items-center gap-1 rounded-md border border-[color:var(--merchant-line)] px-2 py-1 text-xs"
                >
                  <span className="merchant-text-muted">
                    {SUBSCORE_LABEL[s.key] ?? s.key}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatDisplayScore(s.display)}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      {/* Page 2 — what we found. */}
      {findings.length > 0 || snapshot?.available ? (
        <SurfaceCard eyebrow="What we found" title="The headline findings">
          <div className="space-y-3 px-5 py-4">
            {findings.length > 0 ? (
              <ul className="space-y-2.5">
                {findings.map((f, i) => (
                  <FindingRow key={f.finding_id ?? i} finding={f} />
                ))}
              </ul>
            ) : null}
            {snapshot?.available &&
            ((snapshot.top_cited_hosts?.length ?? 0) > 0 ||
              (snapshot.competitors_named?.length ?? 0) > 0) ? (
              <div className="rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wide opacity-70">
                  <Search className="h-3.5 w-3.5" /> Who AI cites instead
                </div>
                {snapshot.top_cited_hosts && snapshot.top_cited_hosts.length > 0 ? (
                  <p className="mt-1">
                    <span className="merchant-text-muted">Sources: </span>
                    {snapshot.top_cited_hosts.join(', ')}
                  </p>
                ) : null}
                {snapshot.competitors_named && snapshot.competitors_named.length > 0 ? (
                  <p className="mt-0.5">
                    <span className="merchant-text-muted">Competitors named: </span>
                    {snapshot.competitors_named.join(', ')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </SurfaceCard>
      ) : null}

      {/* Page 3 — what to do next, evidence collapsed per action. */}
      {actions.length > 0 ? (
        <SurfaceCard eyebrow="What to do next" title="Your highest-impact moves">
          <ol className="space-y-4 px-5 py-4">
            {actions.map((a, i) => {
              const prompts = actionSupportingPrompts(a);
              return (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-snug">{a.headline}</div>
                    {a.sku_title ? (
                      <div className="mt-0.5 truncate text-[11px] opacity-55">
                        {a.sku_title}
                      </div>
                    ) : null}
                    {a.first_move ? (
                      <div className="mt-1 flex items-start gap-1 text-xs">
                        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
                        <span>{a.first_move}</span>
                      </div>
                    ) : null}
                    {a.why_this_first ? (
                      <p className="merchant-text-muted mt-0.5 text-[11px] leading-snug">
                        {a.why_this_first}
                      </p>
                    ) : null}
                    {prompts.length > 0 ? (
                      <Disclosure
                        className="mt-1.5"
                        label="Why this — see the AI answers we measured"
                        labelOpen="Hide the measured answers"
                      >
                        <ul className="space-y-1.5">
                          {prompts.map((p, j) => (
                            <PromptEvidenceRow key={j} prompt={p} />
                          ))}
                        </ul>
                      </Disclosure>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </SurfaceCard>
      ) : null}

      {/* Coverage + honesty footer — the same disclosures the full report makes. */}
      {limits.length > 0 || summary.generated_at ? (
        <div className="px-1">
          <Disclosure label="How we measured this" labelOpen="How we measured this">
            <ul className="space-y-1">
              {limits.map((lim, i) => (
                <li key={i} className="merchant-text-muted flex items-start gap-2 text-[11px]">
                  <ListChecks className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
                  <span>{lim}</span>
                </li>
              ))}
              {summary.generated_at ? (
                <li className="merchant-text-muted text-[11px]">
                  Data as of {summary.generated_at}
                  {typeof summary.meta?.products_audited === 'number'
                    ? ` · ${summary.meta.products_audited} product${
                        summary.meta.products_audited === 1 ? '' : 's'
                      } audited`
                    : ''}
                </li>
              ) : null}
            </ul>
          </Disclosure>
        </div>
      ) : null}
    </div>
  );
}
