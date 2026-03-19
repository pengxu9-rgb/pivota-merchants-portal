'use client';

import { useEffect, useState } from 'react';
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

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sellableFilter, setSellableFilter] = useState<'all' | 'sellable' | 'not_sellable'>('all');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

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
                        {formatCurrency(product.price || 0)}
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
                              setSelectedProduct(product);
                              setShowViewModal(true);
                            }}
                          >
                            Review
                          </MerchantButton>
                          <MerchantButton
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setSelectedProduct(product);
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
                  <div className="text-sm text-[color:var(--merchant-muted)]">Price</div>
                  <div className="mt-1 text-[color:var(--merchant-ink)]">{formatCurrency(selectedProduct.price || 0)}</div>
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
                    {selectedProduct.variants.map((variant: any, index: number) => (
                      <div key={index} className="flex items-center justify-between rounded-xl border border-[color:var(--merchant-line)] bg-white/70 px-4 py-3">
                        <span className="text-sm text-[color:var(--merchant-muted-strong)]">{variant.title}</span>
                        <span className="text-sm font-medium text-[color:var(--merchant-ink)]">
                          {formatCurrency(variant.price)} · Stock {variant.inventory_quantity || 0}
                        </span>
                      </div>
                    ))}
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
