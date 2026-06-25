'use client';

/**
 * Product-FIRST competitiveness: does this product win NON-BRANDED discovery
 * demand inside AI ("best hair oil for damaged hair") — where the brand gains
 * NEW buyers — and who does AI recommend instead. Leads the per-product card.
 * Branded name queries are reported as a low-value footnote (a shopper who types
 * a product name already found it elsewhere).
 */

import { Target, Trophy } from 'lucide-react';
import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';

export function ProductCompetitivenessPanel({
  report,
}: {
  report: AgentCenterPerSkuReport;
}) {
  const pc = report.product_competitiveness;
  if (!pc) return null;

  const { discovery, branded } = pc;
  const pct =
    discovery.total > 0
      ? Math.round((discovery.appeared / discovery.total) * 100)
      : 0;

  return (
    <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        <Target className="h-3.5 w-3.5" />
        Can this product win in AI?
      </div>

      {pc.grounding_unavailable ? (
        <p className="mt-1 text-xs leading-relaxed opacity-70">
          We couldn&apos;t measure this product this run — the AI answered the
          discovery searches without citing sources (a temporary grounding
          hiccup), so there&apos;s nothing reliable to score. Re-run to measure.
        </p>
      ) : !pc.has_discovery ? (
        <p className="mt-1 text-xs leading-relaxed opacity-70">
          We couldn&apos;t test discovery searches for this product yet — we
          need a clearer product category to probe demand like &ldquo;best{' '}
          &lt;category&gt;&rdquo;. Add a product type / category and re-run.
        </p>
      ) : (
        <>
          <div className="mt-1 text-sm font-semibold">
            {discovery.appeared === 0
              ? `Your product appears in none of the ${discovery.total} discovery searches shoppers actually run`
              : `Your product appears in ${discovery.appeared} of ${discovery.total} discovery searches`}
          </div>
          <p className="mt-0.5 text-xs opacity-70">
            These are non-branded searches (&ldquo;best&hellip;&rdquo;) where AI
            picks what to recommend — the demand you can win.
          </p>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-[color:var(--merchant-accent,#6366f1)]"
              style={{ width: `${pct}%` }}
            />
          </div>

          {discovery.top_competitors.length > 0 ? (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                <Trophy className="h-3.5 w-3.5" />
                AI recommends instead
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {discovery.top_competitors.map((c) => (
                  <span
                    key={c.name}
                    className="rounded-full border border-[color:var(--merchant-line)] px-2 py-0.5 text-xs"
                  >
                    {c.name}
                    <span className="opacity-50"> · {c.query_count}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {discovery.missed.length > 0 ? (
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                Searches you&apos;re missing
              </div>
              <ul className="mt-1 space-y-0.5 text-xs opacity-80">
                {discovery.missed.slice(0, 4).map((q, i) => (
                  <li key={i} className="truncate">
                    &ldquo;{q}&rdquo;
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {branded.total > 0 ? (
        <p className="mt-3 text-[11px] opacity-55">
          Branded searches (your name): {branded.appeared}/{branded.total} — low
          value; few shoppers search a product by name in AI, and those who do
          already found you elsewhere.
        </p>
      ) : null}
    </div>
  );
}
