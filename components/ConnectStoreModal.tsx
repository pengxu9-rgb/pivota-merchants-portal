'use client';

/**
 * Connect Store Modal - supports all platforms
 * Shopify, Wix, WooCommerce, BigCommerce, PrestaShop
 */

import { useState } from 'react';
import { X, Store, Loader2, Link as LinkIcon, Copy } from 'lucide-react';
import { API_CONFIG } from '@/lib/config';

interface ConnectStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  merchantId: string;
}

export default function ConnectStoreModal({ isOpen, onClose, onSuccess, merchantId }: ConnectStoreModalProps) {
  // Keep OAuth hidden by default until the product is ready.
  const SHOPIFY_OAUTH_ENABLED = (
    process.env.NEXT_PUBLIC_FEATURE_SHOPIFY_OAUTH ||
    process.env.NEXT_PUBLIC_ENABLE_SHOPIFY_OAUTH ||
    'false'
  ).toLowerCase() === 'true';
  const [platform, setPlatform] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const baseUrl = API_CONFIG.BASE_URL;
  
  // Form fields for different platforms
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [shopifyConnectMode, setShopifyConnectMode] = useState<'oauth' | 'custom_token'>(
    SHOPIFY_OAUTH_ENABLED ? 'oauth' : 'custom_token'
  );
  const [shopifyInstallUrl, setShopifyInstallUrl] = useState('');
  const [shopifyClientId, setShopifyClientId] = useState('');
  const [shopifyClientSecret, setShopifyClientSecret] = useState('');
  
  const [wixSiteId, setWixSiteId] = useState('');
  const [wixApiKey, setWixApiKey] = useState('');
  const [wixStoreName, setWixStoreName] = useState('');
  
  const [wooStoreUrl, setWooStoreUrl] = useState('');
  const [wooConsumerKey, setWooConsumerKey] = useState('');
  const [wooConsumerSecret, setWooConsumerSecret] = useState('');
  
  const [bcStoreHash, setBcStoreHash] = useState('');
  const [bcAccessToken, setBcAccessToken] = useState('');
  const [bcClientId, setBcClientId] = useState('');
  
  const [psStoreUrl, setPsStoreUrl] = useState('');
  const [psApiKey, setPsApiKey] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let endpoint = '';
      let payload: any = { merchant_id: merchantId };

      switch (platform) {
        case 'shopify':
          if (!SHOPIFY_OAUTH_ENABLED || shopifyConnectMode === 'custom_token') {
            endpoint = `${baseUrl}${API_CONFIG.ENDPOINTS.SHOPIFY_CONNECT}`;
            payload = {
              merchant_id: merchantId,
              shop_domain: shopifyDomain,
              client_id: shopifyClientId,
              client_secret: shopifyClientSecret,
            };
          } else {
            endpoint = `${baseUrl}${API_CONFIG.ENDPOINTS.SHOPIFY_INSTALL_LINKS}`;
            payload = {
              merchant_id: merchantId,
              shop_domain: shopifyDomain,
            };
          }
          break;

        case 'wix':
          endpoint = `${baseUrl}${API_CONFIG.ENDPOINTS.WIX_CONNECT}`;
          payload = {
            merchant_id: merchantId,
            site_id: wixSiteId,
            api_key: wixApiKey,
            store_name: wixStoreName || wixSiteId
          };
          break;

        case 'woocommerce':
          endpoint = `${baseUrl}${API_CONFIG.ENDPOINTS.WOOCOMMERCE_CONNECT}`;
          payload = {
            merchant_id: merchantId,
            store_url: wooStoreUrl,
            consumer_key: wooConsumerKey,
            consumer_secret: wooConsumerSecret
          };
          break;

        case 'bigcommerce':
          endpoint = `${baseUrl}${API_CONFIG.ENDPOINTS.BIGCOMMERCE_CONNECT}`;
          payload = {
            merchant_id: merchantId,
            store_hash: bcStoreHash,
            access_token: bcAccessToken,
            client_id: bcClientId || undefined
          };
          break;

        case 'prestashop':
          endpoint = `${baseUrl}${API_CONFIG.ENDPOINTS.PRESTASHOP_CONNECT}`;
          payload = {
            merchant_id: merchantId,
            store_url: psStoreUrl,
            api_key: psApiKey
          };
          break;

        default:
          alert('Please select a platform');
          setLoading(false);
          return;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('merchant_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        if (platform === 'shopify') {
          if (!SHOPIFY_OAUTH_ENABLED || shopifyConnectMode === 'custom_token') {
            alert('✅ Shopify store connected successfully!');
            onSuccess();
            handleClose();
          } else {
            const installUrl = data?.install_url || '';
            if (installUrl) {
              setShopifyInstallUrl(installUrl);
              window.open(installUrl, '_blank', 'noopener,noreferrer');
              alert(
                `✅ Install link created. Complete the Shopify authorization, then return here and click "I've installed, refresh stores".`
              );
            } else {
              alert('✅ Install link created, but no URL was returned. Please try again.');
            }
          }
        } else {
          alert(`✅ ${platform.charAt(0).toUpperCase() + platform.slice(1)} store connected successfully!`);
          onSuccess();
          handleClose();
        }
      } else {
        alert(`❌ Failed: ${data.detail || data.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPlatform('');
    setShopifyDomain('');
    setShopifyConnectMode(SHOPIFY_OAUTH_ENABLED ? 'oauth' : 'custom_token');
    setShopifyInstallUrl('');
    setShopifyClientId('');
    setShopifyClientSecret('');
    setWixSiteId('');
    setWixApiKey('');
    setWixStoreName('');
    setWooStoreUrl('');
    setWooConsumerKey('');
    setWooConsumerSecret('');
    setBcStoreHash('');
    setBcAccessToken('');
    setBcClientId('');
    setPsStoreUrl('');
    setPsApiKey('');
    onClose();
  };

  const handleShopifyInstalled = async () => {
    await onSuccess();
    handleClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Store className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Connect Store</h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Platform Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Platform *
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="">-- Choose Platform --</option>
              <option value="shopify">Shopify</option>
              <option value="wix">Wix</option>
              <option value="woocommerce">WooCommerce</option>
              <option value="bigcommerce">BigCommerce</option>
              <option value="prestashop">PrestaShop</option>
            </select>
          </div>

          {/* Shopify Fields */}
          {platform === 'shopify' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Store Domain * <span className="text-gray-500 text-xs">(e.g., mystore.myshopify.com)</span>
                </label>
                <input
                  type="text"
                  value={shopifyDomain}
                  onChange={(e) => setShopifyDomain(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="mystore.myshopify.com"
                  required
                />
              </div>

              {SHOPIFY_OAUTH_ENABLED && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-sm font-medium text-gray-700 mb-2">Connection method</div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="shopifyConnectMode"
                        value="oauth"
                        checked={shopifyConnectMode === 'oauth'}
                        onChange={() => {
                          setShopifyConnectMode('oauth');
                          setShopifyClientId('');
                          setShopifyClientSecret('');
                        }}
                        className="mt-1"
                      />
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">Pivota app (OAuth) — recommended</div>
                        <div className="text-gray-600">
                          Generates a one-time install link and opens Shopify for authorization. No Admin API token required.
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="shopifyConnectMode"
                        value="custom_token"
                        checked={shopifyConnectMode === 'custom_token'}
                        onChange={() => {
                          setShopifyConnectMode('custom_token');
                          setShopifyInstallUrl('');
                        }}
                        className="mt-1"
                      />
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">Custom app credentials (manual)</div>
                        <div className="text-gray-600">Use when public app install is unavailable. Pivota will rotate Admin token automatically.</div>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {SHOPIFY_OAUTH_ENABLED && shopifyConnectMode === 'oauth' ? (
                <>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                    Use the store&apos;s MyShopify domain. Install links are one-time use.
                  </div>
                  {shopifyInstallUrl ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-500 mb-2">Install link (valid for ~15 minutes, one-time use)</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={shopifyInstallUrl}
                          className="w-full px-3 py-2 border rounded-lg bg-white text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(shopifyInstallUrl)}
                          className="inline-flex items-center px-2 py-2 rounded-lg border text-gray-600 hover:text-gray-900"
                          title="Copy"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => window.open(shopifyInstallUrl, '_blank', 'noopener,noreferrer')}
                          className="inline-flex items-center px-2 py-2 rounded-lg border text-blue-600 hover:text-blue-800"
                          title="Open"
                        >
                          <LinkIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={handleShopifyInstalled}
                          className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
                        >
                          I&apos;ve installed, refresh stores
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Client ID *</label>
                    <input
                      type="text"
                      value={shopifyClientId}
                      onChange={(e) => setShopifyClientId(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                      placeholder="Shopify app client ID"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Client Secret *</label>
                    <input
                      type="password"
                      value={shopifyClientSecret}
                      onChange={(e) => setShopifyClientSecret(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                      placeholder="Shopify app client secret"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Get from Shopify Admin → Apps → Develop apps → Your app → API credentials
                    </p>
                  </div>
                </>
              )}
            </>
          )}

          {/* Wix Fields */}
          {platform === 'wix' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Site ID *
                </label>
                <input
                  type="text"
                  value={wixSiteId}
                  onChange={(e) => setWixSiteId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key *
                </label>
                <input
                  type="password"
                  value={wixApiKey}
                  onChange={(e) => setWixApiKey(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  placeholder="JWS.xxx..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Store Name (Optional)
                </label>
                <input
                  type="text"
                  value={wixStoreName}
                  onChange={(e) => setWixStoreName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="My Wix Store"
                />
              </div>
            </>
          )}

          {/* WooCommerce Fields */}
          {platform === 'woocommerce' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Store URL * <span className="text-gray-500 text-xs">(e.g., https://mystore.com)</span>
                </label>
                <input
                  type="url"
                  value={wooStoreUrl}
                  onChange={(e) => setWooStoreUrl(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="https://mystore.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Consumer Key *
                </label>
                <input
                  type="text"
                  value={wooConsumerKey}
                  onChange={(e) => setWooConsumerKey(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  placeholder="ck_..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Consumer Secret *
                </label>
                <input
                  type="password"
                  value={wooConsumerSecret}
                  onChange={(e) => setWooConsumerSecret(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  placeholder="cs_..."
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Get from WooCommerce → Settings → Advanced → REST API
                </p>
              </div>
            </>
          )}

          {/* BigCommerce Fields */}
          {platform === 'bigcommerce' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Store Hash * <span className="text-gray-500 text-xs">(e.g., abc123def)</span>
                </label>
                <input
                  type="text"
                  value={bcStoreHash}
                  onChange={(e) => setBcStoreHash(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  placeholder="abc123def"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Access Token *
                </label>
                <input
                  type="password"
                  value={bcAccessToken}
                  onChange={(e) => setBcAccessToken(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client ID (Optional)
                </label>
                <input
                  type="text"
                  value={bcClientId}
                  onChange={(e) => setBcClientId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                />
              </div>
            </>
          )}

          {/* PrestaShop Fields */}
          {platform === 'prestashop' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Store URL * <span className="text-gray-500 text-xs">(e.g., https://mystore.com)</span>
                </label>
                <input
                  type="url"
                  value={psStoreUrl}
                  onChange={(e) => setPsStoreUrl(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="https://mystore.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key *
                </label>
                <input
                  type="password"
                  value={psApiKey}
                  onChange={(e) => setPsApiKey(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Get from PrestaShop → Advanced Parameters → Webservice
                </p>
              </div>
            </>
          )}

          {/* Submit Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !platform ||
                (platform === 'shopify' &&
                  (!shopifyDomain.trim() ||
                    ((!SHOPIFY_OAUTH_ENABLED || shopifyConnectMode === 'custom_token') &&
                      (!shopifyClientId.trim() || !shopifyClientSecret.trim()))))
              }
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {platform === 'shopify' && SHOPIFY_OAUTH_ENABLED && shopifyConnectMode === 'oauth'
                      ? 'Generating link...'
                      : 'Connecting...'}
                  </span>
                </>
              ) : (
                <>
                  <Store className="w-4 h-4" />
                  <span>
                    {platform === 'shopify'
                      ? SHOPIFY_OAUTH_ENABLED && shopifyConnectMode === 'oauth'
                        ? 'Generate Install Link'
                        : 'Connect Store'
                      : 'Connect Store'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
