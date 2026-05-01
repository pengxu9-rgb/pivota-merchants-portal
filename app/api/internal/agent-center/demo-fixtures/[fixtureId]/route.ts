import { type NextRequest } from "next/server";
import { handleInternalDemoFixturesRequest } from "@/lib/agent-center/api-handlers";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ fixtureId: string }> }
) {
  return handleInternalDemoFixturesRequest(req, await context.params);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ fixtureId: string }> }
) {
  return handleInternalDemoFixturesRequest(req, await context.params);
}

