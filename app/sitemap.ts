import type { MetadataRoute } from "next";
import { agentPivotaSitemapEntries } from "@/lib/agent-center/public-indexability";

export default function sitemap(): MetadataRoute.Sitemap {
  return agentPivotaSitemapEntries();
}

