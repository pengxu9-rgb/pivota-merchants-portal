import { type NextRequest } from "next/server";
import { handleInternalProductEntityIndexRequest } from "@/lib/agent-center/api-handlers";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  return handleInternalProductEntityIndexRequest(req, await context.params);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  return handleInternalProductEntityIndexRequest(req, await context.params);
}
