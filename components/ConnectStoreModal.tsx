'use client';

/**
 * Connect Store Modal - supports all platforms
 * Shopify, Wix, WooCommerce, BigCommerce, PrestaShop
 */

import { useState } from 'react';
import { X, Store, Loader2 } from 'lucide-react';
import { IntegrationGuideDialog } from '@/components/integration-guides/IntegrationGuideDialog';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import { formatApiError, formatApiErrorPayload } from '@/lib/api-error';
import { API_CONFIG } from '@/lib/config';
import { formatIntegrationCopy, getStoreFormCopy } from '@/lib/integration-form-copy';
import {
  getIntegrationGuideUiText,
  normalizeIntegrationGuideKey,
  type IntegrationGuideKey,
} from '@/lib/integration-guides';

interface ConnectStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  merchantId: string;
}

export default function ConnectStoreModal({ isOpen, onClose, onSuccess, merchantId }: ConnectStoreModalProps) {
  const { language } = useMerchantLanguage();
  const copy = getStoreFormCopy(language);
  const guideUiText = getIntegrationGuideUiText(language);
  const [platform, setPlatform] = useState<string>('');
  const [openGuideKey, setOpenGuideKey] = useState<IntegrationGuideKey | null>(null);
  const [loading, setLoading] = useState(false);
  const baseUrl = API_CONFIG.BASE_URL;
  
  // Form fields for different platforms
  const [shopifyDomain, setShopifyDomain] = useState('');
  // Shopify connects via custom-app credentials only (client ID + secret from a
  // custom app the merchant creates in their own Shopify admin). There is no
  // public app-store install / OAuth handoff.
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

  const selectedGuideKey = normalizeIntegrationGuideKey(platform);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);

    try {
      let endpoint = '';
      let payload: any = { merchant_id: merchantId };

      switch (platform) {
        case 'shopify':
          endpoint = `${baseUrl}${API_CONFIG.ENDPOINTS.SHOPIFY_CONNECT}`;
          payload = {
            merchant_id: merchantId,
            shop_domain: shopifyDomain,
            client_id: shopifyClientId,
            client_secret: shopifyClientSecret,
          };
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
          alert(copy.selectPlatformAlert);
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
          alert(copy.shopifyConnected);
          onSuccess();
          handleClose();
        } else {
          alert(
            formatIntegrationCopy(copy.platformConnected, {
              platform: platform.charAt(0).toUpperCase() + platform.slice(1),
            }),
          );
          onSuccess();
          handleClose();
        }
      } else {
        alert(`${copy.failedPrefix}: ${formatApiErrorPayload(data, 'Unknown error')}`);
      }
    } catch (error: any) {
      alert(`${copy.errorPrefix}: ${formatApiError(error, 'Unknown error')}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPlatform('');
    setOpenGuideKey(null);
    setShopifyDomain('');
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Store className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">{copy.connectStore}</h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Platform Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {copy.selectPlatform} *
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="">{copy.choosePlatform}</option>
              <option value="shopify">Shopify</option>
              <option value="wix">Wix</option>
              <option value="woocommerce">WooCommerce</option>
              <option value="bigcommerce">BigCommerce</option>
              <option value="prestashop">PrestaShop</option>
            </select>
          </div>

          {selectedGuideKey ? (
            <button
              type="button"
              onClick={() => setOpenGuideKey(selectedGuideKey)}
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--merchant-line)] px-3 py-2 text-sm font-medium text-[color:var(--merchant-muted-strong)] transition hover:border-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand)]"
            >
              {guideUiText.viewGuide}
            </button>
          ) : null}

          {/* Shopify Fields — custom-app credentials only */}
          {platform === 'shopify' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {copy.storeDomain} * <span className="text-gray-500 text-xs">({copy.storeDomainHint})</span>
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

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                <div className="font-medium text-blue-900">{copy.customTitle}</div>
                <div className="mt-0.5">{copy.customDescription}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{copy.clientId} *</label>
                <input
                  type="text"
                  value={shopifyClientId}
                  onChange={(e) => setShopifyClientId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  placeholder={copy.clientIdPlaceholder}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{copy.clientSecret} *</label>
                <input
                  type="password"
                  value={shopifyClientSecret}
                  onChange={(e) => setShopifyClientSecret(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  placeholder={copy.clientSecretPlaceholder}
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  {copy.shopifyCredentialHelp}
                </p>
              </div>
            </>
          )}

          {/* Wix Fields */}
          {platform === 'wix' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {copy.siteId} *
                </label>
                <input
                  type="text"
                  value={wixSiteId}
                  onChange={(e) => setWixSiteId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or Wix URL"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {copy.apiKey} *
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
                  {copy.storeNameOptional}
                </label>
                <input
                  type="text"
                  value={wixStoreName}
                  onChange={(e) => setWixStoreName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder={copy.storeNamePlaceholder}
                />
              </div>
            </>
          )}

          {/* WooCommerce Fields */}
          {platform === 'woocommerce' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {copy.storeUrl} * <span className="text-gray-500 text-xs">(e.g., https://mystore.com)</span>
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
                  {copy.consumerKey} *
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
                  {copy.consumerSecret} *
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
                  {copy.wooCredentialHelp}
                </p>
              </div>
            </>
          )}

          {/* BigCommerce Fields */}
          {platform === 'bigcommerce' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {copy.storeHash} * <span className="text-gray-500 text-xs">(e.g., abc123def)</span>
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
                  {copy.accessToken} *
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
                  {copy.bcClientIdOptional}
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
                  {copy.storeUrl} * <span className="text-gray-500 text-xs">(e.g., https://mystore.com)</span>
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
                  {copy.apiKey} *
                </label>
                <input
                  type="password"
                  value={psApiKey}
                  onChange={(e) => setPsApiKey(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  {copy.prestashopCredentialHelp}
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
              {copy.cancel}
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !platform ||
                (platform === 'shopify' &&
                  (!shopifyDomain.trim() ||
                    !shopifyClientId.trim() ||
                    !shopifyClientSecret.trim()))
              }
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{copy.connecting}</span>
                </>
              ) : (
                <>
                  <Store className="w-4 h-4" />
                  <span>{copy.connectStoreButton}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
      <IntegrationGuideDialog guideKey={openGuideKey} onClose={() => setOpenGuideKey(null)} />
    </div>
  );
}
