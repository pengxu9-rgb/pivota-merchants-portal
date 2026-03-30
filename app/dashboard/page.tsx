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
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
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
  quality_coverage?: {
    total_products?: number | null;
    snapshot_scored_products?: number | null;
    effective_scored_products?: number | null;
    preview_only_products?: number | null;
    unscored_products?: number | null;
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
  recentOrders: any[];
};

type Tone = 'brand' | 'success' | 'warning' | 'critical' | 'neutral';

function formatCurrency(language: string, amount: number, currency = 'USD') {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency,
  }).format(amount);
}

function formatProductPrice(
  language: string,
  amount?: number | null,
  currency?: string | null,
  fallbackLabel?: string
) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return fallbackLabel || 'Price unavailable';
  }

  try {
    return new Intl.NumberFormat(language, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || 'USD'}`;
  }
}

function formatRelativeTime(language: string, value?: string | null, fallbackLabel?: string) {
  if (!value) return fallbackLabel || 'Recent';

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return fallbackLabel || 'Recent';

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });

  if (diffMs < hour) {
    return formatter.format(-Math.max(1, Math.round(diffMs / minute)), 'minute');
  }

  if (diffMs < day) {
    return formatter.format(-Math.max(1, Math.round(diffMs / hour)), 'hour');
  }

  return formatter.format(-Math.max(1, Math.round(diffMs / day)), 'day');
}

export default function DashboardPage() {
  const { t, language } = useMerchantLanguage();
  const [readinessSummary, setReadinessSummary] = useState<ReadinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const [pspsLoading, setPspsLoading] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [merchantId, setMerchantId] = useState('');
  const loadSeqRef = useRef(0);

  const [stats, setStats] = useState<DashboardStats | null>(null);

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
      setStatsError(null);
      setReadinessError(null);
      setLoading(true);

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
      setStatsLoading(true);
      const statsPromise = apiClient.getAnalyticsDashboard().then((payload) => {
        if (payload?.error) {
          throw new Error(payload.error);
        }
        return payload;
      });
      const optimizationPromise = apiClient.getMerchantReadinessOptimization();

      void storesPromise
        .then((storesData) => {
          if (loadSeq !== loadSeqRef.current) return;
          setConnectedStores(Array.isArray(storesData) ? storesData : []);
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

      const [statsResult, optimizationResult] = await Promise.allSettled([
        statsPromise,
        optimizationPromise,
      ]);
      if (loadSeq !== loadSeqRef.current) return;

      if (optimizationResult.status !== 'fulfilled' || !optimizationResult.value) {
        setCatalogQuality(null);
        setOptimizationQueue([]);
        setReadinessSummary(null);
        setReadinessError(t('dashboard.overview.banner.degradedReadiness'));
      } else {
        const optimizationPayload = optimizationResult.value;
        const readiness = optimizationPayload.readiness_summary || null;
        const queue = Array.isArray(optimizationPayload.product_queue)
          ? optimizationPayload.product_queue
          : [];
        const qualityCoverage = optimizationPayload.quality_coverage || null;

        setOptimizationQueue(queue);
        setReadinessSummary(readiness);

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
          total_products:
            Number(qualityCoverage?.total_products) > 0
              ? Number(qualityCoverage?.total_products)
              : queue.length,
          scored_products:
            Number(qualityCoverage?.effective_scored_products) > 0
              ? Number(qualityCoverage?.effective_scored_products)
              : scoredProducts.length,
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
      }

      if (statsResult.status !== 'fulfilled' || !statsResult.value) {
        setRecentOrders([]);
        setStatsError(t('dashboard.overview.banner.degradedStats'));
      } else {
        const payload = statsResult.value;
        const recentOrdersData = Array.isArray(payload?.recent_orders)
          ? payload.recent_orders
          : Array.isArray(payload?.recentOrders)
            ? payload.recentOrders
            : [];

        setStats({
          totalOrders: Number(payload?.total_orders || 0),
          paidOrders:
            Number(payload?.order_breakdown?.paid) ||
            Number(payload?.paid_orders) ||
            Number(payload?.total_payments_succeeded) ||
            0,
          totalRevenue:
            Number(payload?.revenue_breakdown?.confirmed) ||
            Number(payload?.confirmed_revenue) ||
            Number(payload?.total_revenue) ||
            0,
          totalCustomers: Number(payload?.total_customers || 0),
          totalProducts: Number(payload?.total_products || 0),
          orderGrowth: Number(payload?.order_growth || 0),
          revenueGrowth:
            Number(payload?.confirmed_revenue_growth) ||
            Number(payload?.paid_revenue_growth) ||
            Number(payload?.revenue_growth) ||
            0,
          recentOrders: recentOrdersData,
        });
        setRecentOrders(recentOrdersData);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      if (loadSeq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
        setStatsLoading(false);
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
  const hasStatsData = Boolean(stats);
  const totalOrdersValue = stats?.totalOrders ?? 0;
  const paidOrdersValue = stats?.paidOrders ?? 0;
  const totalRevenueValue = stats?.totalRevenue ?? 0;
  const totalCustomersValue = stats?.totalCustomers ?? 0;
  const totalProductsValue = stats?.totalProducts ?? 0;
  const revenueGrowthValue = stats?.revenueGrowth ?? 0;
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
    t('dashboard.overview.common.readinessGaps');

  const heroTitle =
    blockedVariants > 0
      ? t('dashboard.overview.hero.title.blockedVariants', { count: blockedVariants })
      : qualityNeedsAttention > 0
        ? t('dashboard.overview.hero.title.contentUpdates', {
            count: qualityNeedsAttention,
          })
        : readyVariants > 0
          ? t('dashboard.overview.hero.title.readyVariants', { count: readyVariants })
          : t('dashboard.overview.hero.title.workspaceReady');

  const heroDescription =
    blockedVariants > 0
      ? t('dashboard.overview.hero.description.blockers')
      : qualityNeedsAttention > 0
        ? t('dashboard.overview.hero.description.content')
        : t('dashboard.overview.hero.description.default');

  const heroLead =
    blockedVariants > 0
      ? t('dashboard.overview.hero.lead.blocker', { label: blockerLabel })
      : qualityNeedsAttention > 0
        ? t('dashboard.overview.hero.lead.content', {
            count: qualityNeedsAttention,
          })
        : connectedStores.length === 0 || activePSPs.length === 0
          ? t('dashboard.overview.hero.lead.setup')
          : t('dashboard.overview.hero.lead.default');

  const heroFacts = [
    blockedVariants > 0
      ? {
          label: t('dashboard.overview.hero.fact.blockedVariants', {
            count: blockedVariants,
          }),
          tone: 'critical' as Tone,
          icon: AlertCircle,
        }
      : null,
    qualityNeedsAttention > 0
      ? {
          label: t('dashboard.overview.hero.fact.productsMissingDetails', {
            count: qualityNeedsAttention,
          }),
          tone: 'warning' as Tone,
          icon: Sparkles,
        }
      : null,
    readyVariants > 0
      ? {
          label: t('dashboard.overview.hero.fact.channelReadyVariants', {
            count: readyVariants,
          }),
          tone: 'success' as Tone,
          icon: CheckCircle2,
        }
      : null,
    connectedStores.length > 0
      ? {
          label: t('dashboard.overview.hero.fact.channelsConnected', {
            count: connectedStores.length,
          }),
          tone: 'brand' as Tone,
          icon: Store,
        }
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
      title: t('dashboard.overview.panels.catalogHealth.title'),
      tone: readinessTone,
      value:
        readinessSummary?.score != null
          ? `${readinessSummary.score}`
          : blockedVariants > 0
            ? `${blockedVariants}`
            : t('dashboard.overview.panels.catalogHealth.value.ready'),
      supporting:
        readinessSummary?.score != null
          ? t('dashboard.overview.panels.catalogHealth.supporting.score', {
              label: readinessSummary.label,
            })
          : blockedVariants > 0
            ? t('dashboard.overview.panels.catalogHealth.supporting.issue', {
                label: blockerLabel,
              })
            : t('dashboard.overview.panels.catalogHealth.supporting.noBlockers'),
      detail:
        blockedVariants > 0
          ? t('dashboard.overview.panels.catalogHealth.detail.blocked', {
              count: blockedVariants,
            })
          : averageContentScore != null
            ? t('dashboard.overview.panels.catalogHealth.detail.avgQuality', {
                score: averageContentScore,
              })
            : t('dashboard.overview.panels.catalogHealth.detail.assessing'),
      href: readinessHref,
      cta: t('dashboard.overview.panels.catalogHealth.cta'),
    },
    {
      title: t('dashboard.overview.panels.blockedVariants.title'),
      tone: blockedVariants > 0 ? 'critical' : 'success',
      value: `${blockedVariants}`,
      supporting:
        blockedVariants > 0
          ? blockerLabel
          : t('dashboard.overview.panels.blockedVariants.supporting.none'),
      detail:
        blockedVariants > 0
          ? t('dashboard.overview.panels.blockedVariants.detail.startBucket')
          : t('dashboard.overview.panels.blockedVariants.detail.none'),
      href: readinessHref,
      cta:
        blockedVariants > 0
          ? t('dashboard.overview.panels.blockedVariants.cta.resolve')
          : t('dashboard.overview.panels.blockedVariants.cta.view'),
    },
    {
      title: t('dashboard.overview.panels.contentQuality.title'),
      tone: qualityNeedsAttention > 0 ? 'warning' : 'success',
      value: `${qualityNeedsAttention}`,
      supporting:
        averageContentScore != null
          ? t('dashboard.overview.panels.contentQuality.supporting.avg', {
              score: averageContentScore,
            })
          : qualityLoading
            ? t('dashboard.overview.panels.contentQuality.supporting.refreshing')
            : t('dashboard.overview.panels.contentQuality.supporting.pending'),
      detail:
        qualityNeedsAttention > 0
          ? t('dashboard.overview.panels.contentQuality.detail.missing', {
              descriptions: missingDescriptionCount,
              images: missingImageCount,
            })
          : t('dashboard.overview.panels.contentQuality.detail.complete'),
      href: '/dashboard/products',
      cta: t('dashboard.overview.panels.contentQuality.cta'),
    },
    {
      title: t('dashboard.overview.panels.channelReadiness.title'),
      tone: connectedStores.length > 0 && activePSPs.length > 0 ? 'success' : 'warning',
      value: `${readyVariants || totalProductsValue}`,
      supporting: t('dashboard.overview.panels.channelReadiness.supporting', {
        channels: connectedStores.length,
        payments: activePSPs.length,
      }),
      detail:
        connectedStores.length === 0
          ? t('dashboard.overview.panels.channelReadiness.detail.connectChannel')
          : activePSPs.length === 0
            ? t('dashboard.overview.panels.channelReadiness.detail.addPayment')
            : t('dashboard.overview.panels.channelReadiness.detail.ready'),
      href: '/dashboard/integrations',
      cta: t('dashboard.overview.panels.channelReadiness.cta'),
    },
  ];

  const opportunityItems = [
    blockedVariants > 0
      ? {
          title: t('dashboard.overview.opportunities.unblock.title', {
            count: blockedVariants,
          }),
          detail: t('dashboard.overview.opportunities.unblock.detail', {
            label: blockerLabel,
          }),
          href: readinessHref,
          cta: t('dashboard.overview.opportunities.openCatalogHealth'),
        }
      : null,
    qualityNeedsAttention > 0
      ? {
          title: t('dashboard.overview.opportunities.improve.title', {
            count: qualityNeedsAttention,
          }),
          detail: t('dashboard.overview.opportunities.improve.detail'),
          href: readinessHref,
          cta: t('dashboard.overview.opportunities.openCatalogHealth'),
        }
      : null,
    connectedStores.length === 0 || activePSPs.length === 0
      ? {
          title: t('dashboard.overview.opportunities.completeSetup.title'),
          detail:
            connectedStores.length === 0
              ? t('dashboard.overview.opportunities.completeSetup.detail.channels')
              : t('dashboard.overview.opportunities.completeSetup.detail.payments'),
          href: '/dashboard/integrations',
          cta: t('dashboard.overview.opportunities.openSetup'),
        }
      : null,
    revenueGrowthValue > 0
      ? {
          title: t('dashboard.overview.opportunities.revenueUp.title', {
            percent: Math.abs(revenueGrowthValue),
          }),
          detail: t('dashboard.overview.opportunities.revenueUp.detail'),
          href: '/dashboard/analytics',
          cta: t('dashboard.overview.opportunities.viewAnalytics'),
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    detail: string;
    href: string;
    cta: string;
  }>;

  const recentActivity = recentOrders.slice(0, 4).map((order) => ({
    title:
      order?.order_number
        ? t('dashboard.overview.recentActivity.orderPrefix', {
            value: order.order_number,
          })
        : order?.order_id
          ? t('dashboard.overview.recentActivity.orderPrefix', {
              value: order.order_id,
            })
          : order?.customer_name ||
            order?.customer_email ||
            t('dashboard.overview.recentActivity.recentOrder'),
    detail: `${formatCurrency(
      language,
      Number(order?.total_amount ?? order?.total ?? order?.amount ?? 0)
    )} · ${
      order?.customer_name ||
      order?.customer_email ||
      order?.status ||
      t('dashboard.overview.recentActivity.orderActivity')
    }`,
    timestamp: formatRelativeTime(
      language,
      order?.created_at || order?.createdAt || order?.order_date || null,
      t('dashboard.overview.common.recent')
    ),
  }));

  const supportCards = [
    {
      title: t('dashboard.overview.support.ordersSnapshot.title'),
      icon: ShoppingBag,
      detail: hasStatsData
        ? t('dashboard.overview.support.ordersSnapshot.detail.available', {
            count: totalOrdersValue,
          })
        : t('dashboard.overview.support.ordersSnapshot.detail.unavailable'),
      meta: hasStatsData
        ? t('dashboard.overview.support.ordersSnapshot.meta.available', {
            paid: paidOrdersValue,
            revenue: formatCurrency(language, totalRevenueValue),
          })
        : t('dashboard.overview.support.ordersSnapshot.meta.unavailable'),
      href: '/dashboard/orders',
      cta: t('dashboard.overview.support.ordersSnapshot.cta'),
    },
    {
      title: t('dashboard.overview.support.salesChannels.title'),
      icon: Store,
      detail:
        storesLoading
          ? t('dashboard.overview.support.salesChannels.detail.refreshing')
          : connectedStores.length > 0
            ? connectedStores
                .slice(0, 2)
                .map((store) => store.store_name || store.domain || store.platform)
                .join(' · ')
            : t('dashboard.overview.support.salesChannels.detail.none'),
      meta:
        connectedStores.length > 0
          ? connectedStores.length === 1
            ? t('dashboard.overview.common.activeChannels.one', {
                count: connectedStores.length,
              })
            : t('dashboard.overview.common.activeChannels.other', {
                count: connectedStores.length,
              })
          : t('dashboard.overview.support.salesChannels.meta.none'),
      href: '/dashboard/integrations',
      cta:
        connectedStores.length > 0
          ? t('dashboard.overview.support.salesChannels.cta.manage')
          : t('dashboard.overview.support.salesChannels.cta.connect'),
    },
    {
      title: t('dashboard.overview.support.paymentSetup.title'),
      icon: CreditCard,
      detail:
        pspsLoading
          ? t('dashboard.overview.support.paymentSetup.detail.refreshing')
          : activePSPs.length > 0
            ? activePSPs.length === 1
              ? t('dashboard.overview.common.activePaymentSetups.one', {
                  count: activePSPs.length,
                })
              : t('dashboard.overview.common.activePaymentSetups.other', {
                  count: activePSPs.length,
                })
            : t('dashboard.overview.support.paymentSetup.detail.needsAttention'),
      meta:
        activePSPs.length > 0
          ? t('dashboard.overview.support.paymentSetup.meta.successRate', {
              rate: Math.round(
                activePSPs.reduce((sum, psp) => sum + Number(psp.success_rate || 0), 0) /
                  Math.max(activePSPs.length, 1)
              ),
            })
          : t('dashboard.overview.support.paymentSetup.meta.addSetup'),
      href: '/dashboard/integrations',
      cta:
        activePSPs.length > 0
          ? t('dashboard.overview.support.paymentSetup.cta.review')
          : t('dashboard.overview.support.paymentSetup.cta.connect'),
    },
  ];

  const businessSnapshot = [
    {
      label: t('dashboard.overview.snapshot.orders'),
      value: hasStatsData ? `${totalOrdersValue}` : '—',
      meta: hasStatsData
        ? t('dashboard.overview.snapshot.paid', { count: paidOrdersValue })
        : t('dashboard.overview.snapshot.unavailable'),
      icon: ShoppingBag,
    },
    {
      label: t('dashboard.overview.snapshot.revenue'),
      value: hasStatsData ? formatCurrency(language, totalRevenueValue) : '—',
      meta: hasStatsData
        ? t('dashboard.overview.snapshot.vsPrior30d', {
            percent: Math.abs(revenueGrowthValue),
          })
        : t('dashboard.overview.snapshot.unavailable'),
      icon: Sparkles,
    },
    {
      label: t('dashboard.overview.snapshot.customers'),
      value: hasStatsData ? `${totalCustomersValue}` : '—',
      meta: hasStatsData
        ? t('dashboard.overview.snapshot.productsInCatalog', {
            count: totalProductsValue,
          })
        : t('dashboard.overview.snapshot.unavailable'),
      icon: Users,
    },
    {
      label: t('dashboard.overview.snapshot.commerceSetup'),
      value:
        connectedStores.length === 1
          ? t('dashboard.overview.common.channelsCount.one', {
              count: connectedStores.length,
            })
          : t('dashboard.overview.common.channelsCount.other', {
              count: connectedStores.length,
            }),
      meta:
        connectedPSPs.length === 1
          ? t('dashboard.overview.common.paymentSetupsCount.one', {
              count: connectedPSPs.length,
            })
          : t('dashboard.overview.common.paymentSetupsCount.other', {
              count: connectedPSPs.length,
            }),
      icon: Store,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('dashboard.overview.eyebrow')}
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
              {refreshing
                ? t('dashboard.overview.refreshing')
                : t('dashboard.overview.refresh')}
            </MerchantButton>
            <MerchantLinkButton href={readinessHref} icon={Sparkles}>
              {t('dashboard.overview.reviewCatalogIssues')}
            </MerchantLinkButton>
          </>
        }
      />

      {(statsLoading || statsError || readinessError) && (
        <div className="merchant-panel px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm text-[color:var(--merchant-muted-strong)]">
              <Activity className={`h-4 w-4 ${statsLoading ? 'animate-pulse' : ''}`} />
              <span>
                {statsLoading
                  ? t('dashboard.overview.banner.refreshing')
                  : statsError && readinessError
                    ? t('dashboard.overview.banner.degradedAll')
                    : statsError
                      ? t('dashboard.overview.banner.degradedStats')
                      : t('dashboard.overview.banner.degradedReadiness')}
              </span>
            </div>
            {statsError || readinessError ? (
              <span className="text-sm text-[color:var(--merchant-muted)]">
                {[statsError, readinessError].filter(Boolean).join(' ')}
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
                    ? t('dashboard.overview.hero.blockersFirst')
                    : qualityNeedsAttention > 0
                      ? t('dashboard.overview.hero.contentNext')
                      : t('dashboard.overview.hero.readyToScale')}
                </StatusBadge>
                <StatusBadge tone="neutral">
                  {hasStatsData
                    ? t('dashboard.overview.hero.statsLast30d', {
                        count: totalOrdersValue,
                      })
                    : t('dashboard.overview.hero.statsUnavailable')}
                </StatusBadge>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-[color:var(--merchant-muted-strong)] sm:text-[15px]">
                {heroLead}
              </p>
              <div className="flex flex-wrap gap-3">
                <MerchantLinkButton href={readinessHref} icon={ArrowRight}>
                  {t('dashboard.overview.reviewCatalogIssues')}
                </MerchantLinkButton>
                <MerchantLinkButton href="/dashboard/products" variant="secondary" icon={Package}>
                  {t('dashboard.overview.openCatalog')}
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
          title={t('dashboard.overview.topOpportunities.title')}
          description={t('dashboard.overview.topOpportunities.description')}
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
                {t('dashboard.overview.topOpportunities.empty')}
              </div>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard
          title={t('dashboard.overview.recentActivity.title')}
          description={t('dashboard.overview.recentActivity.description')}
          action={
            <MerchantLinkButton href="/dashboard/orders" variant="ghost" icon={ArrowRight}>
              {t('dashboard.overview.recentActivity.openOrders')}
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
                {t('dashboard.overview.recentActivity.empty')}
              </div>
            )}
          </div>
        </SurfaceCard>
      </div>

      <SectionHeader
        title={t('dashboard.overview.operationalSupport.title')}
          description={t('dashboard.overview.operationalSupport.description')}
          action={
            <StatusBadge tone="neutral">
              {t('dashboard.overview.common.channelsAndPayments', {
                channels: connectedStores.length,
                payments: activePSPs.length,
              })}
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
          title={t('dashboard.overview.readinessFocus.title')}
          description={t('dashboard.overview.readinessFocus.description')}
          action={
            <MerchantLinkButton href={readinessHref} variant="ghost" icon={ArrowRight}>
              {t('dashboard.overview.readinessFocus.openDetails')}
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
                  <StatusBadge tone="warning">
                    {t('dashboard.overview.readinessFocus.affected', { count: blocker.count })}
                  </StatusBadge>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-[color:var(--merchant-muted)]">
                {t('dashboard.overview.readinessFocus.empty')}
              </p>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard
          title={t('dashboard.overview.catalogSpotlight.title')}
          description={t('dashboard.overview.catalogSpotlight.description')}
          action={
            <MerchantLinkButton href={readinessHref} variant="ghost" icon={ArrowRight}>
              {t('dashboard.overview.catalogSpotlight.openCatalogHealth')}
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
                      {product.title || t('dashboard.overview.product.untitled')}
                    </p>
                    <p className="text-sm text-[color:var(--merchant-muted)]">
                      {formatProductPrice(
                        language,
                        product.price_value,
                        product.price_currency,
                        t('dashboard.overview.common.priceUnavailable')
                      )}
                    </p>
                    <p className="text-sm text-[color:var(--merchant-muted-strong)]">
                      {product.top_issues?.[0]?.label ||
                        (product.blocked_variant_count > 0
                          ? t('dashboard.overview.common.blockedVariants', {
                              count: product.blocked_variant_count,
                            })
                          : t('dashboard.overview.product.readyForReview'))}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm:col-span-2 text-sm leading-6 text-[color:var(--merchant-muted)]">
                {qualityLoading
                  ? t('dashboard.overview.catalogSpotlight.loading')
                  : t('dashboard.overview.catalogSpotlight.empty')}
              </div>
            )}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
