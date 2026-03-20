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
    String(product?.description || product?.body_html || product?.summary || '').trim()
  );
  const hasImage = Boolean(
    product?.image_url || product?.image || product?.images?.[0] || product?.main_image_url
  );

  return !hasDescription || !hasImage;
}

function getProductStatusInfo(product: any): { label: string; tone: 'success' | 'warning' | 'neutral' | 'critical' } {
  const rawStatus = (product?.status ?? '').toString().toLowerCase();

  if (rawStatus === 'active') {
    if (!isProductSellable(product)) {
      return {
        label: 'Blocked',
        tone: 'warning',
      };
    }
    return {
      label: 'Channel-ready',
      tone: 'success',
    };
  }

  if (!rawStatus) {
    return {
      label: 'Draft',
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
    description:
      standard.description ||
      standard.description_text ||
      product?.description ||
      '',
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

  return false;
}

export default function ProductsPage() {
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
  const [productBlockerDetail, setProductBlockerDetail] = useState<ProductBlockerDetail | null>(
    null
  );
  const [productBlockerLoading, setProductBlockerLoading] = useState(false);
  const [productBlockerError, setProductBlockerError] = useState<string | null>(null);
  const deepLinkResolvedRef = useRef<string | null>(null);

  useEffect(() => {
    void loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  };

  const deepLinkPlatform = searchParams.get('platform');
  const deepLinkPlatformProductId = searchParams.get('platformProductId');
  const deepLinkVariantId = searchParams.get('variantId');
  const deepLinkModal = searchParams.get('modal');
  const deepLinkSource = searchParams.get('source');
  const deepLinkReasonCode = normalizeSourceDataReasonCode(
    searchParams.get('reasonCode')
  );

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
    ].join('|');
    if (deepLinkResolvedRef.current === deepLinkKey) {
      return;
    }

    let cancelled = false;

    const openDeepLinkedReview = async () => {
      const matchedProduct = products.find((product) => {
        const normalizedPlatform =
          String(product?.platform || '').toLowerCase() ===
          deepLinkPlatform.toLowerCase();
        const normalizedProductId =
          String(
            product?.platform_product_id ||
              product?.product_id ||
              product?.id ||
              ''
          ) === deepLinkPlatformProductId;
        return normalizedPlatform && normalizedProductId;
      });

      let normalizedProduct =
        matchedProduct && Array.isArray(matchedProduct.variants)
          ? normalizeProductForReview(matchedProduct)
          : null;

      if (!normalizedProduct) {
        try {
          const detail = await apiClient.getMerchantProductDetail(
            deepLinkPlatform,
            deepLinkPlatformProductId
          );
          normalizedProduct = normalizeProductForReview(detail);
        } catch (error) {
          console.error('Failed to resolve deep-linked product review', error);
          return;
        }
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
    deepLinkVariantId,
    loading,
    products,
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

  useEffect(() => {
    if (!showViewModal || !selectedProduct || reviewSource !== 'readiness') {
      setProductBlockerDetail(null);
      setProductBlockerError(null);
      setProductBlockerLoading(false);
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

    const loadReadinessContext = async (allowRetry = true) => {
      try {
        setProductBlockerLoading(true);
        setProductBlockerError(null);
        setProductBlockerDetail(null);

        const optimization = await apiClient.getMerchantReadinessOptimization();
        const planId = optimization?.plan?.plan_id;
        if (!planId) {
          throw new Error('Optimization plan unavailable.');
        }

        const detail = await apiClient.getMerchantProductBlockers(
          platform,
          platformProductId,
          planId
        );
        if (cancelled) return;
        setProductBlockerDetail(detail || null);
      } catch (error) {
        if (allowRetry && isPlanSupersededError(error)) {
          return await loadReadinessContext(false);
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

    void loadReadinessContext();

    return () => {
      cancelled = true;
    };
  }, [
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
  const focusedReadinessVariants =
    reviewReasonCode && productBlockerDetail
      ? productBlockerDetail.variants.filter((variant) =>
          readinessVariantMatchesReason(variant, reviewReasonCode)
        )
      : [];
  const focusedReadinessVariantIds = new Set(
    focusedReadinessVariants.map((variant) => String(variant.variant_id))
  );

  const heroTitle =
    blockedCount > 0
      ? `${blockedCount} catalog items still need work before they are channel-ready.`
      : contentGapCount > 0
        ? `${contentGapCount} products need content cleanup before the next launch window.`
        : 'Your catalog is in strong shape for channel launch.';

  const heroDescription =
    blockedCount > 0
      ? 'Review blocked variants, missing details, and low-inventory items from one merchant-facing catalog view.'
      : 'Use Catalog to keep product content, pricing, imagery, and sellability aligned before promotions go live.';

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="merchant-panel px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-brand)]"></div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[color:var(--merchant-ink)]">Refreshing catalog</p>
              <p className="text-sm text-[color:var(--merchant-muted)]">Pulling the latest synced products and content signals.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title={heroTitle}
        description={heroDescription}
        actions={
          <>
            <MerchantLinkButton href="/dashboard/product-optimization" variant="secondary" icon={Sparkles}>
              Review catalog health
            </MerchantLinkButton>
            <MerchantButton type="button" onClick={handleAddProduct} icon={Plus}>
              Add catalog item
            </MerchantButton>
          </>
        }
      />

      <SurfaceCard strong className="overflow-hidden">
        <div className="grid gap-3 px-5 py-5 lg:grid-cols-5 lg:px-6">
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/75 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">Catalog items</div>
            <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {products.length}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">Current synced assortment</div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/75 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">Channel-ready</div>
            <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {sellableCount}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">Ready to be merchandised</div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/75 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">Blocked items</div>
            <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {blockedCount}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">Need sellability or setup fixes</div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/75 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">Content gaps</div>
            <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {contentGapCount}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">Descriptions or imagery still missing</div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/75 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">Live inventory</div>
            <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {liveInventoryCount}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">Items with stock available now</div>
          </div>
        </div>
      </SurfaceCard>

      <SectionHeader
        title="Catalog view"
        description="Search, triage, and resolve the items most likely to affect launch readiness and channel performance."
        action={
          <StatusBadge tone="neutral">
            {filteredProducts.length} visible · {products.length} total
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
                placeholder="Search titles or SKU"
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
                <option value="all">All readiness states</option>
                <option value="sellable">Channel-ready only</option>
                <option value="not_sellable">Needs attention</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm text-[color:var(--merchant-muted-strong)] xl:justify-end">
              <StatusBadge tone={blockedCount > 0 ? 'warning' : 'success'}>
                {blockedCount > 0 ? `${blockedCount} blocked` : 'No blockers'}
              </StatusBadge>
              <StatusBadge tone={contentGapCount > 0 ? 'warning' : 'success'}>
                {contentGapCount > 0 ? `${contentGapCount} content gaps` : 'Content covered'}
              </StatusBadge>
            </div>
          </div>
        </div>

        {filteredProducts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="merchant-table min-w-full">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Channel status</th>
                  <th>Content</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const status = getProductStatusInfo(product);
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
                              {product.sku || 'No SKU'}
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
                              Needs content
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="success" icon={CheckCircle2}>
                              Complete
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
                            {stock > 0 ? 'In stock' : 'Out of stock'}
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
                            Review
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
                            Edit
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
            title="No catalog items match this view"
            description="Try a different search term, or connect a sales channel to bring products into Pivota."
            action={
              <MerchantLinkButton href="/dashboard/integrations" variant="secondary" icon={ArrowRight}>
                Open sales channels
              </MerchantLinkButton>
            }
          />
        )}
      </SurfaceCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="merchant-panel p-6">
          <div className="space-y-3">
            <StatusBadge tone={blockedCount > 0 ? 'critical' : 'success'} icon={AlertCircle}>
              Launch blockers
            </StatusBadge>
            <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {blockedCount > 0
                ? `${blockedCount} items are still not channel-ready.`
                : 'No major launch blockers in the current catalog snapshot.'}
            </p>
            <p className="text-sm leading-6 text-[color:var(--merchant-muted)]">
              Use catalog health to diagnose readiness issues before promotions or channel expansion.
            </p>
            <MerchantLinkButton href="/dashboard/product-optimization" variant="ghost" icon={ArrowRight}>
              Open catalog health
            </MerchantLinkButton>
          </div>
        </div>

        <div className="merchant-panel p-6">
          <div className="space-y-3">
            <StatusBadge tone={contentGapCount > 0 ? 'warning' : 'success'} icon={Sparkles}>
              Content quality
            </StatusBadge>
            <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {contentGapCount > 0
                ? `${contentGapCount} items still need descriptions or imagery.`
                : 'Core content fields are filled for the current catalog snapshot.'}
            </p>
            <p className="text-sm leading-6 text-[color:var(--merchant-muted)]">
              Better titles, descriptions, and imagery help products feel complete to channel and brand teams.
            </p>
          </div>
        </div>

        <div className="merchant-panel p-6">
          <div className="space-y-3">
            <StatusBadge tone="brand" icon={Package}>
              Inventory coverage
            </StatusBadge>
            <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {liveInventoryCount} items currently have available stock.
            </p>
            <p className="text-sm leading-6 text-[color:var(--merchant-muted)]">
              Stock gaps are often why otherwise healthy products still fail channel readiness checks.
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
                    <StatusBadge tone={getProductStatusInfo(selectedProduct).tone}>
                      {getProductStatusInfo(selectedProduct).label}
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
