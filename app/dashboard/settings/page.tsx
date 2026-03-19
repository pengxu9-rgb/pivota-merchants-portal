'use client';

import { FormEvent, useEffect, useState } from 'react';
import { User, Bell, Shield, Save, Loader2, Lock } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit.';
  return null;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  
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
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getProfile();
      if (data) {
        setProfile({
          business_name: data.business_name || '',
          contact_email: data.contact_email || '',
          contact_phone: data.contact_phone || '',
          website: data.website || '',
          address: data.address || '',
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await apiClient.updateProfile(profile);
      alert(result.message || '✅ Settings saved successfully!');
    } catch (error: any) {
      alert('❌ Failed to save: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    const validationError = validatePassword(passwordForm.newPassword);
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

      setPasswordSuccess(result.message || 'Password changed successfully. Redirecting to login...');
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
          'Failed to change password.'
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleEnable2FA = async () => {
    try {
      const result = await apiClient.enable2FA();
      if (result.data?.qr_code_url) {
        alert('✅ 2FA enabled! Please scan the QR code with your authenticator app.\n\nQR Code: ' + result.data.qr_code_url);
      } else {
        alert(result.message || '✅ 2FA enabled successfully!');
      }
    } catch (error: any) {
      alert('❌ Failed to enable 2FA: ' + (error.response?.data?.detail || error.message));
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
    <div className="space-y-8 max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Manage merchant profile, notifications, and account access."
        description="Settings should feel like a calm place to maintain contact details, alert preferences, and security controls without dropping back into an internal admin form."
      />

      {/* Business Profile */}
      <SurfaceCard
        title="Business profile"
        description="Keep the merchant-facing identity and contact information used across your workspace up to date."
        action={<StatusBadge tone="brand" icon={User}>Profile</StatusBadge>}
      >
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
                Business Name
              </label>
              <input
                type="text"
                value={profile.business_name}
                onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                className="merchant-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
                Contact Email
              </label>
              <input
                type="email"
                value={profile.contact_email}
                onChange={(e) => setProfile({ ...profile, contact_email: e.target.value })}
                className="merchant-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={profile.contact_phone}
                onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })}
                className="merchant-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
                Website
              </label>
              <input
                type="url"
                value={profile.website}
                onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                className="merchant-input"
                placeholder="https://example.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
              Business Address
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

      {/* Notifications */}
      <SurfaceCard
        title="Notifications"
        description="Choose which merchant updates deserve attention in your inbox."
        action={<StatusBadge tone="neutral" icon={Bell}>Email preferences</StatusBadge>}
      >
        <div className="p-6 space-y-4">
          <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/65 px-4 py-4">
            <div>
              <div className="font-medium text-[color:var(--merchant-ink)]">New orders</div>
              <div className="text-sm text-[color:var(--merchant-muted)]">Get notified when new orders land in the portal</div>
            </div>
            <input
              type="checkbox"
              checked={notifications.email_orders}
              onChange={(e) => setNotifications({ ...notifications, email_orders: e.target.checked })}
              className="rounded"
            />
          </label>
          <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/65 px-4 py-4">
            <div>
              <div className="font-medium text-[color:var(--merchant-ink)]">Payment updates</div>
              <div className="text-sm text-[color:var(--merchant-muted)]">Notifications about settlement or payment status changes</div>
            </div>
            <input
              type="checkbox"
              checked={notifications.email_payments}
              onChange={(e) => setNotifications({ ...notifications, email_payments: e.target.checked })}
              className="rounded"
            />
          </label>
          <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/65 px-4 py-4">
            <div>
              <div className="font-medium text-[color:var(--merchant-ink)]">Low inventory</div>
              <div className="text-sm text-[color:var(--merchant-muted)]">Alert the team when stock levels need attention</div>
            </div>
            <input
              type="checkbox"
              checked={notifications.email_inventory}
              onChange={(e) => setNotifications({ ...notifications, email_inventory: e.target.checked })}
              className="rounded"
            />
          </label>
          <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/65 px-4 py-4">
            <div>
              <div className="font-medium text-[color:var(--merchant-ink)]">Weekly reports</div>
              <div className="text-sm text-[color:var(--merchant-muted)]">Receive a quieter weekly summary of performance and catalog health</div>
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

      {/* Security */}
      <SurfaceCard
        title="Security"
        description="Protect portal access for your merchant team and keep credentials current."
        action={<StatusBadge tone="warning" icon={Shield}>Account access</StatusBadge>}
      >
        <div className="p-6 space-y-4">
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

          <div className="flex items-center justify-between p-4 rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/65">
            <div>
              <div className="font-medium text-[color:var(--merchant-ink)]">Two-factor authentication</div>
              <div className="text-sm text-[color:var(--merchant-muted)]">Add an extra layer of account protection</div>
            </div>
            <MerchantButton type="button" onClick={handleEnable2FA}>
              Enable
            </MerchantButton>
          </div>

          <form onSubmit={handleChangePassword} className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/75 p-4 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="rounded-lg bg-[color:var(--merchant-brand-soft)] p-2">
                <Lock className="w-5 h-5 text-[color:var(--merchant-brand)]" />
              </div>
              <div>
                <div className="font-medium text-[color:var(--merchant-ink)]">Change password</div>
                <div className="text-sm text-[color:var(--merchant-muted)]">Update your merchant login password.</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
                Current Password
              </label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                }
                required
                className="merchant-input"
                placeholder="Enter your current password"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                  }
                  required
                  className="merchant-input"
                  placeholder="Enter a new password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--merchant-muted-strong)] mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                  required
                  className="merchant-input"
                  placeholder="Confirm the new password"
                />
              </div>
            </div>

            <p className="text-xs text-[color:var(--merchant-muted)]">
              Use at least 8 characters with uppercase, lowercase, and a number.
            </p>

            <MerchantButton
              type="submit"
              disabled={savingPassword}
            >
              {savingPassword ? 'Updating Password...' : 'Update Password'}
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
          <span>{saving ? 'Saving...' : 'Save changes'}</span>
        </MerchantButton>
      </div>
    </div>
  );
}
