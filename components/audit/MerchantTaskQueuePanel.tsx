'use client';

/**
 * Merchant-portal task queue panel (P1.3).
 *
 * Reads from the backend's /api/merchant-center/tasks endpoint.
 * Same data the employee portal's TaskQueuePanel reads — but auth'd
 * as the merchant rather than as a BD employee.
 *
 * Reads `task.evidence_jsonb ?? task.evidence` to tolerate the P1.1
 * dual-key shim window. When Phase 2 cleanup ships, only
 * `evidence_jsonb` will be present; `??` continues to work.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  AlertTriangle,
  ListTodo,
  RefreshCw,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import type {
  MerchantTask,
  MerchantTaskSeverity,
  MerchantTaskStatus,
} from '@/lib/types/ai-readiness';


type StatusFilter = 'open' | 'all' | 'archive';

const STATUS_FILTERS: Record<StatusFilter, string | undefined> = {
  open: undefined,
  all: 'all',
  archive: 'done,dismissed,failed',
};


export function MerchantTaskQueuePanel() {
  const [filter, setFilter] = useState<StatusFilter>('open');
  const [tasks, setTasks] = useState<MerchantTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listMerchantTasks({
        statusFilter: STATUS_FILTERS[filter],
        limit: 100,
      });
      setTasks(res.tasks);
    } catch (e) {
      const msg =
        (e as { message?: string })?.message ?? 'Failed to load tasks';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = tasks.reduce<Record<MerchantTaskStatus, number>>(
    (acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    },
    { pending: 0, in_progress: 0, done: 0, dismissed: 0, failed: 0 },
  );

  return (
    <section className="rounded border-2 border-amber-200 bg-amber-50/40 p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 uppercase tracking-wide">
          <ListTodo className="h-4 w-4" />
          Your action queue
        </div>
        <div className="flex items-center gap-1.5">
          <FilterButton
            current={filter}
            value="open"
            label={`Open (${counts.pending + counts.in_progress})`}
            onClick={setFilter}
          />
          <FilterButton
            current={filter}
            value="all"
            label="All"
            onClick={setFilter}
          />
          <FilterButton
            current={filter}
            value="archive"
            label={`Done (${counts.done + counts.dismissed + counts.failed})`}
            onClick={setFilter}
          />
          <button
            onClick={() => void load()}
            disabled={loading}
            className="ml-1 inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <p className="text-xs text-slate-600">
        Tasks materialized from the audit&apos;s action ladder + from
        Pivota agents that produced work for your team. Status changes
        persist server-side and survive re-audit.
      </p>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
          {error}
        </div>
      ) : null}

      {loading && tasks.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tasks…
        </div>
      ) : null}

      {!loading && tasks.length === 0 && !error ? (
        <p className="text-xs text-slate-600">
          {filter === 'open'
            ? 'No open tasks. Either the audit found no action items, or your team has completed everything.'
            : 'No tasks in this view.'}
        </p>
      ) : null}

      {tasks.length > 0 ? (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <TaskRow key={task.task_id} task={task} onChanged={load} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}


function FilterButton({
  current, value, label, onClick,
}: {
  current: StatusFilter;
  value: StatusFilter;
  label: string;
  onClick: (v: StatusFilter) => void;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`rounded px-2 py-1 text-[11px] font-medium transition ${
        active
          ? 'bg-amber-600 text-white'
          : 'border border-amber-300 bg-white text-amber-800 hover:bg-amber-100'
      }`}
    >
      {label}
    </button>
  );
}


function TaskRow({
  task, onChanged,
}: {
  task: MerchantTask;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const [showDismiss, setShowDismiss] = useState(false);
  // P1.3 dual-key fallback: read evidence from either field.
  const evidence = task.evidence_jsonb ?? task.evidence ?? null;

  const sevTone = severityTone(task.severity);
  const isTerminal =
    task.status === 'done'
      || task.status === 'dismissed'
      || task.status === 'failed';

  const update = async (status: MerchantTaskStatus) => {
    if (status === 'dismissed') return;
    setBusy(status);
    try {
      await apiClient.updateMerchantTask(task.task_id, {
        status: status as 'pending' | 'in_progress' | 'done' | 'failed',
      });
      onChanged();
    } catch (e) {
      console.error('task update failed', e);
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async () => {
    if (!dismissReason.trim()) return;
    setBusy('dismissed');
    try {
      await apiClient.dismissMerchantTask(task.task_id, dismissReason.trim());
      onChanged();
      setShowDismiss(false);
    } catch (e) {
      console.error('task dismiss failed', e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className={`rounded border-2 ${sevTone.border} ${sevTone.bg} p-2.5`}>
      <div className="flex items-start gap-2">
        <StatusIcon status={task.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${sevTone.chip}`}>
              {task.severity}
            </span>
            {task.lever ? (
              <span className="text-[10px] uppercase text-slate-500">
                {task.lever.replace(/_/g, ' ')}
              </span>
            ) : null}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusChip(task.status)}`}
            >
              {task.status}
            </span>
            {task.assigned_to_agent ? (
              <span className="text-[10px] text-purple-700">
                from agent: {task.assigned_to_agent}
              </span>
            ) : null}
          </div>

          <div className="mt-1 text-sm font-semibold text-slate-900">
            {task.title}
          </div>

          {task.body ? (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[11px] text-slate-600 hover:underline"
            >
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          ) : null}

          {expanded && task.body ? (
            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
              {task.body}
            </p>
          ) : null}

          {expanded && evidence ? (
            <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-[10px] text-slate-700">
              {JSON.stringify(evidence, null, 2)}
            </pre>
          ) : null}

          {task.dismissed_reason ? (
            <p className="mt-1 text-xs italic text-slate-600">
              Dismissed: {task.dismissed_reason}
            </p>
          ) : null}

          {!isTerminal ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {task.status === 'pending' ? (
                <ActionBtn
                  label="Start"
                  onClick={() => update('in_progress')}
                  busy={busy === 'in_progress'}
                  tone="blue"
                />
              ) : null}
              <ActionBtn
                label="Mark done"
                onClick={() => update('done')}
                busy={busy === 'done'}
                tone="green"
              />
              <button
                onClick={() => setShowDismiss((v) => !v)}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
              >
                Dismiss…
              </button>
            </div>
          ) : null}

          {showDismiss && !isTerminal ? (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Reason (audit trail)"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                onClick={() => void dismiss()}
                disabled={!dismissReason.trim() || busy !== null}
                className="rounded bg-slate-700 px-2 py-1 text-[11px] text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy === 'dismissed' ? '…' : 'Dismiss'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}


function ActionBtn({
  label, onClick, busy, tone,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  tone: 'blue' | 'green' | 'red';
}) {
  const cls =
    tone === 'green'
      ? 'bg-green-600 hover:bg-green-700'
      : tone === 'red'
        ? 'bg-red-600 hover:bg-red-700'
        : 'bg-blue-600 hover:bg-blue-700';
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded px-2 py-0.5 text-[11px] text-white ${cls} disabled:opacity-50`}
    >
      {busy ? '…' : label}
    </button>
  );
}


function StatusIcon({ status }: { status: MerchantTaskStatus }) {
  if (status === 'done')
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />;
  if (status === 'in_progress')
    return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" />;
  if (status === 'failed')
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />;
  if (status === 'dismissed')
    return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />;
  return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
}


function severityTone(severity: MerchantTaskSeverity): {
  border: string;
  bg: string;
  chip: string;
} {
  if (severity === 'critical')
    return { border: 'border-red-300', bg: 'bg-red-50', chip: 'bg-red-200 text-red-900' };
  if (severity === 'high')
    return { border: 'border-orange-300', bg: 'bg-orange-50', chip: 'bg-orange-200 text-orange-900' };
  if (severity === 'medium')
    return { border: 'border-amber-200', bg: 'bg-white', chip: 'bg-amber-200 text-amber-900' };
  return { border: 'border-slate-200', bg: 'bg-white', chip: 'bg-slate-200 text-slate-700' };
}


function statusChip(status: MerchantTaskStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-200 text-amber-900';
    case 'in_progress':
      return 'bg-blue-200 text-blue-900';
    case 'done':
      return 'bg-green-200 text-green-900';
    case 'failed':
      return 'bg-red-200 text-red-900';
    case 'dismissed':
      return 'bg-slate-200 text-slate-700';
  }
}
