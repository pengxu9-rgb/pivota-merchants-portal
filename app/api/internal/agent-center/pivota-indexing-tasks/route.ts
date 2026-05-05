import { type NextRequest } from "next/server";
import { handleInternalPivotaIndexingTasksRequest } from "@/lib/agent-center/api-handlers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleInternalPivotaIndexingTasksRequest(req);
}

export async function POST(req: NextRequest) {
  return handleInternalPivotaIndexingTasksRequest(req);
}
