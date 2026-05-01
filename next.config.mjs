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
