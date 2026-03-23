import type { FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Globe2,
  Loader2,
  Plus,
  Wallet,
} from 'lucide-react';
import { cx } from '@/lib/cx';
import type { PSPFormData, PSPType } from '@/lib/onboarding';

interface PSPSetupStepProps {
  merchantId: string;
  formData: PSPFormData;
  loading: boolean;
  error: string;
  onBack: () => void;
  onSkip: () => void;
  onChange: (field: keyof PSPFormData, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const inputClassName =
  'w-full rounded-2xl border border-[color:var(--merchant-line-strong)] bg-white px-4 py-3 text-sm text-[color:var(--merchant-ink)] outline-none transition focus:border-[color:var(--merchant-brand)] focus:ring-4 focus:ring-[rgba(51,75,133,0.12)]';

const labelClassName = 'mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]';

const providerCards: Array<{
  id: Exclude<PSPType, ''>;
  name: string;
  description: string;
  icon: typeof CreditCard;
}> = [
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Merchant-native payment setup with Stripe credentials.',
    icon: CreditCard,
  },
  {
    id: 'adyen',
    name: 'Adyen',
    description: 'Enterprise-grade payment routing for merchant-controlled checkout.',
    icon: Globe2,
  },
  {
    id: 'paypal',
    name: 'PayPal',
    description: 'PayPal merchant credentials for wallet and checkout coverage.',
    icon: Wallet,
  },
  {
    id: 'checkout',
    name: 'Checkout.com',
    description: 'Checkout.com credentials for existing merchant payment relationships.',
    icon: CreditCard,
  },
  {
    id: 'other',
    name: 'Other provider',
    description: 'Use another PSP you already work with.',
    icon: Plus,
  },
];

function fieldCopy(pspType: PSPType) {
  switch (pspType) {
    case 'stripe':
      return {
        apiKeyLabel: 'Secret key',
        apiKeyPlaceholder: 'sk_live_... or sk_test_...',
        apiKeyHelp: 'Find this in Stripe Dashboard -> Developers -> API keys.',
      };
    case 'adyen':
      return {
        apiKeyLabel: 'API key',
        apiKeyPlaceholder: 'Paste your Adyen API key',
        apiKeyHelp: 'Find this in Adyen Customer Area -> API credentials.',
      };
    case 'paypal':
      return {
        apiKeyLabel: 'Client ID',
        apiKeyPlaceholder: 'Paste your PayPal client ID',
        apiKeyHelp: 'Find this in the PayPal developer dashboard.',
      };
    case 'checkout':
      return {
        apiKeyLabel: 'Secret key',
        apiKeyPlaceholder: 'sk_...',
        apiKeyHelp: 'Find this in Checkout.com Hub -> Settings -> Channels.',
      };
    case 'other':
      return {
        apiKeyLabel: 'API key',
        apiKeyPlaceholder: 'Paste the provider key if available',
        apiKeyHelp: 'If you do not want to connect right now, use "Set up later".',
      };
    default:
      return {
        apiKeyLabel: 'API key',
        apiKeyPlaceholder: '',
        apiKeyHelp: '',
      };
  }
}

export default function PSPSetupStep({
  merchantId,
  formData,
  loading,
  error,
  onBack,
  onSkip,
  onChange,
  onSubmit,
}: PSPSetupStepProps) {
  const copy = fieldCopy(formData.pspType);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="merchant-overline">Step 2 · Payment setup</div>
        <h2 className="text-[1.9rem] font-semibold tracking-[-0.045em] text-[color:var(--merchant-ink)]">
          Connect your payment provider
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
          Connect the PSP used for merchant-native checkout, or finish onboarding now and configure it later in the dashboard.
        </p>
      </div>

      <div className="rounded-[24px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-4 py-3 text-sm text-[color:var(--merchant-muted-strong)]">
        Merchant ID: <span className="font-mono text-[color:var(--merchant-ink)]">{merchantId}</span>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <span className={labelClassName}>Payment provider</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {providerCards.map((provider) => {
              const Icon = provider.icon;
              const isSelected = formData.pspType === provider.id;

              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => {
                    onChange('pspType', provider.id);
                    if (provider.id !== 'other') {
                      onChange('customPspName', '');
                    }
                  }}
                  className={cx(
                    'rounded-[24px] border px-4 py-4 text-left transition',
                    isSelected
                      ? 'border-[color:var(--merchant-brand)] bg-white shadow-[var(--merchant-shadow-panel)]'
                      : 'border-[color:var(--merchant-line)] bg-white/72 hover:border-[color:var(--merchant-line-strong)]',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cx(
                        'flex h-11 w-11 items-center justify-center rounded-2xl border',
                        isSelected
                          ? 'border-[color:var(--merchant-brand)] bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]'
                          : 'border-[color:var(--merchant-line-strong)] bg-[color:var(--merchant-surface-muted)] text-[color:var(--merchant-muted-strong)]',
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                        {provider.name}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                        {provider.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {formData.pspType === 'other' ? (
          <label className="block">
            <span className={labelClassName}>Provider name</span>
            <input
              type="text"
              value={formData.customPspName}
              onChange={(event) => onChange('customPspName', event.target.value)}
              className={inputClassName}
              placeholder="Mollie, Square, Braintree, or another PSP"
            />
          </label>
        ) : null}

        {formData.pspType ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={labelClassName}>{copy.apiKeyLabel}</span>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(event) => onChange('apiKey', event.target.value)}
                className={inputClassName}
                placeholder={copy.apiKeyPlaceholder}
                autoComplete="off"
              />
              {copy.apiKeyHelp ? (
                <span className="mt-1.5 block text-xs text-[color:var(--merchant-muted)]">
                  {copy.apiKeyHelp}
                </span>
              ) : null}
            </label>

            {formData.pspType === 'paypal' ? (
              <label className="block sm:col-span-2">
                <span className={labelClassName}>Client secret</span>
                <input
                  type="password"
                  value={formData.secretKey}
                  onChange={(event) => onChange('secretKey', event.target.value)}
                  className={inputClassName}
                  placeholder="Paste your PayPal client secret"
                  autoComplete="off"
                />
              </label>
            ) : null}

            {formData.pspType === 'adyen' ? (
              <label className="block sm:col-span-2">
                <span className={labelClassName}>Merchant account</span>
                <input
                  type="text"
                  value={formData.accountId}
                  onChange={(event) => onChange('accountId', event.target.value)}
                  className={inputClassName}
                  placeholder="YourCompanyECOM"
                />
              </label>
            ) : null}

            {formData.pspType === 'checkout' ? (
              <label className="block sm:col-span-2">
                <span className={labelClassName}>Processing channel ID</span>
                <input
                  type="text"
                  value={formData.accountId}
                  onChange={(event) => onChange('accountId', event.target.value)}
                  className={inputClassName}
                  placeholder="pc_..."
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[20px] border border-[color:var(--merchant-critical)] bg-[color:var(--merchant-critical-soft)] px-4 py-3 text-sm text-[color:var(--merchant-critical)]">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4.5 w-4.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-[color:var(--merchant-line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--merchant-line-strong)] px-4 py-3 text-sm font-medium text-[color:var(--merchant-muted-strong)] transition hover:bg-white"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
            <span>Back</span>
          </button>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--merchant-line-strong)] px-4 py-3 text-sm font-medium text-[color:var(--merchant-ink)] transition hover:bg-white"
            >
              <span>Set up later</span>
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-2xl bg-[color:var(--merchant-brand)] px-4 py-3 text-sm font-medium text-white shadow-[0_14px_30px_rgba(51,75,133,0.18)] transition hover:bg-[color:var(--merchant-brand-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  <span>Saving setup...</span>
                </>
              ) : (
                <>
                  <span>Continue to documents</span>
                  <ArrowRight className="h-4.5 w-4.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
