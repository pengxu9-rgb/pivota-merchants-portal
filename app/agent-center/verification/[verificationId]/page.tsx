"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PageHeader, SurfaceCard } from "@/components/ui/merchant-primitives";
import {
  agentFetch,
  MetricTile,
  ScoreBar,
} from "@/components/agent-center/agent-center-ui";

export default function VerificationPage() {
  const params = useParams<{ verificationId: string }>();
  const [verification, setVerification] = useState<any>(null);

  useEffect(() => {
    if (!params.verificationId) return;
    void agentFetch<{ verification: any }>(
      `/api/agent-center/verification/${params.verificationId}`
    ).then((payload) => setVerification(payload.verification));
  }, [params.verificationId]);

  const result = verification?.result;

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Before / After Verification"
        title={verification ? `Verification ${verification.id}` : "Verification Run"}
        description="Retests use the same query clusters, provider set, prompt templates, and model config unless changed by the merchant."
        actions={
          verification ? (
            <Link
              href={`/agent-center/issues/${verification.issue_id}`}
              className="merchant-button-secondary"
            >
              <span>Back to issue</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null
        }
      />

      <SurfaceCard strong>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Status" value={verification?.status || "..."} tone="success" />
          <MetricTile
            label="Before visibility"
            value={`${result?.before_visibility_score || 0}%`}
          />
          <MetricTile
            label="After visibility"
            value={`${result?.after_visibility_score || 0}%`}
            tone="success"
          />
          <MetricTile
            label="Substitution after"
            value={`${result?.after_competitor_substitution_score || 0}%`}
            tone="warning"
          />
        </div>
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <SurfaceCard title="Before">
          <div className="space-y-5 px-5 py-5">
            <ScoreBar
              label="Visibility score"
              value={result?.before_visibility_score || 0}
            />
            <ScoreBar
              label="Competitor substitution"
              value={result?.before_competitor_substitution_score || 0}
              inverse
            />
          </div>
        </SurfaceCard>
        <SurfaceCard title="After">
          <div className="space-y-5 px-5 py-5">
            <ScoreBar
              label="Visibility score"
              value={result?.after_visibility_score || 0}
            />
            <ScoreBar
              label="Competitor substitution"
              value={result?.after_competitor_substitution_score || 0}
              inverse
            />
            <div className="flex items-center gap-2 rounded-2xl bg-[color:var(--merchant-success-soft)] px-4 py-3 text-sm text-[color:var(--merchant-success)]">
              <CheckCircle2 className="h-4 w-4" />
              <span>Before/after verification stored with usage events.</span>
            </div>
          </div>
        </SurfaceCard>
      </div>
    </main>
  );
}
