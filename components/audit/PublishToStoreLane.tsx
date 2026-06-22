'use client';

import { useState } from 'react';
import { AlertCircle, Check, Loader2, Store } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

// Publish-to-store lane — the metafield rung's merchant surface (B step 2/3).
// Writes the previewed E1 copy to an app-owned Shopify metafield (pivota/ai_pdp)
// — NEVER body_html — ONLY on an explicit merchant click behind a confirm step.
//
// The single mutation call (apiClient.publishStorePdp) lives in THIS file so the
// copy-back card (PerSkuCopyToStore) stays render+copy-only and its no-write
// safety scan (verify-copyback-render.mjs) keeps passing. Server-side the write
// is gated + default-OFF; this lane only maps the {status} envelope to a UI
// state and never auto-fires (no useEffect / no fetch-on-mount).

type PublishState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'publishing' }
  | { kind: 'result'; status: string; message: string };

function publishMessage(status: string): string {
  switch (status) {
    case 'written':
      return 'Published to your store as an app metafield. Surface it in your theme — nothing on your live page changes until you do.';
    case 'blocked':
      return "Publishing to your store isn't enabled for this store yet.";
    case 'needs_write_products':
      return 'Your connected Shopify app is missing the write_products scope. Enable it on your custom app, then try again.';
    case 'no_copy':
      return "There's no suggested copy to publish for this product yet.";
    case 'store_missing':
      return 'No connected store found for this product.';
    default:
      return 'Could not publish. Please try again.';
  }
}

export function PublishToStoreLane({
  platform,
  platformProductId,
}: {
  platform: string;
  platformProductId: string;
}) {
  const [state, setState] = useState<PublishState>({ kind: 'idle' });

  // The ONLY mutation in this rung. Called exclusively from the Confirm onClick.
  async function publish() {
    setState({ kind: 'publishing' });
    try {
      const res = await apiClient.publishStorePdp(platform, platformProductId);
      const status = typeof res?.status === 'string' ? res.status : 'error';
      setState({ kind: 'result', status, message: publishMessage(status) });
    } catch {
      setState({ kind: 'result', status: 'error', message: publishMessage('error') });
    }
  }

  return (
    <div className="mt-2 rounded border border-emerald-200/70 bg-white p-2">
      <div className="flex items-center gap-1.5">
        <Store className="h-3.5 w-3.5 text-emerald-700" />
        <span className="text-[11px] font-semibold text-emerald-900">
          Publish to your store automatically
        </span>
      </div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-emerald-900/70">
        Pivota writes this copy to an app-owned metafield on your product — no manual
        paste. It never touches your live theme until you choose to surface it.
      </div>

      {state.kind === 'idle' ? (
        <button
          type="button"
          onClick={() => setState({ kind: 'confirming' })}
          className="mt-1.5 inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
        >
          Publish to my store
        </button>
      ) : null}

      {state.kind === 'confirming' ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-emerald-900/80">Publish this copy now?</span>
          <button
            type="button"
            onClick={publish}
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
          >
            Confirm publish
          </button>
          <button
            type="button"
            onClick={() => setState({ kind: 'idle' })}
            className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {state.kind === 'publishing' ? (
        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-emerald-900/70">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Publishing…
        </div>
      ) : null}

      {state.kind === 'result' ? (
        <div
          className={`mt-1.5 flex items-start gap-1.5 text-[11px] ${
            state.status === 'written' ? 'text-emerald-800' : 'text-amber-800'
          }`}
        >
          {state.status === 'written' ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
          ) : (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          )}
          <span>
            {state.message}{' '}
            {state.status !== 'written' ? (
              <button
                type="button"
                onClick={() => setState({ kind: 'idle' })}
                className="underline"
              >
                Back
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
