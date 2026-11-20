"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient } from "@/lib/api-client";
import {
  deriveCredits,
  deriveStoreMode,
  type CreditsSummary,
  type StoreMode,
  type StoreSummary,
} from "@/lib/recovery-v2/mode";

/** Account-level facts every v2 screen shares: store mode, credits, and how
 * many product links the latest links-mode check covered. Fetched once by the
 * shell; screens call `refresh()` after a connect, sync or new run. */
export type RecoveryContextValue = {
  merchantId: string | null;
  mode: StoreMode;
  credits: CreditsSummary | null | "loading";
  linksCount: number | null;
  refresh: () => void;
};

const fallback: RecoveryContextValue = {
  merchantId: null,
  mode: { kind: "unknown" },
  credits: null,
  linksCount: null,
  refresh: () => {},
};

const RecoveryContext = createContext<RecoveryContextValue>(fallback);

export function useRecovery(): RecoveryContextValue {
  return useContext(RecoveryContext);
}

/** Static provider for fixture renders and tests. */
export function RecoveryContextStatic({ value, children }: { value: RecoveryContextValue; children: ReactNode }) {
  return <RecoveryContext.Provider value={value}>{children}</RecoveryContext.Provider>;
}

export function RecoveryProvider({ merchantId, children }: { merchantId: string | null; children: ReactNode }) {
  const [mode, setMode] = useState<StoreMode>({ kind: "loading" });
  const [credits, setCredits] = useState<CreditsSummary | null | "loading">("loading");
  const [linksCount, setLinksCount] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!merchantId) {
      setMode({ kind: "unknown" });
    } else {
      apiClient
        .getConnectedStores(merchantId)
        .then((stores: StoreSummary[]) => {
          if (!cancelled) setMode(deriveStoreMode(stores));
        })
        .catch(() => {
          if (!cancelled) setMode({ kind: "unknown" });
        });
    }
    apiClient
      .getBillingCurrentPeriod()
      .then((period) => {
        if (!cancelled) setCredits(deriveCredits(period));
      })
      .catch(() => {
        if (!cancelled) setCredits(null);
      });
    apiClient
      .listAuditRuns(1, "merchant_url")
      .then((runs) => {
        if (cancelled) return;
        const keys = runs[0]?.product_keys;
        setLinksCount(Array.isArray(keys) ? keys.length : null);
      })
      .catch(() => {
        if (!cancelled) setLinksCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [merchantId, tick]);

  const value = useMemo(
    () => ({ merchantId, mode, credits, linksCount, refresh }),
    [merchantId, mode, credits, linksCount, refresh],
  );
  return <RecoveryContext.Provider value={value}>{children}</RecoveryContext.Provider>;
}
