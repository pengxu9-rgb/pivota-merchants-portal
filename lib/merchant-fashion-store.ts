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
 * Codex review fixes:
 *   - Persist key is namespaced per merchant_id so two merchants on the
 *     same browser can't see each other's queue / drafts / outcomes
 *     (cross-merchant data leak, ship-blocker).
 *   - markUnknown clamps the cursor and transitions to the paused
 *     terminal screen when the filtered queue empties (was a dead-end).
 *   - setQueue clears outcomes + drafts when the product set changes,
 *     so a prior skipped_payload_owned can't route a fresh batch to the
 *     honest-feedback screen incorrectly.
 *   - setQueue preserves the cursor when the product set is unchanged
 *     (refresh on remount), so "I'll keep your spot" is actually true.
 *
 * NOT in scope (deliberately):
 *   - Fetching the readiness payload — that lives on the component
 *   - Network calls themselves — components call apiClient and feed
 *     results into the store via the setters here
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

/**
 * Persist-key namespace: the merchant_id from the auth blob in
 * localStorage. Two merchants on the same browser get disjoint
 * storage keys, so logout/login does not leak queue or draft state.
 *
 * Computed once at module load (i.e. once per page load) on the client.
 * On SSR or pre-auth pages it falls back to a placeholder; the
 * dashboard layout's auth guard means an authenticated merchant_id is
 * already in localStorage by the time this module loads on /dashboard/*.
 */
function persistName(): string {
  if (typeof window === "undefined") return "merchant-fashion-thread-v1-ssr";
  try {
    const raw = window.localStorage.getItem("merchant_user");
    if (!raw) return "merchant-fashion-thread-v1-anon";
    const parsed = JSON.parse(raw) as { merchant_id?: unknown } | null;
    const id = parsed && typeof parsed.merchant_id === "string"
      ? parsed.merchant_id
      : "anon";
    return `merchant-fashion-thread-v1-${id}`;
  } catch {
    return "merchant-fashion-thread-v1-anon";
  }
}

/** Two queues share the same product set iff they have identical
 *  product_keys in the same order. Stricter than equality but cheaper
 *  than a set comparison — and the fetch is stable-ordered server-side. */
function sameProductSet(a: IncompleteProduct[], b: IncompleteProduct[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (productKey(a[i]) !== productKey(b[i])) return false;
  }
  return true;
}

export const useMerchantFashionStore = create<FashionThreadState & Actions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setQueue: (queue) => {
        const prev = get();
        const excluded = new Set(prev.unknownProductIds);
        const filtered = queue.filter((p) => !excluded.has(productKey(p)));
        const queueUnchanged = sameProductSet(prev.queue, filtered);

        set({
          queue: filtered,
          // Preserve cursor when the product set is unchanged — the
          // merchant's "I'll keep your spot" message is then literally
          // true. Otherwise reset to the head of the new queue.
          cursor: queueUnchanged ? Math.min(prev.cursor, Math.max(0, filtered.length - 1)) : 0,
          // Clear outcomes + drafts when the product set changes. Stale
          // outcomes from a prior queue must NOT influence the next
          // batch's outcome-screen routing.
          outcomes: queueUnchanged ? prev.outcomes : {},
          drafts: queueUnchanged ? prev.drafts : {},
          threadId: prev.threadId || `thread_${Date.now().toString(36)}`,
        });
      },

      setScreen: (screen) => set({ screen }),

      resetCursor: () => set({ cursor: 0 }),

      advanceCursor: () =>
        set((s) => {
          const next = s.cursor + 1;
          if (next >= s.queue.length) {
            // Past the end of the queue → outcome screen.
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
        set((s) => {
          const alreadyUnknown = s.unknownProductIds.includes(productKeyArg);
          const nextUnknown = alreadyUnknown
            ? s.unknownProductIds
            : [...s.unknownProductIds, productKeyArg];
          const nextQueue = s.queue.filter((p) => productKey(p) !== productKeyArg);
          // Clamp cursor — the old cursor might have pointed past the end.
          const nextCursor = Math.min(s.cursor, Math.max(0, nextQueue.length - 1));
          // If the queue is now empty the merchant has terminally opted
          // out of the prompt — route to the paused terminal screen, NOT
          // to "done" (which falsely says "catalog is covered").
          const nextScreen: FashionThreadState["screen"] =
            nextQueue.length === 0 && s.screen === "structured" ? "paused" : s.screen;
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
      name: persistName(),
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
