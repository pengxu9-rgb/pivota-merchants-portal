'use client';

import {
  type AgentPushSummary,
  type MerchantReadinessAction,
  type OptimizationPlan,
  type ReadinessIssueBucket,
  type ReadinessOptimizationPayload,
  type ReadinessSummary,
  type ScoreBundle,
  type SourceDataReasonCode,
  getReadinessTone,
} from '../_shared';

interface CatalogHealthHeaderProps {
  readinessSummary: ReadinessSummary;
  fromReadiness: boolean;
  optimizationData: ReadinessOptimizationPayload | null;
  optimizationPlan: OptimizationPlan | null;
  scoreBundle: ScoreBundle | null;
  agentPushSummary: AgentPushSummary | null;
  contentOpportunityCount: number;
  readinessLoading: boolean;
  loadOptimizationData: (options?: {
    refresh?: boolean;
    scope?: 'merchant' | 'product' | 'variant';
    reason?: string;
    reasonCode?: SourceDataReasonCode;
    page?: number;
  }) => Promise<ReadinessOptimizationPayload | null>;
  storeSetupActions: MerchantReadinessAction[];
  issueBuckets: ReadinessIssueBucket[];
  summaryTopIssues: Array<{ code: string; label: string; count: number }>;
  productActions: MerchantReadinessAction[];
  merchantActions: MerchantReadinessAction[];
  pivotaManagedActions: MerchantReadinessAction[];
}

export function CatalogHealthHeader({
  readinessSummary,
  fromReadiness,
  optimizationData,
  optimizationPlan,
  scoreBundle,
  agentPushSummary,
  contentOpportunityCount,
  readinessLoading,
  loadOptimizationData,
  storeSetupActions,
  issueBuckets,
  summaryTopIssues,
  productActions,
  merchantActions,
  pivotaManagedActions,
}: CatalogHealthHeaderProps) {
  return (
        <div className={`rounded-xl border p-5 ${getReadinessTone(readinessSummary.tier).card}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getReadinessTone(readinessSummary.tier).badge}`}>
                  {readinessSummary.label}
                </span>
                <span className="text-sm font-medium text-slate-900">
                  Catalog health score {readinessSummary.score ?? '—'}
                </span>
                <span className="text-sm text-slate-600">
                  {readinessSummary.ready_variant_count} ready / {readinessSummary.blocked_variant_count} blocked variants
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-bold text-gray-900">
                {fromReadiness ? 'Catalog health plan' : 'Catalog health'}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-700">
                {readinessSummary.summary_text || 'Use this page to fix the catalog and setup issues that are blocking channel launch and merchant readiness.'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                  {readinessSummary.action_text || readinessSummary.next_action || 'Start with the highest-priority issues first'}
                </span>
                {agentPushSummary && (
                  <>
                    <span className="rounded-full bg-white px-3 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
                      {agentPushSummary.eligible_products} push-ready products
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 font-medium text-amber-700 ring-1 ring-amber-200">
                      {agentPushSummary.excluded_products} auto-excluded products
                    </span>
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                {optimizationData?.last_generated_at && (
                  <span>
                    Last checked {new Date(optimizationData.last_generated_at).toLocaleString()}
                  </span>
                )}
                {optimizationPlan?.last_successful_rescore_at && (
                  <span>
                    Last rescore {new Date(optimizationPlan.last_successful_rescore_at).toLocaleString()}
                  </span>
                )}
                {optimizationPlan?.plan_id && (
                  <span>Plan {optimizationPlan.plan_id.slice(-8)}</span>
                )}
                {contentOpportunityCount > 0 && (
                  <span>{contentOpportunityCount} content opportunities hidden from the blocker queue</span>
                )}
              </div>
              {scoreBundle && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                    Eligibility {scoreBundle.readiness_score ?? '—'}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                    Exposure {scoreBundle.exposure_score ?? '—'}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                    Conversion {scoreBundle.conversion_score ?? '—'}
                  </span>
                  {agentPushSummary && (
                    <>
                      <span className="rounded-full bg-white px-3 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
                        {agentPushSummary.eligible_variants} eligible for agent push
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 font-medium text-amber-700 ring-1 ring-amber-200">
                        {agentPushSummary.excluded_variants} excluded from agent push
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void loadOptimizationData({
                    refresh: true,
                    scope: 'merchant',
                    reason: 'manual',
                  })
                }
                disabled={readinessLoading}
                className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                {readinessLoading ? 'Refreshing…' : 'Refresh all readiness'}
              </button>
              {storeSetupActions.length > 0 && (
                <a
                  href="/dashboard/integrations"
                  className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Review integrations
                </a>
              )}
            </div>
            </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            <div className="rounded-lg bg-white/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Issue overview
              </div>
              <div className="mt-3 space-y-2">
                {issueBuckets.length > 0 ? (
                  issueBuckets.slice(0, 6).map((bucket) => (
                    <div key={bucket.code} className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-900">{bucket.label}</span>
                        <span className="text-xs font-semibold text-slate-500">
                          {bucket.affected_count}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-600">
                        {bucket.scope === 'merchant' ? 'Store setup' : 'Product fix'} ·{' '}
                        {bucket.impact === 'full_agent_commerce'
                          ? 'Blocks agent commerce'
                          : bucket.impact === 'checkout'
                            ? 'Blocks checkout'
                            : 'Blocks discovery'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                    {summaryTopIssues.length > 0
                      ? `${summaryTopIssues[0].label} is the main issue right now.`
                      : 'No blocking issues are active right now.'}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-white/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recommended actions
              </div>
              <div className="mt-3 space-y-2">
                {(productActions.length > 0 ? productActions : merchantActions).length > 0 ? (
                  (productActions.length > 0 ? productActions : merchantActions).slice(0, 4).map((action) => (
                    <div key={`${action.label}-${action.target_url}`} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                      <div className="font-medium text-slate-900">{action.label}</div>
                      <div className="mt-1 text-xs text-slate-600">{action.description}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                    Optimize any low-quality products and rerun readiness when you make catalog changes.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-white/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Store setup to review
              </div>
              <div className="mt-3 space-y-2">
                {storeSetupActions.length > 0 ? (
                  storeSetupActions.map((action) => (
                    <a
                      key={`${action.label}-${action.target_url}`}
                      href={action.target_url}
                      className="block rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      <div className="font-medium text-slate-900">{action.label}</div>
                      <div className="mt-1 text-xs text-slate-600">{action.description}</div>
                    </a>
                  ))
                ) : pivotaManagedActions.length > 0 ? (
                  pivotaManagedActions.map((action) => (
                    <div
                      key={`${action.label}-${action.description}`}
                      className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200"
                    >
                      <div className="font-medium text-slate-900">{action.label}</div>
                      <div className="mt-1 text-xs text-slate-600">{action.description}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                    No merchant-level setup blockers are active right now.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
  );
}
