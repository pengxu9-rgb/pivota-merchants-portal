import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Pivota",
  description:
    "Privacy Policy for the Pivota app (Carvanaut Limited): what data the read-only Shopify app accesses, how it is used, and your rights.",
};

const wrap: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 20px 80px",
  color: "#1b1d24",
  font: "16px/1.7 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};
const h1: React.CSSProperties = { fontSize: 32, fontWeight: 700, margin: "0 0 4px" };
const h2: React.CSSProperties = { fontSize: 20, fontWeight: 700, margin: "32px 0 8px" };
const muted: React.CSSProperties = { color: "#6b7280", fontSize: 14, margin: "0 0 24px" };
const p: React.CSSProperties = { margin: "0 0 12px" };

export default function PrivacyPolicyPage() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Pivota — Privacy Policy</h1>
      <p style={muted}>Last updated: 20 June 2026</p>

      <p style={p}>
        This Privacy Policy explains how <strong>Pivota</strong> (the &ldquo;App&rdquo;),
        operated by <strong>Carvanaut Limited</strong> (&ldquo;Pivota&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;), collects, uses, and protects information when a merchant installs and
        uses the App on their Shopify store. By installing Pivota, you agree to this Policy. For any
        privacy question or data request, contact us at{" "}
        <a href="mailto:support@pivota.cc">support@pivota.cc</a>.
      </p>

      <h2 style={h2}>1. Who this policy covers</h2>
      <p style={p}>
        This Policy applies to merchants who install the Pivota app from the Shopify App Store and to
        the Shopify store data the App accesses to provide its features.
      </p>

      <h2 style={h2}>2. What the App accesses</h2>
      <p style={p}>
        Pivota is a <strong>read-only</strong> merchant tool for catalog AI-readiness and analytics.
        With your authorization (Shopify OAuth), the App accesses the following via Shopify&rsquo;s
        Admin API, using read-only scopes:
      </p>
      <ul>
        <li><strong>Products</strong> (read_products): titles, descriptions, variants, SKUs, images, and catalog metadata — to assess and improve AI-readiness.</li>
        <li><strong>Orders</strong> (read_orders): order and transaction records — used <strong>only in aggregate</strong> to compute performance and conversion analytics. We do not use this data to contact customers.</li>
        <li><strong>Fulfillments</strong> (read_fulfillments): shipment and fulfillment status — for operational analytics.</li>
        <li><strong>Discounts</strong> (read_discounts): discount metadata — for promotion-aware analysis.</li>
        <li><strong>Merchant account data</strong> you provide to create a Pivota account (name, email).</li>
      </ul>
      <p style={p}>
        The App does <strong>not</strong> request or use protected customer fields (customer name,
        email, phone, or address), does <strong>not</strong> modify your products or orders, and does
        <strong> not</strong> process checkout or payments.
      </p>

      <h2 style={h2}>3. How we use information</h2>
      <ul>
        <li>Score and improve your catalog&rsquo;s discoverability to AI shopping agents and LLMs (AI-readiness);</li>
        <li>Provide aggregate performance and analytics views to you, the merchant;</li>
        <li>Operate, secure, support, and improve the App.</li>
      </ul>
      <p style={p}>
        We do <strong>not</strong> sell your data, and we do <strong>not</strong> use order data for
        advertising or to contact your customers.
      </p>

      <h2 style={h2}>4. Legal bases (GDPR/UK GDPR)</h2>
      <p style={p}>
        Where applicable, we process data on the bases of performance of our contract with you,
        our legitimate interests in operating and improving the App, and your consent where required.
      </p>

      <h2 style={h2}>5. Data sharing and sub-processors</h2>
      <p style={p}>
        We share data only with service providers that help us run the App (e.g., cloud hosting and
        infrastructure), under contractual confidentiality and data-protection obligations. We do not
        sell data to third parties. We may disclose data if required by law.
      </p>

      <h2 style={h2}>6. Data retention and deletion</h2>
      <p style={p}>
        We retain merchant data for as long as the App is installed and as needed to provide the
        service. We honor Shopify&rsquo;s mandatory data-privacy webhooks:
      </p>
      <ul>
        <li><strong>customers/data_request</strong> — we respond to customer data-access requests forwarded by Shopify;</li>
        <li><strong>customers/redact</strong> — we delete the specified customer-related data;</li>
        <li><strong>shop/redact</strong> — within 48 hours of receiving this (sent ~48 hours after uninstall), we erase the store&rsquo;s data from our systems.</li>
      </ul>
      <p style={p}>
        On uninstall, we mark the store disconnected and remove stored access tokens. You may request
        deletion of your data at any time by emailing{" "}
        <a href="mailto:support@pivota.cc">support@pivota.cc</a>.
      </p>

      <h2 style={h2}>7. Security</h2>
      <p style={p}>
        We protect data with industry-standard measures, including encryption in transit, scoped
        access tokens, HMAC verification of Shopify webhooks, and least-privilege (read-only) access
        scopes.
      </p>

      <h2 style={h2}>8. International transfers</h2>
      <p style={p}>
        Data may be processed in countries other than where you are located. Where required, we use
        appropriate safeguards for such transfers.
      </p>

      <h2 style={h2}>9. Your rights</h2>
      <p style={p}>
        Subject to applicable law, you may request access to, correction of, or deletion of your
        data, and may object to or restrict certain processing. Contact{" "}
        <a href="mailto:support@pivota.cc">support@pivota.cc</a> to exercise these rights.
      </p>

      <h2 style={h2}>10. Children</h2>
      <p style={p}>The App is for businesses and is not directed to children.</p>

      <h2 style={h2}>11. Changes to this policy</h2>
      <p style={p}>
        We may update this Policy; we will revise the &ldquo;Last updated&rdquo; date above and,
        where appropriate, notify you.
      </p>

      <h2 style={h2}>12. Contact</h2>
      <p style={p}>
        <strong>Carvanaut Limited</strong> — Pivota
        <br />
        Email: <a href="mailto:support@pivota.cc">support@pivota.cc</a>
        <br />
        Data requests: <a href="mailto:support@pivota.cc">support@pivota.cc</a>
      </p>
    </main>
  );
}
