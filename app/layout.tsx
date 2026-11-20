import type { Metadata } from "next";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/inter";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import { MerchantLanguageProvider } from "@/components/portal/merchant-language-provider";
import { FEATURE_FLAGS } from "@/lib/config";
import "./globals.css";
// Recovery v2: tokens + component styles. Every rule is scoped to `.rv2` (or
// new custom properties), so with the flag off nothing on the page changes.
import "../styles/pivota-tokens.css";
import "../styles/recovery-v2.css";
import "../styles/recovery-v2-legacy.css";

export const metadata: Metadata = {
  title: "Pivota Merchant Portal",
  description: "Manage catalog health, orders, channels, and payment operations from one merchant control center.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* The brand stylesheet @imports Google Fonts. v2 self-hosts Inter
            (@fontsource-variable/inter) and fetches no fonts from the network. */}
        {FEATURE_FLAGS.RECOVERY_V2 ? null : (
          <link rel="stylesheet" href="/pivota-brand/pivota-brand.css" />
        )}
        <link rel="icon" type="image/svg+xml" href="/pivota-brand/svg/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/pivota-brand/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/pivota-brand/icons/favicon-16.png" />
        <link rel="apple-touch-icon" href="/pivota-brand/icons/apple-touch-icon.png" />
      </head>
      <body className={FEATURE_FLAGS.RECOVERY_V2 ? "antialiased rv2" : "antialiased"}>
        <MerchantLanguageProvider>{children}</MerchantLanguageProvider>
      </body>
    </html>
  );
}
