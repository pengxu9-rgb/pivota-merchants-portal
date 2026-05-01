import { type NextRequest } from "next/server";
import { handleInternalDemoFixturesRequest } from "@/lib/agent-center/api-handlers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleInternalDemoFixturesRequest(req);
}

