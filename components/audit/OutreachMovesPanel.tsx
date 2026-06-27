'use client';

/**
 * Off-platform outreach moves — the "do this even without a connected store"
 * actions derived from the hosts AI cites instead of you.
 *
 * Sorted/grouped by REALISM for an emerging brand: lead with what's actually
 * reachable (earn reviews, engage community), then things worth investigating,
 * and demote the "longer game" major-publisher moves into a de-emphasized block
 * with their reframed first move ("build reviews + community first; editorial
 * follows") — never surfaced as a primary CTA. Brand-level; rendered on the URL
 * audit.
 */

import { Megaphone, Mail } from 'lucide-react';
import type { OutreachMove } from '@/lib/types/ai-readiness';

const LEVER_LABEL: Record<string, string> = {
  editorial_outreach: 'Editorial',
  wholesale_onboarding: 'Retail',
  marketplace_listing: 'Marketplace',
  research: 'Community',
  creator_partnership: 'Creators',
};

const REALISM: Record<string, { label: string; cls: string; rank: number }> = {
  reachable: { label: 'Reachable', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', rank: 0 },
  diy: { label: 'DIY', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', rank: 1 },
  onboarding: { label: 'Onboarding', cls: 'border-indigo-200 bg-indigo-50 text-indigo-700', rank: 2 },
  investigate: { label: 'Investigate', cls: 'border-amber-200 bg-amber-50 text-amber-700', rank: 3 },
  hard: { label: 'Longer game', cls: 'border-[color:var(--merchant-line)] text-slate-500', rank: 4 },
};

function rankOf(m: OutreachMove): number {
  const entry = m.realism ? REALISM[m.realism] : undefined;
  return entry?.rank ?? 2.5;
}

function MoveCard({ m, muted }: { m: OutreachMove; muted?: boolean }) {
  const realism = m.realism ? REALISM[m.realism] : undefined;
  return (
    <div
      className={`rounded-md border border-[color:var(--merchant-line)] p-3 ${
        muted ? 'bg-white/20 opacity-80' : 'bg-white/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`font-semibold ${muted ? 'text-xs' : 'text-sm'}`}>{m.headline}</div>
        <div className="flex shrink-0 items-center gap-1">
          {realism ? (
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${realism.cls}`}>
              {realism.label}
            </span>
          ) : null}
          <span className="rounded-full border border-[color:var(--merchant-line)] px-2 py-0.5 text-[11px] font-medium opacity-70">
            {LEVER_LABEL[m.lever] ?? m.host_type}
          </span>
        </div>
      </div>
      {m.why && !muted ? <div className="mt-1 text-xs opacity-70">{m.why}</div> : null}
      {m.first_move ? (
        <div className={`mt-2 ${muted ? 'text-[11px] opacity-70' : 'text-xs'}`}>
          {!muted ? <span className="opacity-60">First move: </span> : null}
          {m.first_move}
        </div>
      ) : null}
      {m.pitch_recipient && !muted ? (
        <div className="mt-1.5 inline-flex items-center gap-1 text-xs">
          <Mail className="h-3 w-3 opacity-60" />
          <span className="font-medium">{m.pitch_recipient}</span>
        </div>
      ) : null}
    </div>
  );
}

export function OutreachMovesPanel({ moves }: { moves: OutreachMove[] | undefined }) {
  if (!moves || moves.length === 0) return null;

  const sorted = [...moves].sort((a, b) => rankOf(a) - rankOf(b));
  const primary = sorted.filter((m) => rankOf(m) <= 3); // reachable…investigate
  const longGame = sorted.filter((m) => rankOf(m) >= 4); // hard

  return (
    <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white/40 p-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-[color:var(--merchant-accent,#6366f1)]" />
        <div className="text-sm font-semibold">Get cited where AI already looks</div>
      </div>
      <p className="mt-1 text-xs opacity-60">
        AI cites these sources and recommends competitors there, not you. Start with what an
        emerging brand can actually move — reviews and community — these work without connecting
        your store.
      </p>

      {primary.length > 0 ? (
        <div className="mt-3 space-y-2.5">
          {primary.map((m, i) => (
            <MoveCard key={`${m.host}-${i}`} m={m} />
          ))}
        </div>
      ) : null}

      {longGame.length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide opacity-50">
            The longer game
          </div>
          <p className="mt-0.5 text-[11px] leading-snug opacity-55">
            Major publishers rarely cover an emerging brand cold — these follow once your reviews
            and community presence build. Not a starting move.
          </p>
          <div className="mt-2 space-y-2">
            {longGame.map((m, i) => (
              <MoveCard key={`${m.host}-lg-${i}`} m={m} muted />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
