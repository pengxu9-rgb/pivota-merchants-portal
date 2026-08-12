import type { Metadata } from "next";
import type { CSSProperties } from "react";

import AutoSessionExchange from "./AutoSessionExchange";

export const metadata: Metadata = {
  title: "Pivota installed — Success",
  description:
    "Pivota was installed on your Shopify store. Your read-only catalog and analytics connection is now active.",
};

const wrap: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f4f1ea",
  padding: "48px 20px",
  color: "#1b1d24",
  font: "16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};
const card: CSSProperties = {
  maxWidth: 560,
  width: "100%",
  background: "#ffffff",
  borderRadius: 18,
  padding: "40px 36px",
  boxShadow: "0 18px 50px rgba(27,29,36,0.10)",
  textAlign: "center",
};
const badge: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: "50%",
  background: "#ece8ff",
  color: "#7c6ce0",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 32,
  fontWeight: 700,
  margin: "0 auto 20px",
};
const h1: CSSProperties = { fontSize: 26, fontWeight: 700, margin: "0 0 10px" };
const p: CSSProperties = { margin: "0 0 14px", color: "#3b3f4a" };
const muted: CSSProperties = { fontSize: 14, color: "#6b7280", margin: "18px 0 0" };
const btn: CSSProperties = {
  display: "inline-block",
  marginTop: 14,
  padding: "12px 26px",
  borderRadius: 999,
  background: "#7c6ce0",
  color: "#ffffff",
  fontWeight: 600,
  textDecoration: "none",
};

export default async function ShopifyInstallSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ claim_token?: string; shop?: string }>;
}) {
  const { claim_token: claimToken, shop } = await searchParams;

  // An App Store install creates a shell merchant with no user account. Rather
  // than dead-ending the installer at a login they cannot pass, the OAuth
  // callback hands us a one-time claim token — completed install = proof of shop
  // control — which we exchange for a session automatically so the app "just
  // works" in a fresh/incognito session (Shopify review item 1.1.1). Without a
  // token the store is already claimed, so a plain dashboard link is right.

  return (
    <main style={wrap}>
      <div style={card}>
        <div style={badge} aria-hidden>
          ✓
        </div>
        <h1 style={h1}>Pivota is connected</h1>
        <p style={p}>
          Your Shopify store is now linked to Pivota. We&rsquo;ll read your catalog,
          orders, fulfillments, and discounts (read-only) to score AI-readiness and
          surface performance analytics. This connection is read-only &mdash; it
          can&rsquo;t change your products or orders.
        </p>
        <p style={p}>
          {claimToken
            ? "Taking you to your dashboard to review your AI-readiness score and recommendations."
            : "Open the dashboard to review your AI-readiness score and recommendations."}
        </p>
        {claimToken ? (
          <AutoSessionExchange claimToken={claimToken} shop={shop} />
        ) : (
          <a href="/dashboard/integrations" style={btn}>
            Go to your Pivota dashboard
          </a>
        )}
        <p style={muted}>
          Need help? Contact{" "}
          <a href="mailto:support@pivota.cc">support@pivota.cc</a>.
        </p>
      </div>
    </main>
  );
}
