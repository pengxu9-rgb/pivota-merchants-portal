'use client';

import type { MutableRefObject } from 'react';
import { CheckCircle2, Loader2, Package, RefreshCw, Wand2 } from 'lucide-react';
import { getDescriptionText } from '@/lib/html-text';
import { ProductEvidencePanel } from '@/components/evidence/ProductEvidencePanel';
import {
  type EnrichmentFormState,
  type ExecutionJob,
  type MerchantProductDetail,
  type ProductBlockerVariant,
  type ProductQueueItem,
  type ReadinessActionPreview,
  type VerificationResult,
  formatAgentPushReason,
  formatDelta,
  formatFieldLabel,
  formatReadinessCode,
  getAgentPushLabel,
  getAgentPushTone,
  getImpactLabel,
  getManualReviewLabel,
  getSelectedProductSummary,
  getStoreAdminLabel,
} from '../_shared';

interface ProductWorkspaceProps {
  detailPaneRef: MutableRefObject<HTMLDivElement | null>;
  selectedQueueItem: ProductQueueItem | null;
  handleRefreshSelectedStatus: () => Promise<void>;
  readinessLoading: boolean;
  canExecuteSelectedAction: boolean;
  handlePreviewRecommendedAction: () => Promise<void>;
  actionPreviewLoading: boolean;
  handleAutoOptimize: () => Promise<void>;
  optimizing: boolean;
  canApplyPreviewedAction: boolean;
  isInCooldown: boolean;
  manualReviewHref: string;
  actionFeedback: string | null;
  activeBlockedVariants: ProductBlockerVariant[];
  excludedVariants: ProductBlockerVariant[];
  blockerDetailLoading: boolean;
  blockerVariants: ProductBlockerVariant[];
  actionPreview: ReadinessActionPreview | null;
  verificationResult: VerificationResult | null;
  latestJob: ExecutionJob | null;
  detail: MerchantProductDetail | null;
  selectedActionRequest: unknown;
  form: EnrichmentFormState;
  handleFormChange: (field: keyof EnrichmentFormState, value: any) => void;
  handleBulletChange: (index: number, value: string) => void;
  addBullet: () => void;
  removeBullet: (index: number) => void;
  parseTags: (input: string) => string[];
  formatTags: (tags: string[]) => string;
  handleSave: () => Promise<void>;
  saving: boolean;
  handlePreviewQuality: () => Promise<void>;
  previewLoading: boolean;
  handleSaveAndEval: () => Promise<void>;
  qualityPayload: unknown;
  qualityPreview: any | null;
}

