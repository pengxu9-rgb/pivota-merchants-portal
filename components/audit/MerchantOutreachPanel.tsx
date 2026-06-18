'use client';

/**
 * Outreach lifecycle Steps 3 + 5 — surface the loop. Self-fetches the merchant's
 * outreach records (merchant_tasks, lever='outreach_pitch', created by the
 * mark-sent endpoint) and shows the rollup ("N pitches sent · M now citing you")
 * plus the per-pitch state: cited (re-verify flipped it — the host now cites you,
 * the proof) vs pending (awaiting the next audit's re-verify). Returns null when
 * the merchant has no outreach yet. Best-effort, merchant-scoped via the token.
 */

import { useEffect, useState } from 'react';
import { Mail, CheckCircle2, Clock } from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import type { MerchantTask } from '@/lib/types/ai-readiness';

type OutreachItem = {
  taskId: string;
  host: string;
  query: string;
  cited: boolean;
};

function readOutreach(task: MerchantTask): OutreachItem | null {
  if (task.lever !== 'outreach_pitch') return null;
  const ev = (task.evidence_jsonb ?? task.evidence) as Record<string, unknown> | null;
  const o = (ev?.outreach ?? null) as Record<string, unknown> | null;
  if (!o) return null;
  const host = String(o.host ?? '').trim();
  if (!host) return null;
  const status = String(o.status ?? '').toLowerCase();
  return {
    taskId: task.task_id,
    host,
    query: String(o.query ?? ''),
    cited: status === 'cited' || task.status === 'done',
  };
}

export function MerchantOutreachPanel() {
  const [items, setItems] = useState<OutreachItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiClient.listMerchantTasks({ statusFilter: 'all', limit: 100 });
        const parsed = (res.tasks ?? [])
          .map(readOutreach)
          .filter((x): x is OutreachItem => x !== null);
        if (alive) setItems(parsed);
      } catch {
        // best-effort: outreach panel is non-critical
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading || items.length === 0) return null;

  const cited = items.filter((i) => i.cited);
  const pending = items.filter((i) => !i.cited);

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-900/70">
        <Mail className="h-4 w-4" /> Your outreach
      </div>
      <p className="mt-1 text-sm text-slate-700">
        <span className="font-semibold">{items.length}</span> pitch
        {items.length === 1 ? '' : 'es'} sent
        {cited.length > 0 ? (
          <>
            {' · '}
            <span className="font-semibold text-green-700">
              {cited.length} now citing you
            </span>{' '}
            ✓
          </>
        ) : null}
      </p>

      {cited.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {cited.map((i) => (
            <div
              key={i.taskId}
              className="flex items-start gap-2 rounded border border-green-200 bg-green-50/60 px-2.5 py-1.5"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <div className="text-xs">
                <span className="font-semibold text-green-800">{i.host}</span>
                <span className="text-green-700"> now cites you</span>
                {i.query ? (
                  <span className="text-slate-500"> · for &ldquo;{i.query}&rdquo;</span>
                ) : null}
                <div className="text-[11px] text-green-700/70">
                  Your pitch worked — verified on this audit.
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="mt-2 space-y-1">
          {pending.map((i) => (
            <div
              key={i.taskId}
              className="flex items-start gap-2 px-2.5 py-1 text-xs text-slate-600"
            >
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <div>
                <span className="font-medium text-slate-700">{i.host}</span> — pitched,
                re-checking on your next audit
                {i.query ? (
                  <span className="text-slate-400"> · &ldquo;{i.query}&rdquo;</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
