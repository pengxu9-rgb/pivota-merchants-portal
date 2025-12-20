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

export default function DashboardPage() {
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
  
  // Dashboard data
  const [stats, setStats] = useState({
    totalOrders: 0,
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

  const loadDashboardData = async (merchantId: string) => {
    const loadSeq = ++loadSeqRef.current;
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

          setStats(prev => ({
            ...prev,
            totalOrders: analyticsData.total_orders ?? prev.totalOrders,
            totalRevenue: analyticsData.total_revenue ?? prev.totalRevenue,
            totalCustomers: analyticsData.total_customers ?? prev.totalCustomers,
            totalProducts: analyticsData.total_products ?? prev.totalProducts,
            orderGrowth: analyticsData.order_growth ?? prev.orderGrowth,
            revenueGrowth: analyticsData.revenue_growth ?? prev.revenueGrowth,
          }));

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
      const totalCustomers = new Set(ordersArray.map((o: any) => o.customer_email).filter(Boolean)).size;
      const totalRevenue = ordersArray.reduce(
        (sum: number, order: any) => sum + Number(order.total_amount ?? order.total ?? order.amount ?? 0),
        0
      );

      setStats(prev => ({
        ...prev,
        totalOrders: ordersResponse?.total ?? ordersArray.length ?? 0,
        totalRevenue,
        totalCustomers,
        orderGrowth: 0,
        revenueGrowth: 0,
      }));
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
                <span>{Math.abs(stats.orderGrowth)}%</span>
              </div>
            )}
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{loading ? '—' : stats.totalOrders}</h3>
          <p className="text-sm text-gray-600">Total Orders</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            {!analyticsLoading && (
              <div className={`flex items-center text-sm ${stats.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.revenueGrowth >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                <span>{Math.abs(stats.revenueGrowth)}%</span>
              </div>
            )}
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{loading ? '—' : formatCurrency(stats.totalRevenue)}</h3>
          <p className="text-sm text-gray-600">Total Revenue</p>
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
