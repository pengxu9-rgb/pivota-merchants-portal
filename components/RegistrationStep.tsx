import type { FormEvent } from 'react';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import type { RegistrationFormData } from '@/lib/onboarding';

interface RegistrationStepProps {
  formData: RegistrationFormData;
  loading: boolean;
  error: string;
  onChange: (field: keyof RegistrationFormData, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const inputClassName =
  'w-full rounded-2xl border border-[color:var(--merchant-line-strong)] bg-white px-4 py-3 text-sm text-[color:var(--merchant-ink)] outline-none transition focus:border-[color:var(--merchant-brand)] focus:ring-4 focus:ring-[rgba(51,75,133,0.12)]';

const labelClassName = 'mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]';

export default function RegistrationStep({
  formData,
  loading,
  error,
  onChange,
  onSubmit,
}: RegistrationStepProps) {
  const passwordsMismatch =
    Boolean(formData.password) &&
    Boolean(formData.confirm_password) &&
    formData.password !== formData.confirm_password;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="merchant-overline">Step 1 · Merchant account</div>
        <h2 className="text-[1.9rem] font-semibold tracking-[-0.045em] text-[color:var(--merchant-ink)]">
          Create your merchant portal access
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
          This creates the merchant record and the account you will use to sign in to the portal.
        </p>
      </div>

      <div className="rounded-[24px] border border-[color:var(--merchant-line)] bg-white/78 p-5 sm:p-6">
        <div className="mb-4">
          <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">Business details</p>
          <p className="mt-1 text-xs text-[color:var(--merchant-muted)]">
            One email and password continue into the merchant portal after onboarding.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>Business name</span>
              <input
                type="text"
                required
                value={formData.business_name}
                onChange={(event) => onChange('business_name', event.target.value)}
                className={inputClassName}
                placeholder="Acme Corporation"
              />
            </label>

            <label className="block">
              <span className={labelClassName}>Region</span>
              <select
                required
                value={formData.region}
                onChange={(event) => onChange('region', event.target.value)}
                className={inputClassName}
              >
                <option value="">Select region</option>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="UK">United Kingdom</option>
                <option value="EU">European Union</option>
                <option value="APAC">Asia Pacific</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className={labelClassName}>Store URL</span>
            <input
              type="url"
              required
              value={formData.store_url}
              onChange={(event) => onChange('store_url', event.target.value)}
              className={inputClassName}
              placeholder="https://mystore.myshopify.com"
            />
            <span className="mt-1.5 block text-xs text-[color:var(--merchant-muted)]">
              Shopify, Wix, WooCommerce, or another merchant storefront URL.
            </span>
          </label>

          <label className="block">
            <span className={labelClassName}>Website</span>
            <input
              type="url"
              value={formData.website}
              onChange={(event) => onChange('website', event.target.value)}
              className={inputClassName}
              placeholder="https://brand.com"
            />
            <span className="mt-1.5 block text-xs text-[color:var(--merchant-muted)]">
              Optional, if your storefront and brand site are different.
            </span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>Contact email</span>
              <input
                type="email"
                required
                value={formData.contact_email}
                onChange={(event) => onChange('contact_email', event.target.value)}
                className={inputClassName}
                placeholder="merchant@brand.com"
              />
            </label>

            <label className="block">
              <span className={labelClassName}>Contact phone</span>
              <input
                type="tel"
                value={formData.contact_phone}
                onChange={(event) => onChange('contact_phone', event.target.value)}
                className={inputClassName}
                placeholder="+1 (555) 123-4567"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>Password</span>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(event) => onChange('password', event.target.value)}
                className={inputClassName}
                placeholder="Create a secure password"
                minLength={8}
                autoComplete="new-password"
              />
              <span className="mt-1.5 block text-xs text-[color:var(--merchant-muted)]">
                At least 8 characters.
              </span>
            </label>

            <label className="block">
              <span className={labelClassName}>Confirm password</span>
              <input
                type="password"
                required
                value={formData.confirm_password}
                onChange={(event) => onChange('confirm_password', event.target.value)}
                className={inputClassName}
                placeholder="Re-enter your password"
                autoComplete="new-password"
              />
              {passwordsMismatch ? (
                <span className="mt-1.5 block text-xs text-[color:var(--merchant-critical)]">
                  Passwords do not match.
                </span>
              ) : null}
            </label>
          </div>

          {error ? (
            <div className="rounded-[20px] border border-[color:var(--merchant-critical)] bg-[color:var(--merchant-critical-soft)] px-4 py-3 text-sm text-[color:var(--merchant-critical)]">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4.5 w-4.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--merchant-brand)] px-4 py-3 text-sm font-medium text-white shadow-[0_14px_30px_rgba(51,75,133,0.18)] transition hover:bg-[color:var(--merchant-brand-strong)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Continue to payment setup</span>
                  <ArrowRight className="h-4.5 w-4.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
