'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Wand2,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type AgentPushStatus = 'eligible_for_agent_push' | 'excluded_from_agent_push';

type AgentPushProjection = {
  agent_push_status?: AgentPushStatus | null;
  agent_push_reason_codes?: string[];
  eligible_variant_count?: number;
  excluded_variant_count?: number;
  store_data_last_checked_at?: string | null;
};

type AgentPushSummary = {
  total_products: number;
  eligible_products: number;
  excluded_products: number;
  eligible_variants: number;
  excluded_variants: number;
  active_blocked_variants: number;
  top_reason_codes?: Array<{
    code: string;
    count: number;
  }>;
  last_checked_at?: string | null;
};

type MerchantProductListItem = {
  merchant_id: string;
  platform: string;
  platform_product_id: string;
  standard: {
    title?: string;
    price?: { value: number; currency: string } | number;
    main_image_url?: string;
    last_synced_at?: string;
  };
  enrichment?: any;
  quality?: {
    content_quality_score?: number | null;
    model_readiness_score?: number | null;
    conversion_potential_score?: number | null;
    last_evaluated_at?: string | null;
  };
  agent_push?: AgentPushProjection;
};

type MerchantProductDetail = {
  merchant_id: string;
  platform: string;
  platform_product_id: string;
  standard: any;
  enrichment?: any;
  quality?: any;
  agent_push?: AgentPushProjection;
};

type EnrichmentFormState = {
  title_override: string;
  summary_short: string;
  bullet_points: string[];
  usage_scenarios: string[];
  audience_tags: string[];
  topic_tags: string[];
  regulatory_disclaimer_local: string;
};

type ReadinessSummary = {
  tier: 'green' | 'yellow' | 'red';
  label: string;
  assessment_state: 'assessed' | 'not_assessed' | 'disabled';
  score?: number | null;
  ready_variant_count: number;
  blocked_variant_count: number;
  summary_text?: string | null;
  action_text?: string | null;
  recommended_actions?: string[];
  blocker_breakdown?: Array<{
    code: string;
    label: string;
    count: number;
  }>;
  top_blockers: string[];
  next_action?: string | null;
};

type OptimizationPlan = {
  plan_id: string;
  snapshot_id: string;
  workspace_version: string;
  priority_policy_version: string;
  refresh_state: string;
  plan_status: string;
  generated_at?: string | null;
  expires_at?: string | null;
  can_apply_actions: boolean;
  last_successful_rescore_at?: string | null;
};

type ScoreBundle = {
  readiness_score?: number | null;
  exposure_score?: number | null;
  conversion_score?: number | null;
};

type ReadinessIssueBucket = {
  code: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
  scope: 'merchant' | 'product';
  affected_count: number;
  fix_surface:
    | 'product_content'
    | 'catalog_data'
    | 'integrations'
    | 'policy'
    | 'pivota_managed';
  impact: 'discovery_only' | 'checkout' | 'full_agent_commerce';
  direct_target: string;
  reason_codes: string[];
};

type MerchantReadinessAction = {
  action_id?: string | null;
  action_type?: string | null;
  label: string;
  description: string;
  target_url: string;
  fix_surface:
    | 'product_content'
    | 'catalog_data'
    | 'integrations'
    | 'policy'
    | 'pivota_managed';
  scope: 'merchant' | 'product';
  impact: 'discovery_only' | 'checkout' | 'full_agent_commerce';
  affected_count: number;
  fixability?: 'merchant_fixable' | 'pivota_managed' | 'manual_review';
  priority_score?: number;
  priority_reason?: string | null;
  related_bucket_codes?: string[];
};

type ProductQueueIssue = {
  code: string;
  label: string;
  impact: 'discovery_only' | 'checkout' | 'full_agent_commerce';
  affected_variant_count: number;
};

type ProductQueueItem = {
  queue_item_scope: 'merchant' | 'product' | 'variant';
  queue_item_id: string;
  product_id: string;
  platform: string;
  platform_product_id?: string | null;
  title: string;
  image_url?: string | null;
  brand?: string | null;
  category?: string | null;
  price_value?: number | null;
  price_currency?: string | null;
  content_quality_score?: number | null;
  model_readiness_score?: number | null;
  conversion_potential_score?: number | null;
  quality_last_evaluated_at?: string | null;
  blocked_variant_count: number;
  ready_variant_count: number;
  agent_push_status?: AgentPushStatus | null;
  agent_push_reason_codes?: string[];
  eligible_variant_count?: number;
  excluded_variant_count?: number;
  store_data_last_checked_at?: string | null;
  top_issues: ProductQueueIssue[];
  primary_action?: string | null;
  fix_surface:
    | 'product_content'
    | 'catalog_data'
    | 'integrations'
    | 'policy'
    | 'pivota_managed';
  fixability: 'merchant_fixable' | 'pivota_managed' | 'manual_review';
  impact: 'discovery_only' | 'checkout' | 'full_agent_commerce';
  priority_score: number;
  priority_reason?: string | null;
  recommended_action_id?: string | null;
  recommended_action_type?: string | null;
};

