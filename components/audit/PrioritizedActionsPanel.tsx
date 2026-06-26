'use client';

/**
 * Run-level "Start here" — merchant_narrative.prioritized_actions, the ranked
 * per-product first moves the backend already computes but the UI dropped. Each
 * action names the SKU, the substitution/gap driving it, and the concrete first
 * move ("publish a vs-SheaMoisture comparison"). This is the bridge from the
 * brand-level narrative into the per-product cards below.
 */

import { ListChecks, ArrowRight } from 'lucide-react';
import type { NarrativePrioritizedAction } from '@/lib/types/ai-readiness';

export function PrioritizedActionsPanel({
  actions,
}: {
  actions?: NarrativePrioritizedAction[] | null;
}) {
  const items = (actions || []).filter((a) => a && (a.headline || a.first_move));
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        <ListChecks className="h-3.5 w-3.5" />
        Start here — your highest-impact moves
      </div>
      <ol className="mt-2 space-y-2.5">
        {items.slice(0, 6).map((a, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium leading-snug">{a.headline}</div>
              {a.sku_title ? (
                <div className="mt-0.5 truncate text-[11px] opacity-55">{a.sku_title}</div>
              ) : null}
              {a.first_move ? (
                <div className="mt-1 flex items-start gap-1 text-xs">
                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
                  <span>{a.first_move}</span>
                </div>
              ) : null}
              {a.why_this_first ? (
                <div className="mt-0.5 text-[11px] leading-snug opacity-60">
                  {a.why_this_first}
                </div>
              ) : null}
              {a.growth_phase_label ? (
                <span className="mt-1 inline-block rounded-full border border-[color:var(--merchant-line)] px-2 py-0.5 text-[10px] uppercase tracking-wide opacity-60">
                  {a.growth_phase_label}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
