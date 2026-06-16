'use client';

/**
 * MerchantNarrativePanel — the plain-English "story" that frames the score.
 *
 * Renders the backend-assembled `merchant_narrative` (lib/types/ai-readiness
 * MerchantNarrative): the verdict, the one-paragraph story, the
 * what's-working / where-you're-losing split (incl. who AI cites instead),
 * and an honest verify/limits footer.
 *
 * Scope is deliberately narrow: this panel does NOT render prioritized_actions
 * or per_sku_scorecard — those are owned by PrioritizedQueuePanel / PerSkuCardList.
 * This is the interpretation layer (the "here's your situation" lead-in), not a
 * competing action surface. Absent on older runs (merchant_narrative optional) —
 * the caller guards with `report.merchant_narrative ? ... : null`.
 */

import { CheckCircle2, AlertTriangle, ShieldCheck, Info } from 'lucide-react';

import { SurfaceCard } from '@/components/ui/merchant-primitives';
import type { MerchantNarrative } from '@/lib/types/ai-readiness';

function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((label) => (
        <span
          key={label}
          className="rounded-full bg-[color:var(--merchant-surface-muted)] px-2.5 py-0.5 text-xs text-[color:var(--merchant-muted)]"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function MerchantNarrativePanel({ narrative }: { narrative: MerchantNarrative }) {
  if (!narrative) return null;

  const {
    headline_story,
    whats_working,
    where_youre_losing,
    verify_summary_plain,
    honest_limits,
    verdict_label,
    verdict_explanation,
  } = narrative;

  const competitors = where_youre_losing?.who_ai_cites_instead?.competitors ?? [];
  const findabilityHosts = whats_working?.findability_hosts ?? [];

  return (
    <SurfaceCard
      strong
      eyebrow="Where you stand"
      title={verdict_label || 'Your AI-readiness'}
      description={verdict_explanation || undefined}
    >
      <div className="space-y-5 px-5 py-4">
        {headline_story ? (
          <p className="text-sm leading-relaxed sm:text-base">{headline_story}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* What's working */}
          <div className="rounded-lg border border-[color:var(--merchant-line)] p-4">
            <div className="merchant-overline mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              What&rsquo;s working
            </div>
            {whats_working?.summary ? (
              <p className="merchant-text-muted text-sm">{whats_working.summary}</p>
            ) : null}
            {findabilityHosts.length ? (
              <div className="mt-3 space-y-1">
                <div className="text-xs text-[color:var(--merchant-muted)]">AI finds you via</div>
                <Chips items={findabilityHosts} />
              </div>
            ) : null}
          </div>

          {/* Where you're losing */}
          <div className="rounded-lg border border-[color:var(--merchant-line)] p-4">
            <div className="merchant-overline mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Where you&rsquo;re losing
            </div>
            {where_youre_losing?.summary ? (
              <p className="merchant-text-muted text-sm">{where_youre_losing.summary}</p>
            ) : null}
            {competitors.length ? (
              <div className="mt-3 space-y-1">
                <div className="text-xs text-[color:var(--merchant-muted)]">AI recommends instead</div>
                <Chips
                  items={competitors.map((c) =>
                    c.times_named > 1 ? `${c.name} (${c.times_named})` : c.name,
                  )}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Honest verify / limits footer */}
        {verify_summary_plain?.text || (honest_limits && honest_limits.length) ? (
          <div className="space-y-2 border-t border-[color:var(--merchant-line)] pt-3">
            {verify_summary_plain?.text ? (
              <div className="flex items-start gap-2 text-xs text-[color:var(--merchant-muted)]">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{verify_summary_plain.text}</span>
              </div>
            ) : null}
            {honest_limits && honest_limits.length ? (
              <div className="flex items-start gap-2 text-xs text-[color:var(--merchant-muted)]">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{honest_limits.join(' · ')}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </SurfaceCard>
  );
}
