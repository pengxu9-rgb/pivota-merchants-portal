'use client';

import { useState } from 'react';
import { X, Store } from 'lucide-react';
import { formatApiError, formatApiErrorPayload } from '@/lib/api-error';
import { API_CONFIG } from '@/lib/config';

interface SimpleStoreConnectModalProps {
  isOpen: boolean;
  merchantId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SimpleStoreConnectModal({ 
  isOpen, 
  merchantId, 
  onClose, 
  onSuccess 
}: SimpleStoreConnectModalProps) {
  const [platform, setPlatform] = useState('shopify');
  const [shopDomain, setShopDomain] = useState('');
  const [shopifyClientId, setShopifyClientId] = useState('');
  const [shopifyClientSecret, setShopifyClientSecret] = useState('');
  const [siteId, setSiteId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const canSave = merchantId && 
    (platform === 'shopify' ? (shopDomain && shopifyClientId && shopifyClientSecret) :
     platform === 'wix' ? (siteId && apiKey) :
     false) && !saving;

  const handleSave = async () => {
    if (!canSave) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);

      let endpoint = '';
      let payload: any = {};

      if (platform === 'shopify') {
        endpoint = '/integrations/shopify/connect';
        payload = {
          merchant_id: merchantId,
          shop_domain: shopDomain,
          client_id: shopifyClientId,
          client_secret: shopifyClientSecret
        };
      } else if (platform === 'wix') {
        endpoint = '/integrations/wix/connect';
        payload = {
          merchant_id: merchantId,
          site_id: siteId,
          api_key: apiKey
        };
      }

      const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('merchant_token')}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(formatApiErrorPayload(error, 'Connection failed'));
      }

      const result = await response.json();
      alert(`✅ ${platform} store connected successfully!`);
      onSuccess();
      onClose();
    } catch (error: any) {
      alert(`❌ Failed to connect ${platform}: ${formatApiError(error, 'Connection failed')}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Connect Store</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Platform Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Platform <span className="text-red-500">*</span>
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="shopify">Shopify</option>
              <option value="wix">Wix</option>
            </select>
          </div>

          {/* Shopify Fields */}
          {platform === 'shopify' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shop Domain <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  placeholder="yourstore.myshopify.com"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={shopifyClientId}
                  onChange={(e) => setShopifyClientId(e.target.value)}
                  placeholder="Shopify app client ID"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client Secret <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={shopifyClientSecret}
                  onChange={(e) => setShopifyClientSecret(e.target.value)}
                  placeholder="Shopify app client secret"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use Shopify Admin → Apps → Develop apps → Your app → API credentials
                </p>
              </div>
            </>
          )}

          {/* Wix Fields */}
          {platform === 'wix' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Site ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  placeholder="Wix Site ID or Wix URL"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Your Wix API key"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              {platform === 'shopify' && '💡 Your store domain should end with .myshopify.com. Enter your app client ID/secret and Pivota will refresh Admin token automatically.'}
              {platform === 'wix' && '💡 Copy the Site ID from the Wix site URL, or paste the full Wix URL if it contains the Site ID. Then enter the API key from Wix API Keys Manager.'}
            </p>
          </div>
        </div>

        <div className="flex space-x-3 mt-6">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {saving ? 'Connecting...' : `Connect ${platform}`}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}







