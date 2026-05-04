import type { MetadataRoute } from "next";
import { agentPivotaRobotsPolicy } from "@/lib/agent-center/public-indexability";

export default function robots(): MetadataRoute.Robots {
  return agentPivotaRobotsPolicy();
}

