'use client';

/**
 * Channel-by-channel appearance for one product: across the probed queries,
 * WHERE the brand's product shows up in AI answers — the brand's own site vs
 * each retailer/marketplace AI cites instead. The subject is the brand's
 * product; cited third-party hosts are channels (distribution), not the
 * product's identity. Leads the per-product card so the merchant sees their own
 * agentic status first, with retail as context.
 */

import { Store, ShoppingBag, BadgeCheck } from 'lucide-react';
import type {
  AgentCenterPerSkuReport,
  ChannelAppearanceChannel,
} from '@/lib/types/ai-readiness';

function Bar({ cited, total }: { cited: number; total: number }) {
  const pct = total > 0 ? Math.round((cited / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
      <div
        className="h-full rounded-full bg-[color:var(--merchant-accent,#6366f1)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Row({ ch }: { ch: ChannelAppearanceChannel }) {
  const own = ch.is_own_site;
  return (
    <div
      className={`flex items-center gap-3 rounded-md px-2.5 py-2 ${
        own ? 'bg-[color:var(--merchant-accent,#6366f1)]/5' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {own ? (
          <Store className="h-3.5 w-3.5 shrink-0 opacity-70" />
        ) : (
          <ShoppingBag className="h-3.5 w-3.5 shrink-0 opacity-50" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="truncate">{own ? 'Your site' : ch.type_label}</span>
            {ch.is_your_listing ? (
              <span className="rounded-sm bg-black/10 px-1 text-[10px] uppercase tracking-wide opacity-70">
                your listing
              </span>
            ) : null}
          </div>
          <div className="truncate text-[11px] opacity-55">{ch.host}</div>
        </div>
      </div>
      <div className="w-20 shrink-0">
        <Bar cited={ch.cited_query_count} total={ch.total_queries} />
      </div>
      <div className="w-10 shrink-0 text-right text-xs tabular-nums">
        {ch.cited_query_count}/{ch.total_queries}
      </div>
    </div>
  );
}

export function ChannelAppearancePanel({
  report,
}: {
  report: AgentCenterPerSkuReport;
}) {
  const ca = report.channel_appearance;
  if (!ca || !ca.channels || ca.channels.length === 0) return null;

  // The AI didn't ground any answer this run — show "couldn't measure" rather
  // than an empty channel list that would read as "appears on no channel".
  if (ca.grounding_unavailable) {
    return (
      <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
          <BadgeCheck className="h-3.5 w-3.5" />
          Where this product shows up in AI
        </div>
        <p className="mt-1 text-xs leading-relaxed opacity-70">
          Couldn&apos;t measure channels this run — the AI didn&apos;t cite
          sources for these searches (a temporary grounding hiccup). Re-run to
          see where this product appears.
        </p>
      </div>
    );
  }

  const own = ca.channels.find((c) => c.is_own_site);
  const ownCited = ca.own_site_cited_count;
  const total = ca.total_queries;
  // Honest headline: own site cited as a source vs brand merely named.
  const headline =
    ownCited > 0
      ? `Your site is cited in ${ownCited} of ${total} AI answers`
      : `Your site isn't cited in any of the ${total} AI answers yet`;

  return (
    <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        <BadgeCheck className="h-3.5 w-3.5" />
        Where this product shows up in AI
      </div>
      <div className="mt-1 text-sm font-semibold">{headline}</div>
      <p className="mt-0.5 text-xs opacity-70">
        {ca.brand_mentioned_count > 0 && ownCited === 0
          ? `AI names your brand in ${ca.brand_mentioned_count} of ${total} answers, but routes buyers to the channels below — not your own page.`
          : 'Your own page vs the channels AI cites for this product.'}
      </p>

      <div className="mt-2 space-y-0.5">
        {own ? <Row ch={own} /> : null}
        {ca.channels
          .filter((c) => !c.is_own_site)
          .slice(0, 8)
          .map((c) => (
            <Row key={c.host} ch={c} />
          ))}
      </div>
    </div>
  );
}
