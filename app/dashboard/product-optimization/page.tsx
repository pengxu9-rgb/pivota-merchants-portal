'use client';

import { useEffect, useMemo, useState } from 'react';
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

const emptyForm: EnrichmentFormState = {
  title_override: '',
  summary_short: '',
  bullet_points: [],
  usage_scenarios: [],
  audience_tags: [],
  topic_tags: [],
  regulatory_disclaimer_local: '',
};

export default function ProductOptimizationPage() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<MerchantProductListItem[]>([]);
  const [search, setSearch] = useState('');

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

  useEffect(() => {
    loadProducts();
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
      alert('已完成 AI 优化，并刷新了质量评分。');
    } catch (err) {
      console.error('Failed to run auto optimization', err);
      alert('AI 一键优化失败，请稍后再试。');
    } finally {
      setOptimizing(false);
    }
  };

  const filteredProducts = products.filter((item) => {
    const title = item.standard?.title || '';
    const overrideTitle = item.enrichment?.title_override || '';
    const query = search.toLowerCase();
    if (!query) return true;
    return (
      title.toLowerCase().includes(query) ||
      overrideTitle.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: product list */}
      <div className="lg:col-span-1 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Product Optimization
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            基于 Pivota enrichment & 质量评分，优化商品在 Agent 端的曝光与转化。
          </p>
        </div>

        <div className="bg-white rounded-lg shadow border">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="按标题搜索商品..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border rounded-md text-sm"
              />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                暂无商品。
              </div>
            ) : (
              filteredProducts.map((item) => {
                const isActive =
                  selected &&
                  selected.platform === item.platform &&
                  selected.platform_product_id === item.platform_product_id;
                const titleOverride = item.enrichment?.title_override;
                const title = titleOverride || item.standard?.title || '-';
                const score = item.quality?.content_quality_score;

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
                        {typeof score === 'number' && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                            CQ {score.toFixed(0)}
                          </span>
                        )}
                      </div>
                      {titleOverride && (
                        <p className="text-[11px] text-blue-600 mt-0.5 truncate">
                          已优化标题
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
              请选择左侧列表中的一个商品开始优化。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Standard view */}
            <div className="bg-white rounded-lg shadow border p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-800">
                源平台商品（只读）
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
                    原始标题
                  </div>
                  <div className="font-medium text-gray-900">
                    {detail.standard.title || '-'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500 mb-0.5">平台</div>
                    <div className="font-medium">
                      {detail.platform.toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-0.5">价格</div>
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
                  <div className="text-xs text-gray-500 mb-0.5">描述</div>
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
                  Pivota enrichment（可编辑）
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoOptimize}
                    disabled={optimizing || !selected}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {optimizing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    AI 一键优化
                  </button>
                  <button
                    type="button"
                    onClick={handlePreviewQuality}
                    disabled={previewLoading || !qualityPayload}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    {previewLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    预览质量分
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndEval}
                    disabled={saving || !qualityPayload}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    保存并打分
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    优化标题（Agent 优先使用）
                  </label>
                  <input
                    type="text"
                    value={form.title_override}
                    onChange={(e) =>
                      handleFormChange('title_override', e.target.value)
                    }
                    placeholder="例如：轻量缓震跑鞋，适合日常通勤和城市跑步"
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Summary（1–2 句话，Agent 摘要）
                  </label>
                  <textarea
                    value={form.summary_short}
                    onChange={(e) =>
                      handleFormChange('summary_short', e.target.value)
                    }
                    rows={2}
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    placeholder="简短说明适合谁、解决什么问题。"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-700">
                      卖点 Bullet（建议 3–8 条）
                    </label>
                    <button
                      type="button"
                      onClick={addBullet}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      + 添加
                    </button>
                  </div>
                  <div className="space-y-1">
                    {form.bullet_points.length === 0 && (
                      <p className="text-[11px] text-gray-400">
                        当前无卖点，点击“添加”开始填写。
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
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      使用场景（逗号分隔）
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
                      placeholder="例如：日常通勤, 城市慢跑"
                      className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      目标人群（逗号分隔）
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
                      placeholder="例如：上班族, 跑步初学者"
                      className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    主题标签（逗号分隔）
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
                    placeholder="例如：高性价比, 入门级, 环保"
                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    合规声明（可选，仅 Pivota 使用）
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
                    placeholder="例如：本产品为运动鞋，不具备医疗功效。"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1 border-t mt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs border rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    {saving ? '保存中…' : '仅保存 enrichment'}
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
              质量评分（Content / Model Readiness）
            </h2>
          </div>
          {!qualityPreview ? (
            <p className="text-sm text-gray-500">
              暂无评分，点击右侧“预览质量分”或“保存并打分”获取。
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
                      待改进建议
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
  );
}
