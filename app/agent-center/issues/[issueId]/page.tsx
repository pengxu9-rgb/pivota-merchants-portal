"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  ScoreBar,
} from "@/components/agent-center/agent-center-ui";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-2xl bg-[#1f2937] p-4 text-xs leading-5 text-white">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function label(value: string) {
  return value.replace(/_/g, " ");
}

function listItems(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function estimatedRetestCredits(issue: any, preparation: any) {
  if (preparation?.estimated_credits !== undefined) return preparation.estimated_credits;
  const clusters = issue?.affected_query_clusters?.length || 1;
  const providers = issue?.verification_plan?.providers?.length || 1;
  const templates = issue?.verification_plan?.prompt_templates?.length || 1;
  return clusters * providers * templates * 2;
}

function deltaLabel(value: number | undefined) {
  const delta = Number(value || 0);
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function ComparisonRow({
  labelText,
  before,
  after,
  delta,
  inverse,
}: {
  labelText: string;
  before: number;
  after: number;
  delta: number;
  inverse?: boolean;
}) {
  const improved = inverse ? delta < 0 : delta > 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium text-[color:var(--merchant-ink)]">{labelText}</span>
        <span
          className={
            improved
              ? "font-semibold text-[color:var(--merchant-success)]"
              : "font-semibold text-[color:var(--merchant-muted)]"
          }
        >
          {before}% to {after}% ({deltaLabel(delta)})
        </span>
      </div>
      <ScoreBar label="Before" value={before} inverse={inverse} />
      <ScoreBar label="After" value={after} inverse={inverse} />
    </div>
  );
}

function NarrativeSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="merchant-overline">{title}</p>
      <div className="mt-2 text-sm leading-6 text-[color:var(--merchant-ink)]">
        {children}
      </div>
    </div>
  );
}

