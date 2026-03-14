'use client';

import { FormEvent, useEffect, useState } from 'react';
import { User, Bell, Shield, Save, Loader2, Lock } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your store settings and preferences</p>
      </div>

      {/* Business Profile */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex items-center">
          <User className="w-5 h-5 text-gray-400 mr-3" />
          <h2 className="text-lg font-semibold">Business Profile</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Business Name
              </label>
              <input
                type="text"
                value={profile.business_name}
                onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contact Email
              </label>
              <input
                type="email"
                value={profile.contact_email}
                onChange={(e) => setProfile({ ...profile, contact_email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={profile.contact_phone}
                onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Website
              </label>
              <input
                type="url"
                value={profile.website}
                onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="https://example.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Business Address
            </label>
            <textarea
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
            />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex items-center">
          <Bell className="w-5 h-5 text-gray-400 mr-3" />
          <h2 className="text-lg font-semibold">Email Notifications</h2>
        </div>
        <div className="p-6 space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <div className="font-medium">New Orders</div>
              <div className="text-sm text-gray-600">Get notified when you receive new orders</div>
            </div>
            <input
              type="checkbox"
              checked={notifications.email_orders}
              onChange={(e) => setNotifications({ ...notifications, email_orders: e.target.checked })}
              className="rounded"
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <div className="font-medium">Payment Updates</div>
              <div className="text-sm text-gray-600">Notifications about payment status changes</div>
            </div>
            <input
              type="checkbox"
              checked={notifications.email_payments}
              onChange={(e) => setNotifications({ ...notifications, email_payments: e.target.checked })}
              className="rounded"
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <div className="font-medium">Low Inventory</div>
              <div className="text-sm text-gray-600">Alert when products are running low</div>
            </div>
            <input
              type="checkbox"
              checked={notifications.email_inventory}
              onChange={(e) => setNotifications({ ...notifications, email_inventory: e.target.checked })}
              className="rounded"
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <div className="font-medium">Weekly Reports</div>
              <div className="text-sm text-gray-600">Receive weekly performance summaries</div>
            </div>
            <input
              type="checkbox"
              checked={notifications.email_weekly}
              onChange={(e) => setNotifications({ ...notifications, email_weekly: e.target.checked })}
              className="rounded"
            />
          </label>
        </div>
      </div>

      {/* Security */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex items-center">
          <Shield className="w-5 h-5 text-gray-400 mr-3" />
          <h2 className="text-lg font-semibold">Security</h2>
        </div>
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

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <div className="font-medium">Two-Factor Authentication</div>
              <div className="text-sm text-gray-600">Add an extra layer of security</div>
            </div>
            <button 
              onClick={handleEnable2FA}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Enable
            </button>
          </div>

          <form onSubmit={handleChangePassword} className="rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <Lock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-medium text-gray-900">Change Password</div>
                <div className="text-sm text-gray-600">Update your merchant login password.</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Password
              </label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                }
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Enter your current password"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                  }
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Enter a new password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Confirm the new password"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Use at least 8 characters with uppercase, lowercase, and a number.
            </p>

            <button
              type="submit"
              disabled={savingPassword}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingPassword ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
