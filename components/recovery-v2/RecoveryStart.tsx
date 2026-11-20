"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConnectStoreModal from "@/components/ConnectStoreModal";
import { apiClient } from "@/lib/api-client";
import { useRecovery } from "@/components/recovery-v2/RecoveryContext";
import { StartView } from "@/components/recovery-v2/StartView";
import { CostModal, type CostModalPhase } from "@/components/recovery-v2/CostModal";
import { useUrlAuditRun, type UrlAuditRequest } from "@/lib/audit/useUrlAuditRun";
import { stashVisibilityHandoff } from "@/lib/visibility-handoff";

/** Start: connect a store (optional, recommended) or check product links,
 * through the run-cost modal. The run lifecycle is the URL check's own hook. */
export function RecoveryStart() {
  const router = useRouter();
  const { mode, credits, merchantId, refresh } = useRecovery();
  const [request, setRequest] = useState<UrlAuditRequest | null>(null);
  const [outcome, setOutcome] = useState<"idle" | "still_running" | "done">("idle");
  const [connectPlatform, setConnectPlatform] = useState<string | null>(null);
  const [canPurchase, setCanPurchase] = useState(false);
  const questionsEnabled = process.env.NEXT_PUBLIC_CONSUMER_ANSWER_ENABLED === "true";
  const tier = credits && credits !== "loading" ? credits.tier : null;
  const isPaid = !!tier && tier.toLowerCase() !== "free";

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getBillingPlans()
      .then((res) => {
        // Hidden unless the backend says purchases are allowed (it always
        // sends the field; a missing one is treated as "no").
        if (!cancelled) setCanPurchase(res?.off_platform_billing === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // quoteAll: every Start run is priced (read-only quote route) before it
  // can be started (review P2-2).
  const audit = useUrlAuditRun({
    quoteAll: true,
    onFinished: (_res, req) => {
      stashVisibilityHandoff({ urls: req.product_urls, website: req.website });
      setOutcome("done");
      refresh();
      router.push("/dashboard");
    },
    onStillRunning: (_runId, req) => {
      stashVisibilityHandoff({ urls: req.product_urls, website: req.website });
      setOutcome("still_running");
      refresh();
    },
  });

  const quote = request ? audit.quoteFor(request) : null;
  const phase: CostModalPhase =
    outcome !== "idle" ? outcome : audit.loading ? (!quote ? "quoting" : "running") : "review";

  const close = useCallback(() => {
    setRequest(null);
    setOutcome("idle");
    audit.setError(null);
  }, [audit]);

  return (
    <>
      <StartView
        mode={mode}
        isPaid={isPaid}
        canPurchase={canPurchase}
        questionsEnabled={questionsEnabled}
        onConnect={(platform) => {
          // The connect modal needs the merchant id; without it (stale
          // session) fall back to the existing Integrations page.
          if (merchantId) setConnectPlatform(platform);
          else router.push("/dashboard/integrations");
        }}
        onReview={(req) => {
          audit.setError(null);
          setOutcome("idle");
          setRequest(req);
        }}
      />
      {request ? (
        <CostModal
          request={request}
          phase={phase}
          quote={quote}
          quoteStale={false}
          error={audit.errorInfo}
          credits={credits}
          elapsedSec={audit.elapsedSec}
          canPurchase={canPurchase}
          onGetQuote={() => void audit.start(request)}
          onStart={() => void audit.start(request)}
          onClose={close}
        />
      ) : null}
      {connectPlatform && merchantId ? (
        <ConnectStoreModal
          key={connectPlatform}
          isOpen
          merchantId={merchantId}
          initialPlatform={connectPlatform}
          onClose={() => setConnectPlatform(null)}
          onSuccess={() => {
            setConnectPlatform(null);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}
