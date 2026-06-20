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
  href,
}: {
  host: string;
  tone: 'findability' | 'endorsement' | 'competitor';
  // When set, the chip becomes a link (new tab) so operators can inspect the
  // host page or look up the competitor — "how they win over us".
  href?: string;
}) {
  const cls =
    tone === 'endorsement'
      ? 'border-green-200 bg-green-50 text-green-800'
      : tone === 'competitor'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-slate-200 bg-slate-50 text-slate-700';
  const base = `inline-block rounded-full border px-2.5 py-0.5 text-xs ${cls}`;
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} underline-offset-2 hover:underline`}
      >
        {host} ↗
      </a>
    );
  }
  return <span className={base}>{host}</span>;
}

// A competitor/host name we don't have a first-party URL for → let the operator
// look it up. A host string gets its own site; a free-text name gets a search.
function lookupHref(value: string): string {
  const v = value.trim();
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return `https://${v}`;
  return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
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
  // C1 — the competitor channels AI routes buyers to instead of you, ranked, each
  // with a role label + how-to-compete action. Turns "who AI cites instead" into
  // an actionable competitive surface (shown for brands AND retailers).
  const channels = [...(summary?.channels_ai_cites_instead ?? [])]
    .sort((a, b) => (b.times_cited ?? 0) - (a.times_cited ?? 0))
    .slice(0, 8);

  return (
    <div className="space-y-3">
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

      {channels.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Store className="h-4 w-4" /> Channels AI sends buyers to instead — and how to compete
          </div>
          <p className="mt-1 text-xs text-slate-500">
            When shoppers ask AI about these products, it routes them to these sources
            instead of you. Each is a competitor to watch — here&apos;s how to win it.
          </p>
          <ul className="mt-2 space-y-2">
            {channels.map((c) => (
              <li
                key={c.host}
                className="rounded border border-slate-100 bg-slate-50/60 p-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <a
                    href={`https://${c.host}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-slate-700 hover:underline"
                  >
                    {c.host}
                  </a>
                  {c.role_label ? (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {c.role_label}
                    </span>
                  ) : null}
                  {c.times_cited ? (
                    <span className="text-[10px] text-slate-400">· {c.times_cited}×</span>
                  ) : null}
                </div>
                {c.how_to_compete ? (
                  <p className="mt-1 text-[11px] text-slate-600">{c.how_to_compete}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
          <div className="text-xs font-medium text-slate-600">What AI names instead of you</div>
          <div className="text-[11px] text-slate-400">
            Products, brands, and ingredient types AI mentions for these queries instead of
            naming you — not all are competing brands. Tap any to look it up.
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {[...block.competitors]
              .sort((a, b) => (b.times_named || 0) - (a.times_named || 0))
              .map((c) => (
                <span key={c.name} className="inline-flex items-center gap-1">
                  <HostChip host={c.name} tone="competitor" href={lookupHref(c.name)} />
                  {c.times_named > 0 ? (
                    <span className="text-[10px] text-slate-400">named {c.times_named}×</span>
                  ) : null}
                </span>
              ))}
          </div>
          {/* Co-locate the action with the names (was only in a separate conditional
              callout) — answers "how do I improve then?". */}
          <div className="mt-1.5 text-[11px] text-slate-600">
            <span className="font-medium">To win these:</span> get named in the independent
            hosts AI trusts for the category — the per-query targets + ready-to-send pitches
            are in <span className="font-medium text-indigo-700">How to win the
            recommendation</span> below.
          </div>
        </div>
      ) : null}
      {block.cited_hosts.length > 0 ? (
        <div>
          <div className="text-xs font-medium text-slate-600">Hosts AI cites</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {block.cited_hosts.map((h) => (
              <HostChip key={h.host} host={h.host} tone="findability" href={lookupHref(h.host)} />
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
      <p className="mt-1 text-xs text-slate-700">
        <span className="font-semibold">Your move:</span> get cited in those independent
        hosts. The per-query targets and ready-to-send pitches are in{' '}
        <span className="font-semibold text-indigo-700">How to win the recommendation</span>{' '}
        below.
      </p>
    </div>
  );
}

export function MerchantNarrativePanel({
  narrative,
  authorityMap,
  merchantType,
}: {
  narrative?: AgentCenterMerchantNarrative | null;
  authorityMap?: AgentCenterAuthorityMap | null;
  // Retailer-aware model (R2): when 'reseller', frame the sections as the STORE's
  // standing (not the resold brands').
  merchantType?: string;
}) {
  // No fabrication: nothing to render without a narrative.
  if (!narrative) return null;

  const isReseller = merchantType === 'reseller';
  const w = narrative.whats_working;
  const showProbeCounts =
    (w.branded_navigational_probes || 0) > 0 || (w.category_discovery_probes || 0) > 0;

  return (
    <div className="space-y-4">
      {/* R2 — reseller context: the audit measures whether AI sends shoppers to
          THIS STORE, not whether the brands it carries are recommended. Without
          this, a retailer reads "findable / recommended" as being about them when
          it's really about the products' brands. */}
      {isReseller ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span className="font-semibold">You&apos;re a retailer.</span> This audit measures
          whether AI sends shoppers to <strong>your store</strong> for the products you carry —
          not whether the product brands themselves are recommended. So: <strong>Findable</strong>
          {' '}= your store can be found as a place to buy; <strong>Recommended</strong> = an
          independent source points buyers to you; <strong>&ldquo;what AI names instead&rdquo;</strong>
          {' '}= the brands/products AI mentions for these queries. The brands you sell appearing
          in AI answers is a separate thing from your store being the place to buy them.
        </div>
      ) : null}
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

      {/* 5. Answer-quality check — show ONLY when DeepSeek verification actually ran
          (checked > 0). When it was skipped, a standalone "did not run" section reads
          as low-quality; the honest caveat still appears in "What we didn't measure"
          below, so we stay truthful without headlining a non-result. */}
      {narrative.verify_summary_plain.checked > 0 ? (
        <Section icon={<ShieldCheck className="h-4 w-4 text-slate-500" />} title="Answer-quality check">
          <p className="text-sm text-slate-700">{narrative.verify_summary_plain.text}</p>
        </Section>
      ) : null}

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
