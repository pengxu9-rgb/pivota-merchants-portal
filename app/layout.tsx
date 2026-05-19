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
      <body className={`${instrumentSans.variable} ${inter.variable} ${cormorant.variable} antialiased`}>
        <MerchantLanguageProvider>{children}</MerchantLanguageProvider>
      </body>
    </html>
  );
}
