'use client';

import { useState, useEffect, useRef } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';
import {
  apiClient,
  type CommerceFunnelGroupBy,
  type CommerceFunnelParams,
} from '@/lib/api-client';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import {
  MerchantButton,
  PageHeader,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';
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

type AnalyticsTrendsPoint = {
  date: string;
  value: number;
};

type AnalyticsTrendsResponse = {
  metric?: string;
  interval?: string;
  range?: string;
  mode?: string;
  base_currency?: string;
  series?: AnalyticsTrendsPoint[];
  comparison_series?: AnalyticsTrendsPoint[];
};

type CommerceFunnelFilters = Pick<
  CommerceFunnelParams,
  | 'source_channel'
  | 'source_family'
  | 'protocol_name'
  | 'agent_id'
  | 'query_source'
  | 'llm_provider'
  | 'llm_model'
  | 'commerce_surface'
>;

const INITIAL_FUNNEL_FILTERS: CommerceFunnelFilters = {
  source_channel: '',
  source_family: '',
  protocol_name: '',
  agent_id: '',
  query_source: '',
  llm_provider: '',
  llm_model: '',
  commerce_surface: '',
};

const FUNNEL_GROUP_OPTIONS: Array<{ value: CommerceFunnelGroupBy; label: string }> = [
  { value: 'source_channel', label: 'Source channel' },
  { value: 'protocol_name', label: 'Protocol' },
  { value: 'query_source', label: 'Query source' },
  { value: 'agent_id', label: 'Agent ID' },
  { value: 'llm_provider', label: 'LLM provider' },
  { value: 'llm_model', label: 'LLM model' },
  { value: 'commerce_surface', label: 'Commerce surface' },
  { value: 'source_family', label: 'Source family' },
  { value: 'product', label: 'Product' },
  { value: 'variant', label: 'Variant' },
  { value: 'surface', label: 'Surface' },
];

const SURFACE_SCOPE_OPTIONS = [
  { value: '', label: 'All surfaces' },
  { value: 'ucp', label: 'UCP' },
  { value: 'agent_api', label: 'Agent API' },
  { value: 'acp', label: 'ACP' },
  { value: 'mcp', label: 'MCP' },
  { value: 'ap2', label: 'AP2' },
];

const SOURCE_FAMILY_OPTIONS = [
  { value: '', label: 'Any source family' },
  { value: 'internal', label: 'Internal' },
  { value: 'external_agent', label: 'External agent' },
  { value: 'partner', label: 'Partner' },
  { value: 'employee', label: 'Employee' },
  { value: 'system', label: 'System' },
  { value: 'unknown', label: 'Unknown' },
];

const TAXONOMY_FIELDS: Array<keyof CommerceFunnelFilters> = [
  'source_channel',
  'source_family',
  'protocol_name',
  'agent_id',
  'query_source',
  'llm_provider',
  'llm_model',
  'commerce_surface',
];

function humanizeToken(value: string) {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed === '[]') return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => String(item ?? '').trim())
            .filter(Boolean);
        }
      } catch {
        // Fall through to the plain-string case below.
      }
    }
    return [trimmed];
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
  }

  return [];
}

