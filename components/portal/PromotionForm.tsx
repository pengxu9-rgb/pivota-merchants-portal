'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Promotion,
  PromotionConfig,
  PromotionType,
  computePromotionStatus,
} from '@/types/promotion';

type PromotionFormMode = 'create' | 'edit';

interface PromotionFormProps {
  mode: PromotionFormMode;
  initial?: Partial<Promotion>;
  onSubmitSuccess: () => void;
  onCancel: () => void;
}

type ScopeMode = 'all' | 'category' | 'product';

const toInput = (iso?: string, deltaMinutes = 0) => {
  const base = iso ? new Date(iso) : new Date();
  if (!iso && deltaMinutes) base.setMinutes(base.getMinutes() + deltaMinutes);
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const parseCsv = (val: string) =>
  val
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

function computeLabelPreview(values: {
  type?: PromotionType;
  config?: Partial<PromotionConfig>;
}): string {
  if (!values.type || !values.config) return '';

  if (values.type === 'FLASH_SALE' && values.config.kind === 'FLASH_SALE') {
    const f = (values.config as any).flashPrice;
    const o = (values.config as any).originalPrice;
    if (f && o) return `Flash deal: from $${o} to $${f}`;
    return 'Flash deal';
  }

  if (
    values.type === 'MULTI_BUY_DISCOUNT' &&
    values.config.kind === 'MULTI_BUY_DISCOUNT'
  ) {
    const q = (values.config as any).thresholdQuantity;
    const d = (values.config as any).discountPercent;
    if (q && d) return `Buy ${q}, get ${d}% off`;
    return 'Multi-buy discount';
  }

  return '';
}

export function PromotionForm({
  mode,
  initial,
  onSubmitSuccess,
  onCancel,
}: PromotionFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState<PromotionType>('MULTI_BUY_DISCOUNT');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState(toInput(undefined, 5));
  const [endAt, setEndAt] = useState(toInput(undefined, 60 * 24 * 7));
  const [channels, setChannels] = useState<string[]>(['creator_agents']);
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [categoryIds, setCategoryIds] = useState('');
  const [productIds, setProductIds] = useState('');
  const [exposeToCreators, setExposeToCreators] = useState(true);
  const [allowedCreatorIds, setAllowedCreatorIds] = useState('');
  const [config, setConfig] = useState<{
    flashPrice?: string;
    originalPrice?: string;
    stockLimit?: string;
    thresholdQuantity?: string;
    discountPercent?: string;
  }>({
    thresholdQuantity: '3',
    discountPercent: '10',
  });

  useEffect(() => {
    if (!initial) return;
    setName(initial.name || '');
    setDescription(initial.description || '');
    setType((initial.type as PromotionType) || 'MULTI_BUY_DISCOUNT');
    setStartAt(toInput(initial.startAt));
    setEndAt(toInput(initial.endAt));
    setChannels(initial.channels || ['creator_agents']);
    setExposeToCreators(initial.exposeToCreators ?? true);
    setAllowedCreatorIds((initial.allowedCreatorIds || []).join(', '));

    const sc = initial.scope || {};
    if (sc.global) {
      setScopeMode('all');
    } else if (sc.categoryIds && sc.categoryIds.length) {
      setScopeMode('category');
      setCategoryIds(sc.categoryIds.join(', '));
    } else if (sc.productIds && sc.productIds.length) {
      setScopeMode('product');
      setProductIds(sc.productIds.join(', '));
    }

    const cfg = initial.config as PromotionConfig | undefined;
    if (cfg?.kind === 'FLASH_SALE') {
      setConfig({
        flashPrice: String(cfg.flashPrice ?? ''),
        originalPrice: String(cfg.originalPrice ?? ''),
        stockLimit:
          cfg.stockLimit !== undefined && cfg.stockLimit !== null
            ? String(cfg.stockLimit)
            : '',
      });
    } else if (cfg?.kind === 'MULTI_BUY_DISCOUNT') {
      setConfig({
        thresholdQuantity: String(cfg.thresholdQuantity ?? ''),
        discountPercent: String(cfg.discountPercent ?? ''),
      });
    }
  }, [initial]);

  const labelPreview = useMemo(
    () =>
      computeLabelPreview({
        type,
        config:
          type === 'FLASH_SALE'
            ? {
                kind: 'FLASH_SALE',
                flashPrice: Number(config.flashPrice),
                originalPrice: Number(config.originalPrice),
              }
            : {
                kind: 'MULTI_BUY_DISCOUNT',
                thresholdQuantity: Number(config.thresholdQuantity),
                discountPercent: Number(config.discountPercent),
              },
      }),
    [type, config]
  );

  const toggleChannel = (ch: string) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleSubmit = async () => {
    setError(null);
    const errs: string[] = [];
    if (!name.trim()) errs.push('Name is required.');
    if (!startAt || !endAt) errs.push('Start and end times are required.');
    const s = new Date(startAt);
    const e = new Date(endAt);
    if (s && e && e.getTime() <= s.getTime()) {
      errs.push('End time must be after start time.');
    }
    if (channels.length === 0) errs.push('Select at least one channel.');

    if (type === 'FLASH_SALE') {
      const fp = Number(config.flashPrice);
      const op = Number(config.originalPrice);
      if (!fp || fp <= 0) errs.push('Flash price must be greater than 0.');
      if (!op || op < fp) errs.push('Original price must be >= flash price.');
    } else {
      const qty = Number(config.thresholdQuantity);
      const disc = Number(config.discountPercent);
      if (!qty || qty < 1) errs.push('Threshold quantity must be at least 1.');
      if (!disc || disc < 1 || disc > 100)
        errs.push('Discount percent must be between 1 and 100.');
    }

    if (errs.length) {
      setError(errs[0]);
      return;
    }

    const scope =
      scopeMode === 'all'
        ? { global: true }
        : scopeMode === 'category'
        ? { global: false, categoryIds: parseCsv(categoryIds) }
        : { global: false, productIds: parseCsv(productIds) };

    const payload = {
      name: name.trim(),
      description: description.trim(),
      type,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      channels,
      scope,
      config:
        type === 'FLASH_SALE'
          ? {
              kind: 'FLASH_SALE',
              flashPrice: Number(config.flashPrice),
              originalPrice: Number(config.originalPrice),
              ...(config.stockLimit ? { stockLimit: Number(config.stockLimit) } : {}),
            }
          : {
              kind: 'MULTI_BUY_DISCOUNT',
              thresholdQuantity: Number(config.thresholdQuantity),
              discountPercent: Number(config.discountPercent),
            },
      exposeToCreators,
      allowedCreatorIds: exposeToCreators ? parseCsv(allowedCreatorIds) : [],
    };

    setSubmitting(true);
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('merchant_token') || localStorage.getItem('token')
          : null;
      const merchantId =
        typeof window !== 'undefined' ? localStorage.getItem('merchant_id') : null;

      const res = await fetch(
        mode === 'create'
          ? '/api/portal/promotions'
          : `/api/portal/promotions/${initial?.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(merchantId ? { 'X-Merchant-Id': merchantId } : {}),
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save promotion.');
      }

      onSubmitSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save promotion. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const status = initial ? computePromotionStatus(initial as Promotion) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'New promotion' : 'Edit promotion'}
          </h3>
          <p className="text-sm text-gray-500">
            Manage discounts applied to your products and Creator Agents.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {status && (
        <div className="text-sm text-gray-500">
          Status: <span className="font-medium text-gray-700">{status}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              placeholder="Weekend bundle"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              rows={3}
              placeholder="Internal note (optional)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Start time</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">End time</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Type</label>
            <div className="flex gap-2">
              {(['FLASH_SALE', 'MULTI_BUY_DISCOUNT'] as PromotionType[]).map((t) => (
                <button
                  key={t}
                  className={`px-3 py-2 rounded-lg border ${
                    type === t
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700'
                  }`}
                  onClick={() => setType(t)}
                  type="button"
                >
                  {t === 'FLASH_SALE' ? 'Flash sale' : 'Multi-buy discount'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Channels</label>
            <div className="flex flex-wrap gap-2">
              {['web', 'app', 'creator_agents'].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  className={`px-3 py-1 rounded-full text-sm border ${
                    channels.includes(ch)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {ch === 'creator_agents' ? 'Creator Agents' : ch.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              When Creator Agents is enabled, this promotion may appear in AI shopping experiences.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <label className="text-sm font-medium text-gray-700">Apply to</label>
            <div className="flex gap-2">
              {(['all', 'category', 'product'] as ScopeMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setScopeMode(m)}
                  className={`px-3 py-1.5 rounded-lg border ${
                    scopeMode === m
                      ? 'border-blue-500 bg-white text-blue-700'
                      : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {m === 'all'
                    ? 'All products'
                    : m === 'category'
                    ? 'By category'
                    : 'By product'}
                </button>
              ))}
            </div>
            {scopeMode === 'category' && (
              <input
                value={categoryIds}
                onChange={(e) => setCategoryIds(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                placeholder="category ids, comma-separated"
              />
            )}
            {scopeMode === 'product' && (
              <input
                value={productIds}
                onChange={(e) => setProductIds(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                placeholder="product ids / SKUs, comma-separated"
              />
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <label className="text-sm font-medium text-gray-700">Config</label>
            {type === 'FLASH_SALE' ? (
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={config.flashPrice || ''}
                  onChange={(e) => setConfig((p) => ({ ...p, flashPrice: e.target.value }))}
                  className="rounded-lg border border-gray-200 px-3 py-2"
                  placeholder="Flash price"
                />
                <input
                  value={config.originalPrice || ''}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, originalPrice: e.target.value }))
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2"
                  placeholder="Original price"
                />
                <input
                  value={config.stockLimit || ''}
                  onChange={(e) => setConfig((p) => ({ ...p, stockLimit: e.target.value }))}
                  className="rounded-lg border border-gray-200 px-3 py-2"
                  placeholder="Stock limit (optional)"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={config.thresholdQuantity || ''}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, thresholdQuantity: e.target.value }))
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2"
                  placeholder="Threshold quantity"
                />
                <input
                  value={config.discountPercent || ''}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, discountPercent: e.target.value }))
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2"
                  placeholder="Discount %"
                />
              </div>
            )}
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <p className="text-xs text-gray-500">How this deal will be displayed</p>
              <p className="text-sm font-medium text-gray-800">
                {labelPreview || 'Configure the promotion to see a preview.'}
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Allow Creator Agents
              </label>
              <input
                type="checkbox"
                checked={exposeToCreators}
                onChange={(e) => setExposeToCreators(e.target.checked)}
              />
            </div>
            {exposeToCreators ? (
              <>
                <input
                  value={allowedCreatorIds}
                  onChange={(e) => setAllowedCreatorIds(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                  placeholder="Limit to creator IDs (optional, comma-separated)"
                />
                <p className="text-xs text-gray-500">
                  Leave empty to allow all eligible creators in Pivota&apos;s network.
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-500">
                This promotion will not be used by Creator Agents.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
