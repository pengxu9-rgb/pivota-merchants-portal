/**
 * Zustand stores for the merchant beauty-field authoring thread.
 *
 * Two separate stores — one for beauty *care* products (skincare / haircare /
 * bath / body / makeup / fragrance) and one for beauty *tools* (brushes,
 * applicators, etc.). They share identical state shape and action logic but
 * use distinct localStorage keys so the cursor / draft state for one category
 * doesn't bleed into the other.
 *
 * All card components read the store via BeautyStoreContext (see
 * BeautyStoreContext.tsx) rather than importing a store directly, so the same
 * components can serve both tabs without duplication.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  BeautyFieldOutcomeMap,
  BeautyFieldsDraft,
  BeautyThreadState,
  BeautyTotals,
  IncompleteBeautyProduct,
  ReminderCadence,
} from "@/types/beauty-authoring";
import { beautyProductKey } from "@/types/beauty-authoring";

export interface BeautyStoreActions {
  setQueue: (queue: IncompleteBeautyProduct[], totals?: BeautyTotals | null) => void;
  setScreen: (screen: BeautyThreadState["screen"]) => void;
  resetCursor: () => void;
  advanceCursor: () => void;
  retreatCursor: () => void;
  jumpToProduct: (productKeyArg: string) => void;
  setDraft: (productKeyArg: string, draft: Partial<BeautyFieldsDraft>) => void;
  recordOutcomes: (productKeyArg: string, outcomes: BeautyFieldOutcomeMap) => void;
  setCadence: (cadence: ReminderCadence) => void;
  markUnknown: (productKeyArg: string) => void;
  reset: () => void;
}

export type BeautyStore = BeautyThreadState & BeautyStoreActions;

const initialState: BeautyThreadState = {
  threadId: "",
  screen: "trigger",
  cursor: 0,
  queue: [],
  outcomes: {},
  drafts: {},
  cadence: undefined,
  unknownProductIds: [],
  totals: null,
};

function persistName(variant: "care" | "tools"): string {
  if (typeof window === "undefined") return `merchant-beauty-${variant}-thread-v1-ssr`;
  try {
    const raw = window.localStorage.getItem("merchant_user");
    if (!raw) return `merchant-beauty-${variant}-thread-v1-anon`;
    const parsed = JSON.parse(raw) as { merchant_id?: unknown } | null;
    const id =
      parsed && typeof parsed.merchant_id === "string" ? parsed.merchant_id : "anon";
    return `merchant-beauty-${variant}-thread-v1-${id}`;
  } catch {
    return `merchant-beauty-${variant}-thread-v1-anon`;
  }
}

function sameProductSet(
  a: IncompleteBeautyProduct[],
  b: IncompleteBeautyProduct[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (beautyProductKey(a[i]) !== beautyProductKey(b[i])) return false;
  }
  return true;
}

function outcomeScreenFor(
  outcomes: BeautyThreadState["outcomes"]
): BeautyThreadState["screen"] {
  for (const productOutcomes of Object.values(outcomes)) {
    for (const o of Object.values(productOutcomes)) {
      if (o === "skipped_payload_owned") return "honest_feedback";
    }
  }
  return "done";
}

function makeBeautyStore(variant: "care" | "tools") {
  return create<BeautyStore>()(
    persist(
      (set, get) => ({
        ...initialState,

        setQueue: (queue, totals) => {
          const prev = get();
          const excluded = new Set(prev.unknownProductIds);
          const filtered = queue.filter((p) => !excluded.has(beautyProductKey(p)));
          const queueUnchanged = sameProductSet(prev.queue, filtered);
          set({
            queue: filtered,
            cursor: queueUnchanged
              ? Math.min(prev.cursor, Math.max(0, filtered.length - 1))
              : 0,
            outcomes: queueUnchanged ? prev.outcomes : {},
            drafts: queueUnchanged ? prev.drafts : {},
            threadId:
              prev.threadId || `beauty_${variant}_thread_${Date.now().toString(36)}`,
            totals: totals ?? prev.totals,
          });
        },

        setScreen: (screen) => set({ screen }),
        resetCursor: () => set({ cursor: 0 }),

        advanceCursor: () =>
          set((s) => {
            const next = s.cursor + 1;
            if (next >= s.queue.length) {
              return { cursor: next, screen: outcomeScreenFor(s.outcomes) };
            }
            return { cursor: next };
          }),

        retreatCursor: () =>
          set((s) => ({ cursor: Math.max(0, s.cursor - 1) })),

        jumpToProduct: (productKeyArg) =>
          set((s) => {
            const idx = s.queue.findIndex((p) => beautyProductKey(p) === productKeyArg);
            if (idx < 0) return {};
            return { cursor: idx, screen: "structured" };
          }),

        setDraft: (productKeyArg, draft) =>
          set((s) => ({
            drafts: {
              ...s.drafts,
              [productKeyArg]: { ...s.drafts[productKeyArg], ...draft },
            },
          })),

        recordOutcomes: (productKeyArg, outcomes) =>
          set((s) => ({
            outcomes: {
              ...s.outcomes,
              [productKeyArg]: { ...s.outcomes[productKeyArg], ...outcomes },
            },
          })),

        setCadence: (cadence) => set({ cadence }),

        markUnknown: (productKeyArg) =>
          set((s) => {
            const alreadyUnknown = s.unknownProductIds.includes(productKeyArg);
            const nextUnknown = alreadyUnknown
              ? s.unknownProductIds
              : [...s.unknownProductIds, productKeyArg];
            const nextQueue = s.queue.filter(
              (p) => beautyProductKey(p) !== productKeyArg
            );
            const nextCursor = Math.min(
              s.cursor,
              Math.max(0, nextQueue.length - 1)
            );
            const nextScreen: BeautyThreadState["screen"] =
              nextQueue.length === 0 && s.screen === "structured"
                ? "paused"
                : s.screen;
            return {
              unknownProductIds: nextUnknown,
              queue: nextQueue,
              cursor: nextCursor,
              screen: nextScreen,
            };
          }),

        reset: () => set({ ...initialState, threadId: "" }),
      }),
      {
        name: persistName(variant),
        partialize: (s) => ({
          threadId: s.threadId,
          screen: s.screen,
          cursor: s.cursor,
          queue: s.queue,
          outcomes: s.outcomes,
          drafts: s.drafts,
          cadence: s.cadence,
          unknownProductIds: s.unknownProductIds,
          totals: s.totals,
        }),
      }
    )
  );
}

/** Beauty care — skincare / haircare / bath / body / makeup / fragrance. */
export const useMerchantBeautyCareStore = makeBeautyStore("care");

/** Beauty tools — brushes, applicators, physical tools. */
export const useMerchantBeautyToolsStore = makeBeautyStore("tools");
