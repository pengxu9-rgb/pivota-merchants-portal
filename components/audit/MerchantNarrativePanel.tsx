'use client';

/**
 * Workstream A — renders the Fix 2 + Fix 3 merchant narrative + the
 * findability-vs-endorsement split. Contract:
 * pivota-backend/docs/PORTAL_RENDERING_CONTRACT.md.
 *
 * Guardrails mirrored from the backend: findability is NEVER shown as
 * endorsement; "not available" / honest-limit strings render verbatim
 * (no fabrication); absent fields degrade to nothing (the whole panel
 * returns null when there is no narrative).
 */

import {
  CheckCircle2,
  TrendingDown,
  ShieldCheck,
  ListChecks,
  Info,
  Megaphone,
  Store,
} from 'lucide-react';
import type {
  AuthorityMap,
  MerchantNarrative,
} from '@/lib/types/ai-readiness';

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function HostChip({ host, tone }: { host: string; tone: 'findability' | 'endorsement' | 'competitor' }) {
  const cls =
    tone === 'endorsement'
      ? 'border-green-200 bg-green-50 text-green-800'
      : tone === 'competitor'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${cls}`}>{host}</span>
  );
}

/** The core of Fix 2: two visually distinct buckets — never merged. */
function FindabilityEndorsementSplit({ map }: { map: AuthorityMap }) {
  const s = map.host_attribution_summary;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Store className="h-4 w-4" /> Findability — your listings are indexed
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Where AI can find your product (your own site + your product listed on
          marketplaces). This is distribution, not a recommendation.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {s.findability_hosts.length > 0 ? (
            s.findability_hosts.map((h) => <HostChip key={h} host={h} tone="findability" />)
          ) : (
            <span className="text-xs text-slate-400">No own/marketplace listings surfaced.</span>
          )}
        </div>
        {s.surfaced_only_via_own_listing ? (
          <div className="mt-2 inline-block rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            Listed, not recommended — AI surfaces your listings but does not yet recommend you.
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
          <ShieldCheck className="h-4 w-4" /> Endorsement — independently recommended
        </div>
        <p className="mt-1 text-xs text-green-700/70">
          Independent sources (editorial / creators / forums) that recommend you on
          their own merits — the only honest "AI recommends you" signal.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {s.endorsement_hosts.length > 0 ? (
            s.endorsement_hosts.map((h) => <HostChip key={h} host={h} tone="endorsement" />)
          ) : (
            <span className="text-xs text-slate-400">No independent endorsement yet.</span>
          )}
        </div>
        {s.endorsement_category_hosts.length > 0 ? (
          <p className="mt-2 text-[11px] text-green-700/80">
            Recommended for the category by:{' '}
            <span className="font-medium">{s.endorsement_category_hosts.join(', ')}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function WhoAiCitesInsteadBlock({
  block,
}: {
  block: MerchantNarrative['where_youre_losing']['who_ai_cites_instead'];
}) {
  if (!block.available) {
    return <p className="mt-2 text-xs italic text-slate-400">{block.note}</p>;
  }
  return (
    <div className="mt-2 space-y-2">
      {block.competitors.length > 0 ? (
        <div>
          <div className="text-xs font-medium text-slate-600">Competitors AI named</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {block.competitors.map((c) => (
              <HostChip key={c.name} host={c.name} tone="competitor" />
            ))}
          </div>
        </div>
      ) : null}
      {block.cited_hosts.length > 0 ? (
        <div>
          <div className="text-xs font-medium text-slate-600">Hosts AI cites</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {block.cited_hosts.map((h) => (
              <HostChip key={h.host} host={h.host} tone="findability" />
            ))}
          </div>
        </div>
      ) : null}
      {block.note ? <p className="text-[11px] italic text-slate-400">{block.note}</p> : null}
    </div>
  );
}

export function MerchantNarrativePanel({
  narrative,
  authorityMap,
}: {
  narrative?: MerchantNarrative | null;
  authorityMap?: AuthorityMap | null;
}) {
  // No fabrication: nothing to render without a narrative.
  if (!narrative) return null;

  const w = narrative.whats_working;
  const showProbeCounts =
    (w.branded_navigational_probes || 0) > 0 || (w.category_discovery_probes || 0) > 0;

  // Group actions by growth phase, preserving order.
  const phases: { label: string; actions: MerchantNarrative['prioritized_actions'] }[] = [];
  for (const a of narrative.prioritized_actions) {
    let group = phases.find((p) => p.label === a.growth_phase_label);
    if (!group) {
      group = { label: a.growth_phase_label, actions: [] };
      phases.push(group);
    }
    group.actions.push(a);
  }

  return (
    <div className="space-y-4">
      {/* 1. Headline story */}
      <div className="rounded-lg border-2 border-slate-200 bg-white p-4">
        <p className="text-lg font-semibold text-slate-900">{narrative.headline_story}</p>
      </div>

      {/* 2. What's working */}
      <Section icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} title="What's working">
        <p className="text-sm text-slate-700">{w.summary}</p>
        {showProbeCounts ? (
          <p className="mt-1 text-xs text-slate-500">
            {w.branded_navigational_probes} branded · {w.category_discovery_probes} category
            queries tested
          </p>
        ) : null}
        {w.evidence_excerpt ? (
          <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 text-xs italic text-slate-600">
            “{w.evidence_excerpt.excerpt}”
            {w.evidence_excerpt.source_labels.length > 0 ? (
              <span className="not-italic text-slate-400">
                {' '}
                — {w.evidence_excerpt.source_labels.join(', ')}
              </span>
            ) : null}
          </blockquote>
        ) : null}
      </Section>

      {/* findability vs endorsement split (Fix 2 core) */}
      {authorityMap ? <FindabilityEndorsementSplit map={authorityMap} /> : null}

      {/* 3. Where you're losing + who AI cites instead */}
      <Section icon={<TrendingDown className="h-4 w-4 text-orange-600" />} title="Where you're losing">
        <p className="text-sm text-slate-700">{narrative.where_youre_losing.summary}</p>
        <WhoAiCitesInsteadBlock block={narrative.where_youre_losing.who_ai_cites_instead} />
      </Section>

      {/* 4. Per-SKU scorecard */}
      {narrative.per_sku_scorecard.length > 0 ? (
        <Section icon={<ListChecks className="h-4 w-4 text-slate-500" />} title="Per-product scorecard">
          <div className="space-y-2">
            {narrative.per_sku_scorecard.map((row) => (
              <div
                key={row.sku_key}
                className="flex items-start justify-between gap-3 rounded border border-slate-100 bg-slate-50/50 p-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {row.sku_title || row.sku_key}
                  </div>
                  {row.what_it_means ? (
                    <div className="text-xs text-slate-500">{row.what_it_means}</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {row.status ? (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {row.status}
                    </span>
                  ) : null}
                  {row.surfaced_only_via_own_listing ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                      listed, not recommended
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* 5. Verify summary (plain) */}
      <Section icon={<ShieldCheck className="h-4 w-4 text-slate-500" />} title="Answer-quality check">
        <p className="text-sm text-slate-700">{narrative.verify_summary_plain.text}</p>
      </Section>

      {/* 6. Prioritized actions, grouped by growth phase */}
      {phases.length > 0 ? (
        <Section icon={<Megaphone className="h-4 w-4 text-indigo-600" />} title="What to do next">
          <div className="space-y-3">
            {phases.map((p) => (
              <div key={p.label}>
                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700/70">
                  {p.label}
                </div>
                <div className="mt-1 space-y-2">
                  {p.actions.map((a, i) => (
                    <div key={`${a.headline}-${i}`} className="rounded border border-slate-100 p-2">
                      <div className="text-sm font-medium text-slate-800">{a.headline}</div>
                      {a.first_move ? (
                        <div className="mt-0.5 text-xs text-slate-600">
                          <span className="font-medium">First move:</span> {a.first_move}
                        </div>
                      ) : null}
                      {a.why_this_first ? (
                        <div className="mt-0.5 text-xs text-slate-500">{a.why_this_first}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* 7. Honest limits — render verbatim, no fabrication */}
      {narrative.honest_limits.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Info className="h-4 w-4" /> What we didn't measure
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            {narrative.honest_limits.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
