/**
 * Zustand store for the merchant fashion-field authoring thread.
 *
 * Scope:
 *   - Holds the in-progress thread state (cursor, drafts, outcomes, cadence)
 *   - Persists to localStorage so a merchant who navigates away and back
 *     resumes at the same product
 *   - Drives Screen 06 (structured one-by-one) cursor advancement
 *   - Accumulates PUT outcomes so Screen 08 (honest feedback) can render
 *     the skipped_payload_owned cases without re-fetching
 *
 * NOT in scope (deliberately):
 *   - Fetching the readiness payload — that lives in a React Query / SWR-style
 *     hook on the component, or here as a one-shot async on store init
 *   - Network calls themselves — components call apiClient and feed results
 *     into the store via the setters here
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  FashionFieldsDraft,
  FashionThreadState,
  FieldName,
  FieldOutcomeMap,
  IncompleteProduct,
  ReminderCadence,
} from "@/types/fashion-authoring";
import { productKey } from "@/types/fashion-authoring";

interface Actions {
  /** Initialize / refresh the queue from a fresh readiness fetch. */
  setQueue: (queue: IncompleteProduct[]) => void;
  /** Pivot to a different screen within the thread. */
  setScreen: (screen: FashionThreadState["screen"]) => void;
  /** Reset cursor to start; called when the queue is replaced. */
  resetCursor: () => void;
  /** Advance to the next product. Auto-pivots to "done" past the last one. */
  advanceCursor: () => void;
  /** Move cursor backward (e.g. user wants to revisit). */
  retreatCursor: () => void;
  /** Set draft field values for the current (or specified) product. */
  setDraft: (productKeyArg: string, draft: Partial<FashionFieldsDraft>) => void;
  /** Record per-field PUT outcomes. */
  recordOutcomes: (productKeyArg: string, outcomes: FieldOutcomeMap) => void;
  /** Persist user's cadence pick. */
  setCadence: (cadence: ReminderCadence) => void;
  /** Mark a product "no answer known" (queue exclusion list, Open Q §4). */
  markUnknown: (productKeyArg: string) => void;
  /** Reset everything (test / dev helper). */
  reset: () => void;
}

const initialState: FashionThreadState = {
  threadId: "",
  screen: "trigger",
  cursor: 0,
  queue: [],
  outcomes: {},
  drafts: {},
  cadence: undefined,
  unknownProductIds: [],
};

export const useMerchantFashionStore = create<FashionThreadState & Actions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setQueue: (queue) => {
        // Filter out unknownProductIds — they're terminally excluded.
        const { unknownProductIds } = get();
        const excluded = new Set(unknownProductIds);
        const filtered = queue.filter(
          (p) => !excluded.has(productKey(p)),
        );
        set({
          queue: filtered,
          cursor: 0,
          // New queue means stale drafts/outcomes for products no longer in it.
          // Keep the maps but they'll be looked up by key, so stale entries
          // simply sit unused. Cheap; no need to GC.
          threadId: get().threadId || `thread_${Date.now().toString(36)}`,
        });
      },

      setScreen: (screen) => set({ screen }),

      resetCursor: () => set({ cursor: 0 }),

      advanceCursor: () =>
        set((s) => {
          const next = s.cursor + 1;
          if (next >= s.queue.length) {
            // Past the end of the queue → outcome screen.
            // The component decides done vs honest-feedback based on
            // whether any outcomes contain "skipped_payload_owned".
            return { cursor: next, screen: outcomeScreenFor(s.outcomes) };
          }
          return { cursor: next };
        }),

      retreatCursor: () =>
        set((s) => ({ cursor: Math.max(0, s.cursor - 1) })),

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
        set((s) => ({
          unknownProductIds: s.unknownProductIds.includes(productKeyArg)
            ? s.unknownProductIds
            : [...s.unknownProductIds, productKeyArg],
          // Drop from queue so the cursor doesn't land on it next.
          queue: s.queue.filter((p) => productKey(p) !== productKeyArg),
        })),

      reset: () => set({ ...initialState, threadId: "" }),
    }),
    {
      name: "merchant-fashion-thread-v1",
      // Only persist the stuff that should survive navigation away.
      // Drafts persist so unsaved typing isn't lost. Outcomes persist so
      // the user can come back to the honest-feedback screen.
      partialize: (s) => ({
        threadId: s.threadId,
        screen: s.screen,
        cursor: s.cursor,
        queue: s.queue,
        outcomes: s.outcomes,
        drafts: s.drafts,
        cadence: s.cadence,
        unknownProductIds: s.unknownProductIds,
      }),
    },
  ),
);

/**
 * Where to land after the last product: 'honest_feedback' if any product's
 * outcomes contained a skipped_payload_owned (Shopify metafield kept ours),
 * otherwise 'done'.
 */
function outcomeScreenFor(outcomes: FashionThreadState["outcomes"]): FashionThreadState["screen"] {
  for (const productOutcomes of Object.values(outcomes)) {
    for (const o of Object.values(productOutcomes)) {
      if (o === "skipped_payload_owned") return "honest_feedback";
    }
  }
  return "done";
}

/** Convenience selector — the product the cursor is currently on. */
export function selectCurrentProduct(s: FashionThreadState): IncompleteProduct | undefined {
  return s.queue[s.cursor];
}

/** Convenience selector — products whose outcomes contain skipped_payload_owned. */
export function selectSkippedProducts(s: FashionThreadState): Array<{
  product: IncompleteProduct;
  skippedFields: FieldName[];
}> {
  const out: Array<{ product: IncompleteProduct; skippedFields: FieldName[] }> = [];
  for (const product of s.queue) {
    const key = productKey(product);
    const outcomes = s.outcomes[key];
    if (!outcomes) continue;
    const skipped: FieldName[] = [];
    for (const [field, outcome] of Object.entries(outcomes) as [FieldName, FieldOutcomeMap[FieldName]][]) {
      if (outcome === "skipped_payload_owned") skipped.push(field);
    }
    if (skipped.length) out.push({ product, skippedFields: skipped });
  }
  return out;
}
