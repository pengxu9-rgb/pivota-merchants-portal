'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Package,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  EmptyState,
  MerchantButton,
  MerchantLinkButton,
  PageHeader,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import { getDescriptionText } from '@/lib/html-text';

function isProductSellable(product: any): boolean {
  const explicit =
    product?.sellable ?? product?.is_sellable ?? product?.isSellable ?? product?.sellable_status;
  if (typeof explicit === 'boolean') return explicit;
  if (typeof explicit === 'number') return explicit === 1;
  if (typeof explicit === 'string') {
    const normalized = explicit.trim().toLowerCase();
    if (['sellable', 'true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['not_sellable', 'not sellable', 'false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }

  const rawStatus = (product?.status ?? '').toString().toLowerCase();
  const orderable = product?.orderable;
  return rawStatus === 'active' && orderable !== false;
}

function hasContentGap(product: any) {
  const hasDescription = Boolean(
    getDescriptionText(
      product?.description_text,
      product?.description,
      product?.body_html,
      product?.summary
    )
  );
  const hasImage = Boolean(
    product?.image_url || product?.image || product?.images?.[0] || product?.main_image_url
  );

  return !hasDescription || !hasImage;
}

function getProductStatusInfo(
  product: any,
  t: (key: string, variables?: Record<string, string | number | undefined>) => string
): { label: string; tone: 'success' | 'warning' | 'neutral' | 'critical' } {
  const rawStatus = (product?.status ?? '').toString().toLowerCase();

  if (rawStatus === 'active') {
    if (!isProductSellable(product)) {
      return {
        label: t('dashboard.products.status.blocked'),
        tone: 'warning',
      };
    }
    return {
      label: t('dashboard.products.status.channelReady'),
      tone: 'success',
    };
  }

  if (!rawStatus) {
    return {
      label: t('dashboard.products.status.draft'),
      tone: 'neutral',
    };
  }

  return {
    label: rawStatus
      .split('_')
      .map((word: string) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
      .join(' '),
    tone: 'neutral',
  };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function normalizeProductForReview(product: any) {
  const standard = product?.standard || product || {};
  const priceValue =
    typeof standard.price === 'number'
      ? standard.price
      : typeof standard.price?.value === 'number'
        ? standard.price.value
        : 0;
  const priceCurrency =
    typeof standard.price === 'number'
      ? standard.currency || 'USD'
      : standard.price?.currency || standard.currency || 'USD';
  const inventoryQuantity =
    standard.inventory_quantity ?? standard.stock ?? standard.inventory ?? 0;

  return {
    ...product,
    id:
      standard.product_id ||
      standard.id ||
      product?.platform_product_id ||
      product?.product_id,
    platform: product?.platform || standard.platform,
    platform_product_id:
      product?.platform_product_id || standard.product_id || standard.id,
    product_id: standard.product_id || standard.id || product?.product_id,
    title: standard.title || product?.title || product?.name,
    name: standard.title || product?.title || product?.name,
    description: getDescriptionText(
      standard.description_text,
      standard.description,
      product?.description_text,
      product?.description,
      product?.body_html
    ),
    sku: standard.sku || product?.sku || null,
    price: priceValue,
    currency: priceCurrency,
    inventory_quantity: inventoryQuantity,
    stock: inventoryQuantity,
    status: standard.status || product?.status,
    orderable:
      typeof standard.orderable === 'boolean'
        ? standard.orderable
        : product?.orderable,
    image_url:
      standard.image_url ||
      standard.main_image_url ||
      product?.image_url ||
      product?.image,
    images: standard.images || product?.images || [],
    variants: (standard.variants || product?.variants || []).map((variant: any) => ({
      ...variant,
      id: variant?.variant_id || variant?.id,
      variant_id: variant?.variant_id || variant?.id,
      title: variant?.title || variant?.name || variant?.variant_id || variant?.id,
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
    })),
  };
}

function formatCurrencyValue(amount: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  } catch {
    return formatCurrency(amount);
  }
}

function formatReadinessCode(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function mergeCatalogProducts(existing: any[], incoming: any[]) {
  const merged = new Map<string, any>();

  for (const product of existing) {
    const key = [
      String(product?.platform || '').toLowerCase(),
      String(
        product?.platform_product_id ||
          product?.product_id ||
          product?.id ||
          ''
      ),
    ].join('|');
    merged.set(key, product);
  }

  for (const product of incoming) {
    const key = [
      String(product?.platform || '').toLowerCase(),
      String(
        product?.platform_product_id ||
          product?.product_id ||
          product?.id ||
          ''
      ),
    ].join('|');
    merged.set(key, product);
  }

  return Array.from(merged.values());
}

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
  agent_push_status: 'eligible_for_agent_push' | 'excluded_from_agent_push';
  agent_push_reason_codes: string[];
};

type ProductBlockerDetail = {
  plan_id: string;
  snapshot_id: string;
  summary: {
    ready_variant_count: number;
    blocked_variant_count: number;
    eligible_variant_count: number;
    excluded_variant_count: number;
  };
  variants: ProductBlockerVariant[];
};

type CatalogReviewPlan = {
  plan_id: string;
  snapshot_id?: string | null;
};

type SourceDataTriageRow = {
  scope: 'product' | 'variant';
  reason_code: SourceDataReasonCode;
  reason_label: string;
  platform: string;
  platform_product_id: string;
  product_id?: string | null;
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
  agent_push_status: 'eligible_for_agent_push' | 'excluded_from_agent_push';
  agent_push_reason_codes: string[];
  decision_state?:
    | 'restock_planned'
    | 'archive_planned'
    | 'manual_review'
    | 'pricing_fix_saved'
    | 'image_fix_saved'
    | null;
};

type SourceDataLaneGroup = {
  reason_code: SourceDataReasonCode;
  reason_label: string;
  platform: string;
  platform_product_id: string;
  product_id?: string | null;
  product_title: string;
  affected_rows: number;
  affected_variants: number;
  blocked_variant_count: number;
  excluded_variant_count: number;
  sample_variant_id: string | null;
  sample_skus: string[];
  decision_state?:
    | 'restock_planned'
    | 'archive_planned'
    | 'manual_review'
    | 'pricing_fix_saved'
    | 'image_fix_saved'
    | null;
};

type SourceDataLaneProgress = {
  group_key: string;
  pending_variant_count: number;
  resolved_variant_count: number;
  total_variant_count: number;
  looks_resolved_now: boolean;
  batch_state?: OutOfStockBatchState | null;
  missing_price_state?: MissingPriceBatchState | null;
};

type SourceDataReasonCode =
  | 'missing_price'
  | 'out_of_stock'
  | 'missing_primary_image';

function normalizeSourceDataReasonCode(value: string | null): SourceDataReasonCode | null {
  if (
    value === 'missing_price' ||
    value === 'out_of_stock' ||
    value === 'missing_primary_image'
  ) {
    return value;
  }
  return null;
}

function formatSourceDataReasonLabel(reasonCode: SourceDataReasonCode) {
  if (reasonCode === 'missing_price') return 'Missing price or currency';
  if (reasonCode === 'out_of_stock') return 'Out of stock';
  return 'Missing primary image';
}

function buildSourceDataLaneGroupKey(params: {
  reason_code: SourceDataReasonCode;
  platform: string;
  platform_product_id: string;
}) {
  return [
    params.reason_code,
    String(params.platform || '').toLowerCase(),
    String(params.platform_product_id || ''),
  ].join('|');
}

function getCatalogHealthFocusForReason(reasonCode: SourceDataReasonCode) {
  if (reasonCode === 'missing_price') return 'price_currency';
  if (reasonCode === 'out_of_stock') return 'inventory_availability';
  return 'catalog_content';
}

function getLanePendingLabel(reasonCode: SourceDataReasonCode) {
  if (reasonCode === 'missing_price') return 'Still missing price now';
  if (reasonCode === 'out_of_stock') return 'Still out of stock now';
  return 'Hero image still missing';
}

function getLaneResolvedLabel(reasonCode: SourceDataReasonCode) {
  if (reasonCode === 'missing_price') return 'Price visible now';
  if (reasonCode === 'out_of_stock') return 'Back in stock now';
  return 'Hero image visible now';
}

type OutOfStockBatchState =
  | 'whole_product_unavailable'
  | 'partially_recovered'
  | 'restocked_waiting_refresh'
  | 'no_matching_variants';

type MissingPriceBatchState =
  | 'whole_product_missing_price'
  | 'partially_priced'
  | 'priced_waiting_refresh'
  | 'no_matching_variants';

type MissingImageBatchState =
  | 'hero_image_missing'
  | 'image_visible_now';

type OutOfStockDecisionState =
  | 'restock_candidate'
  | 'archive_candidate'
  | 'manual_review';

type PersistedOutOfStockDecisionState =
  | 'restock_planned'
  | 'archive_planned'
  | 'manual_review';

type PersistedMissingPriceDecisionState = 'pricing_fix_saved';

type PersistedMissingImageDecisionState = 'image_fix_saved';

type PersistedSourceDataDecisionState =
  | PersistedOutOfStockDecisionState
  | PersistedMissingPriceDecisionState
  | PersistedMissingImageDecisionState;

type CatalogReviewQueueState =
  | OutOfStockDecisionState
  | MissingPriceBatchState
  | MissingImageBatchState;

function normalizeCatalogReviewQueueState(
  value: string | null
): CatalogReviewQueueState | null {
  if (
    value === 'restock_candidate' ||
    value === 'archive_candidate' ||
    value === 'manual_review' ||
    value === 'whole_product_missing_price' ||
    value === 'partially_priced' ||
    value === 'priced_waiting_refresh' ||
    value === 'hero_image_missing' ||
    value === 'image_visible_now'
  ) {
    return value;
  }
  return null;
}

function getOutOfStockBatchState(
  pendingCount: number,
  resolvedCount: number
): OutOfStockBatchState {
  if (pendingCount <= 0 && resolvedCount <= 0) {
    return 'no_matching_variants';
  }
  if (pendingCount > 0 && resolvedCount <= 0) {
    return 'whole_product_unavailable';
  }
  if (pendingCount > 0 && resolvedCount > 0) {
    return 'partially_recovered';
  }
  return 'restocked_waiting_refresh';
}

function getMissingPriceBatchState(
  pendingCount: number,
  resolvedCount: number
): MissingPriceBatchState {
  if (pendingCount <= 0 && resolvedCount <= 0) {
    return 'no_matching_variants';
  }
  if (pendingCount > 0 && resolvedCount <= 0) {
    return 'whole_product_missing_price';
  }
  if (pendingCount > 0 && resolvedCount > 0) {
    return 'partially_priced';
  }
  return 'priced_waiting_refresh';
}

function getMissingPriceBatchStateLabel(state: MissingPriceBatchState) {
  if (state === 'whole_product_missing_price') return 'Whole product still missing price';
  if (state === 'partially_priced') return 'Partially priced now';
  if (state === 'priced_waiting_refresh') return 'Price visible now';
  return 'No matching variants';
}

function getMissingPriceQueueActionLabel(state: MissingPriceBatchState) {
  if (state === 'partially_priced') {
    return 'Finish pricing the remaining SKUs, then refresh Catalog health after the price sync settles.';
  }
  if (state === 'priced_waiting_refresh') {
    return 'Refresh Catalog health after the latest price sync settles.';
  }
  if (state === 'whole_product_missing_price') {
    return 'Add valid price and currency data across the full product batch before retrying agent push.';
  }
  return 'Review the matching variants and confirm whether the product batch still needs price data.';
}

function getMissingPriceQueueButtonClass(state: MissingPriceBatchState) {
  if (state === 'whole_product_missing_price') {
    return 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100';
  }
  if (state === 'partially_priced') {
    return 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100';
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
}

function getMissingImageBatchStateLabel(state: MissingImageBatchState) {
  if (state === 'hero_image_missing') return 'Hero image still missing';
  return 'Primary image visible now';
}

function getMissingImageQueueActionLabel(state: MissingImageBatchState) {
  if (state === 'hero_image_missing') {
    return 'Add or sync the main product image in your source catalog, then refresh Catalog health once the image lands in Pivota.';
  }
  return 'Refresh Catalog health after the image sync settles to clear the stale blocker.';
}

function getMissingImageQueueButtonClass(state: MissingImageBatchState) {
  if (state === 'hero_image_missing') {
    return 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100';
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
}

function getOutOfStockBatchStateLabel(state: OutOfStockBatchState) {
  if (state === 'whole_product_unavailable') return 'Whole product still unavailable';
  if (state === 'partially_recovered') return 'Partially back in stock';
  if (state === 'restocked_waiting_refresh') return 'Back in stock now';
  return 'No matching variants';
}

function getOutOfStockPendingActionLabel(state: OutOfStockBatchState) {
  if (state === 'partially_recovered') return 'Finish restocking this SKU';
  return 'Restock or archive decision';
}

function getOutOfStockResolvedActionLabel(state: OutOfStockBatchState) {
  if (state === 'partially_recovered') return 'Already back in stock';
  return 'Refresh after sync settles';
}

function getOutOfStockQueueActionLabel(state: OutOfStockBatchState) {
  if (state === 'partially_recovered') {
    return 'Finish the remaining zero-stock SKUs, then archive the variants that should stay unavailable.';
  }
  if (state === 'restocked_waiting_refresh') {
    return 'Refresh Catalog health after the latest sync settles.';
  }
  if (state === 'whole_product_unavailable') {
    return 'Decide whether to restock the full product batch or archive it as intentionally unavailable.';
  }
  return 'Review the matching variants and confirm whether the batch still needs source-data fixes.';
}

function getOutOfStockDecisionState(product: any): OutOfStockDecisionState {
  const rawStatus = String(product?.status || '').trim().toLowerCase();
  const hasVisibleImage = Boolean(product?.image_url || product?.images?.[0]);
  const hasDescription = Boolean(
    getDescriptionText(product?.description_text, product?.description, product?.body_html)
  );
  const hasAnyPricedVariant = Array.isArray(product?.variants)
    ? product.variants.some((variant: any) => Number(variant?.price || 0) > 0)
    : Number(product?.price || 0) > 0;

  if (rawStatus && rawStatus !== 'active') {
    return 'archive_candidate';
  }

  if (product?.orderable === false) {
    return 'archive_candidate';
  }

  if (isProductSellable(product) && hasAnyPricedVariant && (hasVisibleImage || hasDescription)) {
    return 'restock_candidate';
  }

  return 'manual_review';
}

function normalizePersistedOutOfStockDecisionState(
  value: string | null | undefined
): PersistedOutOfStockDecisionState | null {
  if (
    value === 'restock_planned' ||
    value === 'archive_planned' ||
    value === 'manual_review'
  ) {
    return value;
  }
  return null;
}

function normalizePersistedMissingPriceDecisionState(
  value: string | null | undefined
): PersistedMissingPriceDecisionState | null {
  return value === 'pricing_fix_saved' ? value : null;
}

function normalizePersistedMissingImageDecisionState(
  value: string | null | undefined
): PersistedMissingImageDecisionState | null {
  return value === 'image_fix_saved' ? value : null;
}

function normalizePersistedSourceDataDecisionState(
  reasonCode: SourceDataReasonCode,
  value: string | null | undefined
): PersistedSourceDataDecisionState | null {
  if (reasonCode === 'out_of_stock') {
    return normalizePersistedOutOfStockDecisionState(value);
  }
  if (reasonCode === 'missing_price') {
    return normalizePersistedMissingPriceDecisionState(value);
  }
  return normalizePersistedMissingImageDecisionState(value);
}

function getOutOfStockDecisionStateFromPersisted(
  value: PersistedOutOfStockDecisionState | null
): OutOfStockDecisionState | null {
  if (value === 'restock_planned') return 'restock_candidate';
  if (value === 'archive_planned') return 'archive_candidate';
  if (value === 'manual_review') return 'manual_review';
  return null;
}

function getEffectiveOutOfStockDecisionState(
  product: any,
  persistedDecisionState: PersistedOutOfStockDecisionState | null
): OutOfStockDecisionState {
  return (
    getOutOfStockDecisionStateFromPersisted(persistedDecisionState) ||
    getOutOfStockDecisionState(product)
  );
}

function getPersistedOutOfStockDecisionLabel(
  value: PersistedOutOfStockDecisionState | null
) {
  if (value === 'restock_planned') return 'Restock planned';
  if (value === 'archive_planned') return 'Archive / discontinue planned';
  if (value === 'manual_review') return 'Marked for manual review';
  return 'No saved merchant decision yet';
}

function getPersistedMissingPriceDecisionLabel(
  value: PersistedMissingPriceDecisionState | null
) {
  if (value === 'pricing_fix_saved') return 'Saved for pricing fix';
  return 'No saved repair progress yet';
}

function getPersistedMissingImageDecisionLabel(
  value: PersistedMissingImageDecisionState | null
) {
  if (value === 'image_fix_saved') return 'Saved for image repair';
  return 'No saved repair progress yet';
}

function getOutOfStockDecisionTitle(state: OutOfStockDecisionState) {
  if (state === 'restock_candidate') return 'Restock candidates';
  if (state === 'archive_candidate') return 'Archive / discontinue candidates';
  return 'Needs manual review';
}

function getOutOfStockDecisionSummary(state: OutOfStockDecisionState, count: number) {
  if (state === 'restock_candidate') {
    return count > 0
      ? 'These products still look commercially active. Treat them as inventory gaps to replenish.'
      : 'No whole-product batches currently look like straightforward restock candidates.';
  }
  if (state === 'archive_candidate') {
    return count > 0
      ? 'These products look unpublished, unsellable, or intentionally inactive. Review them as archive / discontinue decisions.'
      : 'No whole-product batches currently look like clear archive or discontinue candidates.';
  }
  return count > 0
    ? 'These products need a manual merchant review before choosing between restock and archive.'
    : 'No whole-product batches currently need manual classification.';
}

function getOutOfStockDecisionActionLabel(state: OutOfStockDecisionState) {
  if (state === 'restock_candidate') {
    return 'Review as replenishment work and restore inventory for the whole product batch.';
  }
  if (state === 'archive_candidate') {
    return 'Review as archive / discontinue work and confirm the product should stay unavailable.';
  }
  return 'Review manually to decide whether this whole product batch should be replenished or retired.';
}

function getOutOfStockDecisionButtonClass(state: OutOfStockDecisionState) {
  if (state === 'restock_candidate') {
    return 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100';
  }
  if (state === 'archive_candidate') {
    return 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100';
}

function getOutOfStockDecisionCopyLabel(state: OutOfStockDecisionState) {
  if (state === 'archive_candidate') {
    return 'Copy product IDs';
  }
  return 'Copy sample SKUs';
}

function escapeCsvValue(value: unknown) {
  const normalized =
    value === null || value === undefined
      ? ''
      : Array.isArray(value)
        ? value.join('; ')
        : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function downloadCsvFile(filename: string, rows: Array<Record<string, unknown>>) {
  if (typeof window === 'undefined' || !rows.length) return false;

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.map((header) => escapeCsvValue(header)).join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(',')
    ),
  ];
  const blob = new Blob([csvLines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
  return true;
}

function getSourceDataRowAffectedVariantCount(row: SourceDataTriageRow) {
  if (row.scope === 'variant') return 1;
  return Math.max(row.blocked_variant_count, row.excluded_variant_count, 1);
}

function readinessVariantMatchesReason(
  variant: ProductBlockerVariant,
  reasonCode: SourceDataReasonCode
) {
  const blockerCodes = new Set(variant.readiness_blocker_codes || []);
  const pushCodes = new Set(variant.agent_push_reason_codes || []);

  if (reasonCode === 'missing_price') {
    return (
      blockerCodes.has('missing_price') ||
      blockerCodes.has('missing_currency') ||
      pushCodes.has('missing_price') ||
      pushCodes.has('missing_currency')
    );
  }

  if (reasonCode === 'out_of_stock') {
    return blockerCodes.has('out_of_stock') || pushCodes.has('out_of_stock');
  }

  return (
    blockerCodes.has('missing_primary_image') ||
    pushCodes.has('missing_primary_image')
  );
}

export default function ProductsPage() {
  const { t } = useMerchantLanguage();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sellableFilter, setSellableFilter] = useState<'all' | 'sellable' | 'not_sellable'>('all');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [reviewSource, setReviewSource] = useState<string | null>(null);
  const [reviewReasonCode, setReviewReasonCode] =
    useState<SourceDataReasonCode | null>(null);
  const [catalogReviewPlan, setCatalogReviewPlan] = useState<CatalogReviewPlan | null>(null);
  const [catalogReviewPlanError, setCatalogReviewPlanError] = useState<string | null>(null);
  const [productBlockerDetail, setProductBlockerDetail] = useState<ProductBlockerDetail | null>(
    null
  );
  const [productBlockerLoading, setProductBlockerLoading] = useState(false);
  const [productBlockerError, setProductBlockerError] = useState<string | null>(null);
  const [sourceDataLaneGroups, setSourceDataLaneGroups] = useState<SourceDataLaneGroup[]>([]);
  const [sourceDataLaneRows, setSourceDataLaneRows] = useState<SourceDataTriageRow[]>([]);
  const [sourceDataLaneLoading, setSourceDataLaneLoading] = useState(false);
  const [sourceDataLaneError, setSourceDataLaneError] = useState<string | null>(null);
  const [laneActionFeedback, setLaneActionFeedback] = useState<string | null>(null);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const deepLinkResolvedRef = useRef<string | null>(null);
  const deepLinkQueueResolvedRef = useRef<string | null>(null);
  const catalogReviewPlanRequestRef = useRef<Promise<CatalogReviewPlan | null> | null>(null);
  const catalogReviewPlanRefreshRef = useRef<Promise<CatalogReviewPlan | null> | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadProducts(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, []);

  const loadProducts = async (isCancelled?: () => boolean) => {
    const shouldCancel = () => isCancelled?.() === true;

    try {
      setLoading(true);
      setProducts([]);

      try {
        const pageSize = 100;
        const firstPage = await apiClient.getProductsV2({
          limit: pageSize,
          offset: 0,
        });

        if (shouldCancel()) return;

        let mergedProducts = Array.isArray(firstPage?.products)
          ? firstPage.products
          : [];
        const total =
          typeof firstPage?.total === 'number'
            ? firstPage.total
            : mergedProducts.length;

        setProducts(mergedProducts);
        setLoading(false);

        let offset = mergedProducts.length;

        while (!shouldCancel() && offset < total) {
          const nextPage = await apiClient.getProductsV2({
            limit: pageSize,
            offset,
          });

          if (shouldCancel()) return;

          const nextProducts = Array.isArray(nextPage?.products)
            ? nextPage.products
            : [];

          if (!nextProducts.length) {
            break;
          }

          mergedProducts = mergeCatalogProducts(mergedProducts, nextProducts);
          offset += nextProducts.length;
          setProducts(mergedProducts);
        }

        return;
      } catch (progressiveError) {
        console.warn(
          'Failed to progressively load catalog via /products/v2, falling back to full catalog fetch.',
          progressiveError
        );
      }

      const data = await apiClient.getProducts();
      if (shouldCancel()) return;
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      if (!shouldCancel()) {
        setLoading(false);
      }
    }
  };

  const resolveProductForReview = async (
    platform: string,
    platformProductId: string
  ) => {
    const matchedProduct = products.find((product) => {
      const normalizedPlatform =
        String(product?.platform || '').toLowerCase() === platform.toLowerCase();
      const normalizedProductId =
        String(
          product?.platform_product_id ||
            product?.product_id ||
            product?.id ||
            ''
        ) === platformProductId;
      return normalizedPlatform && normalizedProductId;
    });

    if (matchedProduct && Array.isArray(matchedProduct.variants)) {
      return normalizeProductForReview(matchedProduct);
    }

    const detail = await apiClient.getMerchantProductDetail(platform, platformProductId);
    return normalizeProductForReview(detail);
  };

  const deepLinkPlatform = searchParams.get('platform');
  const deepLinkPlatformProductId = searchParams.get('platformProductId');
  const deepLinkVariantId = searchParams.get('variantId');
  const deepLinkModal = searchParams.get('modal');
  const deepLinkSource = searchParams.get('source');
  const deepLinkPlanId = searchParams.get('planId');
  const deepLinkQueueState = normalizeCatalogReviewQueueState(
    searchParams.get('queueState')
  );
  const deepLinkReasonCode = normalizeSourceDataReasonCode(
    searchParams.get('reasonCode')
  );

  const replaceReadinessReviewUrl = ({
    platform,
    platformProductId,
    variantId,
    reasonCode,
    planId,
    queueState,
  }: {
    platform: string;
    platformProductId: string;
    variantId?: string | null;
    reasonCode?: SourceDataReasonCode | null;
    planId?: string | null;
    queueState?: CatalogReviewQueueState | null;
  }) => {
    if (typeof window === 'undefined') return;

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
    if (planId) {
      params.set('planId', planId);
    }
    if (queueState) {
      params.set('queueState', queueState);
    }
    window.history.replaceState({}, '', `/dashboard/products?${params.toString()}`);
  };

  useEffect(() => {
    if (loading) return;
    if (
      deepLinkModal !== 'review' ||
      !deepLinkPlatform ||
      !deepLinkPlatformProductId
    ) {
      return;
    }

    const deepLinkKey = [
      deepLinkPlatform,
      deepLinkPlatformProductId,
      deepLinkVariantId || '',
      deepLinkSource || '',
      deepLinkPlanId || '',
      deepLinkQueueState || '',
    ].join('|');
    if (deepLinkResolvedRef.current === deepLinkKey) {
      return;
    }

    let cancelled = false;

    const openDeepLinkedReview = async () => {
      let normalizedProduct = null;

      try {
        normalizedProduct = await resolveProductForReview(
          deepLinkPlatform,
          deepLinkPlatformProductId
        );
      } catch (error) {
        console.error('Failed to resolve deep-linked product review', error);
        return;
      }

      if (cancelled || !normalizedProduct) {
        return;
      }

      setSelectedProduct(normalizedProduct);
      setSelectedVariantId(deepLinkVariantId || null);
      setReviewSource(deepLinkSource || null);
      setReviewReasonCode(deepLinkReasonCode);
      setShowViewModal(true);
      deepLinkResolvedRef.current = deepLinkKey;
    };

    void openDeepLinkedReview();

    return () => {
      cancelled = true;
    };
  }, [
    deepLinkModal,
    deepLinkPlatform,
    deepLinkPlatformProductId,
    deepLinkReasonCode,
    deepLinkSource,
    deepLinkPlanId,
    deepLinkQueueState,
    deepLinkVariantId,
    loading,
    products,
  ]);

  useEffect(() => {
    if (!showViewModal || reviewSource !== 'readiness' || !selectedProduct) {
      return;
    }

    const platform = String(selectedProduct.platform || '').trim();
    const platformProductId = String(
      selectedProduct.platform_product_id ||
        selectedProduct.product_id ||
        selectedProduct.id ||
        ''
    ).trim();

    if (!platform || !platformProductId) {
      return;
    }

    replaceReadinessReviewUrl({
      platform,
      platformProductId,
      variantId: selectedVariantId,
      reasonCode: reviewReasonCode,
      planId: catalogReviewPlan?.plan_id || deepLinkPlanId,
      queueState: deepLinkQueueState,
    });
  }, [
    catalogReviewPlan?.plan_id,
    deepLinkPlanId,
    deepLinkQueueState,
    reviewReasonCode,
    reviewSource,
    selectedProduct,
    selectedVariantId,
    showViewModal,
  ]);

  useEffect(() => {
    if (!showViewModal || !selectedVariantId) return;

    const timeoutId = window.setTimeout(() => {
      const row = document.getElementById(`variant-row-${selectedVariantId}`);
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [selectedVariantId, showViewModal]);

  const loadCatalogReviewPlan = async (options?: {
    forceRefresh?: boolean;
    scope?: 'merchant' | 'product' | 'variant';
    reason?: string;
  }) => {
    const forceRefresh = options?.forceRefresh === true;

    if (!forceRefresh && catalogReviewPlan?.plan_id) {
      return catalogReviewPlan;
    }

    if (!forceRefresh && deepLinkPlanId) {
      const normalizedPlan: CatalogReviewPlan = {
        plan_id: deepLinkPlanId,
        snapshot_id: catalogReviewPlan?.snapshot_id ?? null,
      };
      setCatalogReviewPlan(normalizedPlan);
      setCatalogReviewPlanError(null);
      return normalizedPlan;
    }

    if (catalogReviewPlanRefreshRef.current) {
      return await catalogReviewPlanRefreshRef.current;
    }

    if (!forceRefresh && catalogReviewPlanRequestRef.current) {
      return await catalogReviewPlanRequestRef.current;
    }

    const request = (async () => {
      const optimization = forceRefresh
        ? await apiClient.refreshMerchantReadinessOptimization({
            scope: options?.scope ?? 'merchant',
            reason: options?.reason ?? 'catalog_review_retry',
            queue_mode: 'none',
          })
        : await apiClient.getMerchantReadinessOptimization({
            queue_mode: 'none',
          });
      const plan = optimization?.plan;
      if (!plan?.plan_id) {
        throw new Error('Optimization plan unavailable.');
      }

      const normalizedPlan: CatalogReviewPlan = {
        plan_id: plan.plan_id,
        snapshot_id: plan.snapshot_id ?? null,
      };
      setCatalogReviewPlan(normalizedPlan);
      setCatalogReviewPlanError(null);
      return normalizedPlan;
    })()
      .catch((error) => {
        setCatalogReviewPlan(null);
        setCatalogReviewPlanError('Could not load the latest catalog health plan yet.');
        throw error;
      })
      .finally(() => {
        if (forceRefresh) {
          if (catalogReviewPlanRefreshRef.current === request) {
            catalogReviewPlanRefreshRef.current = null;
          }
        } else if (catalogReviewPlanRequestRef.current === request) {
          catalogReviewPlanRequestRef.current = null;
        }
      });

    if (forceRefresh) {
      catalogReviewPlanRefreshRef.current = request;
    } else {
      catalogReviewPlanRequestRef.current = request;
    }
    return await request;
  };

  useEffect(() => {
    if (!showViewModal || reviewSource !== 'readiness') {
      setCatalogReviewPlan(null);
      setCatalogReviewPlanError(null);
      return;
    }

    let cancelled = false;

    const ensureCatalogReviewPlan = async () => {
      try {
        const plan = await loadCatalogReviewPlan();
        if (cancelled) return;
        setCatalogReviewPlan(plan);
      } catch (error) {
        console.error('Failed to load catalog review plan', error);
        if (cancelled) return;
      }
    };

    void ensureCatalogReviewPlan();

    return () => {
      cancelled = true;
    };
  }, [reviewSource, showViewModal]);

  useEffect(() => {
    if (!showViewModal || reviewSource !== 'readiness' || !reviewReasonCode) {
      setSourceDataLaneGroups([]);
      setSourceDataLaneRows([]);
      setSourceDataLaneError(null);
      setSourceDataLaneLoading(false);
      setLaneActionFeedback(null);
      return;
    }

    if (!catalogReviewPlan?.plan_id) {
      setSourceDataLaneGroups([]);
      setSourceDataLaneRows([]);
      setSourceDataLaneError(catalogReviewPlanError);
      setSourceDataLaneLoading(true);
      return;
    }

    let cancelled = false;

    const isPlanSupersededError = (err: any) =>
      err?.response?.status === 409 &&
      err?.response?.data?.detail?.code === 'OPTIMIZATION_PLAN_SUPERSEDED';
    const isRetryableCatalogReviewError = (err: any) => {
      if (err?.response?.status) return false;
      const code = String(err?.code || '');
      const message = String(err?.message || '').toLowerCase();
      return (
        code === 'ERR_NETWORK' ||
        message.includes('network error') ||
        message.includes('connection closed')
      );
    };
    const isUnsupportedCatalogReviewQueueError = (err: any) => {
      const status = err?.response?.status;
      return status === 404 || status === 405 || status === 501;
    };

    const loadLaneQueue = async (planId: string, remainingRetries = 2) => {
      try {
        setSourceDataLaneLoading(true);
        setSourceDataLaneError(null);
        const triage = await apiClient.getMerchantSourceDataTriage({
          plan_id: planId,
          reason_code: reviewReasonCode,
          limit: 500,
        });

        if (cancelled) return;

        const rows: SourceDataTriageRow[] = Array.isArray(triage?.rows) ? triage.rows : [];
        setSourceDataLaneRows(rows);
        const grouped = new Map<string, SourceDataLaneGroup>();

        for (const row of rows) {
          const key = `${row.reason_code}|${row.platform}|${row.platform_product_id}`;
          const normalizedDecisionState = normalizePersistedSourceDataDecisionState(
            row.reason_code,
            row.decision_state
          );
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
            if (normalizedDecisionState && !existing.decision_state) {
              existing.decision_state = normalizedDecisionState;
            }
            continue;
          }

          grouped.set(key, {
            reason_code: row.reason_code,
            reason_label: row.reason_label,
            platform: row.platform,
            platform_product_id: row.platform_product_id,
            product_id: row.product_id || null,
            product_title: row.product_title,
            affected_rows: 1,
            affected_variants: getSourceDataRowAffectedVariantCount(row),
            blocked_variant_count: row.blocked_variant_count,
            excluded_variant_count: row.excluded_variant_count,
            sample_variant_id: row.variant_id || null,
            sample_skus: row.sku ? [row.sku] : [],
            decision_state: normalizedDecisionState,
          });
        }

        setSourceDataLaneGroups(
          Array.from(grouped.values()).sort((a, b) => {
            const affectedDiff = b.affected_variants - a.affected_variants;
            if (affectedDiff !== 0) return affectedDiff;
            const excludedDiff = b.excluded_variant_count - a.excluded_variant_count;
            if (excludedDiff !== 0) return excludedDiff;
            return a.product_title.localeCompare(b.product_title);
          })
        );
      } catch (error) {
        if (
          remainingRetries > 0 &&
          (isPlanSupersededError(error) || isRetryableCatalogReviewError(error))
        ) {
          const refreshedPlan = await loadCatalogReviewPlan({
            forceRefresh: true,
            scope: 'merchant',
            reason: isPlanSupersededError(error)
              ? 'plan_superseded'
              : 'network_retry',
          });
          const nextPlanId = refreshedPlan?.plan_id || planId;
          if (cancelled || !nextPlanId) return;
          return await loadLaneQueue(nextPlanId, remainingRetries - 1);
        }
        if (isUnsupportedCatalogReviewQueueError(error)) {
          if (cancelled) return;
          setSourceDataLaneRows([]);
          setSourceDataLaneGroups([]);
          setSourceDataLaneError(
            'Detailed source-data lane queue is unavailable until the latest backend readiness routes are deployed.'
          );
          return;
        }
        console.error('Failed to load source-data lane queue', error);
        if (cancelled) return;
        setSourceDataLaneRows([]);
        setSourceDataLaneGroups([]);
        setSourceDataLaneError('Could not load the current source-data lane queue.');
      } finally {
        if (!cancelled) {
          setSourceDataLaneLoading(false);
        }
      }
    };

    void loadLaneQueue(catalogReviewPlan.plan_id);

    return () => {
      cancelled = true;
    };
  }, [
    catalogReviewPlan,
    catalogReviewPlanError,
    reviewReasonCode,
    reviewSource,
    showViewModal,
  ]);

  useEffect(() => {
    if (!showViewModal || !selectedProduct || reviewSource !== 'readiness') {
      setProductBlockerDetail(null);
      setProductBlockerError(null);
      setProductBlockerLoading(false);
      return;
    }

    if (!catalogReviewPlan?.plan_id) {
      setProductBlockerDetail(null);
      setProductBlockerError(catalogReviewPlanError);
      setProductBlockerLoading(true);
      return;
    }

    const platform = String(selectedProduct.platform || '').trim();
    const platformProductId = String(
      selectedProduct.platform_product_id ||
        selectedProduct.product_id ||
        selectedProduct.id ||
        ''
    ).trim();

    if (!platform || !platformProductId) {
      setProductBlockerDetail(null);
      setProductBlockerError('Readiness context is unavailable for this catalog item.');
      setProductBlockerLoading(false);
      return;
    }

    let cancelled = false;

    const isPlanSupersededError = (err: any) =>
      err?.response?.status === 409 &&
      err?.response?.data?.detail?.code === 'OPTIMIZATION_PLAN_SUPERSEDED';
    const isRetryableCatalogReviewError = (err: any) => {
      if (err?.response?.status) return false;
      const code = String(err?.code || '');
      const message = String(err?.message || '').toLowerCase();
      return (
        code === 'ERR_NETWORK' ||
        message.includes('network error') ||
        message.includes('connection closed')
      );
    };

    const loadReadinessContext = async (planId: string, remainingRetries = 2) => {
      try {
        setProductBlockerLoading(true);
        setProductBlockerError(null);
        setProductBlockerDetail(null);

        const detail = await apiClient.getMerchantProductBlockers(
          platform,
          platformProductId,
          planId
        );
        if (cancelled) return;
        setProductBlockerDetail(detail || null);
      } catch (error) {
        if (
          remainingRetries > 0 &&
          (isPlanSupersededError(error) || isRetryableCatalogReviewError(error))
        ) {
          const refreshedPlan = await loadCatalogReviewPlan({
            forceRefresh: true,
            scope: 'product',
            reason: isPlanSupersededError(error)
              ? 'plan_superseded'
              : 'network_retry',
          });
          const nextPlanId = refreshedPlan?.plan_id || planId;
          if (cancelled || !nextPlanId) return;
          return await loadReadinessContext(nextPlanId, remainingRetries - 1);
        }
        console.error('Failed to load readiness context for catalog review', error);
        if (cancelled) return;
        setProductBlockerDetail(null);
        setProductBlockerError('Could not load readiness context for this product yet.');
      } finally {
        if (!cancelled) {
          setProductBlockerLoading(false);
        }
      }
    };

    void loadReadinessContext(catalogReviewPlan.plan_id);

    return () => {
      cancelled = true;
    };
  }, [
    catalogReviewPlan,
    catalogReviewPlanError,
    reviewSource,
    selectedProduct,
    showViewModal,
  ]);

  const handleAddProduct = () => {
    alert(
      'Add catalog item is not wired yet. Use your connected sales channel to sync products into Pivota.'
    );
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      searchTerm === '' ||
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSellable =
      sellableFilter === 'all' ||
      (sellableFilter === 'sellable' ? isProductSellable(product) : !isProductSellable(product));

    return matchesSearch && matchesSellable;
  });

  const sellableCount = products.filter((product) => isProductSellable(product)).length;
  const blockedCount = products.filter((product) => !isProductSellable(product)).length;
  const contentGapCount = products.filter((product) => hasContentGap(product)).length;
  const liveInventoryCount = products.filter((product) => {
    const stock = Number(product?.inventory_quantity ?? product?.stock ?? 0);
    return Number.isFinite(stock) && stock > 0;
  }).length;
  const selectedReadinessVariant =
    selectedVariantId && productBlockerDetail
      ? productBlockerDetail.variants.find(
          (variant) => String(variant.variant_id) === String(selectedVariantId)
        ) || null
      : null;
  const readinessVariantMap = new Map(
    (productBlockerDetail?.variants || []).map((variant) => [String(variant.variant_id), variant])
  );
  const currentSelectedVariantMap = new Map(
    ((selectedProduct?.variants as any[]) || []).map((variant: any) => [
      String(variant.variant_id || variant.id || ''),
      variant,
    ])
  );
  const focusedReadinessVariants =
    reviewReasonCode && productBlockerDetail
      ? productBlockerDetail.variants.filter((variant) =>
          readinessVariantMatchesReason(variant, reviewReasonCode)
        )
      : [];
  const laneVariantStates =
    reviewReasonCode && reviewReasonCode !== 'missing_primary_image'
      ? focusedReadinessVariants.map((variant) => {
          const currentVariant = currentSelectedVariantMap.get(String(variant.variant_id));
          const currentPrice =
            typeof currentVariant?.price === 'number' ? currentVariant.price : 0;
          const currentCurrency = String(
            currentVariant?.currency || selectedProduct?.currency || ''
          ).trim();
          const currentInventory = Number(currentVariant?.inventory_quantity ?? 0);
          const looksResolvedNow =
            reviewReasonCode === 'missing_price'
              ? currentPrice > 0 && Boolean(currentCurrency)
              : currentInventory > 0;
          return {
            blockerVariant: variant,
            currentVariant,
            looksResolvedNow,
          };
        })
      : [];
  const pendingLaneVariants = laneVariantStates.filter(
    (item) => !item.looksResolvedNow
  );
  const resolvedLaneVariants = laneVariantStates.filter(
    (item) => item.looksResolvedNow
  );
  const outOfStockBatchState =
    reviewReasonCode === 'out_of_stock'
      ? getOutOfStockBatchState(
          pendingLaneVariants.length,
          resolvedLaneVariants.length
        )
      : null;
  const laneVariantStateMap = new Map(
    laneVariantStates.map((item) => [
      String(item.blockerVariant.variant_id),
      item,
    ])
  );
  const focusedReadinessVariantIds = new Set(
    focusedReadinessVariants.map((variant) => String(variant.variant_id))
  );
  const currentLaneGroupIndex =
    reviewReasonCode && selectedProduct
      ? sourceDataLaneGroups.findIndex(
          (group) =>
            group.reason_code === reviewReasonCode &&
            String(group.platform).toLowerCase() ===
              String(selectedProduct.platform || '').toLowerCase() &&
            String(group.platform_product_id) ===
              String(
                selectedProduct.platform_product_id ||
                  selectedProduct.product_id ||
                  selectedProduct.id ||
                  ''
              )
        )
      : -1;
  const currentLaneGroup =
    currentLaneGroupIndex >= 0 ? sourceDataLaneGroups[currentLaneGroupIndex] : null;
  const normalizedProductsByLaneKey = new Map(
    products.map((product) => {
      const normalizedProduct = normalizeProductForReview(product);
      return [
        buildSourceDataLaneGroupKey({
          reason_code: reviewReasonCode || 'missing_price',
          platform: normalizedProduct.platform || '',
          platform_product_id: String(
            normalizedProduct.platform_product_id ||
              normalizedProduct.product_id ||
              normalizedProduct.id ||
              ''
          ),
        }),
        normalizedProduct,
      ];
    })
  );
  const sourceDataLaneRowsByGroupKey = sourceDataLaneRows.reduce<
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
  const laneGroupProgressByKey = sourceDataLaneGroups.reduce<
    Map<string, SourceDataLaneProgress>
  >((acc, group) => {
    const groupKey = buildSourceDataLaneGroupKey(group);
    const currentProduct = normalizedProductsByLaneKey.get(groupKey);
    const matchingRows = sourceDataLaneRowsByGroupKey.get(groupKey) || [];

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
      const currentVariant = (currentProduct?.variants || []).find(
        (variant: any) => String(variant.variant_id || variant.id || '') === variantId
      );
      const currentPrice =
        typeof currentVariant?.price === 'number'
          ? currentVariant.price
          : typeof currentVariant?.price?.value === 'number'
            ? currentVariant.price.value
            : 0;
      const currentCurrency = String(
        currentVariant?.currency ||
          currentVariant?.price?.currency ||
          currentProduct?.currency ||
          ''
      ).trim();
      const currentInventory = Number(currentVariant?.inventory_quantity ?? 0);
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
  const laneGroupProgressList = sourceDataLaneGroups.map((group) => {
    const groupKey = buildSourceDataLaneGroupKey(group);
    return {
      group,
      progress:
        laneGroupProgressByKey.get(groupKey) || {
          group_key: groupKey,
          pending_variant_count: Math.max(group.affected_variants, 1),
          resolved_variant_count: 0,
          total_variant_count: Math.max(group.affected_variants, 1),
          looks_resolved_now: false,
          batch_state:
            group.reason_code === 'out_of_stock'
              ? getOutOfStockBatchState(Math.max(group.affected_variants, 1), 0)
              : null,
          missing_price_state:
            group.reason_code === 'missing_price'
              ? getMissingPriceBatchState(Math.max(group.affected_variants, 1), 0)
              : null,
        },
    };
  });
  const currentLaneProgress = currentLaneGroup
    ? laneGroupProgressByKey.get(buildSourceDataLaneGroupKey(currentLaneGroup)) || null
    : null;
  const currentOutOfStockDecisionState =
    reviewReasonCode === 'out_of_stock' &&
    currentLaneGroup &&
    currentLaneProgress?.batch_state === 'whole_product_unavailable'
      ? getEffectiveOutOfStockDecisionState(
          normalizedProductsByLaneKey.get(buildSourceDataLaneGroupKey(currentLaneGroup)),
          normalizePersistedOutOfStockDecisionState(currentLaneGroup.decision_state)
        )
      : null;
  const currentPersistedOutOfStockDecisionState =
    reviewReasonCode === 'out_of_stock' && currentLaneGroup
      ? normalizePersistedOutOfStockDecisionState(currentLaneGroup.decision_state)
      : null;
  const currentPersistedMissingPriceDecisionState =
    reviewReasonCode === 'missing_price' && currentLaneGroup
      ? normalizePersistedMissingPriceDecisionState(currentLaneGroup.decision_state)
      : null;
  const currentPersistedMissingImageDecisionState =
    reviewReasonCode === 'missing_primary_image' && currentLaneGroup
      ? normalizePersistedMissingImageDecisionState(currentLaneGroup.decision_state)
      : null;
  const unresolvedLaneGroups = laneGroupProgressList.filter(
    ({ progress }) => progress.pending_variant_count > 0
  );
  const resolvedLaneGroups = laneGroupProgressList.filter(
    ({ progress }) => progress.pending_variant_count === 0
  );
  const nextPendingLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(({ progress }) => progress.pending_variant_count > 0)?.group || null
      : unresolvedLaneGroups[0]?.group || null;
  const firstPendingLaneGroup = unresolvedLaneGroups[0]?.group || null;
  const missingPriceWholeMissingLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'missing_price' &&
      progress.missing_price_state === 'whole_product_missing_price'
  );
  const missingPricePartiallyPricedLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'missing_price' &&
      progress.missing_price_state === 'partially_priced'
  );
  const missingPricePricedWaitingRefreshLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'missing_price' &&
      progress.missing_price_state === 'priced_waiting_refresh'
  );
  const missingPriceSavedLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'missing_price' &&
      progress.pending_variant_count > 0 &&
      normalizePersistedMissingPriceDecisionState(group.decision_state) ===
        'pricing_fix_saved'
  );
  const missingPriceUnsavedLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'missing_price' &&
      progress.pending_variant_count > 0 &&
      !normalizePersistedMissingPriceDecisionState(group.decision_state)
  );
  const currentMissingPriceBatchState =
    reviewReasonCode === 'missing_price' ? currentLaneProgress?.missing_price_state || null : null;
  const nextWholeMissingPriceLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(
            ({ group, progress }) =>
              group.reason_code === 'missing_price' &&
              progress.missing_price_state === 'whole_product_missing_price'
          )?.group || null
      : missingPriceWholeMissingLaneGroups[0]?.group || null;
  const firstWholeMissingPriceLaneGroup =
    missingPriceWholeMissingLaneGroups[0]?.group || null;
  const nextPartiallyPricedLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(
            ({ group, progress }) =>
              group.reason_code === 'missing_price' &&
              progress.missing_price_state === 'partially_priced'
          )?.group || null
      : missingPricePartiallyPricedLaneGroups[0]?.group || null;
  const firstPartiallyPricedLaneGroup =
    missingPricePartiallyPricedLaneGroups[0]?.group || null;
  const nextPricedWaitingRefreshLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(
            ({ group, progress }) =>
              group.reason_code === 'missing_price' &&
              progress.missing_price_state === 'priced_waiting_refresh'
          )?.group || null
      : missingPricePricedWaitingRefreshLaneGroups[0]?.group || null;
  const firstPricedWaitingRefreshLaneGroup =
    missingPricePricedWaitingRefreshLaneGroups[0]?.group || null;
  const missingImageUnresolvedLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'missing_primary_image' &&
      progress.looks_resolved_now === false
  );
  const missingImageResolvedLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'missing_primary_image' &&
      progress.looks_resolved_now === true
  );
  const missingImageSavedLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'missing_primary_image' &&
      progress.looks_resolved_now === false &&
      normalizePersistedMissingImageDecisionState(group.decision_state) ===
        'image_fix_saved'
  );
  const missingImageUnsavedLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'missing_primary_image' &&
      progress.looks_resolved_now === false &&
      !normalizePersistedMissingImageDecisionState(group.decision_state)
  );
  const currentMissingImageBatchState =
    reviewReasonCode === 'missing_primary_image'
      ? currentLaneProgress?.looks_resolved_now
        ? ('image_visible_now' as MissingImageBatchState)
        : ('hero_image_missing' as MissingImageBatchState)
      : null;
  const nextMissingImageUnresolvedLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(
            ({ group, progress }) =>
              group.reason_code === 'missing_primary_image' &&
              progress.looks_resolved_now === false
          )?.group || null
      : missingImageUnresolvedLaneGroups[0]?.group || null;
  const firstMissingImageUnresolvedLaneGroup =
    missingImageUnresolvedLaneGroups[0]?.group || null;
  const nextMissingImageResolvedLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(
            ({ group, progress }) =>
              group.reason_code === 'missing_primary_image' &&
              progress.looks_resolved_now === true
          )?.group || null
      : missingImageResolvedLaneGroups[0]?.group || null;
  const firstMissingImageResolvedLaneGroup =
    missingImageResolvedLaneGroups[0]?.group || null;
  const outOfStockWholeUnavailableLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'out_of_stock' &&
      progress.batch_state === 'whole_product_unavailable'
  );
  const outOfStockPartiallyRecoveredLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'out_of_stock' &&
      progress.batch_state === 'partially_recovered'
  );
  const outOfStockRestockedLaneGroups = laneGroupProgressList.filter(
    ({ group, progress }) =>
      group.reason_code === 'out_of_stock' &&
      progress.batch_state === 'restocked_waiting_refresh'
  );
  const outOfStockWholeUnavailableDecisionQueue = outOfStockWholeUnavailableLaneGroups.map(
    ({ group, progress }) => {
      const groupKey = buildSourceDataLaneGroupKey(group);
      const currentProduct = normalizedProductsByLaneKey.get(groupKey);
      const persistedDecisionState = normalizePersistedOutOfStockDecisionState(
        group.decision_state
      );
      const decisionState = getEffectiveOutOfStockDecisionState(
        currentProduct,
        persistedDecisionState
      );
      return {
        group,
        progress,
        currentProduct,
        persistedDecisionState,
        decisionState,
      };
    }
  );
  const outOfStockRestockCandidateLaneGroups = outOfStockWholeUnavailableDecisionQueue.filter(
    (item) => item.decisionState === 'restock_candidate'
  );
  const outOfStockArchiveCandidateLaneGroups = outOfStockWholeUnavailableDecisionQueue.filter(
    (item) => item.decisionState === 'archive_candidate'
  );
  const outOfStockManualReviewLaneGroups = outOfStockWholeUnavailableDecisionQueue.filter(
    (item) => item.decisionState === 'manual_review'
  );
  const outOfStockPersistedRestockLaneGroups = outOfStockWholeUnavailableDecisionQueue.filter(
    (item) => item.persistedDecisionState === 'restock_planned'
  );
  const outOfStockPersistedArchiveLaneGroups = outOfStockWholeUnavailableDecisionQueue.filter(
    (item) => item.persistedDecisionState === 'archive_planned'
  );
  const outOfStockPersistedManualReviewLaneGroups = outOfStockWholeUnavailableDecisionQueue.filter(
    (item) => item.persistedDecisionState === 'manual_review'
  );
  const outOfStockUndecidedLaneGroups = outOfStockWholeUnavailableDecisionQueue.filter(
    (item) => !item.persistedDecisionState
  );
  const nextWholeUnavailableLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(({ progress }) => progress.batch_state === 'whole_product_unavailable')?.group ||
        null
      : outOfStockWholeUnavailableLaneGroups[0]?.group || null;
  const firstWholeUnavailableLaneGroup =
    outOfStockWholeUnavailableLaneGroups[0]?.group || null;
  const nextPartiallyRecoveredLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(({ progress }) => progress.batch_state === 'partially_recovered')?.group || null
      : outOfStockPartiallyRecoveredLaneGroups[0]?.group || null;
  const firstPartiallyRecoveredLaneGroup =
    outOfStockPartiallyRecoveredLaneGroups[0]?.group || null;
  const nextRestockedLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(({ progress }) => progress.batch_state === 'restocked_waiting_refresh')?.group ||
        null
      : outOfStockRestockedLaneGroups[0]?.group || null;
  const firstRestockedLaneGroup = outOfStockRestockedLaneGroups[0]?.group || null;
  const nextRestockCandidateLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(({ group, progress }) => {
            if (
              group.reason_code !== 'out_of_stock' ||
              progress.batch_state !== 'whole_product_unavailable'
            ) {
              return false;
            }
            const currentProduct = normalizedProductsByLaneKey.get(
              buildSourceDataLaneGroupKey(group)
            );
            return (
              getEffectiveOutOfStockDecisionState(
                currentProduct,
                normalizePersistedOutOfStockDecisionState(group.decision_state)
              ) === 'restock_candidate'
            );
          })?.group || null
      : outOfStockRestockCandidateLaneGroups[0]?.group || null;
  const firstRestockCandidateLaneGroup =
    outOfStockRestockCandidateLaneGroups[0]?.group || null;
  const nextArchiveCandidateLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(({ group, progress }) => {
            if (
              group.reason_code !== 'out_of_stock' ||
              progress.batch_state !== 'whole_product_unavailable'
            ) {
              return false;
            }
            const currentProduct = normalizedProductsByLaneKey.get(
              buildSourceDataLaneGroupKey(group)
            );
            return (
              getEffectiveOutOfStockDecisionState(
                currentProduct,
                normalizePersistedOutOfStockDecisionState(group.decision_state)
              ) === 'archive_candidate'
            );
          })?.group || null
      : outOfStockArchiveCandidateLaneGroups[0]?.group || null;
  const firstArchiveCandidateLaneGroup =
    outOfStockArchiveCandidateLaneGroups[0]?.group || null;
  const nextManualReviewLaneGroup =
    currentLaneGroupIndex >= 0
      ? laneGroupProgressList
          .slice(currentLaneGroupIndex + 1)
          .find(({ group, progress }) => {
            if (
              group.reason_code !== 'out_of_stock' ||
              progress.batch_state !== 'whole_product_unavailable'
            ) {
              return false;
            }
            const currentProduct = normalizedProductsByLaneKey.get(
              buildSourceDataLaneGroupKey(group)
            );
            return (
              getEffectiveOutOfStockDecisionState(
                currentProduct,
                normalizePersistedOutOfStockDecisionState(group.decision_state)
              ) === 'manual_review'
            );
          })?.group || null
      : outOfStockManualReviewLaneGroups[0]?.group || null;
  const firstManualReviewLaneGroup =
    outOfStockManualReviewLaneGroups[0]?.group || null;

  const matchesDeepLinkQueueState = (() => {
    if (!deepLinkQueueState || !reviewReasonCode) return true;

    if (reviewReasonCode === 'out_of_stock') {
      return currentOutOfStockDecisionState === deepLinkQueueState;
    }

    if (reviewReasonCode === 'missing_price') {
      return currentMissingPriceBatchState === deepLinkQueueState;
    }

    if (reviewReasonCode === 'missing_primary_image') {
      return currentMissingImageBatchState === deepLinkQueueState;
    }

    return true;
  })();

  const deepLinkQueueTargetGroup = (() => {
    if (!deepLinkQueueState || !reviewReasonCode) return null;

    if (reviewReasonCode === 'out_of_stock') {
      if (deepLinkQueueState === 'restock_candidate') {
        return firstRestockCandidateLaneGroup;
      }
      if (deepLinkQueueState === 'archive_candidate') {
        return firstArchiveCandidateLaneGroup;
      }
      if (deepLinkQueueState === 'manual_review') {
        return firstManualReviewLaneGroup;
      }
      return null;
    }

    if (reviewReasonCode === 'missing_price') {
      if (deepLinkQueueState === 'whole_product_missing_price') {
        return firstWholeMissingPriceLaneGroup;
      }
      if (deepLinkQueueState === 'partially_priced') {
        return firstPartiallyPricedLaneGroup;
      }
      if (deepLinkQueueState === 'priced_waiting_refresh') {
        return firstPricedWaitingRefreshLaneGroup;
      }
      return null;
    }

    if (reviewReasonCode === 'missing_primary_image') {
      if (deepLinkQueueState === 'hero_image_missing') {
        return firstMissingImageUnresolvedLaneGroup;
      }
      if (deepLinkQueueState === 'image_visible_now') {
        return firstMissingImageResolvedLaneGroup;
      }
      return null;
    }

    return null;
  })();

  const heroTitle =
    blockedCount > 0
      ? t('dashboard.products.hero.blocked', { count: blockedCount })
      : contentGapCount > 0
        ? t('dashboard.products.hero.content', { count: contentGapCount })
        : t('dashboard.products.hero.ready');

  const heroDescription =
    blockedCount > 0
      ? t('dashboard.products.hero.descriptionBlocked')
      : t('dashboard.products.hero.descriptionReady');
  const focusedExcludedCount = focusedReadinessVariants.filter(
    (variant) => variant.agent_push_status === 'excluded_from_agent_push'
  ).length;
  const productHasVisibleImage = Boolean(
    selectedProduct?.image_url || selectedProduct?.images?.[0]
  );
  const catalogHealthReturnHref = reviewReasonCode
    ? `/dashboard/product-optimization?source=readiness&focus=${getCatalogHealthFocusForReason(
        reviewReasonCode
      )}`
    : '/dashboard/product-optimization';
  const laneChecklist =
    reviewReasonCode === 'missing_price'
      ? {
          title: 'Fix pricing in your source catalog',
          helper:
            resolvedLaneVariants.length > 0
              ? `${resolvedLaneVariants.length} variants already show pricing in Pivota. Finish the remaining SKUs, then refresh Catalog health to clear stale exclusions.`
              : 'Every highlighted SKU still needs valid price and currency data before it can be pushed to agents.',
          metrics: [
            {
              label: 'Variants in this batch',
              value: focusedReadinessVariants.length,
            },
            {
              label: 'Still missing price now',
              value: pendingLaneVariants.length,
            },
            {
              label: 'Looks fixed in Pivota now',
              value: resolvedLaneVariants.length,
            },
          ],
          steps: [
            'Set a non-zero price and currency for each highlighted SKU in your store platform.',
            'Confirm the updated price syncs back into Pivota for the same variants listed below.',
            'Return to Catalog health and refresh once pricing has landed across the batch.',
          ],
        }
      : reviewReasonCode === 'out_of_stock'
        ? {
          title: 'Resolve stock availability in your source catalog',
          helper:
            outOfStockBatchState === 'partially_recovered'
              ? `${resolvedLaneVariants.length} variants are already back in stock, but ${pendingLaneVariants.length} still need a merchant decision. Finish the remaining SKUs or intentionally leave them unavailable.`
              : outOfStockBatchState === 'restocked_waiting_refresh'
                ? 'Every matching variant now shows live stock in Pivota. Refresh Catalog health once the latest sync has fully settled.'
                : 'The highlighted variants are still excluded because inventory is zero or stale in the current readiness plan.',
          metrics: [
            {
              label: 'Variants in this batch',
              value: focusedReadinessVariants.length,
            },
            {
              label:
                outOfStockBatchState === 'partially_recovered'
                  ? 'Still zero-stock now'
                  : 'Still unavailable now',
              value: pendingLaneVariants.length,
            },
            {
              label:
                outOfStockBatchState === 'partially_recovered'
                  ? 'Already back in stock'
                  : 'Looks back in stock now',
              value: resolvedLaneVariants.length,
            },
            {
              label: 'Batch state',
              value: getOutOfStockBatchStateLabel(
                outOfStockBatchState || 'no_matching_variants'
              ),
            },
          ],
          steps: [
              outOfStockBatchState === 'partially_recovered'
                ? 'Finish the remaining zero-stock SKUs first, then decide which variants should stay intentionally unavailable.'
                : outOfStockBatchState === 'restocked_waiting_refresh'
                  ? 'Wait for the latest stock sync to settle across the whole product, then refresh Catalog health.'
                  : 'Restock the highlighted SKUs or archive the ones that should stay unavailable.',
              outOfStockBatchState === 'restocked_waiting_refresh'
                ? 'Confirm the replenished variants still show live inventory greater than zero in the synced catalog.'
                : 'Verify the intended variants sync back with live inventory greater than zero.',
              'Return to Catalog health and refresh after availability has stabilized.',
            ],
          }
        : reviewReasonCode === 'missing_primary_image'
          ? {
              title: 'Restore the product hero image',
              helper: productHasVisibleImage
                ? 'A primary image is visible in Pivota now. If this was fixed recently, refresh Catalog health to clear stale exclusions.'
                : 'This is a product-level blocker. Add or sync a primary image for the whole product before retrying agent push.',
              metrics: [
                {
                  label: 'Excluded variants',
                  value: productBlockerDetail?.summary.excluded_variant_count || 0,
                },
                {
                  label: 'Blocked variants',
                  value: productBlockerDetail?.summary.blocked_variant_count || 0,
                },
                {
                  label: 'Primary image visible now',
                  value: productHasVisibleImage ? 'Yes' : 'No',
                },
              ],
              steps: [
                'Upload or sync a primary image for this product in your source catalog.',
                'Make sure the hero image is attached to the product record and not only to a hidden variant.',
                'Return to Catalog health and refresh after imagery sync completes.',
              ],
            }
          : null;
  const imageRecoveryState =
    reviewReasonCode === 'missing_primary_image'
      ? {
          looksResolvedNow: productHasVisibleImage,
          title: productHasVisibleImage
            ? getLaneResolvedLabel('missing_primary_image')
            : getLanePendingLabel('missing_primary_image'),
          helper: productHasVisibleImage
            ? 'A primary image is visible in the current synced catalog. Refresh Catalog health after the image sync settles to clear the stale blocker.'
            : 'No primary image is visible in the current synced catalog yet. Update the product-level hero image in your source catalog first.',
          metricLabel: 'Hero image visible now',
          metricValue: productHasVisibleImage ? 'Yes' : 'No',
        }
      : null;
  const outOfStockBatchGuidance =
    reviewReasonCode === 'out_of_stock'
      ? {
          state: outOfStockBatchState || 'no_matching_variants',
          title: getOutOfStockBatchStateLabel(
            outOfStockBatchState || 'no_matching_variants'
          ),
          helper:
            outOfStockBatchState === 'partially_recovered'
              ? 'Some variants in this product are already back in stock. Prioritize the remaining zero-stock SKUs below so you can clear the whole batch in one pass.'
              : outOfStockBatchState === 'restocked_waiting_refresh'
                ? 'No matching variants still look unavailable in the synced catalog. This batch mostly needs a readiness refresh, not more source edits.'
                : 'Every matching variant in this batch still looks unavailable. Decide whether this product should be restocked again or intentionally stay archived/unavailable.',
          actionTitle:
            outOfStockBatchState === 'partially_recovered'
              ? 'Merchant action now'
              : outOfStockBatchState === 'restocked_waiting_refresh'
                ? 'Merchant action now'
                : 'Merchant decision now',
          actions:
            outOfStockBatchState === 'partially_recovered'
              ? [
                  `Restock the remaining ${pendingLaneVariants.length} zero-stock SKU${
                    pendingLaneVariants.length === 1 ? '' : 's'
                  } if they should come back.`,
                  'If some sizes or variants are intentionally gone, leave them unavailable or archive them in your source catalog so the batch reflects reality.',
                ]
              : outOfStockBatchState === 'restocked_waiting_refresh'
                ? [
                    'Refresh Catalog health after the latest inventory sync settles.',
                    'Only go back into source data if stock drops to zero again.',
                  ]
              : [
                  'Decide whether this whole product batch should return to sale.',
                  'If yes, restock these SKUs. If not, archive or keep them unavailable so they stop looking like accidental stock gaps.',
                ],
        }
      : null;
  const outOfStockQueueSummary =
    reviewReasonCode === 'out_of_stock'
      ? [
          {
            state: 'whole_product_unavailable' as OutOfStockBatchState,
            title: 'Whole product unavailable',
            count: outOfStockWholeUnavailableLaneGroups.length,
            summary:
              outOfStockWholeUnavailableLaneGroups.length > 0
                ? 'These products still look fully unavailable and need a clear merchant restock-or-archive decision.'
                : 'No product batches currently look fully unavailable.',
            nextGroup: nextWholeUnavailableLaneGroup,
            firstGroup: firstWholeUnavailableLaneGroup,
            buttonClass:
              'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
          },
          {
            state: 'partially_recovered' as OutOfStockBatchState,
            title: 'Partially back in stock',
            count: outOfStockPartiallyRecoveredLaneGroups.length,
            summary:
              outOfStockPartiallyRecoveredLaneGroups.length > 0
                ? 'These products already have some live inventory again, but a smaller set of SKUs still needs cleanup.'
                : 'No product batches currently show a mixed recovered / unresolved stock state.',
            nextGroup: nextPartiallyRecoveredLaneGroup,
            firstGroup: firstPartiallyRecoveredLaneGroup,
            buttonClass:
              'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
          },
          {
            state: 'restocked_waiting_refresh' as OutOfStockBatchState,
            title: 'Back in stock now',
            count: outOfStockRestockedLaneGroups.length,
            summary:
              outOfStockRestockedLaneGroups.length > 0
                ? 'These products now look stocked again in Pivota and mostly need a readiness refresh.'
                : 'No product batches currently look fully restocked and waiting on refresh only.',
            nextGroup: nextRestockedLaneGroup,
            firstGroup: firstRestockedLaneGroup,
            buttonClass:
              'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
          },
        ]
      : [];
  const missingPriceQueueSummary =
    reviewReasonCode === 'missing_price'
      ? [
          {
            state: 'whole_product_missing_price' as MissingPriceBatchState,
            title: 'Whole product still missing price',
            count: missingPriceWholeMissingLaneGroups.length,
            summary:
              missingPriceWholeMissingLaneGroups.length > 0
                ? 'These products still have no visible price across the whole affected batch. Treat them as full pricing repair work.'
                : 'No product batches currently look fully unpriced.',
            nextGroup: nextWholeMissingPriceLaneGroup,
            firstGroup: firstWholeMissingPriceLaneGroup,
            buttonClass: getMissingPriceQueueButtonClass('whole_product_missing_price'),
            previewGroups: missingPriceWholeMissingLaneGroups.slice(0, 3),
          },
          {
            state: 'partially_priced' as MissingPriceBatchState,
            title: 'Partially priced now',
            count: missingPricePartiallyPricedLaneGroups.length,
            summary:
              missingPricePartiallyPricedLaneGroups.length > 0
                ? 'These products already have some priced variants again, but the remaining SKUs still need cleanup.'
                : 'No product batches currently show a mixed priced / missing-price state.',
            nextGroup: nextPartiallyPricedLaneGroup,
            firstGroup: firstPartiallyPricedLaneGroup,
            buttonClass: getMissingPriceQueueButtonClass('partially_priced'),
            previewGroups: missingPricePartiallyPricedLaneGroups.slice(0, 3),
          },
          {
            state: 'priced_waiting_refresh' as MissingPriceBatchState,
            title: 'Price visible now',
            count: missingPricePricedWaitingRefreshLaneGroups.length,
            summary:
              missingPricePricedWaitingRefreshLaneGroups.length > 0
                ? 'These products now look priced again in Pivota and mostly need a readiness refresh.'
                : 'No product batches currently look fully priced and waiting on refresh only.',
            nextGroup: nextPricedWaitingRefreshLaneGroup,
            firstGroup: firstPricedWaitingRefreshLaneGroup,
            buttonClass: getMissingPriceQueueButtonClass('priced_waiting_refresh'),
            previewGroups: missingPricePricedWaitingRefreshLaneGroups.slice(0, 3),
          },
        ]
      : [];
  const missingImageQueueSummary =
    reviewReasonCode === 'missing_primary_image'
      ? [
          {
            state: 'hero_image_missing' as MissingImageBatchState,
            title: getMissingImageBatchStateLabel('hero_image_missing'),
            count: missingImageUnresolvedLaneGroups.length,
            summary:
              missingImageUnresolvedLaneGroups.length > 0
                ? 'These products still have no visible primary image in Pivota. Treat them as product-level image repair work.'
                : 'No product batches currently look like they are still missing a hero image.',
            nextGroup: nextMissingImageUnresolvedLaneGroup,
            firstGroup: firstMissingImageUnresolvedLaneGroup,
            buttonClass: getMissingImageQueueButtonClass('hero_image_missing'),
            previewGroups: missingImageUnresolvedLaneGroups.slice(0, 3),
          },
          {
            state: 'image_visible_now' as MissingImageBatchState,
            title: getMissingImageBatchStateLabel('image_visible_now'),
            count: missingImageResolvedLaneGroups.length,
            summary:
              missingImageResolvedLaneGroups.length > 0
                ? 'These products now show a primary image in Pivota and mostly need a readiness refresh.'
                : 'No product batches currently look fully resolved and waiting on refresh only.',
            nextGroup: nextMissingImageResolvedLaneGroup,
            firstGroup: firstMissingImageResolvedLaneGroup,
            buttonClass: getMissingImageQueueButtonClass('image_visible_now'),
            previewGroups: missingImageResolvedLaneGroups.slice(0, 3),
          },
        ]
      : [];
  const outOfStockDecisionSummary =
    reviewReasonCode === 'out_of_stock'
      ? [
          {
            state: 'restock_candidate' as OutOfStockDecisionState,
            title: getOutOfStockDecisionTitle('restock_candidate'),
            count: outOfStockRestockCandidateLaneGroups.length,
            summary: getOutOfStockDecisionSummary(
              'restock_candidate',
              outOfStockRestockCandidateLaneGroups.length
            ),
            nextGroup: nextRestockCandidateLaneGroup,
            firstGroup: firstRestockCandidateLaneGroup,
            buttonClass: getOutOfStockDecisionButtonClass('restock_candidate'),
            copyLabel: getOutOfStockDecisionCopyLabel('restock_candidate'),
            previewGroups: outOfStockRestockCandidateLaneGroups.slice(0, 3),
          },
          {
            state: 'archive_candidate' as OutOfStockDecisionState,
            title: getOutOfStockDecisionTitle('archive_candidate'),
            count: outOfStockArchiveCandidateLaneGroups.length,
            summary: getOutOfStockDecisionSummary(
              'archive_candidate',
              outOfStockArchiveCandidateLaneGroups.length
            ),
            nextGroup: nextArchiveCandidateLaneGroup,
            firstGroup: firstArchiveCandidateLaneGroup,
            buttonClass: getOutOfStockDecisionButtonClass('archive_candidate'),
            copyLabel: getOutOfStockDecisionCopyLabel('archive_candidate'),
            previewGroups: outOfStockArchiveCandidateLaneGroups.slice(0, 3),
          },
          {
            state: 'manual_review' as OutOfStockDecisionState,
            title: getOutOfStockDecisionTitle('manual_review'),
            count: outOfStockManualReviewLaneGroups.length,
            summary: getOutOfStockDecisionSummary(
              'manual_review',
              outOfStockManualReviewLaneGroups.length
            ),
            nextGroup: nextManualReviewLaneGroup,
            firstGroup: firstManualReviewLaneGroup,
            buttonClass: getOutOfStockDecisionButtonClass('manual_review'),
            copyLabel: getOutOfStockDecisionCopyLabel('manual_review'),
            previewGroups: outOfStockManualReviewLaneGroups.slice(0, 3),
          },
        ]
      : [];
  const outOfStockSavedDecisionCount =
    outOfStockPersistedRestockLaneGroups.length +
    outOfStockPersistedArchiveLaneGroups.length +
    outOfStockPersistedManualReviewLaneGroups.length;

  const applySourceDataDecisionStateToLocalQueue = (
    reasonCode: SourceDataReasonCode,
    platform: string,
    platformProductId: string,
    decisionState: PersistedSourceDataDecisionState | null
  ) => {
    setSourceDataLaneRows((prev) =>
      prev.map((row) =>
        row.reason_code === reasonCode &&
        row.platform === platform &&
        row.platform_product_id === platformProductId
          ? { ...row, decision_state: decisionState }
          : row
      )
    );
    setSourceDataLaneGroups((prev) =>
      prev.map((group) =>
        group.reason_code === reasonCode &&
        group.platform === platform &&
        group.platform_product_id === platformProductId
          ? { ...group, decision_state: decisionState }
          : group
      )
    );
  };

  const getNextOutOfStockUndecidedLaneGroup = () => {
    if (!currentLaneGroup) {
      return outOfStockUndecidedLaneGroups[0]?.group || null;
    }

    const isSameGroup = (group: SourceDataLaneGroup) =>
      group.reason_code === 'out_of_stock' &&
      group.platform === currentLaneGroup.platform &&
      group.platform_product_id === currentLaneGroup.platform_product_id;

    const afterCurrent =
      currentLaneGroupIndex >= 0
        ? laneGroupProgressList
            .slice(currentLaneGroupIndex + 1)
            .find(
              ({ group, progress }) =>
                group.reason_code === 'out_of_stock' &&
                progress.batch_state === 'whole_product_unavailable' &&
                !normalizePersistedOutOfStockDecisionState(group.decision_state)
            )?.group || null
        : null;

    if (afterCurrent) {
      return afterCurrent;
    }

    return (
      outOfStockUndecidedLaneGroups.find(({ group }) => !isSameGroup(group))?.group ||
      null
    );
  };

  const handleSetOutOfStockDecision = async (
    decisionState: PersistedOutOfStockDecisionState | null
  ) => {
    if (
      reviewReasonCode !== 'out_of_stock' ||
      !currentLaneGroup ||
      currentLaneProgress?.batch_state !== 'whole_product_unavailable'
    ) {
      setLaneActionFeedback(
        'Open a whole-product out-of-stock batch before saving a merchant decision.'
      );
      return false;
    }

    const platform = currentLaneGroup.platform;
    const platformProductId = currentLaneGroup.platform_product_id;

    try {
      setDecisionSaving(true);
      if (decisionState) {
        await apiClient.putMerchantSourceDataDecision({
          reason_code: 'out_of_stock',
          platform,
          platform_product_id: platformProductId,
          decision_state: decisionState,
        });
      } else {
        await apiClient.deleteMerchantSourceDataDecision({
          reason_code: 'out_of_stock',
          platform,
          platform_product_id: platformProductId,
        });
      }

      applySourceDataDecisionStateToLocalQueue(
        'out_of_stock',
        platform,
        platformProductId,
        decisionState
      );
      setLaneActionFeedback(
        decisionState
          ? `Saved merchant decision: ${getPersistedOutOfStockDecisionLabel(
              decisionState
            ).toLowerCase()}.`
          : 'Cleared the saved merchant decision for this batch.'
      );
      return true;
    } catch (error) {
      console.error('Failed to save out-of-stock merchant decision', error);
      setLaneActionFeedback(
        decisionState
          ? 'Could not save this merchant decision right now.'
          : 'Could not clear this merchant decision right now.'
      );
      return false;
    } finally {
      setDecisionSaving(false);
    }
  };

  const handleSetOutOfStockDecisionAndAdvance = async (
    decisionState: PersistedOutOfStockDecisionState
  ) => {
    const nextUndecidedGroup = getNextOutOfStockUndecidedLaneGroup();
    const saved = await handleSetOutOfStockDecision(decisionState);
    if (!saved) {
      return;
    }

    if (nextUndecidedGroup) {
      await openLaneGroup(nextUndecidedGroup);
      setLaneActionFeedback(
        `Saved merchant decision: ${getPersistedOutOfStockDecisionLabel(
          decisionState
        ).toLowerCase()}. Opened the next undecided batch.`
      );
      return;
    }

    setLaneActionFeedback(
      `Saved merchant decision: ${getPersistedOutOfStockDecisionLabel(
        decisionState
      ).toLowerCase()}. No undecided whole-product batches are left in this lane.`
    );
  };

  const getNextUnsavedSourceDataLaneGroup = (reasonCode: SourceDataReasonCode) => {
    if (!currentLaneGroup) {
      if (reasonCode === 'missing_price') {
        return missingPriceUnsavedLaneGroups[0]?.group || null;
      }
      if (reasonCode === 'missing_primary_image') {
        return missingImageUnsavedLaneGroups[0]?.group || null;
      }
      return null;
    }

    const sameGroup = (group: SourceDataLaneGroup) =>
      group.reason_code === reasonCode &&
      group.platform === currentLaneGroup.platform &&
      group.platform_product_id === currentLaneGroup.platform_product_id;

    const afterCurrent =
      currentLaneGroupIndex >= 0
        ? laneGroupProgressList
            .slice(currentLaneGroupIndex + 1)
            .find(({ group, progress }) => {
              if (group.reason_code !== reasonCode) return false;
              if (
                reasonCode === 'missing_primary_image' &&
                progress.looks_resolved_now
              ) {
                return false;
              }
              if (
                reasonCode === 'missing_price' &&
                progress.pending_variant_count <= 0
              ) {
                return false;
              }
              return !normalizePersistedSourceDataDecisionState(
                reasonCode,
                group.decision_state
              );
            })?.group || null
        : null;

    if (afterCurrent) {
      return afterCurrent;
    }

    const fallbackGroups =
      reasonCode === 'missing_price'
        ? missingPriceUnsavedLaneGroups
        : missingImageUnsavedLaneGroups;
    return fallbackGroups.find(({ group }) => !sameGroup(group))?.group || null;
  };

  const handleSetMissingPriceDecision = async (
    decisionState: PersistedMissingPriceDecisionState | null
  ) => {
    if (
      reviewReasonCode !== 'missing_price' ||
      !currentLaneGroup ||
      !currentLaneProgress ||
      currentLaneProgress.pending_variant_count <= 0
    ) {
      setLaneActionFeedback(
        'Open a missing-price batch with unresolved variants before saving repair progress.'
      );
      return false;
    }

    const platform = currentLaneGroup.platform;
    const platformProductId = currentLaneGroup.platform_product_id;

    try {
      setDecisionSaving(true);
      if (decisionState) {
        await apiClient.putMerchantSourceDataDecision({
          reason_code: 'missing_price',
          platform,
          platform_product_id: platformProductId,
          decision_state: decisionState,
        });
      } else {
        await apiClient.deleteMerchantSourceDataDecision({
          reason_code: 'missing_price',
          platform,
          platform_product_id: platformProductId,
        });
      }

      applySourceDataDecisionStateToLocalQueue(
        'missing_price',
        platform,
        platformProductId,
        decisionState
      );
      setLaneActionFeedback(
        decisionState
          ? 'Saved this batch for pricing fix.'
          : 'Cleared the saved pricing-fix progress for this batch.'
      );
      return true;
    } catch (error) {
      console.error('Failed to save missing-price repair progress', error);
      setLaneActionFeedback(
        decisionState
          ? 'Could not save this pricing-fix progress right now.'
          : 'Could not clear this pricing-fix progress right now.'
      );
      return false;
    } finally {
      setDecisionSaving(false);
    }
  };

  const handleSetMissingPriceDecisionAndAdvance = async () => {
    const nextUnsavedGroup = getNextUnsavedSourceDataLaneGroup('missing_price');
    const saved = await handleSetMissingPriceDecision('pricing_fix_saved');
    if (!saved) return;

    if (nextUnsavedGroup) {
      await openLaneGroup(nextUnsavedGroup);
      setLaneActionFeedback(
        'Saved this batch for pricing fix. Opened the next unsaved pricing batch.'
      );
      return;
    }

    setLaneActionFeedback(
      'Saved this batch for pricing fix. No unsaved missing-price batches are left in this lane.'
    );
  };

  const handleSetMissingImageDecision = async (
    decisionState: PersistedMissingImageDecisionState | null
  ) => {
    if (
      reviewReasonCode !== 'missing_primary_image' ||
      !currentLaneGroup ||
      !currentLaneProgress ||
      currentLaneProgress.looks_resolved_now
    ) {
      setLaneActionFeedback(
        'Open a missing-image batch that still needs repair before saving progress.'
      );
      return false;
    }

    const platform = currentLaneGroup.platform;
    const platformProductId = currentLaneGroup.platform_product_id;

    try {
      setDecisionSaving(true);
      if (decisionState) {
        await apiClient.putMerchantSourceDataDecision({
          reason_code: 'missing_primary_image',
          platform,
          platform_product_id: platformProductId,
          decision_state: decisionState,
        });
      } else {
        await apiClient.deleteMerchantSourceDataDecision({
          reason_code: 'missing_primary_image',
          platform,
          platform_product_id: platformProductId,
        });
      }

      applySourceDataDecisionStateToLocalQueue(
        'missing_primary_image',
        platform,
        platformProductId,
        decisionState
      );
      setLaneActionFeedback(
        decisionState
          ? 'Saved this batch for image repair.'
          : 'Cleared the saved image-repair progress for this batch.'
      );
      return true;
    } catch (error) {
      console.error('Failed to save missing-image repair progress', error);
      setLaneActionFeedback(
        decisionState
          ? 'Could not save this image-repair progress right now.'
          : 'Could not clear this image-repair progress right now.'
      );
      return false;
    } finally {
      setDecisionSaving(false);
    }
  };

  const handleSetMissingImageDecisionAndAdvance = async () => {
    const nextUnsavedGroup = getNextUnsavedSourceDataLaneGroup(
      'missing_primary_image'
    );
    const saved = await handleSetMissingImageDecision('image_fix_saved');
    if (!saved) return;

    if (nextUnsavedGroup) {
      await openLaneGroup(nextUnsavedGroup);
      setLaneActionFeedback(
        'Saved this batch for image repair. Opened the next unsaved image batch.'
      );
      return;
    }

    setLaneActionFeedback(
      'Saved this batch for image repair. No unsaved missing-image batches are left in this lane.'
    );
  };

  const handleDownloadOutOfStockQueueCsv = (state: OutOfStockBatchState) => {
    if (reviewReasonCode !== 'out_of_stock') {
      setLaneActionFeedback('Open an out-of-stock review batch before exporting this queue.');
      return;
    }

    const matchingQueue = laneGroupProgressList.filter(
      ({ group, progress }) =>
        group.reason_code === 'out_of_stock' && progress.batch_state === state
    );

    if (!matchingQueue.length) {
      setLaneActionFeedback(`No ${getOutOfStockBatchStateLabel(state).toLowerCase()} batches are available right now.`);
      return;
    }

    const rows = matchingQueue.map(({ group, progress }, index) => ({
      queue_state: getOutOfStockBatchStateLabel(state),
      queue_position: index + 1,
      product_title: group.product_title,
      platform: group.platform,
      platform_product_id: group.platform_product_id,
      affected_variants: group.affected_variants,
      pending_variants_now: progress.pending_variant_count,
      resolved_variants_now: progress.resolved_variant_count,
      blocked_variants: group.blocked_variant_count,
      excluded_variants: group.excluded_variant_count,
      sample_skus: group.sample_skus,
      merchant_action: getOutOfStockQueueActionLabel(state),
    }));

    const filename = [
      'catalog-review',
      'out-of-stock',
      state,
      'products',
    ].join('-') + '.csv';

    const downloaded = downloadCsvFile(filename, rows);
    setLaneActionFeedback(
      downloaded
        ? `Downloaded ${rows.length} ${getOutOfStockBatchStateLabel(state).toLowerCase()} product batch${
            rows.length === 1 ? '' : 'es'
          }.`
        : 'Could not export this out-of-stock queue right now.'
    );
  };

  const handleDownloadMissingPriceQueueCsv = (state: MissingPriceBatchState) => {
    if (reviewReasonCode !== 'missing_price') {
      setLaneActionFeedback('Open a missing-price review batch before exporting this queue.');
      return;
    }

    const matchingQueue = laneGroupProgressList.filter(
      ({ group, progress }) =>
        group.reason_code === 'missing_price' &&
        progress.missing_price_state === state
    );

    if (!matchingQueue.length) {
      setLaneActionFeedback(
        `No ${getMissingPriceBatchStateLabel(state).toLowerCase()} batches are available right now.`
      );
      return;
    }

    const rows = matchingQueue.map(({ group, progress }, index) => ({
      queue_state: getMissingPriceBatchStateLabel(state),
      queue_position: index + 1,
      product_title: group.product_title,
      platform: group.platform,
      platform_product_id: group.platform_product_id,
      affected_variants: group.affected_variants,
      pending_variants_now: progress.pending_variant_count,
      resolved_variants_now: progress.resolved_variant_count,
      blocked_variants: group.blocked_variant_count,
      excluded_variants: group.excluded_variant_count,
      sample_skus: group.sample_skus,
      merchant_action: getMissingPriceQueueActionLabel(state),
    }));

    const filename = [
      'catalog-review',
      'missing-price',
      state,
      'products',
    ].join('-') + '.csv';

    const downloaded = downloadCsvFile(filename, rows);
    setLaneActionFeedback(
      downloaded
        ? `Downloaded ${rows.length} ${getMissingPriceBatchStateLabel(state).toLowerCase()} product batch${
            rows.length === 1 ? '' : 'es'
          }.`
        : 'Could not export this pricing queue right now.'
    );
  };

  const handleDownloadMissingImageQueueCsv = (state: MissingImageBatchState) => {
    if (reviewReasonCode !== 'missing_primary_image') {
      setLaneActionFeedback('Open a missing-image review batch before exporting this queue.');
      return;
    }

    const matchingQueue = laneGroupProgressList.filter(
      ({ group, progress }) =>
        group.reason_code === 'missing_primary_image' &&
        (state === 'image_visible_now'
          ? progress.looks_resolved_now === true
          : progress.looks_resolved_now === false)
    );

    if (!matchingQueue.length) {
      setLaneActionFeedback(
        `No ${getMissingImageBatchStateLabel(state).toLowerCase()} batches are available right now.`
      );
      return;
    }

    const rows = matchingQueue.map(({ group, progress }, index) => ({
      queue_state: getMissingImageBatchStateLabel(state),
      queue_position: index + 1,
      product_title: group.product_title,
      platform: group.platform,
      platform_product_id: group.platform_product_id,
      affected_variants: group.affected_variants,
      blocked_variants: group.blocked_variant_count,
      excluded_variants: group.excluded_variant_count,
      hero_image_visible_now: progress.looks_resolved_now,
      merchant_action: getMissingImageQueueActionLabel(state),
    }));

    const filename = [
      'catalog-review',
      'missing-primary-image',
      state,
      'products',
    ].join('-') + '.csv';

    const downloaded = downloadCsvFile(filename, rows);
    setLaneActionFeedback(
      downloaded
        ? `Downloaded ${rows.length} ${getMissingImageBatchStateLabel(state).toLowerCase()} product batch${
            rows.length === 1 ? '' : 'es'
          }.`
        : 'Could not export this image queue right now.'
    );
  };

  const handleCopyMissingImageQueueProductIds = async (
    state: MissingImageBatchState
  ) => {
    if (reviewReasonCode !== 'missing_primary_image') {
      setLaneActionFeedback('Open a missing-image review batch before copying this queue.');
      return;
    }

    const matchingQueue = laneGroupProgressList.filter(
      ({ group, progress }) =>
        group.reason_code === 'missing_primary_image' &&
        (state === 'image_visible_now'
          ? progress.looks_resolved_now === true
          : progress.looks_resolved_now === false)
    );

    if (!matchingQueue.length) {
      setLaneActionFeedback(
        `No ${getMissingImageBatchStateLabel(state).toLowerCase()} batches are available right now.`
      );
      return;
    }

    const values = Array.from(
      new Set(
        matchingQueue
          .map(({ group }) => String(group.platform_product_id || '').trim())
          .filter(Boolean)
      )
    );

    if (!values.length) {
      setLaneActionFeedback('No product IDs are available to copy for this image queue yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(values.join('\n'));
      setLaneActionFeedback(
        `Copied ${values.length} product IDs from ${getMissingImageBatchStateLabel(state).toLowerCase()}.`
      );
    } catch {
      setLaneActionFeedback('Could not copy this image queue right now.');
    }
  };

  const handleCopyMissingPriceQueueValues = async (state: MissingPriceBatchState) => {
    if (reviewReasonCode !== 'missing_price') {
      setLaneActionFeedback('Open a missing-price review batch before copying this queue.');
      return;
    }

    const matchingQueue = laneGroupProgressList.filter(
      ({ group, progress }) =>
        group.reason_code === 'missing_price' &&
        progress.missing_price_state === state
    );

    if (!matchingQueue.length) {
      setLaneActionFeedback(
        `No ${getMissingPriceBatchStateLabel(state).toLowerCase()} batches are available right now.`
      );
      return;
    }

    const values = Array.from(
      new Set(
        matchingQueue.flatMap(({ group }) =>
          (group.sample_skus || []).map((sku) => String(sku || '').trim()).filter(Boolean)
        )
      )
    );

    if (!values.length) {
      setLaneActionFeedback('No sample SKUs are available to copy for this pricing queue yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(values.join('\n'));
      setLaneActionFeedback(
        `Copied ${values.length} sample SKUs from ${getMissingPriceBatchStateLabel(state).toLowerCase()}.`
      );
    } catch {
      setLaneActionFeedback('Could not copy this pricing queue right now.');
    }
  };

  const handleDownloadOutOfStockDecisionQueueCsv = (state: OutOfStockDecisionState) => {
    if (reviewReasonCode !== 'out_of_stock') {
      setLaneActionFeedback('Open an out-of-stock review batch before exporting this decision queue.');
      return;
    }

    const matchingQueue = outOfStockWholeUnavailableDecisionQueue.filter(
      (item) => item.decisionState === state
    );

    if (!matchingQueue.length) {
      setLaneActionFeedback(
        `No ${getOutOfStockDecisionTitle(state).toLowerCase()} are available right now.`
      );
      return;
    }

    const rows = matchingQueue.map(
      ({ group, progress, currentProduct, persistedDecisionState }, index) => ({
      decision_state: getOutOfStockDecisionTitle(state),
      saved_decision_state: persistedDecisionState
        ? getPersistedOutOfStockDecisionLabel(persistedDecisionState)
        : '',
      queue_position: index + 1,
      product_title: group.product_title,
      platform: group.platform,
      platform_product_id: group.platform_product_id,
      status: currentProduct?.status || '',
      orderable:
        typeof currentProduct?.orderable === 'boolean' ? currentProduct.orderable : '',
      affected_variants: group.affected_variants,
      pending_variants_now: progress.pending_variant_count,
      resolved_variants_now: progress.resolved_variant_count,
      blocked_variants: group.blocked_variant_count,
      excluded_variants: group.excluded_variant_count,
      sample_skus: group.sample_skus,
      merchant_action: getOutOfStockDecisionActionLabel(state),
      })
    );

    const filename = [
      'catalog-review',
      'out-of-stock',
      state,
      'decision-queue',
    ].join('-') + '.csv';

    const downloaded = downloadCsvFile(filename, rows);
    setLaneActionFeedback(
      downloaded
        ? `Downloaded ${rows.length} ${getOutOfStockDecisionTitle(state).toLowerCase()}.`
        : 'Could not export this decision queue right now.'
    );
  };

  const handleCopyOutOfStockDecisionValues = async (
    state: OutOfStockDecisionState
  ) => {
    if (reviewReasonCode !== 'out_of_stock') {
      setLaneActionFeedback('Open an out-of-stock review batch before copying this decision queue.');
      return;
    }

    const matchingQueue = outOfStockWholeUnavailableDecisionQueue.filter(
      (item) => item.decisionState === state
    );

    if (!matchingQueue.length) {
      setLaneActionFeedback(
        `No ${getOutOfStockDecisionTitle(state).toLowerCase()} are available right now.`
      );
      return;
    }

    const values =
      state === 'archive_candidate'
        ? Array.from(
            new Set(
              matchingQueue
                .map(({ group }) => String(group.platform_product_id || '').trim())
                .filter(Boolean)
            )
          )
        : Array.from(
            new Set(
              matchingQueue.flatMap(({ group }) =>
                (group.sample_skus || []).map((sku) => String(sku || '').trim()).filter(Boolean)
              )
            )
          );

    if (!values.length) {
      setLaneActionFeedback(
        state === 'archive_candidate'
          ? 'No product IDs are available to copy for this queue yet.'
          : 'No sample SKUs are available to copy for this queue yet.'
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(values.join('\n'));
      setLaneActionFeedback(
        state === 'archive_candidate'
          ? `Copied ${values.length} product IDs from ${getOutOfStockDecisionTitle(state).toLowerCase()}.`
          : `Copied ${values.length} sample SKUs from ${getOutOfStockDecisionTitle(state).toLowerCase()}.`
      );
    } catch {
      setLaneActionFeedback('Could not copy this decision queue right now.');
    }
  };

  const openLaneGroup = async (
    group: SourceDataLaneGroup,
    options?: { queueState?: CatalogReviewQueueState | null }
  ) => {
    try {
      const latestPlan =
        reviewSource === 'readiness'
          ? await loadCatalogReviewPlan({
              forceRefresh: true,
              scope: 'product',
              reason: 'lane_group_navigation',
            })
          : null;
      const product = await resolveProductForReview(group.platform, group.platform_product_id);
      setSelectedProduct(product);
      setSelectedVariantId(group.sample_variant_id || null);
      setReviewSource('readiness');
      setReviewReasonCode(group.reason_code);
      setShowViewModal(true);
      replaceReadinessReviewUrl({
        platform: group.platform,
        platformProductId: group.platform_product_id,
        variantId: group.sample_variant_id,
        reasonCode: group.reason_code,
        planId:
          latestPlan?.plan_id ||
          catalogReviewPlan?.plan_id ||
          deepLinkPlanId,
        queueState: options?.queueState ?? deepLinkQueueState,
      });
    } catch (error) {
      console.error('Failed to open lane review group', error);
    }
  };

  useEffect(() => {
    if (
      !showViewModal ||
      reviewSource !== 'readiness' ||
      !deepLinkQueueState ||
      !reviewReasonCode ||
      !sourceDataLaneGroups.length
    ) {
      deepLinkQueueResolvedRef.current = null;
      return;
    }

    const queueKey = [
      reviewReasonCode,
      deepLinkQueueState,
      selectedProduct?.platform || '',
      selectedProduct?.platform_product_id ||
        selectedProduct?.product_id ||
        selectedProduct?.id ||
        '',
      sourceDataLaneGroups.length,
    ].join('|');

    if (matchesDeepLinkQueueState || !deepLinkQueueTargetGroup) {
      deepLinkQueueResolvedRef.current = queueKey;
      return;
    }

    if (deepLinkQueueResolvedRef.current === queueKey) {
      return;
    }

    deepLinkQueueResolvedRef.current = queueKey;
    void openLaneGroup(deepLinkQueueTargetGroup, {
      queueState: deepLinkQueueState,
    });
  }, [
    deepLinkQueueState,
    deepLinkQueueTargetGroup,
    matchesDeepLinkQueueState,
    openLaneGroup,
    reviewReasonCode,
    reviewSource,
    selectedProduct,
    showViewModal,
    sourceDataLaneGroups.length,
  ]);

  const handleCopyLaneValues = async (
    kind: 'sku' | 'variant_id',
    scope: 'matching' | 'pending' = 'matching'
  ) => {
    const sourceVariants =
      scope === 'pending'
        ? pendingLaneVariants.map((item) => item.blockerVariant)
        : focusedReadinessVariants;
    const values =
      kind === 'sku'
        ? sourceVariants
            .map((variant) => String(variant.sku || '').trim())
            .filter(Boolean)
        : sourceVariants
            .map((variant) => String(variant.variant_id || '').trim())
            .filter(Boolean);

    if (!values.length) {
      setLaneActionFeedback(
        kind === 'sku'
          ? scope === 'pending'
            ? 'No pending SKUs are left in this batch.'
            : 'No matching SKUs are available in this batch yet.'
          : scope === 'pending'
            ? 'No pending variant IDs are left in this batch.'
            : 'No matching variant IDs are available in this batch yet.'
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(values.join('\n'));
      setLaneActionFeedback(
        kind === 'sku'
          ? `Copied ${values.length} ${
              scope === 'pending' ? 'pending' : 'matching'
            } SKU${values.length === 1 ? '' : 's'}.`
          : `Copied ${values.length} ${
              scope === 'pending' ? 'pending' : 'matching'
            } variant ID${values.length === 1 ? '' : 's'}.`
      );
    } catch (error) {
      console.error('Failed to copy lane values', error);
      setLaneActionFeedback('Could not copy this batch right now.');
    }
  };

  const handleDownloadLaneCsv = (scope: 'matching' | 'pending' | 'resolved' = 'matching') => {
    const sourceVariants =
      scope === 'pending'
        ? pendingLaneVariants.map((item) => item.blockerVariant)
        : scope === 'resolved'
          ? resolvedLaneVariants.map((item) => item.blockerVariant)
          : focusedReadinessVariants;

    if (!sourceVariants.length || !reviewReasonCode || !selectedProduct) {
      setLaneActionFeedback('No variant rows are available to export yet.');
      return;
    }

    const rows = sourceVariants.map((variant) => {
      const variantId = String(variant.variant_id || '');
      const currentVariant = currentSelectedVariantMap.get(variantId);
      const laneState = laneVariantStateMap.get(variantId);
      const currentPrice =
        typeof currentVariant?.price === 'number'
          ? currentVariant.price
          : typeof currentVariant?.price?.value === 'number'
            ? currentVariant.price.value
            : variant.price_value ?? null;
      const currentCurrency =
        currentVariant?.currency ||
        currentVariant?.price?.currency ||
        variant.price_currency ||
        selectedProduct.currency ||
        null;
      const currentInventory =
        currentVariant?.inventory_quantity ??
        currentVariant?.stock ??
        variant.inventory_quantity ??
        null;

      return {
        reason_code: reviewReasonCode,
        reason_label: formatSourceDataReasonLabel(reviewReasonCode),
        batch_scope: scope,
        batch_product_title: selectedProduct.title || selectedProduct.name || '',
        platform: selectedProduct.platform || '',
        platform_product_id:
          selectedProduct.platform_product_id ||
          selectedProduct.product_id ||
          selectedProduct.id ||
          '',
        variant_id: variant.variant_id || '',
        variant_title: variant.title || '',
        sku: variant.sku || '',
        readiness_status: variant.readiness_status || '',
        readiness_blocker_codes: variant.readiness_blocker_codes || [],
        readiness_warning_codes: variant.readiness_warning_codes || [],
        agent_push_status: variant.agent_push_status || '',
        agent_push_reason_codes: variant.agent_push_reason_codes || [],
        current_price_value: currentPrice,
        current_price_currency: currentCurrency,
        current_inventory_quantity: currentInventory,
        batch_state_label:
          reviewReasonCode === 'out_of_stock'
            ? getOutOfStockBatchStateLabel(
                outOfStockBatchState || 'no_matching_variants'
              )
            : '',
        merchant_action_label:
          reviewReasonCode === 'out_of_stock'
            ? laneState?.looksResolvedNow
              ? getOutOfStockResolvedActionLabel(
                  outOfStockBatchState || 'no_matching_variants'
                )
              : getOutOfStockPendingActionLabel(
                  outOfStockBatchState || 'no_matching_variants'
                )
            : '',
        current_state_label:
          reviewReasonCode === 'missing_primary_image'
            ? imageRecoveryState?.title || ''
            : laneState?.looksResolvedNow
              ? getLaneResolvedLabel(reviewReasonCode)
              : getLanePendingLabel(reviewReasonCode),
      };
    });

    const filename = [
      'catalog-review',
      reviewReasonCode,
      String(selectedProduct.platform_product_id || selectedProduct.product_id || selectedProduct.id || 'product'),
      scope,
    ].join('-') + '.csv';

    const downloaded = downloadCsvFile(filename, rows);
    setLaneActionFeedback(
      downloaded
        ? `Downloaded ${rows.length} ${scope === 'matching' ? 'batch' : scope} row${
            rows.length === 1 ? '' : 's'
          }.`
        : 'Could not export this batch right now.'
    );
  };

  useEffect(() => {
    if (!laneActionFeedback) return;
    const timeoutId = window.setTimeout(() => {
      setLaneActionFeedback(null);
    }, 2500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [laneActionFeedback]);

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="merchant-panel px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-brand)]"></div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[color:var(--merchant-ink)]">
                {t('dashboard.products.loadingTitle')}
              </p>
              <p className="text-sm text-[color:var(--merchant-muted)]">
                {t('dashboard.products.loadingDescription')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('dashboard.products.eyebrow')}
        title={heroTitle}
        description={heroDescription}
        actions={
          <>
            <MerchantLinkButton href="/dashboard/product-optimization" variant="secondary" icon={Sparkles}>
              {t('dashboard.products.reviewCatalogHealth')}
            </MerchantLinkButton>
            <MerchantButton type="button" onClick={handleAddProduct} icon={Plus}>
              {t('dashboard.products.addCatalogItem')}
            </MerchantButton>
          </>
        }
      />

      <SurfaceCard strong className="overflow-hidden">
        <div className="grid gap-3 px-5 py-5 lg:grid-cols-5 lg:px-6">
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/75 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">{t('dashboard.products.summary.catalogItems')}</div>
            <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {products.length}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">{t('dashboard.products.summary.catalogItemsMeta')}</div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/75 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">{t('dashboard.products.summary.channelReady')}</div>
            <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {sellableCount}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">{t('dashboard.products.summary.channelReadyMeta')}</div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/75 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">{t('dashboard.products.summary.blockedItems')}</div>
            <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {blockedCount}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">{t('dashboard.products.summary.blockedItemsMeta')}</div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/75 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">{t('dashboard.products.summary.contentGaps')}</div>
            <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {contentGapCount}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">{t('dashboard.products.summary.contentGapsMeta')}</div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/75 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">{t('dashboard.products.summary.liveInventory')}</div>
            <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {liveInventoryCount}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">{t('dashboard.products.summary.liveInventoryMeta')}</div>
          </div>
        </div>
      </SurfaceCard>

      <SectionHeader
        title={t('dashboard.products.catalogView.title')}
        description={t('dashboard.products.catalogView.description')}
        action={
          <StatusBadge tone="neutral">
            {t('dashboard.products.catalogView.visibleTotal', {
              visible: filteredProducts.length,
              total: products.length,
            })}
          </StatusBadge>
        }
      />

      <SurfaceCard>
        <div className="border-b border-[color:var(--merchant-line)] px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--merchant-muted)]" />
              <input
                type="text"
                placeholder={t('dashboard.products.catalogView.searchPlaceholder')}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="merchant-input"
                style={{ paddingLeft: '3.25rem' }}
              />
            </div>
            <div className="lg:w-64">
              <select
                value={sellableFilter}
                onChange={(event) =>
                  setSellableFilter(event.target.value as 'all' | 'sellable' | 'not_sellable')
                }
                className="merchant-select"
                aria-label="Filter by catalog readiness"
              >
                <option value="all">{t('dashboard.products.catalogView.filterAll')}</option>
                <option value="sellable">{t('dashboard.products.catalogView.filterReady')}</option>
                <option value="not_sellable">{t('dashboard.products.catalogView.filterAttention')}</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm text-[color:var(--merchant-muted-strong)] xl:justify-end">
              <StatusBadge tone={blockedCount > 0 ? 'warning' : 'success'}>
                {blockedCount > 0
                  ? t('dashboard.products.catalogView.blocked', { count: blockedCount })
                  : t('dashboard.products.catalogView.noBlockers')}
              </StatusBadge>
              <StatusBadge tone={contentGapCount > 0 ? 'warning' : 'success'}>
                {contentGapCount > 0
                  ? t('dashboard.products.catalogView.contentGaps', { count: contentGapCount })
                  : t('dashboard.products.catalogView.contentCovered')}
              </StatusBadge>
            </div>
          </div>
        </div>

        {filteredProducts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="merchant-table min-w-full">
              <thead>
                <tr>
                  <th>{t('dashboard.products.catalogView.headers.product')}</th>
                  <th>{t('dashboard.products.catalogView.headers.channelStatus')}</th>
                  <th>{t('dashboard.products.catalogView.headers.content')}</th>
                  <th>{t('dashboard.products.catalogView.headers.price')}</th>
                  <th>{t('dashboard.products.catalogView.headers.stock')}</th>
                  <th className="text-right">{t('dashboard.products.catalogView.headers.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const status = getProductStatusInfo(product, t);
                  const contentGap = hasContentGap(product);
                  const stock = Number(product?.inventory_quantity ?? product?.stock ?? 0);

                  return (
                    <tr key={product.id || product.product_id || product.sku}>
                      <td>
                        <div className="flex items-start gap-4">
                          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[1rem] bg-[color:var(--merchant-surface-muted)]">
                            {product.image_url || product.images?.[0] ? (
                              <img
                                src={product.image_url || product.images[0]}
                                alt={product.title || product.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Package className="h-6 w-6 text-[color:var(--merchant-muted)]" />
                            )}
                          </div>
                          <div className="space-y-1">
                            <p className="font-medium text-[color:var(--merchant-ink)]">
                              {product.title || product.name}
                            </p>
                            <p className="text-sm text-[color:var(--merchant-muted)]">
                              {product.sku || t('dashboard.products.catalogView.noSku')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div>
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        </div>
                      </td>
                      <td>
                        <div>
                          {contentGap ? (
                            <StatusBadge tone="warning" icon={FileText}>
                              {t('dashboard.products.catalogView.needsContent')}
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="success" icon={CheckCircle2}>
                              {t('dashboard.products.catalogView.complete')}
                            </StatusBadge>
                          )}
                        </div>
                      </td>
                      <td className="text-sm font-medium text-[color:var(--merchant-ink)]">
                        {formatCurrencyValue(product.price || 0, product.currency || 'USD')}
                      </td>
                      <td>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-[color:var(--merchant-ink)]">
                            {stock}
                          </p>
                          <p className="text-sm text-[color:var(--merchant-muted)]">
                            {stock > 0
                              ? t('dashboard.products.catalogView.inStock')
                              : t('dashboard.products.catalogView.outOfStock')}
                          </p>
                        </div>
                      </td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <MerchantButton
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setSelectedProduct(normalizeProductForReview(product));
                              setSelectedVariantId(null);
                              setReviewSource(null);
                              setReviewReasonCode(null);
                              setShowViewModal(true);
                            }}
                          >
                            {t('dashboard.products.catalogView.review')}
                          </MerchantButton>
                          <MerchantButton
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setSelectedProduct(normalizeProductForReview(product));
                              setSelectedVariantId(null);
                              setReviewSource(null);
                              setReviewReasonCode(null);
                              setShowEditModal(true);
                            }}
                          >
                            {t('dashboard.products.catalogView.edit')}
                          </MerchantButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Package}
            title={t('dashboard.products.catalogView.emptyTitle')}
            description={t('dashboard.products.catalogView.emptyDescription')}
            action={
              <MerchantLinkButton href="/dashboard/integrations" variant="secondary" icon={ArrowRight}>
                {t('dashboard.products.catalogView.openSalesChannels')}
              </MerchantLinkButton>
            }
          />
        )}
      </SurfaceCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="merchant-panel p-6">
          <div className="space-y-3">
            <StatusBadge tone={blockedCount > 0 ? 'critical' : 'success'} icon={AlertCircle}>
              {t('dashboard.products.launchBlockers')}
            </StatusBadge>
            <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {blockedCount > 0
                ? t('dashboard.products.launchBlockersWithCount', { count: blockedCount })
                : t('dashboard.products.noLaunchBlockers')}
            </p>
            <p className="text-sm leading-6 text-[color:var(--merchant-muted)]">
              {t('dashboard.products.launchBlockersDescription')}
            </p>
            <MerchantLinkButton href="/dashboard/product-optimization" variant="ghost" icon={ArrowRight}>
              {t('dashboard.products.openCatalogHealth')}
            </MerchantLinkButton>
          </div>
        </div>

        <div className="merchant-panel p-6">
          <div className="space-y-3">
            <StatusBadge tone={contentGapCount > 0 ? 'warning' : 'success'} icon={Sparkles}>
              {t('dashboard.products.contentQuality')}
            </StatusBadge>
            <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {contentGapCount > 0
                ? t('dashboard.products.contentQualityWithCount', { count: contentGapCount })
                : t('dashboard.products.contentQualityClear')}
            </p>
            <p className="text-sm leading-6 text-[color:var(--merchant-muted)]">
              {t('dashboard.products.contentQualityDescription')}
            </p>
          </div>
        </div>

        <div className="merchant-panel p-6">
          <div className="space-y-3">
            <StatusBadge tone="brand" icon={Package}>
              {t('dashboard.products.inventoryCoverage')}
            </StatusBadge>
            <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {t('dashboard.products.inventoryCoverageWithCount', { count: liveInventoryCount })}
            </p>
            <p className="text-sm leading-6 text-[color:var(--merchant-muted)]">
              {t('dashboard.products.inventoryCoverageDescription')}
            </p>
          </div>
        </div>
      </div>

      {showViewModal && selectedProduct ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(30,24,18,0.45)] p-4 backdrop-blur-sm"
          onClick={() => setShowViewModal(false)}
        >
          <div
            className="merchant-panel w-full max-w-3xl max-h-[86vh] overflow-y-auto p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-6">
              <div>
                <div className="merchant-overline">Catalog item</div>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--merchant-ink)]">
                  {selectedProduct.title || selectedProduct.name}
                </h3>
              </div>

              {reviewSource === 'readiness' ? (
                <div className="rounded-[1.1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Opened from catalog health. Use the identifiers and variants below to fix the same product in your source catalog.
                </div>
              ) : null}

              {reviewSource === 'readiness' ? (
                <div className="rounded-[1.1rem] border border-amber-200 bg-amber-50/70 p-4">
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="text-sm font-medium text-amber-900">Readiness context</div>
                      <p className="mt-1 text-sm text-amber-900/80">
                        This is the current blocker and agent-push view for the same product in catalog health.
                      </p>
                    </div>

                    {productBlockerLoading ? (
                      <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-amber-900">
                        Loading readiness context...
                      </div>
                    ) : productBlockerError ? (
                      <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-amber-900">
                        {productBlockerError}
                      </div>
                    ) : productBlockerDetail ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-4">
                          <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.12em] text-amber-900/65">Ready</div>
                            <div className="mt-1 text-lg font-semibold text-amber-950">
                              {productBlockerDetail.summary.ready_variant_count}
                            </div>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.12em] text-amber-900/65">Blocked</div>
                            <div className="mt-1 text-lg font-semibold text-amber-950">
                              {productBlockerDetail.summary.blocked_variant_count}
                            </div>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.12em] text-amber-900/65">Eligible</div>
                            <div className="mt-1 text-lg font-semibold text-amber-950">
                              {productBlockerDetail.summary.eligible_variant_count}
                            </div>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.12em] text-amber-900/65">Excluded</div>
                            <div className="mt-1 text-lg font-semibold text-amber-950">
                              {productBlockerDetail.summary.excluded_variant_count}
                            </div>
                          </div>
                        </div>

                        {reviewReasonCode ? (
                          <div className="rounded-xl border border-amber-200 bg-white/80 p-4">
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                                    Batch triage focus
                                  </div>
                                  <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
                                    {formatSourceDataReasonLabel(reviewReasonCode)}
                                  </div>
                                  <div className="mt-2 text-xs text-[color:var(--merchant-muted)]">
                                    {reviewReasonCode === 'missing_primary_image'
                                      ? 'This is a product-level catalog issue. Review the main image and source product imagery for the whole item.'
                                      : `${focusedReadinessVariants.length} variants in this product match the current triage lane. The matching rows are highlighted below.`}
                                  </div>
                                </div>
                                {sourceDataLaneLoading ? (
                                  <div className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-900">
                                    Loading lane queue…
                                  </div>
                                ) : currentLaneGroup && sourceDataLaneGroups.length > 0 ? (
                                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                                    Batch {currentLaneGroupIndex + 1} of {sourceDataLaneGroups.length}
                                  </div>
                                ) : null}
                              </div>

                              {sourceDataLaneError ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                  {sourceDataLaneError}
                                </div>
                              ) : null}

                              {currentLaneGroup && sourceDataLaneGroups.length > 0 ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                      <div className="text-xs uppercase tracking-[0.12em] text-amber-900/65">
                                        Lane queue
                                      </div>
                                      <div className="mt-1 text-sm font-medium text-amber-950">
                                        {currentLaneGroup.product_title}
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                                        {currentLaneProgress ? (
                                          <span
                                            className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-amber-200 ${
                                              currentLaneProgress.pending_variant_count > 0
                                                ? 'bg-slate-100 text-slate-700'
                                                : 'bg-emerald-100 text-emerald-700'
                                            }`}
                                          >
                                            {currentLaneProgress.pending_variant_count > 0
                                              ? 'Still needs source fixes'
                                              : 'Looks fixed now'}
                                          </span>
                                        ) : null}
                                        <span className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-amber-200">
                                          {currentLaneGroup.affected_variants} affected variants
                                        </span>
                                        {currentLaneProgress ? (
                                          <>
                                            <span className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-amber-200">
                                              {currentLaneProgress.pending_variant_count} pending now
                                            </span>
                                            <span className="rounded-full bg-white px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-amber-200">
                                              {currentLaneProgress.resolved_variant_count} look fixed now
                                            </span>
                                            {reviewReasonCode === 'out_of_stock' &&
                                            currentLaneProgress.batch_state ? (
                                              <span
                                                className={`rounded-full bg-white px-2 py-0.5 font-medium ring-1 ring-amber-200 ${
                                                  currentLaneProgress.batch_state ===
                                                  'whole_product_unavailable'
                                                    ? 'text-rose-700'
                                                    : currentLaneProgress.batch_state ===
                                                        'partially_recovered'
                                                      ? 'text-blue-700'
                                                      : 'text-emerald-700'
                                                }`}
                                              >
                                                {getOutOfStockBatchStateLabel(
                                                  currentLaneProgress.batch_state
                                                )}
                                              </span>
                                            ) : null}
                                          </>
                                        ) : null}
                                        <span className="rounded-full bg-white px-2 py-0.5 font-medium text-rose-700 ring-1 ring-amber-200">
                                          {currentLaneGroup.blocked_variant_count} blocked
                                        </span>
                                        <span className="rounded-full bg-white px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200">
                                          {currentLaneGroup.excluded_variant_count} excluded
                                        </span>
                                      </div>
                                      {reviewReasonCode === 'out_of_stock' &&
                                      currentLaneProgress?.batch_state ===
                                        'whole_product_unavailable' ? (
                                        <div className="mt-3 space-y-2">
                                          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-amber-900/65">
                                            Merchant decision now
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-amber-200">
                                              {getPersistedOutOfStockDecisionLabel(
                                                currentPersistedOutOfStockDecisionState
                                              )}
                                            </span>
                                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-amber-200">
                                              {outOfStockSavedDecisionCount} saved
                                            </span>
                                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                                              {outOfStockUndecidedLaneGroups.length} undecided
                                            </span>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleSetOutOfStockDecision(
                                                  'restock_planned'
                                                )
                                              }
                                              disabled={decisionSaving}
                                              className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                            >
                                              Mark as restock planned
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleSetOutOfStockDecision(
                                                  'archive_planned'
                                                )
                                              }
                                              disabled={decisionSaving}
                                              className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-800 hover:bg-slate-200 disabled:opacity-50"
                                            >
                                              Mark as archive / discontinue
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleSetOutOfStockDecision(
                                                  'manual_review'
                                                )
                                              }
                                              disabled={decisionSaving}
                                              className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                            >
                                              Mark for manual review
                                            </button>
                                            {currentPersistedOutOfStockDecisionState ? (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void handleSetOutOfStockDecision(null)
                                                }
                                                disabled={decisionSaving}
                                                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                              >
                                                Clear decision
                                              </button>
                                            ) : null}
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleSetOutOfStockDecisionAndAdvance(
                                                  'restock_planned'
                                                )
                                              }
                                              disabled={decisionSaving}
                                              className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                            >
                                              Restock + next undecided
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleSetOutOfStockDecisionAndAdvance(
                                                  'archive_planned'
                                                )
                                              }
                                              disabled={decisionSaving}
                                              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                                            >
                                              Archive + next undecided
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleSetOutOfStockDecisionAndAdvance(
                                                  'manual_review'
                                                )
                                              }
                                              disabled={decisionSaving}
                                              className="inline-flex items-center rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                                            >
                                              Manual review + next undecided
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}
                                      {reviewReasonCode === 'missing_price' &&
                                      currentLaneProgress &&
                                      currentLaneProgress.pending_variant_count > 0 ? (
                                        <div className="mt-3 space-y-2">
                                          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-amber-900/65">
                                            Repair progress now
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-amber-200">
                                              {getPersistedMissingPriceDecisionLabel(
                                                currentPersistedMissingPriceDecisionState
                                              )}
                                            </span>
                                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-amber-200">
                                              {missingPriceSavedLaneGroups.length} saved
                                            </span>
                                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                                              {missingPriceUnsavedLaneGroups.length} unsaved
                                            </span>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleSetMissingPriceDecision(
                                                  'pricing_fix_saved'
                                                )
                                              }
                                              disabled={decisionSaving}
                                              className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                            >
                                              Save for pricing fix
                                            </button>
                                            {currentPersistedMissingPriceDecisionState ? (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void handleSetMissingPriceDecision(null)
                                                }
                                                disabled={decisionSaving}
                                                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                              >
                                                Clear saved progress
                                              </button>
                                            ) : null}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleSetMissingPriceDecisionAndAdvance()
                                              }
                                              disabled={decisionSaving}
                                              className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                            >
                                              Save + next unresolved
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}
                                      {reviewReasonCode === 'missing_primary_image' &&
                                      currentLaneProgress &&
                                      !currentLaneProgress.looks_resolved_now ? (
                                        <div className="mt-3 space-y-2">
                                          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-amber-900/65">
                                            Repair progress now
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-amber-200">
                                              {getPersistedMissingImageDecisionLabel(
                                                currentPersistedMissingImageDecisionState
                                              )}
                                            </span>
                                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-amber-200">
                                              {missingImageSavedLaneGroups.length} saved
                                            </span>
                                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                                              {missingImageUnsavedLaneGroups.length} unsaved
                                            </span>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleSetMissingImageDecision(
                                                  'image_fix_saved'
                                                )
                                              }
                                              disabled={decisionSaving}
                                              className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                                            >
                                              Save for image repair
                                            </button>
                                            {currentPersistedMissingImageDecisionState ? (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void handleSetMissingImageDecision(null)
                                                }
                                                disabled={decisionSaving}
                                                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                              >
                                                Clear saved progress
                                              </button>
                                            ) : null}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleSetMissingImageDecisionAndAdvance()
                                              }
                                              disabled={decisionSaving}
                                              className="inline-flex items-center rounded-md border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                                            >
                                              Save + next unresolved
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {sourceDataLaneGroups.length > 1 ? (
                                        <div className="flex flex-wrap gap-1 text-[11px]">
                                          <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-amber-200">
                                            {unresolvedLaneGroups.length} batches still need fixes
                                          </span>
                                          <span className="rounded-full bg-white px-2 py-1 font-medium text-emerald-700 ring-1 ring-amber-200">
                                            {resolvedLaneGroups.length} already look fixed
                                          </span>
                                          {reviewReasonCode === 'out_of_stock' ? (
                                            <>
                                              <span className="rounded-full bg-white px-2 py-1 font-medium text-rose-700 ring-1 ring-amber-200">
                                                {outOfStockWholeUnavailableLaneGroups.length} whole product unavailable
                                              </span>
                                              <span className="rounded-full bg-white px-2 py-1 font-medium text-blue-700 ring-1 ring-amber-200">
                                                {outOfStockPartiallyRecoveredLaneGroups.length} partially back in stock
                                              </span>
                                              <span className="rounded-full bg-white px-2 py-1 font-medium text-emerald-700 ring-1 ring-amber-200">
                                                {outOfStockRestockedLaneGroups.length} back in stock now
                                              </span>
                                            </>
                                          ) : null}
                                        </div>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (currentLaneGroupIndex > 0) {
                                            void openLaneGroup(
                                              sourceDataLaneGroups[currentLaneGroupIndex - 1]
                                            );
                                          }
                                        }}
                                        disabled={currentLaneGroupIndex <= 0}
                                        className="inline-flex items-center rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Previous batch
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (
                                            currentLaneGroupIndex >= 0 &&
                                            currentLaneGroupIndex < sourceDataLaneGroups.length - 1
                                          ) {
                                            void openLaneGroup(
                                              sourceDataLaneGroups[currentLaneGroupIndex + 1]
                                            );
                                          }
                                        }}
                                        disabled={
                                          currentLaneGroupIndex < 0 ||
                                          currentLaneGroupIndex >= sourceDataLaneGroups.length - 1
                                        }
                                        className="inline-flex items-center rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Next batch
                                      </button>
                                      {(nextPendingLaneGroup || firstPendingLaneGroup) ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const targetGroup =
                                              nextPendingLaneGroup ||
                                              (currentLaneProgress?.pending_variant_count === 0
                                                ? firstPendingLaneGroup
                                                : null);
                                            if (targetGroup) {
                                              void openLaneGroup(targetGroup);
                                            }
                                          }}
                                          disabled={
                                            !nextPendingLaneGroup &&
                                            !(
                                              currentLaneProgress?.pending_variant_count === 0 &&
                                              firstPendingLaneGroup
                                            )
                                          }
                                          className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {nextPendingLaneGroup
                                            ? 'Next pending batch'
                                            : 'Open first pending batch'}
                                        </button>
                                      ) : null}
                                      {reviewReasonCode === 'out_of_stock' &&
                                      (getNextOutOfStockUndecidedLaneGroup() ||
                                        (currentPersistedOutOfStockDecisionState
                                          ? outOfStockUndecidedLaneGroups[0]?.group
                                          : null)) ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const targetGroup =
                                              getNextOutOfStockUndecidedLaneGroup() ||
                                              (currentPersistedOutOfStockDecisionState
                                                ? outOfStockUndecidedLaneGroups[0]?.group || null
                                                : null);
                                            if (targetGroup) {
                                              void openLaneGroup(targetGroup);
                                            }
                                          }}
                                          disabled={
                                            !getNextOutOfStockUndecidedLaneGroup() &&
                                            !(
                                              currentPersistedOutOfStockDecisionState &&
                                              outOfStockUndecidedLaneGroups[0]?.group
                                            )
                                          }
                                          className="inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {getNextOutOfStockUndecidedLaneGroup()
                                            ? 'Next undecided batch'
                                            : 'Open first undecided batch'}
                                        </button>
                                      ) : null}
                                      {reviewReasonCode === 'out_of_stock' &&
                                      (nextWholeUnavailableLaneGroup ||
                                        firstWholeUnavailableLaneGroup) ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const targetGroup =
                                              nextWholeUnavailableLaneGroup ||
                                              (currentLaneProgress?.batch_state !==
                                              'whole_product_unavailable'
                                                ? firstWholeUnavailableLaneGroup
                                                : null);
                                            if (targetGroup) {
                                              void openLaneGroup(targetGroup);
                                            }
                                          }}
                                          disabled={
                                            !nextWholeUnavailableLaneGroup &&
                                            !(
                                              currentLaneProgress?.batch_state !==
                                                'whole_product_unavailable' &&
                                              firstWholeUnavailableLaneGroup
                                            )
                                          }
                                          className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {nextWholeUnavailableLaneGroup
                                            ? 'Next whole-unavailable batch'
                                            : 'Open first whole-unavailable batch'}
                                        </button>
                                      ) : null}
                                      {reviewReasonCode === 'out_of_stock' &&
                                      (nextPartiallyRecoveredLaneGroup ||
                                        firstPartiallyRecoveredLaneGroup) ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const targetGroup =
                                              nextPartiallyRecoveredLaneGroup ||
                                              (currentLaneProgress?.batch_state !==
                                              'partially_recovered'
                                                ? firstPartiallyRecoveredLaneGroup
                                                : null);
                                            if (targetGroup) {
                                              void openLaneGroup(targetGroup);
                                            }
                                          }}
                                          disabled={
                                            !nextPartiallyRecoveredLaneGroup &&
                                            !(
                                              currentLaneProgress?.batch_state !==
                                                'partially_recovered' &&
                                              firstPartiallyRecoveredLaneGroup
                                            )
                                          }
                                          className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {nextPartiallyRecoveredLaneGroup
                                            ? 'Next partially recovered batch'
                                            : 'Open first partially recovered batch'}
                                        </button>
                                      ) : null}
                                      {reviewReasonCode === 'out_of_stock' &&
                                      (nextRestockedLaneGroup || firstRestockedLaneGroup) ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const targetGroup =
                                              nextRestockedLaneGroup ||
                                              (currentLaneProgress?.batch_state !==
                                              'restocked_waiting_refresh'
                                                ? firstRestockedLaneGroup
                                                : null);
                                            if (targetGroup) {
                                              void openLaneGroup(targetGroup);
                                            }
                                          }}
                                          disabled={
                                            !nextRestockedLaneGroup &&
                                            !(
                                              currentLaneProgress?.batch_state !==
                                                'restocked_waiting_refresh' &&
                                              firstRestockedLaneGroup
                                            )
                                          }
                                          className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {nextRestockedLaneGroup
                                            ? 'Next back-in-stock batch'
                                            : 'Open first back-in-stock batch'}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                  {currentLaneProgress?.pending_variant_count === 0 ? (
                                    <div className="mt-3 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2 text-[11px] text-emerald-900">
                                      This batch now looks fixed in the synced catalog. If the next unresolved batch still needs work, jump there directly instead of rechecking already-resolved variants.
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}

                              {reviewReasonCode !== 'missing_primary_image' &&
                              focusedReadinessVariants.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDownloadLaneCsv(
                                        pendingLaneVariants.length > 0 ? 'pending' : 'matching'
                                      )
                                    }
                                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    {pendingLaneVariants.length > 0
                                      ? 'Download pending CSV'
                                      : 'Download batch CSV'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopyLaneValues(
                                        'sku',
                                        pendingLaneVariants.length > 0
                                          ? 'pending'
                                          : 'matching'
                                      )
                                    }
                                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    {pendingLaneVariants.length > 0
                                      ? 'Copy pending SKUs'
                                      : 'Copy matching SKUs'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopyLaneValues(
                                        'variant_id',
                                        pendingLaneVariants.length > 0
                                          ? 'pending'
                                          : 'matching'
                                      )
                                    }
                                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    {pendingLaneVariants.length > 0
                                      ? 'Copy pending variant IDs'
                                      : 'Copy matching variant IDs'}
                                  </button>
                                  {laneActionFeedback ? (
                                    <span className="text-[11px] text-slate-600">
                                      {laneActionFeedback}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}

                              {reviewReasonCode === 'missing_primary_image' &&
                              focusedReadinessVariants.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadLaneCsv('matching')}
                                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Download batch CSV
                                  </button>
                                  {laneActionFeedback ? (
                                    <span className="text-[11px] text-slate-600">
                                      {laneActionFeedback}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}

                              {reviewReasonCode === 'missing_primary_image' &&
                              missingImageQueueSummary.length > 0 ? (
                                <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                                        Product-level image completion queue
                                      </div>
                                      <div className="mt-1 text-xs leading-5 text-[color:var(--merchant-muted)]">
                                        Work missing-image products by completion state instead of rechecking each variant row. Export the queue, copy product IDs, or jump straight to the next product batch in the same state.
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-700">
                                      {missingImageUnresolvedLaneGroups.length} image-repair batches left
                                    </div>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                                    <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                                      {missingImageSavedLaneGroups.length} saved repair batches
                                    </span>
                                    <span className="rounded-full bg-white px-2 py-1 font-medium text-amber-800 ring-1 ring-amber-200">
                                      {missingImageUnsavedLaneGroups.length} still unsaved
                                    </span>
                                  </div>
                                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                    {missingImageQueueSummary.map((item) => (
                                      <div
                                        key={item.state}
                                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <div className="text-sm font-medium text-slate-900">
                                              {item.title}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-600">
                                              {item.summary}
                                            </div>
                                          </div>
                                          <div className="rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                                            {item.count}
                                          </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDownloadMissingImageQueueCsv(item.state)
                                            }
                                            disabled={item.count === 0}
                                            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            Download product queue CSV
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleCopyMissingImageQueueProductIds(item.state)
                                            }
                                            disabled={item.count === 0}
                                            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            Copy product IDs
                                          </button>
                                          {(item.nextGroup || item.firstGroup) ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const targetGroup =
                                                  item.nextGroup ||
                                                  (currentMissingImageBatchState !== item.state
                                                    ? item.firstGroup
                                                    : null);
                                                if (targetGroup) {
                                                  void openLaneGroup(targetGroup);
                                                }
                                              }}
                                              disabled={
                                                !item.nextGroup &&
                                                !(
                                                  currentMissingImageBatchState !== item.state &&
                                                  item.firstGroup
                                                )
                                              }
                                              className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${item.buttonClass}`}
                                            >
                                              {item.nextGroup
                                                ? `Next ${item.title.toLowerCase()} batch`
                                                : `Open first ${item.title.toLowerCase()} batch`}
                                            </button>
                                          ) : null}
                                        </div>
                                        {item.previewGroups.length > 0 ? (
                                          <div className="mt-3 space-y-2">
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                              Queue preview
                                            </div>
                                            {item.previewGroups.map(
                                              ({
                                                group,
                                                progress,
                                                persistedDecisionState,
                                              }) => (
                                              <button
                                                key={`${item.state}-${group.platform}-${group.platform_product_id}`}
                                                type="button"
                                                onClick={() => {
                                                  void openLaneGroup(group);
                                                }}
                                                className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-100"
                                              >
                                                <div className="min-w-0">
                                                  <div className="truncate text-xs font-medium text-slate-900">
                                                    {group.product_title}
                                                  </div>
                                                  <div className="mt-1 text-[11px] text-slate-600">
                                                    {group.affected_variants} affected · {progress.looks_resolved_now ? 'primary image visible now' : 'hero image still missing'}
                                                  </div>
                                                </div>
                                                <div className="shrink-0 rounded-full bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200">
                                                  Open
                                                </div>
                                              </button>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {laneChecklist ? (
                                <div className="rounded-xl border border-amber-200 bg-white/80 p-4">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                                        {laneChecklist.title}
                                      </div>
                                      <div className="mt-1 text-xs leading-5 text-[color:var(--merchant-muted)]">
                                        {laneChecklist.helper}
                                      </div>
                                    </div>
                                    <a
                                      href={catalogHealthReturnHref}
                                      className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                      Return to Catalog health
                                    </a>
                                  </div>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                    {laneChecklist.metrics.map((metric) => (
                                      <div
                                        key={metric.label}
                                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                                      >
                                        <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                          {metric.label}
                                        </div>
                                        <div className="mt-1 text-sm font-semibold text-slate-900">
                                          {metric.value}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-3">
                                    <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                      What to do next
                                    </div>
                                    <div className="mt-2 space-y-2">
                                      {laneChecklist.steps.map((step) => (
                                        <div
                                          key={step}
                                          className="flex items-start gap-2 text-sm text-slate-700"
                                        >
                                          <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                                          <span>{step}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {imageRecoveryState ? (
                                <div
                                  className={`rounded-xl border p-4 ${
                                    imageRecoveryState.looksResolvedNow
                                      ? 'border-emerald-200 bg-emerald-50/70'
                                      : 'border-slate-200 bg-white/80'
                                  }`}
                                >
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <div
                                        className={`text-sm font-medium ${
                                          imageRecoveryState.looksResolvedNow
                                            ? 'text-emerald-950'
                                            : 'text-[color:var(--merchant-ink)]'
                                        }`}
                                      >
                                        {imageRecoveryState.title}
                                      </div>
                                      <div
                                        className={`mt-1 text-xs leading-5 ${
                                          imageRecoveryState.looksResolvedNow
                                            ? 'text-emerald-900/80'
                                            : 'text-[color:var(--merchant-muted)]'
                                        }`}
                                      >
                                        {imageRecoveryState.helper}
                                      </div>
                                    </div>
                                    <div
                                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                                        imageRecoveryState.looksResolvedNow
                                          ? 'bg-white text-emerald-950 ring-1 ring-emerald-200'
                                          : 'bg-slate-50 text-slate-900 ring-1 ring-slate-200'
                                      }`}
                                    >
                                      {imageRecoveryState.metricLabel}: {imageRecoveryState.metricValue}
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {outOfStockBatchGuidance ? (
                                <div
                                  className={`rounded-xl border p-4 ${
                                    outOfStockBatchGuidance.state ===
                                    'restocked_waiting_refresh'
                                      ? 'border-emerald-200 bg-emerald-50/70'
                                      : outOfStockBatchGuidance.state ===
                                          'partially_recovered'
                                        ? 'border-blue-200 bg-blue-50/70'
                                        : 'border-slate-200 bg-white/80'
                                  }`}
                                >
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <div
                                        className={`text-sm font-medium ${
                                          outOfStockBatchGuidance.state ===
                                          'restocked_waiting_refresh'
                                            ? 'text-emerald-950'
                                            : outOfStockBatchGuidance.state ===
                                                'partially_recovered'
                                              ? 'text-blue-950'
                                              : 'text-[color:var(--merchant-ink)]'
                                        }`}
                                      >
                                        {outOfStockBatchGuidance.title}
                                      </div>
                                      <div
                                        className={`mt-1 text-xs leading-5 ${
                                          outOfStockBatchGuidance.state ===
                                          'restocked_waiting_refresh'
                                            ? 'text-emerald-900/80'
                                            : outOfStockBatchGuidance.state ===
                                                'partially_recovered'
                                              ? 'text-blue-900/80'
                                              : 'text-[color:var(--merchant-muted)]'
                                        }`}
                                      >
                                        {outOfStockBatchGuidance.helper}
                                      </div>
                                    </div>
                                    <div
                                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                                        outOfStockBatchGuidance.state ===
                                        'restocked_waiting_refresh'
                                          ? 'bg-white text-emerald-950 ring-1 ring-emerald-200'
                                          : outOfStockBatchGuidance.state ===
                                              'partially_recovered'
                                            ? 'bg-white text-blue-950 ring-1 ring-blue-200'
                                            : 'bg-slate-50 text-slate-900 ring-1 ring-slate-200'
                                      }`}
                                    >
                                      {outOfStockBatchGuidance.actionTitle}
                                    </div>
                                  </div>
                                  <div className="mt-3 space-y-2">
                                    {outOfStockBatchGuidance.actions.map((action) => (
                                      <div
                                        key={action}
                                        className="flex items-start gap-2 text-sm text-slate-700"
                                      >
                                        <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                                        <span>{action}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {reviewReasonCode === 'out_of_stock' &&
                              outOfStockQueueSummary.length > 0 ? (
                                <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                                        Product-level out-of-stock queue
                                      </div>
                                      <div className="mt-1 text-xs leading-5 text-[color:var(--merchant-muted)]">
                                        Export the exact product queue that still needs a restock-or-archive decision, or jump straight to the next batch in the same state. This lets you handle whole-product stock gaps differently from partially recovered batches.
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-700">
                                      {outOfStockWholeUnavailableLaneGroups.length} whole-product decisions left
                                    </div>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                                    <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                                      {outOfStockSavedDecisionCount} saved merchant decisions
                                    </span>
                                    <span className="rounded-full bg-white px-2 py-1 font-medium text-amber-800 ring-1 ring-amber-200">
                                      {outOfStockUndecidedLaneGroups.length} still undecided
                                    </span>
                                    <span className="rounded-full bg-white px-2 py-1 font-medium text-blue-700 ring-1 ring-blue-200">
                                      {outOfStockPersistedRestockLaneGroups.length} saved as restock
                                    </span>
                                    <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                                      {outOfStockPersistedArchiveLaneGroups.length} saved as archive
                                    </span>
                                    <span className="rounded-full bg-white px-2 py-1 font-medium text-amber-800 ring-1 ring-amber-200">
                                      {outOfStockPersistedManualReviewLaneGroups.length} saved as manual review
                                    </span>
                                  </div>
                                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                                    {outOfStockQueueSummary.map((item) => (
                                      <div
                                        key={item.state}
                                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <div className="text-sm font-medium text-slate-900">
                                              {item.title}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-600">
                                              {item.summary}
                                            </div>
                                          </div>
                                          <div className="rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                                            {item.count}
                                          </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleDownloadOutOfStockQueueCsv(item.state)}
                                            disabled={item.count === 0}
                                            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            Download product queue CSV
                                          </button>
                                          {(item.nextGroup || item.firstGroup) ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const targetGroup =
                                                  item.nextGroup ||
                                                  (currentLaneProgress?.batch_state !== item.state
                                                    ? item.firstGroup
                                                    : null);
                                                if (targetGroup) {
                                                  void openLaneGroup(targetGroup);
                                                }
                                              }}
                                              disabled={
                                                !item.nextGroup &&
                                                !(
                                                  currentLaneProgress?.batch_state !== item.state &&
                                                  item.firstGroup
                                                )
                                              }
                                              className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${item.buttonClass}`}
                                            >
                                              {item.nextGroup
                                                ? `Next ${item.title.toLowerCase()} batch`
                                                : `Open first ${item.title.toLowerCase()} batch`}
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {reviewReasonCode === 'missing_price' &&
                              missingPriceQueueSummary.length > 0 ? (
                                <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                                        Product-level pricing repair queue
                                      </div>
                                      <div className="mt-1 text-xs leading-5 text-[color:var(--merchant-muted)]">
                                        Work missing-price products by queue state instead of one variant at a time. Export the exact product queue that still needs pricing fixes, copy sample SKUs, or jump straight to the next batch in the same state.
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-700">
                                      {missingPriceWholeMissingLaneGroups.length} whole-product pricing batches left
                                    </div>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                                    <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                                      {missingPriceSavedLaneGroups.length} saved repair batches
                                    </span>
                                    <span className="rounded-full bg-white px-2 py-1 font-medium text-amber-800 ring-1 ring-amber-200">
                                      {missingPriceUnsavedLaneGroups.length} still unsaved
                                    </span>
                                  </div>
                                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                                    {missingPriceQueueSummary.map((item) => (
                                      <div
                                        key={item.state}
                                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <div className="text-sm font-medium text-slate-900">
                                              {item.title}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-600">
                                              {item.summary}
                                            </div>
                                          </div>
                                          <div className="rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                                            {item.count}
                                          </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDownloadMissingPriceQueueCsv(item.state)
                                            }
                                            disabled={item.count === 0}
                                            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            Download product queue CSV
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleCopyMissingPriceQueueValues(item.state)
                                            }
                                            disabled={item.count === 0}
                                            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            Copy sample SKUs
                                          </button>
                                          {(item.nextGroup || item.firstGroup) ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const targetGroup =
                                                  item.nextGroup ||
                                                  (currentMissingPriceBatchState !== item.state
                                                    ? item.firstGroup
                                                    : null);
                                                if (targetGroup) {
                                                  void openLaneGroup(targetGroup);
                                                }
                                              }}
                                              disabled={
                                                !item.nextGroup &&
                                                !(
                                                  currentMissingPriceBatchState !== item.state &&
                                                  item.firstGroup
                                                )
                                              }
                                              className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${item.buttonClass}`}
                                            >
                                              {item.nextGroup
                                                ? `Next ${item.title.toLowerCase()} batch`
                                                : `Open first ${item.title.toLowerCase()} batch`}
                                            </button>
                                          ) : null}
                                        </div>
                                        {item.previewGroups.length > 0 ? (
                                          <div className="mt-3 space-y-2">
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                              Queue preview
                                            </div>
                                            {item.previewGroups.map(({ group, progress }) => (
                                              <button
                                                key={`${item.state}-${group.platform}-${group.platform_product_id}`}
                                                type="button"
                                                onClick={() => {
                                                  void openLaneGroup(group);
                                                }}
                                                className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-100"
                                              >
                                                <div className="min-w-0">
                                                  <div className="truncate text-xs font-medium text-slate-900">
                                                    {group.product_title}
                                                  </div>
                                                  <div className="mt-1 text-[11px] text-slate-600">
                                                    {group.affected_variants} affected · {progress.pending_variant_count} still missing now
                                                  </div>
                                                </div>
                                                <div className="shrink-0 rounded-full bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200">
                                                  Open
                                                </div>
                                              </button>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {reviewReasonCode === 'out_of_stock' &&
                              outOfStockDecisionSummary.length > 0 ? (
                                <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                                        Whole-product decisions
                                      </div>
                                      <div className="mt-1 text-xs leading-5 text-[color:var(--merchant-muted)]">
                                        Work the fully unavailable products in the right order. Use these three decision queues to separate batches that look like replenishment work from ones that look more like archive / discontinue decisions.
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-700">
                                      {outOfStockWholeUnavailableLaneGroups.length} whole-product batches to classify
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                                    {outOfStockDecisionSummary.map((item) => (
                                      <div
                                        key={item.state}
                                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <div className="text-sm font-medium text-slate-900">
                                              {item.title}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-600">
                                              {item.summary}
                                            </div>
                                          </div>
                                          <div className="rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                                            {item.count}
                                          </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDownloadOutOfStockDecisionQueueCsv(item.state)
                                            }
                                            disabled={item.count === 0}
                                            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            Download decision queue CSV
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleCopyOutOfStockDecisionValues(item.state)
                                            }
                                            disabled={item.count === 0}
                                            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            {item.copyLabel}
                                          </button>
                                          {(item.nextGroup || item.firstGroup) ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const targetGroup =
                                                  item.nextGroup ||
                                                  (currentOutOfStockDecisionState !== item.state
                                                    ? item.firstGroup
                                                    : null);
                                                if (targetGroup) {
                                                  void openLaneGroup(targetGroup);
                                                }
                                              }}
                                              disabled={
                                                !item.nextGroup &&
                                                !(
                                                  currentOutOfStockDecisionState !== item.state &&
                                                  item.firstGroup
                                                )
                                              }
                                              className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${item.buttonClass}`}
                                            >
                                              {item.nextGroup
                                                ? `Next ${item.title.toLowerCase()}`
                                                : `Open first ${item.title.toLowerCase()}`}
                                            </button>
                                          ) : null}
                                        </div>
                                        {item.previewGroups.length > 0 ? (
                                          <div className="mt-3 space-y-2">
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                              Queue preview
                                            </div>
                                            {item.previewGroups.map(
                                              ({
                                                group,
                                                progress,
                                                persistedDecisionState,
                                              }) => (
                                                <button
                                                  key={`${item.state}-${group.platform}-${group.platform_product_id}`}
                                                  type="button"
                                                  onClick={() => {
                                                    void openLaneGroup(group);
                                                  }}
                                                  className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-100"
                                                >
                                                  <div className="min-w-0">
                                                    <div className="truncate text-xs font-medium text-slate-900">
                                                      {group.product_title}
                                                    </div>
                                                    <div className="mt-1 text-[11px] text-slate-600">
                                                      {group.affected_variants} affected · {progress.pending_variant_count} pending now
                                                    </div>
                                                    {persistedDecisionState ? (
                                                      <div className="mt-1 text-[11px] text-slate-500">
                                                        Saved decision:{' '}
                                                        {getPersistedOutOfStockDecisionLabel(
                                                          persistedDecisionState
                                                        ).toLowerCase()}
                                                      </div>
                                                    ) : null}
                                                  </div>
                                                  <div className="shrink-0 rounded-full bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200">
                                                    Open
                                                  </div>
                                                </button>
                                              )
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {reviewReasonCode !== 'missing_primary_image' &&
                              focusedReadinessVariants.length > 0 ? (
                                <div className="grid gap-3 lg:grid-cols-2">
                                  <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                                    <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                                      {getLanePendingLabel(reviewReasonCode)}
                                    </div>
                                    <div className="mt-1 text-xs text-[color:var(--merchant-muted)]">
                                      {pendingLaneVariants.length > 0
                                        ? `${pendingLaneVariants.length} variants still look unresolved in the current synced catalog.`
                                        : 'No pending variants are left in the current sync view for this batch.'}
                                    </div>
                                    {pendingLaneVariants.length > 0 ? (
                                      <div className="mt-3 space-y-2">
                                        {pendingLaneVariants.slice(0, 6).map((item) => (
                                          <div
                                            key={`pending-${item.blockerVariant.variant_id}`}
                                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                                          >
                                            <div className="text-sm font-medium text-slate-900">
                                              {item.blockerVariant.title}
                                            </div>
                                            <div className="mt-1 text-[11px] text-slate-500">
                                              SKU {item.blockerVariant.sku || 'N/A'} · Variant ID{' '}
                                              {item.blockerVariant.variant_id}
                                            </div>
                                            <div className="mt-1 text-[11px] text-slate-600">
                                              {reviewReasonCode === 'missing_price'
                                                ? `Current price ${
                                                    item.currentVariant
                                                      ? formatCurrencyValue(
                                                          Number(item.currentVariant.price || 0),
                                                          item.currentVariant.currency ||
                                                            selectedProduct?.currency ||
                                                            'USD'
                                                        )
                                                      : 'unavailable'
                                                  }`
                                                : `Current stock ${
                                                    item.currentVariant?.inventory_quantity ?? 0
                                                  }`}
                                            </div>
                                            {reviewReasonCode === 'out_of_stock' ? (
                                              <div className="mt-2">
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                                  {getOutOfStockPendingActionLabel(
                                                    outOfStockBatchState ||
                                                      'no_matching_variants'
                                                  )}
                                                </span>
                                              </div>
                                            ) : null}
                                          </div>
                                        ))}
                                        {pendingLaneVariants.length > 6 ? (
                                          <div className="text-[11px] text-slate-500">
                                            Showing 6 of {pendingLaneVariants.length} pending variants in this batch.
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                                    <div className="text-sm font-medium text-emerald-950">
                                      {getLaneResolvedLabel(reviewReasonCode)}
                                    </div>
                                    <div className="mt-1 text-xs text-emerald-900/75">
                                      {resolvedLaneVariants.length > 0
                                        ? `${resolvedLaneVariants.length} variants now look resolved in the synced catalog, but Catalog health still needs a refresh to clear the old plan.`
                                        : 'No variants in this batch look resolved yet in the current synced catalog.'}
                                    </div>
                                    {resolvedLaneVariants.length > 0 ? (
                                      <div className="mt-3 space-y-2">
                                        {resolvedLaneVariants.slice(0, 6).map((item) => (
                                          <div
                                            key={`resolved-${item.blockerVariant.variant_id}`}
                                            className="rounded-lg border border-emerald-200 bg-white/80 px-3 py-2"
                                          >
                                            <div className="text-sm font-medium text-emerald-950">
                                              {item.blockerVariant.title}
                                            </div>
                                            <div className="mt-1 text-[11px] text-emerald-900/70">
                                              SKU {item.blockerVariant.sku || 'N/A'} · Variant ID{' '}
                                              {item.blockerVariant.variant_id}
                                            </div>
                                            <div className="mt-1 text-[11px] text-emerald-900/80">
                                              {reviewReasonCode === 'missing_price'
                                                ? `Now ${formatCurrencyValue(
                                                    Number(item.currentVariant?.price || 0),
                                                    item.currentVariant?.currency ||
                                                      selectedProduct?.currency ||
                                                      'USD'
                                                  )}`
                                                : `Now stock ${
                                                    item.currentVariant?.inventory_quantity ?? 0
                                                  }`}
                                            </div>
                                            {reviewReasonCode === 'out_of_stock' ? (
                                              <div className="mt-2">
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                                  {getOutOfStockResolvedActionLabel(
                                                    outOfStockBatchState ||
                                                      'no_matching_variants'
                                                  )}
                                                </span>
                                              </div>
                                            ) : null}
                                          </div>
                                        ))}
                                        {resolvedLaneVariants.length > 6 ? (
                                          <div className="text-[11px] text-emerald-900/70">
                                            Showing 6 of {resolvedLaneVariants.length} resolved variants in this batch.
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        {selectedReadinessVariant ? (
                          <div className="rounded-xl border border-amber-200 bg-white/80 p-4">
                            <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                              Selected variant
                            </div>
                            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
                              {selectedReadinessVariant.title}
                            </div>
                            <div className="mt-1 text-xs text-[color:var(--merchant-muted)]">
                              SKU {selectedReadinessVariant.sku || 'N/A'} · Variant ID{' '}
                              {selectedReadinessVariant.variant_id}
                            </div>
                            <div className="mt-2 text-sm text-[color:var(--merchant-muted-strong)]">
                              {formatCurrencyValue(
                                Number(selectedReadinessVariant.price_value || 0),
                                selectedReadinessVariant.price_currency ||
                                  selectedProduct.currency ||
                                  'USD'
                              )}{' '}
                              · Stock {selectedReadinessVariant.inventory_quantity ?? 0}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {selectedReadinessVariant.readiness_blocker_codes.map((code) => (
                                <span
                                  key={`blocker-${code}`}
                                  className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700"
                                >
                                  {formatReadinessCode(code)}
                                </span>
                              ))}
                              {selectedReadinessVariant.agent_push_reason_codes.map((code) => (
                                <span
                                  key={`push-${code}`}
                                  className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"
                                >
                                  Push: {formatReadinessCode(code)}
                                </span>
                              ))}
                              {selectedReadinessVariant.readiness_warning_codes.map((code) => (
                                <span
                                  key={`warning-${code}`}
                                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                                >
                                  Warning: {formatReadinessCode(code)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-amber-900">
                            {reviewReasonCode === 'missing_primary_image'
                              ? 'This batch is product-level. Review imagery for the whole product, then use the variant identifiers below only for cross-reference.'
                              : focusedReadinessVariants.length > 0
                                ? 'The variants matching this triage lane are highlighted below so you can review the whole batch without guessing.'
                                : 'Variant-level readiness labels are available below. Pick the highlighted variant to match the same blocker back to your source catalog.'}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-amber-900">
                        No readiness context is available for this product yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {selectedProduct.image_url || selectedProduct.images?.[0] ? (
                <img
                  src={selectedProduct.image_url || selectedProduct.images[0]}
                  alt={selectedProduct.title || selectedProduct.name}
                  className="h-64 w-full rounded-[1.5rem] object-cover"
                />
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.1rem] bg-white/70 p-4">
                  <div className="text-sm text-[color:var(--merchant-muted)]">SKU</div>
                  <div className="mt-1 text-[color:var(--merchant-ink)]">{selectedProduct.sku || 'N/A'}</div>
                </div>
                <div className="rounded-[1.1rem] bg-white/70 p-4">
                  <div className="text-sm text-[color:var(--merchant-muted)]">Platform product id</div>
                  <div className="mt-1 break-all text-[color:var(--merchant-ink)]">
                    {selectedProduct.platform_product_id || selectedProduct.product_id || 'N/A'}
                  </div>
                </div>
                <div className="rounded-[1.1rem] bg-white/70 p-4">
                  <div className="text-sm text-[color:var(--merchant-muted)]">Price</div>
                  <div className="mt-1 text-[color:var(--merchant-ink)]">
                    {formatCurrencyValue(selectedProduct.price || 0, selectedProduct.currency || 'USD')}
                  </div>
                </div>
                <div className="rounded-[1.1rem] bg-white/70 p-4">
                  <div className="text-sm text-[color:var(--merchant-muted)]">Stock</div>
                  <div className="mt-1 text-[color:var(--merchant-ink)]">
                    {selectedProduct.inventory_quantity ?? selectedProduct.stock ?? 0}
                  </div>
                </div>
                <div className="rounded-[1.1rem] bg-white/70 p-4">
                  <div className="text-sm text-[color:var(--merchant-muted)]">Channel status</div>
                  <div className="mt-2">
                    <StatusBadge tone={getProductStatusInfo(selectedProduct, t).tone}>
                      {getProductStatusInfo(selectedProduct, t).label}
                    </StatusBadge>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.1rem] bg-white/70 p-4">
                <div className="text-sm text-[color:var(--merchant-muted)]">Description</div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                  {selectedProduct.description || 'No description available'}
                </p>
              </div>

              {selectedProduct.variants && selectedProduct.variants.length > 0 ? (
                <div className="rounded-[1.1rem] bg-white/70 p-4">
                  <div className="text-sm text-[color:var(--merchant-muted)]">Variants</div>
                  <div className="mt-3 space-y-2">
                    {selectedProduct.variants.map((variant: any, index: number) => {
                        const variantIdentifier = String(variant.variant_id || variant.id || index);
                        const readinessVariant = readinessVariantMap.get(variantIdentifier);
                        const laneVariantState = laneVariantStateMap.get(variantIdentifier);
                        const isSelectedVariant =
                          Boolean(selectedVariantId) &&
                          (variant.variant_id === selectedVariantId ||
                            variant.id === selectedVariantId);
                        const isFocusedBatchVariant =
                          reviewSource === 'readiness' &&
                          reviewReasonCode !== 'missing_primary_image' &&
                          focusedReadinessVariantIds.has(variantIdentifier);
                        return (
                          <div
                            key={variantIdentifier}
                            id={`variant-row-${variantIdentifier}`}
                            className={`rounded-xl border px-4 py-3 ${
                              isSelectedVariant
                                ? 'border-amber-300 bg-amber-50'
                                : isFocusedBatchVariant
                                  ? 'border-blue-200 bg-blue-50/70'
                                : 'border-[color:var(--merchant-line)] bg-white/70'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-[color:var(--merchant-muted-strong)]">
                                  {variant.title}
                                </div>
                                <div className="mt-1 text-xs text-[color:var(--merchant-muted)]">
                                  SKU {variant.sku || 'N/A'} · Variant ID {variant.variant_id || variant.id || 'N/A'}
                                </div>
                                {reviewSource === 'readiness' && readinessVariant ? (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {isFocusedBatchVariant && laneVariantState ? (
                                      <span
                                        className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                                          laneVariantState.looksResolvedNow
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-slate-100 text-slate-700'
                                        }`}
                                      >
                                        {laneVariantState.looksResolvedNow
                                          ? getLaneResolvedLabel(reviewReasonCode)
                                          : getLanePendingLabel(reviewReasonCode)}
                                      </span>
                                    ) : null}
                                    {readinessVariant.readiness_blocker_codes.map((code) => (
                                      <span
                                        key={`${variantIdentifier}-blocker-${code}`}
                                        className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-medium text-rose-700"
                                      >
                                        {formatReadinessCode(code)}
                                      </span>
                                    ))}
                                    {readinessVariant.agent_push_reason_codes.map((code) => (
                                      <span
                                        key={`${variantIdentifier}-push-${code}`}
                                        className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800"
                                      >
                                        Push: {formatReadinessCode(code)}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <span className="text-sm font-medium text-[color:var(--merchant-ink)]">
                                {formatCurrencyValue(
                                  variant.price || 0,
                                  variant.currency || selectedProduct.currency || 'USD'
                                )}{' '}
                                · Stock {variant.inventory_quantity || 0}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-3">
                <MerchantButton type="button" variant="secondary" onClick={() => setShowViewModal(false)}>
                  Close
                </MerchantButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal && selectedProduct ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(30,24,18,0.45)] p-4 backdrop-blur-sm"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="merchant-panel w-full max-w-2xl p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-5">
              <div>
                <div className="merchant-overline">Catalog item</div>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--merchant-ink)]">
                  Edit item details
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-muted-strong)]">Product name</label>
                  <input
                    type="text"
                    defaultValue={selectedProduct.title || selectedProduct.name}
                    className="merchant-input"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-muted-strong)]">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={selectedProduct.price || 0}
                    className="merchant-input"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-muted-strong)]">Stock</label>
                  <input
                    type="number"
                    defaultValue={selectedProduct.inventory_quantity ?? selectedProduct.stock ?? 0}
                    className="merchant-input"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-muted-strong)]">Description</label>
                  <textarea
                    defaultValue={selectedProduct.description || ''}
                    rows={4}
                    className="merchant-textarea"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <MerchantButton
                  type="button"
                  onClick={() => {
                    alert('Catalog editing is not wired yet. Use your source system or channel integration to update product data.');
                    setShowEditModal(false);
                  }}
                >
                  Save changes
                </MerchantButton>
                <MerchantButton type="button" variant="secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </MerchantButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
