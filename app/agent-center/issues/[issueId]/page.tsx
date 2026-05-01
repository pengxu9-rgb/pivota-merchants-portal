"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, RotateCcw, Send, XCircle } from "lucide-react";
import {
  MerchantButton,
  PageHeader,
  SurfaceCard,
} from "@/components/ui/merchant-primitives";
import {
  agentFetch,
  FixTargetBadge,
  IssueTypeBadge,
  MetricTile,
} from "@/components/agent-center/agent-center-ui";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-2xl bg-[#1f2937] p-4 text-xs leading-5 text-white">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function IssueDetailPage() {
  const params = useParams<{ issueId: string }>();
  const router = useRouter();
  const [issue, setIssue] = useState<any>(null);
  const [retestPreparation, setRetestPreparation] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function loadIssue(issueId: string) {
    const payload = await agentFetch<{ issue: any }>(`/api/agent-center/issues/${issueId}`);
    setIssue(payload.issue);
  }

  useEffect(() => {
    if (!params.issueId) return;
    void loadIssue(params.issueId);
  }, [params.issueId]);

  async function mutate(action: "approve" | "ignore" | "assign") {
    if (!issue) return;
    setLoading(true);
    const payload = await agentFetch<{ issue: any }>(
      `/api/agent-center/issues/${issue.id}/${action}`,
      { method: "POST" }
    );
    setIssue(payload.issue);
    setLoading(false);
  }

  async function retest() {
    if (!issue) return;
    setLoading(true);
    const payload = await agentFetch<{ verification: any }>(
      `/api/agent-center/issues/${issue.id}/retest`,
      { method: "POST" }
    );
    router.push(`/agent-center/verification/${payload.verification.id}`);
  }

  async function prepareRetest() {
    if (!issue) return;
    setLoading(true);
    const payload = await agentFetch<{ retest_preparation: any }>(
      `/api/agent-center/issues/${issue.id}/retest-preparation`,
      { method: "POST" }
    );
    setRetestPreparation(payload.retest_preparation);
    setLoading(false);
  }

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Issue Detail"
        title={issue?.issue_type?.replace(/_/g, " ") || "Agentic GMV Issue"}
        description={issue?.root_cause || "Evidence, fix target, recommended patches, and retest plan."}
        actions={
          issue ? (
            <>
              <MerchantButton
                icon={CheckCircle2}
                variant="secondary"
                onClick={() => mutate("approve")}
                disabled={loading}
              >
                Approve
              </MerchantButton>
              <MerchantButton
                icon={Send}
                variant="secondary"
                onClick={() => mutate("assign")}
                disabled={loading}
              >
                Assign
              </MerchantButton>
              <MerchantButton
                icon={XCircle}
                variant="ghost"
                onClick={() => mutate("ignore")}
                disabled={loading}
              >
                Ignore
              </MerchantButton>
              <MerchantButton icon={RotateCcw} onClick={retest} disabled={loading}>
                Retest
              </MerchantButton>
              <MerchantButton
                icon={ClipboardList}
                variant="secondary"
                onClick={prepareRetest}
                disabled={loading}
              >
                Prepare Retest
              </MerchantButton>
            </>
          ) : null
        }
      />

      <SurfaceCard strong>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Status" value={issue?.status?.replace(/_/g, " ") || "..."} />
          <MetricTile label="Severity" value={issue?.severity || "..."} />
          <MetricTile
            label="Visibility"
            value={`${Math.round((issue?.evidence?.visibility_rate || 0) * 100)}%`}
            tone="warning"
          />
          <MetricTile
            label="GMV risk"
            value={`${issue?.estimated_gmv_at_risk || 0} (${issue?.estimated_gmv_at_risk_confidence || "low"})`}
            tone="critical"
          />
        </div>
      </SurfaceCard>

      <SurfaceCard title="Merchant Summary">
        <div className="grid gap-4 px-5 py-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="merchant-overline">Summary</p>
            <p className="mt-2 text-sm text-[color:var(--merchant-ink)]">
              {issue?.merchant_facing_summary || "No summary available."}
            </p>
          </div>
          <div>
            <p className="merchant-overline">GMV estimate method</p>
            <p className="mt-2 text-sm text-[color:var(--merchant-muted)]">
              {issue?.gmv_estimation_method || "Directional V1 estimate."}
            </p>
          </div>
        </div>
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <SurfaceCard title="Evidence">
          <div className="space-y-4 px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              {issue ? <IssueTypeBadge type={issue.issue_type} /> : null}
              {issue?.fix_targets?.map((target: string) => (
                <FixTargetBadge key={target} target={target} />
              ))}
            </div>
            <JsonBlock value={issue?.evidence || {}} />
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="merchant-overline">Query cluster</p>
                <p className="mt-1 text-[color:var(--merchant-ink)]">
                  {issue?.affected_query_clusters?.join(", ") || "..."}
                </p>
              </div>
              <div>
                <p className="merchant-overline">Product entity</p>
                <p className="mt-1 text-[color:var(--merchant-ink)]">
                  {issue?.affected_product_entities?.join(", ") || "..."}
                </p>
              </div>
              <div>
                <p className="merchant-overline">SKU</p>
                <p className="mt-1 text-[color:var(--merchant-ink)]">
                  {issue?.affected_skus?.join(", ") || "..."}
                </p>
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard title="Recommended Action">
          <div className="space-y-5 px-5 py-5">
            <div>
              <p className="merchant-overline">Root cause</p>
              <p className="mt-2 text-sm text-[color:var(--merchant-ink)]">
                {issue?.root_cause}
              </p>
            </div>
            <div>
              <p className="merchant-overline">Action</p>
              <p className="mt-2 text-sm text-[color:var(--merchant-ink)]">
                {issue?.recommended_action}
              </p>
            </div>
            <div>
              <p className="merchant-overline">Verification plan</p>
              <JsonBlock value={issue?.verification_plan || {}} />
            </div>
          </div>
        </SurfaceCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SurfaceCard title="Merchant Source Patch">
          <div className="px-5 py-5">
            <JsonBlock value={issue?.merchant_source_patch || {}} />
          </div>
        </SurfaceCard>
        <SurfaceCard title="Pivota Unified PDP Patch">
          <div className="px-5 py-5">
            <JsonBlock value={issue?.pivota_unified_pdp_patch || {}} />
          </div>
        </SurfaceCard>
      </div>

      {retestPreparation ? (
        <SurfaceCard title="Retest Preparation">
          <div className="px-5 py-5">
            <JsonBlock value={retestPreparation} />
          </div>
        </SurfaceCard>
      ) : null}
    </main>
  );
}
