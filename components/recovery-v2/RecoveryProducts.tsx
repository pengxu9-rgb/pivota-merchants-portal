"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useRecovery } from "@/components/recovery-v2/RecoveryContext";
import { ProductsView, type CopyState, type ProductsState } from "@/components/recovery-v2/ProductsView";
import { buildProducts, productReportsFromRun, suggestedCopyFromDetail, type ProductRow } from "@/lib/recovery-v2/products";
import { isStoreConnected } from "@/lib/recovery-v2/mode";
import { runPhase } from "@/lib/recovery-v2/overview";

/** Products container: the latest finished catalog check when a store is
 * connected (else the latest links check) → per-product bands. Suggested copy
 * is read on demand for the selected product; publishing stays off. */
export function RecoveryProducts({ initialRef }: { initialRef?: { platform: string; platformProductId: string } | null }) {
  const { mode, linksCount, refresh } = useRecovery();
  const connected = isStoreConnected(mode);
  const [state, setState] = useState<ProductsState>({ kind: "loading" });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [copy, setCopy] = useState<CopyState>({ kind: "idle" });
  const [sync, setSync] = useState<"idle" | "running" | "started" | "failed">("idle");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (mode.kind === "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const done = (runs: { run_id: string | null }[]) => runs.find((run) => run.run_id && runPhase(run as never) === "done");
        let catalogRun = false;
        let payload: unknown = null;
        if (connected) {
          const run = done(await apiClient.listAuditRuns(5, "merchant"));
          if (run?.run_id) {
            payload = await apiClient.getAuditRunDetail(run.run_id);
            catalogRun = true;
          }
        }
        if (!payload) {
          const run = done(await apiClient.listAuditRuns(5, "merchant_url"));
          if (run?.run_id) payload = await apiClient.getUrlAuditRunDetail(run.run_id);
        }
        const rows = buildProducts(productReportsFromRun(payload));
        if (cancelled) return;
        setState(rows.length ? { kind: "ready", rows, catalogRun } : { kind: "none" });
        if (initialRef) {
          const match = rows.find((row) => row.ref?.platform === initialRef.platform && row.ref.platformProductId === initialRef.platformProductId);
          if (match) setSelectedKey(match.key);
        }
      } catch {
        if (!cancelled) setState({ kind: "error", retry });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, connected, mode.kind, retry, initialRef]);

  const selected = state.kind === "ready" ? state.rows.find((row) => row.key === selectedKey) ?? null : null;
  const copyMode = connected && state.kind === "ready" && state.catalogRun;
  useEffect(() => {
    if (!selected || !copyMode) return;
    if (!selected.ref) {
      setCopy({ kind: "no_ref" });
      return;
    }
    let cancelled = false;
    setCopy({ kind: "loading" });
    apiClient
      .getMerchantProductDetail(selected.ref.platform, selected.ref.platformProductId)
      .then((detail) => {
        if (cancelled) return;
        const found = suggestedCopyFromDetail(detail);
        setCopy(found ? { kind: "ready", copy: found } : { kind: "none" });
      })
      .catch(() => {
        if (!cancelled) setCopy({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [selected, copyMode]);

  const onSync = async () => {
    const platform = mode.kind === "connected" || mode.kind === "first_sync" ? mode.platformKey : undefined;
    if (!platform) return;
    setSync("running");
    try {
      await apiClient.syncPlatformProducts(platform);
      setSync("started");
      refresh();
    } catch {
      setSync("failed");
    }
  };

  return (
    <ProductsView
      state={state}
      mode={mode}
      linksCount={linksCount}
      selectedKey={selectedKey}
      copy={copy}
      sync={sync}
      onSelect={(row: ProductRow) => setSelectedKey(row.key)}
      onClose={() => setSelectedKey(null)}
      onSync={onSync}
    />
  );
}
