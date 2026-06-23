'use client';

import type { Dispatch, SetStateAction } from 'react';
import { ArrowRight, Loader2, Package, Search, Wand2, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  type AgentPushSummary,
  type QueueSegment,
  type QueueSegmentCounts,
  type ReadinessIssueBucket,
  type ReadinessOptimizationPayload,
  type WorkspaceProductItem,
  formatProductPriceLine,
  getAgentPushTone,
  getProductActionLabel,
  getProductStatusLine,
} from '../_shared';

interface BlockerQueueProps {
  contentOpportunityCount: number;
  productQueuePage: ReadinessOptimizationPayload['product_queue_page'] | null;
  filteredProducts: WorkspaceProductItem[];
  bulkOptimizing: boolean;
  setBulkOptimizing: Dispatch<SetStateAction<boolean>>;
  loadOptimizationData: (options?: {
    refresh?: boolean;
    scope?: 'merchant' | 'product' | 'variant';
    reason?: string;
    reasonCode?: import('../_shared').SourceDataReasonCode;
    page?: number;
  }) => Promise<ReadinessOptimizationPayload | null>;
  agentPushSummary: AgentPushSummary | null;
  searchInput: string;
  setSearchInput: Dispatch<SetStateAction<string>>;
  sortBy: 'default' | 'cq_desc' | 'mr_desc';
  setSortBy: Dispatch<SetStateAction<'default' | 'cq_desc' | 'mr_desc'>>;
  qualityMetadataReady: boolean;
  issueFilter: string;
  setIssueFilter: Dispatch<SetStateAction<string>>;
  onClearIssueFilter: () => void;
  issueBuckets: ReadinessIssueBucket[];
  pushFilter: 'all' | 'eligible' | 'excluded';
  setPushFilter: Dispatch<SetStateAction<'all' | 'eligible' | 'excluded'>>;
  segmentFilter: QueueSegment;
  setSegmentFilter: Dispatch<SetStateAction<QueueSegment>>;
  queueSegmentCounts: QueueSegmentCounts | null;
  showBlockedOnly: boolean;
  setShowBlockedOnly: Dispatch<SetStateAction<boolean>>;
  showOnlyLowQuality: boolean;
  setShowOnlyLowQuality: Dispatch<SetStateAction<boolean>>;
  entryFilterNotice: string | null;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  readinessLoading: boolean;
  selected: { platform: string; platform_product_id: string } | null;
  handleSelect: (
    platform: string,
    platformProductId: string,
    options?: { focusDetail?: boolean }
  ) => Promise<void>;
}

