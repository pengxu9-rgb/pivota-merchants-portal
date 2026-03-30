'use client';

/**
 * [Phase 6] Merchant Commission Management Page
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, Plus, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import {
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';
import { PaymentsNav } from '@/components/ui/payments-nav';

export default function CommissionPage() {
  const { t } = useMerchantLanguage();
  const router = useRouter();
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [offerMode, setOfferMode] = useState<'all' | 'premium'>('all');
  const [newOffer, setNewOffer] = useState({
    agent_type: '',
    offered_commission_rate: 2.0,
    min_order_amount: '' as string | number,  // Allow empty string for better UX
  });

  useEffect(() => {
    const token = localStorage.getItem('merchant_token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadOffers();
  }, []);

  const loadOffers = async () => {
    setLoading(true);
    setError(null);
    try {
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) {
        setError(t('dashboard.commission.errors.noMerchantId'));
        return;
      }
      
      const data = await apiClient.getCommissionOffers(merchantId);
      // Only show active offers (deleted ones are hidden)
      const activeOffers = (data.offers || []).filter((offer: any) => offer.is_active === true);
      setOffers(activeOffers);
    } catch (err: any) {
      console.error('Failed to load commission offers:', err);
      setError(err.response?.data?.detail || t('dashboard.commission.errors.loadOffers'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) return;
      
      // Check for duplicates
      const agentType = newOffer.agent_type || null;
      const rate = newOffer.offered_commission_rate / 100;
      const minAmount = typeof newOffer.min_order_amount === 'string' 
        ? (newOffer.min_order_amount === '' ? 0 : parseFloat(newOffer.min_order_amount))
        : newOffer.min_order_amount;
      
      // Check for duplicates
      const duplicate = offers.find(offer => 
        offer.agent_type === agentType &&
        Math.abs(offer.rate - rate) < 0.0001 &&
        Math.abs(offer.min_amount - minAmount) < 0.01
      );
      
      if (duplicate) {
        alert(
          `${t('dashboard.commission.alerts.duplicateTitle')}\n\n${t(
            'dashboard.commission.alerts.duplicateBody',
            {
              agentType: agentType || t('dashboard.commission.table.allAgents'),
              rate: `${(rate * 100).toFixed(2)}%`,
              minOrder: `$${minAmount.toFixed(2)}`,
            }
          )}`
        );
        return;
      }
      
      await apiClient.createCommissionOffer(merchantId, {
        agent_type: agentType,
        offered_commission_rate: rate,
        min_order_amount: minAmount,
      });
      
      setShowForm(false);
      setNewOffer({
        agent_type: '',
        offered_commission_rate: 2.0,
        min_order_amount: '',  // Reset to empty string
      });
      loadOffers();
    } catch (err: any) {
      alert(
        t('dashboard.commission.alerts.createFailed', {
          detail: err.response?.data?.detail || err.message,
        })
      );
    }
  };

  const handleDelete = async (offerId: number) => {
    if (!confirm(t('dashboard.commission.alerts.deleteConfirm'))) return;
    
    try {
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) return;
      
      // Delete via API (backend soft-deletes: is_active=false)
      await apiClient.deleteCommissionOffer(merchantId, offerId);
      
      // Immediately remove from UI list
      setOffers(offers.filter(offer => offer.id !== offerId));
      
      // Show success message
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed top-4 right-4 bg-green-50 border border-green-200 text-green-700 px-6 py-3 rounded-lg shadow-lg z-50';
      successMsg.textContent = `✅ ${t('dashboard.commission.alerts.deleteSuccess')}`;
      document.body.appendChild(successMsg);
      setTimeout(() => successMsg.remove(), 3000);
      
    } catch (err: any) {
      alert(
        `❌ ${t('dashboard.commission.alerts.deleteFailed', {
          detail: err.response?.data?.detail || err.message,
        })}`
      );
      loadOffers();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="merchant-panel px-8 py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-success)]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('dashboard.commission.eyebrow')}
        title={t('dashboard.commission.title')}
        description={t('dashboard.commission.description')}
        actions={
          <MerchantButton type="button" onClick={() => setShowForm(true)} icon={Plus}>
            {t('dashboard.commission.newOffer')}
          </MerchantButton>
        }
      />

      <PaymentsNav />

      {error && (
        <div className="merchant-panel px-5 py-4 text-[color:var(--merchant-critical)]">
          {error}
        </div>
      )}

      {/* Platform Fallback Info */}
      <div className="merchant-panel merchant-panel-muted p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-6 h-6 text-[color:var(--merchant-brand)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-base font-semibold text-[color:var(--merchant-ink)] mb-1">
              {t('dashboard.commission.fallback.title')}
            </h4>
            <p className="text-sm text-[color:var(--merchant-muted-strong)]">
              {t('dashboard.commission.fallback.body', { rate: '1%' })}
            </p>
            <p className="text-sm text-[color:var(--merchant-muted)] mt-2">
              {t('dashboard.commission.fallback.cta')}
            </p>
          </div>
        </div>
      </div>

      {/* Offers List */}
      <SurfaceCard>
        <table className="merchant-table">
          <thead>
            <tr>
              <th>{t('dashboard.commission.table.agentType')}</th>
              <th>{t('dashboard.commission.table.commissionRate')}</th>
              <th>{t('dashboard.commission.table.minimumOrder')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {offers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-[color:var(--merchant-muted)]">
                  {t('dashboard.commission.table.empty')}
                </td>
              </tr>
            ) : (
              offers.map(offer => (
                <tr key={offer.id}>
                  <td>
                    {offer.agent_type === 'premium' ? (
                      <StatusBadge tone="brand">{t('dashboard.commission.table.premium')}</StatusBadge>
                    ) : (
                      <span className="font-medium text-[color:var(--merchant-ink)]">
                        {t('dashboard.commission.table.allAgents')}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="font-semibold text-[color:var(--merchant-success)] text-lg">
                      {(offer.rate * 100).toFixed(2)}%
                    </span>
                  </td>
                  <td>
                    <span className="text-[color:var(--merchant-muted-strong)]">
                      {offer.min_amount > 0 ? `$${offer.min_amount.toFixed(2)}+` : t('dashboard.commission.table.noMinimum')}
                    </span>
                  </td>
                  <td className="text-right">
                    <button 
                      onClick={() => handleDelete(offer.id)}
                      className="merchant-icon-button text-[color:var(--merchant-critical)]"
                      title={t('dashboard.commission.table.deleteTitle')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SurfaceCard>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{t('dashboard.commission.form.title')}</h2>
            <div className="space-y-4">
              {/* Offer Type Toggle */}
              <div>
                <label className="block text-sm font-medium mb-2">{t('dashboard.commission.form.offerType')}</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setOfferMode('all');
                      setNewOffer({...newOffer, agent_type: ''});
                    }}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                      offerMode === 'all'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">{t('dashboard.commission.form.allAgents')}</div>
                    <div className="text-xs mt-1 opacity-75">{t('dashboard.commission.form.allAgentsMeta')}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOfferMode('premium');
                      setNewOffer({...newOffer, agent_type: 'premium'});
                    }}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                      offerMode === 'premium'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">⭐ {t('dashboard.commission.form.premiumOnly')}</div>
                    <div className="text-xs mt-1 opacity-75">{t('dashboard.commission.form.premiumOnlyMeta')}</div>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {offerMode === 'all' 
                    ? t('dashboard.commission.form.allAgentsHelp')
                    : t('dashboard.commission.form.premiumOnlyHelp')}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">{t('dashboard.commission.form.rateLabel')}</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={newOffer.offered_commission_rate}
                  onChange={e => setNewOffer({...newOffer, offered_commission_rate: parseFloat(e.target.value)})}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">{t('dashboard.commission.form.minOrderLabel')}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t('dashboard.commission.form.minOrderPlaceholder')}
                  value={newOffer.min_order_amount}
                  onChange={e => setNewOffer({
                    ...newOffer, 
                    min_order_amount: e.target.value === '' ? '' : parseFloat(e.target.value)
                  })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">{t('dashboard.commission.form.minOrderHelp')}</p>
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  {t('dashboard.commission.form.cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {t('dashboard.commission.form.create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
