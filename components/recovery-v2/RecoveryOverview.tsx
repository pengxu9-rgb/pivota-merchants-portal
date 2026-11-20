"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useRecovery } from "@/components/recovery-v2/RecoveryContext";
import { OverviewView, type OverviewState } from "@/components/recovery-v2/OverviewView";
import { buildOverview, runPhase } from "@/lib/recovery-v2/overview";
import { isStoreConnected } from "@/lib/recovery-v2/mode";

/** Overview container: latest run → revenue-recovery projection → model. */
export function RecoveryOverview() {
  const { mode, linksCount } = useRecovery();
  const [state, setState] = useState<OverviewState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, []);
  const legacyHref = isStoreConnected(mode) ? "/dashboard/agent-center/ai-readiness" : "/dashboard/agent-center/url-audit";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [run] = await apiClient.listAuditRuns(1);
        const phase = runPhase(run);
        if (phase !== "done" || !run?.run_id) {
          if (!cancelled) setState({ kind: phase === "none" ? "none" : phase === "failed" ? "failed" : "running" });
          return;
        }
        const recovery = await apiClient.getRevenueRecovery(run.run_id);
        const model = buildOverview(recovery, { productCount: run.product_keys?.length ?? null });
        if (cancelled) return;
        setState(model ? { kind: "ready", model, checkedAt: run.completed_at ?? run.requested_at } : { kind: "legacy", reportHref: legacyHref });
      } catch {
        if (!cancelled) setState({ kind: "error", retry });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, legacyHref, retry]);

  return <OverviewView state={state} mode={mode} linksCount={linksCount} />;
}
