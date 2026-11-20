"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { SourcesView, type SourcesActions, type SourcesState } from "@/components/recovery-v2/SourcesView";
import { buildSources, sourcesInputFromRun, type SourceRow } from "@/lib/recovery-v2/sources";
import { runPhase } from "@/lib/recovery-v2/overview";
import type { AuditRunSummary } from "@/lib/types/ai-readiness";

function latest(...lists: AuditRunSummary[][]): { run: AuditRunSummary; kind: "links" | "catalog" } | null {
  const tagged = [
    ...(lists[0] ?? []).map((run) => ({ run, kind: "links" as const })),
    ...(lists[1] ?? []).map((run) => ({ run, kind: "catalog" as const })),
  ].filter((item) => item.run?.run_id && runPhase(item.run) === "done");
  tagged.sort((a, b) => String(b.run.requested_at ?? "").localeCompare(String(a.run.requested_at ?? "")));
  return tagged[0] ?? null;
}

/** Sources container: latest finished run of either kind → outreach targets,
 * joined with the merchant's "pitch sent" tasks. */
export function RecoverySources() {
  const [state, setState] = useState<SourcesState>({ kind: "loading" });
  const [runId, setRunId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [linkRuns, catalogRuns] = await Promise.all([
          apiClient.listAuditRuns(5, "merchant_url"),
          apiClient.listAuditRuns(5, "merchant"),
        ]);
        const pick = latest(linkRuns, catalogRuns);
        if (!pick) {
          if (!cancelled) setState({ kind: "none" });
          return;
        }
        const payload = pick.kind === "links"
          ? await apiClient.getUrlAuditRunDetail(pick.run.run_id as string)
          : await apiClient.getAuditRunDetail(pick.run.run_id as string);
        const tasks = await apiClient.listMerchantTasks({ limit: 200 }).then((r) => r.tasks ?? []).catch(() => []);
        const rows = buildSources({ ...sourcesInputFromRun(payload), tasks });
        if (cancelled) return;
        setRunId(pick.run.run_id);
        setState(rows.length ? { kind: "ready", rows, canDraft: true } : { kind: "none" });
      } catch {
        if (!cancelled) setState({ kind: "error", retry });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, retry]);

  const markSent = useCallback(async (row: SourceRow) => {
    await apiClient.markPitchSent({
      host: row.host,
      // The view only offers "Mark as sent" when the run tied a shopper
      // question to this host (the backend keys the record on host + query).
      query: row.queries[0],
      state: row.state === "submission_only" ? "submission_only" : "draft_ready",
      tier: row.tier,
      recipient_email: row.recipientEmail,
      submission_url: row.submissionUrl,
      sku_key: row.skuKey ?? undefined,
      sku_title: row.skuTitle,
      audit_run_id: runId ?? undefined,
    });
    setState((current) =>
      current.kind === "ready"
        ? { ...current, rows: current.rows.map((r) => (r.host === row.host ? { ...r, sent: true, sentAt: new Date().toISOString() } : r)) }
        : current,
    );
  }, [runId]);

  const draftPitch = useCallback(async (row: SourceRow) => {
    if (!runId) throw new Error("no run");
    const res = await apiClient.startAuditAction({
      runId,
      headline: `Get cited on ${row.host}`,
      channelHost: row.host,
      query: row.queries[0] ?? undefined,
      skuTitle: row.skuTitle,
    });
    return { draft: res?.draft ?? null, charged: (res as { credits_charged?: number })?.credits_charged };
  }, [runId]);

  const actions: SourcesActions = { markSent, draftPitch };
  return <SourcesView state={state} actions={actions} />;
}
