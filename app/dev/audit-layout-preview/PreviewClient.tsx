'use client';

import { AuditScoreStrip } from '@/components/audit/AuditScoreStrip';
import { PrioritizedActionsPanel } from '@/components/audit/PrioritizedActionsPanel';
import { OutreachMovesPanel } from '@/components/audit/OutreachMovesPanel';
import { DetailDisclosureCard } from '@/components/ui/DetailDisclosureCard';
import { SurfaceCard } from '@/components/ui/merchant-primitives';
import { actionSupportingPrompts } from '@/lib/audit/reportSummary';
import summaryFixture from '@/scripts/fixtures/report-summary.glowlab.json';
import type { OutreachMove, ReportSummary } from '@/lib/types/ai-readiness';

const summary = summaryFixture as unknown as ReportSummary;

const actions = [
  {
    sku_title: 'Hydra Serum',
    primary_gap: 'get_indexed',
    headline: 'Get Hydra Serum indexed so AI can find it.',
    first_move: 'Get it live and crawlable.',
    why_this_first: 'It is not live in the AI surface yet.',
    growth_phase: 'create_and_distribute',
    growth_phase_label: 'Create & distribute',
  },
];

const moves: OutreachMove[] = [
  {
    host: 'byrdie.com',
    host_type: 'editorial',
    action_verb: 'Pitch',
    lever: 'pitch_editorial',
    prompts_cited_count: 3,
    cited_on_category_query: true,
    headline: 'Pitch byrdie.com',
    why: 'AI grounded 3 of your probed answers in byrdie.com, and it grounds answers that recommend competitors over you.',
    losing_queries: [
      'best hydrating serum for dry skin',
      'fragrance-free serum for sensitive skin with hyaluronic acid',
    ],
  },
  {
    host: 'allure.com',
    host_type: 'editorial',
    action_verb: 'Pitch',
    lever: 'pitch_editorial',
    prompts_cited_count: 1,
    cited_on_category_query: false,
    headline: 'Pitch allure.com',
    why: 'AI grounded 1 of your probed answers in allure.com.',
    losing_queries: [],
  },
];

export function LayoutPreviewClient() {
  const evidenceByHeadline: Record<
    string,
    {
      prompts: ReturnType<typeof actionSupportingPrompts>;
      impact: { dimension?: string | null; label?: string | null } | null;
    }
  > = {};
  for (const a of summary.top_actions ?? []) {
    const prompts = actionSupportingPrompts(a);
    if (a?.headline && (prompts.length > 0 || a.impact)) {
      evidenceByHeadline[`${a.primary_gap ?? ''}|${a.headline}`] = {
        prompts,
        impact: a.impact ?? null,
      };
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <h1 className="merchant-page-title">Audit re-layout preview (dev)</h1>

      <SurfaceCard
        eyebrow="AI visibility · per product"
        title="How AI sees each of your products"
      >
        <AuditScoreStrip summary={summary} runId={null} />
        <div className="space-y-2 px-5 py-4">
          <p className="text-sm">
            <span className="font-semibold">0</span> of{' '}
            <span className="font-semibold">1</span> product is cited by AI
            shopping agents for the buyer-intent prompts we tested.
          </p>
        </div>
      </SurfaceCard>

      <PrioritizedActionsPanel actions={actions} evidenceByHeadline={evidenceByHeadline} />

      <OutreachMovesPanel moves={moves} />

      <DetailDisclosureCard
        title="Full product-level diagnostics"
        subtitle="Per-product scorecards, engine playbooks, the verbatim AI answers we probed, channel routing, and your custom prompts."
        badge="1 product"
      >
        <SurfaceCard>
          <div className="px-5 py-4 text-sm">
            (Per-product cards render here — hidden, never unmounted.)
          </div>
        </SurfaceCard>
      </DetailDisclosureCard>
    </div>
  );
}
