'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, User, Bell, Shield, Save, Loader2, Lock, Languages, Zap } from 'lucide-react';
import { PortalLanguageSwitcher } from '@/components/portal/portal-language-switcher';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import { apiClient } from '@/lib/api-client';
import {
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';

function validatePassword(
  password: string,
  t: (key: string) => string,
): string | null {
  if (password.length < 8) return t('settings.passwordTooShort');
  if (!/[A-Z]/.test(password)) return t('settings.passwordNeedUppercase');
  if (!/[a-z]/.test(password)) return t('settings.passwordNeedLowercase');
  if (!/[0-9]/.test(password)) return t('settings.passwordNeedDigit');
  return null;
}

export default function SettingsPage() {
  const { t, language, setLanguage } = useMerchantLanguage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [preferencesError, setPreferencesError] = useState('');
  const [languageStatus, setLanguageStatus] = useState('');
  const [languageError, setLanguageError] = useState('');
  
  const [profile, setProfile] = useState({
    business_name: '',
    contact_email: '',
    contact_phone: '',
    website: '',
    address: '',
  });
  
  const [notifications, setNotifications] = useState({
    email_orders: true,
    email_payments: true,
    email_inventory: false,
    email_weekly: false,
  });
  // Per-merchant executor consent (W5 P7). Default true = Pivota auto-runs
  // recommended actions; false = the merchant approves each action first.
  const [automation, setAutomation] = useState({
    executor_auto_execute: true,
  });
  const [portalLanguage, setPortalLanguage] = useState(language);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    // Initial settings hydration is route-scoped; re-fetching on every render is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadSettings();
  }, []);

  useEffect(() => {
    setPortalLanguage(language);
  }, [language]);

  const hydrateProfileFromStoredUser = () => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const storedUser = localStorage.getItem('merchant_user');
      if (!storedUser) {
        return;
      }

      const parsed = JSON.parse(storedUser);
      setProfile((current) => ({
        ...current,
        business_name: current.business_name || parsed.business_name || parsed.full_name || '',
        contact_email: current.contact_email || parsed.email || '',
      }));
    } catch (error) {
      console.warn('Failed to hydrate merchant profile from local storage:', error);
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      setLoadError('');
      setPreferencesError('');

      const [profileResult, preferencesResult] = await Promise.allSettled([
        apiClient.getProfile(),
        apiClient.getSettingsPreferences(),
      ]);

      if (profileResult.status === 'fulfilled' && profileResult.value) {
        const data = profileResult.value;
        setProfile({
          business_name: data.business_name || '',
          contact_email: data.contact_email || '',
          contact_phone: data.contact_phone || '',
          website: data.website || '',
          address: data.address || '',
        });
      } else {
        setLoadError(t('settings.profileUnavailable'));
        hydrateProfileFromStoredUser();
      }

      if (preferencesResult.status === 'fulfilled' && preferencesResult.value) {
        const preferences = preferencesResult.value;
        setNotifications({
          email_orders: preferences.email_orders ?? true,
          email_payments: preferences.email_payments ?? true,
          email_inventory: preferences.email_inventory ?? false,
          email_weekly: preferences.email_weekly ?? false,
        });
        setAutomation({
          executor_auto_execute: preferences.executor_auto_execute ?? true,
        });
        const nextLanguage = preferences.portal_language ?? 'en';
        setPortalLanguage(nextLanguage);
        setLanguage(nextLanguage);
      } else {
        setPreferencesError(
          t('settings.preferencesUnavailable')
        );
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      setLoadError(t('settings.profileUnavailable'));
      hydrateProfileFromStoredUser();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const [profileResult, preferencesResult] = await Promise.allSettled([
        apiClient.updateProfile(profile),
        apiClient.updateSettingsPreferences({
          ...notifications,
          ...automation,
          portal_language: portalLanguage,
        }),
      ]);

      if (profileResult.status === 'fulfilled') {
        setLoadError('');
      } else {
        setLoadError(t('settings.profileSaveFailed'));
      }

      if (preferencesResult.status === 'fulfilled') {
        setPreferencesError('');
      } else {
        setPreferencesError(t('settings.preferencesSaveFailed'));
      }

      if (profileResult.status === 'fulfilled' && profileResult.value?.login_email_changed) {
        // The login credential moved server-side; the current session's token
        // and stored user are stale. Force a fresh sign-in with the new email.
        alert(t('settings.loginEmailChanged'));
        apiClient.logout();
        return;
      }

      if (profileResult.status === 'fulfilled' && preferencesResult.status === 'fulfilled') {
        alert(profileResult.value.message || t('settings.savedSuccess'));
      } else if (profileResult.status === 'fulfilled' || preferencesResult.status === 'fulfilled') {
        alert(t('settings.savedPartial'));
      } else {
        throw new Error('Failed to save settings.');
      }
    } catch (error: any) {
      alert(
        t('settings.saveFailedPrefix', {
          message: error.response?.data?.detail || error.message,
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = async (nextLanguage: typeof portalLanguage) => {
    setPortalLanguage(nextLanguage);
    setLanguage(nextLanguage);
    setSavingLanguage(true);
    setLanguageError('');
    setLanguageStatus(t('settings.languageSaving'));

    try {
      await apiClient.updateSettingsPreferences({ portal_language: nextLanguage });
      setLanguageStatus(t('settings.languageSaved'));
    } catch (error) {
      console.error('Failed to persist portal language:', error);
      setLanguageStatus('');
      setLanguageError(t('settings.languageUnsynced'));
    } finally {
      setSavingLanguage(false);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(t('settings.passwordMismatch'));
      return;
    }

    const validationError = validatePassword(passwordForm.newPassword, t);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    setSavingPassword(true);
    try {
      const result = await apiClient.changePassword({
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
      });

      setPasswordSuccess(result.message || t('settings.passwordUpdated'));
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      window.setTimeout(() => {
        apiClient.logout();
      }, 1200);
    } catch (error: any) {
      setPasswordError(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.message ||
          t('settings.passwordUpdateFailed')
      );
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="merchant-panel px-8 py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-brand)]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow={t('settings.eyebrow')}
        title={t('settings.title')}
        description={t('settings.description')}
      />

      {loadError ? (
        <div className="flex items-start gap-3 rounded-[1.1rem] border border-[color:var(--merchant-warning-soft)] bg-[color:var(--merchant-warning-soft)]/65 px-4 py-3 text-sm text-[color:var(--merchant-warning)]">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{loadError}</p>
        </div>
      ) : null}

      {preferencesError ? (
        <div className="flex items-start gap-3 rounded-[1.1rem] border border-[color:var(--merchant-warning-soft)] bg-[color:var(--merchant-warning-soft)]/65 px-4 py-3 text-sm text-[color:var(--merchant-warning)]">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{preferencesError}</p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SurfaceCard
          title={t('settings.profileCardTitle')}
          description={t('settings.profileCardDescription')}
          action={<StatusBadge tone="brand" icon={User}>{t('settings.profileBadge')}</StatusBadge>}
        >
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-muted-strong)]">
                  {t('settings.businessName')}
                </label>
                <input
                  type="text"
                  value={profile.business_name}
                  onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                  className="merchant-input"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-muted-strong)]">
                  {t('settings.contactEmail')}
                </label>
                <input
                  type="email"
                  value={profile.contact_email}
                  onChange={(e) => setProfile({ ...profile, contact_email: e.target.value })}
                  className="merchant-input"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-muted-strong)]">
                  {t('settings.phoneNumber')}
                </label>
                <input
                  type="tel"
                  value={profile.contact_phone}
                  onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })}
                  className="merchant-input"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-muted-strong)]">
                  {t('settings.website')}
                </label>
                <input
                  type="url"
                  value={profile.website}
                  onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                  className="merchant-input"
                  placeholder={t('settings.websitePlaceholder')}
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-muted-strong)]">
                {t('settings.businessAddress')}
              </label>
              <textarea
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                className="merchant-textarea"
                rows={3}
              />
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          title={t('settings.notificationsCardTitle')}
          description={t('settings.notificationsCardDescription')}
          action={<StatusBadge tone="neutral" icon={Bell}>{t('settings.notificationsBadge')}</StatusBadge>}
        >
          <div className="space-y-3 p-5">
            <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/65 px-4 py-3.5">
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">{t('settings.notificationOrdersTitle')}</div>
                <div className="text-sm text-[color:var(--merchant-muted)]">{t('settings.notificationOrdersDescription')}</div>
              </div>
              <input
                type="checkbox"
                checked={notifications.email_orders}
                onChange={(e) => setNotifications({ ...notifications, email_orders: e.target.checked })}
                className="rounded"
              />
            </label>
            <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/65 px-4 py-3.5">
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">{t('settings.notificationPaymentsTitle')}</div>
                <div className="text-sm text-[color:var(--merchant-muted)]">{t('settings.notificationPaymentsDescription')}</div>
              </div>
              <input
                type="checkbox"
                checked={notifications.email_payments}
                onChange={(e) => setNotifications({ ...notifications, email_payments: e.target.checked })}
                className="rounded"
              />
            </label>
            <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/65 px-4 py-3.5">
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">{t('settings.notificationInventoryTitle')}</div>
                <div className="text-sm text-[color:var(--merchant-muted)]">{t('settings.notificationInventoryDescription')}</div>
              </div>
              <input
                type="checkbox"
                checked={notifications.email_inventory}
                onChange={(e) => setNotifications({ ...notifications, email_inventory: e.target.checked })}
                className="rounded"
              />
            </label>
            <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/65 px-4 py-3.5">
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">{t('settings.notificationWeeklyTitle')}</div>
                <div className="text-sm text-[color:var(--merchant-muted)]">{t('settings.notificationWeeklyDescription')}</div>
              </div>
              <input
                type="checkbox"
                checked={notifications.email_weekly}
                onChange={(e) => setNotifications({ ...notifications, email_weekly: e.target.checked })}
                className="rounded"
              />
            </label>
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard
        title={t('settings.automationCardTitle')}
        description={t('settings.automationCardDescription')}
        action={<StatusBadge tone="neutral" icon={Zap}>{t('settings.automationBadge')}</StatusBadge>}
      >
        <div className="space-y-3 p-5">
          <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/65 px-4 py-3.5">
            <div>
              <div className="font-medium text-[color:var(--merchant-ink)]">{t('settings.autoExecuteTitle')}</div>
              <div className="text-sm text-[color:var(--merchant-muted)]">{t('settings.autoExecuteDescription')}</div>
            </div>
            <input
              type="checkbox"
              checked={automation.executor_auto_execute}
              onChange={(e) => setAutomation({ executor_auto_execute: e.target.checked })}
              className="rounded"
            />
          </label>
        </div>
      </SurfaceCard>

      <SurfaceCard
        title={t('settings.languageCardTitle')}
        description={t('settings.languageCardDescription')}
        action={<StatusBadge tone="brand" icon={Languages}>{t('settings.languageBadge')}</StatusBadge>}
      >
        <div className="space-y-4 p-5">
          <PortalLanguageSwitcher
            variant="grid"
            value={portalLanguage}
            onChange={handleLanguageChange}
            disabled={savingLanguage}
          />
          {languageStatus ? (
            <p className="text-sm text-[color:var(--merchant-muted)]">{languageStatus}</p>
          ) : null}
          {languageError ? (
            <div className="flex items-start gap-3 rounded-[1rem] border border-[color:var(--merchant-warning-soft)] bg-[color:var(--merchant-warning-soft)]/65 px-4 py-3 text-sm text-[color:var(--merchant-warning)]">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>{languageError}</p>
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      {/* Security */}
      <SurfaceCard
        title={t('settings.securityCardTitle')}
        description={t('settings.securityCardDescription')}
        action={<StatusBadge tone="warning" icon={Shield}>{t('settings.securityBadge')}</StatusBadge>}
      >
        <div className="space-y-4 p-5">
          {passwordError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {passwordError}
            </div>
          ) : null}

          {passwordSuccess ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {passwordSuccess}
            </div>
          ) : null}

          <form onSubmit={handleChangePassword} className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/75 p-4 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="rounded-lg bg-[color:var(--merchant-brand-soft)] p-2">
                <Lock className="w-5 h-5 text-[color:var(--merchant-brand)]" />
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">{t('settings.changePasswordTitle')}</div>
                <div className="text-sm text-[color:var(--merchant-muted)]">{t('settings.changePasswordDescription')}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
                {t('settings.currentPassword')}
              </label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                }
                required
                className="merchant-input"
                placeholder={t('settings.currentPasswordPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
                  {t('settings.newPassword')}
                </label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                  }
                  required
                  className="merchant-input"
                  placeholder={t('settings.newPasswordPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
                  {t('settings.confirmNewPassword')}
                </label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                  required
                  className="merchant-input"
                  placeholder={t('settings.confirmNewPasswordPlaceholder')}
                />
              </div>
            </div>

            <p className="text-xs text-[color:var(--merchant-muted)]">
              {t('settings.passwordHelp')}
            </p>

            <MerchantButton
              type="submit"
              disabled={savingPassword}
            >
              {savingPassword ? t('settings.updatingPassword') : t('settings.updatePassword')}
            </MerchantButton>
          </form>
        </div>
      </SurfaceCard>

      {/* Save Button */}
      <div className="flex justify-end">
        <MerchantButton
          onClick={handleSave}
          disabled={saving}
          icon={saving ? Loader2 : Save}
        >
          <span>{saving ? t('settings.saving') : t('settings.saveChanges')}</span>
        </MerchantButton>
      </div>
    </div>
  );
}
