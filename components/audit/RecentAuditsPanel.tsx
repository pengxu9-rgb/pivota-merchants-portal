'use client';

/**
 * Run history for the audit surfaces. Lists the merchant's recent runs
 * (`GET /api/audits?subject_type=…`) so they can re-open a past run without
 * re-running (and re-paying). Reused by both AI Readiness (per-SKU,
 * subject_type="merchant") and AI Visibility (URL wedge, "merchant_url"); the
 * parent's `onOpenRun` decides how to fetch + render the chosen run.
 *
 * Renders null when there's no history yet, so a first-time merchant sees a
 * clean "run your first audit" page.
 */

import { useEffect, useState } from 'react';
import { History, ChevronRight, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { AuditRunSummary } from '@/lib/types/ai-readiness';

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

function RunRow({
  run,
  active,
  loading,
  itemNoun,
  onOpen,
}: {
  run: AuditRunSummary;
  active: boolean;
  loading: boolean;
  itemNoun: string;
  onOpen: () => void;
}) {
  const done = !!run.completed_at;
  const verdict = run.verdict_labels?.[0];
  const n = run.product_keys?.length || 0;
  const subline =
    [n > 0 ? `${n} ${itemNoun}${n === 1 ? '' : 's'}` : null, verdict]
      .filter(Boolean)
      .join(' · ') || '—';
  return (
    <button
      type="button"
      onClick={done ? onOpen : undefined}
      disabled={!done}
      aria-current={active ? 'true' : undefined}
      className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition ${
        active
          ? 'border-indigo-300 bg-indigo-50'
          : 'border-slate-200 bg-white hover:border-slate-300'
      } ${done ? '' : 'cursor-default opacity-70'}`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800">{formatWhen(run.requested_at)}</div>
        <div className="truncate text-xs text-slate-500">{subline}</div>
      </div>
      {!done ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          {run.status || 'running'}
        </span>
      ) : loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600" />
      ) : (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-indigo-700">
          {active ? 'Viewing' : 'View'} <ChevronRight className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}

export function RecentAuditsPanel({
  onOpenRun,
  activeRunId,
  loadingRunId,
  reloadKey,
  subjectType,
  title = 'Past audits',
  itemNoun = 'product',
}: {
  onOpenRun: (runId: string) => void;
  activeRunId?: string | null;
  loadingRunId?: string | null;
  reloadKey?: number;
  /** Scope the list to one run kind ("merchant" | "merchant_url"). */
  subjectType?: string;
  title?: string;
  itemNoun?: string;
}) {
  const [runs, setRuns] = useState<AuditRunSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    apiClient
      .listAuditRuns(20, subjectType)
      .then((rows) => {
        if (!cancelled) setRuns(rows);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, subjectType]);

  // No history yet (and not an error) → render nothing, keep the page clean.
  if (runs !== null && runs.length === 0 && !error) return null;
  // A failed history fetch shouldn't push an empty card at the merchant either.
  if (error && (runs === null || runs.length === 0)) return null;

  const list = runs ?? [];
  const visible = expanded ? list : list.slice(0, 3);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <History className="h-4 w-4 text-slate-500" /> {title}
        </div>
        {list.length > 3 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-indigo-700 hover:underline"
          >
            {expanded ? 'Show fewer' : `Show all ${list.length}`}
          </button>
        ) : null}
      </div>

      {runs === null ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((run) =>
            run.run_id ? (
              <RunRow
                key={run.run_id}
                run={run}
                active={run.run_id === activeRunId}
                loading={run.run_id === loadingRunId}
                itemNoun={itemNoun}
                onOpen={() => onOpenRun(run.run_id as string)}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
