import type { Metadata } from "next";
import { Instrument_Sans, Inter, Cormorant_Garamond } from "next/font/google";
import { MerchantLanguageProvider } from "@/components/portal/merchant-language-provider";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

// Inter + Cormorant Garamond are scoped to the agent-chat surface only
// (see .agent-chat-surface in globals.css). Loading them at the root so
// the CSS variables are always available without a per-page font setup.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

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
        <link rel="stylesheet" href="/pivota-brand/pivota-brand.css" />
        <link rel="icon" type="image/svg+xml" href="/pivota-brand/svg/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/pivota-brand/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/pivota-brand/icons/favicon-16.png" />
        <link rel="apple-touch-icon" href="/pivota-brand/icons/apple-touch-icon.png" />
      </head>
      <body className={`${instrumentSans.variable} ${inter.variable} ${cormorant.variable} antialiased`}>
        <MerchantLanguageProvider>{children}</MerchantLanguageProvider>
      </body>
    </html>
  );
}
