'use client';

import { useState, useEffect, useRef } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d');
  const [analytics, setAnalytics] = useState<any>(null);
  const [metric, setMetric] = useState<'gmv' | 'orders' | 'aov' | 'success_rate' | 'refunds'>('gmv');
  const [trends, setTrends] = useState<any>(null);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [netMode, setNetMode] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const revenueComputeSeqRef = useRef(0);
  const [paidRevenueOverride, setPaidRevenueOverride] = useState<{
    revenue: number;
    growth: number;
  } | null>(null);
  const [paidRevenueOverrideLoading, setPaidRevenueOverrideLoading] = useState(false);

  useEffect(() => {
    loadAnalytics();
    loadTrends();
  }, [timeRange, metric, netMode]);

  useEffect(() => {
    const seq = ++revenueComputeSeqRef.current;
    setPaidRevenueOverrideLoading(true);
    setPaidRevenueOverride(null);

    const getRangeDays = (range: string) => {
      if (range === '1d') return 1;
      if (range === '7d') return 7;
      if (range === '30d') return 30;
      if (range === '90d') return 90;
      return 30;
    };

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

    const computePaidRevenueFromOrders = async () => {
      try {
        const rangeDays = getRangeDays(timeRange);
        const nowMs = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        const currentStartMs = nowMs - rangeDays * dayMs;
        const prevStartMs = nowMs - rangeDays * 2 * dayMs;

        const pageSize = 100;
        const maxOrders = 20000;

        let offset = 0;
        let fetched = 0;
        let currentRevenue = 0;
        let prevRevenue = 0;
        let coveredPrevPeriod = false;

        while (true) {
          const page = await apiClient.getOrders({ limit: pageSize, offset });
          if (seq !== revenueComputeSeqRef.current) return;

          const pageOrders = Array.isArray(page?.orders) ? page.orders : [];
          if (!pageOrders.length) {
            coveredPrevPeriod = true;
            break;
          }

          for (const order of pageOrders) {
            const createdAtMs = getOrderCreatedAtMs(order);
            if (createdAtMs == null || createdAtMs < prevStartMs) continue;

            if (!isRevenueEligibleOrder(order)) continue;

            const amount = getOrderAmount(order);
            if (createdAtMs >= currentStartMs) currentRevenue += amount;
            else prevRevenue += amount;
          }

          offset += pageOrders.length;
          fetched += pageOrders.length;

          const pageTotal = typeof page?.total === 'number' ? page.total : null;
          if (pageTotal != null && offset >= pageTotal) {
            coveredPrevPeriod = true;
            break;
          }

          const lastOrder = pageOrders[pageOrders.length - 1];
          const lastCreatedAtMs = getOrderCreatedAtMs(lastOrder);
          if (lastCreatedAtMs != null && lastCreatedAtMs < prevStartMs) {
            coveredPrevPeriod = true;
            break;
          }

          if (fetched >= maxOrders) break;
        }

        if (!coveredPrevPeriod) {
          console.warn(`Paid revenue override skipped: reached maxOrders=${maxOrders} before covering prev period`);
          return;
        }

        const growth =
          prevRevenue > 0 ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100) : currentRevenue > 0 ? 100 : 0;

        if (seq !== revenueComputeSeqRef.current) return;
        setPaidRevenueOverride({ revenue: currentRevenue, growth });
      } catch (e) {
        if (seq !== revenueComputeSeqRef.current) return;
        console.warn('Paid revenue override failed:', e);
      } finally {
        if (seq !== revenueComputeSeqRef.current) return;
        setPaidRevenueOverrideLoading(false);
      }
    };

    void computePaidRevenueFromOrders();
  }, [timeRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getAnalyticsDashboard(timeRange);
      setAnalytics(data);
      console.log('✅ Analytics loaded:', data);
    } catch (error) {
      console.error('❌ Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrends = async () => {
    try {
      setLoadingTrends(true);
      const data = await apiClient.getAnalyticsTrends({
        metric,
        range: timeRange as any,
        interval: timeRange === '90d' ? 'week' : 'day',
        compare: true,
        mode: netMode ? 'net' : 'gross',
      });
      setTrends(data);
    } catch (error) {
      console.error('❌ Failed to load trends:', error);
      setTrends(null);
    } finally {
      setLoadingTrends(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return value.toFixed(1) + '%';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const paidRevenue =
    analytics?.revenue_breakdown?.confirmed ??
    analytics?.revenue_breakdown?.paid ??
    analytics?.confirmed_revenue ??
    analytics?.paid_revenue ??
    analytics?.total_paid_revenue ??
    analytics?.net_revenue ??
    analytics?.total_revenue ??
    0;

  const paidRevenueGrowth =
    analytics?.confirmed_revenue_growth ??
    analytics?.paid_revenue_growth ??
    analytics?.net_revenue_growth ??
    analytics?.revenue_growth ??
    0;

  const displayPaidRevenue = paidRevenueOverride?.revenue ?? paidRevenue;
  const displayPaidRevenueGrowth = paidRevenueOverride?.growth ?? paidRevenueGrowth;
  const prevPeriodLabel = `vs prev ${timeRange}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Analytics</h1>
          <p className="text-gray-600">Track your store's key performance metrics</p>
        </div>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="1d">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Order Generation Rate */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
            <div className={`flex items-center text-sm ${
              (analytics?.order_generation_rate_change || 0) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {(analytics?.order_generation_rate_change || 0) >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{Math.abs(analytics?.order_generation_rate_change || 0)}%</span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">
            {formatPercent(analytics?.order_generation_rate || 0)}
          </h3>
          <p className="text-sm text-gray-600">Order Generation Rate</p>
          <p className="text-xs text-gray-500 mt-1">
            {analytics?.total_order_attempts || 0} attempts
          </p>
        </div>

        {/* Order Placement Rate */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <BarChart3 className="w-6 h-6 text-green-600" />
            </div>
            <div className={`flex items-center text-sm ${
              (analytics?.order_placement_rate_change || 0) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {(analytics?.order_placement_rate_change || 0) >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{Math.abs(analytics?.order_placement_rate_change || 0)}%</span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">
            {formatPercent(analytics?.order_placement_rate || 0)}
          </h3>
          <p className="text-sm text-gray-600">Order Placement Rate</p>
          <p className="text-xs text-gray-500 mt-1">
            {analytics?.total_orders_placed || 0} placed
          </p>
        </div>

        {/* Payment Success Rate */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-purple-600" />
            </div>
            <div className={`flex items-center text-sm ${
              (analytics?.payment_success_rate_change || 0) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {(analytics?.payment_success_rate_change || 0) >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{Math.abs(analytics?.payment_success_rate_change || 0)}%</span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">
            {formatPercent(analytics?.payment_success_rate || 0)}
          </h3>
          <p className="text-sm text-gray-600">Payment Success Rate</p>
          <p className="text-xs text-gray-500 mt-1">
            {analytics?.total_payments_succeeded || 0} succeeded
          </p>
        </div>

        {/* Total Revenue */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-orange-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-orange-600" />
            </div>
            <div className={`flex items-center text-sm ${
              displayPaidRevenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {displayPaidRevenueGrowth >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span className="whitespace-nowrap">
                {Math.abs(displayPaidRevenueGrowth)}% <span className="text-xs text-gray-500">{prevPeriodLabel}</span>
              </span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">
            {formatCurrency(displayPaidRevenue)}
          </h3>
          <p className="text-sm text-gray-600">Paid Revenue</p>
          <p className="text-xs text-gray-500 mt-1">
            Paid orders only (excludes pending/unpaid)
            {paidRevenueOverrideLoading ? ' • recomputing…' : paidRevenueOverride ? ' • computed from orders' : ''}
          </p>
        </div>
      </div>

      {/* Performance by PSP */}
      {analytics?.psp_performance && analytics.psp_performance.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Performance by PSP</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {analytics.psp_performance.map((psp: any) => (
                <div key={psp.psp_type} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900 capitalize">{psp.psp_type}</h3>
                    <p className="text-sm text-gray-600">
                      {psp.transaction_count} transactions
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">
                      {formatPercent(psp.success_rate || 0)}
                    </p>
                    <p className="text-sm text-gray-600">Success Rate</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Trends Over Time */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Trends Over Time</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Metric</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            >
              <option value="gmv">GMV</option>
              <option value="orders">Orders</option>
              <option value="aov">AOV</option>
              <option value="success_rate">Success Rate</option>
              <option value="refunds">Refunds</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={netMode}
                onChange={(e) => setNetMode(e.target.checked)}
              />
              Net after refunds
            </label>
            {trends?.base_currency && (
              <span className="text-xs text-gray-500">Base: {trends.base_currency}</span>
            )}
            <button
              onClick={async () => {
                try {
                  setExportingCsv(true);
                  const blob = await apiClient.exportAnalyticsTrendsCSV({
                    metric,
                    range: timeRange as any,
                    interval: timeRange === '90d' ? 'week' : 'day',
                    compare: true,
                    mode: netMode ? 'net' : 'gross',
                    // base currency handled server-side; could pass explicitly later
                  });
                  const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `trends_${metric}_${timeRange}_${netMode ? 'net' : 'gross'}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  window.URL.revokeObjectURL(url);
                } catch (e) {
                  console.error('CSV export failed', e);
                  alert('Failed to export CSV');
                } finally {
                  setExportingCsv(false);
                }
              }}
              disabled={exportingCsv}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {exportingCsv ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>
        <div className="p-6">
          {loadingTrends ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          ) : trends?.series?.length > 0 ? (
            <div className="w-full h-80">
              <ResponsiveContainer width="100%" height="100%">
                {(metric === 'gmv' || metric === 'orders') ? (
                  <BarChart 
                    data={trends.series} 
                    margin={{ top: 10, right: 30, left: 10, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      interval="preserveStartEnd"
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      width={80}
                      tickFormatter={(v) => {
                        if (metric === 'gmv') {
                          if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
                          return `$${v.toFixed(0)}`;
                        }
                        return `${v}`;
                      }} 
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '8px 12px'
                      }}
                      formatter={(value: any, name: string) => {
                        if (metric === 'gmv') return [formatCurrency(value), name];
                        return [value, name];
                      }}
                      labelFormatter={(label) => {
                        const date = new Date(label);
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '10px' }}
                    />
                    <Bar 
                      dataKey="value" 
                      name="Current Period" 
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                ) : (
                  <LineChart 
                    data={trends.series} 
                    margin={{ top: 10, right: 30, left: 10, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      interval="preserveStartEnd"
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      width={80}
                      tickFormatter={(v) => {
                        if (metric === 'aov' || metric === 'refunds') {
                          if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
                          return `$${v.toFixed(0)}`;
                        }
                        if (metric === 'success_rate') return `${(v as number).toFixed(0)}%`;
                        return `${v}`;
                      }} 
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '8px 12px'
                      }}
                      formatter={(value: any, name: string) => {
                        if (metric === 'aov' || metric === 'refunds') return [formatCurrency(value), name];
                        if (metric === 'success_rate') return [`${Number(value).toFixed(1)}%`, name];
                        return [value, name];
                      }}
                      labelFormatter={(label) => {
                        const date = new Date(label);
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '10px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      name="Current Period" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm">No trend data available for the selected range.</p>
                <p className="text-xs mt-1 text-gray-400">Data will appear once you have transactions.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">📊 Understanding Your Metrics</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li><strong>Order Generation Rate:</strong> % of customer sessions that create orders</li>
          <li><strong>Order Placement Rate:</strong> % of created orders that are successfully placed</li>
          <li><strong>Payment Success Rate:</strong> % of placed orders with successful payments</li>
        </ul>
      </div>
    </div>
  );
}
