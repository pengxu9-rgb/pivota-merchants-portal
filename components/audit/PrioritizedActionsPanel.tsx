'use client';

/**
 * Run-level "Start here" — merchant_narrative.prioritized_actions, the ranked
 * per-product first moves. Each action's growth-phase chip is now an ACTIVE
 * button: clicking it creates a real, tracked follow-up task AND has Pivota draft
 * the deliverable (comparison copy / outreach template) grounded in the audit.
 * The merchant gets a durable to-do plus a ready-to-paste draft; publishing /
 * distributing stays theirs (or a connected store/service) for now.
 */

import { useState, type ReactNode } from 'react';
import { ListChecks, ArrowRight, Loader2, Check, Sparkles, Copy } from 'lucide-react';
import type {
  NarrativePrioritizedAction,
  ReportSummaryPromptEvidence,
} from '@/lib/types/ai-readiness';
import { apiClient } from '@/lib/api-client';
import { Disclosure } from '@/components/ui/Disclosure';
import { LockedActionsCard } from '@/components/audit/LockedActionsCard';
import { PromptEvidenceList } from '@/components/audit/PromptEvidenceList';

interface ActionState {
  loading?: boolean;
  done?: boolean;
  draft?: string | null;
  placement?: {
    kind?: string;
    label?: string | null;
    url?: string | null;
    target_host?: string | null;
  } | null;
  error?: string | null;
  copied?: boolean;
}

// Pitch-shaped first moves ("get cited there: pitch them…") confused merchants
// clicking the on-page draft button — "what is our target media?" The media
// target lives in the Get-cited panel below; say so instead of leaving the
// on-page draft to answer a question it can't.
const PITCH_SHAPED = /\bpitch\b|\bget cited\b|\bcited there\b/i;

