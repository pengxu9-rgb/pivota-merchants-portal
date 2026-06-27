'use client';

/**
 * "What the category winner does right" — a grounded read of what AI says the
 * winning competitor is known for. The verbatim `known_for` is the gold (it's
 * exactly what the AI told a shopper), backed by the specific attributes AI
 * surfaced. Honest framing: this is grounded PRESENCE, not a claim the merchant
 * lacks anything — so we say "does right", not "you're missing".
 */

import { Trophy, Quote } from 'lucide-react';
import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';

export function CompetitorIntelPanel({ report }: { report: AgentCenterPerSkuReport }) {
  const ci = report.next_best_action?.competitor_intel;
  if (!ci || ci.status !== 'assessed' || !ci.known_for) return null;

  const attributes = (ci.attributes_present || []).filter(Boolean);
  const evidence = (ci.evidence || []).filter((e) => e?.verbatim);

  return (
    <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        <Trophy className="h-3.5 w-3.5" />
        What the category winner does right
      </div>
      {ci.competitor ? (
        <div className="mt-1 text-sm font-semibold">{ci.competitor}</div>
      ) : null}
      <div className="mt-1 flex gap-1.5 rounded bg-white/60 px-2 py-1.5 text-xs italic leading-snug opacity-80">
        <Quote className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
        <span>{ci.known_for}</span>
      </div>

      {attributes.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-50">
            What AI highlights about them
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {attributes.map((a) => (
              <span
                key={a}
                className="rounded-full border border-[color:var(--merchant-line)] px-2 py-0.5 text-[11px]"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {evidence.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {evidence.slice(0, 2).map((e, i) => (
            <li key={i} className="text-[11px] leading-snug opacity-55">
              <span className="font-medium not-italic">{e.attribute}:</span>{' '}
              <span className="italic">{e.verbatim}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
