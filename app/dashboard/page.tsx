'use client';

import { useEffect, useRef, useState } from 'react';
import {
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Users,
  Package,
  Store,
  CreditCard,
  Activity,
  RefreshCw,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type ReadinessSummary = {
  tier: 'green' | 'yellow' | 'red';
  label: string;
  assessment_state: 'assessed' | 'not_assessed' | 'disabled';
  score?: number | null;
  ready_variant_count: number;
  blocked_variant_count: number;
  top_blockers?: string[];
};

export default function DashboardPage() {
  const [readinessSummary, setReadinessSummary] = useState<ReadinessSummary | null>(null);
  const [loading, setLoading] = useState(true); // orders / skeleton loading
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const [pspsLoading, setPspsLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [merchantId, setMerchantId] = useState<string>('');
  const loadSeqRef = useRef(0);
  const periodOverrideRef = useRef<{
    loadSeq: number;
    totalOrders: number;
    paidOrders: number;
    orderGrowth: number;
    revenue: number;
    revenueGrowth: number;
  } | null>(null);
  
  // Dashboard data
  const [stats, setStats] = useState({
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
  const [products, setProducts] = useState<any[]>([]);
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
    console.log('🔍 Dashboard mounted, merchant_id from localStorage:', id);
    setMerchantId(id);
    if (!id) {
      console.warn('⚠️ No merchant_id found in localStorage!');
    }
    void loadDashboardData(id);
  }, []);

  useEffect(() => {
    const loadReadinessSummary = async () => {
      try {
        const response = await apiClient.get('/merchant/dashboard/readiness');
        const payload = response?.data?.data || response?.data || response;
        setReadinessSummary(payload || null);
      } catch (error) {
        console.warn('Readiness summary failed:', error);
      }
    };

    void loadReadinessSummary();
  }, []);

  const loadDashboardData = async (merchantId: string) => {
    const loadSeq = ++loadSeqRef.current;
    let analyticsSucceeded = false;
    periodOverrideRef.current = null;
    try {
      setAnalyticsError(null);
      setLoading(true);
      console.log('📊 Loading dashboard data for merchant:', merchantId);

      const ordersPromise = apiClient.getOrders({ limit: 10 }).catch(err => {
        console.warn('Orders failed:', err);
        return { orders: [], total: 0, limit: 10, offset: 0 };
      });

      setProductsLoading(true);
      const productsPromise = apiClient.getProducts().catch(err => {
        console.warn('Products failed (may need admin access):', err);
        return [];
      });

      setStoresLoading(Boolean(merchantId));
      const storesPromise = merchantId
        ? apiClient.getConnectedStores(merchantId).catch(err => {
            console.warn('Stores failed:', err);
            return [];
          })
        : Promise.resolve([]);

      setPspsLoading(Boolean(merchantId));
      const pspsPromise = merchantId
        ? apiClient.getPSPs(merchantId).catch(err => {
            console.warn('PSPs failed:', err);
            return [];
          })
        : Promise.resolve([]);

      setQualityLoading(true);
      const qualityPromise = apiClient.getCatalogQualitySummary().catch(err => {
        console.warn('Catalog quality summary failed:', err);
        return null;
      });

      // These are safe to be slow; they should never block rendering.
      void productsPromise
        .then(productsData => {
          if (loadSeq !== loadSeqRef.current) return;
          setProducts(Array.isArray(productsData) ? productsData.slice(0, 5) : []);
          setStats(prev => ({
            ...prev,
            totalProducts: prev.totalProducts || (Array.isArray(productsData) ? productsData.length : 0),
          }));
        })
        .finally(() => {
          if (loadSeq !== loadSeqRef.current) return;
          setProductsLoading(false);
        });

      void storesPromise
        .then(storesData => {
          if (loadSeq !== loadSeqRef.current) return;
          setConnectedStores(Array.isArray(storesData) ? storesData : []);
          const storeProductCount = Array.isArray(storesData)
            ? storesData.reduce((sum: number, store: any) => sum + (store.product_count || 0), 0)
            : 0;
          setStats(prev => ({
            ...prev,
            totalProducts: prev.totalProducts || storeProductCount,
          }));
        })
        .finally(() => {
          if (loadSeq !== loadSeqRef.current) return;
          setStoresLoading(false);
        });

      void pspsPromise
        .then(pspsData => {
          if (loadSeq !== loadSeqRef.current) return;
          setConnectedPSPs(Array.isArray(pspsData) ? pspsData : []);
        })
        .finally(() => {
          if (loadSeq !== loadSeqRef.current) return;
          setPspsLoading(false);
        });

      void qualityPromise
        .then(qualitySummary => {
          if (loadSeq !== loadSeqRef.current) return;
          if (qualitySummary) {
            setCatalogQuality({
              total_products: qualitySummary.total_products || 0,
              scored_products: qualitySummary.scored_products || 0,
              avg_content_quality: qualitySummary.avg_content_quality ?? null,
              avg_model_readiness: qualitySummary.avg_model_readiness ?? null,
              low_cq_threshold: qualitySummary.low_cq_threshold ?? 60,
              low_cq_count: qualitySummary.low_cq_count || 0,
            });
          } else {
            setCatalogQuality(null);
          }
        })
        .finally(() => {
          if (loadSeq !== loadSeqRef.current) return;
          setQualityLoading(false);
        });

      setAnalyticsLoading(true);
      void apiClient
        .getAnalyticsDashboard('30d')
        .then(analyticsData => {
          if (loadSeq !== loadSeqRef.current) return;
          if (!analyticsData) return;
          analyticsSucceeded = true;

          const analyticsTotalOrders =
            analyticsData?.total_orders_placed ??
            analyticsData?.total_orders ??
            analyticsData?.orders?.total ??
            analyticsData?.order_breakdown?.total ??
            analyticsData?.total_order_attempts ??
            null;

          const analyticsPaidOrders =
            analyticsData?.total_payments_succeeded ??
            analyticsData?.total_transactions ??
            analyticsData?.orders?.paid ??
            analyticsData?.order_breakdown?.paid ??
            analyticsData?.total_paid_orders ??
            null;

          const analyticsPaidRevenue =
            analyticsData?.revenue_breakdown?.confirmed ??
            analyticsData?.revenue_breakdown?.paid ??
            analyticsData?.confirmed_revenue ??
            analyticsData?.paid_revenue ??
            analyticsData?.total_paid_revenue ??
            analyticsData?.net_revenue ??
            null;

          const analyticsPaidRevenueGrowth =
            analyticsData?.confirmed_revenue_growth ??
            analyticsData?.paid_revenue_growth ??
            analyticsData?.net_revenue_growth ??
            null;

          const override = periodOverrideRef.current;

          setStats(prev => ({
            ...prev,
            totalOrders: override?.loadSeq === loadSeq ? override.totalOrders : analyticsTotalOrders ?? prev.totalOrders,
            paidOrders: override?.loadSeq === loadSeq ? override.paidOrders : analyticsPaidOrders ?? prev.paidOrders,
            totalRevenue:
              override?.loadSeq === loadSeq
                ? override.revenue
                : analyticsPaidRevenue ?? analyticsData.total_revenue ?? prev.totalRevenue,
            totalCustomers: analyticsData.total_customers ?? prev.totalCustomers,
            totalProducts: analyticsData.total_products ?? prev.totalProducts,
            orderGrowth: override?.loadSeq === loadSeq ? override.orderGrowth : analyticsData.order_growth ?? prev.orderGrowth,
            revenueGrowth:
              override?.loadSeq === loadSeq
                ? override.revenueGrowth
                : analyticsPaidRevenueGrowth ?? analyticsData.revenue_growth ?? prev.revenueGrowth,
          }));
          if (analyticsData.readiness_summary) {
            setReadinessSummary(analyticsData.readiness_summary);
          }

          if (analyticsData.recent_orders && analyticsData.recent_orders.length > 0) {
            setRecentOrders(analyticsData.recent_orders);
          }
        })
        .catch(err => {
          if (loadSeq !== loadSeqRef.current) return;
          console.warn('Analytics failed:', err);
          setAnalyticsError(err?.message || 'Analytics failed');
        })
        .finally(() => {
          if (loadSeq !== loadSeqRef.current) return;
          setAnalyticsLoading(false);
        });

      // Only await orders to remove the initial skeleton.
      const ordersResponse = await ordersPromise;
      if (loadSeq !== loadSeqRef.current) return;

      const ordersData = ordersResponse?.orders || [];
      const ordersArray = Array.isArray(ordersData) ? ordersData : [];

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

      const totalCustomers = new Set(ordersArray.map((o: any) => o.customer_email).filter(Boolean)).size;
      const totalRevenue = ordersArray.reduce(
        (sum: number, order: any) =>
          sum + (isRevenueEligibleOrder(order) ? Number(order.total_amount ?? order.total ?? order.amount ?? 0) : 0),
        0
      );

      const getOrderCreatedAtMs = (order: any) => {
        const raw =
          order?.created_at ??
          order?.createdAt ??
          order?.created ??
          order?.order_created_at ??
          order?.order_date ??
          null;
        if (!raw) return null;
        const ms = new Date(raw).getTime();
        return Number.isFinite(ms) ? ms : null;
      };

      const getOrderAmount = (order: any) => {
        const raw = order?.total_amount ?? order?.total ?? order?.amount ?? 0;
        const amount = Number(raw);
        return Number.isFinite(amount) ? amount : 0;
      };

      const computePaidPeriodStatsFromOrders = async () => {
        try {
          const nowMs = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const currentStartMs = nowMs - 30 * dayMs;
          const prevStartMs = nowMs - 60 * dayMs;

          const pageSize = 200;
          const maxOrders = 5000;

          let offset = 0;
          let fetched = 0;
          let currentRevenue = 0;
          let prevRevenue = 0;
          let currentOrders = 0;
          let prevOrders = 0;
          let currentPaidOrders = 0;
          let prevPaidOrders = 0;

          while (true) {
            const page = await apiClient.getOrders({ limit: pageSize, offset });
            if (loadSeq !== loadSeqRef.current) return;

            const pageOrders = Array.isArray(page?.orders) ? page.orders : [];
            if (!pageOrders.length) break;

            for (const order of pageOrders) {
              const createdAtMs = getOrderCreatedAtMs(order);
              if (createdAtMs == null || createdAtMs < prevStartMs) continue;

              const isCurrent = createdAtMs >= currentStartMs;
              if (isCurrent) currentOrders += 1;
              else prevOrders += 1;

              const isPaid = isRevenueEligibleOrder(order);
              const amount = getOrderAmount(order);

              if (isPaid) {
                if (isCurrent) {
                  currentPaidOrders += 1;
                  currentRevenue += amount;
                } else {
                  prevPaidOrders += 1;
                  prevRevenue += amount;
                }
              }
            }

            offset += pageOrders.length;
            fetched += pageOrders.length;

            const pageTotal = typeof page?.total === 'number' ? page.total : null;
            if (pageTotal != null && offset >= pageTotal) break;
            if (fetched >= maxOrders) break;

            const lastOrder = pageOrders[pageOrders.length - 1];
            const lastCreatedAtMs = getOrderCreatedAtMs(lastOrder);
            if (lastCreatedAtMs != null && lastCreatedAtMs < prevStartMs) break;
          }

          const revenueGrowth =
            prevRevenue > 0 ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100) : currentRevenue > 0 ? 100 : 0;

          const orderGrowth =
            prevOrders > 0 ? Math.round(((currentOrders - prevOrders) / prevOrders) * 100) : currentOrders > 0 ? 100 : 0;

          periodOverrideRef.current = {
            loadSeq,
            totalOrders: currentOrders,
            paidOrders: currentPaidOrders,
            orderGrowth,
            revenue: currentRevenue,
            revenueGrowth,
          };

          setStats(prev => ({
            ...prev,
            totalOrders: currentOrders,
            paidOrders: currentPaidOrders,
            totalRevenue: currentRevenue,
            orderGrowth,
            revenueGrowth,
          }));
        } catch (err) {
          if (loadSeq !== loadSeqRef.current) return;
          console.warn('Paid period stats computation failed:', err);
        }
      };

      void computePaidPeriodStatsFromOrders();

      if (!analyticsSucceeded) {
        setStats(prev => ({
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
      console.error('❌ Failed to load dashboard data:', error);
    } finally {
      if (loadSeq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    void loadDashboardData(merchantId);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

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
    return mapping[code] || 'all';
  };

  const readinessFocus =
    readinessSummary?.top_blockers && readinessSummary.top_blockers.length > 0
      ? getIssueBucketCodeForReason(readinessSummary.top_blockers[0])
      : 'all';

  const readinessHref =
    readinessFocus && readinessFocus !== 'all'
      ? `/dashboard/product-optimization?source=readiness&focus=${encodeURIComponent(
          readinessFocus
        )}`
      : '/dashboard/product-optimization?source=readiness';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's your store overview.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Connected Services Alert */}
      {!loading && !storesLoading && connectedStores.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>⚠️ No stores connected</strong> - Connect your Shopify or Wix store to start syncing products and orders.{' '}
            <a href="/dashboard/integrations" className="underline font-medium">
              Connect Store →
            </a>
          </p>
        </div>
      )}

      {(analyticsLoading || analyticsError) && (
        <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-2 text-sm">
          <div className="flex items-center gap-2 text-gray-700">
            <Activity className={`h-4 w-4 ${analyticsLoading ? 'animate-pulse' : ''}`} />
            <span>
              {analyticsLoading ? 'Updating analytics…' : 'Analytics unavailable (showing partial data)'}
            </span>
          </div>
          {analyticsError && <span className="text-gray-500">{analyticsError}</span>}
        </div>
      )}

      {readinessSummary && (
        <div className={`rounded-2xl border px-5 py-4 ${getReadinessTone(readinessSummary.tier).card}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <span className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold ${getReadinessTone(readinessSummary.tier).badge}`}>
                {readinessSummary.label}
              </span>
              <span className="text-sm font-medium text-slate-900">
                LLM readiness score {readinessSummary.score ?? '—'}
              </span>
              <span className="text-sm text-slate-600">
                {readinessSummary.ready_variant_count} ready / {readinessSummary.blocked_variant_count} blocked variants
              </span>
            </div>
            <a
              href={readinessHref}
              title="Open your optimization plan and start with the highest-priority issue."
              className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-2.5 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Optimize now
            </a>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ShoppingBag className="w-6 h-6 text-blue-600" />
            </div>
            {!analyticsLoading && (
              <div className={`flex items-center text-sm ${stats.orderGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.orderGrowth >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                <span className="whitespace-nowrap">
                  {Math.abs(stats.orderGrowth)}% <span className="text-xs text-gray-500">vs prev 30d</span>
                </span>
              </div>
            )}
	          </div>
	          <h3 className="text-2xl font-bold text-gray-900">{loading ? '—' : stats.totalOrders}</h3>
	          <p className="text-sm text-gray-600">Orders (30d)</p>
	          {!loading && (
	            <p className="text-xs text-gray-500 mt-1">
	              {stats.paidOrders} paid • {stats.totalOrders > 0 ? Math.round((stats.paidOrders / stats.totalOrders) * 100) : 0}
	              % success
	            </p>
	          )}
	        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            {!analyticsLoading && (
              <div className={`flex items-center text-sm ${stats.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.revenueGrowth >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                <span className="whitespace-nowrap">
                  {Math.abs(stats.revenueGrowth)}% <span className="text-xs text-gray-500">vs prev 30d</span>
                </span>
              </div>
            )}
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{loading ? '—' : formatCurrency(stats.totalRevenue)}</h3>
          <p className="text-sm text-gray-600">Paid Revenue (30d)</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{loading ? '—' : stats.totalCustomers}</h3>
          <p className="text-sm text-gray-600">Customers</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Package className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">
            {loading || storesLoading || productsLoading ? '—' : stats.totalProducts}
          </h3>
          <p className="text-sm text-gray-600">Products</p>
        </div>
      </div>

      {/* Connected Services + Catalog Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connected Stores */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Connected Stores</h2>
          </div>
          <div className="p-6">
            {storesLoading ? (
              <p className="text-sm text-gray-500">Loading stores…</p>
            ) : connectedStores.length > 0 ? (
              <div className="space-y-3">
                {connectedStores.map((store, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Store className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-gray-900">{store.store_name || store.domain}</p>
                        <p className="text-sm text-gray-600 capitalize">{store.platform}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        Active
                      </span>
                      <span className="text-sm text-gray-600">
                        {store.product_count || 0} products
                      </span>
                    </div>
                  </div>
                ))}
                <a
                  href="/dashboard/integrations"
                  className="block text-center py-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  Manage Stores →
                </a>
              </div>
            ) : (
              <div className="text-center py-8">
                <Store className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-4">No stores connected</p>
                <a
                  href="/dashboard/integrations"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Connect Store
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Connected PSPs */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Payment Processors</h2>
          </div>
          <div className="p-6">
            {pspsLoading ? (
              <p className="text-sm text-gray-500">Loading payment processors…</p>
            ) : connectedPSPs.length > 0 ? (
              <div className="space-y-3">
                {connectedPSPs.filter(psp => psp.is_active).map((psp, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <CreditCard className="w-5 h-5 text-purple-600" />
                      <div>
                        <p className="font-medium text-gray-900">{psp.name}</p>
                        <p className="text-sm text-gray-600">Success: {psp.success_rate || 0}%</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        Active
                      </span>
                    </div>
                  </div>
                ))}
                <a
                  href="/dashboard/integrations"
                  className="block text-center py-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  Manage PSPs →
                </a>
              </div>
            ) : (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-4">No PSPs connected</p>
                <a
                  href="/dashboard/integrations"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Connect PSP
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Catalog Quality */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Catalog Quality</h2>
            <a
              href="/dashboard/product-optimization"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Improve products →
            </a>
          </div>
          <div className="p-6">
            {qualityLoading ? (
              <p className="text-sm text-gray-500">Loading quality summary…</p>
            ) : catalogQuality ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Products scored</span>
                  <span className="font-medium text-gray-900">
                    {catalogQuality.scored_products}/{catalogQuality.total_products}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Avg Content Quality</span>
                  <span className="font-medium text-blue-700">
                    {catalogQuality.avg_content_quality != null
                      ? catalogQuality.avg_content_quality.toFixed(1)
                      : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Avg Model Readiness</span>
                  <span className="font-medium text-emerald-700">
                    {catalogQuality.avg_model_readiness != null
                      ? catalogQuality.avg_model_readiness.toFixed(1)
                      : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">
                    Low CQ (&lt; {catalogQuality.low_cq_threshold})
                  </span>
                  <span className="font-medium text-amber-700">
                    {catalogQuality.low_cq_count}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No quality data yet. Use Product Optimization to score your catalog.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
          <a href="/dashboard/orders" className="text-sm text-blue-600 hover:text-blue-800">
            View All →
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Loading orders…
                  </td>
                </tr>
              ) : recentOrders.length > 0 ? (
                recentOrders.slice(0, 5).map((order) => (
                  <tr key={order.id || order.order_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order.order_id || order.order_number || order.id || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {order.customer_email || order.customer_name || 'Guest'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatCurrency(order.total || order.total_amount || order.amount || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        order.payment_status === 'paid' || order.status === 'completed' ? 'bg-green-100 text-green-800' :
                        order.payment_status === 'pending' || order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.payment_status || order.status || 'pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No orders yet. Orders will appear here once customers start purchasing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Products */}
      {products.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Top Products</h2>
            <a href="/dashboard/products" className="text-sm text-blue-600 hover:text-blue-800">
              View All →
            </a>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {products.map((product) => (
                <div key={product.id || product.product_id} className="text-center">
                  <div className="w-full h-20 bg-gray-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                    {product.image_url || product.image ? (
                      <img 
                        src={product.image_url || product.image} 
                        alt={product.name || product.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-gray-400" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{product.name || product.title || 'No name'}</p>
                  <p className="text-sm text-gray-600">{formatCurrency(product.price || product.price_amount || 0)}</p>
                  <p className="text-xs text-gray-500">Stock: {product.stock || product.inventory_quantity || 0}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
