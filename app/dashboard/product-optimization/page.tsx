'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Package, Search, Loader2, Wand2, CheckCircle2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type MerchantProductListItem = {
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
};

type MerchantProductDetail = {
  merchant_id: string;
  platform: string;
  platform_product_id: string;
  standard: any;
  enrichment?: any;
  quality?: any;
};

type EnrichmentFormState = {
  title_override: string;
  summary_short: string;
  bullet_points: string[];
  usage_scenarios: string[];
  audience_tags: string[];
  topic_tags: string[];
  regulatory_disclaimer_local: string;
};

type ReadinessSummary = {
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

const emptyForm: EnrichmentFormState = {
  title_override: '',
  summary_short: '',
  bullet_points: [],
  usage_scenarios: [],
  audience_tags: [],
  topic_tags: [],
  regulatory_disclaimer_local: '',
};

const formatReadinessCode = (value: string) =>
  value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

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

export default function ProductOptimizationPage() {
  const searchParams = useSearchParams();
  const fromReadiness = searchParams.get('source') === 'readiness';
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<MerchantProductListItem[]>([]);
  const [search, setSearch] = useState('');
  const [readinessSummary, setReadinessSummary] = useState<ReadinessSummary | null>(null);

  const [selected, setSelected] = useState<{
    platform: string;
    platform_product_id: string;
  } | null>(null);
  const [detail, setDetail] = useState<MerchantProductDetail | null>(null);
  const [form, setForm] = useState<EnrichmentFormState>(emptyForm);

  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [qualityPreview, setQualityPreview] = useState<any | null>(null);
  const [lastOptimizedAt, setLastOptimizedAt] = useState<Record<string, number>>(
    {}
  );
  const [sortBy, setSortBy] = useState<'default' | 'cq_desc' | 'mr_desc'>(
    'default'
  );
  const [showOnlyLowQuality, setShowOnlyLowQuality] = useState(false);
  const [bulkOptimizing, setBulkOptimizing] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    const loadReadinessSummary = async () => {
      try {
        const response = await apiClient.get('/merchant/dashboard/readiness');
        const payload = response?.data?.data || response?.data || response;
        setReadinessSummary(payload || null);
      } catch (err) {
        console.warn('Failed to load readiness summary', err);
      }
    };

    void loadReadinessSummary();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await apiClient.listMerchantProducts({
        page: 1,
        page_size: 50,
      });
      setProducts(data.items || []);
      // Auto-select first product
      if (data.items && data.items.length > 0) {
        const first = data.items[0];
        handleSelect(first.platform, first.platform_product_id);
      }
    } catch (err) {
      console.error('Failed to load merchant products', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (platform: string, platformProductId: string) => {
    setSelected({ platform, platform_product_id: platformProductId });
    setDetail(null);
    setQualityPreview(null);
    setForm(emptyForm);

    try {
      const data = await apiClient.getMerchantProductDetail(
        platform,
        platformProductId
      );
      setDetail(data);
      const enrichment = data.enrichment || {};
      setForm({
        title_override: enrichment.title_override || '',
        summary_short: enrichment.summary_short || '',
        bullet_points: enrichment.bullet_points || [],
        usage_scenarios: enrichment.usage_scenarios || [],
        audience_tags: enrichment.audience_tags || [],
        topic_tags: enrichment.topic_tags || [],
        regulatory_disclaimer_local:
          enrichment.regulatory_disclaimer_local || '',
      });
      if (data.quality) {
        setQualityPreview(data.quality);
      }
    } catch (err) {
      console.error('Failed to load merchant product detail', err);
    }
  };

  const handleFormChange = (field: keyof EnrichmentFormState, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleBulletChange = (index: number, value: string) => {
    const next = [...form.bullet_points];
    next[index] = value;
    handleFormChange('bullet_points', next);
  };

  const addBullet = () => {
    handleFormChange('bullet_points', [...form.bullet_points, '']);
  };

  const removeBullet = (index: number) => {
    const next = form.bullet_points.filter((_, i) => i !== index);
    handleFormChange('bullet_points', next);
  };

  const parseTags = (input: string) =>
    input
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

  const formatTags = (tags: string[]) => tags.join(', ');

  const currentStandard = detail?.standard;

  const qualityPayload = useMemo(() => {
    if (!currentStandard) return null;
    const priceValue =
      typeof currentStandard.price === 'number'
        ? currentStandard.price
        : currentStandard.price?.value;

    return {
      title_local: form.title_override || currentStandard.title || '',
      description_local:
        currentStandard.description ||
        currentStandard.description_text ||
        '',
      price_local_value: priceValue ?? null,
      main_image_url:
        currentStandard.image_url ||
        currentStandard.main_image_url ||
        currentStandard.images?.[0] ||
        '',
      summary_short: form.summary_short,
      bullet_points: form.bullet_points,
      usage_scenarios: form.usage_scenarios,
      audience_tags: form.audience_tags,
      topic_tags: form.topic_tags,
    };
  }, [currentStandard, form]);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = {
        title_override: form.title_override || null,
        summary_short: form.summary_short || null,
        bullet_points: form.bullet_points,
        usage_scenarios: form.usage_scenarios,
        audience_tags: form.audience_tags,
        topic_tags: form.topic_tags,
        regulatory_disclaimer_local:
          form.regulatory_disclaimer_local || null,
      };
      const res = await apiClient.updateMerchantProductEnrichment(
        selected.platform,
        selected.platform_product_id,
        payload
      );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              enrichment: res.enrichment || res,
            }
          : prev
      );
      // Update list item enrichment if present
      setProducts((prev) =>
        prev.map((item) =>
          item.platform === selected.platform &&
          item.platform_product_id === selected.platform_product_id
            ? { ...item, enrichment: res.enrichment || res }
            : item
        )
      );
    } catch (err) {
      console.error('Failed to save enrichment', err);
      alert('保存失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewQuality = async () => {
    if (!qualityPayload) return;
    setPreviewLoading(true);
    try {
      const res = await apiClient.previewProductQuality(qualityPayload);
      setQualityPreview(res.data || res);
    } catch (err) {
      console.error('Failed to preview quality', err);
      alert('预览质量评分失败，请稍后重试。');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveAndEval = async () => {
    if (!selected || !qualityPayload) return;
    setSaving(true);
    setPreviewLoading(true);
    try {
      await handleSave();
      const res = await apiClient.evalProductQuality(
        selected.platform,
        selected.platform_product_id,
        qualityPayload,
        'default'
      );
      const data = res.data || res;
      setQualityPreview(data);
      // Update list snapshot scores
      if (data && typeof data.content_quality_score !== 'undefined') {
        setProducts((prev) =>
          prev.map((item) =>
            item.platform === selected.platform &&
            item.platform_product_id === selected.platform_product_id
              ? {
                  ...item,
                  quality: {
                    ...(item.quality || {}),
                    content_quality_score: data.content_quality_score,
                    model_readiness_score: data.model_readiness_score,
                    conversion_potential_score:
                      data.conversion_potential_score,
                  },
                }
              : item
          )
        );
      }
    } catch (err) {
      console.error('Failed to save & evaluate quality', err);
      alert('保存并打分失败，请稍后重试。');
    } finally {
      setSaving(false);
      setPreviewLoading(false);
    }
  };

  const handleAutoOptimize = async () => {
    if (!selected) return;
    const key = `${selected.platform}|${selected.platform_product_id}`;
    const now = Date.now();
    const last = lastOptimizedAt[key];
    if (last && now - last < 30_000) {
      const secs = Math.ceil((30_000 - (now - last)) / 1000);
      alert(`AI 一键优化冷却中，请 ${secs} 秒后再试。`);
      return;
    }
    setOptimizing(true);
    try {
      const data = await apiClient.runMerchantProductOptimization(
        selected.platform,
        selected.platform_product_id
      );
      // Update detail & form from returned enrichment
      setDetail(data);
      const enrichment = data.enrichment || {};
      setForm({
        title_override: enrichment.title_override || '',
        summary_short: enrichment.summary_short || '',
        bullet_points: enrichment.bullet_points || [],
        usage_scenarios: enrichment.usage_scenarios || [],
        audience_tags: enrichment.audience_tags || [],
        topic_tags: enrichment.topic_tags || [],
        regulatory_disclaimer_local:
          enrichment.regulatory_disclaimer_local || '',
      });
      // Update quality preview
      if (data.quality) {
        setQualityPreview(data.quality);
      }
      // Update list item enrichment & scores
      setProducts((prev) =>
        prev.map((item) =>
          item.platform === selected.platform &&
          item.platform_product_id === selected.platform_product_id
            ? {
                ...item,
                enrichment: enrichment,
                quality: {
                  ...(item.quality || {}),
                  content_quality_score:
                    data.quality?.content_quality_score ??
                    item.quality?.content_quality_score ??
                    null,
                  model_readiness_score:
                    data.quality?.model_readiness_score ??
                    item.quality?.model_readiness_score ??
                    null,
                  conversion_potential_score:
                    data.quality?.conversion_potential_score ??
                    item.quality?.conversion_potential_score ??
                    null,
                  last_evaluated_at:
                    data.quality?.snapshot_date ??
                    item.quality?.last_evaluated_at ??
                    null,
                },
              }
            : item
        )
      );
      setLastOptimizedAt((prev) => ({
        ...prev,
        [key]: Date.now(),
      }));
      alert('已完成 AI 优化，并刷新了质量评分。');
    } catch (err) {
      console.error('Failed to run auto optimization', err);
      alert('AI 一键优化失败，请稍后再试。');
    } finally {
      setOptimizing(false);
    }
  };

  const filteredProducts = (() => {
    // Text search
    const base = products.filter((item) => {
      const title = item.standard?.title || '';
      const overrideTitle = item.enrichment?.title_override || '';
      const query = search.toLowerCase();
      if (!query) return true;
      return (
        title.toLowerCase().includes(query) ||
        overrideTitle.toLowerCase().includes(query)
      );
    });

    // Optional low-quality filter
    const filtered = base.filter((item) => {
      if (!showOnlyLowQuality) return true;
      const cq = item.quality?.content_quality_score;
      // Treat undefined scores as "not low-quality" for this filter
      return typeof cq === 'number' && cq < 60;
    });

    // Sorting
    if (sortBy === 'default') {
      return filtered;
    }

    const sorted = [...filtered];
    if (sortBy === 'cq_desc') {
      sorted.sort((a, b) => {
        const av = typeof a.quality?.content_quality_score === 'number'
          ? a.quality!.content_quality_score!
          : -1;
        const bv = typeof b.quality?.content_quality_score === 'number'
          ? b.quality!.content_quality_score!
          : -1;
        return bv - av;
      });
    } else if (sortBy === 'mr_desc') {
      sorted.sort((a, b) => {
        const av = typeof a.quality?.model_readiness_score === 'number'
          ? a.quality!.model_readiness_score!
          : -1;
        const bv = typeof b.quality?.model_readiness_score === 'number'
          ? b.quality!.model_readiness_score!
          : -1;
        return bv - av;
      });
    }
    return sorted;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  const isInCooldown = (() => {
    if (!selected) return false;
    const key = `${selected.platform}|${selected.platform_product_id}`;
    const ts = lastOptimizedAt[key];
    if (!ts) return false;
    return Date.now() - ts < 30_000;
  })();

  const readinessIssues =
    readinessSummary?.blocker_breakdown && readinessSummary.blocker_breakdown.length > 0
      ? readinessSummary.blocker_breakdown
      : (readinessSummary?.top_blockers || []).slice(0, 3).map((code) => ({
          code,
          label: formatReadinessCode(code),
          count: 0,
        }));

  return (
    <div className="space-y-6">
      {readinessSummary && (
        <div className={`rounded-xl border p-5 ${getReadinessTone(readinessSummary.tier).card}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getReadinessTone(readinessSummary.tier).badge}`}>
                  {readinessSummary.label}
                </span>
                <span className="text-sm font-medium text-slate-900">
                  LLM readiness score {readinessSummary.score ?? '—'}
                </span>
                <span className="text-sm text-slate-600">
                  {readinessSummary.ready_variant_count} ready / {readinessSummary.blocked_variant_count} blocked variants
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-bold text-gray-900">
                {fromReadiness ? 'Readiness optimization plan' : 'Product Optimization'}
              </h1>
              <p className="mt-1 text-sm text-slate-700">
                {readinessSummary.summary_text || 'Use this page to fix the catalog and setup issues that are blocking agent commerce.'}
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {readinessSummary.action_text || readinessSummary.next_action || 'Start with the issues below, then optimize the affected products.'}
              </p>
            </div>
            <a
              href="/dashboard/integrations"
              className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Review integrations
            </a>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg bg-white/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Top issues to fix
              </div>
              <div className="mt-3 space-y-2">
                {readinessIssues.length > 0 ? (
                  readinessIssues.map((issue) => (
                    <div key={issue.code} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                      <span className="text-sm text-slate-800">{issue.label}</span>
                      {issue.count > 0 && (
                        <span className="text-xs font-semibold text-slate-500">
                          {issue.count} variants
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                    No blocking issues are active right now.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-white/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recommended actions
              </div>
              <div className="mt-3 space-y-2">
                {(readinessSummary.recommended_actions || []).length > 0 ? (
                  readinessSummary.recommended_actions?.map((action) => (
                    <div key={action} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                      {action}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                    Optimize any low-quality products and rerun readiness when you make catalog changes.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: product list */}
      <div className="lg:col-span-1 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Catalog products</h2>
            <p className="text-gray-600 text-sm mt-1">
              Improve titles, summaries, and quality scores for the products that still need work.
            </p>
          </div>
          <button
            type="button"
            disabled={bulkOptimizing}
            onClick={async () => {
              if (bulkOptimizing) return;
              const confirmed = window.confirm(
                'Run AI enrichment and scoring for a batch of products?\n\nThis may take a little while and will process recently synced items first.'
              );
              if (!confirmed) return;
              setBulkOptimizing(true);
              try {
                const res = await apiClient.runMerchantBulkEnrichment({
                  // v1: let backend decide platforms & limit defaults
                  limit: 100,
                });
                const data = res.data || res;
                alert(
                  `Bulk optimization completed.\nProcessed: ${data.processed}\nSkipped: ${data.skipped}`
                );
                await loadProducts();
              } catch (err) {
                console.error('Bulk enrichment failed', err);
                alert('Bulk optimization failed, please try again later.');
              } finally {
                setBulkOptimizing(false);
              }
            }}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
          >
            {bulkOptimizing ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Wand2 className="w-3 h-3 mr-1" />
                Bulk optimize
              </>
            )}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow border">
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products by title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border rounded-md text-sm"
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as 'default' | 'cq_desc' | 'mr_desc')
                  }
                  className="border rounded px-2 py-0.5 text-[11px] bg-white"
                >
                  <option value="default">Recent sync</option>
                  <option value="cq_desc">CQ ↓</option>
                  <option value="mr_desc">MR ↓</option>
                </select>
              </div>
              <label className="flex items-center gap-1 text-gray-500">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={showOnlyLowQuality}
                  onChange={(e) => setShowOnlyLowQuality(e.target.checked)}
                />
                <span>Low CQ only (&lt; 60)</span>
              </label>
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No products found.
              </div>
            ) : (
              filteredProducts.map((item) => {
                const isActive =
                  selected &&
                  selected.platform === item.platform &&
                  selected.platform_product_id === item.platform_product_id;
                const titleOverride = item.enrichment?.title_override;
                const title = titleOverride || item.standard?.title || '-';
                const cqScore = item.quality?.content_quality_score;
                const mrScore = item.quality?.model_readiness_score;

                return (
                  <button
                    key={`${item.platform}-${item.platform_product_id}`}
                    onClick={() =>
                      handleSelect(item.platform, item.platform_product_id)
                    }
                    className={`w-full flex items-start gap-3 px-3 py-2 text-left text-sm border-b last:border-b-0 hover:bg-gray-50 ${
                      isActive ? 'bg-blue-50/70' : ''
                    }`}
                  >
                    <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.standard?.main_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.standard.main_image_url}
                          alt={title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 truncate">
                          {title}
                        </p>
                        <div className="flex flex-col items-end gap-1">
                          {typeof cqScore === 'number' && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                              CQ {cqScore.toFixed(0)}
                            </span>
                          )}
                          {typeof mrScore === 'number' && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                              MR {mrScore.toFixed(0)}
                            </span>
                          )}
                        </div>
                      </div>
                      {titleOverride && (
                        <p className="text-[11px] text-blue-600 mt-0.5 truncate">
                          Optimized title
                        </p>
                      )}
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {item.platform.toUpperCase()} ·{' '}
                        {item.standard?.price?.value ??
                          item.standard?.price ??
                          '-'}{' '}
                        {typeof item.standard?.price === 'number'
                          ? ''
                          : item.standard?.price?.currency || ''}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right: detail & enrichment editor */}
      <div className="lg:col-span-2 space-y-4">
        {!detail ? (
          <div className="h-full flex items-center justify-center border rounded-lg bg-white shadow">
              <p className="text-gray-500 text-sm">
                Select a product on the left to start optimizing.
              </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Standard view */}
            <div className="bg-white rounded-lg shadow border p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-800">
                Source platform product (read-only)
              </h2>
              <div className="w-full h-40 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                {detail.standard?.image_url || detail.standard?.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      detail.standard.image_url ||
                      detail.standard.images[0]
                    }
                    alt={detail.standard.title || ''}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package className="w-10 h-10 text-gray-400" />
                )}
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">
                    Original title
                  </div>
                  <div className="font-medium text-gray-900">
                    {detail.standard.title || '-'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500 mb-0.5">Platform</div>
                    <div className="font-medium">
                      {detail.platform.toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-0.5">Price</div>
                    <div className="font-medium">
                      {(() => {
                        const p = detail.standard;
                        const value =
                          typeof p.price === 'number'
                            ? p.price
                            : p.price?.value;
                        const currency =
                          typeof p.price === 'number'
                            ? p.currency
                            : p.price?.currency;
                        if (typeof value === 'number') {
                          return `${value} ${currency || ''}`;
                        }
                        return '-';
                      })()}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Description</div>
                  <div className="text-xs text-gray-700 line-clamp-4">
                    {detail.standard.description ||
                      detail.standard.description_text ||
                      '无描述'}
                  </div>
                </div>
              </div>
            </div>

            {/* Enrichment editor */}
            <div className="bg-white rounded-lg shadow border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">
                  Pivota enrichment (editable)
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoOptimize}
                    disabled={optimizing || !selected}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs whitespace-nowrap bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {optimizing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    AI optimize
                  </button>
                  <button
                    type="button"
                    onClick={handlePreviewQuality}
                    disabled={previewLoading || !qualityPayload}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs whitespace-nowrap border rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    {previewLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    Preview score
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndEval}
                    disabled={saving || !qualityPayload}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs whitespace-nowrap bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    Save/Score
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Optimized title (used by Agent)
                  </label>
                  <input
                    type="text"
                    value={form.title_override}
                    onChange={(e) =>
                      handleFormChange('title_override', e.target.value)
                    }
                    placeholder="E.g. Lightweight running shoes for daily commute and city jogging"
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Summary (1–2 sentences, Agent-facing)
                  </label>
                  <textarea
                    value={form.summary_short}
                    onChange={(e) =>
                      handleFormChange('summary_short', e.target.value)
                    }
                    rows={2}
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    placeholder="Briefly describe who this is for and what problem it solves."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-700">
                      Selling points (3–8 bullets)
                    </label>
                    <button
                      type="button"
                      onClick={addBullet}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="space-y-1">
                    {form.bullet_points.length === 0 && (
                      <p className="text-[11px] text-gray-400">
                        No selling points yet. Click “Add” to start.
                      </p>
                    )}
                    {form.bullet_points.map((bp, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <span className="text-[11px] text-gray-400">
                          •
                        </span>
                        <input
                          type="text"
                          value={bp}
                          onChange={(e) =>
                            handleBulletChange(idx, e.target.value)
                          }
                          className="flex-1 px-2.5 py-1 border rounded-md text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => removeBullet(idx)}
                          className="text-[11px] text-gray-400 hover:text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Usage scenarios (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={formatTags(form.usage_scenarios)}
                      onChange={(e) =>
                        handleFormChange(
                          'usage_scenarios',
                          parseTags(e.target.value)
                        )
                      }
                      placeholder="E.g. Daily commute, city jogging"
                      className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Target audience (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={formatTags(form.audience_tags)}
                      onChange={(e) =>
                        handleFormChange(
                          'audience_tags',
                          parseTags(e.target.value)
                        )
                      }
                      placeholder="E.g. office workers, running beginners"
                      className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Topic tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formatTags(form.topic_tags)}
                    onChange={(e) =>
                      handleFormChange(
                        'topic_tags',
                        parseTags(e.target.value)
                      )
                    }
                    placeholder="E.g. high value, entry level, eco-friendly"
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Compliance disclaimer (optional, Pivota only)
                  </label>
                  <textarea
                    value={form.regulatory_disclaimer_local}
                    onChange={(e) =>
                      handleFormChange(
                        'regulatory_disclaimer_local',
                        e.target.value
                      )
                    }
                    rows={2}
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    placeholder="E.g. This is a consumer product and does not provide medical effects."
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1 border-t mt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs border rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save enrichment only'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quality panel */}
        <div className="bg-white rounded-lg shadow border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              Quality scores (Content / Model Readiness)
            </h2>
          </div>
          {!qualityPreview ? (
            <p className="text-sm text-gray-500">
              No scores yet. Use “Preview score” or “Save & score” on the right to compute them.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">
                    Content Quality
                  </div>
                  <div className="text-base font-semibold text-blue-700">
                    {qualityPreview.content_quality_score != null
                      ? qualityPreview.content_quality_score.toFixed(1)
                      : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">
                    Model Readiness
                  </div>
                  <div className="text-base font-semibold text-emerald-700">
                    {qualityPreview.model_readiness_score != null
                      ? qualityPreview.model_readiness_score.toFixed(1)
                      : '--'}
                  </div>
                </div>
              </div>

              {Array.isArray(qualityPreview.problems) &&
                qualityPreview.problems.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-1">
                      Suggestions to improve
                    </div>
                    <ul className="space-y-1">
                      {qualityPreview.problems.map((p: any, idx: number) => (
                        <li
                          key={idx}
                          className="text-xs text-gray-700 flex items-start gap-1.5"
                        >
                          <span className="mt-0.5 w-1 h-1 rounded-full bg-amber-500" />
                          <span>{p.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
