import React, { useState } from 'react';
import { X } from 'lucide-react';

interface PSPConfigFormProps {
  provider: string;
  merchantId: string;
  onClose: () => void;
  onSuccess: () => void;
  apiClient: any;
}

type Environment = 'test' | 'live';

export function PSPConfigForm({
  provider,
  merchantId,
  onClose,
  onSuccess,
  apiClient,
}: PSPConfigFormProps) {
  const providerLower = provider.toLowerCase().replace('.com', '').replace('.', '');
  const [apiKey, setApiKey] = useState('');
  const [accountId, setAccountId] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [environment, setEnvironment] = useState<Environment>('test');
  const [saving, setSaving] = useState(false);

  const isStripe = providerLower === 'stripe';
  const isAdyen = providerLower === 'adyen';
  const isCheckout = providerLower === 'checkout';

  const canSave =
    Boolean(providerLower && merchantId && apiKey) &&
    (!isAdyen || (Boolean(accountId) && Boolean(clientKey))) &&
    (!isCheckout || (Boolean(accountId) && Boolean(publicKey))) &&
    !saving;

  const handleSave = async () => {
    if (!canSave) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);

      const payload: Record<string, any> = {
        provider: providerLower,
        merchant_id: merchantId,
        api_key: apiKey.trim(),
        environment,
      };

      if (isStripe) {
        if (accountId.trim()) payload.account_id = accountId.trim();
      }

      if (isAdyen) {
        payload.account_id = accountId.trim();
        payload.merchant_account = accountId.trim();
        payload.client_key = clientKey.trim();
      }

      if (isCheckout) {
        payload.account_id = accountId.trim();
        payload.processing_channel_id = accountId.trim();
        payload.public_key = publicKey.trim();
      }

      await apiClient.connectPSPProvider(payload);
      alert(`✅ ${provider} connected successfully.`);
      onSuccess();
      onClose();
    } catch (error: any) {
      alert(`❌ Failed to connect ${provider}: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const title = isStripe
    ? 'Connect Stripe'
    : isAdyen
      ? 'Connect Adyen'
      : 'Connect Checkout.com';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-[1.4rem] border border-[color:var(--merchant-line)] bg-white p-6 shadow-[var(--merchant-shadow-panel)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[color:var(--merchant-ink)]">{title}</h3>
            <p className="mt-1 text-sm text-[color:var(--merchant-muted)]">
              Save the real provider credentials and runtime settings used for payment initiation.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-[color:var(--merchant-line)] p-2 text-[color:var(--merchant-muted)] transition hover:bg-[color:var(--merchant-surface-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">Merchant ID</label>
            <input
              type="text"
              value={merchantId}
              disabled
              className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-3 py-2 text-sm text-[color:var(--merchant-muted-strong)]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
              Environment <span className="text-rose-500">*</span>
            </label>
            <select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value as Environment)}
              className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-ink)]"
            >
              <option value="test">Test</option>
              <option value="live">Live</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
              {isStripe ? 'Secret key' : isCheckout ? 'Secret key' : 'API key'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                isStripe
                  ? 'sk_live_... or sk_test_...'
                  : isCheckout
                    ? 'sk_live_... or sk_test_...'
                    : 'AQE...'
              }
              className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-ink)]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
              {isStripe ? 'Connected account ID (optional, Stripe Connect only)' : isAdyen ? 'Merchant account' : 'Processing channel ID'}
              {!isStripe ? <span className="text-rose-500"> *</span> : null}
            </label>
            <input
              type="text"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder={
                isStripe
                  ? 'Leave blank unless you are using Stripe Connect'
                  : isAdyen
                    ? 'Your Adyen merchantAccount'
                    : 'pc_...'
              }
              className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-ink)]"
            />
          </div>

          {isAdyen ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
                Client key <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={clientKey}
                onChange={(event) => setClientKey(event.target.value)}
                placeholder="Your Adyen clientKey"
                className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-ink)]"
              />
            </div>
          ) : null}

          {isCheckout ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
                Public key <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={publicKey}
                onChange={(event) => setPublicKey(event.target.value)}
                placeholder="pk_..."
                className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-ink)]"
              />
            </div>
          ) : null}

          <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-4 py-3 text-sm text-[color:var(--merchant-muted-strong)]">
            {isStripe
              ? 'Merchant Stripe setup always uses PaymentIntent. Stripe Checkout is handled internally when a flow explicitly requires a hosted redirect.'
              : isAdyen
                ? 'Adyen requires both merchant account and client key so the returned session can be used by the frontend.'
                : 'Checkout.com requires both processing channel ID and public key so the returned payment session is usable by the frontend.'}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 rounded-full bg-[color:var(--merchant-brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Connect ${provider}`}
          </button>
          <button
            onClick={onClose}
            className="rounded-full border border-[color:var(--merchant-line)] px-4 py-2.5 text-sm font-semibold text-[color:var(--merchant-muted-strong)] transition hover:bg-[color:var(--merchant-surface-muted)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
