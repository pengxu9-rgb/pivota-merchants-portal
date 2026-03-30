'use client';

import { useEffect, useMemo, useState } from 'react';
import { Promotion, PromotionStatus, computePromotionStatus } from '@/types/promotion';
import { PromotionForm } from '@/components/portal/PromotionForm';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import {
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';

type FilterStatus = 'ALL' | PromotionStatus;
type FilterType = 'ALL' | 'FLASH_SALE' | 'MULTI_BUY_DISCOUNT';

export function PromotionsWorkspace() {
  const { t, language } = useMerchantLanguage();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [filterType, setFilterType] = useState<FilterType>('ALL');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedPromo, setSelectedPromo] = useState<Promotion | undefined>(undefined);

  useEffect(() => {
    void loadPromotions();
  }, []);

  const loadPromotions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('merchant_token') || localStorage.getItem('token')
          : null;
      const merchantId =
        typeof window !== 'undefined' ? localStorage.getItem('merchant_id') : null;

      const res = await fetch('/api/portal/promotions', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(merchantId ? { 'X-Merchant-Id': merchantId } : {}),
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load promotions.');
      }
      const data = await res.json();
      setPromotions(data.promotions || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load promotions.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPromos = useMemo(() => {
    return promotions.filter((promotion) => {
      const status = computePromotionStatus(promotion);
      if (filterStatus !== 'ALL' && status !== filterStatus) return false;
      if (filterType !== 'ALL' && promotion.type !== filterType) return false;
      if (search.trim()) {
        const term = search.toLowerCase();
        const haystack = `${promotion.name} ${promotion.description || ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [promotions, filterStatus, filterType, search]);

  const statusCounts = useMemo(() => {
    return promotions.reduce(
      (acc, promotion) => {
        const status = computePromotionStatus(promotion);
        acc.total += 1;
        if (status === 'ACTIVE') acc.active += 1;
        if (status === 'UPCOMING') acc.upcoming += 1;
        if (status === 'ENDED') acc.ended += 1;
        return acc;
      },
      { total: 0, active: 0, upcoming: 0, ended: 0 }
    );
  }, [promotions]);

  const openCreate = () => {
    setFormMode('create');
    setSelectedPromo(undefined);
    setShowForm(true);
  };

  const openEdit = (promotion: Promotion) => {
    setFormMode('edit');
    setSelectedPromo(promotion);
    setShowForm(true);
  };

  const handleEnd = async (promotion: Promotion) => {
    if (!confirm(t('dashboard.promotions.confirmEnd', { name: promotion.name }))) return;
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('merchant_token') || localStorage.getItem('token')
        : null;
    const merchantId =
      typeof window !== 'undefined' ? localStorage.getItem('merchant_id') : null;
    const res = await fetch(`/api/portal/promotions/${promotion.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(merchantId ? { 'X-Merchant-Id': merchantId } : {}),
      },
      body: JSON.stringify({ endAt: new Date().toISOString() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || t('dashboard.promotions.errorEnd'));
      return;
    }
    await loadPromotions();
  };

  const handleDelete = async (promotion: Promotion) => {
    if (!confirm(t('dashboard.promotions.confirmDelete', { name: promotion.name }))) return;
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('merchant_token') || localStorage.getItem('token')
        : null;
    const merchantId =
      typeof window !== 'undefined' ? localStorage.getItem('merchant_id') : null;
    const res = await fetch(`/api/portal/promotions/${promotion.id}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(merchantId ? { 'X-Merchant-Id': merchantId } : {}),
      },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || t('dashboard.promotions.errorDelete'));
      return;
    }
    await loadPromotions();
  };

  const renderStatus = (promotion: Promotion) => {
    const status = computePromotionStatus(promotion);
    const tone = status === 'ACTIVE' ? 'success' : status === 'UPCOMING' ? 'brand' : 'neutral';
    const label =
      status === 'ACTIVE'
        ? t('dashboard.promotions.filters.active')
        : status === 'UPCOMING'
          ? t('dashboard.promotions.filters.upcoming')
          : t('dashboard.promotions.filters.ended');
    return <StatusBadge tone={tone}>{label}</StatusBadge>;
  };

  const formatRange = (promotion: Promotion) => {
    const format = (timestamp: string) =>
      new Intl.DateTimeFormat(language, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestamp));
    return `${format(promotion.startAt)} → ${format(promotion.endAt)}`;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('dashboard.promotions.eyebrow')}
        title={t('dashboard.promotions.title')}
        description={t('dashboard.promotions.description')}
        actions={
          <MerchantButton type="button" onClick={openCreate}>
            {t('dashboard.promotions.newPromotion')}
          </MerchantButton>
        }
      />

      <SurfaceCard strong>
        <div className="grid gap-4 px-6 py-6 lg:grid-cols-4 lg:px-8">
          <div className="rounded-[1.2rem] border border-[color:var(--merchant-line)] bg-white/75 px-5 py-4">
            <div className="text-sm text-[color:var(--merchant-muted)]">
              {t('dashboard.promotions.summary.campaigns')}
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {statusCounts.total}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
              {t('dashboard.promotions.summary.totalConfigured')}
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-[color:var(--merchant-line)] bg-white/75 px-5 py-4">
            <div className="text-sm text-[color:var(--merchant-muted)]">
              {t('dashboard.promotions.summary.liveNow')}
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {statusCounts.active}
            </div>
            <div className="mt-1">
              <StatusBadge tone="success">
                {t('dashboard.promotions.summary.activeCampaigns')}
              </StatusBadge>
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-[color:var(--merchant-line)] bg-white/75 px-5 py-4">
            <div className="text-sm text-[color:var(--merchant-muted)]">
              {t('dashboard.promotions.summary.scheduled')}
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {statusCounts.upcoming}
            </div>
            <div className="mt-1">
              <StatusBadge tone="brand">
                {t('dashboard.promotions.summary.upcomingCampaigns')}
              </StatusBadge>
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-[color:var(--merchant-line)] bg-white/75 px-5 py-4">
            <div className="text-sm text-[color:var(--merchant-muted)]">
              {t('dashboard.promotions.summary.creatorVisibility')}
            </div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {t('dashboard.promotions.summary.exposedCount', {
                count: promotions.filter((promotion) => promotion.exposeToCreators).length,
              })}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
              {t('dashboard.promotions.summary.creatorVisibilityMeta')}
            </div>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex flex-col gap-3 px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              {(['ALL', 'ACTIVE', 'UPCOMING', 'ENDED'] as FilterStatus[]).map((status) => (
                <button
                  key={status}
                  className={`px-3 py-1.5 rounded-full border text-sm ${
                    filterStatus === status
                      ? 'border-[color:var(--merchant-brand)] bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]'
                      : 'border-[color:var(--merchant-line-strong)] text-[color:var(--merchant-muted-strong)]'
                  }`}
                  onClick={() => setFilterStatus(status)}
                >
                  {status === 'ALL'
                    ? t('dashboard.promotions.filters.allStatuses')
                    : status === 'ACTIVE'
                      ? t('dashboard.promotions.filters.active')
                      : status === 'UPCOMING'
                        ? t('dashboard.promotions.filters.upcoming')
                        : t('dashboard.promotions.filters.ended')}
                </button>
              ))}
            </div>

            <select
              className="merchant-input max-w-[220px]"
              value={filterType}
              onChange={(event) => setFilterType(event.target.value as FilterType)}
            >
              <option value="ALL">{t('dashboard.promotions.filters.allTypes')}</option>
              <option value="FLASH_SALE">{t('dashboard.promotions.filters.flashSale')}</option>
              <option value="MULTI_BUY_DISCOUNT">{t('dashboard.promotions.filters.multiBuyDiscount')}</option>
            </select>

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('dashboard.promotions.filters.searchPlaceholder')}
              className="merchant-input min-w-[220px] flex-1"
            />
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-[color:var(--merchant-muted)]">
                <th className="px-6 py-4">{t('dashboard.promotions.table.headers.campaign')}</th>
                <th className="px-4 py-4">{t('dashboard.promotions.table.headers.status')}</th>
                <th className="px-4 py-4">{t('dashboard.promotions.table.headers.window')}</th>
                <th className="px-4 py-4">{t('dashboard.promotions.table.headers.channels')}</th>
                <th className="px-4 py-4">{t('dashboard.promotions.table.headers.visibility')}</th>
                <th className="px-6 py-4 text-right">{t('dashboard.promotions.table.headers.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-[color:var(--merchant-muted)]">
                    {t('dashboard.promotions.table.loading')}
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-[color:var(--merchant-danger)]">
                    {error}
                  </td>
                </tr>
              ) : filteredPromos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-[color:var(--merchant-muted)]">
                    {t('dashboard.promotions.table.empty')}
                  </td>
                </tr>
              ) : (
                filteredPromos.map((promotion) => (
                  <tr key={promotion.id} className="border-t border-[color:var(--merchant-line)] align-top">
                    <td className="px-6 py-5">
                      <div className="max-w-[320px]">
                        <div className="text-base font-semibold text-[color:var(--merchant-ink)]">
                          {promotion.name}
                        </div>
                        <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
                          {promotion.description || t('dashboard.promotions.table.noNotes')}
                        </div>
                        <div className="mt-3 text-xs text-[color:var(--merchant-muted)]">
                          {promotion.type === 'FLASH_SALE'
                            ? t('dashboard.promotions.filters.flashSale')
                            : t('dashboard.promotions.filters.multiBuyDiscount')}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5">{renderStatus(promotion)}</td>
                    <td className="px-4 py-5 text-sm text-[color:var(--merchant-muted-strong)]">
                      {formatRange(promotion)}
                    </td>
                    <td className="px-4 py-5 text-sm text-[color:var(--merchant-muted-strong)]">
                      {(promotion.channels || []).join(', ') || t('dashboard.promotions.table.noChannels')}
                    </td>
                    <td className="px-4 py-5 text-sm text-[color:var(--merchant-muted-strong)]">
                      {promotion.exposeToCreators
                        ? t('dashboard.promotions.table.creatorVisible')
                        : t('dashboard.promotions.table.merchantOnly')}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex justify-end gap-2">
                        <MerchantButton kind="secondary" size="sm" type="button" onClick={() => openEdit(promotion)}>
                          {t('dashboard.promotions.table.edit')}
                        </MerchantButton>
                        {computePromotionStatus(promotion) !== 'ENDED' ? (
                          <MerchantButton kind="secondary" size="sm" type="button" onClick={() => void handleEnd(promotion)}>
                            {t('dashboard.promotions.table.endNow')}
                          </MerchantButton>
                        ) : null}
                        <MerchantButton kind="ghost" size="sm" type="button" onClick={() => void handleDelete(promotion)}>
                          {t('dashboard.promotions.table.delete')}
                        </MerchantButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      {showForm ? (
        <PromotionForm
          mode={formMode}
          initial={selectedPromo}
          onCancel={() => setShowForm(false)}
          onSubmitSuccess={() => {
            setShowForm(false);
            void loadPromotions();
          }}
        />
      ) : null}
    </div>
  );
}
