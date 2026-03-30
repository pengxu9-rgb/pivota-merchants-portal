'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  CreditCard,
  KeyRound,
  Loader2,
  Plus,
  RefreshCcw,
  Send,
  Settings,
  Store,
  Webhook,
} from 'lucide-react';

import ConnectStoreModal from '@/components/ConnectStoreModal';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import PSPRoutingConfig from '@/components/PSPRoutingConfig';
import { PSPConfigForm } from '@/components/PSPConfigForm';
import { apiClient } from '@/lib/api-client';
import {
  EmptyState,
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';


const MERCHANT_WEBHOOK_EVENTS = [
  'order.created',
  'payment.completed',
  'payment.failed',
  'refund.processed',
];

const SUPPORTED_CONNECT_PROVIDERS = ['Stripe', 'Adyen', 'Checkout.com'];

type ActiveTab = 'stores' | 'psps' | 'routing' | 'webhooks';
type NoticeTone = 'success' | 'warning' | 'critical';

type NoticeState =
  | {
      tone: NoticeTone;
      text: string;
    }
  | null;

interface WebhookFormState {
  url: string;
  enabled: boolean;
  events: string[];
}

export default function IntegrationsPage() {
  const { t } = useMerchantLanguage();
  const [loading, setLoading] = useState(true);
  const [merchantId, setMerchantId] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('stores');

  const [connectedStores, setConnectedStores] = useState<any[]>([]);
  const [connectedPSPs, setConnectedPSPs] = useState<any[]>([]);
  const [apiCredentials, setApiCredentials] = useState<any>(null);
  const [webhookConfig, setWebhookConfig] = useState<any>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<any[]>([]);
  const [deliverySummary, setDeliverySummary] = useState<any>(null);
  const [webhookSecret, setWebhookSecret] = useState<string>('');

  const [showConnectStore, setShowConnectStore] = useState(false);
  const [showConnectPSP, setShowConnectPSP] = useState(false);
  const [selectedPSPProvider, setSelectedPSPProvider] = useState('');
  const [syncingStoreId, setSyncingStoreId] = useState<string | null>(null);
  const [testingPspId, setTestingPspId] = useState<string | null>(null);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [sendingWebhookTest, setSendingWebhookTest] = useState(false);
  const [rotatingApiKey, setRotatingApiKey] = useState(false);
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [webhookForm, setWebhookForm] = useState<WebhookFormState>({
    url: '',
    enabled: false,
    events: ['order.created', 'payment.completed', 'payment.failed'],
  });

  const primaryStoreId = connectedStores.find((store) => store?.is_active)?.id || null;
  const activePSPCount = connectedPSPs.filter((psp) => psp.is_active).length;
  const liveReadyPSPCount = connectedPSPs.filter((psp) => psp.is_active && psp.live_charge_ready).length;
  const blockedActivePSPCount = connectedPSPs.filter((psp) => psp.is_active && !psp.live_charge_ready).length;
  const showRoutingTab = activePSPCount > 1;
  const inactiveWebhookCount = webhookConfig?.enabled ? 0 : 1;
  const tabButtonClass = (tab: ActiveTab) =>
    `flex min-h-[4.5rem] items-center gap-3 rounded-[1rem] px-4 py-3 text-left transition ${
      activeTab === tab
        ? 'bg-white text-[color:var(--merchant-ink)] shadow-[var(--merchant-shadow-panel)]'
        : 'text-[color:var(--merchant-muted-strong)] hover:bg-white/75'
    }`;

  const webhookStatusTone: 'success' | 'warning' = webhookConfig?.enabled ? 'success' : 'warning';
  const apiKeyAvailable = Boolean(apiCredentials?.issued && apiCredentials?.api_key);
  const quickStartApiKey = apiCredentials?.api_key || '<your-merchant-api-key>';
  const selectedTestEvent =
    webhookForm.events.find((event) => MERCHANT_WEBHOOK_EVENTS.includes(event)) ||
    'order.created';

  const routingSummary = useMemo(() => {
    if (liveReadyPSPCount > 1) {
      return `${liveReadyPSPCount} live-ready processors available for priority routing`;
    }
    if (activePSPCount > 1) {
      return `${blockedActivePSPCount} active processor${blockedActivePSPCount === 1 ? '' : 's'} still blocked from live charge`;
    }
    return 'Connect another live-ready processor to configure failover';
  }, [activePSPCount, blockedActivePSPCount, liveReadyPSPCount]);

  useEffect(() => {
    const id = localStorage.getItem('merchant_id') || '';
    setMerchantId(id);
    void loadIntegrationData(id);
  }, []);

  useEffect(() => {
    if (!webhookConfig) return;
    setWebhookForm({
      url: webhookConfig.url || '',
      enabled: Boolean(webhookConfig.enabled),
      events:
        webhookConfig.events?.length > 0
          ? webhookConfig.events
          : ['order.created', 'payment.completed', 'payment.failed'],
    });
  }, [webhookConfig]);

  const loadIntegrationData = async (merchantIdValue: string) => {
    try {
      setLoading(true);
      setNotice(null);

      const [stores, psps, apiKey, webhook, deliveries] = await Promise.all([
        merchantIdValue ? apiClient.getConnectedStores(merchantIdValue).catch(() => []) : [],
        merchantIdValue ? apiClient.getPSPs(merchantIdValue).catch(() => []) : [],
        apiClient.getApiCredentials().catch(() => null),
        apiClient.getWebhookConfig().catch(() => null),
        apiClient.getWebhookLogs(20).catch(() => ({ deliveries: [], summary_24h: null })),
      ]);

      setConnectedStores(stores);
      setConnectedPSPs(psps);
      setApiCredentials(apiKey);
      setWebhookConfig(webhook);
      setWebhookDeliveries(deliveries?.deliveries || []);
      setDeliverySummary(deliveries?.summary_24h || null);
      setWebhookSecret('');
    } catch (error) {
      console.error('Failed to load integration data:', error);
      setNotice({
        tone: 'warning',
        text: 'Some integrations data could not be loaded. Sales channels and processor setup may still be available while API or webhook data is degraded.',
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshWebhookState = async () => {
    try {
      const [config, deliveries] = await Promise.all([
        apiClient.getWebhookConfig(),
        apiClient.getWebhookLogs(20),
      ]);
      setWebhookConfig(config);
      setWebhookDeliveries(deliveries?.deliveries || []);
      setDeliverySummary(deliveries?.summary_24h || null);
    } catch (error) {
      console.error('Failed to refresh webhook state:', error);
    }
  };

  const handleStoreConnected = async () => {
    await loadIntegrationData(merchantId);
  };

  const handlePSPConnected = async () => {
    await loadIntegrationData(merchantId);
  };

  const handleSyncProducts = async (store: any) => {
    setSyncingStoreId(store.id);
    try {
      let result;
      if (store.platform === 'shopify') {
        result = await apiClient.syncShopifyProducts(merchantId);
      } else if (store.platform === 'wix') {
        result = await apiClient.syncPlatformProducts('wix');
      } else {
        result = await apiClient.syncPlatformProducts(store.platform);
      }
      setNotice({
        tone: 'success',
        text: result.message || `${store.platform} products synced successfully.`,
      });
      await loadIntegrationData(merchantId);
    } catch (error: any) {
      setNotice({
        tone: 'critical',
        text:
          error.response?.data?.detail ||
          error.message ||
          'Failed to sync products for this sales channel.',
      });
    } finally {
      setSyncingStoreId(null);
    }
  };

  const handleSetPrimaryStore = async (store: any) => {
    if (!store?.id) return;
    try {
      const response = await apiClient.setPrimaryStore(store.id);
      setNotice({
        tone: 'success',
        text: response.message || 'Primary sales channel updated.',
      });
      await loadIntegrationData(merchantId);
    } catch (error: any) {
      setNotice({
        tone: 'critical',
        text:
          error.response?.data?.detail ||
          error.message ||
          'Failed to set the primary sales channel.',
      });
    }
  };

  const handleDeleteStore = async (store: any) => {
    if (!confirm(`Disconnect sales channel "${store.store_name || store.name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.deleteStore(store.id);
      setNotice({
        tone: 'success',
        text: response.message || 'Sales channel removed.',
      });
      await loadIntegrationData(merchantId);
    } catch (error: any) {
      setNotice({
        tone: 'critical',
        text:
          error.response?.data?.detail ||
          error.message ||
          'Failed to remove the sales channel.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePSP = async (psp: any) => {
    if (!confirm(`Disconnect payment processor "${psp.name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.deletePSP(psp.id);
      setNotice({
        tone: 'success',
        text: response.message || 'Payment processor removed.',
      });
      await loadIntegrationData(merchantId);
    } catch (error: any) {
      setNotice({
        tone: 'critical',
        text:
          error.response?.data?.detail ||
          error.message ||
          'Failed to remove the payment processor.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestPSP = async (pspId: string) => {
    setTestingPspId(pspId);
    try {
      const result = await apiClient.testPSP(pspId);
      const status = (result?.status || '').toLowerCase();
      const message = result?.message || 'Processor test completed.';
      setNotice({
        tone:
          status === 'success'
            ? 'success'
            : status === 'warning'
              ? 'warning'
              : 'critical',
        text: message,
      });
    } catch (error: any) {
      setNotice({
        tone: 'critical',
        text:
          error.response?.data?.detail ||
          error.message ||
          'Processor test failed.',
      });
    } finally {
      setTestingPspId(null);
    }
  };

  const handleSaveWebhook = async () => {
    try {
      setSavingWebhook(true);
      setNotice(null);
      const saved = await apiClient.updateWebhookConfig({
        url: webhookForm.url.trim(),
        enabled: webhookForm.enabled,
        events: webhookForm.events,
      });
      setWebhookConfig({
        url: saved.url || webhookForm.url.trim(),
        enabled: Boolean(saved.enabled),
        events: saved.events || webhookForm.events,
        signing_secret_last4: saved.signing_secret_last4 || webhookConfig?.signing_secret_last4 || null,
        last_test_at: saved.last_test_at || webhookConfig?.last_test_at || null,
        last_test_status: saved.last_test_status || webhookConfig?.last_test_status || null,
        delivery_summary_24h: saved.delivery_summary_24h || webhookConfig?.delivery_summary_24h || null,
      });
      await refreshWebhookState();
      setNotice({
        tone: 'success',
        text: 'Webhook configuration saved.',
      });
    } catch (error: any) {
      setNotice({
        tone: 'critical',
        text:
          error.response?.data?.detail ||
          error.message ||
          'Failed to save webhook configuration.',
      });
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleToggleWebhookEvent = (eventType: string) => {
    setWebhookForm((current) => {
      const hasEvent = current.events.includes(eventType);
      return {
        ...current,
        events: hasEvent
          ? current.events.filter((item) => item !== eventType)
          : [...current.events, eventType],
      };
    });
  };

  const handleRotateApiKey = async () => {
    try {
      setRotatingApiKey(true);
      const credentials = await apiClient.rotateApiCredentials();
      setApiCredentials(credentials);
      setNotice({
        tone: 'success',
        text: 'Merchant API key rotated. The previous key is now invalid.',
      });
    } catch (error: any) {
      setNotice({
        tone: 'critical',
        text:
          error.response?.data?.detail ||
          error.message ||
          'Failed to rotate the merchant API key.',
      });
    } finally {
      setRotatingApiKey(false);
    }
  };

  const handleRevealSecret = async () => {
    try {
      setLoadingSecret(true);
      const secret = await apiClient.getWebhookSecret();
      setWebhookSecret(secret?.signing_secret || '');
    } catch (error: any) {
      setNotice({
        tone: 'critical',
        text:
          error.response?.data?.detail ||
          error.message ||
          'Failed to load the webhook signing secret.',
      });
    } finally {
      setLoadingSecret(false);
    }
  };

  const handleRotateSecret = async () => {
    try {
      setRotatingSecret(true);
      const result = await apiClient.rotateWebhookSecret();
      setWebhookSecret(result?.new_signing_secret || '');
      await refreshWebhookState();
      setNotice({
        tone: 'success',
        text: 'Webhook signing secret rotated. Use the new secret in your receiver immediately.',
      });
    } catch (error: any) {
      setNotice({
        tone: 'critical',
        text:
          error.response?.data?.detail ||
          error.message ||
          'Failed to rotate the webhook signing secret.',
      });
    } finally {
      setRotatingSecret(false);
    }
  };

  const handleSendTestWebhook = async () => {
    try {
      setSendingWebhookTest(true);
      setNotice(null);
      await apiClient.testWebhook(selectedTestEvent);
      await refreshWebhookState();
      setNotice({
        tone: 'success',
        text: `Test webhook sent using ${selectedTestEvent}. Check recent deliveries for the recorded result.`,
      });
    } catch (error: any) {
      setNotice({
        tone: 'critical',
        text:
          error.response?.data?.detail ||
          error.message ||
          'Failed to send the test webhook.',
      });
    } finally {
      setSendingWebhookTest(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({
        tone: 'success',
        text: `${label} copied to clipboard.`,
      });
    } catch (error) {
      setNotice({
        tone: 'warning',
        text: `Copying ${label.toLowerCase()} failed in this browser session.`,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full border-b-2 border-[color:var(--merchant-brand)] h-12 w-12" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('dashboard.integrations.eyebrow')}
        title={t('dashboard.integrations.title')}
        description={t('dashboard.integrations.description')}
        actions={
          <>
            <MerchantButton type="button" variant="secondary" onClick={() => setShowConnectPSP(true)} icon={CreditCard}>
              {t('dashboard.integrations.addPaymentSetup')}
            </MerchantButton>
            <MerchantButton type="button" onClick={() => setShowConnectStore(true)} icon={Store}>
              {t('dashboard.integrations.connectSalesChannel')}
            </MerchantButton>
          </>
        }
      />

      {notice ? (
        <div
          className={`rounded-[1rem] border px-4 py-3 text-sm ${
            notice.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : notice.tone === 'critical'
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <SurfaceCard strong>
        <div className="grid gap-3 px-5 py-5 lg:grid-cols-4">
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">
              {t('dashboard.integrations.summary.salesChannels')}
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {connectedStores.length}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
              {t('dashboard.integrations.summary.salesChannelsMeta')}
            </div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">
              {t('dashboard.integrations.summary.paymentSetup')}
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {liveReadyPSPCount}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
              {blockedActivePSPCount > 0
                ? t('dashboard.integrations.summary.paymentSetupBlocked', {
                    count: blockedActivePSPCount,
                    suffix: blockedActivePSPCount === 1 ? '' : 's',
                  })
                : t('dashboard.integrations.summary.paymentSetupReady')}
            </div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">
              {t('dashboard.integrations.summary.routing')}
            </div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {showRoutingTab
                ? t('dashboard.integrations.summary.routingPriority')
                : t('dashboard.integrations.summary.routingSingle')}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
              {routingSummary}
            </div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">
              {t('dashboard.integrations.summary.apiWebhooks')}
            </div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {webhookConfig?.enabled
                ? t('dashboard.integrations.summary.apiConfigured')
                : t('dashboard.integrations.summary.apiNeedsAttention')}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone={webhookStatusTone}>
                {webhookConfig?.enabled
                  ? t('dashboard.integrations.summary.webhookActive')
                  : t('dashboard.integrations.summary.webhookNotConfigured')}
              </StatusBadge>
              <StatusBadge tone={apiKeyAvailable ? 'success' : 'warning'}>
                {apiKeyAvailable
                  ? t('dashboard.integrations.summary.apiKeyIssued')
                  : t('dashboard.integrations.summary.apiKeyMissing')}
              </StatusBadge>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <div className="merchant-panel merchant-panel-muted p-2">
        <nav className={`grid gap-2 ${showRoutingTab ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'}`}>
          <button onClick={() => setActiveTab('stores')} className={tabButtonClass('stores')}>
            <Store className="h-4 w-4" />
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {t('dashboard.integrations.tab.salesChannels')}
              </div>
              <div className="text-xs text-[color:var(--merchant-muted)]">
                {t('dashboard.integrations.tab.salesChannelsMeta', {
                  count: connectedStores.length,
                })}
              </div>
            </div>
          </button>
          <button onClick={() => setActiveTab('psps')} className={tabButtonClass('psps')}>
            <CreditCard className="h-4 w-4" />
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {t('dashboard.integrations.tab.paymentSetup')}
              </div>
              <div className="text-xs text-[color:var(--merchant-muted)]">
                {t('dashboard.integrations.tab.paymentSetupMeta', {
                  liveReady: liveReadyPSPCount,
                  blocked: blockedActivePSPCount,
                })}
              </div>
            </div>
          </button>
          {showRoutingTab ? (
            <button onClick={() => setActiveTab('routing')} className={tabButtonClass('routing')}>
              <Settings className="h-4 w-4" />
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {t('dashboard.integrations.tab.routing')}
                </div>
                <div className="text-xs text-[color:var(--merchant-muted)]">
                  {t('dashboard.integrations.tab.routingMeta')}
                </div>
              </div>
            </button>
          ) : null}
          <button onClick={() => setActiveTab('webhooks')} className={tabButtonClass('webhooks')}>
            <Webhook className="h-4 w-4" />
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {t('dashboard.integrations.tab.apiWebhooks')}
              </div>
              <div className="text-xs text-[color:var(--merchant-muted)]">
                {inactiveWebhookCount === 0
                  ? t('dashboard.integrations.tab.apiWebhooksMetaLive')
                  : t('dashboard.integrations.tab.apiWebhooksMetaSetup')}
              </div>
            </div>
          </button>
        </nav>
      </div>

      {activeTab === 'stores' ? (
        <div className="space-y-4">
          <SurfaceCard
            title={t('dashboard.integrations.salesChannels.title')}
            description={t('dashboard.integrations.salesChannels.description')}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={primaryStoreId ? 'success' : 'warning'}>
                  {primaryStoreId
                    ? t('dashboard.integrations.salesChannels.primarySelected')
                    : t('dashboard.integrations.salesChannels.primaryNotSet')}
                </StatusBadge>
                <MerchantButton type="button" onClick={() => setShowConnectStore(true)} icon={Plus}>
                  {t('dashboard.integrations.salesChannels.connectChannel')}
                </MerchantButton>
              </div>
            }
          >
            <div className="space-y-3 p-5">
              {connectedStores.length > 0 ? (
                connectedStores.map((store, index) => (
                  <div
                    key={index}
                    className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="rounded-xl bg-[color:var(--merchant-brand-soft)] p-2">
                          <Store className="h-5 w-5 text-[color:var(--merchant-brand)]" />
                        </div>
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold text-[color:var(--merchant-ink)]">
                              {store.store_name || store.domain || `Store ${index + 1}`}
                            </h3>
                            {primaryStoreId && store.id === primaryStoreId ? (
                              <StatusBadge tone="brand">
                                {t('dashboard.integrations.salesChannels.primary')}
                              </StatusBadge>
                            ) : null}
                            <StatusBadge tone="success">
                              {t('dashboard.integrations.shared.active')}
                            </StatusBadge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--merchant-muted-strong)]">
                            <span className="capitalize">{store.platform}</span>
                            <span>•</span>
                            <span>{store.product_count || 0} products</span>
                          </div>
                          {store.domain ? (
                            <p className="break-all text-sm text-[color:var(--merchant-muted)]">{store.domain}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {store?.is_active && primaryStoreId && store.id !== primaryStoreId ? (
                          <button
                            onClick={() => handleSetPrimaryStore(store)}
                            className="merchant-button-secondary px-3 py-2 text-sm"
                          >
                            {t('dashboard.integrations.salesChannels.makePrimary')}
                          </button>
                        ) : null}
                        {store.platform === 'shopify' || store.platform === 'wix' ? (
                          <button
                            onClick={() => handleSyncProducts(store)}
                            disabled={syncingStoreId === store.id}
                            className="merchant-button-secondary px-3 py-2 text-sm disabled:opacity-50"
                            aria-label={t('dashboard.integrations.salesChannels.syncProducts')}
                          >
                            {syncingStoreId === store.id ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>{t('dashboard.integrations.salesChannels.syncing')}</span>
                              </>
                            ) : (
                              <span>{t('dashboard.integrations.salesChannels.syncProducts')}</span>
                            )}
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleDeleteStore(store)}
                          className="rounded-full border border-[color:var(--merchant-line)] px-3 py-2 text-sm font-medium text-[color:var(--merchant-muted-strong)] transition hover:bg-[color:var(--merchant-surface-muted)]"
                        >
                          {t('dashboard.integrations.shared.remove')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={Store}
                  title={t('dashboard.integrations.salesChannels.emptyTitle')}
                  description={t('dashboard.integrations.salesChannels.emptyDescription')}
                  action={
                    <MerchantButton type="button" onClick={() => setShowConnectStore(true)} icon={Plus}>
                      {t('dashboard.integrations.salesChannels.connectFirst')}
                    </MerchantButton>
                  }
                />
              )}
            </div>
          </SurfaceCard>

          <ConnectStoreModal
            isOpen={showConnectStore}
            onClose={() => setShowConnectStore(false)}
            onSuccess={handleStoreConnected}
            merchantId={merchantId}
          />
        </div>
      ) : null}

      {activeTab === 'psps' ? (
        <div className="space-y-4">
          <SurfaceCard
            title={t('dashboard.integrations.paymentSetup.title')}
            description={t('dashboard.integrations.paymentSetup.description')}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={liveReadyPSPCount > 0 ? 'success' : 'warning'}>
                  {liveReadyPSPCount > 0
                    ? t('dashboard.integrations.paymentSetup.liveReadyCount', {
                        count: liveReadyPSPCount,
                      })
                    : t('dashboard.integrations.paymentSetup.noLiveReady')}
                </StatusBadge>
                {blockedActivePSPCount > 0 ? (
                  <StatusBadge tone="warning">
                    {t('dashboard.integrations.paymentSetup.blockedCount', {
                      count: blockedActivePSPCount,
                    })}
                  </StatusBadge>
                ) : null}
                <StatusBadge tone={activePSPCount > 0 ? 'neutral' : 'warning'}>
                  {activePSPCount > 0
                    ? t('dashboard.integrations.paymentSetup.activeTotal', {
                        count: activePSPCount,
                      })
                    : t('dashboard.integrations.paymentSetup.noActive')}
                </StatusBadge>
                <MerchantButton type="button" onClick={() => setShowConnectPSP(true)} icon={Plus}>
                  {t('dashboard.integrations.paymentSetup.connectProcessor')}
                </MerchantButton>
              </div>
            }
          >
            <div className="space-y-3 p-5">
              {activePSPCount > 0 ? (
                connectedPSPs
                  .filter((psp) => psp.is_active)
                  .map((psp) => (
                    <div
                      key={psp.id}
                      className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="rounded-xl bg-[color:var(--merchant-brand-soft)] p-2">
                            <CreditCard className="h-5 w-5 text-[color:var(--merchant-brand)]" />
                          </div>
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-base font-semibold text-[color:var(--merchant-ink)]">
                                {psp.name}
                              </h3>
                              <StatusBadge tone="success">
                                {t('dashboard.integrations.shared.active')}
                              </StatusBadge>
                              <StatusBadge tone={psp.live_charge_ready ? 'success' : 'warning'}>
                                {psp.live_charge_ready
                                  ? t('dashboard.integrations.paymentSetup.liveReady')
                                  : t('dashboard.integrations.paymentSetup.blockedForLive')}
                              </StatusBadge>
                              <StatusBadge tone={psp.environment === 'live' ? 'brand' : 'warning'}>
                                {String(psp.environment || 'unknown').toUpperCase()}
                              </StatusBadge>
                              <StatusBadge
                                tone={
                                  psp.validation_status === 'valid'
                                    ? 'success'
                                    : psp.validation_status === 'invalid'
                                      ? 'critical'
                                      : 'warning'
                                }
                              >
                                {psp.validation_status === 'valid'
                                  ? t('dashboard.integrations.paymentSetup.validated')
                                  : psp.validation_status === 'invalid'
                                    ? t('dashboard.integrations.paymentSetup.validationFailed')
                                    : t('dashboard.integrations.paymentSetup.validationPending')}
                              </StatusBadge>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--merchant-muted-strong)]">
                              <span>{psp.success_rate || 0}% success rate</span>
                              <span>•</span>
                              <span>${psp.volume_today || 0} volume today</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--merchant-muted)]">
                              {psp.type === 'stripe' ? (
                                <>
                                  <span>
                                    {t('dashboard.integrations.paymentSetup.paymentFlow', {
                                      flow: 'PaymentIntent',
                                    })}
                                  </span>
                                  {psp.provider_summary?.account_id ? (
                                    <>
                                      <span>•</span>
                                      <span>Account: {psp.provider_summary.account_id}</span>
                                    </>
                                  ) : null}
                                </>
                              ) : null}
                              {psp.type === 'adyen' ? (
                                <>
                                  <span>Merchant account: {psp.provider_summary?.merchant_account || psp.account_id || 'Missing'}</span>
                                  <span>•</span>
                                  <span>{psp.provider_summary?.client_key_present ? 'Client key present' : 'Client key missing'}</span>
                                </>
                              ) : null}
                              {psp.type === 'checkout' ? (
                                <>
                                  <span>Channel: {psp.provider_summary?.processing_channel_id || psp.account_id || 'Missing'}</span>
                                  <span>•</span>
                                  <span>{psp.provider_summary?.public_key_present ? 'Public key present' : 'Public key missing'}</span>
                                </>
                              ) : null}
                            </div>
                            {psp.live_charge_ready ? (
                              <p className="text-sm text-emerald-700">
                                Ready for live initiation through the canonical PSP runtime.
                              </p>
                            ) : psp.readiness_blockers?.length ? (
                              <div className="rounded-[0.9rem] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                <div className="font-medium">
                                  {t('dashboard.integrations.paymentSetup.readinessBlockers')}
                                </div>
                                <div className="mt-1">
                                  {psp.readiness_blockers.join(' • ')}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleTestPSP(psp.id)}
                            disabled={testingPspId === psp.id}
                            className="merchant-button-secondary px-3 py-2 text-sm disabled:opacity-50"
                          >
                            {testingPspId === psp.id ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>{t('dashboard.integrations.paymentSetup.testing')}</span>
                              </>
                            ) : (
                              <span>{t('dashboard.integrations.paymentSetup.runTest')}</span>
                            )}
                          </button>
                          <button
                            onClick={() => handleDeletePSP(psp)}
                            className="rounded-full border border-[color:var(--merchant-line)] px-3 py-2 text-sm font-medium text-[color:var(--merchant-muted-strong)] transition hover:bg-[color:var(--merchant-surface-muted)]"
                          >
                            {t('dashboard.integrations.shared.remove')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title={t('dashboard.integrations.paymentSetup.emptyTitle')}
                  description={t('dashboard.integrations.paymentSetup.emptyDescription')}
                  action={
                    <MerchantButton type="button" onClick={() => setShowConnectPSP(true)} icon={Plus}>
                      {t('dashboard.integrations.paymentSetup.connectFirst')}
                    </MerchantButton>
                  }
                />
              )}
            </div>
          </SurfaceCard>

          <div className="merchant-panel merchant-panel-muted px-5 py-4">
            <div className="grid gap-3 text-sm text-[color:var(--merchant-muted-strong)] md:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">Fallback coverage</div>
                <div>Route checkout to another processor when one path degrades.</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">Checkout continuity</div>
                <div>Keep payment execution attached to the processors that are actually connected.</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">Operational resilience</div>
                <div>Test a processor before launch and keep the backup order visible.</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">Truthful setup</div>
                <div>Active processors stay visible even when blocked; live readiness is shown separately.</div>
              </div>
            </div>
          </div>

          {showConnectPSP && !selectedPSPProvider ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6">
                <h3 className="mb-4 text-lg font-semibold">Select payment processor</h3>
                <div className="space-y-3">
                  {SUPPORTED_CONNECT_PROVIDERS.map((psp) => (
                    <button
                      key={psp}
                      onClick={() => setSelectedPSPProvider(psp)}
                      className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-gray-50"
                    >
                      <h4 className="font-medium">{psp}</h4>
                      <p className="text-sm text-gray-600">Configure the real runtime credentials used for payment initiation</p>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowConnectPSP(false)}
                  className="mt-4 w-full rounded-lg border py-2 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {selectedPSPProvider ? (
            <PSPConfigForm
              provider={selectedPSPProvider}
              merchantId={merchantId}
              onClose={() => {
                setSelectedPSPProvider('');
                setShowConnectPSP(false);
              }}
              onSuccess={() => {
                setSelectedPSPProvider('');
                setShowConnectPSP(false);
                void handlePSPConnected();
              }}
              apiClient={apiClient}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === 'routing' ? (
        <div className="space-y-4">
          <PSPRoutingConfig connectedPSPs={connectedPSPs} />
        </div>
      ) : null}

      {activeTab === 'webhooks' ? (
        <div className="space-y-4">
          <SurfaceCard
            title="API credentials"
            description="Use the current merchant API key for external payment execution. The key shown here comes directly from backend truth."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={apiKeyAvailable ? 'success' : 'warning'}>
                  {apiKeyAvailable ? 'Key issued' : 'Key not issued'}
                </StatusBadge>
                <MerchantButton
                  type="button"
                  variant="secondary"
                  onClick={handleRotateApiKey}
                  icon={RefreshCcw}
                  disabled={rotatingApiKey}
                >
                  {rotatingApiKey ? 'Rotating…' : apiKeyAvailable ? 'Rotate key' : 'Issue key'}
                </MerchantButton>
              </div>
            }
          >
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
                  Merchant API key
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={apiCredentials?.api_key || ''}
                    readOnly
                    placeholder="Issue a merchant API key to enable external payment execution."
                    className="merchant-input w-full font-mono text-sm sm:flex-1"
                  />
                  <button
                    onClick={() => copyToClipboard(apiCredentials?.api_key || '', 'API key')}
                    className="merchant-button-secondary px-3 py-2 disabled:opacity-50"
                    disabled={!apiCredentials?.api_key}
                  >
                    <Copy className="h-4 w-4" />
                    <span>Copy key</span>
                  </button>
                </div>
              </div>
              <div className="grid gap-3 text-sm text-[color:var(--merchant-muted-strong)] md:grid-cols-3">
                <div className="rounded-[0.95rem] border border-[color:var(--merchant-line)] bg-white/78 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--merchant-muted)]">
                    Header
                  </div>
                  <div className="mt-2 font-medium text-[color:var(--merchant-ink)]">
                    {apiCredentials?.header_name || 'X-Merchant-API-Key'}
                  </div>
                </div>
                <div className="rounded-[0.95rem] border border-[color:var(--merchant-line)] bg-white/78 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--merchant-muted)]">
                    Endpoint
                  </div>
                  <div className="mt-2 font-medium text-[color:var(--merchant-ink)]">
                    {apiCredentials?.sample_endpoint || '/payment/execute'}
                  </div>
                </div>
                <div className="rounded-[0.95rem] border border-[color:var(--merchant-line)] bg-white/78 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--merchant-muted)]">
                    Last 4
                  </div>
                  <div className="mt-2 font-medium text-[color:var(--merchant-ink)]">
                    {apiCredentials?.api_key_last4 || 'Not issued'}
                  </div>
                </div>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard
            title="Webhook configuration"
            description="Send merchant order, payment, and refund events to your own stack. Configuration and delivery logs below come from real backend state."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={webhookStatusTone}>
                  {webhookConfig?.enabled ? 'Webhook active' : 'Webhook not configured'}
                </StatusBadge>
                <MerchantButton
                  type="button"
                  variant="secondary"
                  onClick={handleSaveWebhook}
                  disabled={savingWebhook}
                >
                  {savingWebhook ? 'Saving…' : 'Save configuration'}
                </MerchantButton>
              </div>
            }
          >
            <div className="space-y-5 p-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
                  Destination URL
                </label>
                <input
                  type="text"
                  value={webhookForm.url}
                  onChange={(event) =>
                    setWebhookForm((current) => ({ ...current, url: event.target.value }))
                  }
                  placeholder="https://your-domain.com/webhooks/pivota"
                  className="merchant-input w-full"
                />
              </div>

              <label className="flex items-center gap-3 rounded-[0.95rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3">
                <input
                  type="checkbox"
                  checked={webhookForm.enabled}
                  onChange={(event) =>
                    setWebhookForm((current) => ({ ...current, enabled: event.target.checked }))
                  }
                  className="h-4 w-4"
                />
                <div>
                  <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                    Enable outbound delivery
                  </div>
                  <div className="text-sm text-[color:var(--merchant-muted)]">
                    Deliver subscribed merchant events to the configured destination.
                  </div>
                </div>
              </label>

              <div>
                <div className="mb-2 text-sm font-medium text-[color:var(--merchant-ink)]">
                  Enabled events
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {MERCHANT_WEBHOOK_EVENTS.map((eventType) => {
                    const checked = webhookForm.events.includes(eventType);
                    return (
                      <label
                        key={eventType}
                        className="flex items-center gap-3 rounded-[0.95rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleWebhookEvent(eventType)}
                          className="h-4 w-4"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-[color:var(--merchant-ink)]">
                            {eventType}
                          </div>
                          <div className="text-xs text-[color:var(--merchant-muted)]">
                            Merchant-facing outbound event
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                        Signing secret
                      </div>
                      <div className="text-sm text-[color:var(--merchant-muted)]">
                        Use the signing secret to verify Pivota webhook signatures at your destination.
                      </div>
                    </div>
                    <StatusBadge tone="neutral">
                      Last 4: {webhookConfig?.signing_secret_last4 || 'Not generated'}
                    </StatusBadge>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleRevealSecret}
                      className="merchant-button-secondary px-3 py-2"
                      disabled={loadingSecret}
                    >
                      {loadingSecret ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading…</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="h-4 w-4" />
                          <span>Reveal secret</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleRotateSecret}
                      className="merchant-button-secondary px-3 py-2"
                      disabled={rotatingSecret}
                    >
                      {rotatingSecret ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Rotating…</span>
                        </>
                      ) : (
                        <>
                          <RefreshCcw className="h-4 w-4" />
                          <span>Rotate secret</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(webhookSecret, 'Webhook secret')}
                      className="merchant-button-secondary px-3 py-2 disabled:opacity-50"
                      disabled={!webhookSecret}
                    >
                      <Copy className="h-4 w-4" />
                      <span>Copy secret</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={webhookSecret}
                    readOnly
                    placeholder="Reveal the current secret when you need to configure your receiver."
                    className="merchant-input mt-3 w-full font-mono text-sm"
                  />
                </div>

                <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-4">
                  <div className="mb-3 text-sm font-medium text-[color:var(--merchant-ink)]">
                    Delivery controls
                  </div>
                  <div className="space-y-3 text-sm text-[color:var(--merchant-muted-strong)]">
                    <div className="rounded-[0.95rem] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-3 py-3">
                      <div className="font-medium text-[color:var(--merchant-ink)]">Last test status</div>
                      <div className="mt-1">
                        {webhookConfig?.last_test_status || 'No test delivery yet'}
                      </div>
                    </div>
                    <div className="rounded-[0.95rem] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-3 py-3">
                      <div className="font-medium text-[color:var(--merchant-ink)]">Last test time</div>
                      <div className="mt-1">
                        {webhookConfig?.last_test_at
                          ? new Date(webhookConfig.last_test_at).toLocaleString()
                          : 'No test delivery yet'}
                      </div>
                    </div>
                    <MerchantButton
                      type="button"
                      onClick={handleSendTestWebhook}
                      icon={Send}
                      disabled={sendingWebhookTest}
                    >
                      {sendingWebhookTest ? 'Sending test…' : `Send ${selectedTestEvent} test`}
                    </MerchantButton>
                  </div>
                </div>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard
            title="Recent deliveries"
            description="Inspect the most recent webhook attempts with real HTTP status, latency, and retry state."
            action={
              deliverySummary ? (
                <StatusBadge tone={deliverySummary.failed > 0 ? 'warning' : 'success'}>
                  {deliverySummary.succeeded || 0} delivered / {deliverySummary.failed || 0} failed
                </StatusBadge>
              ) : null
            }
          >
            <div className="space-y-3 p-5">
              {webhookDeliveries.length > 0 ? (
                webhookDeliveries.map((delivery) => (
                  <div
                    key={delivery.delivery_id}
                    className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                            {delivery.event_type}
                          </div>
                          <StatusBadge
                            tone={
                              delivery.status === 'delivered'
                                ? 'success'
                                : delivery.status === 'retrying'
                                  ? 'warning'
                                  : 'critical'
                            }
                          >
                            {delivery.status}
                          </StatusBadge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--merchant-muted-strong)]">
                          <span>HTTP {delivery.http_status || 'n/a'}</span>
                          <span>•</span>
                          <span>{delivery.attempt_count || 0} attempt(s)</span>
                          <span>•</span>
                          <span>{delivery.latency_ms || 0} ms</span>
                        </div>
                        <div className="text-sm text-[color:var(--merchant-muted)]">
                          {delivery.created_at
                            ? new Date(delivery.created_at).toLocaleString()
                            : 'Timestamp unavailable'}
                        </div>
                        {delivery.last_error ? (
                          <div className="text-sm text-rose-700">{delivery.last_error}</div>
                        ) : null}
                      </div>
                      <div className="text-right text-xs text-[color:var(--merchant-muted)]">
                        <div>{delivery.delivery_id}</div>
                        {delivery.next_retry_at ? (
                          <div>Retry at {new Date(delivery.next_retry_at).toLocaleString()}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={Webhook}
                  title="No webhook deliveries yet"
                  description="Save a destination URL and send a test delivery to start recording webhook attempts here."
                />
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard
            title="Quick start"
            description="This example reflects the live merchant API contract used for payment execution."
          >
            <div className="overflow-x-auto bg-[#15171d] p-4 text-gray-100">
              <pre className="text-sm">
{`curl -X POST https://api.pivota.cc/payment/execute \\
  -H "X-Merchant-API-Key: ${quickStartApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 1000,
    "currency": "USD",
    "order_id": "ord_1001",
    "customer_email": "customer@example.com",
    "description": "Payment for ord_1001",
    "metadata": {
      "channel": "merchant_integration"
    }
  }'`}
              </pre>
            </div>
          </SurfaceCard>
        </div>
      ) : null}
    </div>
  );
}
