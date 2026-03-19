'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Package,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  MerchantButton,
  MerchantLinkButton,
  PageHeader,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';

type ReadinessSummary = {
  tier: 'green' | 'yellow' | 'red';
  label: string;
  assessment_state: 'assessed' | 'not_assessed' | 'disabled';
  score?: number | null;
  ready_variant_count: number;
  blocked_variant_count: number;
  top_blockers?: string[];
  blocker_breakdown?: Array<{
    code: string;
    label: string;
    count: number;
  }>;
};

type ReadinessOptimizationPayload = {
  readiness_summary?: ReadinessSummary | null;
  dashboard_snapshot?: {
    total_orders?: number | null;
    paid_orders?: number | null;
    total_revenue?: number | null;
    total_customers?: number | null;
    total_products?: number | null;
    order_growth?: number | null;
    revenue_growth?: number | null;
  } | null;
  product_queue?: Array<{
    queue_item_id: string;
    title: string;
    image_url?: string | null;
    price_value?: number | null;
    price_currency?: string | null;
    blocked_variant_count: number;
    top_issues?: Array<{
      code: string;
      label: string;
    }>;
    content_quality_score?: number | null;
    model_readiness_score?: number | null;
  }>;
};

type DashboardStats = {
  totalOrders: number;
  paidOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  orderGrowth: number;
  revenueGrowth: number;
};

