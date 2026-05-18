import React, { useState } from 'react';
import { X } from 'lucide-react';
import { IntegrationGuideDialog } from '@/components/integration-guides/IntegrationGuideDialog';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import { formatApiError } from '@/lib/api-error';
import { formatIntegrationCopy, getPspFormCopy } from '@/lib/integration-form-copy';
import {
  getIntegrationGuideUiText,
  normalizeIntegrationGuideKey,
  type IntegrationGuideKey,
} from '@/lib/integration-guides';

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
  const { language } = useMerchantLanguage();
  const copy = getPspFormCopy(language);
  const guideUiText = getIntegrationGuideUiText(language);
  const providerLower = provider.toLowerCase().replace('.com', '').replace('.', '');
  const guideKey = normalizeIntegrationGuideKey(providerLower) as IntegrationGuideKey | null;
  const [apiKey, setApiKey] = useState('');
  const [accountId, setAccountId] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [environment, setEnvironment] = useState<Environment>('test');
  const [saving, setSaving] = useState(false);
  const [openGuideKey, setOpenGuideKey] = useState<IntegrationGuideKey | null>(null);

  const isStripe = providerLower === 'stripe';
  const isAdyen = providerLower === 'adyen';
  const isCheckout = providerLower === 'checkout';

  const canSave =
    Boolean(providerLower && merchantId && apiKey) &&
    (!isStripe || Boolean(publicKey)) &&
    (!isAdyen || (Boolean(accountId) && Boolean(clientKey))) &&
    (!isCheckout || (Boolean(accountId) && Boolean(publicKey))) &&
    !saving;

  const handleSave = async () => {
    if (!canSave) {
      alert(copy.requiredFields);
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
        payload.public_key = publicKey.trim();
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
      alert(formatIntegrationCopy(copy.connected, { provider }));
      onSuccess();
      onClose();
    } catch (error: any) {
      alert(
        `${formatIntegrationCopy(copy.failedToConnect, { provider })}: ${
          formatApiError(error, 'Connection failed')
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  const title = isStripe
    ? formatIntegrationCopy(copy.connectProvider, { provider: 'Stripe' })
    : isAdyen
      ? formatIntegrationCopy(copy.connectProvider, { provider: 'Adyen' })
      : formatIntegrationCopy(copy.connectProvider, { provider: 'Checkout.com' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-[1.4rem] border border-[color:var(--merchant-line)] bg-white p-6 shadow-[var(--merchant-shadow-panel)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[color:var(--merchant-ink)]">{title}</h3>
            <p className="mt-1 text-sm text-[color:var(--merchant-muted)]">
              {copy.description}
            </p>
            {guideKey ? (
              <button
                type="button"
                onClick={() => setOpenGuideKey(guideKey)}
                className="mt-3 inline-flex items-center rounded-full border border-[color:var(--merchant-line)] px-3 py-1.5 text-sm font-medium text-[color:var(--merchant-muted-strong)] transition hover:border-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand)]"
              >
                {guideUiText.viewGuide}
              </button>
            ) : null}
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
            <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">{copy.merchantId}</label>
            <input
              type="text"
              value={merchantId}
              disabled
              className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-3 py-2 text-sm text-[color:var(--merchant-muted-strong)]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
              {copy.environment} <span className="text-rose-500">*</span>
            </label>
            <select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value as Environment)}
              className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-ink)]"
            >
              <option value="test">{copy.test}</option>
              <option value="live">{copy.live}</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
              {isStripe ? copy.secretKey : isCheckout ? copy.secretKey : copy.apiKey} <span className="text-rose-500">*</span>
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
                    : copy.apiKeyPlaceholderAdyen
              }
              className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-ink)]"
            />
          </div>

          {isStripe ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
                {copy.publishableKey} <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={publicKey}
                onChange={(event) => setPublicKey(event.target.value)}
                placeholder="pk_live_... or pk_test_..."
                className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-ink)]"
              />
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
              {isStripe ? copy.connectedAccountId : isAdyen ? copy.merchantAccount : copy.processingChannelId}
              {!isStripe ? <span className="text-rose-500"> *</span> : null}
            </label>
            <input
              type="text"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder={
                isStripe
                  ? copy.stripeAccountPlaceholder
                  : isAdyen
                    ? copy.adyenMerchantPlaceholder
                    : copy.checkoutChannelPlaceholder
              }
              className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-ink)]"
            />
          </div>

          {isAdyen ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
                {copy.clientKey} <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={clientKey}
                onChange={(event) => setClientKey(event.target.value)}
                placeholder="clientKey"
                className="w-full rounded-[1rem] border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-ink)]"
              />
            </div>
          ) : null}

          {isCheckout ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
                {copy.publicKey} <span className="text-rose-500">*</span>
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
              ? copy.stripeNote
              : isAdyen
                ? copy.adyenNote
                : copy.checkoutNote}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 rounded-full bg-[color:var(--merchant-brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? copy.saving : formatIntegrationCopy(copy.connect, { provider })}
          </button>
          <button
            onClick={onClose}
            className="rounded-full border border-[color:var(--merchant-line)] px-4 py-2.5 text-sm font-semibold text-[color:var(--merchant-muted-strong)] transition hover:bg-[color:var(--merchant-surface-muted)]"
          >
            {copy.cancel}
          </button>
        </div>
      </div>
      <IntegrationGuideDialog
        guideKey={openGuideKey}
        onClose={() => setOpenGuideKey(null)}
      />
    </div>
  );
}
