import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

// AI Revenue Recovery v2 (build-time, default off). Routes that only exist for
// v2 must keep answering 404 when the flag is off, exactly as before v2. The
// pages call notFound() too, but under the client dashboard layout that renders
// a 200 "not found" body, so a beforeFiles rewrite to a missing path is used.
const RECOVERY_V2 =
  (process.env.NEXT_PUBLIC_FEATURE_RECOVERY_V2 || "false").toLowerCase() === "true";
const RECOVERY_V2_ONLY_ROUTES = ["/dashboard/sources", "/dashboard/start"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: configDir,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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

