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
  Store,
  Sparkles,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import type {
  MerchantTask,
  MerchantTaskSeverity,
  MerchantTaskStatus,
} from '@/lib/types/ai-readiness';
import { BriefEvidence, briefsOf, humanizeAgentName, summarizeBriefs } from './briefEvidence';


type StatusFilter = 'open' | 'all' | 'archive';

const STATUS_FILTERS: Record<StatusFilter, string | undefined> = {
  open: undefined,
  all: 'all',
  archive: 'done,dismissed,failed',
};

// Lane grouping (on-your-store vs on-Pivota), derived from the task today — no
// schema change. Explicit store/outreach levers are checked FIRST (merchant work on
// their own site, even when an internal routing agent-tag is set); then a Pivota
// agent ⇒ Pivota; everything else (pivota_integration, gsc, indexing, sku_evidence,
// null lever) defaults to Pivota (where Pivota assists).
const STORE_LEVERS = new Set<string>([
  'editorial_outreach',
  'kol_outreach',
  'creator_partnership',
  'competitive_response',
  'content_revision',
  'content_publishing',
  'niche_content',
  'niche_defend',
]);

// Pivota-execution levers: work Pivota's own agents / integrations carry out
// (vs work the merchant does on their store). Anything NOT in here and NOT
// agent-assigned defaults to STORE — so a strategic brand task is never
// mislabeled "On Pivota", leaving the merchant waiting for an agent that never
// runs.
const PIVOTA_LEVERS = new Set<string>([
  'pivota_integration',
  'gsc_integration',
  'content_creation',
  'content_brief',
  'sitemap_freshness',
]);

function taskSurface(task: MerchantTask): 'store' | 'pivota' {
  const lever = (task.lever ?? '').toLowerCase();
  // Explicit store/outreach levers win FIRST — work the merchant does on their
  // OWN site (e.g. niche_content "create the answer"), even when an internal
  // routing tag like assigned_to_agent="niche_targeting" is set (categorization,
  // not Pivota execution).
  if (STORE_LEVERS.has(lever)) return 'store';
  // Pivota acts only when an agent is genuinely assigned OR it's a Pivota-run
  // lever (integration / GSC / content drafting / sitemap).
  if (task.assigned_to_agent) return 'pivota';
  if (PIVOTA_LEVERS.has(lever)) return 'pivota';
  // Default = the merchant's own action. (Was 'pivota', which mislabeled the
  // bulk of strategic brand tasks and read as "Pivota will handle it.")
  return 'store';
}

// The concrete "what to do" — the first line/sentence of the task body, surfaced
// inline so the merchant sees the action without expanding. Full body stays
// behind "Show details".
function firstInstructionLine(body: string | null | undefined): string | null {
  if (!body) return null;
  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  const sentence = line.split(/(?<=[.!?])\s/)[0] || line;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
}

// Open work first within each lane (highlight what's left; done sinks to the bottom).
const STATUS_ORDER: Record<MerchantTaskStatus, number> = {
  pending: 0,
  in_progress: 1,
  failed: 2,
  done: 3,
  dismissed: 4,
};

// Backend ranking signal: action items carry `priority_order` in evidence_jsonb
// (lower = more important). It was stored but never read — the queue sorted by
// status-then-created_at, so a low task could sit above a critical one. Sort:
// status → priority_order → severity.
const SEVERITY_RANK: Record<MerchantTaskSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function taskPriorityOrder(t: MerchantTask): number {
  const ev = (t.evidence_jsonb ?? t.evidence) as Record<string, unknown> | null;
  const p = ev?.priority_order;
  return typeof p === 'number' ? p : 999;
}

function sortByOpenFirst(list: MerchantTask[]): MerchantTask[] {
  return [...list].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      taskPriorityOrder(a) - taskPriorityOrder(b) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}


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
          Action plan
          <span className="text-[11px] font-normal normal-case text-amber-900/55">
            · your live list, across all audits
          </span>
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
        Your live action plan — every audit&apos;s recommendations plus the work
        Pivota&apos;s agents did for you, in one place. It spans all audits (not
        just the one shown above); status changes persist across re-audits.
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
        <div className="space-y-3">
          {(['store', 'pivota'] as const).map((surface) => {
            const group = sortByOpenFirst(tasks.filter((t) => taskSurface(t) === surface));
            if (group.length === 0) return null;
            return (
              <div key={surface}>
                <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  {surface === 'store' ? (
                    <Store className="h-3.5 w-3.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {surface === 'store' ? 'On your store' : 'On Pivota'}
                  <span className="text-[10px] font-normal normal-case text-amber-900/55">
                    {surface === 'store'
                      ? '· you act (your site / outreach)'
                      : '· Pivota’s agents handle these for you'}
                  </span>
                </div>
                <ul className="mt-1 space-y-2">
                  {group.map((task) => (
                    <TaskRow key={task.task_id} task={task} onChanged={load} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
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
  const briefSummary = summarizeBriefs(evidence);
  const briefs = briefsOf(evidence);
  const instruction = firstInstructionLine(task.body);

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
                by Pivota · {humanizeAgentName(task.assigned_to_agent)}
              </span>
            ) : null}
          </div>

          <div className="mt-1 text-sm font-semibold text-slate-900">
            {task.title}
          </div>

          {/* The concrete next step, inline — was hidden behind "Show details",
              so most rows read as a bare title. Surfacing the first line makes
              the action visible at a glance. */}
          {instruction ? (
            <div className="mt-0.5 text-xs text-slate-700">{instruction}</div>
          ) : null}

          {/* Outcome contract + executable CTA — expected_outcome/kpi_to_track + a
              real cta_url were stored in evidence and never rendered. Only http(s)
              URLs render (skips the known no-op CTAs). */}
          {(() => {
            const ev = (evidence ?? {}) as Record<string, unknown>;
            const outcome = typeof ev.expected_outcome === 'string' ? ev.expected_outcome : null;
            const kpi = typeof ev.kpi_to_track === 'string' ? ev.kpi_to_track : null;
            const ctaUrl = typeof ev.cta_url === 'string' ? ev.cta_url : null;
            const ctaLabel = typeof ev.cta_label === 'string' ? ev.cta_label : null;
            const realCta = ctaUrl && /^https?:\/\//.test(ctaUrl);
            if (!outcome && !kpi && !realCta) return null;
            return (
              <div className="mt-1 space-y-0.5">
                {outcome ? (
                  <div className="text-[11px] text-emerald-700">Expected: {outcome}</div>
                ) : null}
                {kpi ? <div className="text-[11px] text-slate-500">Track: {kpi}</div> : null}
                {realCta ? (
                  <a
                    href={ctaUrl as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded border border-indigo-300 bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50"
                  >
                    {ctaLabel || 'Open'} ↗
                  </a>
                ) : null}
              </div>
            );
          })()}

          {briefSummary ? (
            <div className="mt-0.5 text-[11px] text-slate-600">{briefSummary}</div>
          ) : null}

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
            briefs.length > 0 ? (
              <BriefEvidence briefs={briefs} />
            ) : (
              <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-[10px] text-slate-700">
                {JSON.stringify(evidence, null, 2)}
              </pre>
            )
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
