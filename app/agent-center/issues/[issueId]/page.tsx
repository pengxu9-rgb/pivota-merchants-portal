"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  CreditCard,
  RotateCcw,
  Send,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import {
  MerchantButton,
  PageHeader,
  StatusBadge,
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

function patchByType(diagnosis: any, patchType: string) {
  return diagnosis?.patch_recommendations?.find(
    (recommendation: any) => recommendation.patch_type === patchType
  )?.patch;
}

function attributeGapLabels(comparisons: any[]) {
  return (comparisons || []).flatMap((comparison) =>
    (comparison.findings || []).map(
      (finding: any) =>
        `${label(finding.attribute)}: ${finding.recommendation || finding.expected}`
    )
  );
}

function findingEvidence(findings: any[], emptyText: string) {
  const items = (findings || [])
    .filter((finding) => finding.finding_type !== "no_issue")
    .map((finding) => finding.evidence || label(finding.finding_type));
  return items.length ? items : [emptyText];
}

function offerPatchByType(diagnosis: any, patchType: string) {
  return diagnosis?.patch_recommendations?.find(
    (recommendation: any) => recommendation.patch_type === patchType
  )?.patch;
}

function offerFindingEvidence(
  diagnosis: any,
  findingTypes: string[],
  emptyText: string
): string[] {
  const findings = (diagnosis?.offer_layer_findings || []).flatMap(
    (comparison: any) => comparison.findings || []
  );
  const items = findings
    .filter((finding: any) => findingTypes.includes(finding.finding_type))
    .map((finding: any) => finding.evidence || label(finding.finding_type));
  return items.length ? items : [emptyText];
}

function latestOfferComparison(diagnosis: any) {
  return diagnosis?.offer_layer_findings?.[0] || {};
}

function checkoutPatchByType(diagnosis: any, patchType: string) {
  return diagnosis?.patch_recommendations?.find(
    (recommendation: any) => recommendation.patch_type === patchType
  )?.patch;
}

function checkoutFindingEvidence(
  diagnosis: any,
  findingTypes: string[],
  emptyText: string
): string[] {
  const findings = (diagnosis?.checkout_layer_findings || []).flatMap(
    (comparison: any) => comparison.findings || []
  );
  const items = findings
    .filter((finding: any) => findingTypes.includes(finding.finding_type))
    .map((finding: any) => finding.evidence || label(finding.finding_type));
  return items.length ? items : [emptyText];
}

function latestCheckoutComparison(diagnosis: any) {
  return diagnosis?.checkout_layer_findings?.[0] || {};
}

function isDiscoveryResolutionBlocker(issue: any, resolutionPlan: any) {
  return ["organic_product_not_discovered", "competitor_dominance"].includes(
    resolutionPlan?.blocker_type || issue?.issue_type
  );
}

function aggregateScore(issue: any, key: string) {
  return issue?.evidence?.aggregate_scores?.[key];
}

function scoreText(value: unknown) {
  return typeof value === "number" ? `${Math.round(value)}%` : label(String(value || "not tested"));
}

function passFail(value: unknown, passAt = 80, inverse = false) {
  if (typeof value !== "number") return "not tested";
  if (inverse) return value <= 20 ? "passed" : "needs work";
  return value >= passAt ? "passed" : "needs work";
}

function contextualAttributionSummary(issue: any) {
  const product = aggregateScore(issue, "product_entity_visibility_score");
  const merchant = aggregateScore(issue, "merchant_store_visibility_score");
  const pivota = aggregateScore(issue, "pivota_pdp_visibility_score");
  return `Product visibility ${passFail(product)} (${scoreText(product)}), merchant attribution ${passFail(merchant)} (${scoreText(merchant)}), Pivota attribution ${passFail(pivota)} (${scoreText(pivota)}).`;
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
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [offerDiagnosis, setOfferDiagnosis] = useState<any>(null);
  const [checkoutDiagnosis, setCheckoutDiagnosis] = useState<any>(null);
  const [resolutionPlan, setResolutionPlan] = useState<any>(null);
  const [retestPreparation, setRetestPreparation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [retestState, setRetestState] = useState("idle");
  const [diagnosisState, setDiagnosisState] = useState("idle");
  const [offerDiagnosisState, setOfferDiagnosisState] = useState("idle");
  const [checkoutDiagnosisState, setCheckoutDiagnosisState] = useState("idle");
  const [resolutionState, setResolutionState] = useState("idle");

  async function loadIssue(issueId: string) {
    const payload = await agentFetch<{ issue: any }>(`/api/agent-center/issues/${issueId}`);
    setIssue(payload.issue);
    const verificationPayload = await agentFetch<{ verification: any }>(
      `/api/agent-center/issues/${issueId}/verification`
    );
    setVerification(verificationPayload.verification);
    const diagnosisPayload = await agentFetch<{ diagnosis: any }>(
      `/api/agent-center/issues/${issueId}/product-diagnosis`
    );
    setDiagnosis(diagnosisPayload.diagnosis);
    const offerDiagnosisPayload = await agentFetch<{ diagnosis: any }>(
      `/api/agent-center/issues/${issueId}/offer-diagnosis`
    );
    setOfferDiagnosis(offerDiagnosisPayload.diagnosis);
    const checkoutDiagnosisPayload = await agentFetch<{ diagnosis: any }>(
      `/api/agent-center/issues/${issueId}/checkout-diagnosis`
    );
    setCheckoutDiagnosis(checkoutDiagnosisPayload.diagnosis);
    const resolutionPayload = await agentFetch<{ resolution_plan: any }>(
      `/api/agent-center/issues/${issueId}/resolution-plan`
    );
    setResolutionPlan(resolutionPayload.resolution_plan);
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

  async function runProductDiagnosis(action = "product-diagnosis") {
    if (!issue) return;
    setLoading(true);
    setDiagnosisState(action === "product-diagnosis" ? "running" : "updating");
    try {
      const payload = await agentFetch<{ diagnosis: any; issue: any }>(
        `/api/agent-center/issues/${issue.id}/${action}`,
        { method: "POST" }
      );
      setDiagnosis(payload.diagnosis);
      if (payload.issue) setIssue(payload.issue);
      setDiagnosisState("completed");
      await loadIssue(issue.id);
    } catch {
      setDiagnosisState("failed");
    } finally {
      setLoading(false);
    }
  }

  async function runOfferDiagnosis(action = "offer-diagnosis") {
    if (!issue) return;
    setLoading(true);
    setOfferDiagnosisState(action === "offer-diagnosis" ? "running" : "updating");
    try {
      const payload = await agentFetch<{ diagnosis: any; issue: any }>(
        `/api/agent-center/issues/${issue.id}/${action}`,
        { method: "POST" }
      );
      setOfferDiagnosis(payload.diagnosis);
      if (payload.issue) setIssue(payload.issue);
      setOfferDiagnosisState("completed");
      await loadIssue(issue.id);
    } catch {
      setOfferDiagnosisState("failed");
    } finally {
      setLoading(false);
    }
  }

  async function runCheckoutDiagnosis(action = "checkout-diagnosis") {
    if (!issue) return;
    setLoading(true);
    setCheckoutDiagnosisState(action === "checkout-diagnosis" ? "running" : "updating");
    try {
      const payload = await agentFetch<{ diagnosis: any; issue: any }>(
        `/api/agent-center/issues/${issue.id}/${action}`,
        { method: "POST" }
      );
      setCheckoutDiagnosis(payload.diagnosis);
      if (payload.issue) setIssue(payload.issue);
      setCheckoutDiagnosisState("completed");
      await loadIssue(issue.id);
    } catch {
      setCheckoutDiagnosisState("failed");
    } finally {
      setLoading(false);
    }
  }

  async function generateResolutionPlan() {
    if (!issue) return;
    setLoading(true);
    setResolutionState("generating");
    try {
      const payload = await agentFetch<{ resolution_plan: any }>(
        `/api/agent-center/issues/${issue.id}/resolution-plan`,
        { method: "POST" }
      );
      setResolutionPlan(payload.resolution_plan);
      setResolutionState("completed");
    } catch {
      setResolutionState("failed");
    } finally {
      setLoading(false);
    }
  }

  async function approveResolutionAction(actionId: string) {
    if (!issue) return;
    setLoading(true);
    setResolutionState("approving");
    try {
      const payload = await agentFetch<{ resolution_plan: any }>(
        `/api/agent-center/issues/${issue.id}/resolution-plan/actions/${actionId}/approve`,
        { method: "POST" }
      );
      setResolutionPlan(payload.resolution_plan);
      setResolutionState("completed");
    } finally {
      setLoading(false);
    }
  }

  async function applyResolutionAction(actionId: string) {
    if (!issue) return;
    setLoading(true);
    setResolutionState("applying");
    try {
      const payload = await agentFetch<{ resolution_plan: any }>(
        `/api/agent-center/issues/${issue.id}/resolution-plan/actions/${actionId}/apply`,
        { method: "POST" }
      );
      setResolutionPlan(payload.resolution_plan);
      setResolutionState("completed");
    } catch {
      setResolutionState("failed");
    } finally {
      setLoading(false);
    }
  }

  async function retestResolutionPlan() {
    if (!issue) return;
    setLoading(true);
    setResolutionState("retesting");
    try {
      const payload = await agentFetch<{ resolution_plan: any }>(
        `/api/agent-center/issues/${issue.id}/resolution-plan/retest`,
        { method: "POST" }
      );
      setResolutionPlan(payload.resolution_plan);
      setResolutionState("completed");
      await loadIssue(issue.id);
    } catch {
      setResolutionState("failed");
    } finally {
      setLoading(false);
    }
  }

  const narrative = issue?.merchant_facing_narrative || {};
  const beforeScores = verification?.before_scores?.aggregate_scores;
  const afterScores = verification?.after_scores?.aggregate_scores;
  const scoreDelta = verification?.score_delta || {};
  const merchantGapLabels = attributeGapLabels(diagnosis?.merchant_layer_findings || []);
  const pivotaGapLabels = attributeGapLabels(diagnosis?.pivota_layer_findings || []);
  const offerComparison = latestOfferComparison(offerDiagnosis);
  const merchantOffer = offerComparison.merchant_offer;
  const pivotaOffer = offerComparison.pivota_offer;
  const checkoutComparison = latestCheckoutComparison(checkoutDiagnosis);
  const merchantCheckoutPath = checkoutComparison.merchant_checkout_path;
  const pivotaCheckoutPath = checkoutComparison.pivota_checkout_path;

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

      <SurfaceCard
        title="Resolution Plan"
        description="Owner, recommended patches, approval state, and verification path for this blocker."
      >
        <div id="resolution-plan" className="space-y-5 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricTile
              label="Owner"
              value={resolutionPlan?.owner_type ? label(resolutionPlan.owner_type) : "not generated"}
            />
            <MetricTile
              label="Plan status"
              value={resolutionPlan?.status ? label(resolutionPlan.status) : label(resolutionState)}
            />
            <MetricTile
              label="Approval"
              value={
                resolutionPlan?.merchant_approval_status
                  ? label(resolutionPlan.merchant_approval_status)
                  : "not required"
              }
            />
            <MetricTile
              label="Usage"
              value={
                resolutionPlan?.usage_event_ids?.length
                  ? "preview only"
                  : "not metered"
              }
            />
          </div>

          {isDiscoveryResolutionBlocker(issue, resolutionPlan) ? (
            <div className="rounded-[8px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="warning">Discovery blocker</StatusBadge>
                <StatusBadge tone="neutral">Affected layer: discovery</StatusBadge>
                <StatusBadge tone="brand">Retest mode: organic_product_discovery_test</StatusBadge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetricTile
                  label="Organic discovery score"
                  value={scoreText(aggregateScore(issue, "organic_product_discovery_score"))}
                />
                <MetricTile
                  label="Competitor dominance score"
                  value={scoreText(aggregateScore(issue, "competitor_dominance_score"))}
                  tone={
                    passFail(
                      aggregateScore(issue, "competitor_dominance_score"),
                      80,
                      true
                    ) === "passed"
                      ? "success"
                      : "warning"
                  }
                />
                <MetricTile
                  label="Contextual attribution"
                  value={
                    passFail(aggregateScore(issue, "merchant_store_visibility_score")) ===
                      "passed" &&
                    passFail(aggregateScore(issue, "pivota_pdp_visibility_score")) ===
                      "passed"
                      ? "passed"
                      : "needs work"
                  }
                  helper={contextualAttributionSummary(issue)}
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                Contextual attribution and path readiness can pass while natural
                no-context discovery still fails. Recommended discovery fixes should
                strengthen merchant PDP signals, Pivota product graph coverage,
                differentiation evidence, and organic query mapping before retest.
              </p>
            </div>
          ) : null}

          <NarrativeSection title="Root cause hypothesis">
            {resolutionPlan?.root_cause_hypothesis ||
              "Generate a resolution plan to convert this blocker into owned actions, patches, approvals, and a retest path."}
          </NarrativeSection>

          <div className="grid gap-5 lg:grid-cols-2">
            <NarrativeSection title="Fix targets">
              <div className="flex flex-wrap gap-2">
                {(resolutionPlan?.fix_targets || issue?.fix_targets || []).map((target: string) => (
                  <FixTargetBadge key={target} target={target} />
                ))}
              </div>
            </NarrativeSection>
            <NarrativeSection title="Verification plan">
              {resolutionPlan ? (
                <JsonBlock value={resolutionPlan.verification_plan} />
              ) : (
                "No verification plan generated yet."
              )}
            </NarrativeSection>
          </div>

          {resolutionPlan?.recommended_actions?.length ? (
            <div className="space-y-3">
              <p className="merchant-overline">
                {isDiscoveryResolutionBlocker(issue, resolutionPlan)
                  ? "Recommended discovery fixes"
                  : "Recommended actions"}
              </p>
              {resolutionPlan.recommended_actions.map((action: any) => (
                <div
                  key={action.id}
                  className="rounded-[8px] border border-[color:var(--merchant-line)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[color:var(--merchant-ink)]">
                        {action.title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted)]">
                        {action.description}
                      </p>
                      {action.owner_type ? (
                        <p className="mt-2 text-xs uppercase tracking-wide text-[color:var(--merchant-muted)]">
                          Owner: {label(action.owner_type)}
                          {action.owner_team ? ` - ${action.owner_team}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-xs uppercase tracking-wide text-[color:var(--merchant-muted)]">
                      <p>{label(action.status)}</p>
                      <p>{label(action.target_layer)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_280px]">
                    <div>
                      <p className="merchant-overline mb-2">Patch preview</p>
                      <JsonBlock value={action.patch_payload || {}} />
                    </div>
                    <div className="space-y-3 text-sm text-[color:var(--merchant-muted-strong)]">
                      <p>
                        Approval:{" "}
                        {action.requires_merchant_approval
                          ? "merchant approval required"
                          : "Pivota internal action"}
                      </p>
                      <p>Expected impact: {action.expected_impact}</p>
                      <div className="flex flex-wrap gap-2">
                        {action.requires_merchant_approval &&
                        action.status === "proposed" ? (
                          <MerchantButton
                            icon={CheckCircle2}
                            variant="secondary"
                            onClick={() => approveResolutionAction(action.id)}
                            disabled={loading}
                          >
                            Approve
                          </MerchantButton>
                        ) : null}
                        {action.status !== "applied" &&
                        (!action.requires_merchant_approval ||
                          action.status === "approved") ? (
                          <MerchantButton
                            icon={Send}
                            variant="secondary"
                            onClick={() => applyResolutionAction(action.id)}
                            disabled={loading}
                          >
                            Apply
                          </MerchantButton>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <MerchantButton
              icon={ClipboardList}
              variant="secondary"
              onClick={generateResolutionPlan}
              disabled={loading}
            >
              {resolutionPlan ? "Refresh Resolution Plan" : "Generate Resolution Plan"}
            </MerchantButton>
            <MerchantButton
              icon={RotateCcw}
              onClick={retestResolutionPlan}
              disabled={loading || !resolutionPlan}
            >
              Retest Resolution Plan
            </MerchantButton>
          </div>

          {resolutionPlan?.retest_result ? (
            <div>
              <p className="merchant-overline mb-2">Retest result</p>
              <JsonBlock value={resolutionPlan.retest_result} />
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      <SurfaceCard title="Product Understanding Diagnosis">
        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricTile
              label="Confidence"
              value={diagnosis?.confidence || "not run"}
              tone={diagnosis?.confidence === "high" ? "success" : "neutral"}
            />
            <MetricTile
              label="Last diagnosis run"
              value={diagnosis?.created_at ? new Date(diagnosis.created_at).toLocaleString() : "not run"}
            />
            <MetricTile label="Diagnosis state" value={label(diagnosisState)} />
          </div>

          <NarrativeSection title="Root cause summary">
            {diagnosis?.root_cause_summary ||
              "Run Product Diagnosis to compare merchant source data, SKU mapping, Pivota unified PDP data, query mapping, and competitor context."}
          </NarrativeSection>

          <div className="grid gap-5 lg:grid-cols-2">
            <NarrativeSection title="Merchant PDP/catalog gaps">
              <ul className="list-disc space-y-1 pl-5">
                {(merchantGapLabels.length ? merchantGapLabels : ["No merchant source gap diagnosed yet."]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
            <NarrativeSection title="Pivota unified PDP gaps">
              <ul className="list-disc space-y-1 pl-5">
                {(pivotaGapLabels.length ? pivotaGapLabels : ["No Pivota unified PDP gap diagnosed yet."]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
            <NarrativeSection title="SKU / variant mapping gaps">
              <ul className="list-disc space-y-1 pl-5">
                {findingEvidence(
                  diagnosis?.sku_variant_findings || [],
                  "No SKU or variant mapping gap diagnosed yet."
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
            <NarrativeSection title="Product graph / query mapping gaps">
              <ul className="list-disc space-y-1 pl-5">
                {[
                  ...findingEvidence(
                    diagnosis?.entity_mapping_findings || [],
                    "No product entity mapping gap diagnosed yet."
                  ),
                  ...findingEvidence(
                    diagnosis?.query_mapping_findings || [],
                    "No query mapping gap diagnosed yet."
                  ),
                  ...findingEvidence(
                    diagnosis?.competitor_mapping_findings || [],
                    "No competitor/substitute mapping gap diagnosed yet."
                  ),
                ].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
          </div>

          <div className="flex flex-wrap gap-2">
            {(diagnosis?.refined_fix_targets || issue?.fix_targets || []).map((target: string) => (
              <FixTargetBadge key={target} target={target} />
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div>
              <p className="merchant-overline mb-2">Recommended merchant source patch</p>
              <JsonBlock
                value={
                  patchByType(diagnosis, "merchant_source_patch") ||
                  patchByType(diagnosis, "merchant_variant_map_patch") ||
                  {}
                }
              />
            </div>
            <div>
              <p className="merchant-overline mb-2">Recommended Pivota product graph patch</p>
              <JsonBlock
                value={
                  patchByType(diagnosis, "pivota_product_graph_patch") ||
                  patchByType(diagnosis, "pivota_query_mapping_patch") ||
                  patchByType(diagnosis, "pivota_unified_pdp_patch") ||
                  {}
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <MerchantButton
              icon={ClipboardList}
              variant="secondary"
              onClick={() => runProductDiagnosis("product-diagnosis")}
              disabled={loading}
            >
              Run Product Diagnosis
            </MerchantButton>
            <MerchantButton
              icon={RotateCcw}
              variant="secondary"
              onClick={() => runProductDiagnosis("regenerate-product-patch")}
              disabled={loading}
            >
              Regenerate Patch
            </MerchantButton>
            <MerchantButton
              icon={Send}
              variant="secondary"
              onClick={() => runProductDiagnosis("attach-product-diagnosis-to-retest")}
              disabled={loading}
            >
              Attach to Retest Plan
            </MerchantButton>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard title="Offer Execution Diagnosis">
        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricTile
              label="Offer readiness"
              value={
                offerDiagnosis?.offer_readiness_score !== undefined
                  ? `${offerDiagnosis.offer_readiness_score}%`
                  : "not run"
              }
              tone={
                (offerDiagnosis?.offer_readiness_score || 0) >= 80 ? "success" : "warning"
              }
            />
            <MetricTile
              label="Confidence"
              value={offerDiagnosis?.confidence || "not run"}
              tone={offerDiagnosis?.confidence === "high" ? "success" : "neutral"}
            />
            <MetricTile
              label="Last diagnosis run"
              value={
                offerDiagnosis?.created_at
                  ? new Date(offerDiagnosis.created_at).toLocaleString()
                  : "not run"
              }
            />
            <MetricTile label="Usage status" value="preview only" />
          </div>

          <NarrativeSection title="Root cause">
            {offerDiagnosis?.root_cause_summary ||
              "Run Offer Diagnosis to compare merchant offer source data with Pivota offer state. V1 checks readiness and consistency only; it does not execute checkout or payment."}
          </NarrativeSection>

          <div className="grid gap-5 lg:grid-cols-2">
            <NarrativeSection title="Merchant offer source">
              <div className="space-y-1">
                <p>ID: {merchantOffer?.id || "not found"}</p>
                <p>
                  Price:{" "}
                  {merchantOffer
                    ? `${merchantOffer.currency} ${merchantOffer.price}`
                    : "not available"}
                </p>
                <p>
                  Promo/coupon:{" "}
                  {merchantOffer?.coupon_code || merchantOffer?.coupon_status || "none"}
                </p>
                <p>
                  Inventory:{" "}
                  {merchantOffer
                    ? `${label(merchantOffer.inventory_status)} (${merchantOffer.inventory_quantity ?? "unknown"})`
                    : "not available"}
                </p>
              </div>
            </NarrativeSection>
            <NarrativeSection title="Pivota offer state">
              <div className="space-y-1">
                <p>ID: {pivotaOffer?.id || "not found"}</p>
                <p>
                  Price:{" "}
                  {pivotaOffer
                    ? `${pivotaOffer.currency} ${pivotaOffer.price}`
                    : "not available"}
                </p>
                <p>
                  Execution state:{" "}
                  {pivotaOffer?.execution_status ? label(pivotaOffer.execution_status) : "not available"}
                </p>
                <p>
                  Attached to PDP:{" "}
                  {pivotaOffer ? (pivotaOffer.attached_to_pivota_pdp ? "yes" : "no") : "not available"}
                </p>
              </div>
            </NarrativeSection>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <NarrativeSection title="Price mismatch">
              <ul className="list-disc space-y-1 pl-5">
                {offerFindingEvidence(
                  offerDiagnosis,
                  ["price_mismatch", "stale_offer", "missing_offer"],
                  "No price or freshness mismatch diagnosed yet."
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
            <NarrativeSection title="Promo / coupon mismatch">
              <ul className="list-disc space-y-1 pl-5">
                {offerFindingEvidence(
                  offerDiagnosis,
                  ["promo_mismatch", "expired_coupon"],
                  "No promo or coupon mismatch diagnosed yet."
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
            <NarrativeSection title="Inventory mismatch">
              <ul className="list-disc space-y-1 pl-5">
                {offerFindingEvidence(
                  offerDiagnosis,
                  ["inventory_mismatch"],
                  "No inventory mismatch diagnosed yet."
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
            <NarrativeSection title="Offer attachment status">
              <ul className="list-disc space-y-1 pl-5">
                {offerFindingEvidence(
                  offerDiagnosis,
                  ["offer_not_attached_to_pivota_pdp", "offer_sku_variant_mismatch"],
                  "No PDP attachment or SKU/variant mismatch diagnosed yet."
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
          </div>

          <div className="flex flex-wrap gap-2">
            {(offerDiagnosis?.refined_fix_targets || []).map((target: string) => (
              <FixTargetBadge key={target} target={target} />
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div>
              <p className="merchant-overline mb-2">Recommended merchant offer patch</p>
              <JsonBlock
                value={
                  offerPatchByType(offerDiagnosis, "merchant_offer_patch") ||
                  offerPatchByType(offerDiagnosis, "inventory_sync_patch") ||
                  offerPatchByType(offerDiagnosis, "promo_state_patch") ||
                  {}
                }
              />
            </div>
            <div>
              <p className="merchant-overline mb-2">Recommended Pivota offer patch</p>
              <JsonBlock
                value={
                  offerPatchByType(offerDiagnosis, "pivota_offer_patch") ||
                  offerPatchByType(offerDiagnosis, "offer_attachment_patch") ||
                  {}
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <MerchantButton
              icon={ShoppingCart}
              variant="secondary"
              onClick={() => runOfferDiagnosis("offer-diagnosis")}
              disabled={loading}
            >
              Run Offer Diagnosis
            </MerchantButton>
            <MerchantButton
              icon={RotateCcw}
              variant="secondary"
              onClick={() => runOfferDiagnosis("regenerate-offer-patch")}
              disabled={loading}
            >
              Regenerate Offer Patch
            </MerchantButton>
            <MerchantButton
              icon={Send}
              variant="secondary"
              onClick={() => runOfferDiagnosis("attach-offer-diagnosis-to-retest")}
              disabled={loading}
            >
              Attach to Retest Plan
            </MerchantButton>
          </div>

          <p className="text-sm text-[color:var(--merchant-muted)]">
            Offer Execution V1 verifies offer readiness signals only. Checkout, payment,
            authorization, settlement, refunds, and order write-back are out of scope.
          </p>
        </div>
      </SurfaceCard>

      <SurfaceCard title="Checkout Verification Diagnosis">
        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricTile
              label="Checkout readiness"
              value={
                checkoutDiagnosis?.checkout_readiness_score !== undefined
                  ? `${checkoutDiagnosis.checkout_readiness_score}%`
                  : "not run"
              }
              tone={
                (checkoutDiagnosis?.checkout_readiness_score || 0) >= 80
                  ? "success"
                  : "warning"
              }
            />
            <MetricTile
              label="Preflight"
              value={
                checkoutComparison.checkout_url_preflight_status
                  ? label(checkoutComparison.checkout_url_preflight_status)
                  : "not run"
              }
              tone={
                checkoutComparison.checkout_url_preflight_status === "passed"
                  ? "success"
                  : "neutral"
              }
            />
            <MetricTile
              label="Confidence"
              value={checkoutDiagnosis?.confidence || "not run"}
              tone={checkoutDiagnosis?.confidence === "high" ? "success" : "neutral"}
            />
            <MetricTile label="Usage status" value="preview only" />
          </div>

          <NarrativeSection title="Root cause">
            {checkoutDiagnosis?.root_cause_summary ||
              "Run Checkout Diagnosis to verify checkout path readiness before payment. V1 checks URL/session presence, cart handoff parameters, domain consistency, and offer attachment only."}
          </NarrativeSection>

          <div className="grid gap-5 lg:grid-cols-2">
            <NarrativeSection title="Merchant checkout path">
              <div className="space-y-1">
                <p>ID: {merchantCheckoutPath?.id || "not found"}</p>
                <p>URL: {merchantCheckoutPath?.checkout_url || "not available"}</p>
                <p>Domain: {merchantCheckoutPath?.checkout_domain || "not available"}</p>
                <p>
                  Required params:{" "}
                  {(merchantCheckoutPath?.required_params || []).join(", ") || "none"}
                </p>
              </div>
            </NarrativeSection>
            <NarrativeSection title="Pivota checkout path">
              <div className="space-y-1">
                <p>ID: {pivotaCheckoutPath?.id || "not found"}</p>
                <p>URL: {pivotaCheckoutPath?.checkout_url || "not available"}</p>
                <p>Domain: {pivotaCheckoutPath?.checkout_domain || "not available"}</p>
                <p>
                  Attached to offer:{" "}
                  {pivotaCheckoutPath
                    ? pivotaCheckoutPath.attached_to_pivota_offer
                      ? "yes"
                      : "no"
                    : "not available"}
                </p>
              </div>
            </NarrativeSection>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <NarrativeSection title="Checkout URL preflight status">
              <ul className="list-disc space-y-1 pl-5">
                {checkoutFindingEvidence(
                  checkoutDiagnosis,
                  ["missing_checkout_path", "checkout_url_unreachable", "stale_checkout_session"],
                  checkoutComparison.checkout_url_preflight_status
                    ? `Preflight ${label(checkoutComparison.checkout_url_preflight_status)}${
                        checkoutComparison.checkout_url_status_code
                          ? ` (${checkoutComparison.checkout_url_status_code})`
                          : ""
                      }.`
                    : "No checkout URL preflight finding diagnosed yet."
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
            <NarrativeSection title="Cart handoff required params">
              <ul className="list-disc space-y-1 pl-5">
                {checkoutFindingEvidence(
                  checkoutDiagnosis,
                  [
                    "cart_handoff_missing_required_param",
                    "variant_param_missing",
                    "quantity_param_missing",
                  ],
                  checkoutComparison.missing_params?.length
                    ? `Missing params: ${checkoutComparison.missing_params.join(", ")}.`
                    : "No cart handoff parameter gap diagnosed yet."
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
            <NarrativeSection title="Coupon passthrough status">
              <ul className="list-disc space-y-1 pl-5">
                {checkoutFindingEvidence(
                  checkoutDiagnosis,
                  ["coupon_param_missing"],
                  checkoutComparison.coupon_passthrough_consistent === false
                    ? "Coupon passthrough is inconsistent."
                    : "No coupon passthrough gap diagnosed yet."
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
            <NarrativeSection title="Domain consistency">
              <ul className="list-disc space-y-1 pl-5">
                {checkoutFindingEvidence(
                  checkoutDiagnosis,
                  [
                    "checkout_domain_mismatch",
                    "checkout_not_attached_to_pivota_offer",
                    "checkout_offer_sku_mismatch",
                  ],
                  "No domain, attachment, or SKU mismatch diagnosed yet."
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </NarrativeSection>
          </div>

          <div className="flex flex-wrap gap-2">
            {(checkoutDiagnosis?.refined_fix_targets || []).map((target: string) => (
              <FixTargetBadge key={target} target={target} />
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div>
              <p className="merchant-overline mb-2">Recommended merchant checkout patch</p>
              <JsonBlock
                value={
                  checkoutPatchByType(checkoutDiagnosis, "merchant_checkout_patch") ||
                  checkoutPatchByType(checkoutDiagnosis, "coupon_passthrough_patch") ||
                  {}
                }
              />
            </div>
            <div>
              <p className="merchant-overline mb-2">Recommended Pivota checkout patch</p>
              <JsonBlock
                value={
                  checkoutPatchByType(checkoutDiagnosis, "pivota_checkout_patch") ||
                  checkoutPatchByType(checkoutDiagnosis, "cart_handoff_payload_patch") ||
                  checkoutPatchByType(checkoutDiagnosis, "checkout_attachment_patch") ||
                  checkoutPatchByType(checkoutDiagnosis, "checkout_domain_patch") ||
                  {}
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <MerchantButton
              icon={CreditCard}
              variant="secondary"
              onClick={() => runCheckoutDiagnosis("checkout-diagnosis")}
              disabled={loading}
            >
              Run Checkout Diagnosis
            </MerchantButton>
            <MerchantButton
              icon={RotateCcw}
              variant="secondary"
              onClick={() => runCheckoutDiagnosis("regenerate-checkout-patch")}
              disabled={loading}
            >
              Regenerate Checkout Patch
            </MerchantButton>
            <MerchantButton
              icon={Send}
              variant="secondary"
              onClick={() => runCheckoutDiagnosis("attach-checkout-diagnosis-to-retest")}
              disabled={loading}
            >
              Attach to Retest Plan
            </MerchantButton>
          </div>

          <p className="text-sm text-[color:var(--merchant-muted)]">
            Checkout Verification V1 checks pre-payment checkout path readiness only.
            PSP authorization, payment tokens, real orders, refunds, settlement, and
            transaction fees are out of scope.
          </p>
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
