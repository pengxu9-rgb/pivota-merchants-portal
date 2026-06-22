import { getDescriptionText } from '@/lib/html-text';

export type AgentPushStatus = 'eligible_for_agent_push' | 'excluded_from_agent_push';

export type AgentPushProjection = {
  agent_push_status?: AgentPushStatus | null;
  agent_push_reason_codes?: string[];
  eligible_variant_count?: number;
  excluded_variant_count?: number;
  store_data_last_checked_at?: string | null;
};

export type AgentPushSummary = {
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

export type MerchantProductListItem = {
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

export type MerchantProductDetail = {
  merchant_id: string;
  platform: string;
  platform_product_id: string;
  standard: any;
  enrichment?: any;
  quality?: any;
  agent_push?: AgentPushProjection;
};

export type EnrichmentFormState = {
  title_override: string;
  summary_short: string;
  bullet_points: string[];
  usage_scenarios: string[];
  audience_tags: string[];
  topic_tags: string[];
  regulatory_disclaimer_local: string;
};

export type ReadinessSummary = {
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

export type OptimizationPlan = {
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

export type ScoreBundle = {
  readiness_score?: number | null;
  exposure_score?: number | null;
  conversion_score?: number | null;
};

export type ReadinessIssueBucket = {
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

export type MerchantReadinessAction = {
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

export type ProductQueueIssue = {
  code: string;
  label: string;
  impact: 'discovery_only' | 'checkout' | 'full_agent_commerce';
  affected_variant_count: number;
};

export type ProductQueueItem = {
  queue_item_scope: 'merchant' | 'product' | 'variant';
  queue_item_id: string;
  product_id: string;
  platform: string;
  platform_product_id?: string | null;
  platform_admin_url?: string | null;
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

export type ReadinessOptimizationPayload = {
  plan: OptimizationPlan;
  score_bundle: ScoreBundle;
  readiness_summary: ReadinessSummary;
  issue_buckets: ReadinessIssueBucket[];
  merchant_actions: MerchantReadinessAction[];
  product_queue: ProductQueueItem[];
  product_queue_page?: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
    applied_filters?: {
      search?: string | null;
      issue_bucket?: string | null;
      push_status?: string | null;
      blocked_only?: boolean;
      low_quality_only?: boolean;
      sort_by?: string | null;
    };
  };
  content_opportunity_count?: number;
  source_data_lanes?: SourceDataLaneSummary[];
  agent_push_summary?: AgentPushSummary;
  last_generated_at?: string | null;
};

export type RemediationAction = {
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

export type PatchCandidate = {
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

export type ReadinessActionPreview = {
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

export type VerificationResult = {
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

export type ExecutionJob = {
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

export type ReadinessActionRunResult = {
  job: ExecutionJob;
  action: RemediationAction;
  verification: VerificationResult;
  after_plan?: OptimizationPlan;
};

export type ProductBlockerSubject = {
  platform: string;
  platform_product_id: string;
  product_id: string;
  title: string;
};

export type ProductBlockerCounts = {
  ready_variant_count: number;
  blocked_variant_count: number;
  eligible_variant_count: number;
  excluded_variant_count: number;
};

export type ProductBlockerVariant = {
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

export type ProductBlockerDetail = {
  plan_id: string;
  snapshot_id: string;
  product: ProductBlockerSubject;
  summary: ProductBlockerCounts;
  variants: ProductBlockerVariant[];
};

export type SourceDataReasonCode =
  | 'missing_price'
  | 'out_of_stock'
  | 'missing_primary_image';

export type SourceDataTriageSummaryBucket = {
  code: SourceDataReasonCode;
  label: string;
  scope: 'product' | 'variant';
  affected_products: number;
  affected_variants: number;
};

export type SourceDataTriageRow = {
  scope: 'product' | 'variant';
  reason_code: SourceDataReasonCode;
  reason_label: string;
  platform: string;
  platform_product_id: string;
  platform_admin_url?: string | null;
  product_id: string;
  product_title: string;
  variant_id?: string | null;
  variant_title?: string | null;
  sku?: string | null;
  price_value?: number | null;
  price_currency?: string | null;
  inventory_quantity?: number | null;
  blocked_variant_count: number;
  excluded_variant_count: number;
  readiness_blocker_codes: string[];
  readiness_warning_codes: string[];
  agent_push_status: AgentPushStatus;
  agent_push_reason_codes: string[];
  recommended_action_type?: string | null;
  decision_state?:
    | 'restock_planned'
    | 'archive_planned'
    | 'manual_review'
    | 'pricing_fix_saved'
    | 'image_fix_saved'
    | null;
  fix_surface?:
    | 'product_content'
    | 'catalog_data'
    | 'integrations'
    | 'policy'
    | 'pivota_managed'
    | null;
};

export type SourceDataTriagePayload = {
  plan_id: string;
  snapshot_id: string;
  reason_code?: SourceDataReasonCode | null;
  summary: SourceDataTriageSummaryBucket[];
  rows: SourceDataTriageRow[];
  total_rows: number;
};

export type SourceDataLaneStateCount = {
  key: string;
  label: string;
  count: number;
};

export type SourceDataLaneDecisionCount = {
  key: string;
  label: string;
  count: number;
};

export type SourceDataLaneNextProduct = {
  platform: string;
  platform_product_id: string;
  platform_admin_url?: string | null;
  product_id: string;
  title: string;
  blocked_variant_count: number;
  excluded_variant_count: number;
  sample_variant_id?: string | null;
};

export type SourceDataLaneSummary = {
  reason_code: SourceDataReasonCode;
  label: string;
  affected_products: number;
  affected_variants: number;
  blocked_products: number;
  excluded_products: number;
  next_product?: SourceDataLaneNextProduct | null;
  queue_state_counts: SourceDataLaneStateCount[];
  decision_counts?: SourceDataLaneDecisionCount[];
};

export type ReadinessLaneDelta = {
  reason_code: SourceDataReasonCode;
  before_products: number;
  after_products: number;
  before_variants: number;
  after_variants: number;
  resolved_products: number;
  resolved_variants: number;
  state_counts_before: SourceDataLaneStateCount[];
  state_counts_after: SourceDataLaneStateCount[];
};

export type SourceDataProductGroup = {
  reason_code: SourceDataReasonCode;
  reason_label: string;
  platform: string;
  platform_product_id: string;
  platform_admin_url?: string | null;
  product_id: string;
  product_title: string;
  affected_rows: number;
  affected_variants: number;
  blocked_variant_count: number;
  excluded_variant_count: number;
  sample_variant_id?: string | null;
  sample_skus: string[];
  decision_state?:
    | 'restock_planned'
    | 'archive_planned'
    | 'manual_review'
    | 'pricing_fix_saved'
    | 'image_fix_saved'
    | null;
};

export type SourceDataLaneWorklist = {
  reason_code: SourceDataReasonCode;
  label: string;
  helper: string;
  affected_products: number;
  affected_variants: number;
  blocked_products: number;
  excluded_products: number;
  next_product: SourceDataLaneNextProduct | null;
  status_summary: Array<{
    key: string;
    label: string;
    count: number;
    className: string;
  }>;
  decision_counts: SourceDataLaneDecisionCount[];
  saved_target: SourceDataProductGroup | null;
  unsaved_target: SourceDataProductGroup | null;
};

export type OutOfStockBatchState =
  | 'whole_product_unavailable'
  | 'partially_recovered'
  | 'restocked_waiting_refresh'
  | 'no_matching_variants';

export type MissingPriceBatchState =
  | 'whole_product_missing_price'
  | 'partially_priced'
  | 'priced_waiting_refresh'
  | 'no_matching_variants';

export type SourceDataLaneProgress = {
  group_key: string;
  pending_variant_count: number;
  resolved_variant_count: number;
  total_variant_count: number;
  looks_resolved_now: boolean;
  batch_state?: OutOfStockBatchState | null;
  missing_price_state?: MissingPriceBatchState | null;
};

export type CatalogReviewQueueState =
  | 'restock_candidate'
  | 'archive_candidate'
  | 'manual_review'
  | 'whole_product_missing_price'
  | 'partially_priced'
  | 'priced_waiting_refresh'
  | 'hero_image_missing'
  | 'image_visible_now';

export type WorkspaceProductItem = MerchantProductListItem & {
  readiness: ProductQueueItem | null;
  readinessIndex: number;
};

export const emptyForm: EnrichmentFormState = {
  title_override: '',
  summary_short: '',
  bullet_points: [],
  usage_scenarios: [],
  audience_tags: [],
  topic_tags: [],
  regulatory_disclaimer_local: '',
};

export const formatReadinessCode = (value: string) =>
  value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const getReadinessTone = (tier?: string) => {
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

export const getIssueBucketCodeForReason = (code: string) => {
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

export const formatFieldLabel = (field: string) =>
  field
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const formatDelta = (value?: number | null) => {
  const safeValue = typeof value === 'number' ? value : 0;
  return `${safeValue >= 0 ? '+' : ''}${safeValue.toFixed(1)}`;
};

export const getImpactLabel = (
  impact: 'discovery_only' | 'checkout' | 'full_agent_commerce'
) => {
  if (impact === 'full_agent_commerce') return 'Blocks full agent commerce';
  if (impact === 'checkout') return 'Blocks checkout';
  return 'Limits discovery';
};

export const getManualReviewLabel = (
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

export const getStoreAdminLabel = (platform?: string | null) => {
  const normalizedPlatform = String(platform || '').toLowerCase();
  if (normalizedPlatform === 'shopify') {
    return 'Open in Shopify admin';
  }
  if (normalizedPlatform === 'wix') {
    return 'Open in Wix admin';
  }
  if (normalizedPlatform === 'woocommerce') {
    return 'Open in WooCommerce admin';
  }
  if (normalizedPlatform === 'bigcommerce') {
    return 'Open in BigCommerce admin';
  }
  return 'Open in store admin';
};

export const getAgentPushLabel = (status?: AgentPushStatus | null) =>
  status === 'excluded_from_agent_push'
    ? 'Excluded from agent push'
    : 'Eligible for agent push';

export const getAgentPushTone = (status?: AgentPushStatus | null) =>
  status === 'excluded_from_agent_push'
    ? 'bg-amber-100 text-amber-800'
    : 'bg-emerald-100 text-emerald-700';

export const formatAgentPushReason = (code: string) => {
  if (code === 'missing_price' || code === 'missing_currency') {
    return 'Missing price';
  }
  if (code === 'out_of_stock') {
    return 'Out of stock';
  }
  return formatReadinessCode(code);
};

export const getProductActionLabel = (item: WorkspaceProductItem) => {
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

export const getProductStatusLine = (item: WorkspaceProductItem) => {
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

export const formatProductPriceLine = (item: WorkspaceProductItem) => {
  const priceValue =
    typeof item.standard?.price === 'number'
      ? item.standard.price
      : item.standard?.price?.value;
  const currency =
    typeof item.standard?.price === 'number'
      ? ''
      : item.standard?.price?.currency || '';

  if (typeof priceValue === 'number') {
    return `${item.platform.toUpperCase()} · ${priceValue} ${currency}`.trim();
  }

  return `${item.platform.toUpperCase()} · No price`;
};

export const getSelectedProductSummary = (item: ProductQueueItem) => {
  if (item.agent_push_status === 'excluded_from_agent_push') {
    return 'Temporarily excluded from agent push until source data is fixed.';
  }

  if (item.blocked_variant_count > 0) {
    return `${item.blocked_variant_count} blocked variants still need work before this product is fully launch-ready.`;
  }

  return 'This product is already eligible for agent push. Keep the content clean and current.';
};

export const SOURCE_DATA_REASON_CONFIG: Record<
  SourceDataReasonCode,
  {
    label: string;
    helper: string;
    issueFilter: string;
    pushFilter: 'all' | 'eligible' | 'excluded';
    blockedOnly: boolean;
  }
> = {
  missing_price: {
    label: 'Missing price',
    helper: 'Variants missing price or currency. These stay excluded until store data is fixed.',
    issueFilter: 'price_currency',
    pushFilter: 'excluded',
    blockedOnly: false,
  },
  out_of_stock: {
    label: 'Out of stock',
    helper: 'Variants with zero stock or stale availability. Review and restock from your source catalog.',
    issueFilter: 'inventory_availability',
    pushFilter: 'excluded',
    blockedOnly: false,
  },
  missing_primary_image: {
    label: 'Missing primary image',
    helper: 'Products missing hero imagery. These need a product-level catalog fix rather than AI text enrichment.',
    issueFilter: 'catalog_content',
    pushFilter: 'all',
    blockedOnly: true,
  },
};

export const SOURCE_DATA_REASON_ORDER: SourceDataReasonCode[] = [
  'missing_price',
  'out_of_stock',
  'missing_primary_image',
];

export const getSourceDataRowAffectedVariantCount = (row: SourceDataTriageRow) => {
  if (row.scope === 'variant') return 1;
  return Math.max(row.blocked_variant_count, row.excluded_variant_count, 1);
};

export const buildSourceDataLaneGroupKey = (params: {
  reason_code: SourceDataReasonCode;
  platform: string;
  platform_product_id: string;
}) =>
  [
    params.reason_code,
    String(params.platform || '').toLowerCase(),
    String(params.platform_product_id || ''),
  ].join('|');

export const buildSourceDataProductKey = (params: {
  platform: string;
  platform_product_id: string;
}) =>
  [
    String(params.platform || '').toLowerCase(),
    String(params.platform_product_id || ''),
  ].join('|');

export const normalizeWorkspaceProductForTriage = (product: WorkspaceProductItem) => {
  const standard = product?.standard || {};
  const priceValue =
    typeof standard.price === 'number'
      ? standard.price
      : typeof standard.price?.value === 'number'
        ? standard.price.value
        : 0;
  const priceCurrency =
    typeof standard.price === 'number'
      ? (standard as any).currency || 'USD'
      : standard.price?.currency || (standard as any).currency || 'USD';
  const inventoryQuantity =
    (standard as any).inventory_quantity ??
    (standard as any).stock ??
    (standard as any).inventory ??
    0;

  return {
    ...product,
    id:
      (standard as any).product_id ||
      (standard as any).id ||
      product?.platform_product_id,
    platform: product?.platform || (standard as any).platform,
    platform_product_id:
      product?.platform_product_id ||
      (standard as any).product_id ||
      (standard as any).id,
    product_id:
      (standard as any).product_id || (standard as any).id || product?.platform_product_id,
    title: standard.title || (product as any)?.title || (product as any)?.name,
    description: getDescriptionText(
      (standard as any).description_text,
      (standard as any).description,
      (product as any)?.description_text,
      (product as any)?.description,
      (product as any)?.body_html
    ),
    price: priceValue,
    currency: priceCurrency,
    inventory_quantity: inventoryQuantity,
    stock: inventoryQuantity,
    status: (standard as any).status || (product as any)?.status,
    orderable:
      typeof (standard as any).orderable === 'boolean'
        ? (standard as any).orderable
        : (product as any)?.orderable,
    image_url:
      (standard as any).image_url ||
      standard.main_image_url ||
      (product as any)?.image_url,
    images: (standard as any).images || (product as any)?.images || [],
    variants: (((standard as any).variants || (product as any)?.variants || []) as any[]).map(
      (variant: any) => ({
        ...variant,
        id: variant?.variant_id || variant?.id,
        variant_id: variant?.variant_id || variant?.id,
        title:
          variant?.title ||
          variant?.name ||
          variant?.variant_id ||
          variant?.id,
        sku: variant?.sku || null,
        price:
          typeof variant?.price === 'number'
            ? variant.price
            : typeof variant?.price?.value === 'number'
              ? variant.price.value
              : 0,
        currency:
          typeof variant?.price === 'number'
            ? priceCurrency
            : variant?.price?.currency || priceCurrency,
        inventory_quantity:
          variant?.inventory_quantity ?? variant?.stock ?? variant?.inventory ?? 0,
      })
    ),
  };
};

export const getOutOfStockBatchState = (
  pendingVariantCount: number,
  resolvedVariantCount: number
): OutOfStockBatchState => {
  if (pendingVariantCount <= 0 && resolvedVariantCount <= 0) {
    return 'no_matching_variants';
  }
  if (pendingVariantCount <= 0) return 'restocked_waiting_refresh';
  if (resolvedVariantCount > 0) return 'partially_recovered';
  return 'whole_product_unavailable';
};

export const getMissingPriceBatchState = (
  pendingVariantCount: number,
  resolvedVariantCount: number
): MissingPriceBatchState => {
  if (pendingVariantCount <= 0 && resolvedVariantCount <= 0) {
    return 'no_matching_variants';
  }
  if (pendingVariantCount <= 0) return 'priced_waiting_refresh';
  if (resolvedVariantCount > 0) return 'partially_priced';
  return 'whole_product_missing_price';
};

export const getLaneQueueShortcuts = (
  reasonCode: SourceDataReasonCode
): Array<{
  label: string;
  queueState: CatalogReviewQueueState;
  className: string;
}> => {
  if (reasonCode === 'missing_price') {
    return [
      {
        label: 'Open pricing queue',
        queueState: 'whole_product_missing_price',
        className:
          'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
      },
    ];
  }

  if (reasonCode === 'out_of_stock') {
    return [
      {
        label: 'Restock queue',
        queueState: 'restock_candidate',
        className:
          'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
      },
      {
        label: 'Archive queue',
        queueState: 'archive_candidate',
        className:
          'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
      },
    ];
  }

  return [
    {
      label: 'Open image repair queue',
      queueState: 'hero_image_missing',
      className:
        'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
    },
  ];
};

export const matchesSourceDataReason = (
  item: WorkspaceProductItem,
  reasonCode: SourceDataReasonCode
) => {
  const issueCodes = (item.readiness?.top_issues || []).map((issue) => issue.code);
  const pushReasonCodes = item.agent_push?.agent_push_reason_codes || [];

  if (reasonCode === 'missing_price') {
    return (
      issueCodes.some(
        (code) => code === 'missing_price' || code === 'missing_currency'
      ) ||
      pushReasonCodes.some(
        (code) => code === 'missing_price' || code === 'missing_currency'
      )
    );
  }

  if (reasonCode === 'out_of_stock') {
    return (
      issueCodes.some((code) => code === 'out_of_stock' || code === 'inventory_stale') ||
      pushReasonCodes.includes('out_of_stock')
    );
  }

  return (
    issueCodes.includes('missing_primary_image') ||
    pushReasonCodes.includes('missing_primary_image')
  );
};

export const getInitialTriageReason = (focusIssue: string | null): SourceDataReasonCode => {
  if (focusIssue === 'inventory_availability') return 'out_of_stock';
  if (focusIssue === 'catalog_content') return 'missing_primary_image';
  return 'missing_price';
};

export const getLaneStatusBadgeClassName = (
  reasonCode: SourceDataReasonCode,
  stateKey: string
) => {
  if (reasonCode === 'missing_price') {
    if (stateKey === 'whole_product_missing_price') {
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
    }
    if (stateKey === 'partially_priced') {
      return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200';
    }
    return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  }

  if (reasonCode === 'out_of_stock') {
    if (stateKey === 'whole_product_unavailable') {
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
    }
    if (stateKey === 'partially_recovered') {
      return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200';
    }
    return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  }

  if (stateKey === 'hero_image_missing') {
    return 'bg-violet-50 text-violet-700 ring-1 ring-violet-200';
  }
  return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
};

export const getLaneUnresolvedDecisionCount = (lane: SourceDataLaneWorklist) => {
  if (lane.reason_code === 'out_of_stock') {
    return lane.status_summary
      .filter((item) => item.key === 'whole_product_unavailable')
      .reduce((sum, item) => sum + item.count, 0);
  }
  if (lane.reason_code === 'missing_price') {
    return lane.status_summary
      .filter(
        (item) =>
          item.key === 'whole_product_missing_price' ||
          item.key === 'partially_priced'
      )
      .reduce((sum, item) => sum + item.count, 0);
  }
  return lane.status_summary
    .filter((item) => item.key === 'hero_image_missing')
    .reduce((sum, item) => sum + item.count, 0);
};

export const isSavedDecisionStateForLane = (
  reasonCode: SourceDataReasonCode,
  decisionState?: SourceDataProductGroup['decision_state']
) => {
  if (!decisionState) return false;
  if (reasonCode === 'out_of_stock') {
    return (
      decisionState === 'restock_planned' ||
      decisionState === 'archive_planned' ||
      decisionState === 'manual_review'
    );
  }
  if (reasonCode === 'missing_price') {
    return decisionState === 'pricing_fix_saved';
  }
  return decisionState === 'image_fix_saved';
};

export const getLaneSavedCtaLabel = (reasonCode: SourceDataReasonCode) => {
  if (reasonCode === 'out_of_stock') return 'Continue saved queue';
  if (reasonCode === 'missing_price') return 'Continue saved pricing batch';
  return 'Continue saved image batch';
};

export const getLaneUnsavedCtaLabel = (reasonCode: SourceDataReasonCode) => {
  if (reasonCode === 'out_of_stock') return 'Open next undecided batch';
  if (reasonCode === 'missing_price') return 'Open first unsaved batch';
  return 'Open first unsaved image batch';
};
