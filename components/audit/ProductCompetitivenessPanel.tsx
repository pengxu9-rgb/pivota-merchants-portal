'use client';

/**
 * Product-FIRST competitiveness: does this product win NON-BRANDED discovery
 * demand inside AI ("best hair oil for damaged hair") — where the brand gains
 * NEW buyers — and who does AI recommend instead. Leads the per-product card.
 *
 * THE HONEST LEAD (do not flatten): `appeared` decomposes into
 *  - appeared_recommended → an independent source named you organically, and
 *  - appeared_listing → your own/retail listing was merely retrieved (findable).
 * We surface that split, never a single inflated "appears N/M". Per-model
 * appearance (Gemini vs ChatGPT, different indexes) is shown with divergence.
 * Branded name queries are a low-value footnote.
 */

import { Target, Trophy } from 'lucide-react';
import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';

function StatLine({
  value,
  total,
  label,
  sub,
  tone,
}: {
  value: number;
  total: number;
  label: string;
  sub?: string;
  tone: 'good' | 'warn' | 'muted';
}) {
  const toneCls =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'warn'
        ? 'text-red-700'
        : 'text-slate-600';
  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-xl font-bold tabular-nums ${toneCls}`}>
        {value}
        <span className="text-sm font-semibold opacity-60">/{total}</span>
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold leading-tight">{label}</div>
        {sub ? <div className="text-[11px] leading-tight opacity-60">{sub}</div> : null}
      </div>
    </div>
  );
}

export function ProductCompetitivenessPanel({
  report,
}: {
  report: AgentCenterPerSkuReport;
}) {
  const pc = report.product_competitiveness;
  if (!pc) return null;

  const { discovery, branded } = pc;
  const total = discovery.total;
  // Prefer the honest split; fall back to the combined `appeared` only when an
  // older payload didn't carry it (then we say so).
  const hasSplit =
    discovery.appeared_recommended != null || discovery.appeared_listing != null;
  const recommended = discovery.appeared_recommended ?? 0;
  const listing = discovery.appeared_listing ?? discovery.appeared;

  return (
    <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        <Target className="h-3.5 w-3.5" />
        Does AI recommend you?
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
          <p className="mt-1 text-[11px] leading-snug opacity-70">
            Across {total} non-branded discovery search{total === 1 ? '' : 'es'}{' '}
            (&ldquo;best&hellip;&rdquo;) where AI picks what to recommend — the
            demand you can actually win:
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <StatLine
              value={recommended}
              total={total}
              label="Independently recommended"
              sub="an editorial/community source named you, unprompted"
              tone={recommended > 0 ? 'good' : 'warn'}
            />
            <StatLine
              value={listing}
              total={total}
              label="Found via a listing"
              sub="your own/retail page was retrieved — not an endorsement"
              tone="muted"
            />
          </div>

          {hasSplit && recommended === 0 && listing > 0 ? (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
              You&apos;re <strong>findable but not yet recommended</strong>: AI can
              retrieve your listing, but no independent source endorses you when a
              shopper asks the category question.
            </p>
          ) : null}

          {pc.by_model && Object.keys(pc.by_model).length > 0 ? (
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                Appears by model{' '}
                <span className="font-normal lowercase opacity-60">(incl. listings)</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {Object.entries(pc.by_model).map(([model, m]) => (
                  <span key={model}>
                    <span className="font-medium capitalize">{model}</span>
                    <span className="opacity-70">
                      {' '}
                      {m.appeared}/{m.total}
                    </span>
                  </span>
                ))}
              </div>
              {pc.model_divergence && pc.model_divergence.length > 0 ? (
                <p className="mt-1.5 text-[11px] leading-relaxed opacity-70">
                  Models disagree (different indexes) — e.g.{' '}
                  {pc.model_divergence.slice(0, 2).map((d, i) => (
                    <span key={i}>
                      {i > 0 ? '; ' : ''}&ldquo;{d.query}&rdquo; appears on{' '}
                      {d.won.join(', ')} but not {d.lost.join(', ')}
                    </span>
                  ))}
                  . Work each model&apos;s sources separately.
                </p>
              ) : null}
            </div>
          ) : null}

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
