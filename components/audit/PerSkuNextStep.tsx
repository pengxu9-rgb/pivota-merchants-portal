'use client';

import { useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type {
  AgentCenterPerSkuReport,
  SkuNextBestAction,
} from '@/lib/types/ai-readiness';
import { parseAuditProductKey } from '@/lib/audit/productKey';

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
  | { kind: 'graded'; claims: string[] }
  | { kind: 'no_claims' }
  | { kind: 'not_inci' }
  | { kind: 'error'; message: string };


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
  const [rawInci, setRawInci] = useState('');
  const [brandUrl, setBrandUrl] = useState('');
  const [state, setState] = useState<ContribState>({ kind: 'idle' });

  const canSave =
    (rawInci.trim().length > 0 || brandUrl.trim().length > 0) && state.kind !== 'saving';

  async function handleSave() {
    if (!canSave) return;
    setState({ kind: 'saving' });
    try {
      const res = await apiClient.submitProductEvidence({
        platform,
        platformProductId,
        rawInci: rawInci.trim() || undefined,
        brandUrl: brandUrl.trim() || undefined,
      });
      const status = res?.status;
      const claims: string[] = Array.isArray(res?.substantiated_claims)
        ? res.substantiated_claims
        : [];
      if (status === 'rejected_not_inci' || status === 'no_evidence') {
        // couldn't parse a pasted list, or the crawled page had no ingredients
        setState({ kind: 'not_inci' });
      } else if (claims.length > 0) {
        setState({ kind: 'graded', claims });
      } else {
        setState({ kind: 'no_claims' });
      }
    } catch (err: unknown) {
      setState({ kind: 'error', message: friendlyError(err) });
    }
  }

  if (state.kind === 'graded') {
    return (
      <div className="mt-2 rounded-md border border-green-300 bg-green-50 px-3 py-2.5 text-xs text-green-900">
        <div className="flex items-center gap-1.5 font-medium">
          <span aria-hidden>✓</span>
          {state.claims.length} ingredient-backed claim{state.claims.length === 1 ? '' : 's'} now on
          your Pivota page — AI can cite {state.claims.length === 1 ? 'it' : 'them'}.
        </div>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[11px] text-green-800">
          {state.claims.slice(0, 5).map((c, i) => (
            <li key={`claim-${i}`}>{c}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (state.kind === 'no_claims') {
    return (
      <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        We read your ingredients and saved them, but couldn&apos;t verify a benefit claim from them
        yet. A clearer ingredient list (or a lab report, coming soon) unlocks cited claims.
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
        Make this product AI-ready on your Pivota page
      </button>
    );
  }

  return (
    <div className="mt-2.5 rounded-md border border-indigo-200 bg-white px-3 py-3">
      <div className="text-xs text-slate-500">
        Give Pivota the evidence for{' '}
        <span className="font-medium text-slate-700">{productName}</span> and it builds the cited,
        claim-safe record AI shoppers read — you don&apos;t write the copy.
      </div>
      <Field label="Product page URL" hint="easiest — we read the ingredients off the page">
        <input
          type="url"
          value={brandUrl}
          onChange={(e) => setBrandUrl(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
          placeholder="https://yourbrand.com/products/…"
        />
      </Field>
      <div className="my-2 text-center text-[10px] uppercase tracking-wide text-slate-400">or</div>
      <Field label="Ingredient list (INCI)" hint="paste it straight from the label">
        <textarea
          rows={3}
          value={rawInci}
          onChange={(e) => setRawInci(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
          placeholder="Water, Niacinamide, Glycerin, Hydrolyzed Collagen, Adenosine…"
        />
      </Field>
      {state.kind === 'not_inci' ? (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          We couldn&apos;t read an ingredient list from that — paste the INCI (the comma-separated
          ingredients from the label), or a product page URL that lists them.
        </div>
      ) : null}
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
          {state.kind === 'saving' ? 'Verifying…' : 'Verify & add to my Pivota page'}
        </button>
        <span className="text-[11px] text-slate-500">
          Only ingredient-substantiated, claim-safe claims are surfaced to AI.
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
  const product = useMemo(() => parseAuditProductKey(report.product_key), [report.product_key]);
  // Prefer the backend's resolved identity.name (often the raw sku_title is a
  // bare variant label like "2 Box"); mirrors skuDisplayName in the page.
  const productName =
    report.identity?.name?.trim() || report.sku_title?.trim() || report.sku_key;

  if (!nba || (!nba.headline && !nba.first_move && !nba.why_this_first)) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5 text-[11px] text-slate-500">
        No specific next step for {productName} yet — it&apos;s either in good shape or needs
        more audit data. Re-run after enriching its details to get a recommendation.
      </div>
    );
  }

  const action = nba.cta?.action ?? 'none';
  const selfServe = (nba.self_serve && nba.self_serve.length > 0
    ? nba.self_serve
    : nba.self_serve_actions) ?? [];
  // The Pivota-page form (paste INCI / brand URL → evidence grading) applies
  // ONLY to request_enrichment: an indexed product whose canonical evidence the
  // merchant can enrich. It does NOT apply to request_indexing — that gap means
  // the SKU isn't crawlable/indexed yet, and the evidence-grading flow does
  // nothing for indexing. For request_indexing the backend already supplies the
  // deterministic publish/sitemap/crawlable checklist in self_serve /
  // self_serve_actions (PRIMARY_SKU_GET_INDEXED), which renders below as "Do this
  // yourself", plus the conditional "Once it's live and crawlable…" Pivota note.
  const showPivotaForm = action === 'request_enrichment' && !!product;
  // request_indexing has no INCI form (the evidence grader does nothing for an
  // un-indexed SKU), but Pivota DOES submit the canonical page for indexing and
  // track it (nba.pivota_assisted). Surface that as a proper "Pivota handles this"
  // lane parallel to the self-serve checklist — so the indexing case gets the same
  // "Pivota does it for you vs do it yourself" clarity enrichment already has —
  // instead of burying it as a one-line note. Informational only: the
  // request_indexing CTA is a no-op and GSC-connect lives in IntegrationCtaPanel.
  const pivotaAssistedNote =
    nba.pivota_assisted && nba.pivota_assisted.length > 0 ? nba.pivota_assisted[0] : null;
  const showPivotaInfoLane = !showPivotaForm && !!pivotaAssistedNote;
  const hasPivotaLane = showPivotaForm || showPivotaInfoLane;
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
      {/* The single most actionable one-liner — was computed but only used to gate
          visibility. Surface it as the lead action. */}
      {nba.first_move ? (
        <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50/60 px-2.5 py-1.5 text-sm font-medium text-indigo-900">
          <span className="font-semibold">Do this first:</span> {nba.first_move}
        </div>
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

        {showPivotaInfoLane && pivotaAssistedNote ? (
          <div className="rounded-md border-2 border-indigo-300 bg-indigo-50/60 p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-indigo-900">Pivota handles this</span>
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Automatic
              </span>
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-indigo-900/80">
              {pivotaAssistedNote}
            </div>
          </div>
        ) : null}

        {selfServe.length > 0 ? (
          <div className="rounded-md border border-current/20 bg-white/50 p-2.5">
            <div className="text-xs font-semibold opacity-80">
              {showPivotaForm
                ? 'Or update your own website'
                : hasPivotaLane
                ? 'Or do it yourself'
                : 'Do this yourself'}
            </div>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed opacity-80">
              {selfServe.slice(0, 3).map((step, idx) => (
                <li key={`ss-${idx}`}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      {tracking.length > 0 ? (
        <div className="mt-2.5 flex items-start gap-1.5 text-[11px] opacity-70">
          <span aria-hidden className="mt-0.5">◎</span>
          <span>You&apos;ll know it worked when {lowerFirst(tracking[0])}.</span>
        </div>
      ) : null}
    </div>
  );
}

function lowerFirst(s: string): string {
  const t = (s || '').trim();
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
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
