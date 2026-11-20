import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

// AI Revenue Recovery v2 (build-time, default off). Routes that only exist for
// v2 must keep answering 404 when the flag is off, exactly as before v2. The
// pages call notFound() too, but under the client dashboard layout that renders
// a 200 "not found" body, so a beforeFiles rewrite to a missing path is used.
const RECOVERY_V2 =
  (process.env.NEXT_PUBLIC_FEATURE_RECOVERY_V2 || "false").toLowerCase() === "true";
const RECOVERY_V2_ONLY_ROUTES = [
  "/dashboard/sources",
  "/dashboard/start",
  "/dashboard/checkout",
  "/dashboard/reports",
  "/dashboard/settings/orders",
];

// Flag on only (307, so nothing is cached as permanent while v2 is dark).
// Pages that leave the v2 nav land on their new home. Held for now, on
// purpose: /dashboard/agent-center/url-audit and /ai-readiness (saved reports
// and the catalog-check run live there), /dashboard/integrations (store
// connection management; disconnect has no backend route), /dev/* and
// /payment-canary (delete once the flag has been on for a week).
const RECOVERY_V2_REDIRECTS = [
  ["/dashboard/analytics", "/dashboard"],
  ["/dashboard/agent-center/funnel", "/dashboard"],
  ["/dashboard/commission", "/dashboard"],
  ["/dashboard/payouts", "/dashboard"],
  ["/dashboard/product-optimization", "/dashboard/products"],
  ["/dashboard/pdp-status", "/dashboard/products"],
  ["/dashboard/agent-chat", "/dashboard/products"],
  ["/dashboard/agent-center/storefront-agent-readiness", "/dashboard/checkout"],
  ["/dashboard/orders", "/dashboard/settings/orders"],
  ["/change-password", "/dashboard/settings"],
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Always inline the resolved flag ("true" / "false"), even when the variable
  // is unset: an unset NEXT_PUBLIC_* stays a runtime process.env lookup, which
  // the minifier cannot fold, so v2-only code would ride along in flag-off
  // bundles of local / non-Docker builds.
  env: {
    NEXT_PUBLIC_FEATURE_RECOVERY_V2: String(RECOVERY_V2),
  },
  output: "standalone",
  outputFileTracingRoot: configDir,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    if (!RECOVERY_V2) return [];
    return RECOVERY_V2_REDIRECTS.map(([source, destination]) => ({ source, destination, permanent: false }));
  },
  async rewrites() {
    if (RECOVERY_V2) return [];
    return {
      beforeFiles: RECOVERY_V2_ONLY_ROUTES.flatMap((route) => [
        { source: route, destination: "/__recovery-v2-disabled" },
        { source: `${route}/:path*`, destination: "/__recovery-v2-disabled" },
      ]),
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;

