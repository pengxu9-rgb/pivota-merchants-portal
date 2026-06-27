'use client';

/**
 * "Get cited on independent sources" — the distribute surface, done right.
 *
 * AI agents discount a brand's own product page; they cite INDEPENDENT
 * third-party sources (reviews, media, KOLs, communities) as evidence — and
 * Gemini vs ChatGPT trust DIFFERENT sources. So this routes the merchant OUT to
 * the external channels each engine actually cites, with links, realism, "how to
 * get cited", and a Pivota-drafted OUTREACH artifact (pitch / review request /
 * KOL DM / community post) per channel. It deliberately offers MANY paths —
 * the more places a merchant earns evidence, the more AI cites them.
 */

import { useState } from 'react';
import {
  Globe, Star, Newspaper, Users, Megaphone, Store, ExternalLink,
  Sparkles, Loader2, Check, Copy, ArrowRight,
} from 'lucide-react';
import type { OutreachMove, EnginePlaybook } from '@/lib/types/ai-readiness';
import { apiClient } from '@/lib/api-client';

type Kind = 'reviews' | 'media' | 'kol' | 'community' | 'retailer' | 'other';

const KIND_META: Record<Kind, { label: string; icon: typeof Star }> = {
  reviews: { label: 'Reviews', icon: Star },
  media: { label: 'Media', icon: Newspaper },
  kol: { label: 'KOL / creator', icon: Megaphone },
  community: { label: 'Community', icon: Users },
  retailer: { label: 'Retailer', icon: Store },
  other: { label: 'Source', icon: Globe },
};

