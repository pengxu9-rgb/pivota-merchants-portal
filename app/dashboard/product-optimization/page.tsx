'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getDescriptionText } from '@/lib/html-text';
import {
  type CatalogReviewQueueState,
  type EnrichmentFormState,
  type ExecutionJob,
  type MerchantProductDetail,
  type MerchantProductListItem,
  type ProductBlockerDetail,
  type QueueSegment,
  type ReadinessActionPreview,
  type ReadinessActionRunResult,
  type ReadinessLaneDelta,
  type ReadinessOptimizationPayload,
  type SourceDataLaneProgress,
  type SourceDataLaneWorklist,
  type SourceDataProductGroup,
  type SourceDataReasonCode,
  type SourceDataTriagePayload,
  type SourceDataTriageRow,
  type VerificationResult,
  type WorkspaceProductItem,
  type WorkspaceTab,
  SOURCE_DATA_REASON_CONFIG,
  SOURCE_DATA_REASON_ORDER,
  buildSourceDataLaneGroupKey,
  buildSourceDataProductKey,
  emptyForm,
  getInitialTriageReason,
  getIssueBucketCodeForReason,
  getLaneStatusBadgeClassName,
  getMissingPriceBatchState,
  getOutOfStockBatchState,
  getSourceDataRowAffectedVariantCount,
  isSavedDecisionStateForLane,
  matchesSourceDataReason,
  normalizeWorkspaceProductForTriage,
} from './_shared';
import { CatalogHealthHeader } from './_components/CatalogHealthHeader';
import { SourceDataTriage } from './_components/SourceDataTriage';
import { BlockerQueue } from './_components/BlockerQueue';
import { ProductWorkspace } from './_components/ProductWorkspace';

