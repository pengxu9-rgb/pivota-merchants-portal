'use client';

import {
  type CatalogReviewQueueState,
  type OptimizationPlan,
  type ReadinessLaneDelta,
  type ReadinessOptimizationPayload,
  type SourceDataLaneWorklist,
  type SourceDataProductGroup,
  type SourceDataReasonCode,
  SOURCE_DATA_REASON_CONFIG,
  getLaneQueueShortcuts,
  getLaneSavedCtaLabel,
  getLaneUnresolvedDecisionCount,
  getLaneUnsavedCtaLabel,
  getStoreAdminLabel,
} from '../_shared';

interface SourceDataTriageProps {
  optimizationPlan: OptimizationPlan | null;
  buildCatalogReviewHref: (params: {
    platform: string;
    platformProductId: string;
    variantId?: string | null;
    reasonCode?: SourceDataReasonCode | null;
    queueState?: CatalogReviewQueueState | null;
    includePlanId?: boolean;
  }) => string;
  firstTriageGroup: SourceDataProductGroup | null;
  triageReason: SourceDataReasonCode;
  handleExportCurrentTriageLane: () => Promise<void>;
  triageExporting: boolean;
  sourceDataTriageLoading: boolean;
  sourceDataTriageError: string | null;
  triageActiveLaneCount: number;
  totalTriageProducts: number;
  totalTriageVariants: number;
  contentOpportunityCount: number;
  busiestTriageLane: SourceDataLaneWorklist | null;
  lastLaneDelta: ReadinessLaneDelta | null;
  lastLaneDeltaReason: SourceDataReasonCode | null;
  triageLaneWorklists: SourceDataLaneWorklist[];
  readinessLoading: boolean;
  loadOptimizationData: (options?: {
    refresh?: boolean;
    scope?: 'merchant' | 'product' | 'variant';
    reason?: string;
    reasonCode?: SourceDataReasonCode;
    page?: number;
  }) => Promise<ReadinessOptimizationPayload | null>;
  handleOpenTriageLane: (reasonCode: SourceDataReasonCode) => void;
  handleExportTriageLane: (reasonCode: SourceDataReasonCode) => Promise<void>;
}