const REALISM_META: Record<string, { label: string; cls: string; rank: number }> = {
  reachable: { label: 'Reachable', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', rank: 0 },
  diy: { label: 'DIY', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', rank: 1 },
  onboarding: { label: 'Onboarding', cls: 'border-indigo-200 bg-indigo-50 text-indigo-700', rank: 2 },
  investigate: { label: 'Investigate', cls: 'border-amber-200 bg-amber-50 text-amber-700', rank: 3 },
  hard: { label: 'Longer game', cls: 'border-[color:var(--merchant-line)] text-slate-500', rank: 4 },
};

function kindOf(m: { lever?: string; host_type?: string; host_subtype?: string | null }): Kind {
  const sub = (m.host_subtype || '').toLowerCase();
  if (sub.includes('review')) return 'reviews';
  if (sub.includes('creator') || m.lever === 'creator_partnership') return 'kol';
  if (sub === 'beauty' || (m.host_type === 'editorial' && !sub.includes('review'))) return 'media';
  const t = (m.host_type || '').toLowerCase();
  if (t.includes('community') || t.includes('forum')) return 'community';
  if (t.includes('market') || t.includes('retail')) return 'retailer';
  if (m.lever === 'editorial_outreach') return 'reviews';
  return 'other';
}

function leverFor(kind: Kind): string {
  return { reviews: 'editorial_outreach', media: 'editorial_outreach', kol: 'creator_partnership', community: 'community', retailer: 'marketplace_listing', other: 'research' }[kind];
}

function cleanCategory(q?: string | null, brand?: string | null): string {
  const c = (q || '')
    .replace(/^\s*(best|top|recommended|what|which|the)\b/gi, '')
    .replace(/\bfor\b.*$/i, '')
    .replace(/\bshould i buy\b.*$/i, '')
    .trim();
  return c || (brand || '').trim();
}

// A tracked subreddit/thread from authority_map.skus[].reddit.subreddits[].
interface TrackedSubreddit {
  name?: string | null;
  threads?: { title?: string | null; url?: string | null; sentiment?: string | null }[];
  recurring_objections?: string[];
}

function cleanSubName(name?: string | null): string | null {
  const n = (name || '').trim().replace(/^\/?r\//i, '');
  if (!n || /^unknown$/i.test(n) || /\s/.test(n) || n.length > 30) return null;
  return n;
}

function isRedditPermalink(url?: string | null): boolean {
  return !!url && /(^https?:\/\/)?(www\.)?reddit\.com\/r\/[^/]+\/comments\//i.test(url);
}

// Category → a few relevant subreddits, so merchants get CONCRETE places to go
// even when the audit didn't capture specific threads. Only suggests on a known
// keyword (never guesses a wrong community for an unrelated category).
function suggestSubreddits(category: string): string[] {
  const c = category.toLowerCase();
  const out: string[] = [];
  const add = (...s: string[]) => s.forEach((x) => out.includes(x) || out.push(x));
  if (/\bhair\b|shampoo|conditioner|curl|scalp/.test(c)) add('HaircareScience', 'curlyhair', 'FemaleHairAdvice');
  if (/skin|serum|moistur|acne|cleanser|cream|spf|sunscreen/.test(c)) add('SkincareAddiction', 'AsianBeauty', '30PlusSkinCare');
  if (/makeup|lipstick|foundation|mascara|concealer/.test(c)) add('MakeupAddiction', 'BeautyGuruChatter');
  if (/fragrance|perfume|cologne|scent/.test(c)) add('fragrance', 'DryFragrance');
  if (/supplement|vitamin|protein|collagen|nutrition/.test(c)) add('Supplements', 'Nutrition');
  if (/coffee|espresso/.test(c)) add('Coffee');
  if (/\btea\b|matcha/.test(c)) add('tea');
  if (/beauty|cosmetic|k-?beauty/.test(c) && out.length === 0) add('AsianBeauty', 'BeautyGuruChatter');
  return out.slice(0, 4);
}

interface Starter { kind: Kind; title: string; url: string; how: string }

// Build the Community paths: real tracked subreddits/threads first (grounded),
// then category-suggested subreddits, then a search catch-all. The more concrete
// places a merchant can go, the more evidence AI eventually picks up.
function buildRedditPaths(tracked: TrackedSubreddit[], category: string): Starter[] {
  const enc = encodeURIComponent;
  const out: Starter[] = [];
  const seen = new Set<string>();
  const catQ = category || 'this category';

  for (const sub of tracked || []) {
    const name = cleanSubName(sub?.name);
    const thread = (sub?.threads || []).find((t) => isRedditPermalink(t?.url));
    if (!name && !thread) continue;
    const key = (name || thread?.url || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const obj = (sub?.recurring_objections || []).filter(Boolean).slice(0, 2);
    if (thread?.url) {
      out.push({
        kind: 'community',
        title: thread.title?.trim() ? `Reddit thread: ${thread.title.trim().slice(0, 50)}` : `r/${name} — a cited thread`,
        url: thread.url,
        how: `AI already cites this discussion${obj.length ? ` — address: ${obj.join(', ')}` : ''}. Add a genuine, disclosed reply.`,
      });
    } else if (name) {
      out.push({
        kind: 'community',
        title: `r/${name}`,
        url: `https://www.reddit.com/r/${name}/`,
        how: `A subreddit AI already cites for your category${obj.length ? ` — people raise: ${obj.join(', ')}` : ''}. Join the conversation, disclosed.`,
      });
    }
  }

  for (const name of suggestSubreddits(category)) {
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({
      kind: 'community',
      title: `r/${name}`,
      url: `https://www.reddit.com/r/${name}/`,
      how: `An active community for this category — answer real questions and disclose your brand.`,
    });
  }

  out.push({
    kind: 'community',
    title: 'Search Reddit for your topic',
    url: `https://www.reddit.com/search/?q=${enc(catQ)}`,
    how: 'Find the exact threads where shoppers ask about this category.',
  });
  return out.slice(0, 6);
}

/** A single channel row with an outbound link + a Pivota draft-outreach button. */
function ChannelRow({
  kind, title, host, url, realism, how, runId, channelHost, channelLever, channelType, query,
}: {
  kind: Kind;
  title: string;
  host?: string | null;
  url?: string | null;
  realism?: string | null;
  how?: string | null;
  runId?: string | null;
  channelHost?: string | null;
  channelLever: string;
  channelType: Kind;
  query?: string | null;
}) {
  const [st, setSt] = useState<{ loading?: boolean; done?: boolean; draft?: string | null; error?: string | null; copied?: boolean }>({});
  const Meta = KIND_META[kind];
  const rm = realism ? REALISM_META[realism] : undefined;

  async function draft() {
    if (!runId || st.loading || st.done) return;
    setSt({ loading: true });
    try {
      const res = await apiClient.startAuditAction({
        runId,
        headline: `Get cited on ${host || title}`,
        channelHost: channelHost ?? host ?? title,
        channelLever,
        channelType,
        query: query ?? undefined,
      });
      setSt({ done: true, draft: res?.draft ?? null });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setSt({ error: status === 402 ? "You're out of credits — top up to draft this." : "Couldn't draft — try again." });
    }
  }
  async function copy() {
    if (!st.draft) return;
    try { await navigator.clipboard.writeText(st.draft); setSt((s) => ({ ...s, copied: true })); setTimeout(() => setSt((s) => ({ ...s, copied: false })), 1500); } catch { /* ignore */ }
  }

  return (
    <div className="rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <Meta.icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold">{title}</span>
            <span className="rounded-sm bg-black/5 px-1 text-[10px] uppercase tracking-wide opacity-60">{Meta.label}</span>
            {rm ? <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${rm.cls}`}>{rm.label}</span> : null}
          </div>
        </div>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[color:var(--merchant-accent,#6366f1)] hover:underline">
            Open <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      {how ? <p className="mt-1 text-[11px] leading-snug opacity-70">{how}</p> : null}

      {runId ? (
        st.done ? (
          <div className="mt-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <Check className="h-3 w-3" /> In your plan
            </span>
            {st.draft ? (
              <div className="mt-1 rounded bg-white/70 px-2.5 py-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--merchant-accent,#6366f1)]">
                    <Sparkles className="h-3 w-3" /> Pivota outreach draft
                  </span>
                  <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100">
                    <Copy className="h-3 w-3" /> {st.copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{st.draft}</p>
              </div>
            ) : (
              <span className="ml-1 text-[11px] opacity-55">(top up credits to have Pivota draft the outreach)</span>
            )}
          </div>
        ) : (
          <div className="mt-1.5">
            <button type="button" onClick={draft} disabled={st.loading}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--merchant-accent,#6366f1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--merchant-accent,#6366f1)] hover:bg-[color:var(--merchant-accent,#6366f1)]/10 disabled:opacity-50">
              {st.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {st.loading ? 'Drafting…' : 'Draft outreach'}
            </button>
            {st.error ? <span className="ml-2 text-[11px] text-red-700">{st.error}</span> : null}
          </div>
        )
      ) : null}
    </div>
  );
}

function EngineGroup({
  engineKey, label, howItCites, moves, enginesByHost, category, brand, runId, starters,
}: {
  engineKey: string;
  label: string;
  howItCites?: string;
  moves: OutreachMove[];
  enginesByHost: Record<string, string[]>;
  category: string;
  brand: string;
  runId?: string | null;
  starters: { kind: Kind; title: string; url: string; how: string }[];
}) {
  // Channels this engine actually cites (grounded by providers); fall back to a
  // type→engine heuristic when we have no provider data for the host.
  const cited = moves
    .filter((m) => {
      const provs = enginesByHost[m.host];
      if (provs && provs.length) return provs.includes(engineKey);
      const k = kindOf(m);
      return engineKey === 'chatgpt' ? k === 'community' || k === 'kol' || k === 'reviews' : k !== 'community';
    })
    .sort((a, b) => (REALISM_META[a.realism || '']?.rank ?? 2.5) - (REALISM_META[b.realism || '']?.rank ?? 2.5));

  if (cited.length === 0 && starters.length === 0) return null;

  return (
    <div className="rounded-md border border-[color:var(--merchant-line)] bg-white/30 p-3">
      <div className="text-xs font-bold">Win {label}</div>
      {howItCites ? <p className="mt-0.5 text-[11px] leading-snug opacity-60">{howItCites}</p> : null}
      <div className="mt-2 space-y-1.5">
        {cited.map((m, i) => {
          const k = kindOf(m);
          return (
            <ChannelRow
              key={`${m.host}-${i}`}
              kind={k}
              title={m.host}
              host={m.host}
              url={`https://${m.host}`}
              realism={m.realism}
              how={m.first_move}
              runId={runId}
              channelHost={m.host}
              channelLever={m.lever || leverFor(k)}
              channelType={k}
              query={category}
            />
          );
        })}
        {starters.map((s, i) => (
          <ChannelRow
            key={`starter-${i}`}
            kind={s.kind}
            title={s.title}
            url={s.url}
            how={s.how}
            runId={runId}
            channelHost={s.title}
            channelLever={leverFor(s.kind)}
            channelType={s.kind}
            query={category || brand}
          />
        ))}
      </div>
    </div>
  );
}

export function GetCitedPanel({
  moves,
  enginesByHost = {},
  enginePlaybook,
  categoryHint,
  brand,
  runId,
  redditSubreddits,
}: {
  moves?: OutreachMove[] | null;
  enginesByHost?: Record<string, string[]>;
  enginePlaybook?: EnginePlaybook | null;
  categoryHint?: string | null;
  brand?: string | null;
  runId?: string | null;
  // Tracked subreddits/threads from authority_map.skus[].reddit.subreddits — when
  // present + clean, we link merchants to the SPECIFIC communities AI already cites.
  redditSubreddits?: TrackedSubreddit[];
}) {
  const list = (moves || []).filter((m) => m && m.host);
  if (list.length === 0 && !enginePlaybook?.has_signal) return null;

  const category = cleanCategory(categoryHint, brand);
  const enc = encodeURIComponent;
  const catQ = category || brand || '';

  // Multiple actionable paths per engine — the more a merchant can follow, the
  // more evidence AI picks up. ChatGPT leans community/Reddit; both reward KOLs.
  // Community paths lead with the specific subreddits/threads AI already cites.
  const chatgptStarters: Starter[] = [
    ...buildRedditPaths(redditSubreddits || [], category),
    { kind: 'community', title: 'Quora — answer category questions', url: `https://www.quora.com/search?q=${enc(catQ)}`, how: 'Write genuinely helpful answers where your product fits.' },
    { kind: 'kol', title: 'YouTube creators — get reviewed', url: `https://www.youtube.com/results?search_query=${enc(catQ + ' review')}`, how: 'Find creators reviewing this category and offer a gifting/review collab.' },
    { kind: 'kol', title: 'TikTok creators', url: `https://www.tiktok.com/search?q=${enc(catQ)}`, how: 'Short-form reviews build the community signal ChatGPT picks up.' },
  ];
  const geminiStarters = [
    { kind: 'reviews' as Kind, title: 'Get into "best of" roundups', url: `https://www.google.com/search?q=${enc('best ' + catQ)}`, how: 'Find the review roundups Google ranks for this category and pitch to be included.' },
    { kind: 'kol' as Kind, title: 'Instagram creators', url: `https://www.google.com/search?q=${enc('instagram ' + catQ + ' creator')}`, how: 'Creator posts that get indexed feed Google-trusted signals.' },
  ];

  const ep = enginePlaybook?.engines || {};

  return (
    <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white/50 p-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-[color:var(--merchant-accent,#6366f1)]" />
        <div className="text-sm font-semibold">Get cited on independent sources</div>
      </div>
      <p className="mt-1 text-xs leading-snug opacity-70">
        AI recommends independent sources — reviews, media, creators, communities — not your own
        product page. Gemini and ChatGPT trust <em>different</em> ones, so earn evidence on each.
        The more places you show up, the more AI cites you.
      </p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <EngineGroup
          engineKey="gemini"
          label="Gemini (Google index)"
          howItCites={ep.gemini?.how_it_cites}
          moves={list}
          enginesByHost={enginesByHost}
          category={category}
          brand={brand || ''}
          runId={runId}
          starters={geminiStarters}
        />
        <EngineGroup
          engineKey="chatgpt"
          label="ChatGPT (Bing + community)"
          howItCites={ep.chatgpt?.how_it_cites}
          moves={list}
          enginesByHost={enginesByHost}
          category={category}
          brand={brand || ''}
          runId={runId}
          starters={chatgptStarters}
        />
      </div>
    </div>
  );
}
