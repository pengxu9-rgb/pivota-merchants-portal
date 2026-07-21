'use client';

/**
 * Passwordless auto-session for App Store installs (Shopify review item 1.1.1).
 *
 * A completed App Store OAuth install already proves control of the shop, so
 * the installer should land in a working, authenticated portal WITHOUT a manual
 * email+password step — otherwise a reviewer opening the app in a fresh /
 * incognito session hits a login wall and the app looks broken. We exchange the
 * one-time claim token the OAuth callback handed us for a portal session, store
 * it, and drop them into the dashboard. If the exchange fails for any reason we
 * fall back to the manual account-setup form so we never dead-end.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { API_CONFIG } from '@/lib/config';

const btn: CSSProperties = {
  display: 'inline-block',
  marginTop: 14,
  padding: '12px 26px',
  borderRadius: 999,
  background: '#7c6ce0',
  color: '#ffffff',
  fontWeight: 600,
  textDecoration: 'none',
};
const muted: CSSProperties = { fontSize: 14, color: '#6b7280', margin: '18px 0 0' };

export default function AutoSessionExchange({
  claimToken,
  shop,
}: {
  claimToken: string;
  shop?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/integrations/shopify/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claim_token: claimToken }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.token) throw new Error('exchange_failed');
        if (cancelled) return;
        // Match the keys api-client reads for the merchant session.
        localStorage.setItem('merchant_token', data.token);
        localStorage.setItem('merchant_user', JSON.stringify(data.user ?? {}));
        localStorage.setItem('merchant_id', data.user?.merchant_id ?? '');
        window.location.replace('/dashboard');
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claimToken]);

  if (failed) {
    const href = `/app/install/claim?token=${encodeURIComponent(claimToken)}${
      shop ? `&shop=${encodeURIComponent(shop)}` : ''
    }`;
    return (
      <>
        <a href={href} style={btn}>
          Set up your Pivota account
        </a>
        <p style={muted}>
          We couldn&rsquo;t finish signing you in automatically — continue to finish setup.
        </p>
      </>
    );
  }

  return (
    <p style={muted} aria-live="polite">
      Signing you in&hellip;
    </p>
  );
}
