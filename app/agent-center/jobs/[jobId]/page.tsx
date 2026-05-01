"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, FileText, Inbox, WalletCards } from "lucide-react";
import {
  MerchantLinkButton,
  PageHeader,
  SurfaceCard,
} from "@/components/ui/merchant-primitives";
import {
  agentFetch,
  MetricTile,
  ScoreBar,
  StatusTimeline,
} from "@/components/agent-center/agent-center-ui";

export default function AgentScanJobPage() {
  const params = useParams<{ jobId: string }>();
  const [jobId, setJobId] = useState("");
  const [payload, setPayload] = useState<any>(null);

  useEffect(() => {
    if (!params.jobId) return;
    setJobId(params.jobId);
    void agentFetch(`/api/agent-center/demand-test-jobs/${params.jobId}`).then(setPayload);
  }, [params.jobId]);

  const results = payload?.results;
  const job = payload?.job;

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Scan Job Progress"
        title={job ? `Scan ${job.id}` : "Scan Job"}
        description="Progress through query generation, provider tests, parsing, matching, scoring, and issue generation."
        actions={
          jobId ? (
            <>
              <MerchantLinkButton href={`/agent-center/results/${jobId}`} icon={FileText}>
                Scan Results
              </MerchantLinkButton>
              <MerchantLinkButton href="/agent-center/issues" variant="secondary" icon={Inbox}>
                Issues
              </MerchantLinkButton>
            </>
          ) : null
        }
      />

      <SurfaceCard strong>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Status" value={job?.status?.replace(/_/g, " ") || "..."} />
          <MetricTile label="Estimated credits" value={job?.estimated_credits || 0} />
          <MetricTile label="Runs completed" value={results?.test_runs?.length || 0} />
          <MetricTile label="Issues generated" value={results?.issues?.length || 0} />
        </div>
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <SurfaceCard title="Progress Timeline">
          <StatusTimeline progress={job?.progress || []} />
        </SurfaceCard>

        <SurfaceCard
          title="Result Preview"
          action={
            jobId ? (
              <Link href={`/agent-center/results/${jobId}`} className="merchant-button-secondary">
                <span>Open results</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null
          }
        >
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
              label="Competitor substitution"
              value={results?.aggregate_scores?.competitor_substitution_score || 0}
              inverse
            />
            <ScoreBar
              label="Pivota PDP readiness"
              value={results?.aggregate_scores?.pivota_pdp_readiness_score || 0}
            />
            <Link href="/agent-center/usage" className="merchant-button-ghost">
              <WalletCards className="h-4 w-4" />
              <span>View Credits & Usage</span>
            </Link>
          </div>
        </SurfaceCard>
      </div>
    </main>
  );
}