export function ProductWorkspace({
  detailPaneRef,
  selectedQueueItem,
  handleRefreshSelectedStatus,
  readinessLoading,
  canExecuteSelectedAction,
  handlePreviewRecommendedAction,
  actionPreviewLoading,
  handleAutoOptimize,
  optimizing,
  canApplyPreviewedAction,
  isInCooldown,
  manualReviewHref,
  actionFeedback,
  activeBlockedVariants,
  excludedVariants,
  blockerDetailLoading,
  blockerVariants,
  actionPreview,
  verificationResult,
  latestJob,
  detail,
  selectedActionRequest,
  form,
  handleFormChange,
  handleBulletChange,
  addBullet,
  removeBullet,
  parseTags,
  formatTags,
  handleSave,
  saving,
  handlePreviewQuality,
  previewLoading,
  handleSaveAndEval,
  qualityPayload,
  qualityPreview,
}: ProductWorkspaceProps) {
  return (
      <div ref={detailPaneRef} className="space-y-4">
        {selectedQueueItem && (
          <div className="rounded-lg border bg-white p-4 shadow">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      selectedQueueItem.agent_push_status === 'excluded_from_agent_push'
                        ? 'bg-amber-100 text-amber-800'
                        : selectedQueueItem.blocked_variant_count > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {selectedQueueItem.agent_push_status === 'excluded_from_agent_push'
                      ? 'Excluded from push'
                      : selectedQueueItem.blocked_variant_count > 0
                        ? 'Needs work'
                        : 'Ready for push'}
                  </span>
                  <span className="text-sm text-slate-600">
                    {selectedQueueItem.eligible_variant_count ?? selectedQueueItem.ready_variant_count} eligible / {selectedQueueItem.excluded_variant_count ?? 0} excluded
                  </span>
                  {selectedQueueItem.blocked_variant_count > 0 ? (
                    <span className="text-sm text-slate-600">
                      {selectedQueueItem.blocked_variant_count} active blockers still need review
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 text-base font-semibold text-slate-900">
                  Selected product
                </h3>
                <p className="mt-1 text-sm text-slate-700">
                  {getSelectedProductSummary(selectedQueueItem)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:max-w-[28rem] lg:justify-end">
                <button
                  type="button"
                  onClick={() => void handleRefreshSelectedStatus()}
                  disabled={readinessLoading}
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${readinessLoading ? 'animate-spin' : ''}`} />
                  Refresh status
                </button>
                {selectedQueueItem.platform_admin_url ? (
                  <a
                    href={selectedQueueItem.platform_admin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                  >
                    {getStoreAdminLabel(selectedQueueItem.platform)}
                  </a>
                ) : null}
                {canExecuteSelectedAction && (
                  <>
                    <button
                      type="button"
                      onClick={handlePreviewRecommendedAction}
                      disabled={actionPreviewLoading}
                      className="inline-flex items-center justify-center rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {actionPreviewLoading
                        ? 'Preparing preview…'
                        : 'Preview suggested fix'}
                    </button>
                    <button
                      type="button"
                      onClick={handleAutoOptimize}
                      disabled={optimizing || !canApplyPreviewedAction || isInCooldown}
                      className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {optimizing ? 'Applying…' : 'Apply suggested fix'}
                    </button>
                  </>
                )}
                {!canExecuteSelectedAction && (
                  <a
                    href={manualReviewHref}
                    className="inline-flex items-center justify-center rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100"
                  >
                    {getManualReviewLabel(selectedQueueItem.fix_surface)}
                  </a>
                )}
              </div>
            </div>

                {actionFeedback && (
              <div className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 ring-1 ring-blue-200">
                {actionFeedback}
              </div>
            )}

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Main issues
                </div>
                <div className="mt-2 space-y-2">
                  {selectedQueueItem.top_issues.length > 0 ? (
                    selectedQueueItem.top_issues.map((issue) => (
                      <div key={issue.code} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                        <div className="font-medium text-slate-900">{issue.label}</div>
                        <div className="mt-1 text-xs text-slate-600">
                          {issue.affected_variant_count} variants · {getImpactLabel(issue.impact)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                      No active issues on this product right now.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recommended action
                </div>
                <div className="mt-2 space-y-2">
                  <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                    <div className="font-medium text-slate-900">
                      {selectedQueueItem.recommended_action_type === 'run_product_enrichment'
                        ? 'Fixable from this page'
                        : selectedQueueItem.fix_surface === 'catalog_data'
                          ? 'Needs catalog review'
                          : 'Needs a different surface'}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {selectedQueueItem.priority_reason ||
                        selectedQueueItem.primary_action ||
                        'This action is prioritized because it should unlock more agent-commerce value than lower-impact edits.'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                    <div className="font-medium text-slate-900">
                      {selectedQueueItem.fixability === 'merchant_fixable'
                        ? 'Next step for you'
                        : 'Needs manual follow-up'}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {canExecuteSelectedAction
                        ? 'Preview the suggested fix first, then apply it if it looks right.'
                        : selectedQueueItem.fix_surface === 'catalog_data'
                          ? 'Open this product in Catalog, compare the affected variants below, and fix the source data in your store.'
                          : `${getManualReviewLabel(selectedQueueItem.fix_surface)} to continue.`}
                      {' · '}Priority {selectedQueueItem.priority_score.toFixed(0)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Agent push status
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getAgentPushTone(
                      selectedQueueItem.agent_push_status
                    )}`}
                  >
                    {getAgentPushLabel(selectedQueueItem.agent_push_status)}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                    <div className="font-medium text-slate-900">
                      {selectedQueueItem.eligible_variant_count ?? selectedQueueItem.ready_variant_count} eligible variants
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {selectedQueueItem.excluded_variant_count ?? 0} variants are currently excluded from agent push.
                    </div>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                    <div className="font-medium text-slate-900">
                      {selectedQueueItem.agent_push_reason_codes?.length
                        ? selectedQueueItem.agent_push_reason_codes
                            .map(formatAgentPushReason)
                            .slice(0, 3)
                            .join(' · ')
                        : 'No auto-exclusion reasons active'}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {selectedQueueItem.store_data_last_checked_at
                        ? `Last checked ${new Date(
                            selectedQueueItem.store_data_last_checked_at
                          ).toLocaleString()}`
                        : 'Status refresh follows the latest synced store data.'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Affected variants
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Cross-check these variants against your source catalog before you review or edit the product.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
                      Active blockers {activeBlockedVariants.length}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                      Auto-excluded {excludedVariants.length}
                    </span>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                    <span className="font-medium text-slate-900">
                      Active blockers still need source-data fixes:
                    </span>{' '}
                    {activeBlockedVariants.length > 0
                      ? `${activeBlockedVariants.length} variants are still blocked in the current readiness plan.`
                      : 'No variants are actively blocked right now.'}
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                    <span className="font-medium text-slate-900">
                      Auto-excluded from agent push:
                    </span>{' '}
                    {excludedVariants.length > 0
                      ? `${excludedVariants.length} variants are being held back until source data becomes usable again.`
                      : 'No variants are currently auto-excluded from push.'}
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
                  {blockerDetailLoading ? (
                    <div className="px-4 py-5 text-sm text-slate-600">
                      Loading affected variants…
                    </div>
                  ) : blockerVariants.length > 0 ? (
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Variant</th>
                          <th className="px-3 py-2 font-medium">Price</th>
                          <th className="px-3 py-2 font-medium">Stock</th>
                          <th className="px-3 py-2 font-medium">Readiness</th>
                          <th className="px-3 py-2 font-medium">Agent push</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blockerVariants.map((variant) => (
                          <tr
                            key={variant.variant_id}
                            className="border-t border-slate-100 align-top"
                          >
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-900">
                                {variant.title}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                SKU {variant.sku || 'N/A'} · ID {variant.variant_id}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {typeof variant.price_value === 'number'
                                ? `${variant.price_value} ${variant.price_currency || ''}`.trim()
                                : 'No price'}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {typeof variant.inventory_quantity === 'number'
                                ? variant.inventory_quantity
                                : '—'}
                            </td>
                            <td className="px-3 py-2">
                              {variant.readiness_blocker_codes.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {variant.readiness_blocker_codes.map((code) => (
                                    <span
                                      key={code}
                                      className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700"
                                    >
                                      {formatReadinessCode(code)}
                                    </span>
                                  ))}
                                </div>
                              ) : variant.readiness_warning_codes.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {variant.readiness_warning_codes.map((code) => (
                                    <span
                                      key={code}
                                      className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
                                    >
                                      {formatReadinessCode(code)}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                                  Ready
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {variant.agent_push_reason_codes.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {variant.agent_push_reason_codes.map((code) => (
                                    <span
                                      key={code}
                                      className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
                                    >
                                      {formatAgentPushReason(code)}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                                  Eligible
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="px-4 py-5 text-sm text-slate-600">
                      No variant-level blocker details are available for this product yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Preview and verification
                </div>
                <div className="mt-2 space-y-2">
                  {actionPreview ? (
                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                      <div className="font-medium text-slate-900">
                        {actionPreview.candidate_patches.length} suggested field changes
                      </div>
                      <div className="mt-1 space-y-1 text-xs text-slate-600">
                        {actionPreview.candidate_patches.slice(0, 3).map((patch) => (
                          <div key={patch.candidate_id}>
                            {formatFieldLabel(patch.target_field)}
                          </div>
                        ))}
                        {actionPreview.expected_impact?.targets?.[0]?.delta && (
                          <div className="pt-1 text-slate-700">
                            Expected content score {formatDelta(
                              actionPreview.expected_impact.targets[0].delta
                                .content_quality_score
                            )}
                            {' · '}Expected agent understanding {formatDelta(
                              actionPreview.expected_impact.targets[0].delta
                                .model_readiness_score
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                      {canExecuteSelectedAction
                        ? 'Preview before you apply so you can verify the exact fields that will change.'
                        : 'This issue is not auto-fixable from this page. Review the affected variants and continue in the catalog or setup surface.'}
                    </div>
                  )}
                  {verificationResult && (
                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                      <div className="font-medium text-slate-900">Latest verification</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Readiness delta{' '}
                        {verificationResult.delta_scores?.readiness_score ?? 0}
                        {' · '}Blocked variants delta{' '}
                        {verificationResult.delta_scores?.blocked_variant_count ?? 0}
                      </div>
                    </div>
                  )}
                  {latestJob && (
                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                      <div className="font-medium text-slate-900">
                        Job {latestJob.status.replaceAll('_', ' ')}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {latestJob.completed_at
                          ? `Completed ${new Date(latestJob.completed_at).toLocaleString()}`
                          : 'Execution is still in progress.'}
                      </div>
                    </div>
                  )}
                  {!verificationResult && !latestJob && !actionPreview && (
                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                      No preview or execution result yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!detail ? (
          <div className="h-full flex items-center justify-center border rounded-lg bg-white shadow">
              <p className="text-gray-500 text-sm">
                Select a product on the left to start optimizing.
              </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
            {/* Standard view */}
            <div className="bg-white rounded-lg shadow border p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-800">
                Source platform product (read-only)
              </h2>
              <div className="w-full h-32 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                {detail.standard?.image_url || detail.standard?.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      detail.standard.image_url ||
                      detail.standard.images[0]
                    }
                    alt={detail.standard.title || ''}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package className="w-10 h-10 text-gray-400" />
                )}
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">
                    Original title
                  </div>
                  <div className="font-medium text-gray-900">
                    {detail.standard.title || '-'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500 mb-0.5">Platform</div>
                    <div className="font-medium">
                      {detail.platform.toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-0.5">Price</div>
                    <div className="font-medium">
                      {(() => {
                        const p = detail.standard;
                        const value =
                          typeof p.price === 'number'
                            ? p.price
                            : p.price?.value;
                        const currency =
                          typeof p.price === 'number'
                            ? p.currency
                            : p.price?.currency;
                        if (typeof value === 'number') {
                          return `${value} ${currency || ''}`;
                        }
                        return '-';
                      })()}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Description</div>
                  <div className="text-xs text-gray-700 line-clamp-3">
                    {getDescriptionText(
                      detail.standard.description_text,
                      detail.standard.description
                    ) || '无描述'}
                  </div>
                </div>
              </div>
            </div>

            {/* Enrichment editor */}
            <div className="bg-white rounded-lg shadow border p-4 space-y-4">
              <div className="space-y-3">
                <div className="max-w-xl">
                  <h2 className="text-sm font-semibold text-gray-800">
                    Pivota enrichment (editable)
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Keep this cleaner and tighter than the source listing.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {canExecuteSelectedAction ? (
                    <>
                      <button
                        type="button"
                        onClick={handlePreviewRecommendedAction}
                        disabled={actionPreviewLoading || !selectedActionRequest}
                        className="inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {actionPreviewLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        Preview suggested fix
                      </button>
                      <button
                        type="button"
                        onClick={handleAutoOptimize}
                        disabled={
                          optimizing || !canApplyPreviewedAction || isInCooldown
                        }
                        className="inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {optimizing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        Apply suggested fix
                      </button>
                    </>
                  ) : selectedQueueItem ? (
                    <a
                      href={manualReviewHref}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-gray-50 sm:col-span-2"
                    >
                      {getManualReviewLabel(selectedQueueItem.fix_surface)}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={handlePreviewQuality}
                    disabled={previewLoading || !qualityPayload}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {previewLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    Preview score
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndEval}
                    disabled={saving || !qualityPayload}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Save/Score
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Optimized title (used by Agent)
                  </label>
                  <input
                    type="text"
                    value={form.title_override}
                    onChange={(e) =>
                      handleFormChange('title_override', e.target.value)
                    }
                    placeholder="E.g. Lightweight running shoes for daily commute and city jogging"
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Summary (1–2 sentences, Agent-facing)
                  </label>
                  <textarea
                    value={form.summary_short}
                    onChange={(e) =>
                      handleFormChange('summary_short', e.target.value)
                    }
                    rows={2}
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    placeholder="Briefly describe who this is for and what problem it solves."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-700">
                      Selling points (3–8 bullets)
                    </label>
                    <button
                      type="button"
                      onClick={addBullet}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="space-y-1">
                    {form.bullet_points.length === 0 && (
                      <p className="text-[11px] text-gray-400">
                        No selling points yet. Click “Add” to start.
                      </p>
                    )}
                    {form.bullet_points.map((bp, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <span className="text-[11px] text-gray-400">
                          •
                        </span>
                        <input
                          type="text"
                          value={bp}
                          onChange={(e) =>
                            handleBulletChange(idx, e.target.value)
                          }
                          className="flex-1 px-2.5 py-1 border rounded-md text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => removeBullet(idx)}
                          className="text-[11px] text-gray-400 hover:text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Usage scenarios (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={formatTags(form.usage_scenarios)}
                      onChange={(e) =>
                        handleFormChange(
                          'usage_scenarios',
                          parseTags(e.target.value)
                        )
                      }
                      placeholder="E.g. Daily commute, city jogging"
                      className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Target audience (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={formatTags(form.audience_tags)}
                      onChange={(e) =>
                        handleFormChange(
                          'audience_tags',
                          parseTags(e.target.value)
                        )
                      }
                      placeholder="E.g. office workers, running beginners"
                      className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Topic tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formatTags(form.topic_tags)}
                    onChange={(e) =>
                      handleFormChange(
                        'topic_tags',
                        parseTags(e.target.value)
                      )
                    }
                    placeholder="E.g. high value, entry level, eco-friendly"
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Compliance disclaimer (optional, Pivota only)
                  </label>
                  <textarea
                    value={form.regulatory_disclaimer_local}
                    onChange={(e) =>
                      handleFormChange(
                        'regulatory_disclaimer_local',
                        e.target.value
                      )
                    }
                    rows={2}
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    placeholder="E.g. This is a consumer product and does not provide medical effects."
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1 border-t mt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50 sm:w-auto"
                  >
                    {saving ? 'Saving…' : 'Save enrichment only'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quality panel */}
        <div className="bg-white rounded-lg shadow border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              Quality scores (content and agent understanding)
            </h2>
          </div>
          {!qualityPreview ? (
            <p className="text-sm text-gray-500">
              No scores yet. Use “Preview score” or “Save/Score” on the right to see how understandable this product is for agents.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">
                    Content score
                  </div>
                  <div className="text-base font-semibold text-blue-700">
                    {qualityPreview.content_quality_score != null
                      ? qualityPreview.content_quality_score.toFixed(1)
                      : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">
                    Agent understanding
                  </div>
                  <div className="text-base font-semibold text-emerald-700">
                    {qualityPreview.model_readiness_score != null
                      ? qualityPreview.model_readiness_score.toFixed(1)
                      : '--'}
                  </div>
                </div>
              </div>

              {Array.isArray(qualityPreview.problems) &&
                qualityPreview.problems.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-1">
                      Suggestions to improve
                    </div>
                    <ul className="space-y-1">
                      {qualityPreview.problems.map((p: any, idx: number) => (
                        <li
                          key={idx}
                          className="text-xs text-gray-700 flex items-start gap-1.5"
                        >
                          <span className="mt-0.5 w-1 h-1 rounded-full bg-amber-500" />
                          <span>{p.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Optional evidence intake (Phase 2b) — strengthen claims so agents cite
            this product. Suggestion, never a gate; only renders with a product. */}
        {detail?.platform && detail?.platform_product_id && (
          <ProductEvidencePanel
            platform={detail.platform}
            platformProductId={detail.platform_product_id}
          />
        )}
        </div>
  );
}
