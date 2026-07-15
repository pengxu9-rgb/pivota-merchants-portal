'use client';

/**
 * The ONE new element of the re-layout (partner feedback: don't build a new
 * header — reorganize the report): a thin verdict strip. Headline 0-10 score
 * + band + run-over-run delta + subscores, with the deck export on the right.
 * Everything reads verbatim from the backend's report_summary contract; when
 * the run predates the contract the strip simply doesn't render.
 */

import { Gauge } from 'lucide-react';
import { StatusBadge } from '@/components/ui/merchant-primitives';
import { ExportDeckButton } from '@/components/audit/ExportDeckButton';
import {
  bandLabel,
  bandTone,
  formatDisplayDelta,
  formatDisplayScore,
  measuredSubscores,
  SUBSCORE_LABEL,
} from '@/lib/audit/reportSummary';
import type { ReportSummary } from '@/lib/types/ai-readiness';

export function AuditScoreStrip({
  summary,
  runId,
}: {
  summary: ReportSummary;
  runId?: string | null;
}) {
  const score = summary.score ?? {};
  const display = formatDisplayScore(score.display);
  const label = bandLabel(score.band);
  const delta = formatDisplayDelta(score.delta?.raw);
  const subscores = measuredSubscores(score);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--merchant-line)] px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-1">
          <Gauge className="mr-1 h-5 w-5 self-center opacity-50" aria-hidden />
          <span className="text-3xl font-bold tabular-nums">{display ?? '—'}</span>
          <span className="merchant-text-muted text-sm">/ {score.scale_max ?? 10}</span>
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
        {subscores.length > 0 ? (
          <span className="merchant-text-muted text-xs">
            {subscores
              .map(
                (s) =>
                  `${SUBSCORE_LABEL[s.key] ?? s.key} ${formatDisplayScore(s.display) ?? '—'}`,
              )
              .join(' · ')}
          </span>
        ) : null}
      </div>
      {runId ? <ExportDeckButton runId={runId} /> : null}
    </div>
  );
}