type ReadinessOptimizationPayload = {
  plan: OptimizationPlan;
  score_bundle: ScoreBundle;
  readiness_summary: ReadinessSummary;
  issue_buckets: ReadinessIssueBucket[];
  merchant_actions: MerchantReadinessAction[];
  product_queue: ProductQueueItem[];
  agent_push_summary?: AgentPushSummary;
  last_generated_at?: string | null;
};

type RemediationAction = {
  action_id: string;
  plan_id: string;
  action_type: string;
  surface: string;
  scope: string;
  targets: Array<Record<string, any>>;
  fixability: string;
  priority_score: number;
  priority_reason?: string | null;
  reason?: string | null;
  preconditions: string[];
  idempotency_key?: string | null;
  status: string;
};

type PatchCandidate = {
  candidate_id: string;
  action_id: string;
  target_field: string;
  before: any;
  after: any;
  confidence?: number | null;
  rationale?: string | null;
  evidence_used?: Array<Record<string, any>>;
  risk_flags?: string[];
  requires_approval: boolean;
};

type ReadinessActionPreview = {
  action: RemediationAction;
  candidate_patches: PatchCandidate[];
  expected_impact?: {
    impact?: string | null;
    priority_score?: number | null;
    targets?: Array<{
      platform: string;
      platform_product_id: string;
      before_scores?: Record<string, number | null>;
      after_scores?: Record<string, number | null>;
      delta?: Record<string, number | null>;
    }>;
  };
  requires_approval: boolean;
  warnings: string[];
};

type VerificationResult = {
  verification_id: string;
  action_id: string;
  before_snapshot_id: string;
  after_snapshot_id: string;
  delta_scores?: Record<string, number | null>;
  resolved_issues?: string[];
  remaining_issues?: string[];
  expected_impact?: Record<string, any>;
  observed_impact?: Record<string, any>;
  merchant_visible_impact?: string | null;
};

type ExecutionJob = {
  job_id: string;
  action_id: string;
  executor_type: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  result?: Record<string, any>;
  error_code?: string | null;
  retry_count?: number;
};

type ReadinessActionRunResult = {
  job: ExecutionJob;
  action: RemediationAction;
  verification: VerificationResult;
  after_plan?: OptimizationPlan;
};

type ProductBlockerSubject = {
  platform: string;
  platform_product_id: string;
  product_id: string;
  title: string;
};

type ProductBlockerCounts = {
  ready_variant_count: number;
  blocked_variant_count: number;
  eligible_variant_count: number;
  excluded_variant_count: number;
};

type ProductBlockerVariant = {
  variant_id: string;
  title: string;
  sku?: string | null;
  price_value?: number | null;
  price_currency?: string | null;
  inventory_quantity?: number | null;
  readiness_status: 'ready' | 'blocked';
  readiness_blocker_codes: string[];
  readiness_warning_codes: string[];
  agent_push_status: AgentPushStatus;
  agent_push_reason_codes: string[];
};

type ProductBlockerDetail = {
  plan_id: string;
  snapshot_id: string;
  product: ProductBlockerSubject;
  summary: ProductBlockerCounts;
  variants: ProductBlockerVariant[];
};

type WorkspaceProductItem = MerchantProductListItem & {
  readiness: ProductQueueItem | null;
  readinessIndex: number;
};

const emptyForm: EnrichmentFormState = {
  title_override: '',
  summary_short: '',
  bullet_points: [],
  usage_scenarios: [],
  audience_tags: [],
  topic_tags: [],
  regulatory_disclaimer_local: '',
};

const formatReadinessCode = (value: string) =>
  value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getReadinessTone = (tier?: string) => {
  switch (tier) {
    case 'green':
      return {
        badge: 'bg-emerald-100 text-emerald-700',
        card: 'border-emerald-200 bg-emerald-50',
      };
    case 'yellow':
      return {
        badge: 'bg-amber-100 text-amber-800',
        card: 'border-amber-200 bg-amber-50',
      };
    case 'red':
    default:
      return {
        badge: 'bg-rose-100 text-rose-700',
        card: 'border-rose-200 bg-rose-50',
      };
  }
};

