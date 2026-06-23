'use client';

import {
  type AgentPushSummary,
  type MerchantReadinessAction,
  type OptimizationPlan,
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
  pivotaManagedActions,
}: CatalogHealthHeaderProps) {
  const hasSetupBanner =
    storeSetupActions.length > 0 || pivotaManagedActions.length > 0;
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
              </div>

              <details className="mt-3 text-xs">
                <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-700">
                  Score details
                </summary>
                <div className="mt-2 space-y-2">
                  {scoreBundle && (
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                        Eligibility {scoreBundle.readiness_score ?? '—'}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                        Exposure {scoreBundle.exposure_score ?? '—'}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                        Conversion {scoreBundle.conversion_score ?? '—'}
                      </span>
                    </div>
                  )}
                  {agentPushSummary && (
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
                        {agentPushSummary.eligible_products} push-ready products
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 font-medium text-amber-700 ring-1 ring-amber-200">
                        {agentPushSummary.excluded_products} auto-excluded products
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
                        {agentPushSummary.eligible_variants} variants eligible for agent push
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 font-medium text-amber-700 ring-1 ring-amber-200">
                        {agentPushSummary.excluded_variants} variants excluded from agent push
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500">
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
                </div>
              </details>
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
            </div>
          </div>

          {hasSetupBanner && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-amber-900">
                  Store setup to review
                </div>
                <a
                  href="/dashboard/integrations"
                  className="inline-flex items-center justify-center rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Review integrations
                </a>
              </div>
              <div className="mt-2 space-y-1">
                {storeSetupActions.length > 0
                  ? storeSetupActions.map((action) => (
                      <a
                        key={`${action.label}-${action.target_url}`}
                        href={action.target_url}
                        className="block rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-amber-100 hover:bg-amber-50"
                      >
                        <div className="font-medium text-slate-900">{action.label}</div>
                        <div className="mt-1 text-xs text-slate-600">{action.description}</div>
                      </a>
                    ))
                  : pivotaManagedActions.map((action) => (
                      <div
                        key={`${action.label}-${action.description}`}
                        className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-amber-100"
                      >
                        <div className="font-medium text-slate-900">{action.label}</div>
                        <div className="mt-1 text-xs text-slate-600">{action.description}</div>
                      </div>
                    ))}
              </div>
            </div>
          )}
        </div>
  );
}
