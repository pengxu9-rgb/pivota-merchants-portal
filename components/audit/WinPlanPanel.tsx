'use client';

/**
 * Fix 4 — the per-SKU win-plan: how to win the AI agent's category
 * recommendation. For each losing category query it shows the independent hosts
 * AI grounds the answer in (the targets to get cited in), the competitor
 * benchmark, the win condition, and the honest outreach path per target —
 * including a one-click pitch (mailto) for draft-ready targets.
 *
 * Guardrails mirrored from the backend: only real grounded hosts/competitors;
 * a target with no recipient shows as "target only" (never a fabricated email);
 * findability is never a target; honest `limit` / `note` strings render verbatim.
 */

import { useState } from 'react';
import {
  Trophy,
  Mail,
  ExternalLink,
  Crosshair,
  Copy,
  Check,
  Swords,
} from 'lucide-react';
import type {
  AgentCenterWinPlan,
  WinPlanLosingQuery,
  WinPlanSkuPlan,
  WinPlanTarget,
} from '@/lib/types/ai-readiness';

function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function TierChip({ tier }: { tier: number | null }) {
  if (tier == null) return null;
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
      Tier {tier}
    </span>
  );
}

function StateBadge({ state }: { state: WinPlanTarget['outreach']['state'] }) {
  const map = {
    draft_ready: { cls: 'bg-green-100 text-green-800', label: 'Ready to pitch' },
    submission_only: { cls: 'bg-amber-100 text-amber-800', label: 'Submit via form' },
    target_only: { cls: 'bg-slate-100 text-slate-600', label: 'Target — no contact yet' },
  }[state];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map.cls}`}>
      {map.label}
    </span>
  );
}

function cycleText(cycle: [number, number] | null): string | null {
  if (!cycle || cycle.length !== 2) return null;
  const [lo, hi] = cycle;
  if (!lo && !hi) return null;
  return lo === hi ? `~${lo} wks` : `${lo}–${hi} wks`;
}

function TargetRow({ target }: { target: WinPlanTarget }) {
  const [open, setOpen] = useState(false);
  const o = target.outreach;
  const cycle = cycleText(o.cycle_weeks);
  const draft = o.pitch_draft;

  return (
    <li className="rounded-md border border-slate-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{target.host}</span>
        <TierChip tier={target.tier} />
        <StateBadge state={o.state} />
        {cycle ? <span className="text-[10px] text-slate-400">{cycle}</span> : null}
      </div>

      {o.hint ? <p className="mt-1 text-xs text-slate-500">{o.hint}</p> : null}

      {/* Actions: one-click mailto for draft_ready; the form link for
          submission_only; nothing fabricated for target_only. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {draft ? (
          <>
            <a
              href={mailtoHref(draft.recipient_email, draft.subject, draft.body)}
              className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700"
            >
              <Mail className="h-3 w-3" /> Pitch {draft.recipient_email}
            </a>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-[11px] font-medium text-indigo-700 hover:underline"
            >
              {open ? 'Hide draft' : 'Preview draft'}
            </button>
          </>
        ) : o.state === 'submission_only' && o.recipient?.submission_url ? (
          <a
            href={o.recipient.submission_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
          >
            <ExternalLink className="h-3 w-3" /> Open submission form
          </a>
        ) : o.recipient?.email ? (
          <span className="text-[11px] text-slate-500">Contact: {o.recipient.email}</span>
        ) : (
          <span className="text-[11px] italic text-slate-400">
            No published pitch contact yet — strongest target, recipient pending.
          </span>
        )}
      </div>

      {draft && open ? (
        <div className="mt-2 rounded border border-slate-200 bg-slate-50/70 p-2.5">
          <div className="text-[11px] font-semibold text-slate-600">
            Subject: <span className="font-normal">{draft.subject}</span>
          </div>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-slate-700">
            {draft.body}
          </pre>
          {draft.recipient_note ? (
            <p className="mt-1 text-[11px] italic text-slate-400">{draft.recipient_note}</p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <CopyButton text={draft.body} label="Copy body" />
            <CopyButton text={draft.subject} label="Copy subject" />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function LosingQueryCard({ q }: { q: WinPlanLosingQuery }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
      <div className="flex items-start gap-2">
        <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">&ldquo;{q.query}&rdquo;</div>
          {q.win_condition ? (
            <div className="mt-0.5 text-xs text-slate-600">{q.win_condition}</div>
          ) : null}
        </div>
      </div>

      {q.competitor_benchmark.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Swords className="h-3.5 w-3.5 text-rose-500" />
          <span>Winning today:</span>
          {q.competitor_benchmark.map((c) => (
            <span
              key={c}
              className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-800"
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}

      {q.grounds_in.length > 0 ? (
        <div className="mt-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Get cited in
          </div>
          <ul className="mt-1 space-y-1.5">
            {q.grounds_in.map((t) => (
              <TargetRow key={t.host} target={t} />
            ))}
          </ul>
        </div>
      ) : null}

      {q.limit ? <p className="mt-2 text-xs italic text-slate-400">{q.limit}</p> : null}
    </div>
  );
}

function SkuPlanBlock({
  plan,
  label,
}: {
  plan: WinPlanSkuPlan;
  // Recognizable product label resolved from the audit's per_sku_reports (the
  // win-plan's own rows only carry the raw sku_title, e.g. "2 Box").
  label?: { name: string; variant?: string };
}) {
  if (plan.losing_queries.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-800">
        {label?.name || plan.sku_title || plan.sku_key}
        {label?.variant ? (
          <span className="ml-1.5 inline-block rounded bg-white px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-indigo-500">
            {label.variant}
          </span>
        ) : null}
      </div>
      <div className="space-y-2">
        {plan.losing_queries.map((q, i) => (
          <LosingQueryCard key={`${q.query}-${i}`} q={q} />
        ))}
      </div>
    </div>
  );
}

export function WinPlanPanel({
  winPlan,
  skuLabels,
}: {
  winPlan?: AgentCenterWinPlan | null;
  skuLabels?: Record<string, { name: string; variant?: string }>;
}) {
  // No fabrication: render nothing when there's no plan at all.
  if (!winPlan || !winPlan.available) return null;

  const roll = winPlan.rollup;
  const hostCount = roll.independent_hosts_to_win.length;
  const pitchCount = roll.pitch_ready_hosts.length;

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/30 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
        <Trophy className="h-5 w-5 text-indigo-600" /> How to win the recommendation
      </div>
      <p className="mt-1 text-xs text-indigo-800/80">
        AI recommends the products it can ground in independent sources for the category
        question — not from your own listing. To win, get cited in the exact hosts it
        grounds those answers in.
      </p>

      {/* Brand rollup line */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-indigo-900/80">
        <span>
          <span className="font-semibold">{roll.losing_category_queries}</span> losing category{' '}
          {roll.losing_category_queries === 1 ? 'query' : 'queries'}
        </span>
        <span>
          <span className="font-semibold">{hostCount}</span> independent{' '}
          {hostCount === 1 ? 'host' : 'hosts'} to win
        </span>
        <span>
          <span className="font-semibold">{pitchCount}</span> ready-to-send{' '}
          {pitchCount === 1 ? 'pitch' : 'pitches'}
        </span>
      </div>

      {winPlan.note ? (
        <p className="mt-2 text-xs italic text-indigo-700/70">{winPlan.note}</p>
      ) : null}

      <div className="mt-3 space-y-4">
        {winPlan.sku_plans.map((plan) => (
          <SkuPlanBlock key={plan.sku_key} plan={plan} label={skuLabels?.[plan.sku_key]} />
        ))}
      </div>
    </div>
  );
}