const getIssueBucketCodeForReason = (code: string) => {
  const mapping: Record<string, string> = {
    missing_title: 'catalog_content',
    missing_primary_image: 'catalog_content',
    missing_description: 'catalog_content',
    missing_price: 'price_currency',
    missing_currency: 'price_currency',
    out_of_stock: 'inventory_availability',
    inventory_stale: 'inventory_availability',
    missing_shipping_profile: 'shipping_returns_setup',
    merchant_shipping_policy_missing: 'shipping_returns_setup',
    merchant_return_policy_missing: 'shipping_returns_setup',
    merchant_checkout_capability_missing: 'checkout_payment_setup',
    checkout_stub_missing: 'checkout_payment_setup',
    payment_execution_stubbed: 'checkout_payment_setup',
    reviews_summary_unavailable: 'reviews_trust',
    cross_merchant_review_group_unresolved: 'reviews_trust',
    review_coverage_partial: 'reviews_trust',
    no_reviews_available: 'reviews_trust',
    merchant_writeback_unavailable: 'order_sync_operations',
    order_sync_stubbed: 'order_sync_operations',
  };
  return mapping[code] || 'other';
};

const formatFieldLabel = (field: string) =>
  field
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatDelta = (value?: number | null) => {
  const safeValue = typeof value === 'number' ? value : 0;
  return `${safeValue >= 0 ? '+' : ''}${safeValue.toFixed(1)}`;
};

const getImpactLabel = (
  impact: 'discovery_only' | 'checkout' | 'full_agent_commerce'
) => {
  if (impact === 'full_agent_commerce') return 'Blocks full agent commerce';
  if (impact === 'checkout') return 'Blocks checkout';
  return 'Limits discovery';
};

const getManualReviewLabel = (
  fixSurface:
    | 'product_content'
    | 'catalog_data'
    | 'integrations'
    | 'policy'
    | 'pivota_managed'
) => {
  if (fixSurface === 'integrations') return 'Open integrations';
  if (fixSurface === 'policy') return 'Review shipping and returns';
  if (fixSurface === 'catalog_data') return 'Review in catalog';
  if (fixSurface === 'pivota_managed') return 'Wait for Pivota processing';
  return 'Review issue details';
};

const getAgentPushLabel = (status?: AgentPushStatus | null) =>
  status === 'excluded_from_agent_push'
    ? 'Excluded from agent push'
    : 'Eligible for agent push';

const getAgentPushTone = (status?: AgentPushStatus | null) =>
  status === 'excluded_from_agent_push'
    ? 'bg-amber-100 text-amber-800'
    : 'bg-emerald-100 text-emerald-700';

const formatAgentPushReason = (code: string) => {
  if (code === 'missing_price' || code === 'missing_currency') {
    return 'Missing price';
  }
  if (code === 'out_of_stock') {
    return 'Out of stock';
  }
  return formatReadinessCode(code);
};

const getProductActionLabel = (item: WorkspaceProductItem) => {
  if (item.readiness?.recommended_action_type === 'run_product_enrichment') {
    return 'Optimize';
  }
  if (item.readiness?.fix_surface === 'catalog_data') {
    return 'Review in catalog';
  }
  if (item.readiness?.fix_surface === 'integrations') {
    return 'Open integrations';
  }
  return 'Review store data';
};

const getProductStatusLine = (item: WorkspaceProductItem) => {
  const push = item.agent_push;
  if (push?.agent_push_status === 'excluded_from_agent_push') {
    const reason = (push.agent_push_reason_codes || []).map(formatAgentPushReason).slice(0, 2).join(' · ');
    return reason ? `${getAgentPushLabel(push.agent_push_status)} · ${reason}` : getAgentPushLabel(push.agent_push_status);
  }

  if (item.readiness?.blocked_variant_count) {
    return `${item.readiness.blocked_variant_count} active blockers · ${item.readiness.top_issues[0]?.label || 'Needs review'}`;
  }

  if (item.readiness?.top_issues?.length) {
    return item.readiness.top_issues[0]?.label || 'Needs review';
  }

  return getAgentPushLabel(push?.agent_push_status);
};

const formatProductPriceLine = (item: WorkspaceProductItem) => {
  const priceValue = item.standard?.price?.value ?? item.standard?.price;
  const currency =
    typeof item.standard?.price === 'number'
      ? ''
      : item.standard?.price?.currency || '';

  if (typeof priceValue === 'number') {
    return `${item.platform.toUpperCase()} · ${priceValue} ${currency}`.trim();
  }

  return `${item.platform.toUpperCase()} · No price`;
};

