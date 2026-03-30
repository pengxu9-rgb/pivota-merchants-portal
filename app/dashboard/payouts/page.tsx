'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  DollarSign, 
  Upload, 
  Download, 
  Plus,
  CheckCircle,
  Clock,
  FileText,
  ExternalLink,
  Filter,
  Search,
  CreditCard,
  AlertCircle,
  Building,
  MapPin,
  Copy
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import {
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';
import { PaymentsNav } from '@/components/ui/payments-nav';

interface Payout {
  id: number;
  agent_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'uploaded' | 'paid';
  payout_reference?: string;
  file_url?: string;
  method?: string;
  provider?: string;
  period_start: string;
  period_end: string;
  uploaded_at?: string;
  confirmed_at?: string;
  created_at: string;
}

interface PayoutSummary {
  total_count: number;
  total_amount: number;
  unique_agents: number;
}

interface PendingCommission {
  agent_id: string;
  transaction_count: number;
  total_commission: number;
  currency: string;
  earliest_transaction?: string;
  latest_transaction?: string;
}

interface PendingCommissionSummary {
  total_amount: number;
  total_transactions: number;
  unique_agents: number;
  period_days: number;
}

export default function PayoutsPage() {
  const { t } = useMerchantLanguage();
  const router = useRouter();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBankDetailsModal, setShowBankDetailsModal] = useState(false);
  const [agentBankDetails, setAgentBankDetails] = useState<any>(null);
  const [loadingBankDetails, setLoadingBankDetails] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const [proofUrl, setProofUrl] = useState<string>('');
  
  // Pending commissions (not yet converted to payouts)
  const [pendingCommissions, setPendingCommissions] = useState<PendingCommission[]>([]);
  const [pendingCommissionSummary, setPendingCommissionSummary] = useState<PendingCommissionSummary | null>(null);
  const [generatingPayouts, setGeneratingPayouts] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('merchant_token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadPayouts();
    loadPendingCommissions();
  }, [selectedStatus]);

  const loadPayouts = async () => {
    try {
      setLoading(true);
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) return;

      const params = new URLSearchParams();
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      
      const response = await apiClient.get(`/merchants/${merchantId}/payouts?${params}`);
      setPayouts(response.data.items || []);
      setSummary(response.data.summary || null);
    } catch (error) {
      console.error('Failed to load payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingCommissions = async () => {
    try {
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) return;

      const response = await apiClient.get(`/merchants/${merchantId}/payouts/pending-commissions?days=180`);
      
      // Backend returns: { status, summary: {...}, agents: [...] }
      if (response.data.status === 'success') {
        setPendingCommissions(response.data.agents || []);
        setPendingCommissionSummary(response.data.summary || null);
      } else {
        setPendingCommissions([]);
        setPendingCommissionSummary(null);
      }
    } catch (error) {
      console.error('Failed to load pending commissions:', error);
    }
  };

  const generatePayoutsFromCommissions = async () => {
    if (!confirm(
      `This will create payout records for all agents with unpaid commissions from the last 180 days. Continue?`
    )) {
      return;
    }

    try {
      setGeneratingPayouts(true);
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) return;

      const response = await apiClient.post(
        `/merchants/${merchantId}/payouts/generate-from-commissions?days=180`
      );

      if (response.data.status === 'success') {
        const count = response.data.payouts_created;
        
        // Show success message with instructions
        alert(
          `✅ Successfully created ${count} payout(s)!\n\n` +
          `Next steps:\n` +
          `1. Review the pending payouts below\n` +
          `2. Download payment details (includes bank info)\n` +
          `3. Make payments to agents\n` +
          `4. Upload payment proof for each payout`
        );
        
        // Reload both payouts and pending commissions
        await loadPayouts();
        await loadPendingCommissions();
        
        // Scroll to payouts table
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
    } catch (error: any) {
      console.error('Failed to generate payouts:', error);
      alert(error.response?.data?.detail || 'Failed to generate payouts');
    } finally {
      setGeneratingPayouts(false);
    }
  };

  const viewAgentBankDetails = async (agentId: string) => {
    try {
      setLoadingBankDetails(true);
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) return;

      const response = await apiClient.get(`/merchants/${merchantId}/agents/${agentId}/bank-details`);
      
      setAgentBankDetails(response.data);
      setShowBankDetailsModal(true);
    } catch (error: any) {
      console.error('Failed to load bank details:', error);
      alert(error.response?.data?.detail || 'Failed to load bank details');
    } finally {
      setLoadingBankDetails(false);
    }
  };

  const exportPaymentDetails = async () => {
    try {
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) return;

      // Get pending payouts
      const response = await apiClient.get(`/merchants/${merchantId}/payouts?status=pending`);
      const payouts = response.data.items || [];
      
      if (payouts.length === 0) {
        alert('No pending payouts to export');
        return;
      }

      // Fetch bank details for each agent
      const payoutsWithBank = await Promise.all(
        payouts.map(async (p: any) => {
          try {
            const bankResp = await apiClient.get(`/merchants/${merchantId}/agents/${p.agent_id}/bank-details`);
            const bankData = bankResp.data;
            
            return {
              ...p,
              bank_status: bankData.status,
              bank_details: bankData.bank_details,
              agent_name: bankData.agent?.name,
              agent_email: bankData.agent?.email
            };
          } catch (error) {
            console.error(`Failed to get bank for ${p.agent_id}:`, error);
            return {
              ...p,
              bank_status: 'error',
              bank_details: null,
              agent_name: null,
              agent_email: p.agent_id
            };
          }
        })
      );

      // Create CSV with payment instructions
      const headers = [
        'Payout ID',
        'Agent Name',
        'Agent Email',
        'Agent ID',
        'Amount',
        'Currency',
        'Period Start',
        'Period End',
        'Account Holder',
        'IBAN/Account',
        'SWIFT/BIC/Routing',
        'Bank Name',
        'Bank Country',
        'Payment Method',
        'Instructions',
        'Created Date'
      ];
      
      const rows = payoutsWithBank.map((p: any) => {
        const bank = p.bank_details;
        const status = p.bank_status;
        
        let accountInfo = '';
        let instructions = '';
        
        if (status === 'success' && bank) {
          // Use full IBAN or account number when available
          if (bank.iban) {
            accountInfo = bank.iban; // Full IBAN
          } else if (bank.account_number) {
            accountInfo = bank.account_number; // Full account number
          } else {
            accountInfo = bank.iban_preview || `****${bank.account_number_last4 || ''}`;
          }
          instructions = 'Use bank details provided. Contact agent if full details needed.';
        } else if (status === 'not_shared') {
          accountInfo = 'Not shared';
          instructions = `Contact ${p.agent_email} to obtain bank account details`;
        } else if (status === 'not_configured') {
          accountInfo = 'Not set up';
          instructions = `Agent needs to set up bank account. Contact ${p.agent_email}`;
        } else {
          accountInfo = 'N/A';
          instructions = `Contact ${p.agent_email} for payment details`;
        }
        
        // Get SWIFT/BIC or Routing number
        let routingInfo = '';
        if (status === 'success' && bank) {
          if (bank.swift_bic) {
            routingInfo = bank.swift_bic;
          } else if (bank.routing_number) {
            routingInfo = bank.routing_number;
          } else {
            routingInfo = 'N/A';
          }
        } else {
          routingInfo = 'N/A';
        }
        
        return [
          p.id,
          p.agent_name || 'N/A',
          p.agent_email || p.agent_id,
          p.agent_id,
          p.amount,
          p.currency,
          new Date(p.period_start).toLocaleDateString(),
          new Date(p.period_end).toLocaleDateString(),
          bank?.account_holder_name || 'N/A',
          accountInfo,
          routingInfo,
          bank?.bank_name || 'N/A',
          bank?.bank_country || 'N/A',
          bank?.method?.replace('_', ' ') || 'N/A',
          instructions,
          new Date(p.created_at).toLocaleDateString()
        ];
      });
      
      const csv = [
        headers.join(','),
        ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      // Download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payout_instructions_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      alert(`✅ Payment instructions exported!\n\nDownloaded file with ${payouts.length} payout(s) including bank details.`);
    } catch (error) {
      console.error('Failed to export payment details:', error);
      alert('Failed to export payment details');
    }
  };

  const exportPayouts = async () => {
    try {
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) return;

      const params = new URLSearchParams();
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      
      const response = await apiClient.get(`/merchants/${merchantId}/payouts/export/csv?${params}`);
      
      // Convert to CSV
      const data = response.data.data;
      const headers = Object.keys(data[0] || {});
      const csv = [
        headers.join(','),
        ...data.map((row: any) => headers.map(h => row[h]).join(','))
      ].join('\n');
      
      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.data.filename || 'payouts.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export payouts:', error);
      alert('Failed to export payouts');
    }
  };

  const handleUploadProof = async (payout: Payout, data: any) => {
    try {
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) return;

      await apiClient.post(`/merchants/${merchantId}/payouts/${payout.id}/upload`, data);
      
      alert('Payment proof uploaded successfully!');
      setShowUploadModal(false);
      setSelectedPayout(null);
      loadPayouts();
    } catch (error: any) {
      console.error('Failed to upload proof:', error);
      alert(error.response?.data?.detail || 'Failed to upload payment proof');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'uploaded':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      uploaded: 'bg-blue-50 text-blue-700 border-blue-200',
      paid: 'bg-green-50 text-green-700 border-green-200'
    };
    const labels = {
      pending: t('dashboard.payouts.filters.pending'),
      uploaded: t('dashboard.payouts.filters.uploaded'),
      paid: t('dashboard.payouts.filters.paid'),
    };
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${colors[status as keyof typeof colors]}`}>
        {getStatusIcon(status)}
        <span>{labels[status as keyof typeof labels] || status}</span>
      </span>
    );
  };

  const filteredPayouts = payouts.filter(payout => 
    searchTerm === '' || 
    payout.agent_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payout.payout_reference?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const pendingPayoutCount = payouts.filter((payout) => payout.status === 'pending').length;
  const uploadedPayoutCount = payouts.filter((payout) => payout.status === 'uploaded').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('dashboard.payouts.eyebrow')}
        title={t('dashboard.payouts.title')}
        description={t('dashboard.payouts.description')}
        actions={
          <>
            <MerchantButton type="button" onClick={() => setShowCreateModal(true)} icon={Plus}>
              {t('dashboard.payouts.createPayout')}
            </MerchantButton>
            <MerchantButton type="button" variant="secondary" onClick={exportPaymentDetails} icon={Download}>
              {t('dashboard.payouts.exportPaymentDetails')}
            </MerchantButton>
          </>
        }
      />

      <PaymentsNav />
      {pendingCommissionSummary && pendingCommissionSummary.total_amount > 0 && (
        <div className="space-y-4">
          <div className="merchant-panel merchant-panel-muted px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 text-[color:var(--merchant-warning)]" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[color:var(--merchant-ink)]">
                    {t('dashboard.payouts.pendingBanner.amountWaiting', {
                      amount: `$${pendingCommissionSummary.total_amount.toFixed(2)}`,
                    })}
                  </p>
                  <p className="text-sm text-[color:var(--merchant-muted-strong)]">
                    {t('dashboard.payouts.pendingBanner.agentsReady', {
                      agents: pendingCommissionSummary.unique_agents,
                      transactions: pendingCommissionSummary.total_transactions,
                    })}
                  </p>
                </div>
              </div>
              <StatusBadge tone="warning">
                {t('dashboard.payouts.pendingBanner.window', {
                  days: pendingCommissionSummary.period_days,
                })}
              </StatusBadge>
            </div>
          </div>

          <SurfaceCard
            title={t('dashboard.payouts.pendingSection.title')}
            description={t('dashboard.payouts.pendingSection.description')}
            action={
              <MerchantButton
                type="button"
                onClick={generatePayoutsFromCommissions}
                disabled={generatingPayouts}
                icon={Plus}
                className="disabled:opacity-50"
              >
                {generatingPayouts
                  ? t('dashboard.payouts.pendingSection.generating')
                  : t('dashboard.payouts.pendingSection.generate')}
              </MerchantButton>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)]/65">
                  <tr>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                      {t('dashboard.payouts.pendingSection.headers.agentId')}
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                      {t('dashboard.payouts.pendingSection.headers.transactions')}
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                      {t('dashboard.payouts.pendingSection.headers.totalCommission')}
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                      {t('dashboard.payouts.pendingSection.headers.period')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--merchant-line)] bg-white/90">
                  {pendingCommissions.map((commission) => (
                    <tr key={commission.agent_id} className="transition hover:bg-[color:var(--merchant-surface-muted)]/55">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                          {commission.agent_id}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-[color:var(--merchant-muted-strong)]">
                        {t('dashboard.payouts.pendingSection.orders', {
                          count: commission.transaction_count,
                        })}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                          ${Number(commission.total_commission).toFixed(2)} {commission.currency}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-[color:var(--merchant-muted-strong)]">
                        {commission.earliest_transaction
                          ? `${new Date(commission.earliest_transaction).toLocaleDateString()} - ${new Date(commission.latest_transaction!).toLocaleDateString()}`
                          : t('dashboard.payouts.pendingSection.na')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)]/55 px-5 py-4 text-sm lg:flex-row lg:items-center lg:justify-between">
              <span className="text-[color:var(--merchant-muted-strong)]">
                {t('dashboard.payouts.pendingSection.footer', {
                  transactions: pendingCommissionSummary.total_transactions,
                  agents: pendingCommissionSummary.unique_agents,
                })}
              </span>
              <span className="font-semibold text-[color:var(--merchant-ink)]">
                {t('dashboard.payouts.pendingSection.totalUnpaid', {
                  amount: `$${pendingCommissionSummary.total_amount.toFixed(2)}`,
                })}
              </span>
            </div>
          </SurfaceCard>

          <div className="merchant-panel merchant-panel-muted px-5 py-4">
            <div className="grid gap-3 text-sm text-[color:var(--merchant-muted-strong)] md:grid-cols-4">
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">{t('dashboard.payouts.flow.generateTitle')}</div>
                <div>{t('dashboard.payouts.flow.generateDescription')}</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">{t('dashboard.payouts.flow.settleTitle')}</div>
                <div>{t('dashboard.payouts.flow.settleDescription')}</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">{t('dashboard.payouts.flow.uploadProofTitle')}</div>
                <div>{t('dashboard.payouts.flow.uploadProofDescription')}</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">{t('dashboard.payouts.flow.confirmTitle')}</div>
                <div>{t('dashboard.payouts.flow.confirmDescription')}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="merchant-panel p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="rounded-xl bg-[color:var(--merchant-brand-soft)] p-2">
              <DollarSign className="h-5 w-5 text-[color:var(--merchant-brand)]" />
            </div>
          </div>
          <p className="mb-1 text-sm text-[color:var(--merchant-muted)]">{t('dashboard.payouts.stats.totalAmount')}</p>
          <p className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            ${summary?.total_amount?.toFixed(2) || '0.00'}
          </p>
        </div>

        <div className="merchant-panel p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="rounded-xl bg-[color:var(--merchant-surface-muted)] p-2">
              <FileText className="h-5 w-5 text-[color:var(--merchant-brand)]" />
            </div>
          </div>
          <p className="mb-1 text-sm text-[color:var(--merchant-muted)]">{t('dashboard.payouts.stats.records')}</p>
          <p className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {summary?.total_count || 0}
          </p>
        </div>

        <div className="merchant-panel p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="rounded-xl bg-[color:var(--merchant-success-soft)] p-2">
              <CheckCircle className="h-5 w-5 text-[color:var(--merchant-success)]" />
            </div>
          </div>
          <p className="mb-1 text-sm text-[color:var(--merchant-muted)]">{t('dashboard.payouts.stats.paidPartners')}</p>
          <p className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {summary?.unique_agents || 0}
          </p>
        </div>

        <div className="merchant-panel p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="rounded-xl bg-[color:var(--merchant-warning-soft)] p-2">
              <Clock className="h-5 w-5 text-[color:var(--merchant-warning)]" />
            </div>
          </div>
          <p className="mb-1 text-sm text-[color:var(--merchant-muted)]">{t('dashboard.payouts.stats.pendingFollowUp')}</p>
          <p className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {pendingCommissionSummary?.unique_agents || pendingPayoutCount}
          </p>
          <p className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
            {pendingCommissionSummary?.total_amount
              ? t('dashboard.payouts.stats.unpaidLines', {
                  count: pendingCommissionSummary.total_transactions,
                })
              : t('dashboard.payouts.stats.uploadedPending', {
                  uploaded: uploadedPayoutCount,
                  pending: pendingPayoutCount,
                })}
          </p>
        </div>
      </div>

      {/* Filters */}
      <SurfaceCard
        title={t('dashboard.payouts.filters.title')}
        description={t('dashboard.payouts.filters.description')}
        action={
          <StatusBadge tone="neutral">
            {t('dashboard.payouts.filters.visible', { count: filteredPayouts.length })}
          </StatusBadge>
        }
      >
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[color:var(--merchant-muted)] w-5 h-5" />
              <input
                type="text"
                placeholder={t('dashboard.payouts.filters.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="merchant-input pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-[color:var(--merchant-muted)]" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="merchant-select"
              >
                <option value="all">{t('dashboard.payouts.filters.allStatus')}</option>
                <option value="pending">{t('dashboard.payouts.filters.pending')}</option>
                <option value="uploaded">{t('dashboard.payouts.filters.uploaded')}</option>
                <option value="paid">{t('dashboard.payouts.filters.paid')}</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={pendingPayoutCount > 0 ? 'warning' : 'success'}>
                {pendingPayoutCount > 0
                  ? t('dashboard.payouts.filters.pendingCount', { count: pendingPayoutCount })
                  : t('dashboard.payouts.filters.noPending')}
              </StatusBadge>
              <StatusBadge tone={uploadedPayoutCount > 0 ? 'brand' : 'neutral'}>
                {t('dashboard.payouts.filters.proofUploaded', { count: uploadedPayoutCount })}
              </StatusBadge>
            </div>
          </div>
      </SurfaceCard>

      <SurfaceCard
        title={t('dashboard.payouts.activity.title')}
        description={t('dashboard.payouts.activity.description')}
        action={
          <StatusBadge tone="neutral">
            {t('dashboard.payouts.activity.records', { count: filteredPayouts.length })}
          </StatusBadge>
        }
        className="overflow-hidden"
      >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)]/65">
                <tr>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('dashboard.payouts.activity.headers.agent')}
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('dashboard.payouts.activity.headers.amount')}
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('dashboard.payouts.activity.headers.period')}
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('dashboard.payouts.activity.headers.status')}
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('dashboard.payouts.activity.headers.reference')}
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('dashboard.payouts.activity.headers.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--merchant-line)] bg-white/90">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-[color:var(--merchant-muted-strong)]">
                      <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-[color:var(--merchant-brand)]"></div>
                      {t('dashboard.payouts.activity.loading')}
                    </td>
                  </tr>
                ) : filteredPayouts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-[color:var(--merchant-muted-strong)]">
                      {t('dashboard.payouts.activity.empty')}
                    </td>
                  </tr>
                ) : (
                  filteredPayouts.map((payout) => (
                    <tr key={payout.id} className="transition hover:bg-[color:var(--merchant-surface-muted)]/55">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                          {payout.agent_id}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                          ${payout.amount.toFixed(2)} {payout.currency}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-sm text-[color:var(--merchant-muted-strong)]">
                          {new Date(payout.period_start).toLocaleDateString()} - {new Date(payout.period_end).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {getStatusBadge(payout.status)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-sm text-[color:var(--merchant-muted-strong)]">
                          {payout.payout_reference || '-'}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {payout.status === 'pending' && (
                            <>
                              <button
                                onClick={() => viewAgentBankDetails(payout.agent_id)}
                                disabled={loadingBankDetails}
                                className="flex items-center gap-1 text-sm font-medium text-[color:var(--merchant-success)] hover:text-[color:var(--merchant-success-strong)]"
                              >
                                <CreditCard className="w-4 h-4" />
                                {t('dashboard.payouts.activity.viewBank')}
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedPayout(payout);
                                  setShowUploadModal(true);
                                }}
                                className="flex items-center gap-1 text-sm font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
                              >
                                <Upload className="w-4 h-4" />
                                {t('dashboard.payouts.activity.uploadProof')}
                              </button>
                            </>
                          )}
                          {payout.file_url && (
                            <button
                              onClick={() => {
                                setProofUrl(payout.file_url!);
                                setShowProofModal(true);
                              }}
                              className="flex items-center gap-1 text-sm font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
                            >
                              <ExternalLink className="w-4 h-4" />
                              {t('dashboard.payouts.activity.viewProof')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
      </SurfaceCard>
      {/* Upload Modal */}
      {showUploadModal && selectedPayout && (
        <UploadProofModal
          payout={selectedPayout}
          onClose={() => {
            setShowUploadModal(false);
            setSelectedPayout(null);
          }}
          onUpload={handleUploadProof}
        />
      )}

      {/* Create Payout Modal */}
      {showCreateModal && (
        <CreatePayoutModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadPayouts();
          }}
        />
      )}

      {/* Bank Details Modal */}
      {showBankDetailsModal && agentBankDetails && (
        <AgentBankDetailsModal
          bankData={agentBankDetails}
          onClose={() => {
            setShowBankDetailsModal(false);
            setAgentBankDetails(null);
          }}
        />
      )}

      {/* Proof Modal */}
      {showProofModal && proofUrl && (
        <ProofModal
          proofUrl={proofUrl}
          onClose={() => {
            setShowProofModal(false);
            setProofUrl('');
          }}
        />
      )}
    </div>
  );
}

// Upload Proof Modal Component
function UploadProofModal({ payout, onClose, onUpload }: any) {
  const [formData, setFormData] = useState({
    reference: '',
    file_url: '',
    method: 'wire',
    provider: '',
    external_id: ''
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.reference) {
      alert('Payment reference is required');
      return;
    }

    if (file) {
      setUploading(true);
      // Convert file to base64 for now (later can implement proper file upload)
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        onUpload(payout, { ...formData, file_url: base64, file_name: file.name });
      };
      reader.readAsDataURL(file);
    } else {
      onUpload(payout, formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Upload Payment Proof</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Reference *
            </label>
            <input
              type="text"
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., WIRE-123456"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method
            </label>
            <select
              value={formData.method}
              onChange={(e) => setFormData({ ...formData, method: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="wire">Wire Transfer</option>
              <option value="ach">ACH</option>
              <option value="paypal">PayPal</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bank/Provider Name
            </label>
            <input
              type="text"
              value={formData.provider}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., Chase Bank"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Proof File
            </label>
            <div className="space-y-2">
              <input
                type="file"
                onChange={handleFileChange}
                accept="image/*,.pdf,.doc,.docx"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
              />
              {file && (
                <p className="text-sm text-gray-600">
                  Selected: {file.name}
                </p>
              )}
              {!file && (
                <div className="text-sm">
                  <label className="text-gray-700 mb-1 block">Or enter URL:</label>
                  <input
                    type="url"
                    value={formData.file_url}
                    onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    placeholder="https://..."
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload Proof'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Create Payout Modal Component
function CreatePayoutModal({ onClose, onSuccess }: any) {
  const [items, setItems] = useState([
    { agent_id: '', amount: '', period_start: '', period_end: '' }
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const merchantId = localStorage.getItem('merchant_id');
      if (!merchantId) return;

      const validItems = items.filter(item => 
        item.agent_id && item.amount && item.period_start && item.period_end
      ).map(item => ({
        ...item,
        amount: parseFloat(item.amount)
      }));

      if (validItems.length === 0) {
        alert('Please add at least one valid payout item');
        return;
      }

      await apiClient.post(`/merchants/${merchantId}/payouts/bulk`, {
        items: validItems
      });

      alert(`Created ${validItems.length} payouts successfully!`);
      onSuccess();
    } catch (error: any) {
      console.error('Failed to create payouts:', error);
      alert(error.response?.data?.detail || 'Failed to create payouts');
    }
  };

  const addItem = () => {
    setItems([...items, { agent_id: '', amount: '', period_start: '', period_end: '' }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Create Bulk Payouts</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 mb-6">
            {items.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Agent ID
                    </label>
                    <input
                      type="text"
                      value={item.agent_id}
                      onChange={(e) => updateItem(index, 'agent_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="agent@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.amount}
                      onChange={(e) => updateItem(index, 'amount', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="100.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Period Start
                    </label>
                    <input
                      type="date"
                      value={item.period_start}
                      onChange={(e) => updateItem(index, 'period_start', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Period End
                    </label>
                    <input
                      type="date"
                      value={item.period_end}
                      onChange={(e) => updateItem(index, 'period_end', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="mb-6 text-purple-600 hover:text-purple-800 font-medium text-sm"
          >
            + Add Another Payout
          </button>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Create Payouts
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
// Agent Bank Details Modal Component
function AgentBankDetailsModal({ bankData, onClose }: any) {
  const { status, agent, bank_details, sharing_enabled, message, instructions } = bankData;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('✅ Copied!');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-600" />
            Agent Bank Details
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium text-gray-900 mb-2">Agent Information</p>
          <p className="text-sm text-gray-700">Name: {agent?.name || 'N/A'}</p>
          <p className="text-sm text-gray-700">Email: {agent?.email}</p>
          <p className="text-sm text-gray-600 font-mono mt-1">ID: {agent?.agent_id}</p>
        </div>

        {status === 'not_configured' && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-900">Bank Account Not Set Up</p>
                <p className="text-sm text-yellow-700 mt-1">{message}</p>
                <p className="text-sm text-yellow-700 mt-2">
                  Contact <strong>{agent?.email}</strong> to obtain bank details.
                </p>
              </div>
            </div>
          </div>
        )}

        {status === 'not_shared' && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">Bank Details Not Shared</p>
                <p className="text-sm text-blue-700 mt-1">{instructions}</p>
                {bank_details && (
                  <div className="mt-3 p-3 bg-white rounded border border-blue-200">
                    <p className="text-sm text-gray-700">Method: <span className="font-medium capitalize">{bank_details.method?.replace('_', ' ')}</span></p>
                    <p className="text-sm text-gray-700">Currency: <span className="font-medium">{bank_details.currency}</span></p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {status === 'success' && sharing_enabled && bank_details && (
          <div>
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">✅ Bank details available for payment</p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder</label>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-gray-900">{bank_details.account_holder_name}</p>
                    <button onClick={() => copyToClipboard(bank_details.account_holder_name)} className="text-gray-500 hover:text-gray-700">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {(bank_details.iban || bank_details.iban_preview) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-white px-3 py-2 rounded border font-mono">{bank_details.iban || bank_details.iban_preview}</code>
                      <button onClick={() => copyToClipboard(bank_details.iban || bank_details.iban_preview)} className="text-gray-500 hover:text-gray-700">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {(bank_details.account_number || bank_details.account_number_last4) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-white px-3 py-2 rounded border font-mono">
                        {bank_details.account_number || `****${bank_details.account_number_last4}`}
                      </code>
                      {bank_details.account_number && (
                        <button onClick={() => copyToClipboard(bank_details.account_number)} className="text-gray-500 hover:text-gray-700">
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {bank_details.swift_bic && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SWIFT/BIC</label>
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-white px-3 py-2 rounded border font-mono">{bank_details.swift_bic}</code>
                      <button onClick={() => copyToClipboard(bank_details.swift_bic)} className="text-gray-500 hover:text-gray-700">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {bank_details.routing_number && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Routing Number</label>
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-white px-3 py-2 rounded border font-mono">{bank_details.routing_number}</code>
                      <button onClick={() => copyToClipboard(bank_details.routing_number)} className="text-gray-500 hover:text-gray-700">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {bank_details.bank_name && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                      <p className="text-sm text-gray-900">{bank_details.bank_name}</p>
                    </div>
                    {bank_details.bank_country && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                        <p className="text-sm text-gray-900">{bank_details.bank_country}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800">
                  <strong>🔒 Note:</strong> Full details not shown. Contact {agent?.email} if needed.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          {(status === 'not_shared' || status === 'not_configured') && (
            <a
              href={`mailto:${agent?.email}?subject=Bank Account Details for Commission Payment`}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Contact Agent
            </a>
          )}
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Proof Modal Component
function ProofModal({ proofUrl, onClose }: { proofUrl: string; onClose: () => void }) {
  const isBase64 = proofUrl.startsWith('data:');
  const isPDF = proofUrl.includes('application/pdf') || proofUrl.endsWith('.pdf');
  
  const handleDownload = () => {
    if (isBase64) {
      const link = document.createElement('a');
      link.href = proofUrl;
      link.download = `payment-proof-${Date.now()}`;
      link.click();
    } else {
      window.open(proofUrl, '_blank');
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Payment Proof</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              <Download className="w-4 h-4 inline mr-1" />
              Download
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">
              &times;
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          {isPDF ? (
            <div className="bg-white rounded p-4 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 mb-4">PDF Document</p>
              <button onClick={handleDownload} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                Download to View
              </button>
            </div>
          ) : (
            <div className="bg-white rounded p-2">
              <img src={proofUrl} alt="Payment Proof" className="max-w-full h-auto mx-auto" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
