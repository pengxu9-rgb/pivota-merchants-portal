'use client';

/**
 * Merchant-portal executor activity feed (P1.3).
 *
 * Read-only "what Pivota agents did for you" feed. Same data the
 * employee portal's ExecutorActivityPanel reads — but auth'd as
 * merchant. Reads timestamps + evidence via `??` fallback to
 * tolerate the P1.1 dual-key shim window.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  XCircle,
  CircleSlash,
  Bot,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import type { MerchantExecutorRun } from '@/lib/types/ai-readiness';


export function MerchantExecutorActivityPanel() {
  const [runs, setRuns] = useState<MerchantExecutorRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listMerchantExecutorRuns({ limit: 30 });
      setRuns(res.runs);
    } catch (e) {
      const msg =
        (e as { message?: string })?.message ?? 'Failed to load executor runs';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded border-2 border-purple-200 bg-purple-50/40 p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-purple-900 uppercase tracking-wide">
          <Bot className="h-4 w-4" />
          Pivota agent activity
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded border border-purple-300 bg-white px-2 py-1 text-[11px] text-purple-900 hover:bg-purple-100 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <p className="text-xs text-slate-600">
        What Pivota agents did for your brand on the most recent
        audit. Each row is one execution; evidence shows what the
        agent actually did. Tasks materialized from these runs appear
        in the action queue above.
      </p>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
          {error}
        </div>
      ) : null}

      {loading && runs.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : null}

      {!loading && runs.length === 0 && !error ? (
        <p className="text-xs text-slate-600">
          No agent runs recorded yet. Pivota agents fire on the
          conditions they monitor (e.g. content brief generator runs
          when category visibility scores low). Re-run the audit if
          your scores warrant it.
        </p>
      ) : null}

      {runs.length > 0 ? (
        <ul className="space-y-2">
          {runs.map((run) => (
            <RunRow key={run.run_id} run={run} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}


function RunRow({ run }: { run: MerchantExecutorRun }) {
  const [expanded, setExpanded] = useState(false);
  const tone = statusTone(run.status);
  // P1.3 dual-key fallback for both timestamps and evidence.
  const startedTs = run.started_at ?? run.requested_at ?? null;
  const ts = run.completed_at || startedTs;
  const ago = ts ? prettyAgo(ts) : null;
  const evidence = run.evidence_jsonb ?? run.evidence ?? null;

  return (
    <li className={`rounded border-2 ${tone.border} ${tone.bg} p-2.5`}>
      <div className="flex items-start gap-2">
        {tone.icon}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">
              {run.agent_name}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${tone.chip}`}
            >
              {run.status}
            </span>
            {ago ? (
              <span className="text-[10px] text-slate-500">{ago}</span>
            ) : null}
          </div>

          {run.error_message ? (
            <p className="mt-1 text-xs text-red-700">
              {run.error_message}
            </p>
          ) : null}

          {evidence ? (
            <>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-[11px] text-slate-600 hover:underline"
              >
                {expanded ? 'Hide evidence' : 'Show evidence'}
              </button>
              {expanded ? (
                <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-[10px] text-slate-700">
                  {JSON.stringify(evidence, null, 2)}
                </pre>
              ) : (
                <EvidenceSnippet evidence={evidence} />
              )}
            </>
          ) : null}

          {run.materialized_task_id ? (
            <p className="mt-1 text-[11px] text-emerald-700">
              ✓ Created action queue task{' '}
              <code className="rounded bg-emerald-50 px-1 text-[10px]">
                {run.materialized_task_id.slice(0, 8)}
              </code>
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}


function EvidenceSnippet({
  evidence,
}: {
  evidence: Record<string, unknown>;
}) {
  const summary = summarizeEvidence(evidence);
  if (!summary) return null;
  return <p className="mt-1 text-xs text-slate-700">{summary}</p>;
}


function summarizeEvidence(ev: Record<string, unknown>): string | null {
  if ('submitted_count' in ev || 'indexed_count' in ev) {
    const sub = ev['submitted_count'];
    const idx = ev['indexed_count'];
    const pending = ev['pending_count'];
    const parts: string[] = [];
    if (sub != null) parts.push(`${sub} URL${sub === 1 ? '' : 's'} submitted`);
    if (idx != null) parts.push(`${idx} indexed`);
    if (pending != null) parts.push(`${pending} pending`);
    if (parts.length) return parts.join(', ');
  }
  if ('missing_from_sitemap_count' in ev || 'orphan_in_sitemap_count' in ev) {
    const missing = ev['missing_from_sitemap_count'];
    const orphan = ev['orphan_in_sitemap_count'];
    const parts: string[] = [];
    if (missing != null && (missing as number) > 0)
      parts.push(`${missing} missing from sitemap`);
    if (orphan != null && (orphan as number) > 0)
      parts.push(`${orphan} orphan URL${(orphan as number) === 1 ? '' : 's'}`);
    if (parts.length) return parts.join(', ');
  }
  if ('briefs_generated' in ev) {
    const briefs = ev['briefs_generated'];
    if (briefs != null) return `${briefs} content brief${briefs === 1 ? '' : 's'} drafted`;
  }
  if ('skipped_reason' in ev) {
    const r = ev['skipped_reason'];
    if (typeof r === 'string') return `Skipped: ${r}`;
  }
  return null;
}


function prettyAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const seconds = Math.floor((Date.now() - t) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}


function statusTone(status: MerchantExecutorRun['status']): {
  border: string;
  bg: string;
  chip: string;
  icon: React.ReactNode;
} {
  if (status === 'succeeded') {
    return {
      border: 'border-green-300',
      bg: 'bg-green-50/60',
      chip: 'bg-green-200 text-green-900',
      icon: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />,
    };
  }
  if (status === 'failed') {
    return {
      border: 'border-red-300',
      bg: 'bg-red-50/60',
      chip: 'bg-red-200 text-red-900',
      icon: <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />,
    };
  }
  if (status === 'skipped') {
    return {
      border: 'border-slate-200',
      bg: 'bg-white',
      chip: 'bg-slate-200 text-slate-700',
      icon: <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />,
    };
  }
  return {
    border: 'border-blue-300',
    bg: 'bg-blue-50/60',
    chip: 'bg-blue-200 text-blue-900',
    icon: <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" />,
  };
}