export function SourceDataTriage({
  optimizationPlan,
  buildCatalogReviewHref,
  firstTriageGroup,
  triageReason,
  handleExportCurrentTriageLane,
  triageExporting,
  sourceDataTriageLoading,
  sourceDataTriageError,
  triageActiveLaneCount,
  totalTriageProducts,
  totalTriageVariants,
  contentOpportunityCount,
  busiestTriageLane,
  lastLaneDelta,
  lastLaneDeltaReason,
  triageLaneWorklists,
  readinessLoading,
  loadOptimizationData,
  handleOpenTriageLane,
  handleExportTriageLane,
}: SourceDataTriageProps) {
  return (
        <div className="rounded-xl border bg-white p-5 shadow">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Source-data triage
              </div>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">
                Batch-govern excluded and blocked variants
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Use these three lanes to work through the source-data blockers that AI cannot fix from this page. Pick a lane, inspect the affected products and variants, then jump straight into Catalog review.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {firstTriageGroup ? (
                <a
                  href={buildCatalogReviewHref({
                    platform: firstTriageGroup.platform,
                    platformProductId: firstTriageGroup.platform_product_id,
                    reasonCode: triageReason,
                  })}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
                >
                  Review whole lane in catalog
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleExportCurrentTriageLane}
                disabled={!optimizationPlan?.plan_id || triageExporting || sourceDataTriageLoading}
                className="inline-flex items-center justify-center rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50"
              >
                {triageExporting ? 'Exporting…' : 'Export current lane'}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Merchant bulk worklist
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  Start with the biggest lane, then jump straight into the next
                  product batch that still needs source-data fixes.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                  {triageActiveLaneCount} active lanes
                </span>
                <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                  {totalTriageProducts} product batches
                </span>
                <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                  {totalTriageVariants} affected variants
                </span>
                {contentOpportunityCount > 0 ? (
                  <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                    {contentOpportunityCount} content-only opportunities hidden
                  </span>
                ) : null}
                {busiestTriageLane && busiestTriageLane.affected_products > 0 ? (
                  <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700 ring-1 ring-blue-200">
                    Largest lane: {busiestTriageLane.label}
                  </span>
                ) : null}
              </div>
            </div>

            {lastLaneDelta && lastLaneDeltaReason ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                Refreshed{' '}
                {SOURCE_DATA_REASON_CONFIG[lastLaneDeltaReason].label.toLowerCase()}:
                resolved {lastLaneDelta.resolved_products} product batch
                {lastLaneDelta.resolved_products === 1 ? '' : 'es'} and{' '}
                {lastLaneDelta.resolved_variants} variant
                {lastLaneDelta.resolved_variants === 1 ? '' : 's'} in the latest
                plan.
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 xl:grid-cols-3">
              {triageLaneWorklists.map((lane) => {
                const isActiveLane = triageReason === lane.reason_code;
                const nextProduct = lane.next_product;
                const queueShortcuts = getLaneQueueShortcuts(lane.reason_code);
                const savedProgressCount = lane.decision_counts.reduce(
                  (sum, item) => sum + item.count,
                  0
                );
                const unresolvedDecisionCount = getLaneUnresolvedDecisionCount(lane);
                const unsavedProgressCount = Math.max(
                  unresolvedDecisionCount - savedProgressCount,
                  0
                );
                const continueTarget = lane.saved_target;
                const resumeTarget = lane.unsaved_target;
                return (
                  <div
                    key={lane.reason_code}
                    className={`rounded-xl border p-4 ${
                      isActiveLane
                        ? 'border-blue-300 bg-white shadow-sm'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {lane.label}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {lane.helper}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {isActiveLane ? (
                          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            Active lane
                          </span>
                        ) : null}
                        {(lane.reason_code === 'out_of_stock' || savedProgressCount > 0) &&
                        unresolvedDecisionCount > 0 ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200">
                            Saved progress {savedProgressCount} / {unresolvedDecisionCount}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
                        {lane.affected_products} product batches
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">
                        {lane.affected_variants} affected variants
                      </span>
                      <span className="rounded-full bg-rose-100 px-2 py-1 font-medium text-rose-700">
                        {lane.blocked_products} with active blockers
                      </span>
                      <span className="rounded-full bg-yellow-100 px-2 py-1 font-medium text-yellow-800">
                        {lane.excluded_products} excluded now
                      </span>
                    </div>

                    {lane.status_summary.length > 0 ? (
                      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Current queue status
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          {lane.status_summary.map((item) => (
                            <span
                              key={`${lane.reason_code}-${item.key}`}
                              className={`rounded-full px-2 py-1 font-medium ${item.className}`}
                            >
                              {item.count} {item.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {(lane.reason_code === 'out_of_stock' || savedProgressCount > 0) &&
                    unresolvedDecisionCount > 0 ? (
                      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Saved merchant progress
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                            {savedProgressCount} saved progress
                          </span>
                          <span className="rounded-full bg-white px-2 py-1 font-medium text-amber-800 ring-1 ring-amber-200">
                            {unsavedProgressCount} still unsaved
                          </span>
                          {lane.decision_counts
                            .filter((item) => item.count > 0)
                            .map((item) => (
                              <span
                                key={`${lane.reason_code}-decision-${item.key}`}
                                className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200"
                              >
                                {item.count} {item.label}
                              </span>
                            ))}
                        </div>
                      </div>
                    ) : null}

                    {nextProduct ? (
                      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Next product batch
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-900">
                          {nextProduct.title || 'Untitled product'}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {nextProduct.platform.toUpperCase()} ·{' '}
                          {nextProduct.platform_product_id}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-slate-200">
                            {nextProduct.blocked_variant_count || 0} blocked
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-slate-200">
                            {nextProduct.excluded_variant_count || 0} excluded
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
                        No products are currently active in this lane.
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleOpenTriageLane(lane.reason_code)}
                        className="inline-flex items-center rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Open lane
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void loadOptimizationData({
                            refresh: true,
                            scope: 'merchant',
                            reason: 'lane_refresh',
                            reasonCode: lane.reason_code,
                          })
                        }
                        disabled={readinessLoading}
                        className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Refresh this queue
                      </button>
                      {nextProduct ? (
                        <a
                          href={buildCatalogReviewHref({
                            platform: nextProduct.platform,
                            platformProductId: nextProduct.platform_product_id,
                            reasonCode: lane.reason_code,
                            variantId: nextProduct.sample_variant_id || null,
                          })}
                          className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                        >
                          Review next batch
                        </a>
                      ) : null}
                      {nextProduct?.platform_admin_url ? (
                        <a
                          href={nextProduct.platform_admin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          {getStoreAdminLabel(nextProduct.platform)}
                        </a>
                      ) : null}
                      {continueTarget ? (
                        <a
                          href={buildCatalogReviewHref({
                            platform: continueTarget.platform,
                            platformProductId: continueTarget.platform_product_id,
                            reasonCode: lane.reason_code,
                            variantId: continueTarget.sample_variant_id || null,
                            includePlanId: false,
                          })}
                          className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100"
                        >
                          {getLaneSavedCtaLabel(lane.reason_code)}
                        </a>
                      ) : null}
                      {!continueTarget && resumeTarget ? (
                        <a
                          href={buildCatalogReviewHref({
                            platform: resumeTarget.platform,
                            platformProductId: resumeTarget.platform_product_id,
                            reasonCode: lane.reason_code,
                            variantId: resumeTarget.sample_variant_id || null,
                            includePlanId: false,
                          })}
                          className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
                        >
                          {getLaneUnsavedCtaLabel(lane.reason_code)}
                        </a>
                      ) : null}
                      {nextProduct
                        ? queueShortcuts.map((shortcut) => (
                            <a
                              key={`${lane.reason_code}-${shortcut.queueState}`}
                              href={buildCatalogReviewHref({
                                platform: nextProduct.platform,
                                platformProductId: nextProduct.platform_product_id,
                                variantId: nextProduct.sample_variant_id || null,
                                reasonCode: lane.reason_code,
                                queueState: shortcut.queueState,
                                includePlanId: false,
                              })}
                              className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-[11px] font-medium ${shortcut.className}`}
                            >
                              {shortcut.label}
                            </a>
                          ))
                        : null}
                      <button
                        type="button"
                        onClick={() => void handleExportTriageLane(lane.reason_code)}
                        disabled={!optimizationPlan?.plan_id || triageExporting}
                        className="inline-flex items-center rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {triageExporting ? 'Exporting…' : 'Export lane CSV'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {sourceDataTriageError && (
            <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
              {sourceDataTriageError}
            </div>
          )}

        </div>
  );
}
