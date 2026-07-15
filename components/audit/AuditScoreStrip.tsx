'use client';

/**
 * The ONE new element of the re-layout (partner feedback: don't build a new
 * header — reorganize the report): a thin verdict strip. Headline 0-10 score
 * + band + run-over-run delta + subscores, with the deck export on the right.
 * Everything reads verbatim from the backend's report_summary contract; when
 * the run predates the contract the strip simply doesn't render.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Gauge, Info } from 'lucide-react';
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

/** The score's info mark (user request): the "why is my score this number"
 * reason stays hidden behind a small ⓘ next to the score — hover shows a
 * native tooltip, click/keyboard toggles an accessible popover with the
 * backend-prewritten explainer (weakest measured dimension + what wasn't
 * counted and why). No explainer on the contract → no mark. */
function ScoreInfoMark({ explainer }: { explainer: string }) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={popId}
        aria-label="How this score is calculated"
        title={explainer}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full opacity-50 transition hover:opacity-100 focus-visible:opacity-100"
      >
        <Info className="h-4 w-4" />
      </button>
      <div
        id={popId}
        hidden={!open}
        role="note"
        className="absolute left-0 top-6 z-20 w-72 rounded-md border border-[color:var(--merchant-line)] bg-white px-3 py-2 text-xs leading-relaxed shadow-lg"
      >
        {explainer}
      </div>
    </span>
  );
}

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
        {score.explainer ? <ScoreInfoMark explainer={score.explainer} /> : null}
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
