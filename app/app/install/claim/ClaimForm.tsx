'use client';

import { useState, type CSSProperties } from 'react';
import { API_CONFIG } from '@/lib/config';

const field: CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  borderRadius: 10,
  border: '1px solid #d9d5cd',
  background: '#fff',
  fontSize: 15,
  marginTop: 6,
};
const label: CSSProperties = { fontSize: 14, fontWeight: 600, color: '#3b3f4a' };
const row: CSSProperties = { textAlign: 'left', marginBottom: 14 };
const btn: CSSProperties = {
  width: '100%',
  marginTop: 8,
  padding: '12px 26px',
  borderRadius: 999,
  background: '#7c6ce0',
  color: '#fff',
  fontWeight: 600,
  border: 'none',
  fontSize: 15,
  cursor: 'pointer',
};
const errorBox: CSSProperties = {
  background: '#fdeceb',
  color: '#a03027',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  marginBottom: 14,
  textAlign: 'left',
};

export default function ClaimForm({ token, shop }: { token: string; shop: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/integrations/shopify/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_token: token,
          email,
          password,
          full_name: fullName || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(
          typeof data?.detail === 'string'
            ? data.detail
            : "We couldn't finish setting up your account. Please try again.",
        );
        setLoading(false);
        return;
      }

      // Same session shape the normal login flow writes.
      localStorage.setItem('merchant_token', data.token);
      localStorage.setItem('merchant_user', JSON.stringify(data.user));
      localStorage.setItem('merchant_id', data.user?.merchant_id || '');

      window.location.href = '/dashboard/integrations';
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {error ? <div style={errorBox}>{error}</div> : null}

      <div style={row}>
        <label style={label} htmlFor="claim-email">
          Email
        </label>
        <input
          id="claim-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={field}
          placeholder="you@yourbrand.com"
        />
      </div>

      <div style={row}>
        <label style={label} htmlFor="claim-password">
          Password
        </label>
        <input
          id="claim-password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={field}
          placeholder="At least 8 characters"
        />
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>
          Already have a Pivota account? Enter its email and password and we&rsquo;ll add{' '}
          {shop || 'this store'} to it. Otherwise we&rsquo;ll create your account.
        </div>
      </div>

      <div style={row}>
        <label style={label} htmlFor="claim-name">
          Your name <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
        </label>
        <input
          id="claim-name"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          style={field}
        />
      </div>

      <button type="submit" style={{ ...btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
        {loading ? 'Setting up…' : 'Continue to Pivota'}
      </button>
    </form>
  );
}
