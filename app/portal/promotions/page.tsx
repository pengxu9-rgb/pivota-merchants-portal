'use client';

import { useEffect, useMemo, useState } from 'react';
import { Promotion, PromotionStatus, computePromotionStatus } from '@/types/promotion';
import { PromotionForm } from '@/components/portal/PromotionForm';

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
    loadPromotions();
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
    return promotions.filter((p) => {
      const st = computePromotionStatus(p);
      if (filterStatus !== 'ALL' && st !== filterStatus) return false;
      if (filterType !== 'ALL' && p.type !== filterType) return false;
      if (search.trim()) {
        const term = search.toLowerCase();
        const haystack = `${p.name} ${p.description || ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [promotions, filterStatus, filterType, search]);

  const openCreate = () => {
    setFormMode('create');
    setSelectedPromo(undefined);
    setShowForm(true);
  };

  const openEdit = (p: Promotion) => {
    setFormMode('edit');
    setSelectedPromo(p);
    setShowForm(true);
  };

  const handleEnd = async (promo: Promotion) => {
    if (!confirm(`End "${promo.name}" now?`)) return;
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('merchant_token') || localStorage.getItem('token')
        : null;
    const merchantId =
      typeof window !== 'undefined' ? localStorage.getItem('merchant_id') : null;
    const res = await fetch(`/api/portal/promotions/${promo.id}`, {
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

  const handleDelete = async (promo: Promotion) => {
    if (!confirm(`Delete "${promo.name}"? This will remove the promotion.`)) return;
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('merchant_token') || localStorage.getItem('token')
        : null;
    const merchantId =
      typeof window !== 'undefined' ? localStorage.getItem('merchant_id') : null;
    const res = await fetch(`/api/portal/promotions/${promo.id}`, {
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

  const renderStatus = (p: Promotion) => {
    const st = computePromotionStatus(p);
    const color =
      st === 'ACTIVE'
        ? 'bg-emerald-100 text-emerald-700'
        : st === 'UPCOMING'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-gray-100 text-gray-600';
    return <span className={`px-2 py-1 text-xs rounded-full ${color}`}>{st}</span>;
  };

  const formatRange = (p: Promotion) => {
    const fmt = (ts: string) =>
      new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ts));
    return `${fmt(p.startAt)} → ${fmt(p.endAt)}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Promotions</h1>
          <p className="text-sm text-gray-600">
            Manage discounts and deals applied to your products and Creator Agents.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          New promotion
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(['ALL', 'ACTIVE', 'UPCOMING', 'ENDED'] as FilterStatus[]).map((s) => (
            <button
              key={s}
              className={`px-3 py-1.5 rounded-lg border ${
                filterStatus === s
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-700'
              }`}
              onClick={() => setFilterStatus(s)}
            >
              {s === 'ALL' ? 'All' : s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['ALL', 'FLASH_SALE', 'MULTI_BUY_DISCOUNT'] as FilterType[]).map((t) => (
            <button
              key={t}
              className={`px-3 py-1.5 rounded-lg border ${
                filterType === t
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-700'
              }`}
              onClick={() => setFilterType(t)}
            >
              {t === 'ALL' ? 'All types' : t === 'FLASH_SALE' ? 'Flash sale' : 'Multi-buy'}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or description"
          className="w-full sm:w-72 rounded-lg border border-gray-200 px-3 py-2"
        />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-500">Loading promotions...</div>
      ) : error ? (
        <div className="py-12 text-center text-red-600">{error}</div>
      ) : filteredPromos.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          No promotions yet. Create one to start testing deals.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-500">
              <tr className="border-b">
                <th className="py-2 text-left font-semibold">Name</th>
                <th className="py-2 text-left font-semibold">Type</th>
                <th className="py-2 text-left font-semibold">Status</th>
                <th className="py-2 text-left font-semibold">Channels</th>
                <th className="py-2 text-left font-semibold">Creator Agents</th>
                <th className="py-2 text-left font-semibold">Time window</th>
                <th className="py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredPromos.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="py-3">
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-900">{p.name}</span>
                      {p.description && (
                        <span className="text-xs text-gray-500">{p.description}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">{p.type === 'FLASH_SALE' ? 'Flash sale' : 'Multi-buy'}</td>
                  <td className="py-3">{renderStatus(p)}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.channels.map((ch) => (
                        <span
                          key={ch}
                          className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs"
                        >
                          {ch === 'creator_agents' ? 'Creator Agents' : ch.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 text-sm text-gray-700">
                    {p.exposeToCreators ? 'On' : 'Off'}
                  </td>
                  <td className="py-3 text-sm text-gray-700">{formatRange(p)}</td>
                  <td className="py-3 text-right space-x-2">
                    <button
                      onClick={() => openEdit(p)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleEnd(p)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      End
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl p-6">
            <PromotionForm
              mode={formMode}
              initial={selectedPromo}
              onSubmitSuccess={() => {
                setShowForm(false);
                loadPromotions();
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
