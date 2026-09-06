'use client';

/**
 * "How often AI named your products — by question type."
 *
 * Extracted from the ai-readiness page so the FREE url-audit surface can render
 * it too. It was the only place in the portal that showed a citation rate with
 * its DENOMINATOR ("12/36 (33%)"), and it was reachable only by merchants who
 * had already connected a store — the ones who least needed convincing.
 *
 * Why the denominator matters here more than anywhere else: the url-audit page
 * leads with `avg_visibility` rendered as a bare "6/100". That number is a
 * composite whose value moves several-fold on denominator choice, and it cannot
 * express the thing this panel makes obvious — that a brand can be named in
 * 100% of branded questions and 33% of category ones. Those are different
 * problems with different fixes, and the composite hides both.
 *
 * Reads `brand_rollup.citation_by_intent`, which URL-tier runs populate. Self-
 * hides when the run predates the field or every axis is empty, so it is safe
 * to mount unconditionally.
 */
import type { AgentCenterBrandRollup } from '@/lib/types/ai-readiness';

const INTENT_AXIS_LABELS: Record<string, { label: string; hint: string }> = {
  problem_jtbd: {
    label: 'Problem / need questions',
    hint: '“best X for sleep” — how most AI shopping happens',
  },
  category_head: { label: 'Category head terms', hint: '“best X” — usually retailer-owned' },
  constraint: { label: 'Specific-attribute searches', hint: '“vegan X”, “fragrance-free X”' },
  trust: { label: 'Trust / reviews', hint: '“is X legit”, “X reviews”' },
  navigational: { label: 'Branded / “where to buy”', hint: 'shoppers who already know you' },
  custom: { label: 'Your custom prompts', hint: 'prompts you added' },
};

const INTENT_AXIS_ORDER = [
  'problem_jtbd',
  'category_head',
  'constraint',
  'trust',
  'navigational',
  'custom',
];

export function CitationByIntentPanel({ rollup }: { rollup?: AgentCenterBrandRollup | null }) {
  const data = rollup?.citation_by_intent;
  if (!data) return null;
  const rows = INTENT_AXIS_ORDER.filter((k) => data[k] && data[k].total > 0).map((k) => ({
    key: k,
    ...data[k],
    ...(INTENT_AXIS_LABELS[k] || { label: k, hint: '' }),
  }));
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        How often AI named your products — by question type
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Of the questions we tested in each style, how often AI&apos;s answer <strong>named your
        product or brand</strong> (not just a retailer that carries it). Problem/need questions
        are how most AI shopping happens — usually the biggest room to grow.{' '}
        <span className="text-slate-400">Green = named in ≥50% · amber = some · grey = none.</span>
      </p>
      <div className="mt-3 space-y-2">
        {rows.map((r) => {
          const pct = Math.round((r.rate || 0) * 100);
          const tone = pct >= 50 ? 'bg-green-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300';
          return (
            <div key={r.key} className="flex items-center gap-3">
              <div className="w-44 shrink-0">
                <div className="text-xs font-medium text-slate-700">{r.label}</div>
                <div className="text-[10px] text-slate-400">{r.hint}</div>
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="w-16 shrink-0 text-right text-xs text-slate-600">
                {r.cited}/{r.total} <span className="text-slate-400">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CitationByIntentPanel;