const getSelectedProductSummary = (item: ProductQueueItem) => {
  if (item.agent_push_status === 'excluded_from_agent_push') {
    return 'Temporarily excluded from agent push until source data is fixed.';
  }

  if (item.blocked_variant_count > 0) {
    return `${item.blocked_variant_count} blocked variants still need work before this product is fully launch-ready.`;
  }

  return 'This product is already eligible for agent push. Keep the content clean and current.';
};

export default function ProductOptimizationPage() {
  const searchParams = useSearchParams();
  const fromReadiness = searchParams.get('source') === 'readiness';
  const focusIssue = searchParams.get('focus');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<MerchantProductListItem[]>([]);
  const [search, setSearch] = useState('');
  const [optimizationData, setOptimizationData] = useState<ReadinessOptimizationPayload | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);

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
  const [sortBy, setSortBy] = useState<'default' | 'cq_desc' | 'mr_desc'>(
    'default'
  );
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [showOnlyLowQuality, setShowOnlyLowQuality] = useState(false);
  const [issueFilter, setIssueFilter] = useState<string>('all');
  const [pushFilter, setPushFilter] = useState<'all' | 'eligible' | 'excluded'>(
    'all'
  );
  const [bulkOptimizing, setBulkOptimizing] = useState(false);
  const detailPaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadOptimizationData();
  }, []);

  useEffect(() => {
    if (fromReadiness && focusIssue) {
      setShowBlockedOnly(true);
    }
  }, [fromReadiness, focusIssue]);

  useEffect(() => {
    if (focusIssue) {
      setIssueFilter(focusIssue);
    }
  }, [focusIssue]);

  const loadOptimizationData = async (options?: {
    refresh?: boolean;
    scope?: 'merchant' | 'product' | 'variant';
    reason?: string;
  }) => {
    try {
      setReadinessLoading(true);
      const data = options?.refresh
        ? await apiClient.refreshMerchantReadinessOptimization({
            scope: options.scope ?? 'merchant',
            reason: options.reason ?? 'manual',
          })
        : await apiClient.getMerchantReadinessOptimization();
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
    planId: string
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
      console.error('Failed to load product blocker detail', err);
      setBlockerDetail(null);
      return null;
    } finally {
      setBlockerDetailLoading(false);
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
    if (productQueue.length === 0) {
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
      description_local:
        currentStandard.description ||
        currentStandard.description_text ||
        '',
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

  const filteredProducts = (() => {
    // Text search
    const base = queueDrivenProducts.filter((item) => {
      const title = item.enrichment?.title_override || item.standard?.title || '';
      const overrideTitle = item.enrichment?.title_override || '';
      const query = search.toLowerCase();
      if (!query) return true;
      return (
        title.toLowerCase().includes(query) ||
        overrideTitle.toLowerCase().includes(query)
      );
    });

    // Optional low-quality filter
    const filtered = base.filter((item) => {
      if (showBlockedOnly && !item.readiness?.blocked_variant_count) return false;
      if (
        pushFilter === 'excluded' &&
        item.agent_push?.agent_push_status !== 'excluded_from_agent_push'
      ) {
        return false;
      }
      if (
        pushFilter === 'eligible' &&
        item.agent_push?.agent_push_status === 'excluded_from_agent_push'
      ) {
        return false;
      }
      if (!showOnlyLowQuality) return true;
      const cq = item.quality?.content_quality_score;
      // Treat undefined scores as "not low-quality" for this filter
      return typeof cq === 'number' && cq < 60;
    });

    const issueFiltered = filtered.filter((item) => {
      if (issueFilter === 'all') return true;
      const issues = item.readiness?.top_issues || [];
      return issues.some((issue) => getIssueBucketCodeForReason(issue.code) === issueFilter);
    });

    // Sorting
    if (sortBy === 'default') {
      return [...issueFiltered].sort((a, b) => {
        const indexDiff = a.readinessIndex - b.readinessIndex;
        if (indexDiff !== 0) return indexDiff;

        const blockedDiff =
          (b.readiness?.blocked_variant_count || 0) -
          (a.readiness?.blocked_variant_count || 0);
        if (blockedDiff !== 0) return blockedDiff;

        const aCq =
          typeof a.quality?.content_quality_score === 'number'
            ? a.quality.content_quality_score
            : -1;
        const bCq =
          typeof b.quality?.content_quality_score === 'number'
            ? b.quality.content_quality_score
            : -1;
        return aCq - bCq;
      });
    }

    const sorted = [...issueFiltered];
    if (sortBy === 'cq_desc') {
      sorted.sort((a, b) => {
        const av = typeof a.quality?.content_quality_score === 'number'
          ? a.quality!.content_quality_score!
          : -1;
        const bv = typeof b.quality?.content_quality_score === 'number'
          ? b.quality!.content_quality_score!
          : -1;
        return bv - av;
      });
    } else if (sortBy === 'mr_desc') {
      sorted.sort((a, b) => {
        const av = typeof a.quality?.model_readiness_score === 'number'
          ? a.quality!.model_readiness_score!
          : -1;
        const bv = typeof b.quality?.model_readiness_score === 'number'
          ? b.quality!.model_readiness_score!
          : -1;
        return bv - av;
      });
    }
    return sorted;
  })();

  useEffect(() => {
    if (!fromReadiness || !focusIssue || !showBlockedOnly) {
      return;
    }
    if (filteredProducts.length > 0) {
      return;
    }

    const hasExcludedProductsForCurrentIssue = queueDrivenProducts.some((item) => {
      const excludedVariantCount =
        item.readiness?.excluded_variant_count ??
        item.agent_push?.excluded_variant_count ??
        0;
      if (excludedVariantCount <= 0) {
        return false;
      }
      if (issueFilter === 'all') {
        return true;
      }
      return (item.readiness?.top_issues || []).some(
        (issue) => getIssueBucketCodeForReason(issue.code) === issueFilter
      );
    });

    if (!hasExcludedProductsForCurrentIssue) {
      return;
    }

    setShowBlockedOnly(false);
    setEntryFilterNotice(
      'Showing excluded products because no active blockers matched the current filter.'
    );
  }, [
    filteredProducts.length,
    focusIssue,
    fromReadiness,
    issueFilter,
    queueDrivenProducts,
    showBlockedOnly,
  ]);

  useEffect(() => {
    if (!fromReadiness) {
      setEntryFilterNotice(null);
    }
  }, [fromReadiness]);

  useEffect(() => {
    if (selected || filteredProducts.length === 0) return;
    const first = filteredProducts[0];
    void handleSelect(first.platform, first.platform_product_id);
  }, [filteredProducts, selected]);

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

  const summaryTopIssues =
    readinessSummary?.blocker_breakdown && readinessSummary.blocker_breakdown.length > 0
      ? readinessSummary.blocker_breakdown
      : (readinessSummary?.top_blockers || []).slice(0, 3).map((code) => ({
          code,
          label: formatReadinessCode(code),
          count: 0,
        }));

  const storeSetupActions = merchantActions.filter((action) =>
    ['integrations', 'policy'].includes(action.fix_surface)
  );
  const productActions = merchantActions.filter((action) =>
    ['product_content', 'catalog_data'].includes(action.fix_surface)
  );
  const pivotaManagedActions = merchantActions.filter(
    (action) => action.fix_surface === 'pivota_managed'
  );

  const manualReviewHref =
    selectedQueueItem?.fix_surface === 'integrations' ||
    selectedQueueItem?.fix_surface === 'policy'
      ? '/dashboard/integrations'
      : selectedQueueItem
        ? (() => {
            const params = new URLSearchParams({
              platform: selectedQueueItem.platform,
              platformProductId:
                selectedQueueItem.platform_product_id ||
                selectedQueueItem.product_id,
              modal: 'review',
              source: 'readiness',
            });
            const priorityVariant = blockerDetail?.variants.find(
              (variant) =>
                variant.readiness_status === 'blocked' ||
                variant.agent_push_status === 'excluded_from_agent_push'
            );
            if (priorityVariant?.variant_id) {
              params.set('variantId', priorityVariant.variant_id);
            }
            return `/dashboard/products?${params.toString()}`;
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

  return (
    <div className="space-y-6">
      {readinessSummary && (
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
                {readinessLoading ? 'Refreshing…' : 'Refresh readiness'}
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
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* Left: product list */}
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
            <h2 className="max-w-[10ch] text-[1.6rem] font-bold leading-tight text-gray-900">
              Catalog products
            </h2>
              <p className="mt-1 text-xs text-gray-500">
                Review queue order, push status, and the products that still need edits.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
              {filteredProducts.length} in view
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products by title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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

      {/* Right: detail & enrichment editor */}
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
                    {detail.standard.description ||
                      detail.standard.description_text ||
                      '无描述'}
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
        </div>
      </div>
    </div>
  );
}
