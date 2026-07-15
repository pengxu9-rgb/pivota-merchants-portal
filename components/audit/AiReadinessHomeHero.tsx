'use client';

/**
 * The Overview page's AI-readiness hero (AI_READINESS_HOME flag) — the first
 * thing a merchant sees answers their first question: "can AI agents recommend
 * me?" Two states, both honest:
 *   - Latest succeeded visibility check → its report_summary score + verdict
 *     + the top action, verbatim from the contract (never re-derived).
 *   - No audit yet (or the summary isn't renderable) → the funnel into the
 *     URL-visibility wedge: paste product links, no setup, first checks free.
 * Loading renders nothing (no layout pop-in), and every fetch failure degrades
 * to the funnel — the hero never blocks the Overview page.
 */

import { useEffect, useState } from 'react';
import { ArrowRight, ScanEye } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  MerchantLinkButton,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';
import {
  bandLabel,
  bandTone,
  formatDisplayDelta,
  formatDisplayScore,
  pickLatestSucceededRunId,
  summaryRenderable,
} from '@/lib/audit/reportSummary';
import type {
  ReportSummary,
  UrlReadinessAuditResponse,
} from '@/lib/types/ai-readiness';

const URL_AUDIT_HREF = '/dashboard/agent-center/url-audit';

type HeroState = 'loading' | 'empty' | 'summary';

export function AiReadinessHomeHero() {
  const [state, setState] = useState<HeroState>('loading');
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const runs = await apiClient.listAuditRuns(5, 'merchant_url');
        const runId = pickLatestSucceededRunId(runs);
        if (!runId) {
          if (!cancelled) setState('empty');
          return;
        }
        const detail = await apiClient.getUrlAuditRunDetail(runId);
        const s =
          (detail as UrlReadinessAuditResponse | null)?.report_summary ?? null;
        if (cancelled) return;
        if (s && summaryRenderable(s)) {
          setSummary(s);
          setState('summary');
        } else {
          // A run exists but predates the summary contract (or its build
          // failed) — the funnel still points somewhere useful.
          setState('empty');
        }
      } catch {
        if (!cancelled) setState('empty');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') return null;

  if (state === 'empty' || !summary) {
    return (
      <SurfaceCard strong eyebrow="AI readiness">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              Can AI shopping agents recommend your products?
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
              Paste a few product links and see how Gemini + ChatGPT cite them —
              which competitors win instead, and what to do about it. No catalog
              sync, and your first checks are free.
            </p>
          </div>
          <div className="shrink-0">
            <MerchantLinkButton href={URL_AUDIT_HREF} icon={ScanEye}>
              Run a free visibility check
            </MerchantLinkButton>
          </div>
        </div>
      </SurfaceCard>
    );
  }

  const score = summary.score ?? {};
  const display = formatDisplayScore(score.display);
  const label = bandLabel(score.band);
  const delta = formatDisplayDelta(score.delta?.raw);
  const firstAction = (summary.top_actions ?? []).find((a) => a && a.headline);

  return (
    <SurfaceCard strong eyebrow="AI readiness">
      <div className="space-y-3 px-5 py-5 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tabular-nums">
              {display ?? '—'}
            </span>
            <span className="merchant-text-muted text-sm">
              / {score.scale_max ?? 10}
            </span>
          </div>
          {label ? (
            <StatusBadge tone={bandTone(score.band)}>{label}</StatusBadge>
          ) : null}
          {delta ? (
            <span className="merchant-text-muted text-xs">
              {delta} since your last audit
            </span>
          ) : null}
        </div>
        {summary.verdict?.headline ? (
          <p className="max-w-3xl text-sm font-medium leading-relaxed">
            {summary.verdict.headline}
          </p>
        ) : null}
        {firstAction ? (
          <p className="max-w-3xl text-xs leading-relaxed">
            <span className="merchant-text-muted">Next move: </span>
            {firstAction.headline}
          </p>
        ) : null}
        <div>
          <MerchantLinkButton href={URL_AUDIT_HREF} icon={ArrowRight} variant="secondary">
            See the full report
          </MerchantLinkButton>
        </div>
      </div>
    </SurfaceCard>
  );
}
