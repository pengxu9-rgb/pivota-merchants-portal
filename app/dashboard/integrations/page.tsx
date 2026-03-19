'use client';

import { useState, useEffect } from 'react';
import {
  Store,
  CreditCard,
  Plus,
  Settings,
  Loader2,
  Copy,
  Webhook,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import PSPRoutingConfig from '@/components/PSPRoutingConfig';
import ConnectStoreModal from '@/components/ConnectStoreModal';
import { PSPConfigForm } from '@/components/PSPConfigForm';
import {
  EmptyState,
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [merchantId, setMerchantId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'stores' | 'psps' | 'routing' | 'webhooks'>('stores');
  
  // Data states
  const [connectedStores, setConnectedStores] = useState<any[]>([]);
  const [connectedPSPs, setConnectedPSPs] = useState<any[]>([]);
  const [webhookConfig, setWebhookConfig] = useState<any>(null);
  const [apiKey, setApiKey] = useState<string>('');
  
  // UI states
  const [showConnectStore, setShowConnectStore] = useState(false);
  const [showConnectPSP, setShowConnectPSP] = useState(false);
  const [selectedPSPProvider, setSelectedPSPProvider] = useState<string>('');
  const [syncingStoreId, setSyncingStoreId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const primaryStoreId = connectedStores.find((s) => s?.is_active)?.id || null;
  const activePSPCount = connectedPSPs.filter((p) => p.is_active).length;
  const showRoutingTab = activePSPCount > 1;
  const inactiveWebhookCount = webhookConfig?.enabled ? 0 : 1;
  const tabButtonClass = (tab: 'stores' | 'psps' | 'routing' | 'webhooks') =>
    `flex min-h-[4.5rem] items-center gap-3 rounded-[1rem] px-4 py-3 text-left transition ${
      activeTab === tab
        ? 'bg-white text-[color:var(--merchant-ink)] shadow-[var(--merchant-shadow-panel)]'
        : 'text-[color:var(--merchant-muted-strong)] hover:bg-white/75'
    }`;

  useEffect(() => {
    const id = localStorage.getItem('merchant_id') || '';
    const key = localStorage.getItem('merchant_api_key') || 'pk_live_' + Math.random().toString(36).substring(2, 15);
    setMerchantId(id);
    setApiKey(key);
    loadIntegrationData(id);
  }, []);

  const loadIntegrationData = async (merchantId: string) => {
    try {
      setLoading(true);
      
      const [stores, psps, webhook] = await Promise.all([
        merchantId ? apiClient.getConnectedStores(merchantId).catch(() => []) : [],
        merchantId ? apiClient.getPSPs(merchantId).catch(() => []) : [],
        apiClient.getWebhookConfig().catch(() => null),
      ]);
      
      setConnectedStores(stores);
      setConnectedPSPs(psps);
      setWebhookConfig(webhook);
      
      console.log('📦 Integration data loaded:', { stores, psps, webhook });
    } catch (error) {
      console.error('❌ Failed to load integration data:', error);
    } finally {
      setLoading(false);
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
      alert(result.message || `✅ ${store.platform} products synced successfully!`);
      await loadIntegrationData(merchantId); // Reload to update product counts
    } catch (error: any) {
      alert('❌ Failed to sync products: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSyncingStoreId(null);
    }
  };

  const handleSetPrimaryStore = async (store: any) => {
    if (!store?.id) return;
    try {
      const response = await apiClient.setPrimaryStore(store.id);
      alert(response.message || '✅ Primary store updated');
      await loadIntegrationData(merchantId);
    } catch (error: any) {
      alert('❌ Failed to set primary store: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteStore = async (store: any) => {
    if (!confirm(`Are you sure you want to delete the store "${store.store_name || store.name}"?\n\nThis will disconnect the store.`)) {
      return;
    }
    
    try {
      setLoading(true);
      const response = await apiClient.deleteStore(store.id);
      alert(response.message || '✅ Store deleted');
      await loadIntegrationData(merchantId);
    } catch (error: any) {
      alert('❌ Delete failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePSP = async (psp: any) => {
    if (!confirm(`Are you sure you want to delete PSP "${psp.name}"?\n\nThis will disconnect the payment processor.`)) {
      return;
    }
    
    try {
      setLoading(true);
      const response = await apiClient.deletePSP(psp.id);
      alert(response.message || '✅ PSP deleted');
      await loadIntegrationData(merchantId);
    } catch (error: any) {
      alert('❌ Delete failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleTestPSP = async (pspId: string) => {
    setTesting(pspId);
    try {
      const result = await apiClient.testPSP(pspId);
      const status = (result?.status || '').toLowerCase();
      const message = result?.message || 'PSP test completed';

      if (status === 'success') {
        alert('✅ ' + message);
        return;
      }

      if (status === 'warning') {
        alert('⚠️ ' + message);
        return;
      }

      alert('❌ ' + message);
    } catch (error: any) {
      alert('❌ PSP test failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setTesting(null);
    }
  };

  const handleSaveWebhook = async () => {
    const url = prompt('Enter your webhook URL:', webhookConfig?.url || '');
    if (!url) return;
    
    try {
      await apiClient.updateWebhookConfig({
        url,
        events: ['order.created', 'payment.completed', 'payment.failed'],
        enabled: true,
      });
      alert('✅ Webhook configuration saved!');
      await loadIntegrationData(merchantId);
    } catch (error: any) {
      alert('❌ Failed to save webhook: ' + (error.response?.data?.detail || error.message));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Set up sales channels, payments, and merchant-facing commerce plumbing."
        description="Keep storefront connections, payment setup, routing rules, and API credentials in one place, but frame them as launch readiness rather than platform internals."
        actions={
          <>
            <MerchantButton type="button" variant="secondary" onClick={() => setShowConnectPSP(true)} icon={CreditCard}>
              Add payment setup
            </MerchantButton>
            <MerchantButton type="button" onClick={() => setShowConnectStore(true)} icon={Store}>
              Connect sales channel
            </MerchantButton>
          </>
        }
      />

      <SurfaceCard strong>
        <div className="grid gap-3 px-5 py-5 lg:grid-cols-4">
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">Sales channels</div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {connectedStores.length}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
              Connected storefronts and feeds
            </div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">Payment setup</div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              {activePSPCount}
            </div>
            <div className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
              Active processors ready to route
            </div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">Primary channel</div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {connectedStores.find((store) => store?.is_active)?.store_name ||
                connectedStores.find((store) => store?.is_active)?.domain ||
                'Not set'}
            </div>
            <div className="mt-2">
              <StatusBadge tone={primaryStoreId ? 'success' : 'warning'}>
                {primaryStoreId ? 'Primary channel selected' : 'Choose a primary channel'}
              </StatusBadge>
            </div>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3.5">
            <div className="text-sm text-[color:var(--merchant-muted)]">API & webhooks</div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
              {webhookConfig?.enabled ? 'Configured' : 'Needs attention'}
            </div>
            <div className="mt-2">
              <StatusBadge tone={webhookConfig?.enabled ? 'success' : 'warning'}>
                {webhookConfig?.enabled ? 'Webhook active' : 'Webhook not configured'}
              </StatusBadge>
            </div>
          </div>
        </div>
      </SurfaceCard>


      <div className="merchant-panel merchant-panel-muted p-2">
        <nav className={`grid gap-2 ${showRoutingTab ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'}`}>
          <button
            onClick={() => setActiveTab('stores')}
            className={tabButtonClass('stores')}
          >
            <Store className="h-4 w-4" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Sales channels</div>
              <div className="text-xs text-[color:var(--merchant-muted)]">
                {connectedStores.length} connected storefronts and feeds
              </div>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('psps')}
            className={tabButtonClass('psps')}
          >
            <CreditCard className="h-4 w-4" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Payment setup</div>
              <div className="text-xs text-[color:var(--merchant-muted)]">
                {activePSPCount} active processors ready to route
              </div>
            </div>
          </button>
          {showRoutingTab && (
            <button
              onClick={() => setActiveTab('routing')}
              className={tabButtonClass('routing')}
            >
              <Settings className="h-4 w-4" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Routing</div>
                <div className="text-xs text-[color:var(--merchant-muted)]">
                  Distribute traffic across active processors
                </div>
              </div>
            </button>
          )}
          <button
            onClick={() => setActiveTab('webhooks')}
            className={tabButtonClass('webhooks')}
          >
            <Webhook className="h-4 w-4" />
            <div className="min-w-0">
              <div className="text-sm font-medium">API & webhooks</div>
              <div className="text-xs text-[color:var(--merchant-muted)]">
                {inactiveWebhookCount === 0 ? 'Delivery is configured' : 'Webhook setup needs attention'}
              </div>
            </div>
          </button>
        </nav>
      </div>

      {/* Stores Tab */}
      {activeTab === 'stores' && (
        <div className="space-y-4">
          <SurfaceCard
            title="Sales channels"
            description="Keep connected storefronts, sync status, and the primary channel in one operational view."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={primaryStoreId ? 'success' : 'warning'}>
                  {primaryStoreId ? 'Primary selected' : 'Primary not set'}
                </StatusBadge>
                <MerchantButton type="button" onClick={() => setShowConnectStore(true)} icon={Plus}>
                  Connect channel
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
                              {store.store_name || store.domain || 'Store ' + (index + 1)}
                            </h3>
                            {primaryStoreId && store.id === primaryStoreId ? (
                              <StatusBadge tone="brand">Primary</StatusBadge>
                            ) : null}
                            <StatusBadge tone="success">Active</StatusBadge>
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
                        {store?.is_active && primaryStoreId && store.id !== primaryStoreId && (
                          <button
                            onClick={() => handleSetPrimaryStore(store)}
                            className="merchant-button-secondary px-3 py-2 text-sm"
                          >
                            Make primary
                          </button>
                        )}
                        {(store.platform === 'shopify' || store.platform === 'wix') && (
                          <button
                            onClick={() => handleSyncProducts(store)}
                            disabled={syncingStoreId === store.id}
                            className="merchant-button-secondary px-3 py-2 text-sm disabled:opacity-50"
                            aria-label="Sync products"
                          >
                            {syncingStoreId === store.id ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Syncing...</span>
                              </>
                            ) : (
                              <span>Sync products</span>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteStore(store)}
                          className="rounded-full border border-[color:var(--merchant-line)] px-3 py-2 text-sm font-medium text-[color:var(--merchant-muted-strong)] transition hover:bg-[color:var(--merchant-surface-muted)]"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={Store}
                  title="No sales channels connected yet"
                  description="Connect Shopify, Wix, or another storefront so catalog sync and channel readiness can show up here."
                  action={
                    <MerchantButton type="button" onClick={() => setShowConnectStore(true)} icon={Plus}>
                      Connect first channel
                    </MerchantButton>
                  }
                />
              )}
            </div>
          </SurfaceCard>

          {/* Connect Store Modal - supports all platforms */}
          <ConnectStoreModal
            isOpen={showConnectStore}
            onClose={() => setShowConnectStore(false)}
            onSuccess={handleStoreConnected}
            merchantId={merchantId}
          />
        </div>
      )}

      {/* PSPs Tab */}
      {activeTab === 'psps' && (
        <div className="space-y-4">
          <SurfaceCard
            title="Payment setup"
            description="Review processor health, test connections, and keep routing coverage ready for checkout traffic."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={activePSPCount > 0 ? 'success' : 'warning'}>
                  {activePSPCount > 0 ? `${activePSPCount} active` : 'No active processors'}
                </StatusBadge>
                <MerchantButton type="button" onClick={() => setShowConnectPSP(true)} icon={Plus}>
                  Connect processor
                </MerchantButton>
              </div>
            }
          >
            <div className="space-y-3 p-5">
              {activePSPCount > 0 ? (
                connectedPSPs.filter((p) => p.is_active).map((psp) => (
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
                            <StatusBadge tone="success">Active</StatusBadge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--merchant-muted-strong)]">
                            <span>{psp.success_rate || 0}% success rate</span>
                            <span>•</span>
                            <span>${psp.volume_today || 0} volume today</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleTestPSP(psp.id)}
                          disabled={testing === psp.id}
                          className="merchant-button-secondary px-3 py-2 text-sm disabled:opacity-50"
                        >
                          {testing === psp.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <span>Run test</span>
                          )}
                        </button>
                        <button
                          onClick={() => handleDeletePSP(psp)}
                          className="rounded-full border border-[color:var(--merchant-line)] px-3 py-2 text-sm font-medium text-[color:var(--merchant-muted-strong)] transition hover:bg-[color:var(--merchant-surface-muted)]"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title="No payment processors connected"
                  description="Add at least one processor so checkout traffic, fallback routing, and settlement reporting can be managed from here."
                  action={
                    <MerchantButton type="button" onClick={() => setShowConnectPSP(true)} icon={Plus}>
                      Connect first processor
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
                <div>Route traffic to another processor when one path degrades.</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">Acceptance lift</div>
                <div>Improve approval rates by matching processors to geography or card mix.</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">Operational resilience</div>
                <div>Keep checkout moving while you test, update, or replace a provider.</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">Commercial flexibility</div>
                <div>Compare fees, payout timing, and settlement behavior across providers.</div>
              </div>
            </div>
          </div>

          {/* Connect PSP - Provider Selection or Config Form */}
          {showConnectPSP && !selectedPSPProvider && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">Select Payment Processor</h3>
                <div className="space-y-3">
                  {['Stripe', 'PayPal', 'Adyen', 'Checkout.com', 'Square', 'Mollie', 'Braintree'].map((psp) => (
                    <button
                      key={psp}
                      onClick={() => setSelectedPSPProvider(psp)}
                      className="w-full p-4 border rounded-lg hover:bg-gray-50 text-left transition-colors"
                    >
                      <h4 className="font-medium">{psp}</h4>
                      <p className="text-sm text-gray-600">Configure {psp} payment processing</p>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowConnectPSP(false)}
                  className="mt-4 w-full py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          
          {/* PSP Config Form */}
          {selectedPSPProvider && (
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
                handlePSPConnected();
              }}
              apiClient={apiClient}
            />
          )}
        </div>
      )}

      {/* Routing Tab */}
      {activeTab === 'routing' && (
        <div className="space-y-4">
          <PSPRoutingConfig connectedPSPs={connectedPSPs} />
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <SurfaceCard
            title="API credentials"
            description="Keep the current merchant API key available for secure integrations and internal implementation handoff."
            action={
              <StatusBadge tone="neutral">
                {apiKey ? 'Key available' : 'No key found'}
              </StatusBadge>
            }
          >
            <div className="p-5">
              <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">Merchant API key</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={apiKey}
                  readOnly
                  className="merchant-input w-full font-mono text-sm sm:flex-1"
                />
                <button
                  onClick={() => copyToClipboard(apiKey)}
                  className="merchant-button-secondary px-3 py-2"
                >
                  <Copy className="h-4 w-4" />
                  <span>Copy key</span>
                </button>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard
            title="Webhook configuration"
            description="Point delivery events to your commerce stack so payment and order updates stay in sync."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={webhookConfig?.enabled ? 'success' : 'warning'}>
                  {webhookConfig?.enabled ? 'Webhook active' : 'Webhook not configured'}
                </StatusBadge>
                <MerchantButton type="button" onClick={handleSaveWebhook}>
                  Configure
                </MerchantButton>
              </div>
            }
          >
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">Webhook URL</label>
                <input
                  type="text"
                  value={webhookConfig?.url || ''}
                  placeholder="https://your-domain.com/webhooks/pivota"
                  className="merchant-input w-full"
                  readOnly
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">Enabled events</label>
                <div className="flex flex-wrap gap-2">
                  {['order.created', 'payment.completed', 'payment.failed', 'product.out_of_stock'].map((event) => (
                    <StatusBadge
                      key={event}
                      tone={webhookConfig?.events?.includes(event) ? 'brand' : 'neutral'}
                    >
                      {event}
                    </StatusBadge>
                  ))}
                </div>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard
            title="Quick start"
            description="Use the current merchant token pattern as a starting point for internal engineering or partner setup."
          >
            <div className="overflow-x-auto bg-[#15171d] p-4 text-gray-100">
              <pre className="text-sm">
{`// Example: Create an order
curl -X POST https://api.pivota.cc/orders \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer_email": "customer@example.com",
    "items": [
      {
        "product_id": "prod_123",
        "quantity": 2
      }
    ]
  }'`}
              </pre>
            </div>
          </SurfaceCard>
        </div>
      )}
    </div>
  );
}