export default function AnalyticsPage() {
  const { t } = useMerchantLanguage();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d');
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [metric, setMetric] = useState<'gmv' | 'orders' | 'aov' | 'success_rate' | 'refunds'>('gmv');
  const [trends, setTrends] = useState<AnalyticsTrendsResponse | null>(null);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [commerceFunnel, setCommerceFunnel] = useState<any>(null);
  const [commerceFunnelError, setCommerceFunnelError] = useState<string | null>(null);
  const [commerceIssues, setCommerceIssues] = useState<any>(null);
  const [commerceIssuesError, setCommerceIssuesError] = useState<string | null>(null);
  const [readinessState, setReadinessState] = useState<any>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null);
  const [interactionTrace, setInteractionTrace] = useState<any>(null);
  const [interactionTraceError, setInteractionTraceError] = useState<string | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [netMode, setNetMode] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [funnelGroupBy, setFunnelGroupBy] = useState<CommerceFunnelGroupBy>('source_channel');
  const [funnelSurface, setFunnelSurface] = useState('');
  const [funnelFilters, setFunnelFilters] = useState<CommerceFunnelFilters>(INITIAL_FUNNEL_FILTERS);
  const revenueComputeSeqRef = useRef(0);
  const [paidRevenueOverride, setPaidRevenueOverride] = useState<{
    revenue: number;
    growth: number;
  } | null>(null);
  const [paidRevenueOverrideLoading, setPaidRevenueOverrideLoading] = useState(false);

  // Retry buttons reuse these loaders; keep the analytics refetch keyed to user-facing controls only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void (async () => {
      await loadAnalytics();
      await loadTrends();
    })();
  }, [timeRange, metric, netMode, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Commerce readiness and diagnostics are merchant-scoped boot data, not time-range dependent analytics.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void (async () => {
      await loadCommerceFunnel();
      await loadCommerceIssues();
      await loadReadinessState();
    })();
  }, [t, funnelGroupBy, funnelSurface, funnelFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trace loading should only follow the selected interaction id.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedInteractionId) {
      setInteractionTrace(null);
      setInteractionTraceError(null);
      setLoadingTrace(false);
      return;
    }
    void (async () => {
      await loadInteractionTrace(selectedInteractionId);
    })();
  }, [selectedInteractionId, t]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setAnalyticsError(null);
      const data = await apiClient.getAnalyticsDashboard(timeRange);
      if (data?.error) {
        throw new Error(data.error);
      }
      setAnalytics(data);
      console.log('✅ Analytics loaded:', data);
    } catch (error) {
      console.error('❌ Failed to load analytics:', error);
      setAnalytics(null);
      setAnalyticsError(t('dashboard.analytics.error.runtime'));
    } finally {
      setLoading(false);
    }
  };

  const loadTrends = async () => {
    try {
      setLoadingTrends(true);
      setTrendsError(null);
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
      setTrendsError(t('dashboard.analytics.trends.runtime'));
    } finally {
      setLoadingTrends(false);
    }
  };

  const loadCommerceFunnel = async () => {
    try {
      setCommerceFunnelError(null);
      const data = await apiClient.getCommerceFunnel({
        group_by: funnelGroupBy,
        surface: funnelSurface || undefined,
        ...Object.fromEntries(
          Object.entries(funnelFilters).filter(([, value]) => String(value || '').trim())
        ),
      });
      setCommerceFunnel(data);
    } catch (error) {
      console.error('❌ Failed to load commerce funnel:', error);
      setCommerceFunnel(null);
      setCommerceFunnelError(t('dashboard.analytics.commerceFunnel.runtime'));
    }
  };

  const loadCommerceIssues = async () => {
    try {
      setCommerceIssuesError(null);
      const data = await apiClient.getCommerceFunnelIssues({
        limit: 20,
        surface: funnelSurface || undefined,
      });
      setCommerceIssues(data);
    } catch (error) {
      console.error('❌ Failed to load commerce funnel issues:', error);
      setCommerceIssues(null);
      setCommerceIssuesError(t('dashboard.analytics.issues.runtime'));
    }
  };

  const loadReadinessState = async () => {
    try {
      setReadinessError(null);
      const data = await apiClient.getCommerceReadinessState();
      setReadinessState(data);
    } catch (error) {
      console.error('❌ Failed to load readiness state:', error);
      setReadinessState(null);
      setReadinessError(t('dashboard.analytics.readiness.runtime'));
    }
  };

  const loadInteractionTrace = async (interactionId: string) => {
    try {
      setLoadingTrace(true);
      setInteractionTraceError(null);
      const data = await apiClient.getCommerceInteractionTrace(interactionId);
      setInteractionTrace(data);
    } catch (error) {
      console.error('❌ Failed to load commerce interaction trace:', error);
      setInteractionTrace(null);
      setInteractionTraceError(t('dashboard.analytics.trace.runtime'));
    } finally {
      setLoadingTrace(false);
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

  const formatRatioPercent = (value: number) => {
    return formatPercent((Number(value) || 0) * 100);
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return t('dashboard.analytics.shared.notAvailable');
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  const setFunnelFilter = (field: keyof CommerceFunnelFilters, value: string) => {
    setFunnelFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const clearTrafficFilters = () => {
    setFunnelGroupBy('source_channel');
    setFunnelSurface('');
    setFunnelFilters(INITIAL_FUNNEL_FILTERS);
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="merchant-panel px-8 py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-brand)]"></div>
        </div>
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
  const prevPeriodLabel = t('dashboard.analytics.trends.vsPrevious');
  const chartData = (trends?.series || []).map((point, index) => ({
    date: point.date,
    current: point.value,
    previous: trends?.comparison_series?.[index]?.value ?? null,
  }));
  const hasComparisonSeries = chartData.some((point) => typeof point.previous === 'number');
  const funnelSummary = commerceFunnel?.summary || {};
  const funnelSlices = Array.isArray(commerceFunnel?.slices) ? commerceFunnel.slices : [];
  const appliedTrafficFilters = commerceFunnel?.applied_filters || {};
  const activeFilterEntries = Object.entries(appliedTrafficFilters).filter(
    ([, value]) => String(value || '').trim().length > 0
  );
  const funnelGroupLabel =
    FUNNEL_GROUP_OPTIONS.find((option) => option.value === funnelGroupBy)?.label || 'Key';
  const listingRowsTotal = Number(funnelSummary?.listing_rows_total || 0);
  const listingStatusBreakdown =
    funnelSummary?.listing_status_breakdown_rows || funnelSummary?.listing_status_breakdown || {};
  const listingStatusBreakdownBySurface =
    funnelSummary?.listing_status_breakdown_by_surface || {};
  const readinessDomains = [
    {
      key: 'foundation',
      label: t('dashboard.analytics.readiness.foundation'),
      status: readinessState?.foundation_status,
      blockers: normalizeStringList(readinessState?.foundation_blockers),
    },
    {
      key: 'discover',
      label: t('dashboard.analytics.readiness.discover'),
      status: readinessState?.discover_status,
      blockers: normalizeStringList(readinessState?.discover_blockers),
    },
    {
      key: 'signals',
      label: t('dashboard.analytics.readiness.signals'),
      status: readinessState?.signals_status,
      blockers: normalizeStringList(readinessState?.signals_blockers),
    },
    {
      key: 'execute',
      label: t('dashboard.analytics.readiness.execute'),
      status: readinessState?.execute_status,
      blockers: normalizeStringList(readinessState?.execute_blockers),
    },
  ];
  const readinessMetadata = readinessState?.metadata || {};
  const commerceIssuesList = Array.isArray(commerceIssues?.issues) ? commerceIssues.issues : [];
  const traceInteraction = interactionTrace?.interaction || null;
  const traceEvents = Array.isArray(interactionTrace?.events) ? interactionTrace.events : [];
  const traceTaxonomyEntries = TAXONOMY_FIELDS.map((field) => ({
    field,
    label: humanizeToken(field),
    value: traceInteraction?.[field] || traceInteraction?.metadata?.traffic_taxonomy?.[field] || '',
  })).filter((item) => String(item.value || '').trim());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('dashboard.analytics.eyebrow')}
        title={t('dashboard.analytics.title')}
        description={t('dashboard.analytics.description')}
        actions={
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="merchant-select min-w-[180px]"
          >
            <option value="1d">{t('dashboard.analytics.range.1d')}</option>
            <option value="7d">{t('dashboard.analytics.range.7d')}</option>
            <option value="30d">{t('dashboard.analytics.range.30d')}</option>
            <option value="90d">{t('dashboard.analytics.range.90d')}</option>
          </select>
        }
      />

      {analyticsError ? (
        <SurfaceCard
          title={t('dashboard.analytics.error.title')}
          description={t('dashboard.analytics.error.description')}
          action={
            <MerchantButton type="button" onClick={loadAnalytics} variant="secondary">
              {t('dashboard.analytics.error.retry')}
            </MerchantButton>
          }
        >
          <div className="p-5 text-sm text-[color:var(--merchant-muted-strong)]">
            {analyticsError}
          </div>
        </SurfaceCard>
      ) : (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Click-through Rate */}
        <div className="merchant-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-lg bg-blue-100 p-2">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
            <div className={`flex items-center text-sm ${
              Number(funnelSummary?.clicked_rate || 0) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {(Number(funnelSummary?.clicked_rate || 0) >= 0) ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{formatRatioPercent(Number(funnelSummary?.clicked_rate || 0))}</span>
            </div>
          </div>
          <h3 className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {formatRatioPercent(Number(funnelSummary?.clicked_rate || 0))}
          </h3>
          <p className="text-sm text-[color:var(--merchant-muted-strong)]">
            {t('dashboard.analytics.stats.clickThroughRate')}
          </p>
          <p className="mt-1 text-xs text-[color:var(--merchant-muted)]">
            {t('dashboard.analytics.stats.clickedExposureMeta', {
              clicked: Number(funnelSummary?.clicked_exposure || 0),
              surfaced: Number(funnelSummary?.surfaced_exposure || funnelSummary?.indexed_exposure || 0),
            })}
          </p>
        </div>

        {/* Order Rate From Clicks */}
        <div className="merchant-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-lg bg-green-100 p-2">
              <BarChart3 className="w-6 h-6 text-green-600" />
            </div>
            <div className={`flex items-center text-sm ${
              Number(funnelSummary?.ordered_rate || 0) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {(Number(funnelSummary?.ordered_rate || 0) >= 0) ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{formatRatioPercent(Number(funnelSummary?.ordered_rate || 0))}</span>
            </div>
          </div>
          <h3 className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {formatRatioPercent(Number(funnelSummary?.ordered_rate || 0))}
          </h3>
          <p className="text-sm text-[color:var(--merchant-muted-strong)]">
            {t('dashboard.analytics.stats.orderRateFromClicks')}
          </p>
          <p className="mt-1 text-xs text-[color:var(--merchant-muted)]">
            {t('dashboard.analytics.stats.orderedExposureMeta', {
              ordered: Number(funnelSummary?.ordered_conversion || 0),
              clicked: Number(funnelSummary?.clicked_exposure || 0),
            })}
          </p>
        </div>

        {/* Payment Success Rate */}
        <div className="merchant-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-lg bg-purple-100 p-2">
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
          <h3 className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {formatPercent(analytics?.payment_success_rate || 0)}
          </h3>
          <p className="text-sm text-[color:var(--merchant-muted-strong)]">
            {t('dashboard.analytics.stats.paymentSuccess')}
          </p>
          <p className="mt-1 text-xs text-[color:var(--merchant-muted)]">
            {t('dashboard.analytics.stats.succeeded', {
              count: analytics?.total_payments_succeeded || 0,
            })}
          </p>
        </div>

        {/* Total Revenue */}
        <div className="merchant-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-lg bg-orange-100 p-2">
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
          <h3 className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {formatCurrency(displayPaidRevenue)}
          </h3>
          <p className="text-sm text-[color:var(--merchant-muted-strong)]">
            {t('dashboard.analytics.stats.paidRevenue')}
          </p>
          <p className="mt-1 text-xs text-[color:var(--merchant-muted)]">
            {t('dashboard.analytics.stats.paidRevenueMeta')}
            {paidRevenueOverrideLoading
              ? ` • ${t('dashboard.analytics.stats.recomputing')}`
              : paidRevenueOverride
                ? ` • ${t('dashboard.analytics.stats.computedFromOrders')}`
                : ''}
          </p>
        </div>
      </div>
      )}

      <SurfaceCard
        title={t('dashboard.analytics.commerceFunnel.title')}
        description={t('dashboard.analytics.commerceFunnel.description')}
        action={
          commerceFunnelError ? (
            <MerchantButton type="button" onClick={loadCommerceFunnel} variant="secondary">
              {t('dashboard.analytics.commerceFunnel.retry')}
            </MerchantButton>
          ) : null
        }
      >
        <div className="p-5 space-y-5">
          <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[color:var(--merchant-ink)]">Traffic breakdown controls</div>
                <div className="mt-1 text-xs text-[color:var(--merchant-muted)]">
                  Switch the funnel by source, protocol, query path, model, or agent identity without leaving this page.
                </div>
              </div>
              <MerchantButton type="button" variant="secondary" onClick={clearTrafficFilters}>
                Clear filters
              </MerchantButton>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 text-xs text-[color:var(--merchant-muted-strong)]">
                <span className="uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">Group by</span>
                <select
                  value={funnelGroupBy}
                  onChange={(event) => setFunnelGroupBy(event.target.value as CommerceFunnelGroupBy)}
                  className="merchant-select w-full"
                >
                  {FUNNEL_GROUP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs text-[color:var(--merchant-muted-strong)]">
                <span className="uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">Surface scope</span>
                <select
                  value={funnelSurface}
                  onChange={(event) => setFunnelSurface(event.target.value)}
                  className="merchant-select w-full"
                >
                  {SURFACE_SCOPE_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs text-[color:var(--merchant-muted-strong)]">
                <span className="uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">Source channel</span>
                <input
                  value={funnelFilters.source_channel || ''}
                  onChange={(event) => setFunnelFilter('source_channel', event.target.value)}
                  className="merchant-input w-full"
                  placeholder="shopping-agent-ui"
                />
              </label>

              <label className="space-y-1 text-xs text-[color:var(--merchant-muted-strong)]">
                <span className="uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">Protocol</span>
                <input
                  value={funnelFilters.protocol_name || ''}
                  onChange={(event) => setFunnelFilter('protocol_name', event.target.value)}
                  className="merchant-input w-full"
                  placeholder="ucp / acp / mcp"
                />
              </label>

              <label className="space-y-1 text-xs text-[color:var(--merchant-muted-strong)]">
                <span className="uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">Query source</span>
                <input
                  value={funnelFilters.query_source || ''}
                  onChange={(event) => setFunnelFilter('query_source', event.target.value)}
                  className="merchant-input w-full"
                  placeholder="cache_multi_intent"
                />
              </label>

              <label className="space-y-1 text-xs text-[color:var(--merchant-muted-strong)]">
                <span className="uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">Agent ID</span>
                <input
                  value={funnelFilters.agent_id || ''}
                  onChange={(event) => setFunnelFilter('agent_id', event.target.value)}
                  className="merchant-input w-full"
                  placeholder="agent_xxx"
                />
              </label>

              <label className="space-y-1 text-xs text-[color:var(--merchant-muted-strong)]">
                <span className="uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">Source family</span>
                <select
                  value={funnelFilters.source_family || ''}
                  onChange={(event) => setFunnelFilter('source_family', event.target.value)}
                  className="merchant-select w-full"
                >
                  {SOURCE_FAMILY_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs text-[color:var(--merchant-muted-strong)]">
                <span className="uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">Commerce surface</span>
                <input
                  value={funnelFilters.commerce_surface || ''}
                  onChange={(event) => setFunnelFilter('commerce_surface', event.target.value)}
                  className="merchant-input w-full"
                  placeholder="agent_api / ucp"
                />
              </label>

              <label className="space-y-1 text-xs text-[color:var(--merchant-muted-strong)]">
                <span className="uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">LLM provider</span>
                <input
                  value={funnelFilters.llm_provider || ''}
                  onChange={(event) => setFunnelFilter('llm_provider', event.target.value)}
                  className="merchant-input w-full"
                  placeholder="openai / anthropic"
                />
              </label>

              <label className="space-y-1 text-xs text-[color:var(--merchant-muted-strong)] md:col-span-2 xl:col-span-3">
                <span className="uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">LLM model</span>
                <input
                  value={funnelFilters.llm_model || ''}
                  onChange={(event) => setFunnelFilter('llm_model', event.target.value)}
                  className="merchant-input w-full"
                  placeholder="gpt-5.4 / claude-sonnet-4.5"
                />
              </label>
            </div>

            {activeFilterEntries.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {activeFilterEntries.map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex items-center rounded-full border border-[color:var(--merchant-line)] px-3 py-1 text-xs text-[color:var(--merchant-muted-strong)]"
                  >
                    {humanizeToken(key)}: {String(value)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {commerceFunnelError ? (
            <div className="rounded-[1rem] border border-[color:var(--merchant-warning-soft)] bg-[color:var(--merchant-warning-soft)]/40 px-4 py-4 text-sm text-[color:var(--merchant-muted-strong)]">
              {commerceFunnelError}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    label: t('dashboard.analytics.commerceFunnel.indexed'),
                    value: Number(funnelSummary?.indexed_exposure || 0),
                    meta: t('dashboard.analytics.commerceFunnel.indexedMeta'),
                  },
                  {
                    label: t('dashboard.analytics.commerceFunnel.surfaced'),
                    value: Number(funnelSummary?.surfaced_exposure || 0),
                    meta: t('dashboard.analytics.commerceFunnel.surfacedMeta', {
                      supported: funnelSummary?.surfaced_exposure_supported
                        ? t('dashboard.analytics.shared.supported')
                        : t('dashboard.analytics.shared.notSupported'),
                    }),
                  },
                  {
                    label: t('dashboard.analytics.commerceFunnel.clicked'),
                    value: Number(funnelSummary?.clicked_exposure || 0),
                    meta: t('dashboard.analytics.commerceFunnel.clickedMeta', {
                      count: Number(funnelSummary?.clicked_events_total || 0),
                    }),
                  },
                  {
                    label: t('dashboard.analytics.commerceFunnel.ordered'),
                    value: Number(funnelSummary?.ordered_conversion || 0),
                  },
                  {
                    label: t('dashboard.analytics.commerceFunnel.refunded'),
                    value: Number(funnelSummary?.refunded_orders || 0),
                    meta: t('dashboard.analytics.commerceFunnel.refundedMeta', {
                      amount: String(funnelSummary?.refunded_amount || '0'),
                    }),
                  },
                  {
                    label: t('dashboard.analytics.commerceFunnel.clickedRate'),
                    value: formatRatioPercent(Number(funnelSummary?.clicked_rate || 0)),
                    meta: t('dashboard.analytics.commerceFunnel.clickedRateMeta'),
                  },
                  {
                    label: t('dashboard.analytics.commerceFunnel.orderedRate'),
                    value: formatRatioPercent(Number(funnelSummary?.ordered_rate || 0)),
                    meta: t('dashboard.analytics.commerceFunnel.orderedRateMeta'),
                  },
                ].map((item) => (
                  <div key={item.label} className="merchant-panel p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                      {item.label}
                    </div>
                    <div className="mt-2 text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
                      {item.value}
                    </div>
                    {item.meta ? (
                      <div className="mt-1 text-xs text-[color:var(--merchant-muted)]">{item.meta}</div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                    {t('dashboard.analytics.commerceFunnel.groupedTitle')}
                  </div>
                  <div className="text-xs text-[color:var(--merchant-muted)]">
                    {t('dashboard.analytics.commerceFunnel.groupedDescription')} Viewing by <strong>{funnelGroupLabel}</strong>.
                  </div>
                </div>
                <div className="overflow-x-auto rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/80">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[color:var(--merchant-surface-muted)]/70 text-left text-xs uppercase tracking-[0.14em] text-[color:var(--merchant-muted)]">
                      <tr>
                        <th className="px-4 py-3">{funnelGroupLabel}</th>
                        <th className="px-4 py-3">{t('dashboard.analytics.commerceFunnel.groupedHeaders.indexed')}</th>
                        <th className="px-4 py-3">{t('dashboard.analytics.commerceFunnel.groupedHeaders.surfaced')}</th>
                        <th className="px-4 py-3">{t('dashboard.analytics.commerceFunnel.groupedHeaders.clicked')}</th>
                        <th className="px-4 py-3">{t('dashboard.analytics.commerceFunnel.groupedHeaders.clickedRate')}</th>
                        <th className="px-4 py-3">{t('dashboard.analytics.commerceFunnel.groupedHeaders.ordered')}</th>
                        <th className="px-4 py-3">{t('dashboard.analytics.commerceFunnel.groupedHeaders.orderedRate')}</th>
                        <th className="px-4 py-3">{t('dashboard.analytics.commerceFunnel.groupedHeaders.refunded')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funnelSlices.length ? (
                        funnelSlices.slice(0, 12).map((slice: any) => (
                          <tr
                            key={String(slice?.key || 'unknown')}
                            className="border-t border-[color:var(--merchant-line)] text-[color:var(--merchant-muted-strong)]"
                          >
                            <td className="px-4 py-3 font-medium text-[color:var(--merchant-ink)]">
                              {String(slice?.key || t('dashboard.analytics.shared.unknown'))}
                            </td>
                            <td className="px-4 py-3">{Number(slice?.indexed_exposure || 0)}</td>
                            <td className="px-4 py-3">{Number(slice?.surfaced_exposure || 0)}</td>
                            <td className="px-4 py-3">{Number(slice?.clicked_exposure || 0)}</td>
                            <td className="px-4 py-3">{formatRatioPercent(Number(slice?.clicked_rate || 0))}</td>
                            <td className="px-4 py-3">{Number(slice?.ordered_conversion || 0)}</td>
                            <td className="px-4 py-3">{formatRatioPercent(Number(slice?.ordered_rate || 0))}</td>
                            <td className="px-4 py-3">
                              {Number(slice?.refunded_orders || 0)} / {String(slice?.refunded_amount || '0')}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-4 py-5 text-center text-[color:var(--merchant-muted)]"
                          >
                            {t('dashboard.analytics.commerceFunnel.empty')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                      {t('dashboard.analytics.commerceFunnel.listingRows')}
                    </div>
                    <span className="text-xs text-[color:var(--merchant-muted)]">
                      {t('dashboard.analytics.commerceFunnel.listingRowsMeta', {
                        count: listingRowsTotal,
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-[color:var(--merchant-muted)]">
                    {t('dashboard.analytics.commerceFunnel.listingRowsHelp')}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(listingStatusBreakdown).length ? (
                    Object.entries(listingStatusBreakdown).map(([status, count]) => (
                      <span
                        key={status}
                        className="inline-flex items-center rounded-full border border-[color:var(--merchant-line)] px-3 py-1 text-xs text-[color:var(--merchant-muted-strong)]"
                      >
                        {status}: {String(count)}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[color:var(--merchant-muted)]">
                      {t('dashboard.analytics.commerceFunnel.empty')}
                    </span>
                  )}
                </div>
                {Object.keys(listingStatusBreakdownBySurface).length ? (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                      {t('dashboard.analytics.commerceFunnel.bySurface')}
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {Object.entries(listingStatusBreakdownBySurface).map(([surfaceKey, statuses]) => (
                        <div
                          key={surfaceKey}
                          className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/70 px-3 py-3"
                        >
                          <div className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--merchant-muted-strong)]">
                            {surfaceKey}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {Object.entries((statuses || {}) as Record<string, number>).map(([status, count]) => (
                              <span
                                key={`${surfaceKey}:${status}`}
                                className="inline-flex items-center rounded-full border border-[color:var(--merchant-line)] px-3 py-1 text-xs text-[color:var(--merchant-muted-strong)]"
                              >
                                {status}: {String(count)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {!funnelSummary?.surfaced_exposure_supported ? (
                  <div className="text-xs text-[color:var(--merchant-muted)]">
                    {t('dashboard.analytics.commerceFunnel.surfacedPending')}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard
        title={t('dashboard.analytics.readiness.title')}
        description={t('dashboard.analytics.readiness.description')}
        action={
          readinessError ? (
            <MerchantButton type="button" onClick={loadReadinessState} variant="secondary">
              {t('dashboard.analytics.readiness.retry')}
            </MerchantButton>
          ) : null
        }
      >
        <div className="space-y-5 p-5">
          {readinessError ? (
            <div className="rounded-[1rem] border border-[color:var(--merchant-warning-soft)] bg-[color:var(--merchant-warning-soft)]/40 px-4 py-4 text-sm text-[color:var(--merchant-muted-strong)]">
              {readinessError}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {readinessDomains.map((domain) => {
                  const ready = String(domain.status || '').toLowerCase() === 'ready';
                  return (
                    <div key={domain.key} className="merchant-panel p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                          {domain.label}
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            ready
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {ready
                            ? t('dashboard.analytics.readiness.ready')
                            : t('dashboard.analytics.readiness.blocked')}
                        </span>
                      </div>
                      <div className="mt-3 text-sm text-[color:var(--merchant-muted-strong)]">
                        {domain.blockers.length
                          ? domain.blockers.join(', ')
                          : t('dashboard.analytics.readiness.noBlockers')}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    label: t('dashboard.analytics.readiness.primaryPlatform'),
                    value: readinessState?.primary_platform || t('dashboard.analytics.shared.notAvailable'),
                  },
                  {
                    label: t('dashboard.analytics.readiness.activePsp'),
                    value: readinessState?.active_psp || t('dashboard.analytics.shared.notAvailable'),
                  },
                  {
                    label: t('dashboard.analytics.readiness.surfacedSupport'),
                    value: readinessState?.surfaced_exposure_supported
                      ? t('dashboard.analytics.shared.supported')
                      : t('dashboard.analytics.shared.notSupported'),
                  },
                  {
                    label: t('dashboard.analytics.readiness.firstStoreConnected'),
                    value: formatDateTime(readinessState?.first_store_connected_at),
                  },
                  {
                    label: t('dashboard.analytics.readiness.firstCatalogSynced'),
                    value: formatDateTime(readinessState?.first_catalog_synced_at),
                  },
                  {
                    label: t('dashboard.analytics.readiness.daysToDiscoverReady'),
                    value:
                      readinessState?.days_to_discover_ready == null
                        ? t('dashboard.analytics.shared.notAvailable')
                        : String(readinessState.days_to_discover_ready),
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/70 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                      {item.label}
                    </div>
                    <div className="mt-2 text-sm font-medium text-[color:var(--merchant-ink)]">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/70 px-4 py-4">
                <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                  {t('dashboard.analytics.readiness.ledgerSummary')}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="text-sm text-[color:var(--merchant-muted-strong)]">
                    {t('dashboard.analytics.readiness.summary.indexed', {
                      count: Number(readinessMetadata?.indexed_exposure || 0),
                    })}
                  </div>
                  <div className="text-sm text-[color:var(--merchant-muted-strong)]">
                    {t('dashboard.analytics.readiness.summary.surfaced', {
                      count: Number(readinessMetadata?.surfaced_exposure || 0),
                    })}
                  </div>
                  <div className="text-sm text-[color:var(--merchant-muted-strong)]">
                    {t('dashboard.analytics.readiness.summary.clicked', {
                      count: Number(readinessMetadata?.clicked_exposure || 0),
                    })}
                  </div>
                  <div className="text-sm text-[color:var(--merchant-muted-strong)]">
                    {t('dashboard.analytics.readiness.summary.ordered', {
                      count: Number(readinessMetadata?.ordered_conversion || 0),
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard
        title={t('dashboard.analytics.issues.title')}
        description={t('dashboard.analytics.issues.description')}
        action={
          commerceIssuesError ? (
            <MerchantButton type="button" onClick={loadCommerceIssues} variant="secondary">
              {t('dashboard.analytics.issues.retry')}
            </MerchantButton>
          ) : null
        }
      >
        <div className="space-y-4 p-5">
          {commerceIssuesError ? (
            <div className="rounded-[1rem] border border-[color:var(--merchant-warning-soft)] bg-[color:var(--merchant-warning-soft)]/40 px-4 py-4 text-sm text-[color:var(--merchant-muted-strong)]">
              {commerceIssuesError}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="merchant-panel p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('dashboard.analytics.issues.summary.interactions')}
                  </div>
                  <div className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
                    {Number(commerceIssues?.summary?.interaction_count || 0)}
                  </div>
                </div>
                <div className="merchant-panel p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('dashboard.analytics.issues.summary.listings')}
                  </div>
                  <div className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
                    {Number(commerceIssues?.summary?.listing_rows_total || 0)}
                  </div>
                </div>
                <div className="merchant-panel p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('dashboard.analytics.issues.summary.clicks')}
                  </div>
                  <div className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
                    {Number(commerceIssues?.summary?.click_rows_total || 0)}
                  </div>
                </div>
                <div className="merchant-panel p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('dashboard.analytics.issues.summary.edges')}
                  </div>
                  <div className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
                    {Number(commerceIssues?.summary?.edge_rows_total || 0)}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {commerceIssuesList.length ? (
                  commerceIssuesList.map((issue: any) => (
                    <div
                      key={String(issue?.code || 'unknown')}
                      className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/80 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                              {String(issue?.code || t('dashboard.analytics.shared.unknown'))}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                String(issue?.severity || '').toLowerCase() === 'critical'
                                  ? 'bg-red-100 text-red-700'
                                  : String(issue?.severity || '').toLowerCase() === 'info'
                                    ? 'bg-slate-100 text-slate-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {String(issue?.severity || 'warning')}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-[color:var(--merchant-line)] px-2.5 py-1 text-[11px] text-[color:var(--merchant-muted-strong)]">
                              {t('dashboard.analytics.issues.count', {
                                count: Number(issue?.count || 0),
                              })}
                            </span>
                          </div>
                          <div className="text-sm text-[color:var(--merchant-muted-strong)]">
                            {String(issue?.message || '')}
                          </div>
                        </div>
                      </div>

                      {Array.isArray(issue?.sample_interaction_ids) && issue.sample_interaction_ids.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {issue.sample_interaction_ids.map((interactionId: string) => (
                            <MerchantButton
                              key={interactionId}
                              type="button"
                              variant={selectedInteractionId === interactionId ? 'primary' : 'secondary'}
                              onClick={() => setSelectedInteractionId(interactionId)}
                            >
                              {t('dashboard.analytics.issues.traceCta', {
                                interactionId: interactionId.slice(0, 10),
                              })}
                            </MerchantButton>
                          ))}
                        </div>
                      ) : null}

                      {Array.isArray(issue?.samples) && issue.samples.length ? (
                        <div className="mt-3 space-y-3">
                          {issue.samples.map((sample: any, sampleIndex: number) => {
                            const taxonomy = sample?.traffic_taxonomy || {};
                            const sampleEntries = Object.entries(sample || {}).filter(
                              ([key, value]) =>
                                key !== 'traffic_taxonomy' &&
                                value !== null &&
                                value !== undefined &&
                                String(value).trim().length > 0
                            );

                            return (
                              <div
                                key={`${String(issue?.code || 'issue')}-sample-${sampleIndex}`}
                                className="rounded-[0.9rem] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)]/35 px-3 py-3"
                              >
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                  {sampleEntries.map(([key, value]) => (
                                    <div key={key} className="text-xs text-[color:var(--merchant-muted-strong)]">
                                      <span className="block uppercase tracking-[0.14em] text-[10px] text-[color:var(--merchant-muted)]">
                                        {humanizeToken(key)}
                                      </span>
                                      <span className="break-all">{String(value)}</span>
                                    </div>
                                  ))}
                                </div>

                                {Object.keys(taxonomy).length ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {TAXONOMY_FIELDS.map((field) => {
                                      const value = taxonomy?.[field];
                                      if (!String(value || '').trim()) return null;
                                      return (
                                        <span
                                          key={`${field}:${String(value)}`}
                                          className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-700"
                                        >
                                          {humanizeToken(field)}: {String(value)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="mt-3 text-[11px] text-[color:var(--merchant-muted)]">
                                    No traffic taxonomy on this sample yet. Listing-only diagnostics will usually look like this.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/70 px-4 py-5 text-sm text-[color:var(--merchant-muted)]">
                    {t('dashboard.analytics.issues.empty')}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard
        title={t('dashboard.analytics.trace.title')}
        description={t('dashboard.analytics.trace.description')}
        action={
          selectedInteractionId ? (
            <MerchantButton
              type="button"
              variant="secondary"
              onClick={() => setSelectedInteractionId(null)}
            >
              {t('dashboard.analytics.trace.clear')}
            </MerchantButton>
          ) : null
        }
      >
        <div className="space-y-4 p-5">
          {!selectedInteractionId ? (
            <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/70 px-4 py-5 text-sm text-[color:var(--merchant-muted)]">
              {t('dashboard.analytics.trace.empty')}
            </div>
          ) : loadingTrace ? (
            <div className="flex min-h-[180px] items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-brand)]"></div>
            </div>
          ) : interactionTraceError ? (
            <div className="rounded-[1rem] border border-[color:var(--merchant-warning-soft)] bg-[color:var(--merchant-warning-soft)]/40 px-4 py-4 text-sm text-[color:var(--merchant-muted-strong)]">
              {interactionTraceError}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: t('dashboard.analytics.trace.interactionId'),
                    value: traceInteraction?.interaction_id || selectedInteractionId,
                  },
                  {
                    label: t('dashboard.analytics.trace.platform'),
                    value: traceInteraction?.platform || t('dashboard.analytics.shared.notAvailable'),
                  },
                  {
                    label: t('dashboard.analytics.trace.surface'),
                    value: traceInteraction?.surface || t('dashboard.analytics.shared.notAvailable'),
                  },
                  {
                    label: t('dashboard.analytics.trace.status'),
                    value: traceInteraction?.status || t('dashboard.analytics.shared.notAvailable'),
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/70 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                      {item.label}
                    </div>
                    <div className="mt-2 break-all text-sm font-medium text-[color:var(--merchant-ink)]">
                      {String(item.value)}
                    </div>
                  </div>
                ))}
              </div>

              {traceTaxonomyEntries.length ? (
                <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/70 px-4 py-4">
                  <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                    Traffic taxonomy
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {traceTaxonomyEntries.map((entry) => (
                      <div key={entry.field} className="text-sm text-[color:var(--merchant-muted-strong)]">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--merchant-muted)]">
                          {entry.label}
                        </div>
                        <div className="mt-1 break-all font-medium text-[color:var(--merchant-ink)]">
                          {String(entry.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/80">
                <div className="border-b border-[color:var(--merchant-line)] px-4 py-3 text-sm font-medium text-[color:var(--merchant-ink)]">
                  {t('dashboard.analytics.trace.events')}
                </div>
                <div className="divide-y divide-[color:var(--merchant-line)]">
                  {traceEvents.length ? (
                    traceEvents.map((event: any, index: number) => (
                      <div key={String(event?.event_id || `event-${index}`)} className="space-y-2 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                            {String(event?.event_type || t('dashboard.analytics.shared.unknown'))}
                          </div>
                          <div className="text-xs text-[color:var(--merchant-muted)]">
                            {formatDateTime(event?.occurred_at)}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 text-xs text-[color:var(--merchant-muted-strong)] md:grid-cols-2 xl:grid-cols-4">
                          <div>{t('dashboard.analytics.trace.eventId')}: {String(event?.event_id || '')}</div>
                          <div>{t('dashboard.analytics.trace.source')}: {String(event?.source || t('dashboard.analytics.shared.notAvailable'))}</div>
                          <div>{t('dashboard.analytics.trace.variant')}: {String(event?.canonical_variant_id || t('dashboard.analytics.shared.notAvailable'))}</div>
                          <div>{t('dashboard.analytics.trace.order')}: {String(event?.payload?.order_id || traceInteraction?.order_id || t('dashboard.analytics.shared.notAvailable'))}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-5 text-sm text-[color:var(--merchant-muted)]">
                      {t('dashboard.analytics.trace.noEvents')}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </SurfaceCard>

      {/* Performance by PSP */}
      {analytics?.psp_performance && analytics.psp_performance.length > 0 && (
        <SurfaceCard
          title={t('dashboard.analytics.paymentPerformance.title')}
          description={t('dashboard.analytics.paymentPerformance.description')}
        >
          <div className="p-5">
            <div className="space-y-4">
              {analytics.psp_performance.map((psp: any) => (
                <div key={psp.psp_type} className="flex items-center justify-between p-4 rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/70">
                  <div>
                    <h3 className="font-medium text-[color:var(--merchant-ink)] capitalize">{psp.psp_type}</h3>
                    <p className="text-sm text-[color:var(--merchant-muted)]">
                      {t('dashboard.analytics.paymentPerformance.transactions', {
                        count: psp.transaction_count,
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-[color:var(--merchant-ink)]">
                      {formatPercent(psp.success_rate || 0)}
                    </p>
                    <p className="text-sm text-[color:var(--merchant-muted)]">
                      {t('dashboard.analytics.paymentPerformance.successRate')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>
      )}

      {/* Trends Over Time */}
      <SurfaceCard
        title={t('dashboard.analytics.trends.title')}
        description={t('dashboard.analytics.trends.description')}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-[color:var(--merchant-muted)]">
              {t('dashboard.analytics.trends.metric')}
            </label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as any)}
              className="merchant-select py-2 text-sm"
            >
              <option value="gmv">{t('dashboard.analytics.trends.metric.gmv')}</option>
              <option value="orders">{t('dashboard.analytics.trends.metric.orders')}</option>
              <option value="aov">{t('dashboard.analytics.trends.metric.aov')}</option>
              <option value="success_rate">{t('dashboard.analytics.trends.metric.successRate')}</option>
              <option value="refunds">{t('dashboard.analytics.trends.metric.refunds')}</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={netMode}
                onChange={(e) => setNetMode(e.target.checked)}
              />
              {t('dashboard.analytics.trends.netAfterRefunds')}
            </label>
            {trends?.base_currency && (
              <span className="text-xs text-[color:var(--merchant-muted)]">
                {t('dashboard.analytics.trends.baseCurrency', {
                  currency: trends.base_currency,
                })}
              </span>
            )}
            {exportError ? (
              <span className="text-xs text-[color:var(--merchant-critical)]">{exportError}</span>
            ) : null}
            <MerchantButton
              type="button"
              onClick={async () => {
                try {
                  setExportingCsv(true);
                  setExportError(null);
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
                  setExportError(t('dashboard.analytics.trends.exportError'));
                } finally {
                  setExportingCsv(false);
                }
              }}
              disabled={exportingCsv}
              variant="secondary"
            >
              {exportingCsv
                ? t('dashboard.analytics.trends.exporting')
                : t('dashboard.analytics.trends.exportCsv')}
            </MerchantButton>
          </div>
        }
      >
        <div className="p-5">
          {loadingTrends ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-brand)]"></div>
            </div>
          ) : trendsError ? (
            <div className="space-y-4 rounded-[1rem] border border-[color:var(--merchant-warning-soft)] bg-[color:var(--merchant-warning-soft)]/40 px-4 py-5 text-sm text-[color:var(--merchant-muted-strong)]">
              <p>{trendsError}</p>
              <MerchantButton type="button" onClick={loadTrends} variant="secondary">
                {t('dashboard.analytics.trends.retry')}
              </MerchantButton>
            </div>
          ) : chartData.length > 0 ? (
            <div className="w-full h-80">
              <ResponsiveContainer width="100%" height="100%">
                {(metric === 'gmv' || metric === 'orders') ? (
                  <BarChart 
                    data={chartData} 
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
                      dataKey="current" 
                      name={t('dashboard.analytics.trends.currentPeriod')} 
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                    {hasComparisonSeries ? (
                      <Bar
                        dataKey="previous"
                        name={t('dashboard.analytics.trends.priorPeriod')}
                        fill="#cbd5e1"
                        radius={[4, 4, 0, 0]}
                      />
                    ) : null}
                  </BarChart>
                ) : (
                  <LineChart 
                    data={chartData} 
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
                      dataKey="current" 
                      name={t('dashboard.analytics.trends.currentPeriod')} 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    {hasComparisonSeries ? (
                      <Line
                        type="monotone"
                        dataKey="previous"
                        name={t('dashboard.analytics.trends.priorPeriod')}
                        stroke="#94a3b8"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    ) : null}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-[color:var(--merchant-muted)]">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-[color:var(--merchant-muted)]" />
                <p className="text-sm">{t('dashboard.analytics.trends.noData')}</p>
                <p className="text-xs mt-1 text-[color:var(--merchant-muted)]">
                  {t('dashboard.analytics.trends.noDataHelp')}
                </p>
              </div>
            </div>
          )}
        </div>
      </SurfaceCard>

      {/* Summary */}
      <div className="merchant-panel merchant-panel-muted p-4">
        <h3 className="font-medium text-[color:var(--merchant-ink)] mb-2">
          {t('dashboard.analytics.help.title')}
        </h3>
        <ul className="text-sm text-[color:var(--merchant-muted-strong)] space-y-1">
          <li>{t('dashboard.analytics.help.clickThrough')}</li>
          <li>{t('dashboard.analytics.help.orderRateFromClicks')}</li>
          <li>{t('dashboard.analytics.help.paymentSuccess')}</li>
        </ul>
      </div>
    </div>
  );
}
