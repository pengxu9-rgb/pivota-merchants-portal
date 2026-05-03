import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from "@/components/ui/merchant-primitives";
import { withAgentCenterRepositorySession } from "@/lib/agent-center/repository";
import {
  MerchantFacingReportService,
  ProductionValidationRunService,
} from "@/lib/agent-center/services";
import type {
  MerchantFacingValidationReport,
  ProductionValidationRun,
} from "@/lib/agent-center/types";
import {
  generateReportDraftAction,
  updateReportDraftStatusAction,
} from "./actions";
import { CopyMarkdownButton } from "./copy-markdown-button";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Internal Agent Center Report Preview",
  robots: {
    index: false,
    follow: false,
  },
};

type PageProps = {
  params: Promise<{ runId: string }>;
};

function label(value?: string | number | null) {
  if (value === undefined || value === null || value === "") return "Not provided";
  return String(value).replace(/_/g, " ");
}

function statusTone(status?: string) {
  if (status === "passed" || status === "approved_to_share") return "success";
  if (status === "blocked" || status === "critical") return "critical";
  if (status === "needs_work" || status === "reviewed" || status === "warning") return "warning";
  return "neutral";
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function ActionButton({
  children,
  icon,
}: {
  children: string;
  icon?: ReactNode;
}) {
  return (
    <button type="submit" className="merchant-button-secondary">
      {icon}
      <span>{children}</span>
    </button>
  );
}

function FieldRow({
  label: rowLabel,
  value,
}: {
  label: string;
  value?: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-[color:var(--merchant-line)] px-5 py-3 last:border-b-0 sm:grid-cols-[220px_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--merchant-muted)]">
        {rowLabel}
      </dt>
      <dd className="text-sm text-[color:var(--merchant-ink)]">{value || "Not provided"}</dd>
    </div>
  );
}

function MetricStatus({
  label: metricLabel,
  status,
  helper,
}: {
  label: string;
  status?: string | number;
  helper?: string;
}) {
  return (
    <div className="border-b border-[color:var(--merchant-line)] px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="merchant-overline">{metricLabel}</p>
      <div className="mt-2">
        <StatusBadge tone={statusTone(String(status || ""))}>{label(status)}</StatusBadge>
      </div>
      {helper ? <p className="mt-2 text-sm text-[color:var(--merchant-muted)]">{helper}</p> : null}
    </div>
  );
}

function ReportActions({
  runId,
  report,
  markdown,
}: {
  runId: string;
  report: MerchantFacingValidationReport | null;
  markdown: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={generateReportDraftAction}>
        <input type="hidden" name="runId" value={runId} />
        <input type="hidden" name="regenerate" value={report ? "true" : "false"} />
        <ActionButton icon={report ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}>
          {report ? "Regenerate report draft" : "Generate report draft"}
        </ActionButton>
      </form>
      {report ? <CopyMarkdownButton markdown={markdown} /> : null}
      {report ? (
        <>
          <form action={updateReportDraftStatusAction}>
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="report_status" value="reviewed" />
            <input type="hidden" name="reviewed_by" value="internal" />
            <ActionButton icon={<CheckCircle2 className="h-4 w-4" />}>
              Mark reviewed
            </ActionButton>
          </form>
          <form action={updateReportDraftStatusAction}>
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="report_status" value="approved_to_share" />
            <input type="hidden" name="approved_by" value="internal" />
            <ActionButton icon={<CheckCircle2 className="h-4 w-4" />}>
              Mark approved_to_share
            </ActionButton>
          </form>
        </>
      ) : null}
    </div>
  );
}

