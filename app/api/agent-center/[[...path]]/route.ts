import { type NextRequest } from "next/server";
import { handleAgentCenterRequest } from "@/lib/agent-center/api-handlers";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return handleAgentCenterRequest(req, await context.params);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return handleAgentCenterRequest(req, await context.params);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return handleAgentCenterRequest(req, await context.params);
}