export default function ProductOptimizationPage() {
  const searchParams = useSearchParams();
  const fromReadiness = searchParams.get('source') === 'readiness';
  const focusIssue = searchParams.get('focus');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<MerchantProductListItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [optimizationData, setOptimizationData] = useState<ReadinessOptimizationPayload | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [lastLaneDelta, setLastLaneDelta] = useState<ReadinessLaneDelta | null>(
    null
  );
  const [lastLaneDeltaReason, setLastLaneDeltaReason] =
    useState<SourceDataReasonCode | null>(null);

  const [selected, setSelected] = useState<{
    platform: string;
    platform_product_id: string;
  } | null>(null);
  const [detail, setDetail] = useState<MerchantProductDetail | null>(null);
  const [form, setForm] = useState<EnrichmentFormState>(emptyForm);

  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionPreviewLoading, setActionPreviewLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [qualityPreview, setQualityPreview] = useState<any | null>(null);
  const [actionPreview, setActionPreview] =
    useState<ReadinessActionPreview | null>(null);
  const [blockerDetail, setBlockerDetail] = useState<ProductBlockerDetail | null>(
    null
  );
  const [blockerDetailLoading, setBlockerDetailLoading] = useState(false);
  const [latestJob, setLatestJob] = useState<ExecutionJob | null>(null);
  const [verificationResult, setVerificationResult] =
    useState<VerificationResult | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [entryFilterNotice, setEntryFilterNotice] = useState<string | null>(null);
  const [lastOptimizedAt, setLastOptimizedAt] = useState<Record<string, number>>(
    {}
  );
  const [triageReason, setTriageReason] = useState<SourceDataReasonCode>(
    getInitialTriageReason(focusIssue)
  );
  const [sourceDataTriage, setSourceDataTriage] =
    useState<SourceDataTriagePayload | null>(null);
  const [sourceDataTriageReason, setSourceDataTriageReason] =
    useState<SourceDataReasonCode | null>(null);
  const [sourceDataTriageLoading, setSourceDataTriageLoading] = useState(false);
  const [sourceDataTriageError, setSourceDataTriageError] = useState<string | null>(
    null
  );
  const [triageExporting, setTriageExporting] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'cq_desc' | 'mr_desc'>(
    'default'
  );
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [showOnlyLowQuality, setShowOnlyLowQuality] = useState(false);
  const [issueFilter, setIssueFilter] = useState<string>(focusIssue || 'all');
  const [pushFilter, setPushFilter] = useState<'all' | 'eligible' | 'excluded'>(
    'all'
  );
  const [segmentFilter, setSegmentFilter] = useState<QueueSegment>('all');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('overview');
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkOptimizing, setBulkOptimizing] = useState(false);
  const detailPaneRef = useRef<HTMLDivElement | null>(null);
  const entryFocusResolutionRef = useRef<string | null>(null);
  const triageRequestIdRef = useRef(0);

  useEffect(() => {
    if (focusIssue) {
      setIssueFilter(focusIssue);
    }
  }, [focusIssue]);

  useEffect(() => {
    setTriageReason(getInitialTriageReason(focusIssue));
  }, [focusIssue]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortBy, showBlockedOnly, showOnlyLowQuality, issueFilter, pushFilter, segmentFilter]);

  const loadOptimizationData = async (options?: {
    refresh?: boolean;
    scope?: 'merchant' | 'product' | 'variant';
    reason?: string;
    reasonCode?: SourceDataReasonCode;
    page?: number;
  }) => {
    try {
      setReadinessLoading(true);
      const requestParams = {
        queue_mode: 'page' as const,
        page: options?.page ?? currentPage,
        page_size: 50,
        search: search || undefined,
        issue_bucket: issueFilter !== 'all' ? issueFilter : undefined,
        push_status: pushFilter,
        blocked_only: showBlockedOnly,
        low_quality_only: showOnlyLowQuality,
        sort_by: sortBy,
        segment: segmentFilter,
      };
      const response = options?.refresh
        ? await apiClient.refreshMerchantReadinessOptimizationDetailed({
            scope: options.scope ?? 'merchant',
            reason: options.reason ?? 'manual',
            reason_code: options.reasonCode,
            ...requestParams,
          })
        : await apiClient.getMerchantReadinessOptimization(requestParams);
      const data = options?.refresh ? response?.data || response : response;
      if (options?.refresh) {
        const laneDelta = (response as any)?.meta?.lane_delta || null;
        setLastLaneDelta(laneDelta);
        setLastLaneDeltaReason(
          laneDelta?.reason_code || options.reasonCode || null
        );
      } else {
        setLastLaneDelta(null);
        setLastLaneDeltaReason(null);
      }
      setOptimizationData(data || null);
      return data || null;
    } catch (err) {
      console.error('Failed to load readiness optimization payload', err);
      setOptimizationData(null);
      return null;
    } finally {
      setReadinessLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOptimizationData({ page: currentPage });
  }, [currentPage, search, sortBy, showBlockedOnly, showOnlyLowQuality, issueFilter, pushFilter, segmentFilter]);

  const upsertCachedProduct = (nextItem: MerchantProductListItem) => {
    setProducts((prev) => {
      const index = prev.findIndex(
        (item) =>
          item.platform === nextItem.platform &&
          item.platform_product_id === nextItem.platform_product_id
      );
      if (index === -1) {
        return [...prev, nextItem];
      }
      const next = [...prev];
      next[index] = {
        ...next[index],
        ...nextItem,
        standard: nextItem.standard || next[index].standard,
        enrichment: nextItem.enrichment ?? next[index].enrichment,
        quality: nextItem.quality ?? next[index].quality,
      };
      return next;
    });
  };

  const loadProductDetail = async (
    platform: string,
    platformProductId: string
  ) => {
    try {
      const data = await apiClient.getMerchantProductDetail(
        platform,
        platformProductId
      );
      setDetail(data);
      const enrichment = data.enrichment || {};
      setForm({
        title_override: enrichment.title_override || '',
        summary_short: enrichment.summary_short || '',
        bullet_points: enrichment.bullet_points || [],
        usage_scenarios: enrichment.usage_scenarios || [],
        audience_tags: enrichment.audience_tags || [],
        topic_tags: enrichment.topic_tags || [],
        regulatory_disclaimer_local:
          enrichment.regulatory_disclaimer_local || '',
      });
      upsertCachedProduct({
        merchant_id: data.merchant_id,
        platform: data.platform,
        platform_product_id: data.platform_product_id,
        standard: {
          title: data.standard?.title,
          price: data.standard?.price,
          main_image_url:
            data.standard?.image_url ||
            data.standard?.main_image_url ||
            data.standard?.images?.[0],
          last_synced_at: data.standard?.last_synced_at,
        },
        enrichment: data.enrichment,
        quality: data.quality,
        agent_push: data.agent_push,
      });
      if (data.quality) {
        setQualityPreview(data.quality);
      }
      return data;
    } catch (err) {
      console.error('Failed to load merchant product detail', err);
      return null;
    }
  };

  const loadProductBlockerDetail = async (
    platform: string,
    platformProductId: string,
    planId: string,
    allowRetry = true
  ) => {
    try {
      setBlockerDetailLoading(true);
      const data = await apiClient.getMerchantProductBlockers(
        platform,
        platformProductId,
        planId
      );
      setBlockerDetail(data || null);
      return data || null;
    } catch (err) {
      if (allowRetry && (isPlanSupersededError(err) || isRetryableOptimizationError(err))) {
        const refreshed = await loadOptimizationData({
          refresh: true,
          scope: 'product',
          reason: isPlanSupersededError(err) ? 'plan_superseded' : 'network_retry',
        });
        const nextPlanId = refreshed?.plan?.plan_id || planId;
        if (nextPlanId && nextPlanId !== planId) {
          return await loadProductBlockerDetail(
            platform,
            platformProductId,
            nextPlanId,
            false
          );
        }
        if (isRetryableOptimizationError(err)) {
          return await loadProductBlockerDetail(
            platform,
            platformProductId,
            planId,
            false
          );
        }
      }
      console.error('Failed to load product blocker detail', err);
      setBlockerDetail(null);
      return null;
    } finally {
      setBlockerDetailLoading(false);
    }
  };

  const applyTriageReasonFilters = (reasonCode: SourceDataReasonCode) => {
    const config = SOURCE_DATA_REASON_CONFIG[reasonCode];
    setIssueFilter(config.issueFilter);
    setPushFilter(config.pushFilter);
    setShowBlockedOnly(config.blockedOnly);
    setShowOnlyLowQuality(false);
  };

  const loadSourceDataTriage = async (
    planId: string,
    reasonCode: SourceDataReasonCode,
    allowRetry = true
  ) => {
    const requestId = triageRequestIdRef.current + 1;
    triageRequestIdRef.current = requestId;
    try {
      setSourceDataTriageLoading(true);
      setSourceDataTriageError(null);
      setSourceDataTriageReason(null);
      const data = await apiClient.getMerchantSourceDataTriage({
        plan_id: planId,
        reason_code: reasonCode,
        limit: 500,
      });
      if (requestId !== triageRequestIdRef.current) {
        return null;
      }
      setSourceDataTriage(data || null);
      setSourceDataTriageReason(reasonCode);
      return data || null;
    } catch (err) {
      if (requestId !== triageRequestIdRef.current) {
        return null;
      }
      if (allowRetry && (isPlanSupersededError(err) || isRetryableOptimizationError(err))) {
        const refreshed = await loadOptimizationData({
          refresh: true,
          scope: 'merchant',
          reason: isPlanSupersededError(err) ? 'plan_superseded' : 'network_retry',
        });
        const nextPlanId = refreshed?.plan?.plan_id || planId;
        if (nextPlanId && nextPlanId !== planId) {
          return await loadSourceDataTriage(nextPlanId, reasonCode, false);
        }
        if (isRetryableOptimizationError(err)) {
          return await loadSourceDataTriage(planId, reasonCode, false);
        }
      }
      if (isUnsupportedSourceDataTriageError(err)) {
        setSourceDataTriage(null);
        setSourceDataTriageReason(null);
        setSourceDataTriageError(
          'Detailed source-data triage is unavailable until the latest backend readiness routes are deployed.'
        );
        return null;
      }
      console.error('Failed to load source-data triage', err);
      setSourceDataTriage(null);
      setSourceDataTriageReason(null);
      setSourceDataTriageError(
        getActionErrorMessage(
          err,
          'Could not load source-data triage right now.'
        )
      );
      return null;
    } finally {
      if (requestId === triageRequestIdRef.current) {
        setSourceDataTriageLoading(false);
      }
    }
  };

  const handleSelect = async (
    platform: string,
    platformProductId: string,
    options?: { focusDetail?: boolean }
  ) => {
    setSelected({ platform, platform_product_id: platformProductId });
    setDetail(null);
    setQualityPreview(null);
    setForm(emptyForm);
    setActionPreview(null);
    setBlockerDetail(null);
    setLatestJob(null);
    setVerificationResult(null);
    setActionFeedback(null);
    await loadProductDetail(platform, platformProductId);
    if (options?.focusDetail) {
      window.setTimeout(() => {
        detailPaneRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 80);
    }
  };

  const isPlanSupersededError = (err: any) =>
    err?.response?.status === 409 &&
    err?.response?.data?.detail?.code === 'OPTIMIZATION_PLAN_SUPERSEDED';

  const isRetryableOptimizationError = (err: any) => {
    if (err?.response?.status) return false;
    const code = String(err?.code || '');
    const message = String(err?.message || '').toLowerCase();
    return (
      code === 'ERR_NETWORK' ||
      message.includes('network error') ||
      message.includes('connection closed')
    );
  };

  const isUnsupportedSourceDataTriageError = (err: any) => {
    const status = err?.response?.status;
    return status === 404 || status === 405 || status === 501;
  };

  const getActionErrorMessage = (err: any, fallback: string) => {
    const detailMessage =
      err?.response?.data?.detail?.message ||
      err?.response?.data?.detail ||
      err?.message;
    if (typeof detailMessage === 'string' && detailMessage.trim()) {
      return detailMessage;
    }
    return fallback;
  };

  const handleFormChange = (field: keyof EnrichmentFormState, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleBulletChange = (index: number, value: string) => {
    const next = [...form.bullet_points];
    next[index] = value;
    handleFormChange('bullet_points', next);
  };

  const addBullet = () => {
    handleFormChange('bullet_points', [...form.bullet_points, '']);
  };

  const removeBullet = (index: number) => {
    const next = form.bullet_points.filter((_, i) => i !== index);
    handleFormChange('bullet_points', next);
  };

  const parseTags = (input: string) =>
    input
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

  const formatTags = (tags: string[]) => tags.join(', ');

  const currentStandard = detail?.standard;
  const optimizationPlan = optimizationData?.plan || null;
  const scoreBundle = optimizationData?.score_bundle || null;
  const readinessSummary = optimizationData?.readiness_summary || null;
  const agentPushSummary = optimizationData?.agent_push_summary || null;
  const issueBuckets = optimizationData?.issue_buckets || [];
  const merchantActions = optimizationData?.merchant_actions || [];
  const productQueue = optimizationData?.product_queue || [];
  const productQueuePage = optimizationData?.product_queue_page || null;
  const queueSegmentCounts = optimizationData?.queue_segment_counts || null;
  const contentOpportunityCount = optimizationData?.content_opportunity_count || 0;
  const sourceDataLaneSummaries = optimizationData?.source_data_lanes || [];

  useEffect(() => {
    setActionPreview(null);
    setBlockerDetail(null);
    setLatestJob(null);
    setVerificationResult(null);
    setActionFeedback(null);
  }, [
    selected?.platform,
    selected?.platform_product_id,
    optimizationPlan?.plan_id,
  ]);

  useEffect(() => {
    if (!selected || !optimizationPlan?.plan_id) {
      setBlockerDetail(null);
      return;
    }
    void loadProductBlockerDetail(
      selected.platform,
      selected.platform_product_id,
      optimizationPlan.plan_id
    );
  }, [selected?.platform, selected?.platform_product_id, optimizationPlan?.plan_id]);

  useEffect(() => {
    if (!optimizationPlan?.plan_id) {
      triageRequestIdRef.current += 1;
      setSourceDataTriage(null);
      setSourceDataTriageReason(null);
      setSourceDataTriageError(null);
      setSourceDataTriageLoading(false);
      return;
    }
    setSourceDataTriage(null);
    setSourceDataTriageReason(null);
    void loadSourceDataTriage(optimizationPlan.plan_id, triageReason);
  }, [optimizationPlan?.plan_id, triageReason]);

  const productQueueMap = useMemo(() => {
    return new Map(
      productQueue.map((item, index) => [
        `${item.platform}|${item.platform_product_id || item.product_id}`,
        { item, index },
      ])
    );
  }, [productQueue]);

  const productsByKey = useMemo(() => {
    return new Map(
      products.map((item) => [
        `${item.platform}|${item.platform_product_id}`,
        item,
      ])
    );
  }, [products]);

  const queueDrivenProducts = useMemo<WorkspaceProductItem[]>(() => {
    if (!optimizationData) {
      return products.map((item) => ({
        ...item,
        readiness:
          productQueueMap.get(`${item.platform}|${item.platform_product_id}`)
            ?.item || null,
        readinessIndex:
          productQueueMap.get(`${item.platform}|${item.platform_product_id}`)
            ?.index ?? Number.MAX_SAFE_INTEGER,
      }));
    }

    if (productQueue.length === 0) {
      return [];
    }

    return productQueue.map((queueItem, index) => {
      const platformProductId =
        queueItem.platform_product_id || queueItem.product_id;
      const productKey = `${queueItem.platform}|${platformProductId}`;
      const base = productsByKey.get(productKey);
      const baseQuality = base?.quality || {};

      return {
        merchant_id: base?.merchant_id || '',
        platform: queueItem.platform,
        platform_product_id: platformProductId,
        standard: {
          title: base?.standard?.title || queueItem.title,
          price:
            base?.standard?.price ||
            (typeof queueItem.price_value === 'number'
              ? {
                  value: queueItem.price_value,
                  currency: queueItem.price_currency || 'USD',
                }
              : undefined),
          main_image_url:
            base?.standard?.main_image_url || queueItem.image_url || undefined,
          last_synced_at: base?.standard?.last_synced_at,
        },
        enrichment: base?.enrichment,
        quality: {
          content_quality_score:
            typeof baseQuality.content_quality_score === 'number'
              ? baseQuality.content_quality_score
              : typeof queueItem.content_quality_score === 'number'
                ? queueItem.content_quality_score
                : null,
          model_readiness_score:
            typeof baseQuality.model_readiness_score === 'number'
              ? baseQuality.model_readiness_score
              : typeof queueItem.model_readiness_score === 'number'
                ? queueItem.model_readiness_score
                : null,
          conversion_potential_score:
            typeof baseQuality.conversion_potential_score === 'number'
              ? baseQuality.conversion_potential_score
              : typeof queueItem.conversion_potential_score === 'number'
                ? queueItem.conversion_potential_score
                : null,
          last_evaluated_at:
            baseQuality.last_evaluated_at ||
            queueItem.quality_last_evaluated_at ||
            null,
        },
        agent_push: {
          agent_push_status:
            base?.agent_push?.agent_push_status ||
            queueItem.agent_push_status ||
            'eligible_for_agent_push',
          agent_push_reason_codes:
            base?.agent_push?.agent_push_reason_codes ||
            queueItem.agent_push_reason_codes ||
            [],
          eligible_variant_count:
            typeof base?.agent_push?.eligible_variant_count === 'number'
              ? base.agent_push.eligible_variant_count
              : typeof queueItem.eligible_variant_count === 'number'
                ? queueItem.eligible_variant_count
                : queueItem.ready_variant_count,
          excluded_variant_count:
            typeof base?.agent_push?.excluded_variant_count === 'number'
              ? base.agent_push.excluded_variant_count
              : typeof queueItem.excluded_variant_count === 'number'
                ? queueItem.excluded_variant_count
                : 0,
          store_data_last_checked_at:
            base?.agent_push?.store_data_last_checked_at ||
            queueItem.store_data_last_checked_at ||
            null,
        },
        readiness: queueItem,
        readinessIndex: index,
      };
    });
  }, [productQueue, productQueueMap, products, productsByKey]);

  const qualityPayload = useMemo(() => {
    if (!currentStandard) return null;
    const priceValue =
      typeof currentStandard.price === 'number'
        ? currentStandard.price
        : currentStandard.price?.value;

    return {
      title_local: form.title_override || currentStandard.title || '',
      description_local: getDescriptionText(
        currentStandard.description_text,
        currentStandard.description
      ),
      price_local_value: priceValue ?? null,
      main_image_url:
        currentStandard.image_url ||
        currentStandard.main_image_url ||
        currentStandard.images?.[0] ||
        '',
      summary_short: form.summary_short,
      bullet_points: form.bullet_points,
      usage_scenarios: form.usage_scenarios,
      audience_tags: form.audience_tags,
      topic_tags: form.topic_tags,
    };
  }, [currentStandard, form]);

  const selectedQueueItem =
    selected
      ? productQueue.find(
          (item) =>
            item.platform === selected.platform &&
            (item.platform_product_id || item.product_id) ===
              selected.platform_product_id
        ) || null
      : null;

  const selectedActionRequest = useMemo(() => {
    if (!optimizationPlan || !selectedQueueItem) {
      return null;
    }

    const target = {
      scope: selectedQueueItem.queue_item_scope,
      surface: selectedQueueItem.fix_surface,
      queue_item_id: selectedQueueItem.queue_item_id,
      product_id: selectedQueueItem.product_id,
      platform: selectedQueueItem.platform,
      platform_product_id:
        selectedQueueItem.platform_product_id || selectedQueueItem.product_id,
      reason: selectedQueueItem.primary_action || '',
    };

    return {
      plan_id: optimizationPlan.plan_id,
      action_id: selectedQueueItem.recommended_action_id || undefined,
      action_type: selectedQueueItem.recommended_action_type || undefined,
      targets: [target],
    };
  }, [optimizationPlan, selectedQueueItem]);

  const canExecuteSelectedAction =
    Boolean(selectedActionRequest) &&
    optimizationPlan?.can_apply_actions === true &&
    selectedQueueItem?.recommended_action_type === 'run_product_enrichment';

  const canApplyPreviewedAction =
    canExecuteSelectedAction &&
    Boolean(actionPreview) &&
    actionPreview?.action?.action_id ===
      (selectedActionRequest?.action_id || actionPreview?.action?.action_id);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = {
        title_override: form.title_override || null,
        summary_short: form.summary_short || null,
        bullet_points: form.bullet_points,
        usage_scenarios: form.usage_scenarios,
        audience_tags: form.audience_tags,
        topic_tags: form.topic_tags,
        regulatory_disclaimer_local:
          form.regulatory_disclaimer_local || null,
      };
      const res = await apiClient.updateMerchantProductEnrichment(
        selected.platform,
        selected.platform_product_id,
        payload
      );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              enrichment: res.enrichment || res,
            }
          : prev
      );
      // Update list item enrichment if present
      setProducts((prev) =>
        prev.map((item) =>
          item.platform === selected.platform &&
          item.platform_product_id === selected.platform_product_id
            ? { ...item, enrichment: res.enrichment || res }
            : item
        )
      );
      const refreshed = await loadOptimizationData({
        refresh: true,
        scope: 'product',
        reason: 'post_edit',
      });
      if (refreshed?.plan?.plan_id) {
        await loadProductBlockerDetail(
          selected.platform,
          selected.platform_product_id,
          refreshed.plan.plan_id
        );
      }
    } catch (err) {
      console.error('Failed to save enrichment', err);
      alert('Saving changes failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewQuality = async () => {
    if (!qualityPayload) return;
    setPreviewLoading(true);
    try {
      const res = await apiClient.previewProductQuality(qualityPayload);
      setQualityPreview(res.data || res);
    } catch (err) {
      console.error('Failed to preview quality', err);
      alert('Previewing the score failed. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveAndEval = async () => {
    if (!selected || !qualityPayload) return;
    setSaving(true);
    setPreviewLoading(true);
    try {
      await handleSave();
      const res = await apiClient.evalProductQuality(
        selected.platform,
        selected.platform_product_id,
        qualityPayload,
        'default'
      );
      const data = res.data || res;
      setQualityPreview(data);
      // Update list snapshot scores
      if (data && typeof data.content_quality_score !== 'undefined') {
        setProducts((prev) =>
          prev.map((item) =>
            item.platform === selected.platform &&
            item.platform_product_id === selected.platform_product_id
              ? {
                  ...item,
                  quality: {
                    ...(item.quality || {}),
                    content_quality_score: data.content_quality_score,
                    model_readiness_score: data.model_readiness_score,
                    conversion_potential_score:
                      data.conversion_potential_score,
                  },
                }
            : item
          )
        );
      }
      const refreshed = await loadOptimizationData({
        refresh: true,
        scope: 'product',
        reason: 'post_edit',
      });
      if (refreshed?.plan?.plan_id) {
        await loadProductBlockerDetail(
          selected.platform,
          selected.platform_product_id,
          refreshed.plan.plan_id
        );
      }
    } catch (err) {
      console.error('Failed to save & evaluate quality', err);
      alert('Saving and rescoring failed. Please try again.');
    } finally {
      setSaving(false);
      setPreviewLoading(false);
    }
  };

  const handleAutoOptimize = async () => {
    if (!selected || !selectedActionRequest || !canExecuteSelectedAction) return;
    const key = `${selected.platform}|${selected.platform_product_id}`;
    const now = Date.now();
    const last = lastOptimizedAt[key];
    if (last && now - last < 30_000) {
      const secs = Math.ceil((30_000 - (now - last)) / 1000);
      alert(`Suggested fixes are cooling down. Please try again in ${secs} seconds.`);
      return;
    }
    setOptimizing(true);
    setActionFeedback(null);
    try {
      const result = (await apiClient.runMerchantReadinessAction({
        ...selectedActionRequest,
        idempotency_key: `portal:${selectedActionRequest.plan_id}:${
          selectedActionRequest.action_id || selectedActionRequest.action_type
        }:${selected.platform}:${selected.platform_product_id}`,
        execution_mode: 'sync',
      })) as ReadinessActionRunResult;
      setLatestJob(result.job || null);
      setVerificationResult(result.verification || null);

      if (result.job?.job_id) {
        try {
          const latest = await apiClient.getMerchantReadinessJob(result.job.job_id);
          setLatestJob(latest || result.job);
        } catch (jobErr) {
          console.error('Failed to refresh remediation job state', jobErr);
        }
      }

      await loadProductDetail(
        selected.platform,
        selected.platform_product_id
      );
      setLastOptimizedAt((prev) => ({
        ...prev,
        [key]: Date.now(),
      }));
      const refreshed = await loadOptimizationData({
        refresh: true,
        scope: 'product',
        reason: 'post_action',
      });
      if (refreshed?.plan?.plan_id) {
        await loadProductBlockerDetail(
          selected.platform,
          selected.platform_product_id,
          refreshed.plan.plan_id
        );
      }
      setActionFeedback(
        result.verification?.merchant_visible_impact ||
          'Applied the recommended AI fix and refreshed readiness.'
      );
    } catch (err) {
      console.error('Failed to run auto optimization', err);
      if (isPlanSupersededError(err)) {
        await loadOptimizationData({
          refresh: true,
          scope: 'product',
          reason: 'plan_superseded',
        });
        setActionFeedback(
          'The readiness plan changed while you were working. We refreshed the workspace to the latest plan.'
        );
      } else {
        alert(
          getActionErrorMessage(
            err,
            'Applying the suggested fix failed. Please try again.'
          )
        );
      }
    } finally {
      setOptimizing(false);
    }
  };

  const handlePreviewRecommendedAction = async () => {
    if (!selectedActionRequest) return;
    setActionPreviewLoading(true);
    setActionFeedback(null);
    try {
      const preview = (await apiClient.previewMerchantReadinessAction({
        ...selectedActionRequest,
        dry_run: true,
      })) as ReadinessActionPreview;
      setActionPreview(preview);
      if (preview.warnings?.length > 0) {
        setActionFeedback(preview.warnings[0]);
      }
    } catch (err) {
      console.error('Failed to preview readiness action', err);
      if (isPlanSupersededError(err)) {
        await loadOptimizationData({
          refresh: true,
          scope: 'product',
          reason: 'plan_superseded',
        });
        setActionFeedback(
          'The readiness plan changed while you were working. We refreshed the workspace to the latest plan.'
        );
      } else {
        alert(
          getActionErrorMessage(
            err,
            'Failed to preview the recommended fix. Please try again.'
          )
        );
      }
    } finally {
      setActionPreviewLoading(false);
    }
  };

  const handleRefreshSelectedStatus = async () => {
    if (!selected) {
      await loadOptimizationData({
        refresh: true,
        scope: 'merchant',
        reason: 'manual',
      });
      return;
    }

      const refreshed = await loadOptimizationData({
        refresh: true,
        scope: 'product',
        reason: 'manual',
      });
      if (refreshed?.plan?.plan_id) {
        await loadProductBlockerDetail(
          selected.platform,
          selected.platform_product_id,
          refreshed.plan.plan_id
        );
      }
      await loadProductDetail(selected.platform, selected.platform_product_id);
  };

  const filteredProducts = queueDrivenProducts;

  useEffect(() => {
    if (!fromReadiness || !focusIssue) {
      entryFocusResolutionRef.current = null;
      return;
    }
    if (!queueDrivenProducts.length) {
      return;
    }

    const resolutionKey = `${focusIssue}:${queueDrivenProducts.length}`;
    if (entryFocusResolutionRef.current === resolutionKey) {
      return;
    }

    const matchesFocusedIssue = (item: WorkspaceProductItem) =>
      (item.readiness?.top_issues || []).some(
        (issue) => getIssueBucketCodeForReason(issue.code) === focusIssue
      );

    const hasActiveBlockedProductsForIssue = queueDrivenProducts.some((item) => {
      const blockedVariantCount = item.readiness?.blocked_variant_count || 0;
      return blockedVariantCount > 0 && matchesFocusedIssue(item);
    });

    const hasExcludedProductsForIssue = queueDrivenProducts.some((item) => {
      const excludedVariantCount =
        item.readiness?.excluded_variant_count ??
        item.agent_push?.excluded_variant_count ??
        0;
      return excludedVariantCount > 0 && matchesFocusedIssue(item);
    });

    if (!hasActiveBlockedProductsForIssue && hasExcludedProductsForIssue) {
      setShowBlockedOnly(false);
      setEntryFilterNotice(
        'Showing excluded products because no active blockers matched the current filter.'
      );
    } else {
      setShowBlockedOnly(true);
      setEntryFilterNotice(null);
    }

    entryFocusResolutionRef.current = resolutionKey;
  }, [focusIssue, fromReadiness, queueDrivenProducts]);

  useEffect(() => {
    if (!fromReadiness) {
      setEntryFilterNotice(null);
    }
  }, [fromReadiness]);

  useEffect(() => {
    if (!selected) return;

    const selectedStillVisible = filteredProducts.some(
      (item) =>
        item.platform === selected.platform &&
        item.platform_product_id === selected.platform_product_id
    );

    if (selectedStillVisible) {
      return;
    }

    if (filteredProducts.length > 0) {
      const first = filteredProducts[0];
      void handleSelect(first.platform, first.platform_product_id);
      return;
    }

    setSelected(null);
    setDetail(null);
    setQualityPreview(null);
    setForm(emptyForm);
    setActionPreview(null);
    setLatestJob(null);
    setVerificationResult(null);
    setActionFeedback(
      showBlockedOnly
        ? 'No blocked products match the current filters. Turn off `Blocked only` or choose a different issue.'
        : 'No products match the current filters.'
    );
  }, [filteredProducts, selected, showBlockedOnly]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  const isInCooldown = (() => {
    if (!selected) return false;
    const key = `${selected.platform}|${selected.platform_product_id}`;
    const ts = lastOptimizedAt[key];
    if (!ts) return false;
    return Date.now() - ts < 30_000;
  })();

  const storeSetupActions = merchantActions.filter((action) =>
    ['integrations', 'policy'].includes(action.fix_surface)
  );
  const pivotaManagedActions = merchantActions.filter(
    (action) => action.fix_surface === 'pivota_managed'
  );

  const activeSourceDataTriage =
    sourceDataTriageReason === triageReason ? sourceDataTriage : null;
  const triageSummaryByCode = new Map(
    (activeSourceDataTriage?.summary || []).map((bucket) => [bucket.code, bucket])
  );
  const sourceDataLaneSummaryByCode = new Map(
    sourceDataLaneSummaries.map((lane) => [lane.reason_code, lane])
  );
  const allTriageRows = activeSourceDataTriage?.rows || [];
  const allTriageGroups = (() => {
    const grouped = new Map<string, SourceDataProductGroup>();

    for (const row of allTriageRows) {
      const key = `${row.reason_code}|${row.platform}|${row.platform_product_id}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.affected_rows += 1;
        existing.affected_variants += getSourceDataRowAffectedVariantCount(row);
        existing.blocked_variant_count = Math.max(
          existing.blocked_variant_count,
          row.blocked_variant_count
        );
        existing.excluded_variant_count = Math.max(
          existing.excluded_variant_count,
          row.excluded_variant_count
        );
        if (row.variant_id && !existing.sample_variant_id) {
          existing.sample_variant_id = row.variant_id;
        }
        if (row.sku && !existing.sample_skus.includes(row.sku)) {
          existing.sample_skus.push(row.sku);
        }
        if (row.platform_admin_url && !existing.platform_admin_url) {
          existing.platform_admin_url = row.platform_admin_url;
        }
        continue;
      }

      grouped.set(key, {
        reason_code: row.reason_code,
        reason_label: row.reason_label,
        platform: row.platform,
        platform_product_id: row.platform_product_id,
        platform_admin_url: row.platform_admin_url || null,
        product_id: row.product_id,
        product_title: row.product_title,
        affected_rows: 1,
        affected_variants: getSourceDataRowAffectedVariantCount(row),
        blocked_variant_count: row.blocked_variant_count,
        excluded_variant_count: row.excluded_variant_count,
        sample_variant_id: row.variant_id || null,
        sample_skus: row.sku ? [row.sku] : [],
        decision_state: row.decision_state || null,
      });
    }

    return Array.from(grouped.values()).sort((a, b) => {
      const affectedDiff = b.affected_variants - a.affected_variants;
      if (affectedDiff !== 0) return affectedDiff;
      const excludedDiff = b.excluded_variant_count - a.excluded_variant_count;
      if (excludedDiff !== 0) return excludedDiff;
      return a.product_title.localeCompare(b.product_title);
    });
  })();
  const triageGroups = allTriageGroups.filter(
    (group) => group.reason_code === triageReason
  );
  const normalizedProductsBySourceDataKey = new Map(
    queueDrivenProducts.map((item) => [
      buildSourceDataProductKey({
        platform: item.platform,
        platform_product_id: item.platform_product_id,
      }),
      normalizeWorkspaceProductForTriage(item),
    ])
  );
  const sourceDataRowsByGroupKey = allTriageRows.reduce<
    Map<string, SourceDataTriageRow[]>
  >((acc, row) => {
    const key = buildSourceDataLaneGroupKey({
      reason_code: row.reason_code,
      platform: row.platform,
      platform_product_id: row.platform_product_id,
    });
    const existing = acc.get(key) || [];
    existing.push(row);
    acc.set(key, existing);
    return acc;
  }, new Map());
  const laneGroupProgressByKey = allTriageGroups.reduce<
    Map<string, SourceDataLaneProgress>
  >((acc, group) => {
    const groupKey = buildSourceDataLaneGroupKey(group);
    const currentProduct = normalizedProductsBySourceDataKey.get(
      buildSourceDataProductKey({
        platform: group.platform,
        platform_product_id: group.platform_product_id,
      })
    );
    const matchingRows = sourceDataRowsByGroupKey.get(groupKey) || [];

    if (group.reason_code === 'missing_primary_image') {
      const looksResolvedNow = Boolean(
        currentProduct?.image_url || currentProduct?.images?.[0]
      );
      const totalVariantCount = Math.max(group.affected_variants, 1);
      acc.set(groupKey, {
        group_key: groupKey,
        pending_variant_count: looksResolvedNow ? 0 : totalVariantCount,
        resolved_variant_count: looksResolvedNow ? totalVariantCount : 0,
        total_variant_count: totalVariantCount,
        looks_resolved_now: looksResolvedNow,
        batch_state: null,
        missing_price_state: null,
      });
      return acc;
    }

    let pendingVariantCount = 0;
    let resolvedVariantCount = 0;

    for (const row of matchingRows) {
      const variantId = String(row.variant_id || '');
      const currentVariant = variantId
        ? (currentProduct?.variants || []).find(
            (variant: any) => String(variant.variant_id || variant.id || '') === variantId
          )
        : null;
      const currentPrice =
        typeof currentVariant?.price === 'number'
          ? currentVariant.price
          : typeof row.price_value === 'number'
            ? row.price_value
            : 0;
      const currentCurrency = String(
        currentVariant?.currency || row.price_currency || currentProduct?.currency || ''
      ).trim();
      const currentInventory = Number(
        currentVariant?.inventory_quantity ?? row.inventory_quantity ?? 0
      );
      const looksResolvedNow =
        group.reason_code === 'missing_price'
          ? currentPrice > 0 && Boolean(currentCurrency)
          : currentInventory > 0;

      if (looksResolvedNow) {
        resolvedVariantCount += 1;
      } else {
        pendingVariantCount += 1;
      }
    }

    if (!matchingRows.length) {
      pendingVariantCount = Math.max(group.affected_variants, 1);
    }

    const totalVariantCount = Math.max(
      pendingVariantCount + resolvedVariantCount,
      group.affected_variants,
      1
    );

    acc.set(groupKey, {
      group_key: groupKey,
      pending_variant_count: pendingVariantCount,
      resolved_variant_count: resolvedVariantCount,
      total_variant_count: totalVariantCount,
      looks_resolved_now: pendingVariantCount === 0,
      batch_state:
        group.reason_code === 'out_of_stock'
          ? getOutOfStockBatchState(pendingVariantCount, resolvedVariantCount)
          : null,
      missing_price_state:
        group.reason_code === 'missing_price'
          ? getMissingPriceBatchState(pendingVariantCount, resolvedVariantCount)
          : null,
    });
    return acc;
  }, new Map());
  const triageLaneStatusSummaryByCode = new Map<
    SourceDataReasonCode,
    SourceDataLaneWorklist['status_summary']
  >(
    SOURCE_DATA_REASON_ORDER.map((reasonCode) => {
      const laneGroups = allTriageGroups.filter(
        (group) => group.reason_code === reasonCode
      );
      if (reasonCode === 'missing_price') {
        return [
          reasonCode,
          [
            {
              key: 'whole_product_missing_price',
              label: 'Whole product still missing price',
              count: laneGroups.filter(
                (group) =>
                  laneGroupProgressByKey.get(buildSourceDataLaneGroupKey(group))
                    ?.missing_price_state === 'whole_product_missing_price'
              ).length,
              className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
            },
            {
              key: 'partially_priced',
              label: 'Partially priced now',
              count: laneGroups.filter(
                (group) =>
                  laneGroupProgressByKey.get(buildSourceDataLaneGroupKey(group))
                    ?.missing_price_state === 'partially_priced'
              ).length,
              className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
            },
            {
              key: 'priced_waiting_refresh',
              label: 'Price visible now',
              count: laneGroups.filter(
                (group) =>
                  laneGroupProgressByKey.get(buildSourceDataLaneGroupKey(group))
                    ?.missing_price_state === 'priced_waiting_refresh'
              ).length,
              className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
            },
          ],
        ] as const;
      }

      if (reasonCode === 'out_of_stock') {
        return [
          reasonCode,
          [
            {
              key: 'whole_product_unavailable',
              label: 'Whole product unavailable',
              count: laneGroups.filter(
                (group) =>
                  laneGroupProgressByKey.get(buildSourceDataLaneGroupKey(group))
                    ?.batch_state === 'whole_product_unavailable'
              ).length,
              className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
            },
            {
              key: 'partially_recovered',
              label: 'Partially back in stock',
              count: laneGroups.filter(
                (group) =>
                  laneGroupProgressByKey.get(buildSourceDataLaneGroupKey(group))
                    ?.batch_state === 'partially_recovered'
              ).length,
              className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
            },
            {
              key: 'restocked_waiting_refresh',
              label: 'Back in stock now',
              count: laneGroups.filter(
                (group) =>
                  laneGroupProgressByKey.get(buildSourceDataLaneGroupKey(group))
                    ?.batch_state === 'restocked_waiting_refresh'
              ).length,
              className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
            },
          ],
        ] as const;
      }

      return [
        reasonCode,
        [
          {
            key: 'hero_image_missing',
            label: 'Hero image still missing',
            count: laneGroups.filter(
              (group) =>
                laneGroupProgressByKey.get(buildSourceDataLaneGroupKey(group))
                  ?.looks_resolved_now === false
            ).length,
            className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
          },
          {
            key: 'image_visible_now',
            label: 'Primary image visible now',
            count: laneGroups.filter(
              (group) =>
                laneGroupProgressByKey.get(buildSourceDataLaneGroupKey(group))
                  ?.looks_resolved_now === true
            ).length,
            className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
          },
        ],
      ] as const;
    })
  );
  const firstTriageGroup = triageGroups[0] || null;
  const triageLaneWorklists: SourceDataLaneWorklist[] = SOURCE_DATA_REASON_ORDER.map(
    (reasonCode) => {
      const config = SOURCE_DATA_REASON_CONFIG[reasonCode];
      const bucket = triageSummaryByCode.get(reasonCode);
      const backendLane = sourceDataLaneSummaryByCode.get(reasonCode);
      const laneProducts = queueDrivenProducts.filter((item) =>
        matchesSourceDataReason(item, reasonCode)
      );
      const blockedProducts = laneProducts.filter(
        (item) => (item.readiness?.blocked_variant_count || 0) > 0
      ).length;
      const excludedProducts = laneProducts.filter((item) => {
        const excludedVariantCount =
          item.readiness?.excluded_variant_count ??
          item.agent_push?.excluded_variant_count ??
          0;
        return excludedVariantCount > 0;
      }).length;
      const laneGroups = allTriageGroups.filter((group) => group.reason_code === reasonCode);
      const unresolvedLaneGroups = laneGroups.filter((group) => {
        const progress = laneGroupProgressByKey.get(buildSourceDataLaneGroupKey(group));
        if (!progress) return true;
        if (reasonCode === 'missing_primary_image') {
          return progress.looks_resolved_now === false;
        }
        return progress.pending_variant_count > 0;
      });
      const savedTarget =
        unresolvedLaneGroups.find((group) =>
          isSavedDecisionStateForLane(reasonCode, group.decision_state)
        ) || null;
      const unsavedTarget =
        unresolvedLaneGroups.find(
          (group) => !isSavedDecisionStateForLane(reasonCode, group.decision_state)
        ) || null;

      return {
        reason_code: reasonCode,
        label: config.label,
        helper: config.helper,
        affected_products:
          backendLane?.affected_products ?? bucket?.affected_products ?? laneProducts.length,
        affected_variants:
          backendLane?.affected_variants ?? bucket?.affected_variants ?? 0,
        blocked_products: backendLane?.blocked_products ?? blockedProducts,
        excluded_products: backendLane?.excluded_products ?? excludedProducts,
        next_product: backendLane?.next_product || null,
        status_summary:
          backendLane?.queue_state_counts?.map((item) => ({
            key: item.key,
            label: item.label,
            count: item.count,
            className: getLaneStatusBadgeClassName(reasonCode, item.key),
          })) ||
          triageLaneStatusSummaryByCode.get(reasonCode) ||
          [],
        decision_counts: backendLane?.decision_counts || [],
        saved_target: savedTarget,
        unsaved_target: unsavedTarget,
      };
    }
  );
  const totalTriageProducts = triageLaneWorklists.reduce(
    (sum, lane) => sum + lane.affected_products,
    0
  );
  const totalTriageVariants = triageLaneWorklists.reduce(
    (sum, lane) => sum + lane.affected_variants,
    0
  );
  const triageActiveLaneCount = triageLaneWorklists.filter(
    (lane) => lane.affected_products > 0
  ).length;
  const busiestTriageLane =
    [...triageLaneWorklists].sort((a, b) => {
      const productDiff = b.affected_products - a.affected_products;
      if (productDiff !== 0) return productDiff;
      return b.affected_variants - a.affected_variants;
    })[0] || null;

  const buildCatalogReviewHref = ({
    platform,
    platformProductId,
    variantId,
    reasonCode,
    queueState,
    includePlanId = true,
  }: {
    platform: string;
    platformProductId: string;
    variantId?: string | null;
    reasonCode?: SourceDataReasonCode | null;
    queueState?: CatalogReviewQueueState | null;
    includePlanId?: boolean;
  }) => {
    const params = new URLSearchParams({
      platform,
      platformProductId,
      modal: 'review',
      source: 'readiness',
    });
    if (variantId) {
      params.set('variantId', variantId);
    }
    if (reasonCode) {
      params.set('reasonCode', reasonCode);
    }
    if (queueState) {
      params.set('queueState', queueState);
    }
    if (includePlanId && optimizationPlan?.plan_id) {
      params.set('planId', optimizationPlan.plan_id);
    }
    return `/dashboard/products?${params.toString()}`;
  };

  const manualReviewHref =
    selectedQueueItem?.fix_surface === 'integrations' ||
    selectedQueueItem?.fix_surface === 'policy'
      ? '/dashboard/integrations'
      : selectedQueueItem
        ? (() => {
            const selectedQueueMatchesCurrentTriageReason =
              triageReason === 'missing_primary_image'
                ? selectedQueueItem.top_issues.some(
                    (issue) => issue.code === 'missing_primary_image'
                  )
                : triageReason === 'out_of_stock'
                  ? selectedQueueItem.top_issues.some(
                      (issue) => issue.code === 'out_of_stock'
                    ) ||
                    (selectedQueueItem.agent_push_reason_codes || []).includes(
                      'out_of_stock'
                    )
                  : selectedQueueItem.top_issues.some(
                      (issue) =>
                        issue.code === 'missing_price' ||
                        issue.code === 'missing_currency'
                    ) ||
                    (selectedQueueItem.agent_push_reason_codes || []).some(
                      (code) =>
                        code === 'missing_price' || code === 'missing_currency'
                    );
            const priorityVariant = blockerDetail?.variants.find(
              (variant) =>
                variant.readiness_status === 'blocked' ||
                variant.agent_push_status === 'excluded_from_agent_push'
            );
            return buildCatalogReviewHref({
              platform: selectedQueueItem.platform,
              platformProductId:
                selectedQueueItem.platform_product_id ||
                selectedQueueItem.product_id,
              variantId: priorityVariant?.variant_id || null,
              reasonCode: selectedQueueMatchesCurrentTriageReason
                ? triageReason
                : null,
            });
          })()
        : '/dashboard/products';

  const blockerVariants = blockerDetail?.variants || [];
  const activeBlockedVariants = blockerVariants.filter(
    (variant) => variant.readiness_status === 'blocked'
  );
  const excludedVariants = blockerVariants.filter(
    (variant) => variant.agent_push_status === 'excluded_from_agent_push'
  );

  const qualityMetadataReady = queueDrivenProducts.some(
    (item) =>
      typeof item.quality?.content_quality_score === 'number' ||
      typeof item.quality?.model_readiness_score === 'number'
  );

  const handleSelectTriageReason = (reasonCode: SourceDataReasonCode) => {
    setTriageReason(reasonCode);
    applyTriageReasonFilters(reasonCode);
    setSourceDataTriageError(null);
    if (sourceDataTriageReason !== reasonCode) {
      setSourceDataTriageReason(null);
    }
  };

  const handleOpenTriageLane = (reasonCode: SourceDataReasonCode) => {
    const isSameLane = reasonCode === triageReason;
    handleSelectTriageReason(reasonCode);
    if (isSameLane && optimizationPlan?.plan_id) {
      void loadSourceDataTriage(optimizationPlan.plan_id, reasonCode);
    }
  };

  const handleExportTriageLane = async (reasonCode: SourceDataReasonCode) => {
    if (!optimizationPlan?.plan_id) return;
    setTriageExporting(true);
    const triggerDownload = (blob: Blob, laneCode: SourceDataReasonCode) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `catalog-health-${laneCode}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    };

    const attemptExport = async (planId: string) => {
      const blob = await apiClient.exportMerchantSourceDataTriageCSV({
        plan_id: planId,
        reason_code: reasonCode,
      });
      triggerDownload(blob, reasonCode);
    };

    try {
      await attemptExport(optimizationPlan.plan_id);
    } catch (err) {
      if (isPlanSupersededError(err) || isRetryableOptimizationError(err)) {
        try {
          const refreshed = await loadOptimizationData({
            refresh: true,
            scope: 'merchant',
            reason: isPlanSupersededError(err) ? 'plan_superseded' : 'network_retry',
          });
          const nextPlanId = refreshed?.plan?.plan_id || optimizationPlan.plan_id;
          await attemptExport(nextPlanId);
          return;
        } catch (retryErr) {
          console.error('Failed to export source-data triage CSV after retry', retryErr);
          alert(
            getActionErrorMessage(
              retryErr,
              'Could not export the current triage lane.'
            )
          );
          return;
        }
      }
      console.error('Failed to export source-data triage CSV', err);
      if (isUnsupportedSourceDataTriageError(err)) {
        alert(
          'CSV export for source-data triage is unavailable until the latest backend readiness routes are deployed.'
        );
        return;
      }
      alert(
        getActionErrorMessage(
          err,
          'Could not export the current triage lane.'
        )
      );
    } finally {
      setTriageExporting(false);
    }
  };

  const handleExportCurrentTriageLane = async () => {
    await handleExportTriageLane(triageReason);
  };

  return (
    <div className="space-y-6">
      {readinessSummary && (
        <CatalogHealthHeader
          readinessSummary={readinessSummary}
          fromReadiness={fromReadiness}
          optimizationData={optimizationData}
          optimizationPlan={optimizationPlan}
          scoreBundle={scoreBundle}
          agentPushSummary={agentPushSummary}
          contentOpportunityCount={contentOpportunityCount}
          readinessLoading={readinessLoading}
          loadOptimizationData={loadOptimizationData}
          storeSetupActions={storeSetupActions}
          pivotaManagedActions={pivotaManagedActions}
        />
      )}

      {optimizationPlan && (
        <SourceDataTriage
          optimizationPlan={optimizationPlan}
          buildCatalogReviewHref={buildCatalogReviewHref}
          firstTriageGroup={firstTriageGroup}
          triageReason={triageReason}
          handleExportCurrentTriageLane={handleExportCurrentTriageLane}
          triageExporting={triageExporting}
          sourceDataTriageLoading={sourceDataTriageLoading}
          sourceDataTriageError={sourceDataTriageError}
          triageActiveLaneCount={triageActiveLaneCount}
          totalTriageProducts={totalTriageProducts}
          totalTriageVariants={totalTriageVariants}
          contentOpportunityCount={contentOpportunityCount}
          busiestTriageLane={busiestTriageLane}
          lastLaneDelta={lastLaneDelta}
          lastLaneDeltaReason={lastLaneDeltaReason}
          triageLaneWorklists={triageLaneWorklists}
          readinessLoading={readinessLoading}
          loadOptimizationData={loadOptimizationData}
          handleOpenTriageLane={handleOpenTriageLane}
          handleExportTriageLane={handleExportTriageLane}
        />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* Left: product list */}
      <BlockerQueue
        contentOpportunityCount={contentOpportunityCount}
        productQueuePage={productQueuePage}
        filteredProducts={filteredProducts}
        bulkOptimizing={bulkOptimizing}
        setBulkOptimizing={setBulkOptimizing}
        loadOptimizationData={loadOptimizationData}
        agentPushSummary={agentPushSummary}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        sortBy={sortBy}
        setSortBy={setSortBy}
        qualityMetadataReady={qualityMetadataReady}
        issueFilter={issueFilter}
        setIssueFilter={setIssueFilter}
        issueBuckets={issueBuckets}
        pushFilter={pushFilter}
        setPushFilter={setPushFilter}
        segmentFilter={segmentFilter}
        setSegmentFilter={setSegmentFilter}
        queueSegmentCounts={queueSegmentCounts}
        showBlockedOnly={showBlockedOnly}
        setShowBlockedOnly={setShowBlockedOnly}
        showOnlyLowQuality={showOnlyLowQuality}
        setShowOnlyLowQuality={setShowOnlyLowQuality}
        entryFilterNotice={entryFilterNotice}
        setCurrentPage={setCurrentPage}
        readinessLoading={readinessLoading}
        selected={selected}
        handleSelect={handleSelect}
      />

      {/* Right: detail & enrichment editor */}
      <ProductWorkspace
        detailPaneRef={detailPaneRef}
        workspaceTab={workspaceTab}
        setWorkspaceTab={setWorkspaceTab}
        selectedQueueItem={selectedQueueItem}
        handleRefreshSelectedStatus={handleRefreshSelectedStatus}
        readinessLoading={readinessLoading}
        canExecuteSelectedAction={canExecuteSelectedAction}
        handlePreviewRecommendedAction={handlePreviewRecommendedAction}
        actionPreviewLoading={actionPreviewLoading}
        handleAutoOptimize={handleAutoOptimize}
        optimizing={optimizing}
        canApplyPreviewedAction={canApplyPreviewedAction}
        isInCooldown={isInCooldown}
        manualReviewHref={manualReviewHref}
        actionFeedback={actionFeedback}
        activeBlockedVariants={activeBlockedVariants}
        excludedVariants={excludedVariants}
        blockerDetailLoading={blockerDetailLoading}
        blockerVariants={blockerVariants}
        actionPreview={actionPreview}
        verificationResult={verificationResult}
        latestJob={latestJob}
        detail={detail}
        selectedActionRequest={selectedActionRequest}
        form={form}
        handleFormChange={handleFormChange}
        handleBulletChange={handleBulletChange}
        addBullet={addBullet}
        removeBullet={removeBullet}
        parseTags={parseTags}
        formatTags={formatTags}
        handleSave={handleSave}
        saving={saving}
        handlePreviewQuality={handlePreviewQuality}
        previewLoading={previewLoading}
        handleSaveAndEval={handleSaveAndEval}
        qualityPayload={qualityPayload}
        qualityPreview={qualityPreview}
      />
      </div>
    </div>
  );
}