export function BlockerQueue({
  contentOpportunityCount,
  productQueuePage,
  filteredProducts,
  bulkOptimizing,
  setBulkOptimizing,
  loadOptimizationData,
  agentPushSummary,
  searchInput,
  setSearchInput,
  sortBy,
  setSortBy,
  qualityMetadataReady,
  issueFilter,
  setIssueFilter,
  onClearIssueFilter,
  issueBuckets,
  pushFilter,
  setPushFilter,
  segmentFilter,
  setSegmentFilter,
  queueSegmentCounts,
  showBlockedOnly,
  setShowBlockedOnly,
  showOnlyLowQuality,
  setShowOnlyLowQuality,
  entryFilterNotice,
  setCurrentPage,
  readinessLoading,
  selected,
  handleSelect,
}: BlockerQueueProps) {
  const segmentOptions: { key: QueueSegment; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'fix_here', label: 'Fix here' },
    { key: 'in_store', label: 'In your store' },
    { key: 'other', label: 'Other' },
  ];
  return (
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
            <h2 className="max-w-[10ch] text-[1.6rem] font-bold leading-tight text-gray-900">
              Blocker queue
            </h2>
              <p className="mt-1 text-xs text-gray-500">
                Review blocked or auto-excluded products first.
                {contentOpportunityCount > 0
                  ? ` ${contentOpportunityCount} content-only opportunities are tracked separately.`
                  : ''}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
              {productQueuePage?.total_items ?? filteredProducts.length} matching products
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkOptimizing}
              onClick={async () => {
                if (bulkOptimizing) return;
                const confirmed = window.confirm(
                  'Run AI enrichment and scoring for a batch of products?\n\nThis may take a little while and will process recently synced items first.'
                );
                if (!confirmed) return;
                setBulkOptimizing(true);
                try {
                  const res = await apiClient.runMerchantBulkEnrichment({
                    limit: 100,
                  });
                  const data = res.data || res;
                  alert(
                    `Bulk optimization completed.\nProcessed: ${data.processed}\nSkipped: ${data.skipped}`
                  );
                  await loadOptimizationData({
                    refresh: true,
                    scope: 'merchant',
                    reason: 'post_action',
                  });
                } catch (err) {
                  console.error('Bulk enrichment failed', err);
                  alert('Bulk optimization failed, please try again later.');
                } finally {
                  setBulkOptimizing(false);
                }
              }}
              className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {bulkOptimizing ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Wand2 className="mr-1 h-3 w-3" />
                  Bulk optimize
                </>
              )}
            </button>
            {agentPushSummary ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700">
                {agentPushSummary.excluded_variants} variants excluded from agent push
              </span>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-white shadow">
          <div className="space-y-2 border-b p-3">
            <div className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Where to fix
              </span>
              <div className="flex flex-wrap gap-1.5">
                {segmentOptions.map((opt) => {
                  const count =
                    opt.key === 'all'
                      ? queueSegmentCounts?.all
                      : queueSegmentCounts?.[opt.key];
                  const isActive = segmentFilter === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSegmentFilter(opt.key)}
                      aria-pressed={isActive}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium ring-1 transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white ring-blue-600'
                          : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {typeof count === 'number' ? (
                        <span className={isActive ? 'text-blue-100' : 'text-slate-400'}>
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            {issueFilter !== 'all' && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 ring-1 ring-amber-200">
                <span className="min-w-0 truncate">
                  Filtered:{' '}
                  <span className="font-medium">
                    {issueBuckets.find((b) => b.code === issueFilter)?.label ??
                      issueFilter.replaceAll('_', ' ')}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onClearIssueFilter}
                  className="ml-auto inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  Clear
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products by title..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full rounded-md border py-2 pl-10 pr-3 text-sm"
              />
            </div>
            <div className="grid gap-2 text-[11px] md:grid-cols-2">
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Sort:</span>
                <select
                  value={sortBy}
                  disabled={!qualityMetadataReady && sortBy !== 'default'}
                  onChange={(e) =>
                    setSortBy(e.target.value as 'default' | 'cq_desc' | 'mr_desc')
                  }
                  className="min-w-0 flex-1 rounded border bg-white px-2 py-1 text-[11px]"
                >
                  <option value="default">Readiness priority</option>
                  <option value="cq_desc" disabled={!qualityMetadataReady}>
                    CQ ↓
                  </option>
                  <option value="mr_desc" disabled={!qualityMetadataReady}>
                    MR ↓
                  </option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Issue:</span>
                <select
                  value={issueFilter}
                  onChange={(e) => setIssueFilter(e.target.value)}
                  className="min-w-0 flex-1 rounded border bg-white px-2 py-1 text-[11px]"
                >
                  <option value="all">All issues</option>
                  {issueBuckets.map((bucket) => (
                    <option key={bucket.code} value={bucket.code}>
                      {bucket.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Push:</span>
                <select
                  value={pushFilter}
                  onChange={(e) =>
                    setPushFilter(e.target.value as 'all' | 'eligible' | 'excluded')
                  }
                  className="min-w-0 flex-1 rounded border bg-white px-2 py-1 text-[11px]"
                >
                  <option value="all">All statuses</option>
                  <option value="eligible">Eligible for agent push</option>
                  <option value="excluded">Excluded from agent push</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <label className="flex items-center gap-1 text-gray-500">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={showBlockedOnly}
                    onChange={(e) => setShowBlockedOnly(e.target.checked)}
                  />
                  <span>Active blockers only</span>
                </label>
                <label className="flex items-center gap-1 text-gray-500">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={showOnlyLowQuality}
                    disabled={!qualityMetadataReady}
                    onChange={(e) => setShowOnlyLowQuality(e.target.checked)}
                  />
                  <span className={!qualityMetadataReady ? 'text-gray-400' : ''}>
                    Low CQ only (&lt; 60)
                  </span>
                </label>
              </div>
            </div>
            {entryFilterNotice && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                {entryFilterNotice}
              </div>
            )}
            {productQueuePage && productQueuePage.total_pages > 1 && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600 ring-1 ring-slate-200">
                <span>
                  Page {productQueuePage.page} of {productQueuePage.total_pages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!productQueuePage.has_prev || readinessLoading}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!productQueuePage.has_next || readinessLoading}
                    onClick={() =>
                      setCurrentPage((prev) =>
                        productQueuePage.total_pages > 0
                          ? Math.min(productQueuePage.total_pages, prev + 1)
                          : prev + 1
                      )
                    }
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="max-h-[660px] overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                {showBlockedOnly
                  ? 'No actively blocked products match the current filters.'
                  : 'No products match the current filters.'}
              </div>
            ) : (
              filteredProducts.map((item) => {
                const isActive =
                  selected &&
                  selected.platform === item.platform &&
                  selected.platform_product_id === item.platform_product_id;
                const title = item.enrichment?.title_override || item.standard?.title || '-';
                const cqScore = item.quality?.content_quality_score;
                const mrScore = item.quality?.model_readiness_score;
                const pushStatus = item.agent_push?.agent_push_status;

                return (
                  <div
                    key={`${item.platform}-${item.platform_product_id}`}
                    className={`border-b last:border-b-0 ${
                      isActive ? 'bg-blue-50/70' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          void handleSelect(item.platform, item.platform_product_id)
                        }
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100">
                          {item.standard?.main_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.standard.main_image_url}
                              alt={title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Package className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="line-clamp-2 text-[13px] font-medium leading-5 text-gray-900">
                            {title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {typeof cqScore === 'number' && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                CQ {cqScore.toFixed(0)}
                              </span>
                            )}
                            {typeof mrScore === 'number' && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                MR {mrScore.toFixed(0)}
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getAgentPushTone(
                                pushStatus
                              )}`}
                            >
                              {pushStatus === 'excluded_from_agent_push'
                                ? 'Excluded'
                                : 'Push-ready'}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-slate-600">
                            {getProductStatusLine(item)}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {formatProductPriceLine(item)}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleSelect(item.platform, item.platform_product_id, {
                            focusDetail: true,
                          })
                        }
                        className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {getProductActionLabel(item)}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
  );
}
