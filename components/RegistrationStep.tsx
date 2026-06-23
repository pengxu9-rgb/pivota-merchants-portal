'use client';

import type { FormEvent } from 'react';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
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
  const { t } = useMerchantLanguage();
  const storelessEnabled =
    process.env.NEXT_PUBLIC_ENABLE_STORELESS_BRAND_CATALOG === 'true';
  const isStoreLess = storelessEnabled && formData.operating_mode === 'store_less';
  const storeUrlRequired = !isStoreLess;
  const passwordsMismatch =
    Boolean(formData.password) &&
    Boolean(formData.confirm_password) &&
    formData.password !== formData.confirm_password;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="merchant-overline">{t('auth.registration.stepEyebrow')}</div>
        <h2 className="text-[1.9rem] font-semibold tracking-[-0.045em] text-[color:var(--merchant-ink)]">
          {t('auth.registration.title')}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
          {t('auth.registration.description')}
        </p>
      </div>

      <div className="rounded-[24px] border border-[color:var(--merchant-line)] bg-white/78 p-5 sm:p-6">
        <div className="mb-4">
          <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">{t('auth.registration.businessDetailsTitle')}</p>
          <p className="mt-1 text-xs text-[color:var(--merchant-muted)]">
            {t('auth.registration.businessDetailsDescription')}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>{t('auth.registration.businessNameLabel')}</span>
              <input
                type="text"
                required
                value={formData.business_name}
                onChange={(event) => onChange('business_name', event.target.value)}
                className={inputClassName}
                placeholder={t('auth.registration.businessNamePlaceholder')}
              />
            </label>

            <label className="block">
              <span className={labelClassName}>{t('auth.registration.regionLabel')}</span>
              <select
                required
                value={formData.region}
                onChange={(event) => onChange('region', event.target.value)}
                className={inputClassName}
              >
                <option value="">{t('auth.registration.regionPlaceholder')}</option>
                <option value="US">{t('auth.registration.regionUS')}</option>
                <option value="CA">{t('auth.registration.regionCA')}</option>
                <option value="UK">{t('auth.registration.regionUK')}</option>
                <option value="EU">{t('auth.registration.regionEU')}</option>
                <option value="APAC">{t('auth.registration.regionAPAC')}</option>
                <option value="Other">{t('auth.registration.regionOther')}</option>
              </select>
            </label>
          </div>

          {storelessEnabled ? (
            <fieldset className="block">
              <legend className={labelClassName}>{t('auth.registration.operatingModeLabel')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['storefront', 'store_less'] as const).map((mode) => {
                  const selected = formData.operating_mode === mode;
                  return (
                    <label
                      key={mode}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                        selected
                          ? 'border-[color:var(--merchant-brand)] bg-[rgba(51,75,133,0.06)] ring-2 ring-[rgba(51,75,133,0.18)]'
                          : 'border-[color:var(--merchant-line-strong)] bg-white hover:border-[color:var(--merchant-brand)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="operating_mode"
                        value={mode}
                        checked={selected}
                        onChange={(event) => onChange('operating_mode', event.target.value)}
                        className="mt-1 h-4 w-4 accent-[color:var(--merchant-brand)]"
                      />
                      <span className="block">
                        <span className="block text-sm font-medium text-[color:var(--merchant-ink)]">
                          {mode === 'storefront'
                            ? t('auth.registration.operatingModeStorefrontLabel')
                            : t('auth.registration.operatingModeStoreLessLabel')}
                        </span>
                        <span className="mt-0.5 block text-xs text-[color:var(--merchant-muted)]">
                          {mode === 'storefront'
                            ? t('auth.registration.operatingModeStorefrontHelp')
                            : t('auth.registration.operatingModeStoreLessHelp')}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <label className="block">
            <span className={labelClassName}>{t('auth.registration.storeUrlLabel')}</span>
            <input
              type="url"
              required={storeUrlRequired}
              value={formData.store_url}
              onChange={(event) => onChange('store_url', event.target.value)}
              className={inputClassName}
              placeholder={t('auth.registration.storeUrlPlaceholder')}
            />
            <span className="mt-1.5 block text-xs text-[color:var(--merchant-muted)]">
              {isStoreLess
                ? t('auth.registration.storeUrlHelpOptional')
                : t('auth.registration.storeUrlHelp')}
            </span>
          </label>

          <label className="block">
            <span className={labelClassName}>{t('auth.registration.websiteLabel')}</span>
            <input
              type="url"
              value={formData.website}
              onChange={(event) => onChange('website', event.target.value)}
              className={inputClassName}
              placeholder={t('auth.registration.websitePlaceholder')}
            />
            <span className="mt-1.5 block text-xs text-[color:var(--merchant-muted)]">
              {t('auth.registration.websiteHelp')}
            </span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>{t('auth.registration.contactEmailLabel')}</span>
              <input
                type="email"
                required
                value={formData.contact_email}
                onChange={(event) => onChange('contact_email', event.target.value)}
                className={inputClassName}
                placeholder={t('auth.registration.contactEmailPlaceholder')}
              />
            </label>

            <label className="block">
              <span className={labelClassName}>{t('auth.registration.contactPhoneLabel')}</span>
              <input
                type="tel"
                value={formData.contact_phone}
                onChange={(event) => onChange('contact_phone', event.target.value)}
                className={inputClassName}
                placeholder={t('auth.registration.contactPhonePlaceholder')}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>{t('auth.registration.passwordLabel')}</span>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(event) => onChange('password', event.target.value)}
                className={inputClassName}
                placeholder={t('auth.registration.passwordPlaceholder')}
                minLength={8}
                autoComplete="new-password"
              />
              <span className="mt-1.5 block text-xs text-[color:var(--merchant-muted)]">
                {t('auth.registration.passwordHelp')}
              </span>
            </label>

            <label className="block">
              <span className={labelClassName}>{t('auth.registration.confirmPasswordLabel')}</span>
              <input
                type="password"
                required
                value={formData.confirm_password}
                onChange={(event) => onChange('confirm_password', event.target.value)}
                className={inputClassName}
                placeholder={t('auth.registration.confirmPasswordPlaceholder')}
                autoComplete="new-password"
              />
              {passwordsMismatch ? (
                <span className="mt-1.5 block text-xs text-[color:var(--merchant-critical)]">
                  {t('auth.signup.passwordMismatch')}
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
                  <span>{t('auth.registration.creatingAccount')}</span>
                </>
              ) : (
                <>
                  <span>{t('auth.registration.continue')}</span>
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
