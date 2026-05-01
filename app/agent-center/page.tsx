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
  SurfaceCard,
} from "@/components/ui/merchant-primitives";
import {
  agentFetch,
  EmptyAgentState,
  MetricTile,
  ScoreBar,
} from "@/components/agent-center/agent-center-ui";

type OverviewPayload = {
  latest_job: any | null;
  latest_result: any | null;
  ai_visibility_score: number;
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

export default function AgentCenterPage() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void agentFetch<OverviewPayload>("/api/agent-center/overview")
      .then(setOverview)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Agentic GMV Assurance"
        title="Agentic GMV Center"
        description="Pivota tests your product visibility and recommendation readiness across AI demand scenarios."
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

      <SurfaceCard strong>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="AI visibility"
            value={loading ? "..." : `${overview?.ai_visibility_score || 0}%`}
            helper="Merchant product mentions"
            tone={(overview?.ai_visibility_score || 0) >= 50 ? "success" : "warning"}
          />
          <MetricTile
            label="Substitution"
            value={loading ? "..." : `${overview?.competitor_substitution_rate || 0}%`}
            helper="Higher means leakage"
            tone={(overview?.competitor_substitution_rate || 0) >= 60 ? "critical" : "neutral"}
          />
          <MetricTile
            label="Pivota PDP readiness"
            value={loading ? "..." : `${overview?.pivota_pdp_readiness_score || 0}%`}
            helper="Agent-facing product object"
            tone={(overview?.pivota_pdp_readiness_score || 0) >= 70 ? "success" : "warning"}
          />
          <MetricTile
            label="Open issues"
            value={loading ? "..." : overview?.open_issues || 0}
            helper="Evidence-backed fixes"
            tone={(overview?.open_issues || 0) > 0 ? "critical" : "success"}
          />
        </div>
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
                  label="Visibility score"
                  value={overview.latest_result.aggregate_scores.visibility_score}
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
