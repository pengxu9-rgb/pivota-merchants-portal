'use client';

/**
 * "Lite AI" interaction — the cheapest way to FEEL like an intelligent agent
 * without any new backend or LLM call: a few pre-defined, context-aware prompt
 * chips whose answers are synthesized ON THE CLIENT from fields already in the
 * report (the split, the substitution, the channels, the real brief). Each chip
 * is a question a merchant would actually ask; the answer is grounded and honest
 * (no black box). This is the MVP step toward the eventual context-aware chat —
 * it establishes the interaction pattern with zero engineering risk.
 *
 * Renders nothing when there's no grounded discovery signal to talk about.
 */

import { useState } from 'react';
import { MessageCircleQuestion, Send, Loader2, Sparkles } from 'lucide-react';
import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';
import { realBrief } from '@/lib/audit/strategicBrief';
import { apiClient } from '@/lib/api-client';

interface Chip {
  q: string;
  a: string;
}

function firstMoveText(report: AgentCenterPerSkuReport): string | null {
  const nba = report.next_best_action;
  const brief = realBrief(nba);
  const m = brief?.first_moves?.find((x) => typeof x === 'string') as string | undefined;
  const move = m || nba?.first_move || nba?.self_serve?.[0] || null;
  return move ? move.replace(/^\s*\d+[.)]\s*/, '') : null;
}

function buildChips(report: AgentCenterPerSkuReport): Chip[] {
  const pc = report.product_competitiveness;
  if (!pc || pc.grounding_unavailable || !pc.has_discovery) return [];

  const d = pc.discovery;
  const total = d.total;
  const recommended = d.appeared_recommended ?? 0;
  const listing = d.appeared_listing ?? d.appeared;
  const topCompetitor = d.top_competitors?.[0]?.name || null;
  const competitors = (d.top_competitors || []).slice(0, 4).map((c) => c.name);
  const topChannel = (report.channel_appearance?.channels || [])
    .filter((c) => !c.is_own_site)
    .sort((a, b) => (b.cited_query_count || 0) - (a.cited_query_count || 0))[0];
  const brief = realBrief(report.next_best_action);
  const firstMove = firstMoveText(report);

  const chips: Chip[] = [];

  // The one-breath synthesis the card spreads across panels.
  chips.push({
    q: "What's the bottom line?",
    a:
      `When shoppers ask the category question, AI ` +
      (topCompetitor ? `recommends rivals like ${topCompetitor}` : 'recommends competitors') +
      (topChannel ? ` and routes buyers to ${topChannel.host}` : '') +
      ` — not you. You appear in ${listing}/${total} discovery searches, but that's your ` +
      `listing being retrieved, not an endorsement (${recommended}/${total} are independent ` +
      `recommendations). To win you need independent citations — reviews, editorial, community — ` +
      `not just a listing.`,
  });

  if (recommended === 0 && listing > 0) {
    chips.push({
      q: 'Why am I findable but not recommended?',
      a:
        `Findable means AI can pull up your page; recommended means an independent source vouches ` +
        `for you. AI can find you (${listing}/${total}) but no third party endorses you ` +
        `(${recommended}/${total}). ` +
        (topChannel ? `${topChannel.host} carries your listing, while ` : '') +
        `rivals${topCompetitor ? ` like ${topCompetitor}` : ''} earn the editorial/community ` +
        `mentions AI trusts.`,
    });
  }

  if (competitors.length > 0) {
    chips.push({
      q: 'Who is winning, and why?',
      a:
        `${competitors.join(', ')}. ` +
        (brief?.why_you_lose
          ? brief.why_you_lose
          : `AI grounds these category answers in third-party sources` +
            (topChannel ? ` like ${topChannel.host}` : '') +
            ` that cite them, not you.`),
    });
  }

  if (firstMove) {
    chips.push({ q: 'What should I do first?', a: firstMove });
  }

  return chips;
}

/**
 * Freeform "ask anything" box. Only renders when a runId is available (it needs
 * a completed run to ground against). Calls the backend, which answers using
 * ONLY this run's audit data via ungrounded DeepSeek — so the reply stays
 * faithful to the report. Rendered as a clearly-labelled "AI summary", distinct
 * from the deterministic numbers above, which remain the source of truth.
 */
function FreeformAsk({
  runId,
  productKey,
}: {
  runId: string;
  productKey?: string | null;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const q = question.trim();
    if (q.length < 3 || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await apiClient.askAuditQuestion({ runId, question: q, productKey });
      setAnswer(res?.answer || 'No answer came back — please try again.');
    } catch {
      setError("Couldn't get an answer right now — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 border-t border-[color:var(--merchant-line)] pt-3">
      <label className="text-[11px] font-medium opacity-60">
        Or ask your own question
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          maxLength={500}
          placeholder="e.g. How do I get cited on the editorial sites?"
          className="min-w-0 flex-1 rounded-md border border-[color:var(--merchant-line)] bg-white/70 px-2.5 py-1.5 text-xs outline-none focus:border-[color:var(--merchant-accent,#6366f1)]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading || question.trim().length < 3}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[color:var(--merchant-accent,#6366f1)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--merchant-accent,#6366f1)] disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Ask
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      {answer ? (
        <div className="mt-2 rounded bg-white/70 px-3 py-2">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-50">
            <Sparkles className="h-3 w-3" />
            AI summary · grounded in your audit
          </div>
          <p className="text-xs leading-relaxed">{answer}</p>
        </div>
      ) : null}
    </div>
  );
}

export function AskAboutThis({
  report,
  runId,
}: {
  report: AgentCenterPerSkuReport;
  runId?: string | null;
}) {
  const chips = buildChips(report);
  const [open, setOpen] = useState<number | null>(null);
  if (chips.length === 0 && !runId) return null;

  return (
    <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        <MessageCircleQuestion className="h-3.5 w-3.5" />
        Ask about this product
      </div>
      {chips.length > 0 ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setOpen((v) => (v === i ? null : i))}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  open === i
                    ? 'border-[color:var(--merchant-accent,#6366f1)] bg-[color:var(--merchant-accent,#6366f1)]/10 font-medium'
                    : 'border-[color:var(--merchant-line)] hover:bg-black/5'
                }`}
              >
                {c.q}
              </button>
            ))}
          </div>
          {open != null ? (
            <p className="mt-2 rounded bg-white/70 px-3 py-2 text-xs leading-relaxed">{chips[open].a}</p>
          ) : null}
        </>
      ) : null}
      {runId ? <FreeformAsk runId={runId} productKey={report.product_key} /> : null}
    </div>
  );
}
