import type { Metadata } from "next";
import type { CSSProperties } from "react";
import ClaimForm from "./ClaimForm";

export const metadata: Metadata = {
  title: "Finish setting up Pivota",
  description:
    "Connect your newly installed Shopify store to a Pivota account to see your AI-readiness score.",
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
  maxWidth: 480,
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
const h1: CSSProperties = { fontSize: 24, fontWeight: 700, margin: "0 0 10px" };
const p: CSSProperties = { margin: "0 0 20px", color: "#3b3f4a" };
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

export default async function ShopifyInstallClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; shop?: string }>;
}) {
  const { token, shop } = await searchParams;

  // No token means the link was truncated, already used, or the store was already
  // claimed. Send them to the normal sign-in rather than a broken form.
  if (!token) {
    return (
      <main style={wrap}>
        <div style={card}>
          <div style={badge} aria-hidden>
            ✓
          </div>
          <h1 style={h1}>This store is already set up</h1>
          <p style={p}>
            {shop ? <>{shop} is</> : <>Your store is</>} already connected to a Pivota
            account. Sign in to see your AI-readiness score.
          </p>
          <a href="/login" style={btn}>
            Sign in to Pivota
          </a>
          <p style={muted}>
            Need help? Contact <a href="mailto:support@pivota.cc">support@pivota.cc</a>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={card}>
        <div style={badge} aria-hidden>
          ✓
        </div>
        <h1 style={h1}>Pivota is installed</h1>
        <p style={p}>
          {shop ? <strong>{shop}</strong> : <>Your store</>} is connected. Set up your
          Pivota account to see your AI-readiness score.
        </p>
        <ClaimForm token={token} shop={shop || ""} />
        <p style={muted}>
          Need help? Contact <a href="mailto:support@pivota.cc">support@pivota.cc</a>.
        </p>
      </div>
    </main>
  );
}
