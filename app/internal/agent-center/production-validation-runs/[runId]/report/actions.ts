"use server";

import { revalidatePath } from "next/cache";
import { withAgentCenterRepositorySession } from "@/lib/agent-center/repository";
import { MerchantFacingReportService } from "@/lib/agent-center/services";
import type { MerchantFacingReportStatus } from "@/lib/agent-center/types";

function reportPath(runId: string) {
  return `/internal/agent-center/production-validation-runs/${runId}/report`;
}

export async function generateReportDraftAction(formData: FormData) {
  const runId = String(formData.get("runId") || "");
  const regenerate = String(formData.get("regenerate") || "") === "true";
  if (!runId) return;

  await withAgentCenterRepositorySession(async () => {
    new MerchantFacingReportService().generate(runId, { regenerate });
  });

  revalidatePath(reportPath(runId));
}

export async function updateReportDraftStatusAction(formData: FormData) {
  const runId = String(formData.get("runId") || "");
  const reportStatus = String(
    formData.get("report_status") || ""
  ) as MerchantFacingReportStatus;
  if (!runId || !reportStatus) return;

  await withAgentCenterRepositorySession(async () => {
    new MerchantFacingReportService().updateStatus(runId, {
      report_status: reportStatus,
      reviewed_by: String(formData.get("reviewed_by") || "internal"),
      approved_by: String(formData.get("approved_by") || "internal"),
    });
  });

  revalidatePath(reportPath(runId));
}
