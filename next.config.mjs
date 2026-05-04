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
        {
          source:
            "/api/internal/agent-center/production-validation-runs/:runId/report-draft",
          destination:
            "/api/agent-center/internal-production-validation-runs/:runId/report-draft",
        },
        {
          source: "/api/internal/agent-center/pilot-product-entities",
          destination: "/api/agent-center/internal-pilot-product-entities",
        },
        {
          source: "/api/internal/agent-center/pilot-product-entities/:runId",
          destination: "/api/agent-center/internal-pilot-product-entities/:runId",
        },
        {
          source: "/api/internal/agent-center/pilot-product-entities/:runId/publish",
          destination:
            "/api/agent-center/internal-pilot-product-entities/:runId/publish",
        },
        {
          source: "/api/internal/agent-center/pilot-product-entities/:runId/audit",
          destination:
            "/api/agent-center/internal-pilot-product-entities/:runId/audit",
        },
        {
          source: "/api/internal/agent-center/config-status",
          destination: "/api/agent-center/internal-config-status",
        },
        {
          source: "/api/internal/agent-center/runtime-config",
          destination: "/api/agent-center/internal-runtime-config",
        },
        {
          source: "/api/internal/agent-center/pivota-pdp-indexability-audit",
          destination:
            "/api/agent-center/internal-pivota-pdp-indexability-audit",
        },
        {
          source: "/api/internal/agent-center/pivota-indexing-tasks",
          destination: "/api/agent-center/internal-pivota-indexing-tasks",
        },
        {
          source: "/api/internal/agent-center/pivota-indexing-tasks/:taskId",
          destination:
            "/api/agent-center/internal-pivota-indexing-tasks/:taskId",
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