export default function IssueDetailPage() {
  const params = useParams<{ issueId: string }>();
  const [issue, setIssue] = useState<any>(null);
  const [verification, setVerification] = useState<any>(null);
  const [retestPreparation, setRetestPreparation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [retestState, setRetestState] = useState("idle");

  async function loadIssue(issueId: string) {
    const payload = await agentFetch<{ issue: any }>(`/api/agent-center/issues/${issueId}`);
    setIssue(payload.issue);
    const verificationPayload = await agentFetch<{ verification: any }>(
      `/api/agent-center/issues/${issueId}/verification`
    );
    setVerification(verificationPayload.verification);
  }

  useEffect(() => {
    if (!params.issueId) return;
    void loadIssue(params.issueId);
  }, [params.issueId]);

  async function mutate(action: "approve" | "ignore" | "assign") {
    if (!issue) return;
    setLoading(true);
    try {
      const payload = await agentFetch<{ issue: any }>(
        `/api/agent-center/issues/${issue.id}/${action}`,
        { method: "POST" }
      );
      setIssue(payload.issue);
    } finally {
      setLoading(false);
    }
  }

  async function retest() {
    if (!issue) return;
    setLoading(true);
    setRetestState("running");
    try {
      const payload = await agentFetch<{ verification: any }>(
        `/api/agent-center/issues/${issue.id}/retest`,
        { method: "POST" }
      );
      setVerification(payload.verification);
      setRetestState("completed");
      await loadIssue(issue.id);
    } catch {
      setRetestState("failed");
    } finally {
      setLoading(false);
    }
  }

  async function prepareRetest() {
    if (!issue) return;
    setLoading(true);
    setRetestState("preparing");
    try {
      const payload = await agentFetch<{ retest_preparation: any }>(
        `/api/agent-center/issues/${issue.id}/retest-preparation`,
        { method: "POST" }
      );
      setRetestPreparation(payload.retest_preparation);
      setRetestState("idle");
    } finally {
      setLoading(false);
    }
  }

  const narrative = issue?.merchant_facing_narrative || {};
  const beforeScores = verification?.before_scores?.aggregate_scores;
  const afterScores = verification?.after_scores?.aggregate_scores;
  const scoreDelta = verification?.score_delta || {};

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Issue Detail"
        title={issue?.issue_type ? label(issue.issue_type) : "Agentic GMV Issue"}
        description={issue?.merchant_facing_summary || "Evidence, fix target, recommended patches, and retest plan."}
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
              <MerchantButton
                icon={ClipboardList}
                variant="secondary"
                onClick={prepareRetest}
                disabled={loading}
              >
                Prepare Retest
              </MerchantButton>
              <MerchantButton icon={RotateCcw} onClick={retest} disabled={loading}>
                Run Retest
              </MerchantButton>
            </>
          ) : null
        }
      />

      <SurfaceCard strong>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Status" value={issue?.status ? label(issue.status) : "..."} />
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

      <SurfaceCard title="Merchant Narrative">
        <div className="grid gap-5 px-5 py-5 lg:grid-cols-2">
          <NarrativeSection title="What happened">
            {narrative.what_happened || issue?.merchant_facing_summary || "..."}
          </NarrativeSection>
          <NarrativeSection title="What AI recommended instead">
            {narrative.what_ai_recommended_instead || "No replacement recommendation captured."}
          </NarrativeSection>
          <NarrativeSection title="Why this likely happened">
            {narrative.why_this_likely_happened || issue?.root_cause || "..."}
          </NarrativeSection>
          <NarrativeSection title="Where to fix">
            <div className="flex flex-wrap gap-2">
              {issue?.fix_targets?.map((target: string) => (
                <FixTargetBadge key={target} target={target} />
              ))}
            </div>
            <p className="mt-2">{narrative.where_to_fix}</p>
          </NarrativeSection>
          <NarrativeSection title="Recommended merchant PDP changes">
            <ul className="list-disc space-y-1 pl-5">
              {listItems(narrative.recommended_merchant_pdp_changes).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </NarrativeSection>
          <NarrativeSection title="Recommended Pivota PDP changes">
            <ul className="list-disc space-y-1 pl-5">
              {listItems(narrative.recommended_pivota_pdp_changes).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </NarrativeSection>
          <div className="lg:col-span-2">
            <NarrativeSection title="How Pivota will verify the fix">
              {narrative.how_pivota_will_verify_the_fix ||
                "Pivota will retest the same query clusters and compare before/after scores."}
            </NarrativeSection>
          </div>
        </div>
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <SurfaceCard title="Issue Scope">
          <div className="space-y-4 px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              {issue ? <IssueTypeBadge type={issue.issue_type} /> : null}
              {issue?.fix_targets?.map((target: string) => (
                <FixTargetBadge key={target} target={target} />
              ))}
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="merchant-overline">Query cluster</p>
                <p className="mt-1 text-[color:var(--merchant-ink)]">
                  {issue?.evidence?.query_cluster || issue?.affected_query_clusters?.join(", ") || "..."}
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
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="merchant-overline">Merchant mentions</p>
                <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
                  {issue?.evidence?.merchant_product_mentions || 0} /{" "}
                  {issue?.evidence?.total_test_runs || 0}
                </p>
              </div>
              <div>
                <p className="merchant-overline">Competitor mentions</p>
                <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
                  {issue?.evidence?.competitor_mentions || 0}
                </p>
              </div>
              <div>
                <p className="merchant-overline">GMV method</p>
                <p className="mt-1 text-[color:var(--merchant-muted)]">
                  {issue?.gmv_estimation_method || "Directional V1 estimate."}
                </p>
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard title="Retest Readiness">
          <div className="space-y-5 px-5 py-5">
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="merchant-overline">Query clusters</p>
                <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
                  {retestPreparation?.query_cluster_ids?.length ||
                    issue?.affected_query_clusters?.length ||
                    0}
                </p>
              </div>
              <div>
                <p className="merchant-overline">Provider</p>
                <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
                  {(retestPreparation?.providers || issue?.verification_plan?.providers || []).join(", ") || "..."}
                </p>
              </div>
              <div>
                <p className="merchant-overline">Repetitions</p>
                <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
                  {retestPreparation?.repetitions || 2}
                </p>
              </div>
              <div>
                <p className="merchant-overline">Estimated credits</p>
                <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
                  {estimatedRetestCredits(issue, retestPreparation)}
                </p>
              </div>
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="merchant-overline">Remaining credits</p>
                <p className="mt-1 text-[color:var(--merchant-ink)]">
                  {retestPreparation?.credits_remaining_before_retest ?? "..."}
                </p>
              </div>
              <div>
                <p className="merchant-overline">Estimated overage</p>
                <p className="mt-1 text-[color:var(--merchant-ink)]">
                  {retestPreparation?.estimated_overage_credits ?? 0}
                </p>
              </div>
              <div>
                <p className="merchant-overline">Retest progress</p>
                <p className="mt-1 text-[color:var(--merchant-ink)]">
                  {label(retestState)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <MerchantButton
                icon={ClipboardList}
                variant="secondary"
                onClick={prepareRetest}
                disabled={loading}
              >
                Prepare Retest
              </MerchantButton>
              <MerchantButton icon={RotateCcw} onClick={retest} disabled={loading}>
                Run Retest
              </MerchantButton>
            </div>
          </div>
        </SurfaceCard>
      </div>

      {verification ? (
        <SurfaceCard title="Before / After Comparison">
          <div className="space-y-6 px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Product visibility delta"
                value={deltaLabel(scoreDelta.product_entity_visibility_score ?? scoreDelta.visibility_score)}
                tone={((scoreDelta.product_entity_visibility_score ?? scoreDelta.visibility_score) || 0) > 0 ? "success" : "neutral"}
              />
              <MetricTile
                label="Substitution delta"
                value={deltaLabel(scoreDelta.competitor_substitution_score)}
                tone={(scoreDelta.competitor_substitution_score || 0) < 0 ? "success" : "warning"}
              />
              <MetricTile
                label="GMV risk before"
                value={verification.before_scores?.estimated_gmv_at_risk || 0}
                tone="critical"
              />
              <MetricTile
                label="GMV risk after"
                value={verification.after_scores?.estimated_gmv_at_risk || 0}
                tone="success"
              />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <ComparisonRow
                labelText="Product Visibility"
                before={beforeScores?.product_entity_visibility_score ?? beforeScores?.visibility_score ?? 0}
                after={afterScores?.product_entity_visibility_score ?? afterScores?.visibility_score ?? 0}
                delta={scoreDelta.product_entity_visibility_score ?? scoreDelta.visibility_score ?? 0}
              />
              <ComparisonRow
                labelText="Merchant Store Visibility"
                before={beforeScores?.merchant_store_visibility_score || 0}
                after={afterScores?.merchant_store_visibility_score || 0}
                delta={scoreDelta.merchant_store_visibility_score || 0}
              />
              <ComparisonRow
                labelText="Pivota Channel Visibility"
                before={beforeScores?.pivota_pdp_visibility_score || 0}
                after={afterScores?.pivota_pdp_visibility_score || 0}
                delta={scoreDelta.pivota_pdp_visibility_score || 0}
              />
              <ComparisonRow
                labelText="Competitor substitution"
                before={beforeScores?.competitor_substitution_score || 0}
                after={afterScores?.competitor_substitution_score || 0}
                delta={scoreDelta.competitor_substitution_score || 0}
                inverse
              />
              <ComparisonRow
                labelText="Attribute readiness"
                before={beforeScores?.attribute_readiness_score || 0}
                after={afterScores?.attribute_readiness_score || 0}
                delta={scoreDelta.attribute_readiness_score || 0}
              />
              <ComparisonRow
                labelText="Pivota PDP readiness"
                before={beforeScores?.pivota_pdp_readiness_score || 0}
                after={afterScores?.pivota_pdp_readiness_score || 0}
                delta={scoreDelta.pivota_pdp_readiness_score || 0}
              />
            </div>
            <p className="text-sm text-[color:var(--merchant-muted)]">
              Method: {verification.after_scores?.gmv_estimation_method || "Directional V1 estimate."} Confidence:{" "}
              {verification.after_scores?.estimated_gmv_at_risk_confidence || "low"}.
            </p>
          </div>
        </SurfaceCard>
      ) : null}

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

      <SurfaceCard title="Verification Plan">
        <div className="px-5 py-5">
          <JsonBlock value={issue?.verification_plan || {}} />
        </div>
      </SurfaceCard>
    </main>
  );
}
