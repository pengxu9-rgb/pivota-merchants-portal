import { type NextRequest } from "next/server";
import { handleInternalProductEntityIndexRequest } from "@/lib/agent-center/api-handlers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleInternalProductEntityIndexRequest(req);
}
