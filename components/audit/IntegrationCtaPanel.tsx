'use client';

/**
 * Issue #902 item 2 — renders the brand-level integration CTAs the per-SKU
 * report now carries (`brand_rollup.integration.actions`): the "Grant GSC
 * access" CTA when Search Console isn't connected, or the "Complete Pivota
 * integration" onboarding action when store/PSP is still incomplete.
 *
 * Returns null when there's nothing to act on (fully integrated + GSC
 * connected), so it's purely additive and safe on pre-#902 runs.
 */

import { Search, Plug, ArrowRight } from 'lucide-react';
import type {
  AgentCenterBdActionItem,
  AgentCenterIntegrationBlock,
} from '@/lib/types/ai-readiness';

function ActionCard({ action }: { action: AgentCenterBdActionItem }) {
  const isGsc = action.lever === 'gsc_integration';
  const Icon = isGsc ? Search : Plug;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-emerald-900">{action.title}</div>
          <p className="mt-1 text-xs text-emerald-800/80">{action.body}</p>
          {action.cta_url ? (
            <a
              href={action.cta_url}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {action.cta_label || 'Get started'} <ArrowRight className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function IntegrationCtaPanel({
  integration,
}: {
  integration?: AgentCenterIntegrationBlock | null;
}) {
  // No fabrication: render nothing when there's no action to take.
  if (!integration || !integration.actions || integration.actions.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      {integration.actions.map((a, i) => (
        <ActionCard key={`${a.lever ?? 'action'}-${i}`} action={a} />
      ))}
    </div>
  );
}
