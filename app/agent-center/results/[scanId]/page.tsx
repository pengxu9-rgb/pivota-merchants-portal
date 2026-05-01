"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Inbox, RotateCcw } from "lucide-react";
import {
  MerchantLinkButton,
  PageHeader,
  SurfaceCard,
} from "@/components/ui/merchant-primitives";
import {
  agentFetch,
  IssueTypeBadge,
  MetricTile,
  ScoreBar,
} from "@/components/agent-center/agent-center-ui";

export default function ScanResultsPage() {
  const params = useParams<{ scanId: string }>();
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    if (!params.scanId) return;
    void agentFetch(`/api/agent-center/results/${params.scanId}`).then(setResults);
  }, [params.scanId]);

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Scan Results"
        title={results?.store?.store_name || "AI Demand Scan Results"}
        description="AI demand scenarios tested through provider adapters, normalized parsing, matching, scoring, and fix-targeted issues."
        actions={
          <>
            <MerchantLinkButton href="/agent-center/issues" icon={Inbox}>
              Issue Inbox
            </MerchantLinkButton>
            <MerchantLinkButton href="/agent-center/run" variant="secondary" icon={RotateCcw}>
              New Scan
            </MerchantLinkButton>
          </>
        }
      />

      <SurfaceCard strong>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5">
          <MetricTile
            label="Query clusters"
            value={results?.query_clusters?.length || 0}
          />
          <MetricTile
            label="AI test runs"
            value={results?.test_runs?.length || 0}
          />
          <MetricTile
            label="Product visibility"
            value={`${results?.aggregate_scores?.product_entity_visibility_score ?? results?.aggregate_scores?.visibility_score ?? 0}%`}
            tone="warning"
          />
          <MetricTile
            label="Substitution"
            value={`${results?.aggregate_scores?.competitor_substitution_score || 0}%`}
            tone="critical"
          />
          <MetricTile
            label="Open issues"
            value={results?.issues?.length || 0}
            tone={(results?.issues?.length || 0) > 0 ? "critical" : "success"}
          />
        </div>
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <SurfaceCard title="Aggregate Scores">
          <div className="space-y-5 px-5 py-5">
            <ScoreBar
              label="Product Visibility"
              value={results?.aggregate_scores?.product_entity_visibility_score ?? results?.aggregate_scores?.visibility_score ?? 0}
            />
            <ScoreBar
              label="Merchant Store Visibility"
              value={results?.aggregate_scores?.merchant_store_visibility_score ?? 0}
            />
            <ScoreBar
              label="Pivota Channel Visibility"
              value={results?.aggregate_scores?.pivota_pdp_visibility_score ?? 0}
            />
            <ScoreBar
              label="Executable Offer Visibility"
              value={results?.aggregate_scores?.executable_offer_visibility_score ?? "not_tested"}
            />
            <ScoreBar
              label="Recommendation rank"
              value={results?.aggregate_scores?.recommendation_rank_score || 0}
            />
            <ScoreBar
              label="Competitor substitution"
              value={results?.aggregate_scores?.competitor_substitution_score || 0}
              inverse
            />
            <ScoreBar
              label="Attribute readiness"
              value={results?.aggregate_scores?.attribute_readiness_score || 0}
            />
            <ScoreBar
              label="Pivota PDP readiness"
              value={results?.aggregate_scores?.pivota_pdp_readiness_score || 0}
            />
          </div>
        </SurfaceCard>

        <SurfaceCard title="Top Generated Issues">
          <div className="divide-y divide-[color:var(--merchant-line)]">
            {results?.issues?.slice(0, 8).map((issue: any) => (
              <Link
                key={issue.id}
                href={`/agent-center/issues/${issue.id}`}
                className="flex items-start justify-between gap-4 px-5 py-4 transition hover:bg-white/50"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <IssueTypeBadge type={issue.issue_type} />
                    <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--merchant-muted)]">
                      {issue.severity}
                    </span>
                  </div>
                  <p className="font-medium text-[color:var(--merchant-ink)]">
                    {issue.root_cause}
                  </p>
                  <p className="text-sm text-[color:var(--merchant-muted)]">
                    Estimated GMV at risk: {issue.estimated_gmv_at_risk} · Confidence:{" "}
                    {issue.estimated_gmv_at_risk_confidence || "low"}
                  </p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 text-[color:var(--merchant-muted)]" />
              </Link>
            ))}
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard title="Query Cluster Results">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[color:var(--merchant-line)] text-[color:var(--merchant-muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Cluster</th>
                <th className="px-5 py-3 font-medium">Intent</th>
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Queries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--merchant-line)]">
              {results?.query_clusters?.map((cluster: any) => (
                <tr key={cluster.id}>
                  <td className="px-5 py-3 font-medium text-[color:var(--merchant-ink)]">
                    {cluster.cluster_name}
                  </td>
                  <td className="px-5 py-3 text-[color:var(--merchant-muted)]">
                    {cluster.intent_type.replace(/_/g, " ")}
                  </td>
                  <td className="px-5 py-3 text-[color:var(--merchant-muted)]">
                    {cluster.priority}
                  </td>
                  <td className="px-5 py-3 text-[color:var(--merchant-muted)]">
                    {cluster.queries.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </main>
  );
}
