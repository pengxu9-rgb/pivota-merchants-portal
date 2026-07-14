import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Pivota install — Couldn't finish",
  description:
    "We couldn't finish connecting your Shopify store to Pivota. Start the connection again, or contact support.",
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
  background: "#fdeceb",
  color: "#d4574e",
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

// Short, non-leaky slugs sent by the backend OAuth callback. Anything we don't
// recognise falls back to the generic message rather than echoing the raw value.
const REASONS: Record<string, string> = {
  state_not_found:
    "This install link is no longer valid. Install links can only be used once.",
  state_already_used:
    "This install link has already been used. Start the connection again from your dashboard.",
  state_expired:
    "The connection request expired before it was completed. Please try again.",
  state_consumption_failed:
    "The connection request expired before it was completed. Please try again.",
  shop_domain_mismatch:
    "The Shopify store that authorized the app didn't match the one we expected.",
  invalid_signature:
    "We couldn't verify that this request came from Shopify. Please start again.",
  token_exchange_failed:
    "Shopify didn't complete the authorization handshake. Please try again.",
  shop_verification_failed:
    "We couldn't read your store details back from Shopify. Please try again.",
  missing_params: "The authorization response from Shopify was incomplete.",
  missing_shop: "The authorization response from Shopify was missing the store domain.",
  not_configured:
    "Pivota's Shopify connection isn't fully configured. Please contact support.",
};

export default async function ShopifyInstallErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const explanation =
    (reason && REASONS[reason]) ||
    "We couldn't finish connecting your Shopify store. No changes were made to your store.";

  return (
    <main style={wrap}>
      <div style={card}>
        <div style={badge} aria-hidden>
          !
        </div>
        <h1 style={h1}>We couldn&rsquo;t finish the install</h1>
        <p style={p}>{explanation}</p>
        <p style={p}>
          Nothing was changed on your Shopify store. You can start the connection again
          from your Pivota dashboard.
        </p>
        <a href="https://merchant.pivota.cc/dashboard/integrations" style={btn}>
          Try connecting again
        </a>
        <p style={muted}>
          Still stuck? Contact <a href="mailto:support@pivota.cc">support@pivota.cc</a>.
        </p>
      </div>
    </main>
  );
}
