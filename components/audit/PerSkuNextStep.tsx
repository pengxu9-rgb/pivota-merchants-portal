'use client';

import { useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type {
  AgentCenterPerSkuReport,
  SkuNextBestAction,
} from '@/lib/types/ai-readiness';

// The per-SKU "What to do next" — two clearly-separated paths:
//   A. "Add to your Pivota page" — the merchant types the missing content into a
//      simple form; it goes onto the canonical Pivota PDP that AI shoppers read,
//      with no edits to their own store. This is the easy/primary path.
//   B. "Update your own website" — the deterministic self_serve checklist, for
//      operators who already manage their own product pages.
// Backend (next_best_action) already emits why_this_first / self_serve / cta
// {action, target_sku_key}; this component renders what the old UI dropped.

type ContribState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'live' }
  | { kind: 'in_review' }
  | { kind: 'saved_pending_enable' }
  | { kind: 'error'; message: string };

/** Audit product_key is `merchant_id|platform|platform_product_id`. We pass the
 *  platform + platform_product_id to the governance endpoints; the backend keys
 *  the contribution to the authed merchant. Returns null when not a 3-part key
 *  (e.g. external_seed / malformed) so we never show a button that can't work. */
function parseProductKey(
  productKey: string | null | undefined,
): { platform: string; platformProductId: string } | null {
  const parts = String(productKey ?? '').split('|');
  if (parts.length !== 3 || parts.some((p) => !p.trim())) return null;
  return { platform: parts[1], platformProductId: parts[2] };
}

