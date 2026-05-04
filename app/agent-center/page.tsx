"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  ClipboardList,
  Gauge,
  Inbox,
  Play,
  WalletCards,
} from "lucide-react";
import {
  MerchantLinkButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from "@/components/ui/merchant-primitives";
import {
  agentFetch,
  EmptyAgentState,
  FixTargetBadge,
  MetricTile,
  ScoreBar,
} from "@/components/agent-center/agent-center-ui";

type OverviewPayload = {
  latest_job: any | null;
  latest_result: any | null;
  latest_assurance_snapshot: any | null;
  pivota_discovery_progress?: {
    status: string;
    summary: string;
    next_recommended_operator_action: string;
    next_rerun_at?: string;
    last_search_grounded_discovery_score: number | "not_tested" | "not_configured";
    last_returned_urls: string[];
    uplift_claim_allowed: boolean;
    steps: Array<{
      step_key: string;
      label: string;
      status: string;
      summary: string;
    }>;
  };
  discovery_evidence?: {
    search_grounded?: {
      status: string;
      grounding_sources_count: number;
      returned_urls: string[];
      grounding_sources: string[];
      grounding_search_queries: string[];
      matched_merchant_pdp: boolean;
      matched_pivota_pdp: boolean;
      merchant_domain_found: boolean;
      pivota_domain_found: boolean;
    };
  };
  ai_visibility_score: number;
  product_entity_visibility_score: number;
  merchant_store_visibility_score: number;
  pivota_pdp_visibility_score: number;
  executable_offer_visibility_score: number | "not_tested";
  organic_product_discovery_score: number | "not_tested" | "not_configured";
  search_grounded_merchant_pdp_discovery_score:
    | number
    | "not_tested"
    | "not_configured";
  search_grounded_pivota_pdp_discovery_score:
    | number
    | "not_tested"
    | "not_configured";
  buying_path_discovery_score: number | "not_tested" | "not_configured";
  competitor_dominance_score: number | "not_tested" | "not_configured";
  competitor_substitution_rate: number;
  pivota_pdp_readiness_score: number;
  estimated_gmv_at_risk: number;
  open_issues: number;
  usage: {
    included_ai_test_credits: number;
    used_credits: number;
    remaining_credits: number;
    billing_mode: string;
  };
};

const dimensionLabels: Record<string, string> = {
  organic_product_discovery_status: "Organic Product Discovery",
  merchant_pdp_discovery_status: "Merchant PDP Discovery",
  pivota_pdp_discovery_status: "Pivota PDP Discovery",
  buying_path_discovery_status: "Buying Path Discovery",
  competitor_dominance_status: "Competitor Dominance",
  product_visibility_status: "Product Visibility",
  merchant_attribution_status: "Merchant Store Attribution",
  pivota_attribution_status: "Pivota Channel Attribution",
  product_data_readiness_status: "Product Data Readiness",
  sku_variant_readiness_status: "SKU / Variant Readiness",
  offer_readiness_status: "Offer Readiness",
  checkout_readiness_status: "Checkout Readiness",
};

function label(value: string) {
  return value.replace(/_/g, " ");
}

function badgeTone(status: string) {
  if (status === "passed" || status === "ready_for_agentic_checkout") return "success";
  if (status === "blocked") return "critical";
  if (status === "needs_work") return "warning";
  return "neutral";
}

function readinessDimensions(snapshot: any) {
  if (!snapshot) return [];
  return [
    ["product_visibility_status", snapshot.demand_test_summary?.product_visibility_status],
    ["merchant_attribution_status", snapshot.demand_test_summary?.merchant_attribution_status],
    ["pivota_attribution_status", snapshot.demand_test_summary?.pivota_attribution_status],
    [
      "product_data_readiness_status",
      snapshot.product_understanding_summary?.product_data_readiness_status,
    ],
    [
      "sku_variant_readiness_status",
      snapshot.product_understanding_summary?.sku_variant_readiness_status,
    ],
    ["offer_readiness_status", snapshot.offer_execution_summary?.offer_readiness_status],
    [
      "checkout_readiness_status",
      snapshot.checkout_verification_summary?.checkout_readiness_status,
    ],
  ].filter(([, value]) => Boolean(value));
}

function discoveryDimensions(snapshot: any) {
  if (!snapshot?.discovery_readiness_summary) return [];
  return [
    [
      "organic_product_discovery_status",
      snapshot.discovery_readiness_summary.organic_product_discovery_status,
    ],
    [
      "merchant_pdp_discovery_status",
      snapshot.discovery_readiness_summary.merchant_pdp_discovery_status,
    ],
    [
      "pivota_pdp_discovery_status",
      snapshot.discovery_readiness_summary.pivota_pdp_discovery_status,
    ],
    [
      "buying_path_discovery_status",
      snapshot.discovery_readiness_summary.buying_path_discovery_status,
    ],
    [
      "competitor_dominance_status",
      snapshot.discovery_readiness_summary.competitor_dominance_status,
    ],
  ].filter(([, value]) => Boolean(value));
}

function formatScore(value: any) {
  if (value === "not_configured") return "Not configured";
  if (value === "not_tested" || value === undefined) return "Not tested";
  return `${value}%`;
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

export default function AgentCenterPage() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOverview() {
      const payload = await agentFetch<OverviewPayload>("/api/agent-center/overview");
      if (!payload.latest_assurance_snapshot && payload.latest_job?.scan_target_id) {
        const created = await agentFetch<{ snapshot: any }>(
          "/api/agent-center/gmv-assurance/snapshots",
          {
            method: "POST",
            body: JSON.stringify({
              scan_target_id: payload.latest_job.scan_target_id,
            }),
          }
        );
        payload.latest_assurance_snapshot = created.snapshot;
      }
      setOverview(payload);
    }

    void loadOverview()
      .finally(() => setLoading(false));
  }, []);

  const snapshot = overview?.latest_assurance_snapshot;
  const topBlocker = snapshot?.top_blockers?.[0];
  const nextAction = snapshot?.recommended_next_actions?.[0];

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Agentic GMV Assurance"
        title="Agentic GMV Center"
        description="Pivota separates discoverability, attribution, and pre-payment readiness across AI demand scenarios."
        actions={
          <>
            <MerchantLinkButton href="/agent-center/run" icon={Play}>
              Run Agent Scan
            </MerchantLinkButton>
            <MerchantLinkButton href="/agent-center/issues" variant="secondary" icon={Inbox}>
              View Latest Issues
            </MerchantLinkButton>
          </>
        }
      />

      <SurfaceCard title="Agentic GMV Assurance Summary" strong>
        <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Readiness level"
            value={
              loading
                ? "..."
                : snapshot?.readiness_level
                  ? label(snapshot.readiness_level)
                  : "not ready"
            }
            helper="Pre-payment assurance chain"
            tone={badgeTone(snapshot?.readiness_level || "not_tested") as any}
          />
          <MetricTile
            label="Readiness score"
            value={loading ? "..." : `${snapshot?.overall_readiness_score || 0}%`}
            helper="Blocker-capped, not a simple average"
            tone={(snapshot?.overall_readiness_score || 0) >= 80 ? "success" : "warning"}
          />
          <MetricTile
            label="Top blocker"
            value={loading ? "..." : topBlocker ? label(topBlocker.blocker_type) : "none"}
            helper={topBlocker?.affected_layer ? label(topBlocker.affected_layer) : "No active blocker"}
            tone={topBlocker ? "critical" : "success"}
          />
          <MetricTile
            label="Next best action"
            value={loading ? "..." : nextAction || "Run Agent Scan"}
            helper="Merchant-facing workflow step"
            tone="brand"
          />
        </div>
      </SurfaceCard>

      <SurfaceCard strong>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5">
          <MetricTile
            label="Product visibility"
            value={loading ? "..." : `${overview?.product_entity_visibility_score || 0}%`}
            helper="Product/entity recommendations"
            tone={(overview?.product_entity_visibility_score || 0) >= 50 ? "success" : "warning"}
          />
          <MetricTile
            label="Merchant attribution"
            value={loading ? "..." : `${overview?.merchant_store_visibility_score || 0}%`}
            helper="Store or merchant PDP proven"
            tone={(overview?.merchant_store_visibility_score || 0) > 0 ? "success" : "neutral"}
          />
          <MetricTile
            label="Pivota channel"
            value={loading ? "..." : `${overview?.pivota_pdp_visibility_score || 0}%`}
            helper="Unified PDP attribution"
            tone={(overview?.pivota_pdp_visibility_score || 0) > 0 ? "success" : "neutral"}
          />
          <MetricTile
            label="Executable offer"
            value={
              loading
                ? "..."
                : overview?.executable_offer_visibility_score === "not_tested"
                  ? "Not tested"
                  : `${overview?.executable_offer_visibility_score || 0}%`
            }
            helper="Offer or checkout path"
            tone="neutral"
          />
          <MetricTile
            label="Open issues"
            value={loading ? "..." : overview?.open_issues || 0}
            helper="Evidence-backed fixes"
            tone={(overview?.open_issues || 0) > 0 ? "critical" : "success"}
          />
        </div>
      </SurfaceCard>

      {overview?.pivota_discovery_progress ? (
        <SurfaceCard
          title="Pivota Discovery Progress"
          description="Tracks public indexability work and measured search-grounded reruns. It does not claim uplift until the Pivota PDP is returned."
        >
          <div className="grid sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              label="Progress status"
              value={label(overview.pivota_discovery_progress.status)}
              helper="Search Console and rerun evidence"
              tone={badgeTone(
                overview.pivota_discovery_progress.uplift_claim_allowed
                  ? "passed"
                  : overview.pivota_discovery_progress.status === "rerun_due"
                    ? "needs_work"
                    : "not_tested"
              ) as any}
            />
            <MetricTile
              label="Last Pivota discovery"
              value={formatScore(
                overview.pivota_discovery_progress
                  .last_search_grounded_discovery_score
              )}
              helper="Search-grounded Pivota PDP score"
              tone={
                overview.pivota_discovery_progress.uplift_claim_allowed
                  ? "success"
                  : "neutral"
              }
            />
            <MetricTile
              label="Next rerun"
              value={overview.pivota_discovery_progress.next_rerun_at || "Not scheduled"}
              helper="Manual T+24h / T+72h / T+7d windows"
              tone="brand"
            />
            <MetricTile
              label="Uplift claim"
              value={
                overview.pivota_discovery_progress.uplift_claim_allowed
                  ? "Allowed"
                  : "Not allowed"
              }
              helper="Only after measured URL discovery improves"
              tone={
                overview.pivota_discovery_progress.uplift_claim_allowed
                  ? "success"
                  : "warning"
              }
            />
          </div>
          <div className="border-t border-[color:var(--merchant-line)] px-5 py-4 text-sm text-[color:var(--merchant-muted-strong)]">
            {overview.pivota_discovery_progress.summary}
          </div>
          <div className="divide-y divide-[color:var(--merchant-line)]">
            {overview.pivota_discovery_progress.steps.slice(0, 6).map((step) => (
              <div
                key={step.step_key}
                className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[240px_140px_1fr]"
              >
                <p className="font-medium text-[color:var(--merchant-ink)]">
                  {step.label}
                </p>
                <StatusBadge tone={badgeTone(step.status) as any}>
                  {label(step.status)}
                </StatusBadge>
                <p className="text-[color:var(--merchant-muted-strong)]">
                  {step.summary}
                </p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      ) : null}

      <SurfaceCard
        title="Discovery Readiness"
        description="Discoverability asks whether users and agents can find you naturally. Readiness asks whether the path can execute once found. Transaction is not tested in V1."
      >
        {snapshot ? (
          <div>
            <div className="px-5 py-4 text-sm text-[color:var(--merchant-muted-strong)]">
              Search-grounded discovery uses Gemini with Google Search grounding. It
              tests whether public web/search-grounded Gemini can find the page. It
              does not prove consumer Gemini UI ranking.
            </div>
            <div className="divide-y divide-[color:var(--merchant-line)]">
              {discoveryDimensions(snapshot).map(([key, dimension]: any) => (
                <div
                  key={key}
                  className="grid gap-3 px-5 py-4 text-sm lg:grid-cols-[240px_130px_150px_1fr]"
                >
                  <div>
                    <p className="font-medium text-[color:var(--merchant-ink)]">
                      {dimensionLabels[key] || label(key)}
                    </p>
                    <p className="mt-1 text-[color:var(--merchant-muted)]">
                      {dimension.evidence}
                    </p>
                  </div>
                  <div>
                    <p className="merchant-overline mb-1">Status</p>
                    <StatusBadge tone={badgeTone(dimension.status) as any}>
                      {label(dimension.status)}
                    </StatusBadge>
                  </div>
                  <div>
                    <p className="merchant-overline mb-1">Score</p>
                    <p className="font-semibold text-[color:var(--merchant-ink)]">
                      {formatScore(dimension.score)}
                    </p>
                  </div>
                  <div>
                    <p className="merchant-overline mb-1">Recommended next action</p>
                    <p className="text-[color:var(--merchant-muted-strong)]">
                      {dimension.recommended_next_action}
                    </p>
                    {dimension.issue_id ? (
                      <Link
                        href={`/agent-center/issues/${dimension.issue_id}`}
                        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--merchant-brand)]"
                      >
                        <span>Open linked issue</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
              {overview?.discovery_evidence?.search_grounded ? (
                <div className="grid gap-3 px-5 py-4 text-sm lg:grid-cols-[240px_1fr]">
                  <div>
                    <p className="font-medium text-[color:var(--merchant-ink)]">
                      Search Grounded Discovery
                    </p>
                    <p className="mt-1 text-[color:var(--merchant-muted)]">
                      Grounding sources:{" "}
                      {overview.discovery_evidence.search_grounded.grounding_sources_count}
                    </p>
                    <div className="mt-2">
                      <StatusBadge
                        tone={
                          badgeTone(
                            overview.discovery_evidence.search_grounded.status
                          ) as any
                        }
                      >
                        {label(overview.discovery_evidence.search_grounded.status)}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="merchant-overline mb-1">Matched paths</p>
                      <p>
                        Merchant PDP:{" "}
                        {yesNo(
                          overview.discovery_evidence.search_grounded
                            .matched_merchant_pdp
                        )}
                      </p>
                      <p>
                        Pivota PDP:{" "}
                        {yesNo(
                          overview.discovery_evidence.search_grounded
                            .matched_pivota_pdp
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="merchant-overline mb-1">Returned URLs</p>
                      {overview.discovery_evidence.search_grounded.returned_urls.length ? (
                        <ul className="space-y-1">
                          {overview.discovery_evidence.search_grounded.returned_urls
                            .slice(0, 4)
                            .map((url) => (
                              <li key={url} className="truncate font-mono text-xs">
                                {url}
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="text-[color:var(--merchant-muted)]">
                          No URLs returned.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyAgentState
            title="No discovery snapshot yet"
            description="Run a discovery scan to measure organic, search-grounded, and buying-path findability."
            href="/agent-center/run"
            cta="Run Discovery Test"
          />
        )}
      </SurfaceCard>

      <SurfaceCard title="Readiness Dimensions">
        {snapshot ? (
          <div className="divide-y divide-[color:var(--merchant-line)]">
            {readinessDimensions(snapshot).map(([key, dimension]: any) => (
              <div
                key={key}
                className="grid gap-3 px-5 py-4 text-sm lg:grid-cols-[220px_130px_150px_1fr]"
              >
                <div>
                  <p className="font-medium text-[color:var(--merchant-ink)]">
                    {dimensionLabels[key] || label(key)}
                  </p>
                  <p className="mt-1 text-[color:var(--merchant-muted)]">
                    {dimension.evidence}
                  </p>
                </div>
                <div>
                  <p className="merchant-overline mb-1">Status</p>
                  <StatusBadge tone={badgeTone(dimension.status) as any}>
                    {label(dimension.status)}
                  </StatusBadge>
                </div>
                <div>
                  <p className="merchant-overline mb-1">Score</p>
                  <p className="font-semibold text-[color:var(--merchant-ink)]">
                    {formatScore(dimension.score)}
                  </p>
                  {dimension.issue_id || dimension.diagnosis_id ? (
                    <p className="mt-1 truncate font-mono text-xs text-[color:var(--merchant-muted)]">
                      {dimension.issue_id || dimension.diagnosis_id}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="merchant-overline mb-1">Recommended next action</p>
                  <p className="text-[color:var(--merchant-muted-strong)]">
                    {dimension.recommended_next_action}
                  </p>
                  {dimension.issue_id ? (
                    <Link
                      href={`/agent-center/issues/${dimension.issue_id}`}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--merchant-brand)]"
                    >
                      <span>Open linked issue</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyAgentState
            title="No assurance snapshot yet"
            description="Run a scan or create a GMV Assurance snapshot to summarize the pre-payment chain."
            href="/agent-center/run"
            cta="Run Agent Scan"
          />
        )}
      </SurfaceCard>

      <SurfaceCard title="Top Blockers">
        {snapshot?.top_blockers?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[color:var(--merchant-line)] text-[color:var(--merchant-muted)]">
                <tr>
                  <th className="px-5 py-3 font-medium">Blocker type</th>
                  <th className="px-5 py-3 font-medium">Severity</th>
                  <th className="px-5 py-3 font-medium">Affected layer</th>
                  <th className="px-5 py-3 font-medium">Fix target</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--merchant-line)]">
                {snapshot.top_blockers.map((blocker: any, index: number) => (
                  <tr key={`${blocker.blocker_type}-${index}`}>
                    <td className="px-5 py-3 font-medium text-[color:var(--merchant-ink)]">
                      {label(blocker.blocker_type)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={badgeTone(blocker.severity === "critical" ? "blocked" : "needs_work") as any}>
                        {blocker.severity}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-[color:var(--merchant-muted)]">
                      {label(blocker.affected_layer)}
                    </td>
                    <td className="px-5 py-3">
                      {blocker.fix_target ? (
                        <FixTargetBadge target={blocker.fix_target} />
                      ) : (
                        <span className="text-[color:var(--merchant-muted)]">none</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--merchant-muted-strong)]">
                      {blocker.issue_id ? (
                        <Link
                          href={`/agent-center/issues/${blocker.issue_id}#resolution-plan`}
                          className="font-medium text-[color:var(--merchant-brand)]"
                        >
                          {blocker.recommended_action}
                        </Link>
                      ) : (
                        blocker.recommended_action
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-5 text-sm text-[color:var(--merchant-muted)]">
            No active pre-payment blockers in the latest GMV Assurance snapshot.
          </p>
        )}
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <SurfaceCard
          title="Latest Scan"
          description="Demand scenarios, provider results, scores, and generated GMV issues."
          action={
            overview?.latest_job ? (
              <Link
                href={`/agent-center/results/${overview.latest_job.id}`}
                className="merchant-button-secondary"
              >
                <span>Open results</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null
          }
        >
          {overview?.latest_result ? (
            <div className="grid gap-5 px-5 py-5 lg:grid-cols-2">
              <div className="space-y-4">
                <ScoreBar
                  label="Product Visibility"
                  value={overview.latest_result.aggregate_scores.product_entity_visibility_score ?? overview.latest_result.aggregate_scores.visibility_score}
                />
                <ScoreBar
                  label="Merchant Store Visibility"
                  value={overview.latest_result.aggregate_scores.merchant_store_visibility_score ?? 0}
                />
                <ScoreBar
                  label="Pivota Channel Visibility"
                  value={overview.latest_result.aggregate_scores.pivota_pdp_visibility_score ?? 0}
                />
                <ScoreBar
                  label="Executable Offer Visibility"
                  value={overview.latest_result.aggregate_scores.executable_offer_visibility_score ?? "not_tested"}
                />
                <ScoreBar
                  label="Organic Product Discovery"
                  value={overview.latest_result.aggregate_scores.organic_product_discovery_score ?? "not_tested"}
                />
                <ScoreBar
                  label="Merchant PDP Discovery"
                  value={overview.latest_result.aggregate_scores.search_grounded_merchant_pdp_discovery_score ?? "not_tested"}
                />
                <ScoreBar
                  label="Pivota PDP Discovery"
                  value={overview.latest_result.aggregate_scores.search_grounded_pivota_pdp_discovery_score ?? "not_tested"}
                />
                <ScoreBar
                  label="Buying Path Discovery"
                  value={overview.latest_result.aggregate_scores.buying_path_discovery_score ?? "not_tested"}
                />
                <ScoreBar
                  label="Competitor substitution"
                  value={overview.latest_result.aggregate_scores.competitor_substitution_score}
                  inverse
                />
                <ScoreBar
                  label="Attribute readiness"
                  value={overview.latest_result.aggregate_scores.attribute_readiness_score}
                />
              </div>
              <div className="space-y-3 rounded-2xl border border-[color:var(--merchant-line)] bg-white/60 p-4">
                <div className="flex items-center gap-3">
                  <Bot className="h-5 w-5 text-[color:var(--merchant-brand)]" />
                  <div>
                    <p className="font-medium text-[color:var(--merchant-ink)]">
                      {overview.latest_job.status.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm text-[color:var(--merchant-muted)]">
                      {overview.latest_result.query_clusters.length} query clusters tested
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="merchant-overline">Runs</p>
                    <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
                      {overview.latest_result.test_runs.length}
                    </p>
                  </div>
                  <div>
                    <p className="merchant-overline">Issues</p>
                    <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
                      {overview.latest_result.issues.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyAgentState
              title="No demand scan yet"
              description="Create a store-scoped scan target, preview AI Test Credits, then run Gemini baseline demand tests."
              href="/agent-center/run"
              cta="Run Agent Scan"
            />
          )}
        </SurfaceCard>

        <div className="space-y-5">
          <SurfaceCard
            title="Credits & Usage"
            description="Merchant-facing usage uses AI Test Credits only."
            action={
              <Link href="/agent-center/usage" className="merchant-button-secondary">
                <WalletCards className="h-4 w-4" />
                <span>Usage</span>
              </Link>
            }
          >
            <div className="space-y-4 px-5 py-5">
              <ScoreBar
                label="Credits used"
                value={
                  overview?.usage
                    ? (overview.usage.used_credits /
                        Math.max(1, overview.usage.included_ai_test_credits)) *
                      100
                    : 0
                }
              />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="merchant-overline">Used</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--merchant-ink)]">
                    {overview?.usage.used_credits || 0}
                  </p>
                </div>
                <div>
                  <p className="merchant-overline">Remaining</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--merchant-ink)]">
                    {overview?.usage.remaining_credits || 0}
                  </p>
                </div>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard title="Assurance Usage Preview">
            <div className="divide-y divide-[color:var(--merchant-line)] text-sm">
              {[
                ["AI Test Credits", snapshot?.usage_summary?.ai_test_credits || 0],
                [
                  "Product Understanding Credits",
                  snapshot?.usage_summary?.product_understanding_credits || 0,
                ],
                [
                  "Offer Verification Credits",
                  snapshot?.usage_summary?.offer_verification_credits || 0,
                ],
                [
                  "Checkout Verification Credits",
                  snapshot?.usage_summary?.checkout_verification_credits || 0,
                ],
                [
                  "Resolution Plan Credits",
                  snapshot?.usage_summary?.resolution_plan_credits || 0,
                ],
              ].map(([name, value]) => (
                <div key={name} className="flex items-center justify-between px-5 py-3">
                  <span className="text-[color:var(--merchant-muted-strong)]">
                    {name}
                  </span>
                  <span className="font-semibold text-[color:var(--merchant-ink)]">
                    {value}
                  </span>
                </div>
              ))}
              <div className="px-5 py-4 text-[color:var(--merchant-muted)]">
                Billing mode: {snapshot?.usage_summary?.billing_mode || "preview_only"} ·
                Billing status:{" "}
                {snapshot?.usage_summary?.billing_status || "not_invoiced"}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard title="Workflow Shortcuts">
            <div className="divide-y divide-[color:var(--merchant-line)]">
              {[
                {
                  href: "/agent-center/run",
                  icon: Gauge,
                  label: "Run Agent Scan",
                  description: "Create target, readiness check, providers, credits preview.",
                },
                {
                  href: "/agent-center/issues",
                  icon: ClipboardList,
                  label: "Issue Inbox",
                  description: "Prioritized fixes with route-to-target decisions.",
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-white/50"
                >
                  <div className="flex items-start gap-3">
                    <item.icon className="mt-0.5 h-4 w-4 text-[color:var(--merchant-brand)]" />
                    <div>
                      <p className="font-medium text-[color:var(--merchant-ink)]">
                        {item.label}
                      </p>
                      <p className="text-sm text-[color:var(--merchant-muted)]">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[color:var(--merchant-muted)]" />
                </Link>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </div>
    </main>
  );
}
