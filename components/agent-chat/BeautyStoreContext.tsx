"use client";

/**
 * Context that injects a beauty store into the card-component tree.
 * `BeautyAgentChatSurface` provides either the care or tools store;
 * all child components read from `useBeautyStore()` instead of
 * importing a specific store directly — so both tabs share every card.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";

import type { BeautyStore } from "@/lib/merchant-beauty-store";
import type {
  BeautyThreadState,
  IncompleteBeautyProduct,
} from "@/types/beauty-authoring";
import { beautyProductKey } from "@/types/beauty-authoring";

const BeautyStoreContext = createContext<StoreApi<BeautyStore> | null>(null);

export function BeautyStoreProvider({
  store,
  children,
}: {
  store: StoreApi<BeautyStore>;
  children: ReactNode;
}) {
  return (
    <BeautyStoreContext.Provider value={store}>
      {children}
    </BeautyStoreContext.Provider>
  );
}

/** Drop-in replacement for `useMerchantBeauty*Store(selector)`. */
export function useBeautyStore<T>(selector: (s: BeautyStore) => T): T {
  const store = useContext(BeautyStoreContext);
  if (!store) throw new Error("useBeautyStore called outside BeautyStoreProvider");
  return useStore(store, selector);
}

// ── convenience selectors ──────────────────────────────────────────────────

export function selectCurrentBeautyProduct(
  s: BeautyThreadState
): IncompleteBeautyProduct | undefined {
  return s.queue[s.cursor];
}

export function selectSkippedBeautyProducts(s: BeautyThreadState): Array<{
  product: IncompleteBeautyProduct;
  skippedFields: string[];
}> {
  const out: Array<{ product: IncompleteBeautyProduct; skippedFields: string[] }> = [];
  for (const product of s.queue) {
    const key = beautyProductKey(product);
    const outcomes = s.outcomes[key];
    if (!outcomes) continue;
    const skipped: string[] = [];
    for (const [field, outcome] of Object.entries(outcomes)) {
      if (outcome === "skipped_payload_owned") skipped.push(field);
    }
    if (skipped.length) out.push({ product, skippedFields: skipped });
  }
  return out;
}
