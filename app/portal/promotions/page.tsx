'use client';

import { useEffect, useMemo, useState } from 'react';
import { Promotion, PromotionStatus, computePromotionStatus } from '@/types/promotion';
import { PromotionForm } from '@/components/portal/PromotionForm';
import {
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';

type FilterStatus = 'ALL' | PromotionStatus;
type FilterType = 'ALL' | 'FLASH_SALE' | 'MULTI_BUY_DISCOUNT';

export default function PromotionsPage() {
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
    if (!confirm(`End "${promotion.name}" now?`)) return;
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
      alert(data.error || 'Failed to end promotion.');
      return;
    }
    await loadPromotions();
  };

  const handleDelete = async (promotion: Promotion) => {
    if (!confirm(`Delete "${promotion.name}"? This will remove the promotion.`)) return;
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
      alert(data.error || 'Failed to delete promotion.');
      return;
    }
    await loadPromotions();
  };

  const renderStatus = (promotion: Promotion) => {
    const status = computePromotionStatus(promotion);
    const tone = status === 'ACTIVE' ? 'success' : status === 'UPCOMING' ? 'brand' : 'neutral';
    return <StatusBadge tone={tone}>{status}</StatusBadge>;
  };

  const formatRange = (promotion: Promotion) => {
    const format = (timestamp: string) =>
      new Intl.DateTimeFormat('en', {
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
        eyebrow="Promotions"
        title="Plan merchant campaigns with clearer timing, targeting, and channel intent."
        description="Promotions should read like a campaign workspace, not a raw discount table. Use this page to manage live offers, upcoming launches, and creator visibility."
        actions={
          <MerchantButton type="button" onClick={openCreate}>
            New promotion
          </MerchantButton>
        }
      />

      <SurfaceCard strong>
        <div className="grid gap-4 px-6 py-6 lg:grid-cols-4 lg:px-8">
          <div className="rounded-[1.2rem] border border-[color:var(--merchant-line)] bg-white/75 px-5 py-4">
            <div className="text-sm text-[color:var(--merchant-muted)]">Campaigns</div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {statusCounts.total}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
              Total configured promotions
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-[color:var(--merchant-line)] bg-white/75 px-5 py-4">
            <div className="text-sm text-[color:var(--merchant-muted)]">Live now</div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {statusCounts.active}
            </div>
            <div className="mt-1">
              <StatusBadge tone="success">Active campaigns</StatusBadge>
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-[color:var(--merchant-line)] bg-white/75 px-5 py-4">
            <div className="text-sm text-[color:var(--merchant-muted)]">Scheduled</div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {statusCounts.upcoming}
            </div>
            <div className="mt-1">
              <StatusBadge tone="brand">Upcoming campaigns</StatusBadge>
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-[color:var(--merchant-line)] bg-white/75 px-5 py-4">
            <div className="text-sm text-[color:var(--merchant-muted)]">Creator visibility</div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {promotions.filter((promotion) => promotion.exposeToCreators).length} promotions exposed
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
              Eligible for creator-led commerce surfaces
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
                  {status === 'ALL' ? 'All statuses' : status}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {(['ALL', 'FLASH_SALE', 'MULTI_BUY_DISCOUNT'] as FilterType[]).map((type) => (
                <button
                  key={type}
                  className={`px-3 py-1.5 rounded-full border text-sm ${
                    filterType === type
                      ? 'border-[color:var(--merchant-brand)] bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]'
                      : 'border-[color:var(--merchant-line-strong)] text-[color:var(--merchant-muted-strong)]'
                  }`}
                  onClick={() => setFilterType(type)}
                >
                  {type === 'ALL' ? 'All types' : type === 'FLASH_SALE' ? 'Flash sale' : 'Multi-buy'}
                </button>
              ))}
            </div>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search promotion name or description"
            className="merchant-input w-full sm:w-80"
          />
        </div>
      </SurfaceCard>

      {isLoading ? (
        <div className="merchant-panel px-6 py-14 text-center text-[color:var(--merchant-muted)]">
          Loading promotions...
        </div>
      ) : error ? (
        <div className="merchant-panel px-6 py-14 text-center text-[color:var(--merchant-critical)]">
          {error}
        </div>
      ) : filteredPromos.length === 0 ? (
        <div className="merchant-panel px-6 py-14 text-center text-[color:var(--merchant-muted)]">
          No promotions yet. Create one to start testing merchant-facing campaigns.
        </div>
      ) : (
        <SurfaceCard>
          <div className="overflow-x-auto">
            <table className="merchant-table min-w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Channels</th>
                  <th>Creator visibility</th>
                  <th>Time window</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPromos.map((promotion) => (
                  <tr key={promotion.id}>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-[color:var(--merchant-ink)]">{promotion.name}</span>
                        {promotion.description ? (
                          <span className="text-xs text-[color:var(--merchant-muted)]">
                            {promotion.description}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-[color:var(--merchant-muted-strong)]">
                      {promotion.type === 'FLASH_SALE' ? 'Flash sale' : 'Multi-buy'}
                    </td>
                    <td>{renderStatus(promotion)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {promotion.channels.map((channel) => (
                          <StatusBadge key={channel} tone="neutral" className="text-[11px]">
                            {channel === 'creator_agents' ? 'Creator agents' : channel.toUpperCase()}
                          </StatusBadge>
                        ))}
                      </div>
                    </td>
                    <td className="text-sm text-[color:var(--merchant-muted-strong)]">
                      {promotion.exposeToCreators ? 'Visible to creator agents' : 'Merchant channels only'}
                    </td>
                    <td className="text-sm text-[color:var(--merchant-muted-strong)]">
                      {formatRange(promotion)}
                    </td>
                    <td className="text-right space-x-2">
                      <button
                        onClick={() => openEdit(promotion)}
                        className="merchant-button-secondary"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleEnd(promotion)}
                        className="merchant-button-ghost"
                      >
                        End
                      </button>
                      <button
                        onClick={() => handleDelete(promotion)}
                        className="merchant-button-ghost text-[color:var(--merchant-critical)]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10 backdrop-blur-sm">
          <div className="merchant-panel w-full max-w-5xl p-6">
            <PromotionForm
              mode={formMode}
              initial={selectedPromo}
              onSubmitSuccess={() => {
                setShowForm(false);
                void loadPromotions();
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
