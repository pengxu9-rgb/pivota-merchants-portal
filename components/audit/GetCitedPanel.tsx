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
  Sparkles, Loader2, Check, Copy, ArrowRight, Lock,
} from 'lucide-react';
import type {
  OutreachMove, EnginePlaybook, PitchTarget, ClosedChannel,
} from '@/lib/types/ai-readiness';
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

// Grounding metadata often stamps the DOMAIN as a source's title (Gemini
// grounding chunks: title="reddit.com"), which rendered as the meaningless —
// and duplicated — "Reddit thread: reddit.com" row (live HoverAir share
// report). A bare-host title is junk; the permalink slug is the real topic.
function isHostLikeTitle(t: string): boolean {
  return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t.trim());
}

function redditThreadTitle(
  thread: { title?: string | null; url?: string | null },
  name: string | null,
): string {
  const t = (thread.title || '').trim();
  if (t && !isHostLikeTitle(t)) return `Reddit thread: ${t.slice(0, 50)}`;
  const slug = /\/comments\/[^/]+\/([^/?#]+)/i.exec(thread.url || '')?.[1];
  let human = '';
  try {
    human = slug ? decodeURIComponent(slug).replace(/[_-]+/g, ' ').trim() : '';
  } catch {
    human = (slug || '').replace(/[_-]+/g, ' ').trim();
  }
  if (human) {
    const topic = `“${human.slice(0, 60)}”`;
    return name ? `r/${name}: ${topic}` : `Reddit thread: ${topic}`;
  }
  return name ? `r/${name} — a cited thread` : 'A cited Reddit thread';
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

/** Measured creator evidence: the specific videos AI actually cited, per
 * creator host (authority_map.skus[].authority_hosts[] rows with
 * host_type "creator" carry evidence_urls). The audit HAD these all along —
 * the live HoverAir share report carried 8 cited YouTube videos while the
 * panel rendered a generic "YouTube creators" search link. Extracted here
 * (single implementation) and passed in by both report surfaces. */
export function extractCreatorVideosByHost(
  authorityMap?: {
    skus?: {
      authority_hosts?: {
        host?: string | null;
        host_type?: string | null;
        evidence_urls?: (string | null)[] | null;
      }[] | null;
    }[] | null;
  } | null,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const sku of authorityMap?.skus ?? []) {
    for (const h of sku?.authority_hosts ?? []) {
      const host = (h?.host || '').toLowerCase();
      if (!host || (h?.host_type || '').toLowerCase() !== 'creator') continue;
      const urls = (h?.evidence_urls ?? []).filter(
        (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
      );
      if (!urls.length) continue;
      const bucket = (out[host] ??= []);
      for (const u of urls) if (!bucket.includes(u)) bucket.push(u);
    }
  }
  for (const host of Object.keys(out)) out[host] = out[host].slice(0, 5);
  return out;
}

interface Starter {
  kind: Kind;
  title: string;
  url: string;
  how: string;
  /** The MEASURED shopper question this starter answers — seeds the
   * draft-outreach call so the merchant gets a community answer for the
   * exact ask they lose, not generic category copy. */
  query?: string;
}

// Mirrors win_plan_builder's broad-head shapes (display gate only): a head
// term ("best headphones") must never seed an "answer this question"
// community row — that's the big-budget fight the report tells merchants to
// park. Generator-stamped prompts (spec-matched / merchant-authored) are
// exempt, same as the backend classifier.
const BROAD_HEAD_PREFIXES = ['best ', 'top ', 'popular ', 'what is '];
// u-flag + Unicode classes: JS \w is ASCII-only, so "what 保湿精华 should i
// buy" would dodge the gate the backend applies (K-beauty queries are a core
// vertical).
const WHAT_SHOULD_I_BUY = /^what\s[\p{L}\p{N}_\- ]{1,40}\sshould\si\sbuy\??$/iu;
const NEVER_HEAD_SOURCES = new Set(['llm_winnable', 'llm_scenario', 'merchant_custom']);
function isBroadHeadQuery(q: string, promptSource?: string | null): boolean {
  if (promptSource && NEVER_HEAD_SOURCES.has(promptSource.toLowerCase())) return false;
  const t = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return true;
  if (WHAT_SHOULD_I_BUY.test(t)) return true;
  return t.split(' ').length <= 3 && BROAD_HEAD_PREFIXES.some((p) => t.startsWith(p));
}

/** The specific shopper questions this audit MEASURED as losses for one
 * engine: per-engine divergence entries first (this engine graded "lost"),
 * then the outreach moves' per-host losing queries (niche-first upstream).
 * Deduped + head-gated. These beat asking a model for fresh topics: each is
 * pinned in the weekly basis, so answering it shows up as a measured flip on
 * the next audit. */
function measuredLostQuestions(
  engineKey: string,
  divergence: { query: string; won: string[]; lost: string[]; prompt_source?: string | null }[] | undefined,
  moves: OutreachMove[],
  cap = 2,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (q?: string | null, src?: string | null) => {
    const t = (q || '').replace(/\s+/g, ' ').trim();
    if (!t || seen.has(t.toLowerCase()) || isBroadHeadQuery(t, src)) return;
    seen.add(t.toLowerCase());
    // Backend /actions/start caps query at 300 chars — an over-long measured
    // question (merchant-authored prompts have no per-entry cap) would 422
    // the draft button forever.
    out.push(t.slice(0, 300));
  };
  for (const d of divergence || []) {
    if ((d?.lost || []).includes(engineKey)) push(d.query, d.prompt_source);
  }
  for (const m of moves) for (const q of m.losing_queries || []) push(q);
  return out.slice(0, cap);
}

function shortQ(q: string, max = 64): string {
  return q.length > max ? q.slice(0, max - 1) + '…' : q;
}

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
      const title = redditThreadTitle(thread, name);
      // Belt-and-suspenders: two threads with junk titles must never render
      // as two identical rows, whatever shape the junk takes.
      if (seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      out.push({
        kind: 'community',
        title,
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

  return out.slice(0, 6);
}

/** A single channel row with an outbound link + a Pivota draft-outreach button. */
/** mailto bodies have a ~2KB practical ceiling in many clients; CJK encodes
 * at ~9 bytes/char, so cap the ENCODED length (never cut mid-%XX escape) —
 * the full draft stays available via the Copy button above. */
function encodedBodyWithinBudget(draft: string, budget = 1800): string {
  let out = '';
  for (const ch of draft) {
    const enc = encodeURIComponent(ch);
    if (out.length + enc.length > budget) break;
    out += enc;
  }
  return out;
}

function ChannelRow({
  kind, title, host, url, realism, how, runId, channelHost, channelLever, channelType, query, badge, losingQueries, pitchSubmissionUrl, pitchEmail, evidenceLinks,
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
  badge?: { label: string; cls: string };
  /** Measured reason to work this channel: the losing category queries whose
   *  grounded answers cited it (backend win-plan join). Absent → no line,
   *  never an inferred one. */
  losingQueries?: string[] | null;
  /** Registry pitch path (1.3, serve-time): verified submission URL replaces
   *  the homepage link; a known recipient enables post-draft mailto. A
   *  guessed URL never reaches here — registry-curated only. */
  pitchSubmissionUrl?: string | null;
  pitchEmail?: string | null;
  /** Measured evidence for this channel: the specific cited URLs (e.g. the
   *  exact videos AI grounded answers in). Absent → no line, never inferred. */
  evidenceLinks?: string[] | null;
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
            {badge ? <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span> : null}
          </div>
        </div>
        {pitchSubmissionUrl ? (
          <a href={pitchSubmissionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[color:var(--merchant-accent,#6366f1)] hover:underline">
            Open pitch page <ExternalLink className="h-3 w-3" />
          </a>
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[color:var(--merchant-accent,#6366f1)] hover:underline">
            Open <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      {how ? <p className="mt-1 text-[11px] leading-snug opacity-70">{how}</p> : null}
      {losingQueries && losingQueries.length > 0 ? (
        <p className="mt-1 text-[11px] leading-snug">
          <span className="opacity-60">Queries you lost where this source grounded the answer: </span>
          {losingQueries.map((q, qi) => (
            <span key={qi}>
              {qi > 0 ? ' · ' : ''}
              &ldquo;{q}&rdquo;
            </span>
          ))}
        </p>
      ) : null}
      {evidenceLinks && evidenceLinks.length > 0 ? (
        <p className="mt-1 text-[11px] leading-snug">
          <span className="opacity-60">The videos AI cited — start with these creators: </span>
          {evidenceLinks.map((u, ui) => (
            <span key={ui}>
              {ui > 0 ? ' · ' : ''}
              <a href={u} target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--merchant-accent,#6366f1)] hover:underline">
                Video {ui + 1}
              </a>
            </span>
          ))}
        </p>
      ) : null}

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
                {pitchEmail ? (
                  <a
                    href={`mailto:${pitchEmail}?subject=${encodeURIComponent(
                      `Pitch: ${channelHost ?? host ?? title}`,
                    )}&body=${encodedBodyWithinBudget(st.draft)}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--merchant-accent,#6366f1)] hover:underline"
                  >
                    Email to {pitchEmail}
                  </a>
                ) : null}
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

// Phase-4 T5 — status badge for a standing vertical pitch target.
const TARGET_STATUS_META: Record<string, { label: string; cls: string }> = {
  already_endorses_you: { label: 'Already cites you', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  cited_in_your_category: { label: 'Grounds your category', cls: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  not_yet_observed: { label: 'Standing target', cls: 'border-[color:var(--merchant-line)] text-slate-500' },
};

/**
 * The vertical's standing pitch list (profile authority hosts) — rendered even
 * when this run's sample didn't cite them, so an electronics partner always
 * sees Rtings/SoundGuys/What Hi-Fi/Wirecutter as the category's targets
 * rather than only whichever hosts one probe run happened to surface.
 */
function PitchTargetsSection({ targets, runId, category }: {
  targets: PitchTarget[];
  runId?: string | null;
  category: string;
}) {
  if (!targets.length) return null;
  return (
    <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/30 p-3">
      <div className="text-xs font-bold">Your category&apos;s pitch targets</div>
      <p className="mt-0.5 text-[11px] leading-snug opacity-60">
        The review sites AI grounds this category&apos;s recommendations in. Earning a
        listing or review here moves every engine at once.
      </p>
      <div className="mt-2 space-y-1.5">
        {targets.map((t, i) => {
          const badge = TARGET_STATUS_META[t.status || ''];
          return (
            <div key={`${t.host}-${i}`}>
              <ChannelRow
                kind={t.realism === 'hard' ? 'media' : 'reviews'}
                title={t.host}
                host={t.host}
                url={`https://${t.host}`}
                realism={t.realism}
                how={t.first_move}
                runId={runId}
                channelHost={t.host}
                channelLever="editorial_outreach"
                channelType={t.realism === 'hard' ? 'media' : 'reviews'}
                query={category}
                badge={badge}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EngineGroup({
  engineKey, label, howItCites, moves, enginesByHost, category, brand, runId, starters, creatorVideos = {},
}: {
  engineKey: string;
  label: string;
  howItCites?: string;
  moves: OutreachMove[];
  enginesByHost: Record<string, string[]>;
  category: string;
  brand: string;
  runId?: string | null;
  starters: Starter[];
  /** Measured cited videos per creator host — rendered on that host's row. */
  creatorVideos?: Record<string, string[]>;
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
              losingQueries={m.losing_queries}
              pitchSubmissionUrl={m.pitch_submission_url}
              pitchEmail={m.pitch_email}
              evidenceLinks={creatorVideos[(m.host || '').toLowerCase()]}
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
            query={s.query || category || brand}
          />
        ))}
      </div>
    </div>
  );
}

/** A cited source no pitch can ever win, because a competitor owns it — its
 * "best of" roundups are the owner's marketing wearing an editorial mask
 * (hair.com is L'Oreal's house media for Redken / Kerastase / Matrix). It is
 * deliberately absent from the channels above; showing it here is the difference
 * between a merchant understanding their category and quietly concluding their
 * pitches keep failing. */
function ClosedDoor({ c }: { c: ClosedChannel }) {
  return (
    <div className="rounded-md border border-dashed border-[color:var(--merchant-line)] bg-white/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold opacity-80">{c.host}</div>
        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          Owned by a competitor
        </span>
      </div>
      <div className="mt-1 text-xs leading-snug opacity-70">{c.why_closed}</div>
      <div className="mt-2 text-xs leading-snug">
        <span className="opacity-60">What this means: </span>
        {c.what_it_means}
      </div>
    </div>
  );
}

export function GetCitedPanel({
  moves,
  pitchTargets,
  closedChannels,
  closedChannelsNote,
  enginesByHost = {},
  enginePlaybook,
  categoryHint,
  brand,
  runId,
  redditSubreddits,
  creatorVideosByHost = {},
}: {
  moves?: OutreachMove[] | null;
  /** Phase-4 T5: standing vertical pitch list (where_youre_losing.pitch_targets). */
  pitchTargets?: PitchTarget[] | null;
  /** Cited hosts a rival owns — unpitchable by construction, named not hidden. */
  closedChannels?: ClosedChannel[] | null;
  closedChannelsNote?: string | null;
  enginesByHost?: Record<string, string[]>;
  enginePlaybook?: EnginePlaybook | null;
  categoryHint?: string | null;
  brand?: string | null;
  runId?: string | null;
  // Tracked subreddits/threads from authority_map.skus[].reddit.subreddits — when
  // present + clean, we link merchants to the SPECIFIC communities AI already cites.
  redditSubreddits?: TrackedSubreddit[];
  /** Measured cited videos per creator host (extractCreatorVideosByHost).
   *  Presence of ANY measured creator evidence demotes the generic KOL
   *  search rows to a cold-start-only fallback. */
  creatorVideosByHost?: Record<string, string[]>;
}) {
  const list = (moves || []).filter((m) => m && m.host);
  const targets = (pitchTargets || []).filter((t) => t && t.host);
  const closed = (closedChannels || []).filter((c) => c && c.host);
  // A merchant whose category is dominated by rival-owned media may have few
  // channels to work and most needs the explanation — so a closed door alone is
  // enough to keep this section on screen.
  if (
    list.length === 0 && targets.length === 0 && closed.length === 0
    && !enginePlaybook?.has_signal
  ) return null;

  const category = cleanCategory(categoryHint, brand);
  const enc = encodeURIComponent;
  const catQ = category || brand || '';

  // Multiple actionable paths per engine — the more a merchant can follow, the
  // more evidence AI picks up. ChatGPT leans community/Reddit; both reward KOLs.
  // Community paths lead with the specific subreddits/threads AI already cites,
  // then the MEASURED questions this audit lost — the exact threads to find and
  // the exact questions to answer (each is pinned in the weekly basis, so an
  // answered question shows up as a measured flip on the next audit). The
  // generic search rows survive only as the nothing-specific fallback.
  const chatgptQuestions = measuredLostQuestions('chatgpt', enginePlaybook?.divergence, list);
  const geminiQuestions = measuredLostQuestions('gemini', enginePlaybook?.divergence, list);
  // Generic KOL search rows ("YouTube creators", "TikTok creators",
  // "Instagram creators") are cold-start fallbacks ONLY. When the audit
  // measured actual creator evidence — a cited creator host in the outreach
  // moves, or specific cited videos — the specific rows carry the plan and
  // the generic ones are noise (founder review of the HoverAir share report).
  const hasMeasuredCreators =
    list.some((m) => kindOf(m) === 'kol')
    || Object.values(creatorVideosByHost).some((v) => v && v.length > 0);
  const chatgptStarters: Starter[] = [
    ...buildRedditPaths(redditSubreddits || [], category),
    ...chatgptQuestions.flatMap((q): Starter[] => [
      {
        kind: 'community',
        title: `Reddit — the threads asking: “${shortQ(q)}”`,
        url: `https://www.reddit.com/search/?q=${enc(q)}`,
        how: 'A question you measurably lose on ChatGPT — add a genuine, disclosed answer where shoppers ask it.',
        query: q,
      },
      {
        kind: 'community',
        title: `Quora — answer: “${shortQ(q)}”`,
        url: `https://www.quora.com/search?q=${enc(q)}`,
        how: 'Write the genuinely helpful answer — ChatGPT grounds on threads like this.',
        query: q,
      },
    ]),
    ...(chatgptQuestions.length === 0
      ? [
          { kind: 'community' as Kind, title: 'Search Reddit for your topic', url: `https://www.reddit.com/search/?q=${enc(catQ)}`, how: 'Find the exact threads where shoppers ask about this category.' },
          { kind: 'community' as Kind, title: 'Quora — answer category questions', url: `https://www.quora.com/search?q=${enc(catQ)}`, how: 'Write genuinely helpful answers where your product fits.' },
        ]
      : []),
    ...(hasMeasuredCreators
      ? []
      : [
          { kind: 'kol' as Kind, title: 'YouTube creators — get reviewed', url: `https://www.youtube.com/results?search_query=${enc(catQ + ' review')}`, how: 'Find creators reviewing this category and offer a gifting/review collab.' },
          { kind: 'kol' as Kind, title: 'TikTok creators', url: `https://www.tiktok.com/search?q=${enc(catQ)}`, how: 'Short-form reviews build the community signal ChatGPT picks up.' },
        ]),
  ];
  const geminiStarters: Starter[] = [
    ...geminiQuestions.map((q): Starter => ({
      kind: 'reviews',
      // ChannelRow prefixes task headlines with "Get cited on ", so the
      // title must compose ("Get cited on Pages ranking for …").
      title: `Pages ranking for “${shortQ(q)}”`,
      url: `https://www.google.com/search?q=${enc(q)}`,
      how: 'The pages Google ranks for this exact ask are where Gemini grounds it — pitch them to include you.',
      query: q,
    })),
    { kind: 'reviews', title: 'Get into "best of" roundups', url: `https://www.google.com/search?q=${enc('best ' + catQ)}`, how: 'Find the review roundups Google ranks for this category and pitch to be included.' },
    ...(hasMeasuredCreators
      ? []
      : [
          { kind: 'kol' as Kind, title: 'Instagram creators', url: `https://www.google.com/search?q=${enc('instagram ' + catQ + ' creator')}`, how: 'Creator posts that get indexed feed Google-trusted signals.' },
        ]),
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
      <PitchTargetsSection targets={targets} runId={runId} category={category} />
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
          creatorVideos={creatorVideosByHost}
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
          creatorVideos={creatorVideosByHost}
        />
      </div>

      {closed.length > 0 ? (
        <div className="mt-5 border-t border-[color:var(--merchant-line)] pt-4">
          <div className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 opacity-50" />
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-55">
              Closed doors — not worth a pitch
            </div>
          </div>
          {closedChannelsNote ? (
            <p className="mt-1 text-[11px] leading-snug opacity-60">{closedChannelsNote}</p>
          ) : null}
          <div className="mt-2.5 space-y-2">
            {closed.map((c, i) => (
              <ClosedDoor key={`${c.host}-closed-${i}`} c={c} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
