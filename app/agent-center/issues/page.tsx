"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Filter, Play } from "lucide-react";
import {
  MerchantLinkButton,
  PageHeader,
  SurfaceCard,
} from "@/components/ui/merchant-primitives";
import {
  agentFetch,
  FixTargetBadge,
  IssueTypeBadge,
  MetricTile,
} from "@/components/agent-center/agent-center-ui";

export default function IssueInboxPage() {
  const [issues, setIssues] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    void agentFetch<{ issues: any[] }>("/api/agent-center/issues").then((payload) =>
      setIssues(payload.issues)
    );
  }, []);

  const visibleIssues = useMemo(
    () =>
      filter === "all"
        ? issues
        : issues.filter((issue) => issue.issue_type === filter || issue.severity === filter || issue.status === filter),
    [filter, issues]
  );

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Issue Inbox"
        title="Agentic GMV Issues"
        description="Business issues generated from parsed provider output, product matching, visibility scoring, and fix target routing."
        actions={
          <MerchantLinkButton href="/agent-center/run" icon={Play}>
            Run Agent Scan
          </MerchantLinkButton>
        }
      />

      <SurfaceCard strong>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Total issues" value={issues.length} />
          <MetricTile
            label="High severity"
            value={issues.filter((issue) => issue.severity === "high").length}
            tone="critical"
          />
          <MetricTile
            label="Recommendation ready"
            value={issues.filter((issue) => issue.status === "recommendation_ready").length}
          />
          <MetricTile
            label="Resolved"
            value={issues.filter((issue) => issue.status === "resolved").length}
            tone="success"
          />
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="Filters"
        action={<Filter className="h-4 w-4 text-[color:var(--merchant-muted)]" />}
      >
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {[
            "all",
            "ai_visibility_loss",
            "competitor_substitution",
            "missing_attribute",
            "pivota_pdp_readiness_gap",
            "high",
            "resolved",
          ].map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "merchant-button-primary" : "merchant-button-secondary"}
              onClick={() => setFilter(value)}
            >
              <span>{value.replace(/_/g, " ")}</span>
            </button>
          ))}
        </div>
      </SurfaceCard>

      <div className="grid gap-4">
        {visibleIssues.map((issue) => (
          <Link
            key={issue.id}
            href={`/agent-center/issues/${issue.id}`}
            className="merchant-panel block transition hover:translate-y-[-1px] hover:bg-white/80"
          >
            <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <IssueTypeBadge type={issue.issue_type} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--merchant-muted)]">
                    {issue.severity}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--merchant-muted)]">
                    {issue.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-[color:var(--merchant-ink)]">
                    {issue.root_cause}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--merchant-muted)]">
                    {issue.recommended_action}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {issue.fix_targets.map((target: string) => (
                    <FixTargetBadge key={target} target={target} />
                  ))}
                </div>
              </div>
              <div className="grid min-w-[220px] grid-cols-2 gap-3 text-sm lg:text-right">
                <div>
                  <p className="merchant-overline">Visibility</p>
                  <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
                    {Math.round((issue.evidence?.visibility_rate || 0) * 100)}%
                  </p>
                </div>
                <div>
                  <p className="merchant-overline">GMV risk</p>
                  <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
                    {issue.estimated_gmv_at_risk}
                  </p>
                </div>
                <ArrowRight className="ml-auto hidden h-4 w-4 text-[color:var(--merchant-muted)] lg:block" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
