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

function deltaLabel(value: number | undefined) {
  const delta = Number(value || 0);
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export default function VerificationPage() {
  const params = useParams<{ verificationId: string }>();
  const [verification, setVerification] = useState<any>(null);

  useEffect(() => {
    if (!params.verificationId) return;
    void agentFetch<{ verification: any }>(
      `/api/agent-center/verification/${params.verificationId}`
    ).then((payload) => setVerification(payload.verification));
  }, [params.verificationId]);

  const before = verification?.before_scores?.aggregate_scores || {};
  const after = verification?.after_scores?.aggregate_scores || {};
  const delta = verification?.score_delta || {};

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Before / After Verification"
        title={verification ? `Verification ${verification.id}` : "Verification Run"}
        description="Retests use the same query clusters, provider set, prompt templates, and repetition count as the original issue scan."
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
            label="Product visibility delta"
            value={deltaLabel(delta.product_entity_visibility_score ?? delta.visibility_score)}
            tone={((delta.product_entity_visibility_score ?? delta.visibility_score) || 0) > 0 ? "success" : "neutral"}
          />
          <MetricTile
            label="Substitution delta"
            value={deltaLabel(delta.competitor_substitution_score)}
            tone={(delta.competitor_substitution_score || 0) < 0 ? "success" : "warning"}
          />
          <MetricTile
            label="Usage events"
            value={verification?.usage_event_ids?.length || 0}
          />
        </div>
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <SurfaceCard title="Before">
          <div className="space-y-5 px-5 py-5">
            <ScoreBar
              label="Product Visibility"
              value={before.product_entity_visibility_score ?? before.visibility_score ?? 0}
            />
            <ScoreBar
              label="Merchant Store Visibility"
              value={before.merchant_store_visibility_score || 0}
            />
            <ScoreBar
              label="Pivota Channel Visibility"
              value={before.pivota_pdp_visibility_score || 0}
            />
            <ScoreBar
              label="Executable Offer Visibility"
              value={before.executable_offer_visibility_score ?? "not_tested"}
            />
            <ScoreBar
              label="Competitor substitution"
              value={before.competitor_substitution_score || 0}
              inverse
            />
            <ScoreBar
              label="Attribute readiness"
              value={before.attribute_readiness_score || 0}
            />
            <ScoreBar
              label="Pivota PDP readiness"
              value={before.pivota_pdp_readiness_score || 0}
            />
            <p className="text-sm text-[color:var(--merchant-muted)]">
              GMV at risk: {verification?.before_scores?.estimated_gmv_at_risk || 0}
            </p>
          </div>
        </SurfaceCard>
        <SurfaceCard title="After">
          <div className="space-y-5 px-5 py-5">
            <ScoreBar
              label="Product Visibility"
              value={after.product_entity_visibility_score ?? after.visibility_score ?? 0}
            />
            <ScoreBar
              label="Merchant Store Visibility"
              value={after.merchant_store_visibility_score || 0}
            />
            <ScoreBar
              label="Pivota Channel Visibility"
              value={after.pivota_pdp_visibility_score || 0}
            />
            <ScoreBar
              label="Executable Offer Visibility"
              value={after.executable_offer_visibility_score ?? "not_tested"}
            />
            <ScoreBar
              label="Competitor substitution"
              value={after.competitor_substitution_score || 0}
              inverse
            />
            <ScoreBar
              label="Attribute readiness"
              value={after.attribute_readiness_score || 0}
            />
            <ScoreBar
              label="Pivota PDP readiness"
              value={after.pivota_pdp_readiness_score || 0}
            />
            <p className="text-sm text-[color:var(--merchant-muted)]">
              GMV at risk: {verification?.after_scores?.estimated_gmv_at_risk || 0}. Confidence:{" "}
              {verification?.after_scores?.estimated_gmv_at_risk_confidence || "low"}.
            </p>
            <div className="flex items-center gap-2 rounded-2xl bg-[color:var(--merchant-success-soft)] px-4 py-3 text-sm text-[color:var(--merchant-success)]">
              <CheckCircle2 className="h-4 w-4" />
              <span>Before/after verification stored with preview-only usage events.</span>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard title="Retest Scope">
        <div className="grid gap-3 px-5 py-5 text-sm md:grid-cols-4">
          <div>
            <p className="merchant-overline">Query clusters</p>
            <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
              {verification?.query_cluster_ids?.length || 0}
            </p>
          </div>
          <div>
            <p className="merchant-overline">Providers</p>
            <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
              {verification?.provider_set?.join(", ") || "..."}
            </p>
          </div>
          <div>
            <p className="merchant-overline">Prompt templates</p>
            <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
              {verification?.prompt_template_ids?.length || 0}
            </p>
          </div>
          <div>
            <p className="merchant-overline">Repetitions</p>
            <p className="mt-1 font-semibold text-[color:var(--merchant-ink)]">
              {verification?.repetition_count || 0}
            </p>
          </div>
        </div>
      </SurfaceCard>
    </main>
  );
}
