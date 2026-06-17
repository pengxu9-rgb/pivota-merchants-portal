'use client';

/**
 * Fix 3 — renders the merchant-grade narrative + the Fix 2 findability-vs-
 * endorsement split. Self-sufficient on `merchant_narrative` (the panel returns
 * null without it); the optional `authority_map.host_attribution_summary` only
 * sharpens the split (the brand-level "surfaced only via own listing" flag and
 * the category-endorsement subset).
 *
 * Guardrails mirrored from the backend: findability is NEVER shown as
 * endorsement; "not available" / honest-limit strings render verbatim (no
 * fabrication); absent fields degrade to nothing.
 */

import {
  CheckCircle2,
  Sprout,
  ShieldCheck,
  Info,
  Store,
  Trophy,
} from 'lucide-react';
import type {
  AgentCenterAuthorityMap,
  AgentCenterMerchantNarrative,
  WhoAiCitesInstead,
  WinPlanSummary,
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

function HostChip({
  host,
  tone,
}: {
  host: string;
  tone: 'findability' | 'endorsement' | 'competitor';
}) {
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

// The Fix-2 split, computed from the narrative (always present) and sharpened by
// the optional brand-level summary. Findability and endorsement are two visually
// distinct buckets — never merged.
function FindabilityEndorsementSplit({
  narrative,
  authorityMap,
}: {
  narrative: AgentCenterMerchantNarrative;
  authorityMap?: AgentCenterAuthorityMap | null;
}) {
  const summary = authorityMap?.host_attribution_summary;
  const findabilityHosts = summary?.findability_hosts ?? narrative.whats_working.findability_hosts;
  const endorsementHosts =
    summary?.endorsement_hosts ?? narrative.where_youre_losing.endorsement_hosts;
  const recommendedForCategory =
    summary?.independently_recommended_for_category ??
    narrative.where_youre_losing.independently_recommended_for_category;
  const endorsementCategoryHosts =
    summary?.endorsement_category_hosts ?? (recommendedForCategory ? endorsementHosts : []);
  const surfacedOnlyViaOwnListing =
    summary?.surfaced_only_via_own_listing ??
    (findabilityHosts.length > 0 && endorsementHosts.length === 0);

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
          {findabilityHosts.length > 0 ? (
            findabilityHosts.map((h) => <HostChip key={h} host={h} tone="findability" />)
          ) : (
            <span className="text-xs text-slate-400">No own/marketplace listings surfaced.</span>
          )}
        </div>
        {surfacedOnlyViaOwnListing ? (
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
          their own merits — the only honest &ldquo;AI recommends you&rdquo; signal.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {endorsementHosts.length > 0 ? (
            endorsementHosts.map((h) => <HostChip key={h} host={h} tone="endorsement" />)
          ) : (
            <span className="text-xs text-slate-400">No independent endorsement yet.</span>
          )}
        </div>
        {endorsementCategoryHosts.length > 0 ? (
          <p className="mt-2 text-[11px] text-green-700/80">
            Recommended for the category by:{' '}
            <span className="font-medium">{endorsementCategoryHosts.join(', ')}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function WhoAiCitesInsteadBlock({ block }: { block: WhoAiCitesInstead }) {
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

// Fix 4 — the one-line path-to-winning callout, pointing the merchant at the
// detailed per-query win-plan rendered below (WinPlanPanel).
function WinPlanSummaryCallout({ summary }: { summary: WinPlanSummary }) {
  return (
    <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50/60 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700/80">
        <Trophy className="h-4 w-4" /> Your path to winning
      </div>
      <p className="mt-1 text-sm text-slate-700">{summary.summary}</p>
      <p className="mt-1 text-[11px] text-indigo-700/70">See the per-query plan below.</p>
    </div>
  );
}

export function MerchantNarrativePanel({
  narrative,
  authorityMap,
}: {
  narrative?: AgentCenterMerchantNarrative | null;
  authorityMap?: AgentCenterAuthorityMap | null;
}) {
  // No fabrication: nothing to render without a narrative.
  if (!narrative) return null;

  const w = narrative.whats_working;
  const showProbeCounts =
    (w.branded_navigational_probes || 0) > 0 || (w.category_discovery_probes || 0) > 0;

  return (
    <div className="space-y-4">
      {/* 1. Headline story */}
      <div className="rounded-lg border-2 border-slate-200 bg-white p-4">
        <p className="text-lg font-semibold text-slate-900">{narrative.headline_story}</p>
        {narrative.verdict_explanation ? (
          <p className="mt-1 text-sm text-slate-500">{narrative.verdict_explanation}</p>
        ) : null}
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
            &ldquo;{w.evidence_excerpt.excerpt}&rdquo;
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
      <FindabilityEndorsementSplit narrative={narrative} authorityMap={authorityMap} />

      {/* 3. Where you can grow + who AI cites instead + path to winning */}
      <Section
        icon={<Sprout className="h-4 w-4 text-indigo-600" />}
        title="Where you can grow"
      >
        <p className="text-sm text-slate-700">{narrative.where_youre_losing.summary}</p>
        <WhoAiCitesInsteadBlock block={narrative.where_youre_losing.who_ai_cites_instead} />
        {narrative.where_youre_losing.win_plan_summary ? (
          <WinPlanSummaryCallout summary={narrative.where_youre_losing.win_plan_summary} />
        ) : null}
      </Section>

      {/* 4. Per-product scorecard removed — it duplicated the richer, product-named
          "Your products" section (PerSkuCardList) with a worse label (bare variant
          like "2 Box"). One scorecard, one source of truth. */}

      {/* 5. Verify summary (plain) */}
      <Section icon={<ShieldCheck className="h-4 w-4 text-slate-500" />} title="Answer-quality check">
        <p className="text-sm text-slate-700">{narrative.verify_summary_plain.text}</p>
      </Section>

      {/* 6. Honest limits — render verbatim, no fabrication */}
      {narrative.honest_limits.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Info className="h-4 w-4" /> What we didn&apos;t measure
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