function ActionButton({
  action,
  runId,
}: {
  action: NarrativePrioritizedAction;
  runId: string;
}) {
  const [st, setSt] = useState<ActionState>({});
  // This drafts the merchant's OWN-page version (a comparison/section). It's a
  // supporting step — agents mostly cite third-party sources, so the higher
  // leverage is "Get cited on independent sources" below.
  const label = 'Draft on-page version';

  async function run() {
    if (st.loading || st.done) return;
    setSt({ loading: true });
    try {
      const res = await apiClient.startAuditAction({
        runId,
        headline: action.headline,
        firstMove: action.first_move,
        skuTitle: action.sku_title,
        growthPhase: action.growth_phase,
        primaryGap: action.primary_gap,
      });
      setSt({
        done: true,
        draft: res?.draft ?? null,
        placement: res?.placement ?? null,
      });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setSt({
        error:
          status === 402
            ? "You're out of credits — top up to add this."
            : "Couldn't add this right now — try again.",
      });
    }
  }

  async function copy() {
    if (!st.draft) return;
    try {
      await navigator.clipboard.writeText(st.draft);
      setSt((s) => ({ ...s, copied: true }));
      setTimeout(() => setSt((s) => ({ ...s, copied: false })), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  if (st.done) {
    return (
      <div className="mt-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <Check className="h-3 w-3" /> In your plan
        </span>
        {st.draft ? (
          <div className="mt-2 rounded-md border border-[color:var(--merchant-line)] bg-white/70 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--merchant-accent,#6366f1)]">
                <Sparkles className="h-3 w-3" /> Pivota draft — ready to publish
              </span>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 text-[10px] font-medium opacity-60 hover:opacity-100"
              >
                <Copy className="h-3 w-3" /> {st.copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{st.draft}</p>
            <p className="mt-1.5 border-t border-[color:var(--merchant-line)] pt-1.5 text-[10px] leading-snug opacity-70">
              {st.placement?.url && /^https?:\/\//.test(st.placement.url) ? (
                <>
                  <span className="font-semibold">Where:</span> paste this into{' '}
                  <a
                    href={st.placement.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {st.placement.url.replace(/^https?:\/\//, '')}
                  </a>
                  {action.sku_title ? <> — the page for {action.sku_title}</> : null}.
                </>
              ) : st.placement?.target_host ? (
                <>
                  <span className="font-semibold">Where:</span> send this to{' '}
                  {st.placement.target_host}.
                </>
              ) : (
                <>Publish this on your store or paste it into the channel.</>
              )}{' '}
              <span className="opacity-70">
                Connect your store to let Pivota publish &amp; distribute automatically.
              </span>
            </p>
            {PITCH_SHAPED.test(action.first_move || '') ? (
              <p className="mt-1 text-[10px] leading-snug opacity-70">
                This draft strengthens your own page. The <span className="font-semibold">media
                target</span> for this ask — with a ready-to-send pitch — is in{' '}
                <span className="font-semibold">Get cited on independent sources</span> below.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-[11px] leading-snug opacity-55">
            Tracked in your plan — open it to work on this. (Top up credits to have Pivota
            draft it for you.)
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={run}
        disabled={st.loading}
        className="inline-flex items-center gap-1 rounded-full border border-[color:var(--merchant-accent,#6366f1)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--merchant-accent,#6366f1)] transition-colors hover:bg-[color:var(--merchant-accent,#6366f1)]/10 disabled:opacity-50"
      >
        {st.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {st.loading ? 'Adding…' : label}
      </button>
      {st.error ? <p className="mt-1 text-[11px] text-red-700">{st.error}</p> : null}
    </div>
  );
}

export function PrioritizedActionsPanel({
  actions,
  runId,
  evidenceByHeadline,
  locked,
  lockedCount,
  lockedTeaserHeadline,
  upgradeCta,
}: {
  actions?: NarrativePrioritizedAction[] | null;
  runId?: string | null;
  /** Measured prompt evidence + impact per action (report_summary contract,
   *  keyed gap|headline). prompts: niche-first selection — never lead with
   *  head terms; impact: which dimension the action lifts (1.3). Absent →
   *  nothing rendered, never inferred. */
  evidenceByHeadline?: Record<
    string,
    {
      prompts: ReportSummaryPromptEvidence[];
      impact: { dimension?: string | null; label?: string | null } | null;
    }
  >;
  /** Free-tier paywall (backend `actions_locked`): the actions array arrives
   *  emptied, so the locked card renders from these markers — an empty array
   *  alone still means "nothing to show" and hides the panel. */
  locked?: boolean;
  lockedCount?: number;
  lockedTeaserHeadline?: string | null;
  upgradeCta?: ReactNode;
}) {
  const items = (actions || []).filter((a) => a && (a.headline || a.first_move));
  if (locked && items.length === 0) {
    // Nothing was behind the lock for this section → hide, don't advertise.
    if ((lockedCount ?? 0) === 0) return null;
    return (
      <LockedActionsCard
        title="Start here — your highest-impact moves"
        count={lockedCount ?? 0}
        teaserHeadline={lockedTeaserHeadline}
        upgradeCta={upgradeCta}
      />
    );
  }
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        <ListChecks className="h-3.5 w-3.5" />
        Start here — your highest-impact moves
      </div>
      <p className="mt-1 text-[11px] leading-snug opacity-60">
        These strengthen your own page. AI mostly cites <em>independent</em> sources, so pair each
        with third-party proof in <span className="font-medium">Get cited on independent sources</span> below.
      </p>
      <ol className="mt-2 space-y-2.5">
        {items.slice(0, 6).map((a, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium leading-snug">{a.headline}</span>
                {(() => {
                  const impact = a.headline
                    ? evidenceByHeadline?.[`${a.primary_gap ?? ''}|${a.headline}`]?.impact
                    : undefined;
                  return impact?.label ? (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                      Lifts: {impact.label}
                    </span>
                  ) : null;
                })()}
              </div>
              {(a.sku_titles?.length ? a.sku_titles.join(' \u00b7 ') : a.sku_title) ? (
                <div className="mt-0.5 truncate text-[11px] opacity-55">
                  {a.sku_titles?.length ? a.sku_titles.join(' \u00b7 ') : a.sku_title}
                </div>
              ) : null}
              {a.first_move ? (
                <div className="mt-1 flex items-start gap-1 text-xs">
                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
                  <span>{a.first_move}</span>
                </div>
              ) : null}
              {a.why_this_first ? (
                <div className="mt-0.5 text-[11px] leading-snug opacity-60">
                  {a.why_this_first}
                </div>
              ) : null}
              {(() => {
                const evidence = a.headline
                  ? evidenceByHeadline?.[`${a.primary_gap ?? ''}|${a.headline}`]?.prompts
                  : undefined;
                if (!evidence || evidence.length === 0) return null;
                return (
                  <Disclosure
                    className="mt-1"
                    label="Why this — what the AI answers showed"
                    labelOpen="Hide the measured evidence"
                  >
                    <PromptEvidenceList prompts={evidence} />
                  </Disclosure>
                );
              })()}
              {runId ? (
                <ActionButton action={a} runId={runId} />
              ) : a.growth_phase_label ? (
                <span className="mt-1 inline-block rounded-full border border-[color:var(--merchant-line)] px-2 py-0.5 text-[10px] uppercase tracking-wide opacity-60">
                  {a.growth_phase_label}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
