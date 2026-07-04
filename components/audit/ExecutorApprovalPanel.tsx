'use client';

/**
 * W5 P7 — per-merchant executor consent, review lane.
 *
 * When the merchant has turned OFF `executor_auto_execute` (Settings → AI
 * actions), executor runs that would otherwise auto-run park in a pending queue.
 * This panel surfaces that queue on the audit report and lets the merchant
 * Approve / Decline each one.
 *
 * Honest by construction:
 *   - Renders nothing when auto-execute is ON (there's nothing to approve) or
 *     when there are no pending runs — it's purely additive.
 *   - `expired` runs can no longer be actioned, so their buttons are disabled
 *     and the row is greyed.
 *   - Approve/Decline are idempotent (200). A 409 means the run expired/conflicted
 *     between load and click; a 404 means it's already gone — both are handled
 *     without a scary error.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, Loader2, ShieldQuestion, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { PendingExecutorRun } from '@/lib/types/ai-readiness';

type RowState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'approved' }
  | { kind: 'declined' }
  | { kind: 'expired' }
  | { kind: 'gone' }
  | { kind: 'error'; message: string };

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

export function ExecutorApprovalPanel({ auditRunId }: { auditRunId?: string | null }) {
  const [autoExecute, setAutoExecute] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<PendingExecutorRun[]>([]);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prefs = await apiClient.getSettingsPreferences();
      const auto = prefs?.executor_auto_execute ?? true;
      setAutoExecute(auto);
      if (auto) {
        setRuns([]);
        return;
      }
      const res = await apiClient.getPendingExecutorRuns(auditRunId);
      setRuns(res.runs);
      setRowStates({});
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Failed to load pending actions');
    } finally {
      setLoading(false);
    }
  }, [auditRunId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(run: PendingExecutorRun, decision: 'approve' | 'decline') {
    setRowStates((s) => ({ ...s, [run.run_id]: { kind: 'working' } }));
    try {
      if (decision === 'approve') {
        await apiClient.approveExecutorRun(run.run_id);
      } else {
        await apiClient.declineExecutorRun(run.run_id);
      }
      setRowStates((s) => ({
        ...s,
        [run.run_id]: { kind: decision === 'approve' ? 'approved' : 'declined' },
      }));
    } catch (e) {
      const status = httpStatus(e);
      if (status === 409) {
        setRowStates((s) => ({ ...s, [run.run_id]: { kind: 'expired' } }));
      } else if (status === 404) {
        setRowStates((s) => ({ ...s, [run.run_id]: { kind: 'gone' } }));
      } else {
        setRowStates((s) => ({
          ...s,
          [run.run_id]: {
            kind: 'error',
            message: 'Could not update this action. Please try again.',
          },
        }));
      }
    }
  }

  // Nothing to show: auto-execute on (unknown while loading), or no pending runs.
  if (loading) return null;
  if (autoExecute !== false) return null;
  if (runs.length === 0 && !error) return null;

  return (
    <section className="rounded border-2 border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
      <header className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-900">
        <ShieldQuestion className="h-4 w-4" />
        Actions waiting for your approval
      </header>
      <p className="text-xs text-slate-600">
        You&apos;ve chosen to review each action before it runs. Approve the ones you
        want Pivota to carry out, or decline the rest. You can switch to auto-run in{' '}
        <span className="font-medium">Settings → AI actions</span>.
      </p>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        {runs.map((run) => {
          const state: RowState =
            rowStates[run.run_id] ?? (run.expired ? { kind: 'expired' } : { kind: 'idle' });
          const isExpired = state.kind === 'expired';
          const isResolved =
            state.kind === 'approved' ||
            state.kind === 'declined' ||
            state.kind === 'gone';
          const working = state.kind === 'working';
          const disabled = working || isExpired || isResolved;
          const title =
            (run.title && run.title.trim()) ||
            (run.agent_name && run.agent_name.trim()) ||
            (run.kind && run.kind.trim()) ||
            'Recommended action';
          const subtitleParts = [run.kind, run.stage].filter(
            (p): p is string => typeof p === 'string' && p.trim().length > 0,
          );

          return (
            <div
              key={run.run_id}
              className={`rounded-md border px-3 py-2.5 ${
                isExpired || isResolved
                  ? 'border-slate-200 bg-slate-50 opacity-70'
                  : 'border-indigo-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{title}</div>
                  {subtitleParts.length > 0 ? (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {subtitleParts.join(' · ')}
                    </div>
                  ) : null}
                  {isExpired ? (
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
                      <Clock className="h-3 w-3" /> This action expired and can no longer
                      be run.
                    </div>
                  ) : null}
                  {state.kind === 'approved' ? (
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-green-700">
                      <Check className="h-3 w-3" /> Approved — Pivota will run this.
                    </div>
                  ) : null}
                  {state.kind === 'declined' ? (
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
                      <X className="h-3 w-3" /> Declined.
                    </div>
                  ) : null}
                  {state.kind === 'gone' ? (
                    <div className="mt-1 text-[11px] text-slate-500">
                      This action is no longer available.
                    </div>
                  ) : null}
                  {state.kind === 'error' ? (
                    <div className="mt-1 text-[11px] text-red-700">{state.message}</div>
                  ) : null}
                </div>

                {!isResolved && !isExpired ? (
                  <div className="flex flex-none items-center gap-1.5">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void act(run, 'approve')}
                      className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {working ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void act(run, 'decline')}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Decline
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
