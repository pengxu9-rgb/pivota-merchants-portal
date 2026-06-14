'use client';

/**
 * Merchant self-service AI Commerce Readiness Audit (v3 — per-SKU).
 *
 * Pick 1–50 of your own SKUs → preview cost → launch credit-gated audit →
 * see per-SKU scorecards (Identity / Content / Routability / Citation) +
 * brand rollup + authority host map + priority queue.
 *
 * Two render paths: `audit_mode='per_sku'` uses the v3 per-SKU dashboard;
 * `audit_mode='legacy'` (or absent) falls back to the original brand
 * verdict renderer for backward compat.
 *
 * Cost guards:
 *   - Credit pre-flight (spec §I) is authoritative; launch returns 402 if
 *     balance insufficient. We never auto-shrink scope.
 *   - Free tier keeps the 2-audits-per-24h rate limit alongside credits.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Loader2,
} from 'lucide-react';
import { apiClient, InsufficientCreditsError } from '@/lib/api-client';
import {
  MerchantButton,
  PageHeader,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';
import { MerchantTaskQueuePanel } from '@/components/audit/MerchantTaskQueuePanel';
import { MerchantExecutorActivityPanel } from '@/components/audit/MerchantExecutorActivityPanel';
import type {
  AgentCenterBdBrandReport,
  AgentCenterBdCoOccurrenceVerification,
  AgentCenterBdMatchedCreator,
  AgentCenterBdPitchDraft,
  AgentCenterBdQueryRow,
  AgentCenterBdReport,
  AgentCenterBdVerdictLabel,
  AgentCenterAuditPreviewResponse,
  AgentCenterPerSkuAuditResponse,
  AgentCenterPerSkuReport,
  AgentCenterBrandRollup,
  AgentCenterAuthorityMap,
  AgentCenterCostSummary,
  AuthorityHostEntry,
  AuthorityRedditSubreddit,
  AiReadinessAuditResponse,
  SkuScoreBand,
  SkuDimensionScore,
  SkuProviderCitation,
  ModelsCited,
  BrandProviderCitation,
  SkuNextBestAction,
  CustomPromptResult,
  CustomPromptLane,
} from '@/lib/types/ai-readiness';

/**
 * Catalog row shape returned by apiClient.getProducts(). The response
 * is heterogeneous — some products carry their fields under a `standard`
 * sub-object, others have them at the top level. The normalization
 * helpers below mirror what the existing /dashboard/products page does
 * (see app/dashboard/products/page.tsx:105–141 for the canonical
 * fallback chain).
 */
interface CatalogProductRow {
  platform_product_id?: string;
  platform?: string;
  product_id?: string;
  id?: string;
  sku?: string;
  title?: string;
  name?: string;
  price?: number | { value?: number; currency?: string };
  currency?: string;
  standard?: {
    title?: string;
    main_image_url?: string;
    sku?: string;
    price?: number | { value?: number; currency?: string };
    currency?: string;
    product_id?: string;
    id?: string;
    platform?: string;
  };
}

function pickTitle(p: CatalogProductRow): string {
  const standard = p.standard ?? {};
  return standard.title || p.title || p.name || '';
}

function pickSku(p: CatalogProductRow): string {
  const standard = p.standard ?? {};
  return standard.sku || p.sku || '';
}

function pickPlatform(p: CatalogProductRow): string {
  const standard = p.standard ?? {};
  return p.platform || standard.platform || '';
}

function pickPlatformProductId(p: CatalogProductRow): string {
  const standard = p.standard ?? {};
  return (
    p.platform_product_id ||
    standard.product_id ||
    standard.id ||
    p.product_id ||
    p.id ||
    ''
  );
}

function pickPriceNumber(p: CatalogProductRow): number {
  const standard = p.standard ?? {};
  const raw = standard.price ?? p.price;
  if (typeof raw === 'number') return raw;
  if (raw && typeof raw === 'object' && typeof raw.value === 'number')
    return raw.value;
  return 0;
}

function pickCurrency(p: CatalogProductRow): string {
  const standard = p.standard ?? {};
  const raw = standard.price ?? p.price;
  if (raw && typeof raw === 'object' && typeof raw.currency === 'string')
    return raw.currency;
  return standard.currency || p.currency || 'USD';
}

// Spec §I — launch cap raised from 5 → 50 SKUs because the credit pre-flight
// (POST /api/audits/preview) is now the authoritative cost gate. Larger
// audits debit proportionally more audit_credits at launch.
const MAX_SELECTED = 50;
const QUICK_PICK_SIZES = [10, 25, MAX_SELECTED] as const;
const MAX_CUSTOM_PROMPTS = 10;
const PREVIEW_DEBOUNCE_MS = 300;

type LaunchResult =
  | { mode: 'legacy'; payload: AiReadinessAuditResponse }
  | { mode: 'per_sku'; payload: AgentCenterPerSkuAuditResponse };