function SafetyWarnings({ report }: { report: MerchantFacingValidationReport }) {
  return (
    <SurfaceCard
      title="Safety Warnings"
      description="Internal review checks before sharing this merchant-facing draft."
    >
      <div className="divide-y divide-[color:var(--merchant-line)]">
        {report.safety_warnings.map((warning) => (
          <div key={warning.warning_type} className="flex gap-3 px-5 py-4">
            {warning.severity === "warning" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 text-[color:var(--merchant-warning)]" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 text-[color:var(--merchant-muted)]" />
            )}
            <div>
              <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                {label(warning.warning_type)}
              </p>
              <p className="text-sm text-[color:var(--merchant-muted)]">{warning.message}</p>
            </div>
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}

function ReportPreview({
  run,
  report,
}: {
  run: ProductionValidationRun;
  report: MerchantFacingValidationReport;
}) {
  const readiness = report.path_readiness;

  return (
    <div className="space-y-6">
      <SurfaceCard title="Report Header">
        <dl className="divide-y divide-[color:var(--merchant-line)]">
          <FieldRow label="Merchant" value={report.tested_product.merchant_name} />
          <FieldRow label="Product" value={report.tested_product.product_name} />
          <FieldRow label="Validation run id" value={<code>{report.production_validation_run_id}</code>} />
          <FieldRow
            label="Report status"
            value={<StatusBadge tone={statusTone(report.report_status)}>{label(report.report_status)}</StatusBadge>}
          />
          <FieldRow label="Created" value={formatDate(report.created_at)} />
          <FieldRow label="Updated" value={formatDate(report.updated_at)} />
          <FieldRow label="Reviewed" value={formatDate(report.reviewed_at)} />
          <FieldRow label="Approved to share" value={formatDate(report.approved_to_share_at)} />
        </dl>
      </SurfaceCard>

      <SurfaceCard title="Executive Summary">
        <p className="px-5 py-4 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
          {report.executive_summary}
        </p>
      </SurfaceCard>

      <SurfaceCard title="Discovery vs Readiness">
        <p className="px-5 py-4 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
          {report.discovery_vs_readiness}
        </p>
      </SurfaceCard>

      <SurfaceCard
        title="Discoverability"
        description="Discoverability answers whether users can find the product or buying path. Contextual attribution is reported separately."
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-5">
          <MetricStatus
            label="Organic product discovery"
            status={readiness.discoverability.organic_product_discovery}
          />
          <MetricStatus
            label="Merchant PDP discovery"
            status={readiness.discoverability.merchant_pdp_discovery}
          />
          <MetricStatus
            label="Pivota PDP discovery"
            status={readiness.discoverability.pivota_pdp_discovery}
          />
          <MetricStatus
            label="Buying path discovery"
            status={readiness.discoverability.buying_path_discovery}
          />
          <MetricStatus
            label="Competitor dominance"
            status={readiness.discoverability.competitor_dominance}
          />
        </div>
        <p className="border-t border-[color:var(--merchant-line)] px-5 py-4 text-sm text-[color:var(--merchant-muted)]">
          {readiness.discoverability.summary}
        </p>
      </SurfaceCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SurfaceCard title="Merchant-Owned Path">
          <dl>
            <FieldRow label="Merchant PDP URL" value={readiness.merchant_owned_path.merchant_pdp_url} />
            <FieldRow label="PDP preflight" value={label(readiness.merchant_owned_path.preflight_status)} />
            <FieldRow label="Merchant attribution" value={label(readiness.merchant_owned_path.attribution_status)} />
            <FieldRow label="Merchant offer source" value={label(readiness.merchant_owned_path.offer_source_status)} />
            <FieldRow label="Merchant checkout path" value={label(readiness.merchant_owned_path.checkout_path_status)} />
            <FieldRow label="Status" value={readiness.merchant_owned_path.summary} />
          </dl>
        </SurfaceCard>

        <SurfaceCard title="Pivota Agent-Facing Path">
          <dl>
            <FieldRow label="Pivota PDP URL" value={readiness.pivota_agent_facing_path.pivota_pdp_url} />
            <FieldRow label="Pivota preflight" value={label(readiness.pivota_agent_facing_path.preflight_status)} />
            <FieldRow label="Pivota attribution" value={label(readiness.pivota_agent_facing_path.attribution_status)} />
            <FieldRow label="Pivota offer state" value={label(readiness.pivota_agent_facing_path.offer_state_status)} />
            <FieldRow label="Pivota checkout handoff" value={label(readiness.pivota_agent_facing_path.checkout_handoff_status)} />
            <FieldRow label="Status" value={readiness.pivota_agent_facing_path.summary} />
          </dl>
        </SurfaceCard>
      </div>

      <SurfaceCard title="Readiness">
        <div className="grid sm:grid-cols-3">
          <MetricStatus
            label="Product/SKU readiness"
            status={readiness.product_sku_readiness.status}
            helper={readiness.product_sku_readiness.summary}
          />
          <MetricStatus
            label="Offer readiness"
            status={readiness.offer_readiness.status}
            helper={readiness.offer_readiness.summary}
          />
          <MetricStatus
            label="Checkout readiness"
            status={readiness.checkout_readiness.status}
            helper={readiness.checkout_readiness.summary}
          />
        </div>
      </SurfaceCard>

      <SurfaceCard title="Blockers and Recommended Fixes">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[color:var(--merchant-line)] text-xs uppercase tracking-[0.08em] text-[color:var(--merchant-muted)]">
              <tr>
                <th className="px-5 py-3">Blocker</th>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">Affected layer</th>
                <th className="px-5 py-3">Root cause</th>
                <th className="px-5 py-3">Recommended action</th>
                <th className="px-5 py-3">Retest plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--merchant-line)]">
              {report.blockers.length ? (
                report.blockers.map((blocker) => (
                  <tr key={`${blocker.blocker_type}-${blocker.issue_id || blocker.affected_layer}`}>
                    <td className="px-5 py-4 font-medium text-[color:var(--merchant-ink)]">{label(blocker.blocker_type)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge tone={statusTone(blocker.severity)}>{blocker.severity}</StatusBadge>
                    </td>
                    <td className="px-5 py-4">{label(blocker.affected_layer)}</td>
                    <td className="px-5 py-4 text-[color:var(--merchant-muted)]">{blocker.root_cause || "No root cause recorded"}</td>
                    <td className="px-5 py-4 text-[color:var(--merchant-muted-strong)]">{blocker.recommended_action}</td>
                    <td className="px-5 py-4 text-[color:var(--merchant-muted)]">{report.retest_plan[0]}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-5 py-6 text-[color:var(--merchant-muted)]" colSpan={6}>
                    No blocker was generated for this validation run.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-[color:var(--merchant-line)] px-5 py-4">
          <h4 className="text-sm font-semibold text-[color:var(--merchant-ink)]">
            Recommended actions
          </h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {report.recommended_fixes.map((fix) => (
              <div key={`${fix.title}-${fix.target_layer}`} className="rounded-md border border-[color:var(--merchant-line)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[color:var(--merchant-ink)]">{fix.title}</p>
                  <StatusBadge tone={fix.approval_required ? "warning" : "neutral"}>
                    {fix.approval_required ? "Approval required" : "No merchant approval required"}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm text-[color:var(--merchant-muted)]">
                  Owner: {label(fix.owner_type)} {fix.owner_team ? `- ${fix.owner_team}` : ""}
                </p>
                <p className="mt-1 text-sm text-[color:var(--merchant-muted)]">
                  Target layer: {label(fix.target_layer)}
                </p>
                {fix.expected_impact ? (
                  <p className="mt-1 text-sm text-[color:var(--merchant-muted)]">
                    Expected impact: {fix.expected_impact}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard title="What V1 Does Not Prove">
        <div className="grid gap-2 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          {report.v1_does_not_prove.map((item) => (
            <div key={item} className="rounded-md border border-[color:var(--merchant-line)] px-3 py-2 text-sm text-[color:var(--merchant-muted-strong)]">
              {item}
            </div>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="Usage Preview"
        description="Merchant reporting shows credits only, not token-level provider costs."
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-5">
          <MetricStatus label="AI Test Credits" status={report.usage_statement.ai_test_credits} />
          <MetricStatus label="Product Understanding Credits" status={report.usage_statement.product_understanding_credits} />
          <MetricStatus label="Offer Verification Credits" status={report.usage_statement.offer_verification_credits} />
          <MetricStatus label="Checkout Verification Credits" status={report.usage_statement.checkout_verification_credits} />
          <MetricStatus label="Billing Status" status={report.usage_statement.billing_status} />
        </div>
        <p className="border-t border-[color:var(--merchant-line)] px-5 py-4 text-sm text-[color:var(--merchant-muted)]">
          {report.usage_statement.merchant_copy}
        </p>
      </SurfaceCard>

      <SafetyWarnings report={report} />

      <SurfaceCard title="Source Summary">
        <dl>
          <FieldRow label="Run status" value={run.status} />
          <FieldRow label="Issue ids" value={report.source_summary.issue_ids.join(", ") || "None"} />
          <FieldRow label="Product diagnoses" value={report.source_summary.product_diagnosis_ids.join(", ") || "None"} />
          <FieldRow label="Offer diagnoses" value={report.source_summary.offer_diagnosis_ids.join(", ") || "None"} />
          <FieldRow label="Checkout diagnoses" value={report.source_summary.checkout_diagnosis_ids.join(", ") || "None"} />
          <FieldRow label="GMV snapshot" value={report.source_summary.gmv_assurance_snapshot_id || "None"} />
        </dl>
      </SurfaceCard>
    </div>
  );
}

export default async function InternalReportPreviewPage({ params }: PageProps) {
  const { runId } = await params;
  const previewEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION === "true";

  if (!previewEnabled) {
    return (
      <main className="min-h-screen bg-[color:var(--merchant-canvas)] px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <SurfaceCard title="Internal report preview disabled">
            <p className="px-5 py-4 text-sm text-[color:var(--merchant-muted)]">
              ENABLE_INTERNAL_PRODUCTION_VALIDATION must be enabled before this internal page can render.
            </p>
          </SurfaceCard>
        </div>
      </main>
    );
  }

  const data = await withAgentCenterRepositorySession(async () => {
    try {
      const run = new ProductionValidationRunService().get(runId);
      const reportService = new MerchantFacingReportService();
      const report = reportService.latestForRun(runId);
      return {
        run,
        report,
        markdown: report ? reportService.toMarkdown(report) : "",
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  return (
    <main className="min-h-screen bg-[color:var(--merchant-canvas)] px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <PageHeader
          eyebrow="Internal Pivota Operators Only"
          title="Merchant Validation Report Preview"
          description="Review the generated merchant-facing report draft before any external sharing. Raw debug payloads are intentionally excluded."
          actions={
            <ReportActions
              runId={runId}
              report={data.report}
              markdown={data.markdown}
            />
          }
        />

        {data.report ? (
          <ReportPreview run={data.run} report={data.report} />
        ) : (
          <SurfaceCard title="Report draft missing">
            <EmptyState
              icon={FileText}
              title="Generate report draft"
              description="This production validation run does not have a merchant-facing report draft yet. Generate one from the completed validation outputs before review."
              action={
                <form action={generateReportDraftAction}>
                  <input type="hidden" name="runId" value={runId} />
                  <ActionButton icon={<FileText className="h-4 w-4" />}>
                    Generate report draft
                  </ActionButton>
                </form>
              }
            />
          </SurfaceCard>
        )}
      </div>
    </main>
  );
}
