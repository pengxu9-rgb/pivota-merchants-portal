import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: configDir,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/internal/agent-center/demo-fixtures",
          destination: "/api/agent-center/internal-demo-fixtures",
        },
        {
          source: "/api/internal/agent-center/demo-fixtures/:fixtureId",
          destination: "/api/agent-center/internal-demo-fixtures/:fixtureId",
        },
        {
          source: "/api/internal/agent-center/production-validation-runs",
          destination: "/api/agent-center/internal-production-validation-runs",
        },
        {
          source: "/api/internal/agent-center/production-validation-runs/:runId",
          destination:
            "/api/agent-center/internal-production-validation-runs/:runId",
        },
        {
          source:
            "/api/internal/agent-center/production-validation-runs/:runId/run",
          destination:
            "/api/agent-center/internal-production-validation-runs/:runId/run",
        },
      ],
    };
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
