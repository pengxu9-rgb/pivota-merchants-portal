'use client';

/**
 * Off-platform outreach moves — the "do this even without a connected store"
 * actions derived from the hosts AI cites instead of you (editorial sites to
 * pitch, retailers to get carried by, communities to engage, creators to
 * partner with). Brand-level; rendered on the URL audit.
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

export function OutreachMovesPanel({ moves }: { moves: OutreachMove[] | undefined }) {
  if (!moves || moves.length === 0) return null;
  return (
    <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white/40 p-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-[color:var(--merchant-accent,#6366f1)]" />
        <div className="text-sm font-semibold">Get cited where AI already looks</div>
      </div>
      <p className="mt-1 text-xs opacity-60">
        AI grounds its answers in these sources — and cites competitors there, not
        you. These moves work without connecting your store.
      </p>
      <div className="mt-3 space-y-2.5">
        {moves.map((m, i) => (
          <div
            key={`${m.host}-${i}`}
            className="rounded-md border border-[color:var(--merchant-line)] bg-white/40 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold">{m.headline}</div>
              <span className="shrink-0 rounded-full border border-[color:var(--merchant-line)] px-2 py-0.5 text-[11px] font-medium opacity-70">
                {LEVER_LABEL[m.lever] ?? m.host_type}
              </span>
            </div>
            {m.why ? <div className="mt-1 text-xs opacity-70">{m.why}</div> : null}
            {m.first_move ? (
              <div className="mt-2 text-xs">
                <span className="opacity-60">First move: </span>
                {m.first_move}
              </div>
            ) : null}
            {m.pitch_recipient ? (
              <div className="mt-1.5 inline-flex items-center gap-1 text-xs">
                <Mail className="h-3 w-3 opacity-60" />
                <span className="font-medium">{m.pitch_recipient}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