export default function AiReadinessAuditPage() {
  const [products, setProducts] = useState<CatalogProductRow[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // key = "platform:source_id"

  const [running, setRunning] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<LaunchResult | null>(null);
  const [insufficient, setInsufficient] = useState<InsufficientCreditsError | null>(null);

  // Custom prompts — reserved slots for marketing-team use-case prompts
  // (hydration / acne / picky-eaters / etc.). Up to 10; trim + dedupe
  // client-side; >10 surfaces inline error.
  const [customPromptsText, setCustomPromptsText] = useState('');

  // Preview state — spec §I. The preview endpoint runs no probes; it
  // returns projected cost + current balance + sufficient flag. We
  // debounce calls to it as the merchant adjusts SKU selection.
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<AgentCenterAuditPreviewResponse | null>(null);
  const previewRequestSeqRef = useRef(0); // race-guards stale responses
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Merchant id is needed for preview + launch. We don't have a direct
  // getter on apiClient today, but the backend resolves it from the
  // session cookie — we send the placeholder 'self' and let the backend
  // attach the authenticated merchant_id server-side. If a downstream
  // refactor surfaces the merchant id client-side, swap this for that.
  const merchantId = 'self';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await apiClient.getProducts();
        if (cancelled) return;
        setProducts(Array.isArray(list) ? list : []);
      } catch (err) {
        if (cancelled) return;
        setProductsError(
          err instanceof Error ? err.message : 'Failed to load catalog.',
        );
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build a stable composite key for selection state. Some rows arrive
  // without platform_product_id under `standard.product_id` instead;
  // pickPlatformProductId handles the fallback chain.
  const productKey = (p: CatalogProductRow) =>
    `${pickPlatform(p)}:${pickPlatformProductId(p)}`;

  // Drop any product that lacks both platform AND a resolvable id —
  // we can't audit it (the backend needs platform + source_product_id).
  const usableProducts = useMemo(
    () =>
      products.filter(
        (p) => pickPlatform(p) && pickPlatformProductId(p),
      ),
    [products],
  );

  const sortedByPrice = useMemo(
    () =>
      [...usableProducts].sort(
        (a, b) => pickPriceNumber(b) - pickPriceNumber(a),
      ),
    [usableProducts],
  );

  const toggle = (p: CatalogProductRow) => {
    setSelected((prev) => {
      const k = productKey(p);
      const next = new Set(prev);
      if (next.has(k)) {
        next.delete(k);
      } else if (next.size < MAX_SELECTED) {
        next.add(k);
      }
      return next;
    });
  };

  const fillTopByPrice = (n: number) => {
    const top = sortedByPrice.slice(0, Math.min(n, MAX_SELECTED)).map(productKey);
    setSelected(new Set(top));
  };
  const fillFirstN = (n: number) => {
    const top = usableProducts.slice(0, Math.min(n, MAX_SELECTED)).map(productKey);
    setSelected(new Set(top));
  };
  const clear = () => setSelected(new Set());

  const selectedRefs = useMemo(
    () =>
      Array.from(selected).map((k) => {
        const [platform, source_product_id] = k.split(':');
        return { platform, source_product_id };
      }),
    [selected],
  );

  // Synthetic sku_keys for the preview/launch endpoints. The backend
  // resolves `platform:source_product_id` to the catalog row's
  // `sku_key` server-side; we send the composite for now to keep the
  // client model honest about what the merchant picked.
  const selectedSkuKeys = useMemo(
    () => Array.from(selected),
    [selected],
  );

  // Parse custom prompts: split on newline, trim, drop empties, dedupe.
  // Validation is "soft" — we only block launch if count > MAX_CUSTOM_PROMPTS;
  // duplicates are silently merged so the merchant doesn't fight the UI.
  const customPromptsParsed = useMemo(() => {
    const lines = customPromptsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of lines) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
    return out;
  }, [customPromptsText]);

  const customPromptsError = useMemo(() => {
    if (customPromptsParsed.length > MAX_CUSTOM_PROMPTS) {
      return `Too many custom prompts: ${customPromptsParsed.length} / ${MAX_CUSTOM_PROMPTS} max reserved slots per audit.`;
    }
    return null;
  }, [customPromptsParsed]);

  // Debounced preview — runs whenever the selection or custom prompts
  // change. We use a request-sequence ref to discard stale responses
  // when the user clicks rapidly. Spec §I + memory feedback_llm_call_multipliers
  // — debounce protects the backend from hammering as merchants toggle.
  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (selectedSkuKeys.length < 1 || customPromptsError) {
      setPreviewData(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    previewTimerRef.current = setTimeout(() => {
      const seq = ++previewRequestSeqRef.current;
      setPreviewLoading(true);
      setPreviewError(null);
      apiClient
        .previewAudit({
          merchant_id: merchantId,
          scope: { sku_keys: selectedSkuKeys },
          prompts_per_sku: 40,
          custom_prompts: customPromptsParsed,
          providers: ['gemini'],
        })
        .then((res) => {
          if (seq !== previewRequestSeqRef.current) return; // stale
          setPreviewData(res);
        })
        .catch((err) => {
          if (seq !== previewRequestSeqRef.current) return; // stale
          const msg =
            err instanceof Error
              ? err.message
              : 'preview unavailable — try again';
          setPreviewError(msg);
          setPreviewData(null);
        })
        .finally(() => {
          if (seq === previewRequestSeqRef.current) setPreviewLoading(false);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [selectedSkuKeys, customPromptsParsed, customPromptsError]);

  const previewSufficient = previewData?.sufficient === true;

  const runAudit = async () => {
    if (selectedRefs.length < 1 || selectedRefs.length > MAX_SELECTED) return;
    if (customPromptsError) return;
    // Hard block when preview says insufficient. Per memory
    // feedback_no_execution_layer_fallbacks: never auto-shrink scope.
    if (previewData && !previewData.sufficient) return;
    setRunning(true);
    setAuditError(null);
    setInsufficient(null);
    setAuditResult(null);
    const idempotencyKey = `audit_run_${merchantId}_${Date.now()}`;
    try {
      const res = await apiClient.runPerSkuAudit({
        merchant_id: merchantId,
        sku_keys: selectedSkuKeys,
        prompts_per_sku: 40,
        custom_prompts: customPromptsParsed,
        providers: ['gemini'],
        idempotency_key: idempotencyKey,
      });
      setAuditResult({ mode: 'per_sku', payload: res });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        setInsufficient(err);
      } else {
        // Surface backend-supplied detail for 429 / 422 / 404 (legacy
        // shapes still apply on the launch endpoint).
        const e = err as {
          response?: { status?: number; data?: { detail?: unknown } };
          message?: string;
        };
        const status = e.response?.status;
        const detail = e.response?.data?.detail;
        if (status === 429) {
          const d = detail as { next_reset_in_seconds?: number; limit?: number };
          const hrs = d?.next_reset_in_seconds
            ? Math.ceil(d.next_reset_in_seconds / 3600)
            : 24;
          setAuditError(
            `Free-tier daily audit budget used (${d?.limit || 2}/24h). Resets in ~${hrs}h. Upgrade your plan to remove the rate limit.`,
          );
        } else if (status === 422 && typeof detail === 'object' && detail) {
          const d = detail as { message?: string };
          setAuditError(d.message || 'Validation error.');
        } else if (status === 404 && typeof detail === 'object' && detail) {
          const d = detail as { message?: string };
          setAuditError(d.message || 'Some products not found in your catalog.');
        } else {
          setAuditError(
            e.message || 'Audit failed. Try again in a few seconds.',
          );
        }
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="v3"
        title="AI Commerce Readiness Audit"
        description="Audit up to 50 of your SKUs against AI shopping agents (Gemini grounded search; DeepSeek verification). Per-SKU scorecards: Identity / Content / Routability / Citation. Coverage is credit-driven — preview the cost before launch."
      />

      <SurfaceCard
        title="1. Pick 1–50 SKUs to audit"
        description={`${selected.size} of ${MAX_SELECTED} selected · ~40 prompts per SKU · ~${selected.size * 40} grounded probes`}
        action={
          <div className="flex flex-wrap gap-2">
            {QUICK_PICK_SIZES.map((n) => (
              <MerchantButton
                key={`top-${n}`}
                variant="ghost"
                onClick={() => fillTopByPrice(n)}
                disabled={running}
              >
                Top {n} by price
              </MerchantButton>
            ))}
            <MerchantButton variant="ghost" onClick={() => fillFirstN(10)} disabled={running}>
              First 10
            </MerchantButton>
            <MerchantButton variant="ghost" onClick={clear} disabled={running}>
              Clear
            </MerchantButton>
          </div>
        }
      >
        <div className="px-5 py-4">
          {productsLoading ? (
            <p className="text-sm text-slate-500">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Loading your catalog…
            </p>
          ) : productsError ? (
            <p className="text-sm text-red-700">{productsError}</p>
          ) : usableProducts.length === 0 ? (
            <p className="text-sm text-slate-500">
              {products.length === 0
                ? 'No products in your catalog yet. Connect Shopify on the integrations page first.'
                : `${products.length} product(s) loaded but none have a usable platform + product ID — likely a catalog sync issue.`}
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="w-10 py-2 pl-3"></th>
                    <th className="py-2">Title</th>
                    <th className="py-2">SKU</th>
                    <th className="py-2">Platform</th>
                    <th className="py-2 pr-3 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {usableProducts.slice(0, 200).map((p) => {
                    const k = productKey(p);
                    const checked = selected.has(k);
                    const disabled =
                      !checked && selected.size >= MAX_SELECTED;
                    const title = pickTitle(p) || '(untitled)';
                    const sku = pickSku(p) || '—';
                    const platform = pickPlatform(p) || '—';
                    const price = pickPriceNumber(p);
                    const currency = pickCurrency(p);
                    return (
                      <tr
                        key={k}
                        className={`border-t ${
                          checked ? 'bg-indigo-50/50' : ''
                        } ${disabled ? 'opacity-50' : ''}`}
                      >
                        <td className="py-2 pl-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled || running}
                            onChange={() => toggle(p)}
                          />
                        </td>
                        <td className="py-2">{title}</td>
                        <td className="py-2 font-mono text-xs text-slate-600">
                          {sku}
                        </td>
                        <td className="py-2 text-xs text-slate-600">
                          {platform}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {price > 0
                            ? `${
                                currency === 'USD' ? '$' : `${currency} `
                              }${price.toFixed(2)}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="2. Custom prompts (optional)"
        description={`Marketing team's use-case prompts — hydration, acne, picky eaters, AG1-alternative, etc. ${customPromptsParsed.length} / ${MAX_CUSTOM_PROMPTS} reserved slots used.`}
      >
        <div className="px-5 py-4">
          <textarea
            className="w-full rounded border border-slate-300 p-2 font-mono text-sm focus:border-indigo-500 focus:outline-none"
            rows={4}
            value={customPromptsText}
            onChange={(e) => setCustomPromptsText(e.target.value)}
            placeholder={
              'best supplement for new moms post-partum\n' +
              'greens gummies for travelers\n' +
              'kids vitamins for picky eaters\n' +
              '(one prompt per line — max 10)'
            }
            disabled={running}
          />
          {customPromptsError ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {customPromptsError}
            </p>
          ) : null}
          {customPromptsParsed.length > 0 && !customPromptsError ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {customPromptsParsed.map((p, idx) => (
                <span
                  key={`prompt-${idx}`}
                  className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-900"
                >
                  <span className="rounded-sm bg-indigo-200 px-1 text-[10px] uppercase tracking-wide text-indigo-900">
                    your prompt
                  </span>
                  {p}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="3. Preview audit cost"
        description="Estimated credits + current balance. Coverage is credit-driven; we never auto-shrink scope to fit available credits — the merchant decides."
      >
        <div className="px-5 py-4">
          <CostMeterPanel
            selectedCount={selected.size}
            customPromptCount={customPromptsParsed.length}
            customPromptsError={customPromptsError}
            previewLoading={previewLoading}
            previewError={previewError}
            previewData={previewData}
          />
        </div>
      </SurfaceCard>

      <div className="flex items-center justify-between rounded border border-indigo-200 bg-indigo-50/50 px-4 py-3">
        <div className="text-sm text-slate-700">
          {previewData?.current_balance?.plan_tier === 'free' ? (
            <>
              Free tier: <strong>2 audits per 24h</strong> rate limit applies
              alongside credits. Paid tiers bypass the rate limit.
            </>
          ) : (
            <>
              Credit-driven coverage. 1 audit credit = 1 SKU × 40 prompts.
              Custom prompts consume prompt-credits at 1/40 the rate.
            </>
          )}
        </div>
        <MerchantButton
          onClick={runAudit}
          disabled={
            running ||
            selected.size < 1 ||
            selected.size > MAX_SELECTED ||
            !!customPromptsError ||
            !!previewError ||
            (previewData !== null && !previewSufficient)
          }
        >
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Brain className="mr-2 h-4 w-4" />
              Run audit on {selected.size} selected
            </>
          )}
        </MerchantButton>
      </div>

      {insufficient ? (
        <InsufficientCreditsBanner error={insufficient} />
      ) : null}

      {auditError ? (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-900">{auditError}</p>
          </div>
        </div>
      ) : null}

      {auditResult?.mode === 'per_sku' ? (
        <>
          <PerSkuAuditReportRenderer report={auditResult.payload} />
          <MerchantTaskQueuePanel />
          <MerchantExecutorActivityPanel />
        </>
      ) : null}

      {auditResult?.mode === 'legacy' ? (
        <>
          <AuditReportRenderer
            report={auditResult.payload.brand_report}
            remaining={auditResult.payload.rate_limit_remaining}
            pivotaCanonicalKeys={auditResult.payload.audited_via_pivota_canonical}
          />
          <MerchantTaskQueuePanel />
          <MerchantExecutorActivityPanel />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// Cost meter (spec §I) — render the preview-endpoint response. Shows
// projected scope, cache savings, credits required vs available, and
// honest gap reporting when insufficient. We never auto-shrink scope.
// ---------------------------------------------------------------------
function CostMeterPanel({
  selectedCount,
  customPromptCount,
  customPromptsError,
  previewLoading,
  previewError,
  previewData,
}: {
  selectedCount: number;
  customPromptCount: number;
  customPromptsError: string | null;
  previewLoading: boolean;
  previewError: string | null;
  previewData: AgentCenterAuditPreviewResponse | null;
}) {
  if (selectedCount < 1) {
    return <p className="text-sm text-slate-500">Select at least one SKU to see cost.</p>;
  }
  if (customPromptsError) {
    return <p className="text-sm text-slate-500">Fix custom prompts above to see preview.</p>;
  }
  if (previewLoading) {
    return (
      <p className="text-sm text-slate-500">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Calculating cost preview…
      </p>
    );
  }
  if (previewError) {
    return (
      <p className="text-sm text-red-700">
        <AlertTriangle className="mr-2 inline h-4 w-4" />
        {previewError}
      </p>
    );
  }
  if (!previewData) {
    return <p className="text-sm text-slate-500">Adjust SKU selection to refresh preview.</p>;
  }

  const balance = previewData.current_balance;
  const cacheRate = Math.round(previewData.estimated_cache_savings.cache_hit_rate * 100);
  // Backend collapsed to a single credit balance (migration 091); cost is
  // still itemized per type but drawn from one pool, so sufficiency compares
  // the summed requirement against the single `credits` balance.
  const totalRequiredCredits =
    (previewData.estimated_audit_credits || 0) +
    (previewData.estimated_prompt_credits || 0) +
    (previewData.estimated_execution_credits || 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <CostStat label="SKUs" value={previewData.sku_count.toString()} />
        <CostStat label="Total probes" value={previewData.total_prompts.toLocaleString()} />
        <CostStat label="Custom prompts" value={`${customPromptCount} / ${MAX_CUSTOM_PROMPTS}`} />
        <CostStat
          label="Cache savings"
          value={`${previewData.estimated_cache_savings.prompts_cached} (${cacheRate}%)`}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 text-sm">
        <CreditStat
          label="Credits"
          required={totalRequiredCredits}
          available={balance.credits}
        />
        <div className="rounded border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
          Cost breakdown: {previewData.estimated_audit_credits} audit
          {previewData.estimated_prompt_credits > 0
            ? ` + ${previewData.estimated_prompt_credits} prompt`
            : ''}
          {previewData.estimated_execution_credits > 0
            ? ` + ${previewData.estimated_execution_credits} execution`
            : ''}{' '}
          credits
        </div>
      </div>
      <div
        className={`rounded border px-3 py-2 text-sm ${
          previewData.sufficient
            ? 'border-green-200 bg-green-50 text-green-900'
            : 'border-red-300 bg-red-50 text-red-900'
        }`}
      >
        {previewData.sufficient ? (
          <>
            <strong>Ready to launch.</strong> Plan: {balance.plan_tier}.
          </>
        ) : (
          <>
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            <strong>Insufficient credits.</strong>{' '}
            {previewData.gaps
              .map((g) => `${g.kind}: short by ${g.short}`)
              .join(' · ')}
            . Reduce SKU selection or contact Pivota to upgrade your plan.
          </>
        )}
      </div>
    </div>
  );
}

function CostStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function CreditStat({
  label,
  required,
  available,
}: {
  label: string;
  required: number;
  available: number;
}) {
  const sufficient = available >= required;
  return (
    <div
      className={`rounded border px-3 py-2 ${
        sufficient
          ? 'border-slate-200 bg-slate-50/60'
          : 'border-red-300 bg-red-50'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`text-base font-semibold ${
          sufficient ? 'text-slate-900' : 'text-red-900'
        }`}
      >
        {required} / {available} {sufficient ? '✓' : `short ${required - available}`}
      </div>
    </div>
  );
}

function InsufficientCreditsBanner({ error }: { error: InsufficientCreditsError }) {
  return (
    <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-red-900">
            Insufficient {error.kind} credits — short by {error.short}
          </div>
          <p className="mt-1 text-xs text-red-900/80">
            Required: {error.required} · Available: {error.available}. Reduce the
            SKU selection or contact Pivota to upgrade your plan.
          </p>
          {error.previewUrl ? (
            <p className="mt-1 text-[11px] text-red-900/70">
              Preview URL: <code>{error.previewUrl}</code>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Report rendering — brand aggregate + per-product cards. Inlined here
// (rather than splitting into a /components/ai-readiness/ tree) so the
// MVP stays one file. Refactor into separate components when we add
// the second audit-style page.
// ---------------------------------------------------------------------

function AuditReportRenderer({
  report,
  remaining,
  pivotaCanonicalKeys,
}: {
  report: AgentCenterBdBrandReport;
  remaining: number;
  pivotaCanonicalKeys?: string[];
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500">
        Audit complete · {remaining} audit{remaining === 1 ? '' : 's'} left in
        today's budget · run {new Date(report.timestamp).toLocaleString()}
      </div>

      {pivotaCanonicalKeys && pivotaCanonicalKeys.length > 0 ? (
        <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/40 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-indigo-700" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-indigo-900">
                {pivotaCanonicalKeys.length} product
                {pivotaCanonicalKeys.length === 1 ? ' was' : 's were'} audited
                against the Pivota canonical PDP
              </div>
              <p className="mt-1 text-xs text-indigo-900/80">
                These catalog rows had no merchant URL (no canonical_url
                + no Shopify handle), so the audit probed{' '}
                <code>agent.pivota.cc/products/sig_*</code> — Pivota's
                hosted AI-channel surface for these SKUs. Pivota canonical
                PDPs are in the 30-90 day Google indexing arc
                post-creation; expect 0/0 scores until indexing matures.
                The score is the canonical surface's score, NOT your
                storefront's.
              </p>
              <p className="mt-2 text-[11px] font-mono text-indigo-700/70">
                Affected product_keys:{' '}
                {pivotaCanonicalKeys.slice(0, 5).join(', ')}
                {pivotaCanonicalKeys.length > 5
                  ? ` … +${pivotaCanonicalKeys.length - 5} more`
                  : ''}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <BrandVerdictBanner report={report} />
      <BrandScoreGrid report={report} />
      {/* CrossProductCompetitors hidden for single-SKU audits — for
          one product, "times cited = 1" everywhere is uninformative
          and the per-SKU competitive_table already covers the same
          ground in a clearer table. Keep it for multi-SKU audits
          where the cross-product aggregation has signal. */}
      {(report.per_product?.length ?? 0) > 1 ? (
        <CrossProductCompetitors report={report} />
      ) : null}
      <FailedProducts report={report} />
      <PerProductSummaries report={report} />
    </div>
  );
}

function verdictColorClasses(label: AgentCenterBdVerdictLabel | null) {
  if (label === 'INVISIBLE') return 'border-red-200 bg-red-50 text-red-900';
  if (label === 'VISIBLE BUT MISATTRIBUTED')
    return 'border-amber-300 bg-amber-50 text-amber-900';
  if (label === 'VISIBLE VIA RETAILERS')
    return 'border-orange-300 bg-orange-50 text-orange-900';
  if (label === 'STRONG') return 'border-green-200 bg-green-50 text-green-900';
  return 'border-blue-200 bg-blue-50 text-blue-900';
}

function BrandVerdictBanner({ report }: { report: AgentCenterBdBrandReport }) {
  const agg = report.aggregate;
  const cls = verdictColorClasses(agg.brand_verdict_label);
  return (
    <div className={`rounded-lg border-2 p-4 ${cls}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
        Brand verdict — {report.merchant_name} (
        {agg.products_succeeded}/{agg.products_count} products succeeded)
      </div>
      <div className="mt-1 text-2xl font-bold">
        {agg.brand_verdict_label || 'INSUFFICIENT DATA'}
      </div>
      <p className="mt-2 text-sm">{agg.brand_verdict_explanation}</p>
    </div>
  );
}

function BrandScoreGrid({ report }: { report: AgentCenterBdBrandReport }) {
  const agg = report.aggregate;
  const items = [
    { label: 'Avg AI visibility', value: agg.avg_visibility },
    { label: 'Avg first-party attribution', value: agg.avg_attribution },
    { label: 'Avg category discoverability', value: agg.avg_category_visibility },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="text-xs uppercase text-slate-500">{it.label}</div>
          <div className="mt-1 text-3xl font-bold text-slate-900">
            {it.value !== null ? `${Math.round(it.value)}/100` : 'n/a'}
          </div>
        </div>
      ))}
    </div>
  );
}

function CrossProductCompetitors({ report }: { report: AgentCenterBdBrandReport }) {
  const list = report.cross_product_competitors || [];
  if (list.length === 0) return null;
  return (
    <SurfaceCard
      title="Top competitor / retailer hosts cited across your audit"
      description="Hosts AI agents linked instead of your own URLs. Aggregated across all audited SKUs."
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">Host</th>
            <th className="px-4 py-2 text-right">Times cited</th>
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 15).map((c) => (
            <tr key={c.host} className="border-t">
              <td className="px-4 py-2 font-mono text-xs">{c.host}</td>
              <td className="px-4 py-2 text-right">{c.times_cited}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SurfaceCard>
  );
}

function FailedProducts({ report }: { report: AgentCenterBdBrandReport }) {
  const failed = report.failed || [];
  if (failed.length === 0) return null;
  return (
    <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
      <div className="text-xs font-semibold uppercase text-red-700">
        Products that failed mid-audit
      </div>
      <ul className="mt-2 space-y-1 text-sm text-red-900">
        {failed.map((f, i) => (
          <li key={i}>
            <code className="text-xs">{f.pdp_url || f.title || '(unknown)'}</code>
            {' — '}
            <span className="opacity-80">{f.error}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PerProductSummaries({ report }: { report: AgentCenterBdBrandReport }) {
  const list = report.per_product || [];
  if (list.length === 0) return null;
  // Hotfix: when 1-2 SKUs audited, the per-product detail IS the
  // primary view — auto-expand instead of forcing a click. Merchants
  // were missing the per-SKU analysis because cards were collapsed
  // by default. With 3+ SKUs the list is long and click-to-expand
  // makes sense.
  const autoExpandAll = list.length <= 2;
  return (
    <SurfaceCard
      title={
        list.length === 1
          ? 'Your SKU analysis'
          : 'Per-SKU analysis'
      }
      description={
        list.length === 1
          ? 'Detailed audit results for the SKU you selected.'
          : 'Detailed audit results per SKU you selected.'
      }
    >
      <div className="divide-y">
        {list.map((p, i) => (
          <PerProductCard
            key={i}
            report={p}
            initialOpen={autoExpandAll}
          />
        ))}
      </div>
    </SurfaceCard>
  );
}

function PerProductCard({
  report,
  initialOpen = false,
}: {
  report: AgentCenterBdReport;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const v = report.verdict;
  const mv = report.merchant_view;
  return (
    <div className="px-4 py-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((s) => !s)}
      >
        <div>
          <div className="font-semibold">{report.product.title}</div>
          <div className="text-xs text-slate-500">
            {v.label} · vis {v.visibility_score}/100 · attr{' '}
            {v.attribution_score}/100
            {v.category_visibility_score !== null
              ? ` · cat ${v.category_visibility_score}/100`
              : ''}
          </div>
        </div>
        <span className="text-xs text-slate-500">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3 rounded border border-slate-200 bg-slate-50/50 p-3">
          {/* Honesty sweep #356: when the product's vendor field differs
              from the storefront name (1688 / wholesale drop-shippers),
              prose about "your brand" actually refers to the vendor.
              Surface BEFORE the plain_summary so the reader frames every
              claim correctly. */}
          {mv?.headline?.brand_disambiguation ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <div className="font-semibold uppercase">
                Brand audited against:{' '}
                <span className="font-bold">
                  {mv.headline.brand_disambiguation.brand_audited_against}
                </span>
              </div>
              <div className="mt-0.5">
                Your storefront name is{' '}
                <span className="font-semibold">
                  {mv.headline.brand_disambiguation.storefront_name}
                </span>
                . {mv.headline.brand_disambiguation.note}
              </div>
            </div>
          ) : null}
          {/* PR-A follow-up + #344: plain-language "am I visible?" answer.
              Surface FIRST so merchants don't have to interpret math. */}
          {mv?.headline?.plain_summary ? (
            <div className="rounded border-2 border-indigo-300 bg-indigo-50 p-3">
              <div className="text-xs font-semibold uppercase text-indigo-700">
                Are you visible to AI shoppers?
              </div>
              <p className="mt-1 text-sm text-indigo-900">
                {mv.headline.plain_summary}
              </p>
            </div>
          ) : null}
          {/* PR-D: real indexing-arc state when audited via Pivota canonical. */}
          {mv?.diagnosis?.indexing_arc_state ? (
            <IndexingArcChip state={mv.diagnosis.indexing_arc_state} />
          ) : null}
          {/* Phase D wire-up: Pivota canonical PDPs auto-submitted to
              Google's Indexing API. Surfaces the running tally so the
              merchant can see the indexing arc move from "submitted"
              to "indexed" over time without manually checking GSC. */}
          {mv?.tracking?.gsc_submission_status ? (
            <GscSubmissionStatusBadge
              status={mv.tracking.gsc_submission_status}
            />
          ) : null}
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">
              Verdict explanation
            </div>
            <p className="mt-1 text-sm text-slate-700">{v.explanation}</p>
          </div>
          {/* #344: competitive_table is now an actual TABLE, not a paragraph.
              When merchant_view is present, the table is the source of
              truth — even when empty (no peers named) we render an empty
              state instead of falling back to the legacy prose framing.
              The framing was the thing the merchant explicitly didn't
              want; falling back defeats the change. */}
          {mv?.receipts ? (
            <CompetitiveTable rows={mv.receipts.competitive_table || []} />
          ) : report.competitive_pressure?.framing ? (
            <div className="rounded bg-amber-50 p-3 text-xs text-amber-900">
              <div className="font-semibold uppercase">Competitive pressure</div>
              <p className="mt-1">{report.competitive_pressure.framing}</p>
            </div>
          ) : null}
          {/* Adjacent to the competitive landscape: retailers + media
              hosts AI cited in this product's category. Honest framing
              note: this is NOT per-brand "where is Lunya sold" data —
              that would need a per-competitor probe we don't run. It IS
              the category-level signal of "where's the AI-channel funnel
              flowing in your category", which is the question merchants
              actually want to ask. */}
          {mv?.receipts?.cited_hosts_detailed?.length ? (
            <CategoryRetailersPanel
              hosts={mv.receipts.cited_hosts_detailed}
            />
          ) : null}
          {/* PR-G + #346: actions ordered by priority_order with
              concrete_next_step as the executable "this week" task. */}
          {mv?.actions?.length ? (
            <PrioritizedActions actions={mv.actions} />
          ) : report.action_items?.length ? (
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">
                Recommended actions
              </div>
              <ul className="mt-1 space-y-1 text-xs text-slate-700">
                {report.action_items.map((a, i) => (
                  <li key={i}>
                    <span className="font-semibold">[{a.severity}]</span>{' '}
                    {a.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {/* All buyer-intent queries — successes AND failures, with
              status column. Renders from attribution.queries[] (which
              has every query) and joins per-query rich detail from
              failed_queries_detailed[] when present. The previous
              version rendered only failed-with-grounding queries,
              which left the table mostly empty when most queries had
              no grounding chunks. */}
          <AllQueriesTable
            attributionQueries={report.attribution?.queries || []}
            failedDetails={mv?.receipts?.failed_queries_detailed || []}
          />
          {/* Hidden: `what_pivota_changes.discovery_lift.layers` and
              `checkout_loop.outcome` — these were BD-architecture
              jargon ("Layer 1 / 2 / 3 mechanics") that read as Pivota
              internals, not merchant value. Merchants couldn't act
              on them and they discouraged onboarding. The merchant-
              facing value prop should live in `merchant_view.
              pivota_value_prop` (re-projection of the same data,
              clearly labeled as Pivota's offer) — but we don't
              auto-render it on the audit page either; the audit
              should answer "where do you stand" + "what should you
              do", not pitch Pivota. */}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// Sub-components for the new merchant_view fields (#344 / PR-G / PR-D / PR-F).
// ---------------------------------------------------------------------

function CompetitiveTable({
  rows,
}: {
  rows: NonNullable<AgentCenterBdReport['merchant_view']>['receipts']['competitive_table'];
}) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50/50">
      <div className="border-b border-amber-200 px-3 py-2">
        <div className="text-xs font-semibold uppercase text-amber-900">
          Competitive landscape
        </div>
        <div className="text-[11px] text-amber-900/70">
          Brands AI agents named in your category, ranked by frequency. ✓
          means they have their own .com cited in grounding (= they're
          winning first-party AI traffic).
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-xs text-amber-900/70">
          AI agents didn&apos;t name any specific competitor brands in
          this category for your audit. This can mean either: (1) the
          category isn&apos;t mature enough on AI shopping for grounded
          retrieval to surface named brands, OR (2) the brand discriminator
          missed them — see the &quot;cited hosts&quot; section for the raw
          list of non-merchant URLs that were grounded.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-amber-50/80 text-left text-[11px] uppercase text-amber-900/80">
            <tr>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2 text-right">Mentions</th>
              <th className="px-3 py-2">Their .com (cited count)</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 15).map((r, i) => (
              <tr key={i} className="border-t border-amber-200">
                <td className="px-3 py-2 font-medium text-amber-900">
                  {r.brand}
                </td>
                <td className="px-3 py-2 text-right text-amber-900">
                  {r.times_mentioned}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-amber-900/80">
                  {r.first_party_host
                    ? `${r.first_party_host} (${r.host_citations})`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PrioritizedActions({
  actions,
}: {
  actions: NonNullable<AgentCenterBdReport['merchant_view']>['actions'];
}) {
  const sorted = [...actions].sort(
    (a, b) => (a.priority_order ?? 999) - (b.priority_order ?? 999),
  );
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500">
        Recommended actions (in priority order)
      </div>
      <ol className="mt-2 space-y-3">
        {sorted.map((a, i) => {
          const sevBg =
            a.severity === 'critical'
              ? 'border-red-300 bg-red-50'
              : a.severity === 'high'
                ? 'border-orange-300 bg-orange-50'
                : a.severity === 'medium'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-slate-200 bg-white';
          return (
            <li
              key={i}
              className={`rounded border-2 p-3 ${sevBg}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-slate-500">
                  Step {a.priority_order ?? i + 1}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    a.severity === 'critical'
                      ? 'bg-red-200 text-red-900'
                      : a.severity === 'high'
                        ? 'bg-orange-200 text-orange-900'
                        : a.severity === 'medium'
                          ? 'bg-amber-200 text-amber-900'
                          : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {a.severity}
                </span>
                {a.lever ? (
                  <span className="ml-auto text-[10px] uppercase text-slate-500">
                    {a.lever.replace(/_/g, ' ')}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {a.title}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">
                {a.body}
              </p>
              {/* Phase 0 + Phase D: integration CTA. When the action's
                  lever is "pivota_integration" (un-integrated merchant)
                  or "gsc_integration" (Phase 0 done but GSC missing),
                  the green CTA panel REPLACES the generic "Next step"
                  block — the cta_label IS the concrete next step, and
                  the button is the one-click execution. */}
              {(a.lever === 'pivota_integration' || a.lever === 'gsc_integration') && a.cta_url ? (
                <PivotaIntegrationCta
                  cta_url={a.cta_url}
                  cta_label={
                    a.cta_label ??
                    (a.lever === 'gsc_integration'
                      ? 'Grant GSC access'
                      : 'Start Pivota onboarding')
                  }
                  panel_label={
                    a.lever === 'gsc_integration'
                      ? 'Search Console integration unlocks this'
                      : 'Pivota integration unlocks this'
                  }
                />
              ) : a.concrete_next_step ? (
                /* #346: BD-curated "this week" task with specifics. */
                <div className="mt-2 rounded border border-indigo-200 bg-indigo-50/60 p-2 text-xs text-indigo-900">
                  <span className="font-semibold uppercase">
                    Next step:
                  </span>{' '}
                  {a.concrete_next_step}
                </div>
              ) : null}
              {/* Phase A: pre-filled email draft (mailto:) for editorial
                  pitch actions. Skip on integration actions — the CTA
                  above is the one-click execution path for those levers. */}
              {a.pitch_draft &&
              a.lever !== 'pivota_integration' &&
              a.lever !== 'gsc_integration' ? (
                <DraftPitchButton draft={a.pitch_draft} />
              ) : null}
              {/* Phase B: co-occurrence verification badge. When the
                  backend fetched the cited article and verified
                  Gemini's competitor claims, surface "✓ Verified"
                  with the verified brand list. When fetch failed
                  (robots-blocked, network error), surface a small
                  hedge so merchants don't read unverified Gemini
                  self-report as ground truth. */}
              {(() => {
                const v = (a.evidence as Record<string, unknown> | undefined)
                  ?.co_occurrence_verification as
                  | AgentCenterBdCoOccurrenceVerification
                  | undefined;
                if (!v) return null;
                return <CoOccurrenceBadge verification={v} />;
              })()}
              {/* Phase E: matched creator cards. When the audit emits
                  lever="creator_partnership", evidence.matched_creators
                  carries 1-5 candidates. Render each as a card with
                  audience size, recent coverage, and a "Copy outreach
                  brief" button. */}
              {a.lever === 'creator_partnership'
                ? (() => {
                    const matches = (
                      a.evidence as Record<string, unknown> | undefined
                    )?.matched_creators as
                      | AgentCenterBdMatchedCreator[]
                      | undefined;
                    if (!matches?.length) return null;
                    return <MatchedCreatorList matches={matches} />;
                  })()
                : null}
              {a.expected_timeline_weeks?.length === 2 ? (
                <div className="mt-1 text-[11px] text-slate-500">
                  Expected timeline:{' '}
                  {a.expected_timeline_weeks[0]}–
                  {a.expected_timeline_weeks[1]} weeks
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CoOccurrenceBadge({
  verification,
}: {
  verification: AgentCenterBdCoOccurrenceVerification;
}) {
  const { fetch_status, verified_brands, merchant_absent, merchant_present } =
    verification;

  // Three classes of badge:
  //   * Strongest: fetched article, verified ≥1 brand, merchant absent
  //   * Surprise: fetched, merchant brand IS in article (different play)
  //   * Hedge: fetch failed → say so, don't pretend we verified
  if (
    (fetch_status === 'ok' || fetch_status === 'cached') &&
    verified_brands.length > 0 &&
    merchant_absent
  ) {
    const list = verified_brands.slice(0, 3).join(', ');
    return (
      <div className="mt-2 rounded border border-emerald-300 bg-emerald-50/80 px-2 py-1 text-[11px] text-emerald-900">
        <span className="font-semibold">✓ Verified against article:</span>{' '}
        their content lists {list}; your brand is absent.
      </div>
    );
  }

  if ((fetch_status === 'ok' || fetch_status === 'cached') && merchant_present) {
    return (
      <div className="mt-2 rounded border border-blue-300 bg-blue-50/80 px-2 py-1 text-[11px] text-blue-900">
        <span className="font-semibold">ℹ Article includes your brand:</span>{' '}
        the pitch should target where existing coverage leaves room.
      </div>
    );
  }

  if (fetch_status === 'blocked') {
    return (
      <div className="mt-2 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
        <span className="font-semibold">Couldn't verify:</span> the host's
        robots.txt blocks our fetch. The competitor list comes from Gemini's
        self-report, unverified against the article text.
      </div>
    );
  }

  if (fetch_status === 'error') {
    return (
      <div className="mt-2 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
        <span className="font-semibold">Couldn't verify:</span> couldn't fetch
        the article. The competitor list is Gemini's self-report, unverified.
      </div>
    );
  }

  return null;
}

function MatchedCreatorList({
  matches,
}: {
  matches: AgentCenterBdMatchedCreator[];
}) {
  return (
    <div className="mt-2 space-y-2">
      {matches.map((m, i) => (
        <MatchedCreatorCard key={m.creator_id || i} creator={m} />
      ))}
    </div>
  );
}

function MatchedCreatorCard({
  creator,
}: {
  creator: AgentCenterBdMatchedCreator;
}) {
  const [copied, setCopied] = useState(false);
  const audienceLabel = creator.audience_size_band
    ? creator.audience_size_band.charAt(0).toUpperCase() +
      creator.audience_size_band.slice(1)
    : 'Unknown';
  const platformLabel = creator.platform
    ? creator.platform.charAt(0).toUpperCase() + creator.platform.slice(1)
    : 'Unknown';

  const copyBrief = async () => {
    if (!creator.sample_brief_template) return;
    try {
      await navigator.clipboard.writeText(creator.sample_brief_template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (Safari permissions / older browser).
      // Fall through silently — user can copy manually from the
      // expanded preview.
    }
  };

  const openContact = () => {
    if (!creator.contact_url) return;
    if (creator.contact_url.startsWith('mailto:')) {
      window.location.href = creator.contact_url;
    } else {
      window.open(creator.contact_url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="rounded border border-purple-200 bg-purple-50/40 p-2 text-xs text-slate-800">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="font-semibold text-slate-900">
            {creator.display_name ?? creator.creator_id}
            {creator.platform_url ? (
              <a
                href={creator.platform_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-[10px] font-normal text-purple-700 hover:underline"
              >
                ↗ {platformLabel}
              </a>
            ) : null}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-600">
            Audience: {audienceLabel}
            {creator.recent_coverage.length ? (
              <>
                {' · Covered: '}
                {creator.recent_coverage.slice(0, 3).join(', ')}
              </>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {creator.sample_brief_template ? (
            <button
              type="button"
              onClick={copyBrief}
              className="rounded border border-purple-400 bg-white px-2 py-0.5 text-[10px] font-medium text-purple-800 hover:bg-purple-100"
            >
              {copied ? 'Copied!' : 'Copy brief'}
            </button>
          ) : null}
          {creator.contact_url ? (
            <button
              type="button"
              onClick={openContact}
              className="rounded bg-purple-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-purple-800"
            >
              Contact
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PivotaIntegrationCta({
  cta_url,
  cta_label,
  panel_label = 'Pivota integration unlocks this',
}: {
  cta_url: string;
  cta_label: string;
  panel_label?: string;
}) {
  const open = () => {
    // External-tab open keeps the audit context behind so the merchant
    // can come back after onboarding. Onboarding wizard owns its own
    // session.
    window.open(cta_url, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className="mt-2 rounded border border-emerald-300 bg-emerald-50/60 p-2 text-xs text-emerald-900">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold uppercase">{panel_label}</span>
        <button
          type="button"
          onClick={open}
          className="rounded bg-emerald-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800"
        >
          {cta_label}
        </button>
      </div>
      <div className="mt-1 text-[11px] opacity-80">
        Opens the onboarding wizard in a new tab.
      </div>
    </div>
  );
}

function DraftPitchButton({ draft }: { draft: AgentCenterBdPitchDraft }) {
  const [showPreview, setShowPreview] = useState(false);

  const send = () => {
    const url = `mailto:${encodeURIComponent(draft.recipient_email)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    window.location.href = url;
  };

  return (
    <div className="mt-2 rounded border border-emerald-300 bg-emerald-50/60 p-2 text-xs text-emerald-900">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold uppercase">Pitch draft ready</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((s) => !s)}
            className="rounded border border-emerald-400 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
          >
            {showPreview ? 'Hide' : 'Preview'}
          </button>
          <button
            type="button"
            onClick={send}
            className="rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-800"
          >
            Draft pitch email
          </button>
        </div>
      </div>
      <div className="mt-1 text-[11px] opacity-80">{draft.recipient_note}</div>
      {showPreview ? (
        <div className="mt-2 space-y-2 rounded border border-emerald-200 bg-white p-2 text-[11px] text-slate-800">
          <div>
            <span className="font-semibold uppercase text-slate-500">To: </span>
            {draft.recipient_email}
          </div>
          <div>
            <span className="font-semibold uppercase text-slate-500">Subject: </span>
            {draft.subject}
          </div>
          <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-700">
            {draft.body}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function GscSubmissionStatusBadge({
  status,
}: {
  status: NonNullable<
    NonNullable<AgentCenterBdReport['merchant_view']>['tracking']['gsc_submission_status']
  >;
}) {
  const total = status.submitted + status.indexed + status.pending + status.errors;
  if (total === 0) {
    // No submissions ever attempted — usually means the merchant
    // hasn't connected GSC yet. The "Grant GSC access" action card
    // (lever=gsc_integration) handles the call-to-action; the
    // tracking section just stays quiet so we don't clutter the
    // diagnosis area with a "0 of 0" badge.
    return null;
  }
  const indexedPct = total > 0 ? Math.round((status.indexed / total) * 100) : 0;
  const lastSubmitted = status.last_submission_at
    ? new Date(status.last_submission_at).toLocaleDateString()
    : null;
  return (
    <div className="rounded border-2 border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase">
          Search Console submissions
        </div>
        <div className="text-[11px]">
          {status.indexed} of {total} indexed ({indexedPct}%)
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
        <span>
          <span className="font-semibold">{status.submitted}</span> submitted
        </span>
        <span>
          <span className="font-semibold">{status.indexed}</span> indexed
        </span>
        {status.pending > 0 ? (
          <span>
            <span className="font-semibold">{status.pending}</span> pending
          </span>
        ) : null}
        {status.errors > 0 ? (
          <span className="text-red-700">
            <span className="font-semibold">{status.errors}</span> errors
          </span>
        ) : null}
      </div>
      {lastSubmitted ? (
        <p className="mt-1 text-[11px] opacity-80">
          Last submission: {lastSubmitted}. Google typically indexes within
          24-72h; re-audit after that to see updated counts.
        </p>
      ) : null}
    </div>
  );
}

function IndexingArcChip({
  state,
}: {
  state: NonNullable<
    NonNullable<AgentCenterBdReport['merchant_view']>['diagnosis']['indexing_arc_state']
  >;
}) {
  const phaseColor =
    state.phase === 'fresh'
      ? 'border-blue-300 bg-blue-50 text-blue-900'
      : state.phase === 'indexing'
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : state.phase === 'expected_steady'
          ? 'border-orange-300 bg-orange-50 text-orange-900'
          : 'border-slate-300 bg-slate-50 text-slate-700';
  return (
    <div className={`rounded border-2 p-3 ${phaseColor}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase">
          Indexing arc · {state.phase.replace(/_/g, ' ')}
        </div>
        {state.days_since_mint !== null ? (
          <div className="text-[11px]">
            day {state.days_since_mint}
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-xs">{state.caveat}</p>
      {state.expected_first_citation_at ? (
        <p className="mt-1 text-[11px] opacity-80">
          Expected first-citation date:{' '}
          {new Date(state.expected_first_citation_at).toLocaleDateString()}
        </p>
      ) : null}
    </div>
  );
}

function CategoryRetailersPanel({
  hosts,
}: {
  hosts: NonNullable<
    AgentCenterBdReport['merchant_view']
  >['receipts']['cited_hosts_detailed'];
}) {
  // Filter to retailers + marketplaces (the hosts a merchant might
  // actually want to be sold on). Editorial / video / unclassified
  // are surfaced elsewhere or in playbook actions.
  const channels = hosts.filter(
    (h) => h.type === 'retailer' || h.type === 'marketplace',
  );
  if (channels.length === 0) return null;
  // Heuristic: hosts with country-code TLDs (.ae, .uk, .au, .jp,
  // .nz, .ca, .de, .fr, .it, etc., excluding .co/.com/.net/.org/.io)
  // are likely market-specific. Surface a note so a US merchant
  // doesn't get confused by .ae results when they don't ship to UAE.
  // This is a band-aid until backend constrains probes by merchant
  // market — see backend follow-up.
  const intlChannels = channels.filter((h) => {
    const tld = (h.host || '').split('.').pop()?.toLowerCase() || '';
    if (!tld) return false;
    if (
      ['com', 'net', 'org', 'io', 'co', 'shop', 'store', 'app'].includes(tld)
    )
      return false;
    return tld.length <= 3;
  });
  return (
    <div className="rounded border border-blue-200 bg-blue-50/50">
      <div className="border-b border-blue-200 px-3 py-2">
        <div className="text-xs font-semibold uppercase text-blue-900">
          Retailers / marketplaces active in your category
        </div>
        <div className="text-[11px] text-blue-900/70">
          Where AI shoppers&apos; queries land in your category. Not a
          per-brand &quot;sold here&quot; map — these are channel-level
          hosts cited in the same audit. Use them as wholesale /
          marketplace-listing leads.
        </div>
        {intlChannels.length > 0 ? (
          <div className="mt-1 text-[11px] text-amber-800">
            ⚠ Note: {intlChannels.length} of these{' '}
            {intlChannels.length === 1 ? 'is' : 'are'} non-US (
            {intlChannels.map((h) => h.host).join(', ')}). If you
            don&apos;t ship to those markets, deprioritize them.
          </div>
        ) : null}
      </div>
      <table className="w-full text-xs">
        <thead className="bg-blue-50/80 text-left text-[11px] uppercase text-blue-900/80">
          <tr>
            <th className="px-3 py-2">Channel</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2 text-right">Cited</th>
            <th className="px-3 py-2">How to engage</th>
          </tr>
        </thead>
        <tbody>
          {channels.slice(0, 10).map((h, i) => (
            <tr key={i} className="border-t border-blue-200">
              <td className="px-3 py-2 font-mono text-[11px] text-blue-900">
                {h.host}
              </td>
              <td className="px-3 py-2 text-[11px] text-blue-900/80">
                {h.type}
                {h.subtype ? (
                  <span className="ml-1 text-blue-900/60">
                    / {h.subtype.replace(/_/g, ' ')}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right text-blue-900">
                {h.times_cited}
              </td>
              <td className="px-3 py-2 text-blue-900/80">
                {h.outreach_hint || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllQueriesTable({
  attributionQueries,
  failedDetails,
}: {
  attributionQueries: AgentCenterBdQueryRow[];
  failedDetails: NonNullable<
    AgentCenterBdReport['merchant_view']
  >['receipts']['failed_queries_detailed'];
}) {
  if (!attributionQueries.length) return null;
  // Index failed details by query text for quick join.
  const failedByQuery = new Map(
    failedDetails.map((f) => [f.query.toLowerCase().trim(), f]),
  );
  return (
    <div className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <div className="text-xs font-semibold uppercase text-slate-500">
          Buyer-intent queries we tested
        </div>
        <div className="text-[11px] text-slate-500">
          Each query Gemini was asked. Status shows whether your URL
          was cited; for failures we surface the URL Gemini cited
          instead and the competitor brands it named.
        </div>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Query Gemini was asked</th>
            <th className="px-3 py-2">URL Gemini cited as the answer</th>
          </tr>
        </thead>
        <tbody>
          {attributionQueries.map((q, i) => {
            const won = q.self_report_yes;
            const detail = failedByQuery.get(
              (q.query || '').toLowerCase().trim(),
            );
            return (
              <tr key={i} className="border-t border-slate-200">
                <td className="px-3 py-2">
                  {won ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-900">
                      ✓ won
                    </span>
                  ) : (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-900">
                      lost
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-800">
                  <span className="font-mono text-[11px]">{q.query}</span>
                </td>
                <td className="px-3 py-2">
                  {won ? (
                    // For won queries, the merchant's URL was cited
                    // — surface that explicitly so the merchant can
                    // see "yes, MY URL was the cited answer here"
                    // instead of an uninformative "—".
                    <span className="text-green-800">
                      ✓ your URL was cited
                    </span>
                  ) : detail?.top_cited_host ? (
                    <span>
                      <span className="font-mono text-[11px]">
                        {detail.top_cited_host}
                      </span>{' '}
                      {detail.host_classification?.type ? (
                        <span className="text-[10px] text-slate-500">
                          ({detail.host_classification.type})
                        </span>
                      ) : null}
                    </span>
                  ) : q.top_cited_url ? (
                    <span className="font-mono text-[11px] text-slate-600">
                      {(() => {
                        try {
                          return new URL(q.top_cited_url).host;
                        } catch {
                          return q.top_cited_url;
                        }
                      })()}
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      no URL cited (Gemini gave an ungrounded answer)
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------
// v3 per-SKU dashboard renderer (spec §C-E + §D).
//
// Renders when audit_mode === 'per_sku'. Shows:
//   1. Brand rollup cover (median + winning/blocked counts)
//   2. Per-SKU cards (4-score table + band + top 3 gaps + expandable
//      detail with verbatim grounding, authority hosts, Reddit subreddits)
//   3. Priority queue panel (top-10 by impact × gap × fixability)
//   4. Cost summary footer
//
// Per memory feedback_mock_data_never_to_merchant: when arrays are empty
// we render an honest "none cited" surface, not fabricated placeholders.
// ---------------------------------------------------------------------

// cost_summary.providers is an array of per-provider telemetry objects
// ({ provider, calls, ... }); render the distinct provider names.
function costSummaryProviderNames(summary: AgentCenterCostSummary): string {
  const names = (summary?.providers ?? [])
    .map((p) => p?.provider)
    .filter((p): p is string => !!p);
  return names.length ? Array.from(new Set(names)).join(', ') : '—';
}

function PerSkuAuditReportRenderer({
  report,
}: {
  report: AgentCenterPerSkuAuditResponse;
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500">
        Audited {report.per_sku_reports.length} product
        {report.per_sku_reports.length === 1 ? '' : 's'} against{' '}
        {costSummaryProviderNames(report.cost_summary)}.
      </div>
      <BrandRollupCover
        rollup={report.brand_rollup}
        skuCount={report.per_sku_reports.length}
        costSummary={report.cost_summary}
      />
      <CustomPromptsPanel prompts={report.custom_prompts} />
      <PrioritizedQueuePanel
        rollup={report.brand_rollup}
        perSku={report.per_sku_reports}
      />
      <PerSkuCardList
        reports={report.per_sku_reports}
        authorityMap={report.authority_map}
      />
    </div>
  );
}

// "Your Prompts" — per-lane results for the merchant's custom prompts.
// Each prompt is a niche query the merchant added to test for cheap traffic;
// we show whether the brand got cited, who the AI grounded in, and which
// competitors won the lane — so they can tell open lanes (cited, low
// competition) from contested ones. Per memory feedback_mock_data_never_to_
// merchant: empty arrays render as honest "none" copy, never fabricated.
const CUSTOM_LANE_META: Record<
  CustomPromptLane,
  { label: string; chip: string; blurb: string }
> = {
  open: {
    label: 'Open lane',
    chip: 'border-green-300 bg-green-50 text-green-800',
    blurb: "You're cited with little competition — defend and scale this.",
  },
  contested: {
    label: 'Contested',
    chip: 'border-amber-300 bg-amber-50 text-amber-800',
    blurb: "You're cited, but the lane is crowded with competitors.",
  },
  absent: {
    label: 'Not cited',
    chip: 'border-red-300 bg-red-50 text-red-800',
    blurb: 'The AI answered with sources but never named you — competitors own this lane.',
  },
  no_signal: {
    label: 'No signal',
    chip: 'border-slate-300 bg-slate-50 text-slate-600',
    blurb: "This prompt didn't return grounded results — thin or no demand for it.",
  },
};

function CustomPromptsPanel({
  prompts,
}: {
  prompts: CustomPromptResult[] | undefined;
}) {
  if (!prompts || prompts.length === 0) return null;
  const citedCount = prompts.filter((p) => p.cited).length;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Your prompts ({prompts.length})
        </div>
        <div className="text-xs text-slate-500">
          cited in <strong>{citedCount}</strong> of {prompts.length}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        The niche prompts you added — for each, whether AI cited you, the sources
        it grounded in, and which competitors it named.
      </p>
      <div className="mt-3 space-y-2.5">
        {prompts.map((p, i) => {
          const meta = CUSTOM_LANE_META[p.lane] ?? CUSTOM_LANE_META.no_signal;
          return (
            <div
              key={`${p.prompt}-${i}`}
              className="rounded-md border border-slate-200 bg-slate-50/50 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-slate-800">
                  &ldquo;{p.prompt}&rdquo;
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}
                >
                  {meta.label}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {meta.blurb}
                {p.runs > 0 ? (
                  <>
                    {' '}· cited in {p.runs_cited}/{p.runs} model{p.runs === 1 ? '' : 's'}
                  </>
                ) : null}
              </div>

              {p.cited && p.cited_sources.length > 0 ? (
                <div className="mt-2 text-xs">
                  <span className="text-slate-500">You were cited via: </span>
                  <span className="font-medium text-green-800">
                    {p.cited_sources.join(', ')}
                  </span>
                </div>
              ) : null}

              {p.competitors.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500">
                    {p.cited ? 'Also named:' : 'Lane owned by:'}
                  </span>
                  {p.competitors.map((c) => (
                    <span
                      key={c}
                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : null}

              {!p.cited &&
              p.competitors.length === 0 &&
              p.grounding_sources.length > 0 ? (
                <div className="mt-1.5 text-xs text-slate-500">
                  Grounded in: {p.grounding_sources.join(', ')}
                </div>
              ) : null}

              {p.evidence_excerpt ? (
                <div className="mt-2 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500">
                  {p.evidence_excerpt}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function bandColorClasses(band: SkuScoreBand): string {
  switch (band) {
    case 'agent_ready':
      return 'border-green-200 bg-green-50 text-green-900';
    case 'ready':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'partial':
      return 'border-amber-300 bg-amber-50 text-amber-900';
    case 'blocked':
    default:
      return 'border-red-300 bg-red-50 text-red-900';
  }
}

function dimensionScoreColor(score: number): string {
  if (score >= 85) return 'text-green-700';
  if (score >= 70) return 'text-emerald-700';
  if (score >= 40) return 'text-amber-700';
  return 'text-red-700';
}

function BrandRollupCover({
  rollup,
  skuCount,
  costSummary,
}: {
  rollup: AgentCenterBrandRollup;
  skuCount: number;
  costSummary: AgentCenterCostSummary;
}) {
  const preIndex = rollup.brand_state && rollup.brand_state !== 'scored';
  return (
    <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/40 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-indigo-900/70">
        Brand rollup ({skuCount} SKUs audited)
      </div>
      {preIndex && rollup.brand_verdict_label ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900">
          <div className="text-sm font-semibold">{rollup.brand_verdict_label}</div>
          {rollup.brand_verdict_explanation ? (
            <div className="mt-1 text-xs opacity-90">
              {rollup.brand_verdict_explanation}
            </div>
          ) : null}
          {rollup.brand_state === 'blocked_pre_index' ? (
            <div className="mt-1.5 text-xs font-medium">
              First step: get your products indexed — each SKU below shows its recommended next step.
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RollupDimensionStat label="Identity" stats={pickStat(rollup, 'identity')} />
        <RollupDimensionStat label="Content" stats={pickStat(rollup, 'content_richness')} />
        <RollupDimensionStat label="Routability" stats={pickStat(rollup, 'routability')} />
        <RollupDimensionStat label="Citation" stats={pickStat(rollup, 'citation')} highlight />
      </div>
      <BrandModelStrip citationByProvider={rollup.citation_by_provider} />
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-indigo-900/80 sm:grid-cols-3">
        <div>
          <strong>{rollup.winning_skus_by_citation.length}</strong> winning by citation
        </div>
        <div>
          <strong>{rollup.winning_skus_by_band.length}</strong> winning by band
        </div>
        <div>
          <strong>{rollup.blocked_skus.length}</strong> blocked
        </div>
      </div>
    </div>
  );
}

// Brand-level per-model strip: how each model cited the brand across SKUs.
// One entry today (Gemini); fills in as more models are enabled.
function BrandModelStrip({
  citationByProvider,
}: {
  citationByProvider?: Record<string, BrandProviderCitation>;
}) {
  const entries = Object.entries(citationByProvider || {});
  if (entries.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900/70">
        Citation by model
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {entries.map(([provider, stat]) => (
          <div
            key={provider}
            className="rounded border border-indigo-200 bg-white px-3 py-1.5 text-xs text-indigo-900"
          >
            <span className="font-semibold">{providerLabel(provider)}</span>
            <span className="ml-2 opacity-70">
              {stat.median == null ? '—' : `median ${stat.median}`}
            </span>
            <span className="ml-2 opacity-70">
              cited {stat.skus_cited}/{stat.skus_scored} SKUs
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function pickStat(
  rollup: AgentCenterBrandRollup,
  dim: 'identity' | 'content_richness' | 'routability' | 'citation',
) {
  // Backend emits brand_rollup.dimensions[dim] = { median, p25, p75 }.
  const stat = rollup.dimensions?.[dim];
  return {
    median: stat?.median ?? null,
    p25: stat?.p25 ?? null,
    p75: stat?.p75 ?? null,
  };
}

function RollupDimensionStat({
  label,
  stats,
  highlight,
}: {
  label: string;
  stats: { median: number | null; p25: number | null; p75: number | null };
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        highlight
          ? 'border-indigo-300 bg-white'
          : 'border-slate-200 bg-white/80'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
        {highlight ? ' (output)' : ''}
      </div>
      <div
        className={`text-xl font-bold ${
          stats.median == null ? 'text-slate-400' : dimensionScoreColor(stats.median)
        }`}
      >
        {stats.median ?? '—'}
      </div>
      <div className="text-[10px] text-slate-500">
        P25 {stats.p25 ?? '—'} · P75 {stats.p75 ?? '—'}
      </div>
    </div>
  );
}

function PrioritizedQueuePanel({
  rollup,
  perSku,
}: {
  rollup: AgentCenterBrandRollup;
  perSku: AgentCenterPerSkuReport[];
}) {
  const top = rollup.priority_queue.slice(0, 10);
  if (top.length === 0) {
    return null;
  }
  const titleMap = new Map(
    perSku.map((r) => [r.sku_key, r.sku_title || r.identity?.name || r.sku_key]),
  );
  return (
    <SurfaceCard
      title="Priority queue"
      description="Top SKUs to fix first, ranked by impact × gap × fixability (spec §C)."
    >
      <div className="px-5 py-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">SKU</th>
              <th className="py-1 pr-2 text-right">Impact</th>
              <th className="py-1 pr-2 text-right">Gap</th>
              <th className="py-1 pr-2 text-right">Fixability</th>
              <th className="py-1 pr-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {top.map((entry, idx) => (
              <tr key={entry.sku_key} className="border-t border-slate-100">
                <td className="py-1.5 pr-2 text-slate-500">{idx + 1}</td>
                <td className="py-1.5 pr-2">
                  {titleMap.get(entry.sku_key) ?? entry.sku_key}
                  <div className="font-mono text-[10px] text-slate-400">{entry.sku_key}</div>
                </td>
                <td className="py-1.5 pr-2 text-right">{entry.impact?.toFixed(2) ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right">{entry.gap ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right">{entry.fixability?.toFixed(2) ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right font-semibold">
                  {entry.priority_score?.toFixed(2) ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}

function PerSkuCardList({
  reports,
  authorityMap,
}: {
  reports: AgentCenterPerSkuReport[];
  authorityMap: AgentCenterAuthorityMap;
}) {
  if (reports.length === 0) {
    return (
      <SurfaceCard title="Per-SKU scorecards">
        <div className="px-5 py-4 text-sm text-slate-500">
          No SKU reports returned — likely all SKUs were blocked at preflight.
        </div>
      </SurfaceCard>
    );
  }
  return (
    <SurfaceCard
      title="Per-SKU scorecards"
      description="Identity / Content / Routability are inputs Pivota can act on. Citation is the output the merchant cares about. Click a card to expand evidence."
    >
      <div className="space-y-3 px-5 py-4">
        {reports.map((r) => (
          <PerSkuCard
            key={r.sku_key}
            report={r}
            authority={authorityMap.per_sku?.[r.sku_key]}
          />
        ))}
      </div>
    </SurfaceCard>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  openai: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
};

function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

// Per-model strip on a SKU card: one chip per model that ran (score), plus a
// "cited in N/M models" summary. Renders whatever providers ran — one column
// today (Gemini), filling in as ChatGPT/Claude are enabled.
function PerSkuModelStrip({
  citationByProvider,
  modelsCited,
}: {
  citationByProvider?: Record<string, SkuProviderCitation>;
  modelsCited?: ModelsCited;
}) {
  const entries = Object.entries(citationByProvider || {});
  if (entries.length === 0 && !modelsCited) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        By model
      </span>
      {entries.map(([provider, entry]) => {
        const failed = entry?.status === 'probe_failed';
        return (
          <span
            key={provider}
            className="inline-flex items-center gap-1 rounded-full border border-current/15 bg-white/40 px-2 py-0.5 text-[11px]"
            title={failed ? 'This model failed to respond on this run' : undefined}
          >
            <span className="font-medium">{providerLabel(provider)}</span>
            <span className="opacity-70">
              {failed ? 'no response' : entry?.score == null ? '—' : entry.score}
            </span>
          </span>
        );
      })}
      {modelsCited && modelsCited.of > 0 ? (
        <span className="ml-1 text-[11px] opacity-70">
          cited in {modelsCited.cited}/{modelsCited.of} model
          {modelsCited.of === 1 ? '' : 's'}
        </span>
      ) : null}
    </div>
  );
}

// The recommended next step for this SKU (from the backend's deterministic
// next_best_action). Renders only the curated merchant-facing fields —
// headline / first move / Pivota path / CTA — never the internal evidence.
function PerSkuNextBestAction({ nba }: { nba?: SkuNextBestAction | null }) {
  if (!nba || (!nba.headline && !nba.first_move)) return null;
  return (
    <div className="mt-3 rounded-md border border-current/15 bg-white/40 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        Recommended next step
      </div>
      {nba.headline ? (
        <div className="mt-1 text-sm font-semibold">{nba.headline}</div>
      ) : null}
      {nba.first_move ? (
        <div className="mt-1 text-xs opacity-80">{nba.first_move}</div>
      ) : null}
      {nba.pivota_assisted && nba.pivota_assisted.length > 0 ? (
        <div className="mt-1.5 text-xs opacity-70">
          <span className="font-medium">Pivota can help: </span>
          {nba.pivota_assisted[0]}
        </div>
      ) : null}
      {nba.cta?.label ? (
        <div className="mt-2 inline-flex rounded border border-current/20 px-2.5 py-1 text-xs font-medium">
          {nba.cta.label}
        </div>
      ) : null}
    </div>
  );
}

function PerSkuCard({
  report,
  authority,
}: {
  report: AgentCenterPerSkuReport;
  authority: AgentCenterAuthorityMap['per_sku'][string] | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const bandCls = bandColorClasses(report.band);
  return (
    <div className={`rounded-lg border-2 ${bandCls}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between px-4 py-3 text-left"
      >
        <div className="flex-1">
          <div className="text-sm font-semibold">{report.sku_title || report.identity?.name || report.sku_key}</div>
          <div className="font-mono text-[10px] opacity-70">
            sku_key: {report.sku_key} · band: {report.band}
            {report.content_key ? ` · ${report.content_key}` : ''}
          </div>
        </div>
        <div className="text-xs opacity-70">{expanded ? '−' : '+'}</div>
      </button>
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DimensionCell label="Identity" score={report.scores.identity} />
          <DimensionCell label="Content" score={report.scores.content_richness} />
          <DimensionCell label="Routability" score={report.scores.routability} />
          <DimensionCell label="Citation" score={report.scores.citation} highlight />
        </div>
        <PerSkuModelStrip
          citationByProvider={report.citation_by_provider}
          modelsCited={report.models_cited}
        />
        {report.primary_gaps.length > 0 ? (
          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
              Primary gaps
            </div>
            <ul className="mt-1 space-y-1.5 text-xs">
              {report.primary_gaps.slice(0, 3).map((gap, idx) => (
                <li key={`${report.sku_key}-gap-${idx}`}>
                  <span className="font-medium">{gap.label}</span>
                  {gap.why ? (
                    <span className="block opacity-70">{gap.why}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <PerSkuNextBestAction nba={report.next_best_action} />
        {expanded ? (
          <div className="mt-4 space-y-3 border-t border-current/10 pt-3">
            <GroundingEvidenceList evidence={report.verbatim_grounding_evidence} />
            <AuthorityHostsBlock entry={authority} />
            <AxisCoverageBlock coverage={report.axis_coverage} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DimensionCell({
  label,
  score,
  highlight,
}: {
  label: string;
  score: SkuDimensionScore;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        highlight
          ? 'border-current/40 bg-white/80'
          : 'border-current/20 bg-white/40'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide opacity-60">
        {label}
        {highlight ? ' (output)' : ''}
      </div>
      <div className={`text-lg font-bold ${dimensionScoreColor(score.score)}`}>
        {score.score}
      </div>
    </div>
  );
}

function GroundingEvidenceList({
  evidence,
}: {
  evidence: AgentCenterPerSkuReport['verbatim_grounding_evidence'];
}) {
  if (!evidence || evidence.length === 0) {
    return (
      <div className="text-xs opacity-70">
        No verbatim grounding evidence captured for this SKU.
      </div>
    );
  }
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        Verbatim grounded evidence
      </div>
      <div className="mt-1 space-y-2">
        {evidence.slice(0, 5).map((e, idx) => {
          // Backend `_grounding_evidence` emits `query` + `grounding_sources`.
          const promptText = e.prompt ?? e.query;
          const sources = e.grounded_sources ?? e.grounding_sources ?? [];
          return (
            <blockquote
              key={`ev-${idx}`}
              className="border-l-2 border-current/30 bg-white/40 px-3 py-1.5 text-xs italic"
            >
              <div className="not-italic font-semibold opacity-70">{promptText}</div>
              {e.evidence_excerpt ? <p className="mt-1">{e.evidence_excerpt}</p> : null}
              {sources.length > 0 ? (
                <div className="not-italic mt-1 text-[10px] opacity-60">
                  Cited:{' '}
                  {sources
                    .slice(0, 5)
                    .map((s) => s.host || s.title || s.uri)
                    .join(', ')}
                </div>
              ) : null}
            </blockquote>
          );
        })}
      </div>
    </div>
  );
}

function AuthorityHostsBlock({
  entry,
}: {
  entry: AgentCenterAuthorityMap['per_sku'][string] | undefined;
}) {
  if (!entry || (entry.hosts.length === 0 && entry.reddit.subreddits.length === 0)) {
    return (
      <div className="text-xs opacity-70">
        No authority hosts or Reddit threads cited for this SKU.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {entry.hosts.length > 0 ? (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
            Authority hosts cited
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {entry.hosts.slice(0, 12).map((h: AuthorityHostEntry, idx) => (
              <span
                key={`host-${idx}`}
                className="inline-flex items-center gap-1 rounded bg-white/60 px-2 py-0.5 text-[11px]"
                title={h.evidence_excerpt}
              >
                <span className="rounded-sm bg-current/10 px-1 text-[9px] uppercase tracking-wide">
                  {h.host_type}
                </span>
                {h.host}
                <span className="opacity-60">·{h.prompts_cited_count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {entry.reddit.subreddits.length > 0 ? (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
            Reddit (monitor-only)
          </div>
          <div className="mt-1 space-y-1">
            {entry.reddit.subreddits.slice(0, 5).map((sub: AuthorityRedditSubreddit, idx) => (
              <div key={`sub-${idx}`} className="text-[11px]">
                <strong>r/{sub.name}</strong>
                {sub.sentiment_proxy !== null ? (
                  <span className="ml-2 opacity-70">
                    sentiment {sub.sentiment_proxy.toFixed(2)}
                  </span>
                ) : null}
                {sub.recurring_objections.length > 0 ? (
                  <span className="ml-2 opacity-70">
                    objections: {sub.recurring_objections.slice(0, 3).join(', ')}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AxisCoverageBlock({
  coverage,
}: {
  coverage: AgentCenterPerSkuReport['axis_coverage'];
}) {
  const entries = Object.entries(coverage || {});
  if (entries.length === 0) return null;
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        Axis coverage
      </div>
      <div className="mt-1 space-y-1">
        {entries.map(([axis, count]) => (
          <div key={`axis-${axis}`} className="flex items-center gap-2 text-[11px]">
            <span className="w-32 truncate font-mono opacity-70">{axis}</span>
            <div className="flex-1 rounded bg-current/10">
              <div
                className="h-2 rounded bg-current/40"
                style={{ width: `${Math.round((count / max) * 100)}%` }}
              />
            </div>
            <span className="w-8 text-right opacity-70">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

