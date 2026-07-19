'use client';

/**
 * Audit→action→outcome loop — "What changed where you were targeting".
 *
 * The closing half of the win-plan loop: the WinPlanPanel says "get cited in
 * these hosts for these losing queries"; this panel, on the NEXT re-audit,
 * reports what actually changed at each of those prior targets — hwahae now
 * names you on "best hair care" / goodhousekeeping still grounds it without
 * naming you.
 *
 * Reads the backend `outreach_outcomes` payload (top-level on per-SKU reports).
 * The backend authors every merchant-facing string under strict honesty rules,
 * so this component renders them VERBATIM and never invents copy:
 *   - NO causation. `what_changed` is observational; a merchant's own
 *     done-marked task shows only as the neutral fact `merchant_action.note`.
 *   - Query-level claims only on the same pinned prompt set. When
 *     `comparable === false` the backend has already downgraded per-query
 *     targets to `not_comparable`; we surface `basis_note` so the reset is
 *     visible, not silent.
 *   - A host that vanished from grounding is `no_longer_grounded` (neither a
 *     win nor a loss), never "lost".
 *
 * Degrades to null on first audit / when the backend marks it unavailable —
 * same no-fabrication contract as WinPlanPanel.
 */

import {
  Trophy,
  TrendingUp,
  Minus,
  Shuffle,
  RefreshCw,
  CheckCircle2,
  CircleSlash,
} from 'lucide-react';
import type {
  AgentCenterOutreachOutcomes,
  OutreachOutcomeClass,
  OutreachOutcomeTarget,
} from '@/lib/types/ai-readiness';

const OUTCOME_META: Record<
  OutreachOutcomeClass,
  { label: string; badge: string; Icon: typeof Trophy }
> = {
  won: { label: 'Won', badge: 'bg-green-100 text-green-800', Icon: Trophy },
  progress: { label: 'Progress', badge: 'bg-blue-100 text-blue-800', Icon: TrendingUp },
  no_change: { label: 'No change', badge: 'bg-slate-100 text-slate-600', Icon: Minus },
  no_longer_grounded: {
    label: 'Source shifted',
    badge: 'bg-slate-100 text-slate-500',
    Icon: Shuffle,
  },
  not_comparable: {
    label: 'Not comparable',
    badge: 'bg-amber-100 text-amber-800',
    Icon: RefreshCw,
  },
};

// The order the summary chips read in — mirrors the backend's target ordering
// (best news first) so the strip and the list agree.
const SUMMARY_ORDER: OutreachOutcomeClass[] = [
  'won',
  'progress',
  'no_change',
  'no_longer_grounded',
  'not_comparable',
];

function OutcomeBadge({ outcome }: { outcome: OutreachOutcomeClass }) {
  const meta = OUTCOME_META[outcome];
  const { Icon } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function TargetRow({ target }: { target: OutreachOutcomeTarget }) {
  const action = target.merchant_action;
  return (
    <li className="rounded-md border border-slate-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{target.host}</span>
        {target.query ? (
          <span className="text-xs text-slate-500">
            &ldquo;{target.query}&rdquo;
          </span>
        ) : null}
        <span className="ml-auto">
          <OutcomeBadge outcome={target.outcome} />
        </span>
      </div>

      {/* Backend-authored, observational copy — rendered verbatim. */}
      <p className="mt-1 text-xs text-slate-600">{target.what_changed}</p>

      {/* The merchant's own done-marked task, surfaced as a neutral fact — the
          backend copy is careful never to imply it caused the change. */}
      {action ? (
        <p className="mt-1 flex items-start gap-1 text-[11px] italic text-slate-400">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
          <span>{action.note}</span>
        </p>
      ) : null}
    </li>
  );
}

export function OutreachOutcomesPanel({
  outcomes,
}: {
  outcomes?: AgentCenterOutreachOutcomes | null;
}) {
  // No fabrication: nothing to show on a first audit or when the backend
  // couldn't measure outcomes (either side lacked the data). `targets` /
  // `summary` are typed required but can be absent on sparse payloads —
  // treat missing as empty, never throw.
  if (!outcomes || outcomes.is_first_audit || !outcomes.available) return null;
  if ((outcomes.targets?.length ?? 0) === 0) return null;

  const summaryChips = SUMMARY_ORDER.filter((k) => (outcomes.summary?.[k] ?? 0) > 0);
  const notComparable = outcomes.comparable === false;

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/30 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
        <Trophy className="h-5 w-5 text-indigo-600" /> What changed where you were targeting
      </div>

      {/* The no-causation framing, authored by the backend. */}
      {outcomes.note ? (
        <p className="mt-1 text-xs text-indigo-800/80">{outcomes.note}</p>
      ) : null}

      {/* Summary chips — only the outcome classes that actually occurred. */}
      {summaryChips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {summaryChips.map((k) => {
            const meta = OUTCOME_META[k];
            const { Icon } = meta;
            return (
              <span
                key={k}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}
              >
                <Icon className="h-3 w-3" />
                {outcomes.summary?.[k]} {meta.label.toLowerCase()}
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Basis-reset banner: when the prompt set changed, per-query claims are
          off the table — say so instead of leaving it implicit. */}
      {notComparable ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {outcomes.basis_note ||
              'The prompt set changed since your last audit, so per-query outcomes aren’t comparable this run — only host-level endorsement changes are shown.'}
          </span>
        </p>
      ) : null}

      <ul className="mt-3 space-y-1.5">
        {outcomes.targets?.map((t) => (
          <TargetRow key={`${t.host}::${t.query ?? ''}`} target={t} />
        ))}
      </ul>

      {/* Closed doors — a competitor owns them, so no pitch can win a citation.
          Surfaced (not silently dropped) so their absence from the list above
          has an honest answer. */}
      {(outcomes.closed_channels_excluded?.length ?? 0) > 0 ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] italic text-slate-400">
          <CircleSlash className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Excluded — a competitor owns{' '}
            {outcomes.closed_channels_excluded?.join(', ')}, so no pitch there can
            win a citation.
          </span>
        </p>
      ) : null}
    </div>
  );
}

export default OutreachOutcomesPanel;
