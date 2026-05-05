import { type NextRequest } from "next/server";
import { handleInternalPivotaIndexingTasksRequest } from "@/lib/agent-center/api-handlers";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  return handleInternalPivotaIndexingTasksRequest(req, await context.params);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  return handleInternalPivotaIndexingTasksRequest(req, await context.params);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  return handleInternalPivotaIndexingTasksRequest(req, await context.params);
}