type Tone = 'brand' | 'success' | 'warning' | 'critical' | 'neutral';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatProductPrice(amount?: number | null, currency?: string | null) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'Price unavailable';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || 'USD'}`;
  }
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Recent';

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Recent';

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    return `${Math.max(1, Math.round(diffMs / minute))} min ago`;
  }

  if (diffMs < day) {
    return `${Math.max(1, Math.round(diffMs / hour))} hr ago`;
  }

  return `${Math.max(1, Math.round(diffMs / day))} day${diffMs >= 2 * day ? 's' : ''} ago`;
}

export default function DashboardPage() {
  const [readinessSummary, setReadinessSummary] = useState<ReadinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const [pspsLoading, setPspsLoading] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [merchantId, setMerchantId] = useState('');
  const loadSeqRef = useRef(0);

  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    paidOrders: 0,
    totalRevenue: 0,
    totalCustomers: 0,
    totalProducts: 0,
    orderGrowth: 0,
    revenueGrowth: 0,
  });

  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [connectedStores, setConnectedStores] = useState<any[]>([]);
  const [connectedPSPs, setConnectedPSPs] = useState<any[]>([]);
  const [optimizationQueue, setOptimizationQueue] = useState<
    NonNullable<ReadinessOptimizationPayload['product_queue']>
  >([]);
  const [catalogQuality, setCatalogQuality] = useState<{
    total_products: number;
    scored_products: number;
    avg_content_quality: number | null;
    avg_model_readiness: number | null;
    low_cq_threshold: number;
    low_cq_count: number;
  } | null>(null);

  useEffect(() => {
    const id = localStorage.getItem('merchant_id') || '';
    setMerchantId(id);
    void loadDashboardData(id);
  }, []);

  const loadDashboardData = async (currentMerchantId: string) => {
    const loadSeq = ++loadSeqRef.current;

    try {
      setAnalyticsError(null);
      setLoading(true);

      const ordersPromise = apiClient.getOrders({ limit: 10 }).catch((err) => {
        console.warn('Orders failed:', err);
        return { orders: [], total: 0, limit: 10, offset: 0 };
      });

      setStoresLoading(Boolean(currentMerchantId));
      const storesPromise = currentMerchantId
        ? apiClient.getConnectedStores(currentMerchantId).catch((err) => {
            console.warn('Stores failed:', err);
            return [];
          })
        : Promise.resolve([]);

      setPspsLoading(Boolean(currentMerchantId));
      const pspsPromise = currentMerchantId
        ? apiClient.getPSPs(currentMerchantId).catch((err) => {
            console.warn('PSPs failed:', err);
            return [];
          })
        : Promise.resolve([]);

      setQualityLoading(true);
      setAnalyticsLoading(true);
      const optimizationPromise = apiClient
        .getMerchantReadinessOptimization()
        .catch((err) => {
          console.warn('Readiness optimization failed:', err);
          return null;
        });

      void storesPromise
        .then((storesData) => {
          if (loadSeq !== loadSeqRef.current) return;
          setConnectedStores(Array.isArray(storesData) ? storesData : []);
          const storeProductCount = Array.isArray(storesData)
            ? storesData.reduce(
                (sum: number, store: any) => sum + (store.product_count || 0),
                0
              )
            : 0;
          setStats((prev) => ({
            ...prev,
            totalProducts: prev.totalProducts || storeProductCount,
          }));
        })
        .finally(() => {
          if (loadSeq !== loadSeqRef.current) return;
          setStoresLoading(false);
        });

      void pspsPromise
        .then((pspsData) => {
          if (loadSeq !== loadSeqRef.current) return;
          setConnectedPSPs(Array.isArray(pspsData) ? pspsData : []);
        })
        .finally(() => {
          if (loadSeq !== loadSeqRef.current) return;
          setPspsLoading(false);
        });

      const [ordersResponse, optimizationPayload] = await Promise.all([
        ordersPromise,
        optimizationPromise,
      ]);
      if (loadSeq !== loadSeqRef.current) return;

      const ordersData = ordersResponse?.orders || [];
      const ordersArray = Array.isArray(ordersData) ? ordersData : [];

      if (!optimizationPayload) {
        setCatalogQuality(null);
        setOptimizationQueue([]);
        setAnalyticsError('Overview metrics are temporarily unavailable.');
      } else {
        const readiness = optimizationPayload.readiness_summary || null;
        const queue = Array.isArray(optimizationPayload.product_queue)
          ? optimizationPayload.product_queue
          : [];
        const dashboardSnapshot = optimizationPayload.dashboard_snapshot || null;

        setOptimizationQueue(queue);

        if (readiness) {
          setReadinessSummary(readiness);
        }

        const scoredProducts = queue.filter(
          (item) =>
            typeof item.content_quality_score === 'number' ||
            typeof item.model_readiness_score === 'number'
        );
        const cqValues = scoredProducts
          .map((item) => item.content_quality_score)
          .filter((value): value is number => typeof value === 'number');
        const mrValues = scoredProducts
          .map((item) => item.model_readiness_score)
          .filter((value): value is number => typeof value === 'number');

        setCatalogQuality({
          total_products: queue.length,
          scored_products: scoredProducts.length,
          avg_content_quality:
            cqValues.length > 0
              ? cqValues.reduce((sum, value) => sum + value, 0) / cqValues.length
              : null,
          avg_model_readiness:
            mrValues.length > 0
              ? mrValues.reduce((sum, value) => sum + value, 0) / mrValues.length
              : null,
          low_cq_threshold: 60,
          low_cq_count: cqValues.filter((value) => value < 60).length,
        });

        if (dashboardSnapshot) {
          setStats((prev) => ({
            ...prev,
            totalOrders: dashboardSnapshot.total_orders ?? prev.totalOrders,
            paidOrders: dashboardSnapshot.paid_orders ?? prev.paidOrders,
            totalRevenue: dashboardSnapshot.total_revenue ?? prev.totalRevenue,
            totalCustomers: dashboardSnapshot.total_customers ?? prev.totalCustomers,
            totalProducts: dashboardSnapshot.total_products ?? prev.totalProducts,
            orderGrowth: dashboardSnapshot.order_growth ?? prev.orderGrowth,
            revenueGrowth: dashboardSnapshot.revenue_growth ?? prev.revenueGrowth,
          }));
        } else {
          setAnalyticsError('Overview metrics are temporarily unavailable.');
        }
      }

      const isRevenueEligibleOrder = (order: any) => {
        const paymentStatus = String(order?.payment_status ?? '').toLowerCase();
        const status = String(order?.status ?? '').toLowerCase();

        if (paymentStatus) {
          if (
            paymentStatus === 'paid' ||
            paymentStatus === 'succeeded' ||
            paymentStatus === 'success' ||
            paymentStatus === 'settled' ||
            paymentStatus === 'partially_refunded'
          ) {
            return true;
          }

          if (
            paymentStatus === 'pending' ||
            paymentStatus === 'unpaid' ||
            paymentStatus === 'failed' ||
            paymentStatus === 'canceled' ||
            paymentStatus === 'cancelled' ||
            paymentStatus === 'void' ||
            paymentStatus === 'refunded' ||
            paymentStatus === 'refund_pending'
          ) {
            return false;
          }
        }

        return status === 'completed' || status === 'fulfilled';
      };

      const totalCustomers = new Set(
        ordersArray.map((order: any) => order.customer_email).filter(Boolean)
      ).size;
      const totalRevenue = ordersArray.reduce(
        (sum: number, order: any) =>
          sum +
          (isRevenueEligibleOrder(order)
            ? Number(order.total_amount ?? order.total ?? order.amount ?? 0)
            : 0),
        0
      );

      if (!optimizationPayload?.dashboard_snapshot) {
        setStats((prev) => ({
          ...prev,
          totalOrders: ordersResponse?.total ?? ordersArray.length ?? 0,
          paidOrders: ordersArray.filter(isRevenueEligibleOrder).length,
          totalRevenue,
          totalCustomers,
          orderGrowth: 0,
          revenueGrowth: 0,
        }));
      }

      setRecentOrders(ordersArray);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      if (loadSeq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
        setAnalyticsLoading(false);
        setQualityLoading(false);
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    void loadDashboardData(merchantId);
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
    return mapping[code] || 'all';
  };

  const readinessFocusSource =
    readinessSummary?.top_blockers && readinessSummary.top_blockers.length > 0
      ? readinessSummary.top_blockers[0]
      : readinessSummary?.blocker_breakdown &&
          readinessSummary.blocker_breakdown.length > 0
        ? readinessSummary.blocker_breakdown[0].code
        : null;

  const readinessFocus = readinessFocusSource
    ? getIssueBucketCodeForReason(readinessFocusSource)
    : 'all';

  const readinessHref =
    readinessFocus && readinessFocus !== 'all'
      ? `/dashboard/product-optimization?source=readiness&focus=${encodeURIComponent(
          readinessFocus
        )}`
      : '/dashboard/product-optimization?source=readiness';

  const activePSPs = connectedPSPs.filter((psp) => psp?.is_active);
  const missingImageCount = optimizationQueue.filter(
    (product) =>
      product.top_issues?.some((issue) => issue.code === 'missing_primary_image') ||
      !product.image_url
  ).length;
  const missingDescriptionCount = optimizationQueue.filter((product) =>
    product.top_issues?.some((issue) => issue.code === 'missing_description')
  ).length;
  const spotlightProducts = optimizationQueue.slice(0, 4);

  const blockedVariants = readinessSummary?.blocked_variant_count || 0;
  const readyVariants = readinessSummary?.ready_variant_count || 0;
  const qualityNeedsAttention = Math.max(
    catalogQuality?.low_cq_count || 0,
    Math.max(missingImageCount, missingDescriptionCount)
  );
  const averageContentScore =
    catalogQuality?.avg_content_quality != null
      ? Math.round(catalogQuality.avg_content_quality)
      : null;

  const readinessTone: Tone =
    readinessSummary?.tier === 'green'
      ? 'success'
      : readinessSummary?.tier === 'yellow'
        ? 'warning'
        : blockedVariants > 0
          ? 'critical'
          : 'neutral';

  const blockerLabel =
    readinessSummary?.blocker_breakdown?.[0]?.label ||
    readinessSummary?.top_blockers?.[0]?.replace(/_/g, ' ') ||
    'Readiness gaps';

  const heroTitle =
    blockedVariants > 0
      ? `${blockedVariants} variants are blocking channel launch.`
      : qualityNeedsAttention > 0
        ? `${qualityNeedsAttention} products need content updates before they can go live.`
        : readyVariants > 0
          ? `${readyVariants} variants are ready to launch across your connected channels.`
          : 'Your merchant workspace is set up for the next launch cycle.';

  const heroDescription =
    blockedVariants > 0
      ? 'Clear blockers first, then move to content and channel setup.'
      : qualityNeedsAttention > 0
        ? 'Tighten content before the next launch or campaign push.'
        : 'Track readiness, sales, and setup from one merchant workspace.';

  const heroLead =
    blockedVariants > 0
      ? `${blockerLabel} is the clearest drag on launch readiness right now.`
      : qualityNeedsAttention > 0
        ? `${qualityNeedsAttention} products still need content before they feel launch-ready.`
        : connectedStores.length === 0 || activePSPs.length === 0
          ? 'Commerce setup is the next constraint for channel launch.'
          : 'Catalog and commerce setup are in a workable state.';

  const heroFacts = [
    blockedVariants > 0
      ? { label: `${blockedVariants} blocked variants`, tone: 'critical' as Tone, icon: AlertCircle }
      : null,
    qualityNeedsAttention > 0
      ? { label: `${qualityNeedsAttention} products missing details`, tone: 'warning' as Tone, icon: Sparkles }
      : null,
    readyVariants > 0
      ? { label: `${readyVariants} channel-ready variants`, tone: 'success' as Tone, icon: CheckCircle2 }
      : null,
    connectedStores.length > 0
      ? { label: `${connectedStores.length} sales channels connected`, tone: 'brand' as Tone, icon: Store }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    tone: Tone;
    icon: typeof AlertCircle;
  }>;

  const priorityPanels: Array<{
    title: string;
    tone: Tone;
    value: string;
    supporting: string;
    detail: string;
    href: string;
    cta: string;
  }> = [
    {
      title: 'Catalog health',
      tone: readinessTone,
      value:
        readinessSummary?.score != null
          ? `${readinessSummary.score}`
          : blockedVariants > 0
            ? `${blockedVariants}`
            : 'Ready',
      supporting:
        readinessSummary?.score != null
          ? `Readiness score · ${readinessSummary.label}`
          : blockedVariants > 0
            ? `${blockerLabel} is the biggest issue`
            : 'No major catalog blockers detected',
      detail:
        blockedVariants > 0
          ? `${blockedVariants} variants still need fixes before launch.`
          : averageContentScore != null
            ? `Average content quality ${averageContentScore}/100.`
            : 'Catalog health is being assessed.',
      href: readinessHref,
      cta: 'Review catalog health',
    },
    {
      title: 'Blocked variants',
      tone: blockedVariants > 0 ? 'critical' : 'success',
      value: `${blockedVariants}`,
      supporting: blockedVariants > 0 ? blockerLabel : 'No blocking readiness issues',
      detail:
        blockedVariants > 0
          ? 'Start with the biggest blocker bucket first.'
          : 'No blocking readiness issues in the latest snapshot.',
      href: readinessHref,
      cta: blockedVariants > 0 ? 'Resolve blocked variants' : 'View readiness details',
    },
    {
      title: 'Content quality',
      tone: qualityNeedsAttention > 0 ? 'warning' : 'success',
      value: `${qualityNeedsAttention}`,
      supporting:
        averageContentScore != null
          ? `Average quality score ${averageContentScore}/100`
          : qualityLoading
            ? 'Refreshing quality signals'
            : 'Quality score pending',
      detail:
        qualityNeedsAttention > 0
          ? `${missingDescriptionCount} descriptions missing · ${missingImageCount} images missing.`
          : 'Descriptions and imagery look complete.',
      href: '/dashboard/products',
      cta: 'Improve product content',
    },
    {
      title: 'Channel readiness',
      tone: connectedStores.length > 0 && activePSPs.length > 0 ? 'success' : 'warning',
      value: `${readyVariants || stats.totalProducts}`,
      supporting: `${connectedStores.length} channels · ${activePSPs.length} payment setups`,
      detail:
        connectedStores.length === 0
          ? 'Connect a sales channel first.'
          : activePSPs.length === 0
            ? 'Add payment setup to complete checkout.'
            : 'Setup is in place. Focus the team on products next.',
      href: '/dashboard/integrations',
      cta: 'Check channel readiness',
    },
  ];

  const opportunityItems = [
    blockedVariants > 0
      ? {
          title: `Unblock ${blockedVariants} variants`,
          detail: `${blockerLabel} is the clearest drag on channel launch right now.`,
          href: readinessHref,
          cta: 'Open catalog health',
        }
      : null,
    qualityNeedsAttention > 0
      ? {
          title: `Improve ${qualityNeedsAttention} products before the next push`,
          detail: 'Tightening descriptions and imagery will help products surface more confidently across channels.',
          href: readinessHref,
          cta: 'Open catalog health',
        }
      : null,
    connectedStores.length === 0 || activePSPs.length === 0
      ? {
          title: 'Complete commerce setup',
          detail:
            connectedStores.length === 0
              ? 'Add a storefront connection so catalog and orders can start syncing.'
              : 'Finish payment setup so ready products can move cleanly into checkout.',
          href: '/dashboard/integrations',
          cta: 'Open setup',
        }
      : null,
    stats.revenueGrowth > 0
      ? {
          title: `Revenue is up ${Math.abs(stats.revenueGrowth)}% vs the prior 30 days`,
          detail: 'Use the current momentum to prioritize content fixes on the products most likely to convert next.',
          href: '/dashboard/analytics',
          cta: 'View analytics',
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    detail: string;
    href: string;
    cta: string;
  }>;

  const recentActivity = recentOrders.slice(0, 4).map((order) => ({
    title: order?.order_number ? `Order ${order.order_number}` : order?.customer_email || 'Recent order',
    detail: `${formatCurrency(
      Number(order?.total_amount ?? order?.total ?? order?.amount ?? 0)
    )} · ${order?.customer_email || order?.status || 'Order activity'}`,
    timestamp: formatRelativeTime(
      order?.created_at || order?.createdAt || order?.order_date || null
    ),
  }));

  const supportCards = [
    {
      title: 'Orders snapshot',
      icon: ShoppingBag,
      detail: `${stats.totalOrders} orders in the last 30 days`,
      meta: `${stats.paidOrders} paid · ${formatCurrency(stats.totalRevenue)} confirmed revenue`,
      href: '/dashboard/orders',
      cta: 'Open orders',
    },
    {
      title: 'Sales channels',
      icon: Store,
      detail:
        storesLoading
          ? 'Refreshing channel connections'
          : connectedStores.length > 0
            ? connectedStores
                .slice(0, 2)
                .map((store) => store.store_name || store.domain || store.platform)
                .join(' · ')
            : 'No channels connected yet',
      meta:
        connectedStores.length > 0
          ? `${connectedStores.length} active channel${connectedStores.length === 1 ? '' : 's'}`
          : 'Connect Shopify or Wix to start syncing catalog and orders.',
      href: '/dashboard/integrations',
      cta: connectedStores.length > 0 ? 'Manage channels' : 'Connect channel',
    },
    {
      title: 'Payment setup',
      icon: CreditCard,
      detail:
        pspsLoading
          ? 'Refreshing payment setup'
          : activePSPs.length > 0
            ? `${activePSPs.length} payment setup${activePSPs.length === 1 ? '' : 's'} active`
            : 'Payment setup still needs attention',
      meta:
        activePSPs.length > 0
          ? `Avg success rate ${Math.round(
              activePSPs.reduce((sum, psp) => sum + Number(psp.success_rate || 0), 0) /
                Math.max(activePSPs.length, 1)
            )}%`
          : 'Add payment setup to turn ready products into completed orders.',
      href: '/dashboard/integrations',
      cta: activePSPs.length > 0 ? 'Review payment setup' : 'Connect payments',
    },
  ];

  const businessSnapshot = [
    {
      label: 'Orders (30d)',
      value: `${stats.totalOrders}`,
      meta: `${stats.paidOrders} paid`,
      icon: ShoppingBag,
    },
    {
      label: 'Paid revenue',
      value: formatCurrency(stats.totalRevenue),
      meta: `${Math.abs(stats.revenueGrowth)}% vs prior 30d`,
      icon: Sparkles,
    },
    {
      label: 'Customers',
      value: `${stats.totalCustomers}`,
      meta: `${stats.totalProducts} products in catalog`,
      icon: Users,
    },
    {
      label: 'Commerce setup',
      value: `${connectedStores.length} channels`,
      meta: `${connectedPSPs.length} payment setups`,
      icon: Store,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title={heroTitle}
        description={heroDescription}
        actions={
          <>
            <MerchantButton
              type="button"
              variant="ghost"
              onClick={handleRefresh}
              disabled={refreshing}
              icon={RefreshCw}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </MerchantButton>
            <MerchantLinkButton href={readinessHref} icon={Sparkles}>
              Review catalog issues
            </MerchantLinkButton>
          </>
        }
      />

      {(analyticsLoading || analyticsError) && (
        <div className="merchant-panel px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm text-[color:var(--merchant-muted-strong)]">
              <Activity className={`h-4 w-4 ${analyticsLoading ? 'animate-pulse' : ''}`} />
              <span>
                {analyticsLoading
                  ? 'Updating analytics in the background.'
                  : 'Analytics are temporarily unavailable. Overview is showing the latest partial data.'}
              </span>
            </div>
            {analyticsError ? (
              <span className="text-sm text-[color:var(--merchant-muted)]">
                {analyticsError}
              </span>
            ) : null}
          </div>
        </div>
      )}

      <SurfaceCard strong className="overflow-hidden">
        <div className="space-y-5 px-5 py-5 lg:px-6 lg:py-6">
          <div className="flex flex-wrap gap-2">
            {heroFacts.map((fact) => (
              <StatusBadge key={fact.label} tone={fact.tone} icon={fact.icon}>
                {fact.label}
              </StatusBadge>
            ))}
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={readinessTone}>
                  {blockedVariants > 0
                    ? 'Blockers first'
                    : qualityNeedsAttention > 0
                      ? 'Content next'
                      : 'Ready to scale'}
                </StatusBadge>
                <StatusBadge tone="neutral">
                  {stats.totalOrders} orders in the last 30d
                </StatusBadge>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-[color:var(--merchant-muted-strong)] sm:text-[15px]">
                {heroLead}
              </p>
              <div className="flex flex-wrap gap-3">
                <MerchantLinkButton href={readinessHref} icon={ArrowRight}>
                  Review catalog health
                </MerchantLinkButton>
                <MerchantLinkButton href="/dashboard/products" variant="secondary" icon={Package}>
                  Open catalog
                </MerchantLinkButton>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {businessSnapshot.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/72 px-4 py-3"
                >
                  <div className="flex items-center gap-2.5 text-xs text-[color:var(--merchant-muted)]">
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                  <div className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.04em] text-[color:var(--merchant-ink)]">
                    {loading ? '—' : item.value}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--merchant-muted-strong)]">
                    {item.meta}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SurfaceCard>

      <div className="grid gap-4 xl:grid-cols-4">
        {priorityPanels.map((panel) => (
          <div key={panel.title} className="merchant-panel p-5">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <StatusBadge tone={panel.tone}>{panel.title}</StatusBadge>
                <div className="text-right text-xs leading-5 text-[color:var(--merchant-muted)]">
                  {panel.supporting}
                </div>
              </div>
              <div>
                <div className="text-[2rem] font-semibold tracking-[-0.06em] text-[color:var(--merchant-ink)]">
                  {loading ? '—' : panel.value}
                </div>
                <p className="mt-1 text-sm leading-5 text-[color:var(--merchant-muted-strong)]">
                  {panel.detail}
                </p>
              </div>
              <MerchantLinkButton href={panel.href} variant="secondary" icon={ArrowRight} className="w-full">
                {panel.cta}
              </MerchantLinkButton>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SurfaceCard
          title="Top opportunities"
          description="Next merchant actions with the clearest near-term impact."
        >
          <div className="divide-y divide-[color:var(--merchant-line)]">
            {opportunityItems.length > 0 ? (
              opportunityItems.map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="space-y-2">
                    <p className="text-base font-medium text-[color:var(--merchant-ink)]">
                      {item.title}
                    </p>
                    <p className="text-sm leading-5 text-[color:var(--merchant-muted)]">
                      {item.detail}
                    </p>
                  </div>
                  <MerchantLinkButton href={item.href} variant="ghost" icon={ArrowRight}>
                    {item.cta}
                  </MerchantLinkButton>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-sm text-[color:var(--merchant-muted)]">
                Opportunities will appear here once the catalog and analytics snapshots have enough signal.
              </div>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard
          title="Recent activity"
          description="Recent order and merchant activity."
          action={
            <MerchantLinkButton href="/dashboard/orders" variant="ghost" icon={ArrowRight}>
              Open orders
            </MerchantLinkButton>
          }
        >
          <div className="divide-y divide-[color:var(--merchant-line)]">
            {recentActivity.length > 0 ? (
              recentActivity.map((item) => (
                <div key={`${item.title}-${item.timestamp}`} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div className="space-y-1.5">
                    <p className="text-base font-medium text-[color:var(--merchant-ink)]">
                      {item.title}
                    </p>
                    <p className="text-sm text-[color:var(--merchant-muted)]">{item.detail}</p>
                  </div>
                  <StatusBadge tone="neutral" icon={Clock}>
                    {item.timestamp}
                  </StatusBadge>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-sm text-[color:var(--merchant-muted)]">
                Recent activity will appear once new orders or merchant events sync into the portal.
              </div>
            )}
          </div>
        </SurfaceCard>
      </div>

      <SectionHeader
        title="Operational support"
        description="Keep channels and payments visible without letting infrastructure dominate the page."
        action={
          <StatusBadge tone="neutral">
            {connectedStores.length} channels · {activePSPs.length} payment setups
          </StatusBadge>
        }
      />
      <div className="grid gap-4 xl:grid-cols-3">
        {supportCards.map((card) => (
          <div key={card.title} className="merchant-panel p-5">
            <div className="space-y-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--merchant-surface-muted)] text-[color:var(--merchant-brand)]">
                <card.icon className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
                  {card.title}
                </p>
                <p className="text-sm font-medium text-[color:var(--merchant-muted-strong)]">
                  {card.detail}
                </p>
                <p className="text-sm leading-6 text-[color:var(--merchant-muted)]">
                  {card.meta}
                </p>
              </div>
              <MerchantLinkButton href={card.href} variant="secondary" icon={ArrowRight}>
                {card.cta}
              </MerchantLinkButton>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SurfaceCard
          title="Readiness focus"
          description="Current blocker buckets translated into next steps."
          action={
            <MerchantLinkButton href={readinessHref} variant="ghost" icon={ArrowRight}>
              Open details
            </MerchantLinkButton>
          }
        >
          <div className="space-y-3 px-5 py-5">
            {readinessSummary?.blocker_breakdown && readinessSummary.blocker_breakdown.length > 0 ? (
              readinessSummary.blocker_breakdown.slice(0, 4).map((blocker) => (
                <div
                  key={blocker.code}
                  className="flex items-center justify-between rounded-[1.15rem] border border-[color:var(--merchant-line)] bg-white/65 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-[color:var(--merchant-ink)]">
                      {blocker.label}
                    </p>
                  </div>
                  <StatusBadge tone="warning">{blocker.count} affected</StatusBadge>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-[color:var(--merchant-muted)]">
                Readiness details will appear after the next assessment cycle.
              </p>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard
          title="Catalog spotlight"
          description="The highest-priority catalog items currently shaping launch readiness and merchant perception."
          action={
            <MerchantLinkButton href={readinessHref} variant="ghost" icon={ArrowRight}>
              Open catalog health
            </MerchantLinkButton>
          }
        >
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            {spotlightProducts.length > 0 ? (
              spotlightProducts.map((product) => (
                <div
                  key={product.queue_item_id}
                  className="rounded-[1.25rem] border border-[color:var(--merchant-line)] bg-white/70 p-4"
                >
                  <div className="mb-4 flex h-28 items-center justify-center overflow-hidden rounded-[1rem] bg-[color:var(--merchant-surface-muted)]">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-8 w-8 text-[color:var(--merchant-muted)]" />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <p className="truncate font-medium text-[color:var(--merchant-ink)]">
                      {product.title || 'Untitled product'}
                    </p>
                    <p className="text-sm text-[color:var(--merchant-muted)]">
                      {formatProductPrice(product.price_value, product.price_currency)}
                    </p>
                    <p className="text-sm text-[color:var(--merchant-muted-strong)]">
                      {product.top_issues?.[0]?.label ||
                        (product.blocked_variant_count > 0
                          ? `${product.blocked_variant_count} blocked variants`
                          : 'Ready for review')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm:col-span-2 text-sm leading-6 text-[color:var(--merchant-muted)]">
                {qualityLoading
                  ? 'Refreshing catalog spotlight…'
                  : 'Once readiness generates a priority queue, Overview will surface the highest-impact catalog items here.'}
              </div>
            )}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