function composeCopyDescription(fields: {
  whatIsIt: string;
  whoFor: string;
  howToUse: string;
  keyFacts: string;
}): string {
  return [
    fields.whatIsIt.trim(),
    fields.whoFor.trim() ? `Who it's for: ${fields.whoFor.trim()}` : '',
    fields.howToUse.trim() ? `How to use: ${fields.howToUse.trim()}` : '',
    fields.keyFacts.trim() ? `Key facts: ${fields.keyFacts.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function AddToPivotaPageForm({
  productName,
  platform,
  platformProductId,
}: {
  productName: string;
  platform: string;
  platformProductId: string;
}) {
  const [open, setOpen] = useState(false);
  const [whatIsIt, setWhatIsIt] = useState('');
  const [whoFor, setWhoFor] = useState('');
  const [howToUse, setHowToUse] = useState('');
  const [keyFacts, setKeyFacts] = useState('');
  const [state, setState] = useState<ContribState>({ kind: 'idle' });

  const canSave = whatIsIt.trim().length > 0 && state.kind !== 'saving';

  async function handleSave() {
    if (!canSave) return;
    setState({ kind: 'saving' });
    const description = composeCopyDescription({ whatIsIt, whoFor, howToUse, keyFacts });
    const payload = {
      description,
      summary: whatIsIt.trim(),
      generated_source: 'merchant_contribution',
    };
    try {
      await apiClient.submitPivotaPdpContribution({
        platform,
        platformProductId,
        moduleKey: 'copy',
        payload,
      });
    } catch (err: unknown) {
      setState({ kind: 'error', message: friendlyError(err) });
      return;
    }
    // Approve → GPT-5.5 gate publishes (and makes it agent-readable) when the
    // serving overlay (SKU_OPT_OVERLAY_V1) is enabled. When it isn't, the
    // approve route 404s with SKU_OPT_OVERLAY_V1_DISABLED — the content is still
    // saved to the Pivota page, it just isn't served to agents yet.
    try {
      const res = await apiClient.approvePivotaPdpModule({
        platform,
        platformProductId,
        moduleKey: 'copy',
      });
      if (res?.published) {
        setState({ kind: 'live' });
      } else {
        setState({ kind: 'in_review' });
      }
    } catch (err: unknown) {
      if (isOverlayDisabled(err)) {
        setState({ kind: 'saved_pending_enable' });
      } else {
        setState({ kind: 'error', message: friendlyError(err) });
      }
    }
  }

  if (state.kind === 'live' || state.kind === 'in_review' || state.kind === 'saved_pending_enable') {
    const copy =
      state.kind === 'live'
        ? 'Live on your Pivota page now — AI shoppers can read it.'
        : state.kind === 'in_review'
          ? 'Saved to your Pivota page — goes live to AI after a quick automated quality check.'
          : 'Saved to your Pivota page — it goes live to AI shoppers once Pivota enables serving.';
    return (
      <div className="mt-2 flex items-start gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-900">
        <span aria-hidden className="mt-0.5">✓</span>
        <span>{copy}</span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
      >
        Add details to your Pivota page
      </button>
    );
  }

  return (
    <div className="mt-2.5 rounded-md border border-indigo-200 bg-white px-3 py-3">
      <div className="text-xs text-slate-500">
        These fields are what AI shoppers read on your Pivota page for{' '}
        <span className="font-medium text-slate-700">{productName}</span>.
      </div>
      <div className="mt-2 space-y-2.5">
        <Field label="What is it?" hint="one or two plain sentences">
          <textarea
            rows={2}
            value={whatIsIt}
            onChange={(e) => setWhatIsIt(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
            placeholder="A nighttime low-molecular collagen supplement that supports skin elasticity…"
          />
        </Field>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Field label="Who is it for?">
            <input
              type="text"
              value={whoFor}
              onChange={(e) => setWhoFor(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              placeholder="Adults wanting overnight skin support"
            />
          </Field>
          <Field label="How to use">
            <input
              type="text"
              value={howToUse}
              onChange={(e) => setHowToUse(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              placeholder="1 stick before bed, daily"
            />
          </Field>
        </div>
        <Field label="Key facts buyers ask about" hint="ingredients, format, claims">
          <textarea
            rows={2}
            value={keyFacts}
            onChange={(e) => setKeyFacts(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
            placeholder="Low-molecular fish collagen 1,000mg · no added sugar…"
          />
        </Field>
      </div>
      {state.kind === 'error' ? (
        <div className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">
          {state.message}
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-2.5">
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="rounded-md border border-indigo-300 bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {state.kind === 'saving' ? 'Saving…' : 'Save to my Pivota page'}
        </button>
        <span className="text-[11px] text-slate-500">
          Saved instantly · published to AI shoppers after a quick quality check.
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-slate-700">
        {label}
        {hint ? <span className="font-normal text-slate-400"> — {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function PerSkuNextStep({ report }: { report: AgentCenterPerSkuReport }) {
  const nba: SkuNextBestAction | null | undefined = report.next_best_action;
  const product = useMemo(() => parseProductKey(report.product_key), [report.product_key]);
  // Prefer the backend's resolved identity.name (often the raw sku_title is a
  // bare variant label like "2 Box"); mirrors skuDisplayName in the page.
  const productName =
    report.identity?.name?.trim() || report.sku_title?.trim() || report.sku_key;

  if (!nba || (!nba.headline && !nba.first_move && !nba.why_this_first)) return null;

  const action = nba.cta?.action ?? 'none';
  const selfServe = (nba.self_serve && nba.self_serve.length > 0
    ? nba.self_serve
    : nba.self_serve_actions) ?? [];
  // The Pivota-page form applies when there's a content/indexing action the
  // merchant can author into the canonical PDP, and we can resolve the product.
  const showPivotaForm =
    (action === 'request_enrichment' || action === 'request_indexing') && !!product;
  const tracking = nba.tracking_metrics ?? [];

  return (
    <div className="mt-3 rounded-md border border-current/15 bg-white/40 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        What to do next
      </div>
      {nba.headline ? (
        <div className="mt-1 text-sm font-semibold">{nba.headline}</div>
      ) : null}
      {nba.why_this_first ? (
        <div className="mt-1 text-xs opacity-80">{nba.why_this_first}</div>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {showPivotaForm && product ? (
          <div className="rounded-md border-2 border-indigo-300 bg-indigo-50/60 p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-indigo-900">
                Add it to your Pivota page
              </span>
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Easiest
              </span>
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-indigo-900/80">
              Type the missing details here — they go straight onto your Pivota
              page, which AI shoppers read. No website edits needed.
            </div>
            <AddToPivotaPageForm
              productName={productName}
              platform={product.platform}
              platformProductId={product.platformProductId}
            />
          </div>
        ) : null}

        {selfServe.length > 0 ? (
          <div className="rounded-md border border-current/20 bg-white/50 p-2.5">
            <div className="text-xs font-semibold opacity-80">
              {showPivotaForm ? 'Or update your own website' : 'Do this yourself'}
            </div>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed opacity-80">
              {selfServe.slice(0, 3).map((step, idx) => (
                <li key={`ss-${idx}`}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      {!showPivotaForm && nba.pivota_assisted && nba.pivota_assisted.length > 0 ? (
        <div className="mt-2 text-xs opacity-70">
          <span className="font-medium">Pivota can help: </span>
          {nba.pivota_assisted[0]}
        </div>
      ) : null}

      {tracking.length > 0 ? (
        <div className="mt-2.5 flex items-start gap-1.5 text-[11px] opacity-70">
          <span aria-hidden className="mt-0.5">◎</span>
          <span>You'll know it worked when {lowerFirst(tracking[0])}.</span>
        </div>
      ) : null}
    </div>
  );
}

function lowerFirst(s: string): string {
  const t = (s || '').trim();
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

function isOverlayDisabled(err: unknown): boolean {
  const detail = errDetail(err);
  return typeof detail === 'string' && detail.includes('SKU_OPT_OVERLAY_V1_DISABLED');
}

function errDetail(err: unknown): unknown {
  if (err && typeof err === 'object') {
    const resp = (err as { response?: { data?: { detail?: unknown } } }).response;
    return resp?.data?.detail;
  }
  return undefined;
}

function friendlyError(err: unknown): string {
  const detail = errDetail(err);
  if (typeof detail === 'string') {
    if (detail.includes('FORBIDDEN')) return "This product isn't editable from this account.";
    if (detail.includes('NOT_FOUND')) return "We couldn't find this product's Pivota page.";
  }
  return 'Something went wrong saving this. Please try again.';
}
