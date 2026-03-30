import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { MerchantLanguageProvider } from "@/components/portal/merchant-language-provider";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
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
      <body className={`${instrumentSans.variable} antialiased`}>
        <MerchantLanguageProvider>{children}</MerchantLanguageProvider>
      </body>
    </html>
  );
}
