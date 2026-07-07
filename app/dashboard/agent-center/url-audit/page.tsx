'use client';

/**
 * Tier-1 URL-audit wedge — the low-friction front door to AI Commerce Readiness.
 *
 * Merchant-CURATED: you give us your brand site + up to 5 product URLs (your
 * hero SKUs); we fetch each for clean data and audit each as ITS OWN per-product
 * report — how AI shopping agents (Gemini grounded search) cite it, which
 * competitors are cited instead, and the action plan to win. No catalog sync.
 * Catalog-only dimensions (identity/content/routability) need a connected store
 * and render as "connect store to measure". The deeper full-catalog audit lives
 * at /dashboard/agent-center/ai-readiness.
 *
 * Backend: POST /api/merchant-center/audit/url-readiness — body
 * { product_urls[1-5], website?, brand? } → enqueues the durable per-SKU
 * pipeline; GET returns per_sku_reports + brand_rollup + authority_map.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Globe,
  Info,
  Link2,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { stashVisibilityHandoff } from '@/lib/visibility-handoff';
import {
  MerchantButton,
  PageHeader,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';
import { RecentAuditsPanel } from '@/components/audit/RecentAuditsPanel';
import { VisibilityTrendChart } from '@/components/audit/VisibilityTrendChart';
import { BuyCreditsCard } from '@/components/billing/BuyCreditsCard';
import { PerSkuReportCard } from '@/components/audit/PerSkuReportCard';
import { CustomPromptsPanel } from '@/components/audit/CustomPromptsPanel';
import { GetCitedPanel } from '@/components/audit/GetCitedPanel';
import { MerchantNarrativePanel } from '@/components/audit/MerchantNarrativePanel';
import { PrioritizedActionsPanel } from '@/components/audit/PrioritizedActionsPanel';
import type {
  AgentCenterBdReport,
  AgentCenterBdVerdictLabel,
  UrlReadinessAuditResponse,
} from '@/lib/types/ai-readiness';

const MAX_PRODUCT_URLS = 5;
const MAX_CUSTOM_PROMPTS = 10;

function verdictTone(label: AgentCenterBdVerdictLabel | null | undefined): string {
  const l = (label || '').toUpperCase();
  if (l.includes('STRONG')) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (l.includes('INVISIBLE')) return 'text-red-700 bg-red-50 border-red-200';
  return 'text-amber-700 bg-amber-50 border-amber-200';
}

// Tailor the "run deeper" funnel headline to what the free sample found, so the
// CTA mirrors the merchant's actual problem and frames the full per-SKU audit as
// the fix. `competitor` is the top brand/host AI cited instead (may be null).
function buildDeeperCta(
  verdict: AgentCenterBdVerdictLabel | null,
  competitor: string | null,
): { eyebrow: string; title: string; description: string } {
  const eyebrow = 'Run deeper analysis';
  const vs = competitor ? `AI is recommending ${competitor} instead. ` : '';
  switch (verdict) {
    case 'INVISIBLE':
      return {
        eyebrow,
        title: "AI can't find you for these queries yet",
        description: `${vs}The full per-SKU audit shows exactly why — and the independent sources to get cited in, with one-click pitches. Connect your catalog to run it.`,
      };
    case 'VISIBLE VIA RETAILERS':
      return {
        eyebrow,
        title: "You're findable through retailers — not recommended on your own merits",
        description:
          'The full audit splits findability from endorsement per SKU and shows the independent sources to win the category — with the pitch plan to get there. Connect your catalog to run it.',
      };
    case 'VISIBLE BUT MISATTRIBUTED':
      return {
        eyebrow,
        title: 'AI surfaces you, but the credit goes elsewhere',
        description: `${vs}The full per-SKU audit shows where attribution leaks and how to claim it back. Connect your catalog to run it.`,
      };
    case 'PARTIAL':
      return {
        eyebrow,
        title: 'Mixed results — you win some queries, lose others',
        description:
          'The full per-SKU audit pinpoints which products to fix first and the exact hosts to get cited in. Connect your catalog to run it.',
      };
    case 'STRONG':
      return {
        eyebrow,
        title: "You're winning some of these queries — now defend and expand",
        description:
          'The full per-SKU audit shows where to defend and where to grow across your whole catalog, with movement tracking over time. Connect your catalog to run it.',
      };
    default:
      return {
        eyebrow,
        title: 'Get the full picture, per SKU',
        description:
          'This audits the products you pasted, per SKU, across AI shopping agents. The full audit covers your whole catalog with availability + serving data — connect your store to become buyable inside AI agents, too.',
      };
  }
}

function scorePill(label: string, value: number | null | undefined) {
  const v = typeof value === 'number' ? value : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[color:var(--merchant-line)] px-2 py-1 text-xs">
      <span className="merchant-text-muted">{label}</span>
      <span className="font-semibold">{v === null ? '—' : `${v}/100`}</span>
    </span>
  );
}


export default function UrlAuditPage() {
  const [website, setWebsite] = useState('');
  const [brand, setBrand] = useState('');
  const [productUrls, setProductUrls] = useState<string[]>(['']);
  // Optional merchant test prompts ("Your prompts"), one per line, probed once.
  const [customPromptsText, setCustomPromptsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Non-error info (e.g. "still running — saved to history"): grounded per-SKU
  // probes can run past the browser poll budget, but the run is durable.
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<UrlReadinessAuditResponse | null>(null);
  // Visibility run history: the run currently shown, an open-in-progress marker,
  // a key that refreshes the list after a new run, and a scroll target.
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const resultRef = useRef<HTMLDivElement | null>(null);

  // Prefill the brand site + name from the merchant's onboarding profile.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .getProfile()
      .then((p: { website?: string; business_name?: string } | null) => {
        if (cancelled || !p) return;
        if (p.website) setWebsite(p.website);
        if (p.business_name) setBrand(p.business_name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setUrlAt = (i: number, v: string) =>
    setProductUrls((prev) => prev.map((u, idx) => (idx === i ? v : u)));
  const addUrl = () =>
    setProductUrls((prev) =>
      prev.length >= MAX_PRODUCT_URLS ? prev : [...prev, ''],
    );
  const removeUrl = (i: number) =>
    setProductUrls((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i),
    );

  const cleanedUrls = productUrls.map((u) => u.trim()).filter(Boolean);

  // One prompt per line, trimmed + case-insensitive deduped (mirrors readiness).
  const customPromptsParsed = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of customPromptsText.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }, [customPromptsText]);
  const customPromptsError =
    customPromptsParsed.length > MAX_CUSTOM_PROMPTS
      ? `Too many prompts: ${customPromptsParsed.length} / ${MAX_CUSTOM_PROMPTS} max.`
      : null;

  const canRun = cleanedUrls.length > 0 && !loading && !customPromptsError;

  const run = async () => {
    if (cleanedUrls.length === 0) {
      setError('Add at least one product URL to audit.');
      return;
    }
    setLoading(true);
    setElapsedSec(0);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const res = await apiClient.runUrlReadinessAudit({
        productUrls: cleanedUrls,
        website: website.trim() || undefined,
        brand: brand.trim() || undefined,
        customPrompts: customPromptsParsed.length > 0 ? customPromptsParsed : undefined,
        onProgress: ({ elapsedMs }) =>
          setElapsedSec(Math.round(elapsedMs / 1000)),
      });
      setResult(res);
      setActiveRunId(res.audit_run_id ?? null);
      setHistoryReloadKey((k) => k + 1); // surface the just-finished check in history
      // Hand off the audited URLs so the readiness audit can pre-select these
      // exact products once the merchant connects + syncs their catalog.
      stashVisibilityHandoff({
        urls: cleanedUrls,
        brand: brand.trim() || undefined,
        website: website.trim() || undefined,
      });
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      if (e?.code === 'poll_timeout') {
        // Not a failure — the durable run is still going and will appear in
        // Past visibility checks. Surface it there + as a friendly notice.
        setNotice(e?.message || 'Still auditing — check Past visibility checks shortly.');
        if (e?.runId) setActiveRunId(e.runId);
        setHistoryReloadKey((k) => k + 1);
        stashVisibilityHandoff({
          urls: cleanedUrls,
          brand: brand.trim() || undefined,
          website: website.trim() || undefined,
        });
      } else if (status === 402) {
        setError(
          detail?.message ||
            "You've used your free URL audits. Connect your store for the full per-SKU audit, or upgrade to keep auditing by URL.",
        );
      } else if (status === 422) {
        const unresolved = Array.isArray(detail?.unresolved)
          ? detail.unresolved
              .map((u: { url?: string }) => u?.url)
              .filter(Boolean)
              .join(', ')
          : '';
        setError(
          (detail?.message ||
            "We couldn't read a product from those URLs. Make sure each link opens a single product page.") +
            (unresolved ? ` (${unresolved})` : ''),
        );
      } else {
        setError(e?.message || 'Audit failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Re-open a past visibility check from the history panel: fetch the completed
  // run's report by id and render it (no re-run, no spent free-audit).
  const openVisibilityRun = useCallback(async (runId: string) => {
    setLoadingRunId(runId);
    try {
      const detail = await apiClient.getUrlAuditRunDetail(runId);
      const hasContent =
        !!detail &&
        (('per_sku_reports' in detail &&
          Array.isArray((detail as UrlReadinessAuditResponse).per_sku_reports) &&
          (detail as UrlReadinessAuditResponse).per_sku_reports!.length > 0) ||
          ('brand_report' in detail && !!detail.brand_report));
      if (hasContent) {
        setResult(detail as UrlReadinessAuditResponse);
        setActiveRunId(runId);
        setError(null);
        setTimeout(
          () => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          80,
        );
      }
    } catch {
      /* best-effort — a missing/incomplete run just doesn't load */
    } finally {
      setLoadingRunId(null);
    }
  }, []);

  const report = result?.brand_report;
  const agg = report?.aggregate;
  const methodology = result?.methodology;

  // New per-product shape (durable per_sku pipeline). Falls back to the legacy
  // brand-verdict render for old history runs that predate it.
  const perSku = result?.per_sku_reports ?? [];
  const catalogAvail = result?.catalog_dimensions_available ?? false;
  const citedCount = perSku.filter(
    (r) =>
      (r.scores?.citation?.score ?? 0) > 0 || (r.models_cited?.cited ?? 0) > 0,
  ).length;

  // The "run deeper" funnel CTA, tailored to what this sample found — turns the
  // problem (invisible / competitor wins / found-but-not-recommended) into the
  // promise of the fix (the full per-SKU audit + win-plan, which needs a synced
  // catalog → the integration driver).
  const topCompetitor = report?.cross_product_competitors?.[0]?.host ?? null;
  const deeperCta = buildDeeperCta(agg?.brand_verdict_label ?? null, topCompetitor);
  // Don't push the connect-store / buy-credits / free-sample funnel at a
  // merchant who's already subscribed + connected. Unknown context (older runs)
  // → undefined → funnel still shows (safe default).
  const isPaid = result?.merchant_context?.is_paid ?? false;
  const storeConnected = result?.merchant_context?.store_connected ?? false;
  const fullySetUp = isPaid && storeConnected;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Per-product · no catalog sync"
        title="See how AI sees your products"
        description="Paste up to 5 product links and we'll audit each one — how AI shopping agents (Gemini + ChatGPT) cite it, which competitors and channels they surface instead, and what to do about it. No catalog sync required. Connect your store for the full-catalog audit with availability + agent checkout."
      />

      {/* Re-open a past visibility check (subject_type=merchant_url). Renders
          null when there's no history yet. */}
      <RecentAuditsPanel
        subjectType="merchant_url"
        title="Past visibility checks"
        itemNoun="URL"
        onOpenRun={openVisibilityRun}
        activeRunId={activeRunId}
        loadingRunId={loadingRunId}
        reloadKey={historyReloadKey}
      />

      {/* Visibility-over-time trend (the pinned-basis payoff). Refetches when a
          new check completes. Self-manages its own empty/baseline states, so it
          renders on a first-time page too (as a "run your first check" nudge). */}
      <VisibilityTrendChart reloadKey={historyReloadKey} />

      <SurfaceCard title="Audit your products">
        <div className="space-y-4 px-5 py-4">
          {/* Brand site (optional, prefilled). */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="brand-site">
              Your brand site{' '}
              <span className="merchant-text-muted font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
              <input
                id="brand-site"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourbrand.com"
                disabled={loading}
                className="w-full rounded-lg border border-[color:var(--merchant-line)] bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-[color:var(--merchant-accent,#6366f1)]"
              />
            </div>
          </div>

          {/* Brand name (optional) — lets the merchant self-identify so the
              audit probes the name buyers actually use, not the storefront
              vendor string. Derived from the site/products when blank. */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="brand-name">
              Brand name{' '}
              <span className="merchant-text-muted font-normal">(optional)</span>
            </label>
            <input
              id="brand-name"
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="How shoppers refer to your brand"
              disabled={loading}
              className="w-full rounded-lg border border-[color:var(--merchant-line)] bg-transparent py-2 px-3 text-sm outline-none focus:border-[color:var(--merchant-accent,#6366f1)]"
            />
          </div>

          {/* Product URLs (1–3, merchant-curated). */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Product URLs{' '}
              <span className="merchant-text-muted font-normal">
                (up to {MAX_PRODUCT_URLS} — your hero SKUs)
              </span>
            </label>
            {productUrls.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
                  <input
                    type="url"
                    value={u}
                    onChange={(e) => setUrlAt(i, e.target.value)}
                    placeholder="https://yourbrand.com/products/your-bestseller"
                    disabled={loading}
                    className="w-full rounded-lg border border-[color:var(--merchant-line)] bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-[color:var(--merchant-accent,#6366f1)]"
                  />
                </div>
                {productUrls.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeUrl(i)}
                    disabled={loading}
                    aria-label="Remove product URL"
                    className="rounded-md border border-[color:var(--merchant-line)] p-2 opacity-70 hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
            {productUrls.length < MAX_PRODUCT_URLS ? (
              <button
                type="button"
                onClick={addUrl}
                disabled={loading}
                className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--merchant-accent,#6366f1)]"
              >
                <Plus className="h-3.5 w-3.5" /> Add another product
              </button>
            ) : null}
          </div>

          {/* Optional: merchant's own test prompts ("Your prompts"). Probed once
              brand-level and surfaced with cited/competitor/source detail. */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="custom-prompts">
              Your prompts to test{' '}
              <span className="merchant-text-muted font-normal">
                (optional — one per line, up to {MAX_CUSTOM_PROMPTS})
              </span>
            </label>
            <textarea
              id="custom-prompts"
              value={customPromptsText}
              onChange={(e) => setCustomPromptsText(e.target.value)}
              disabled={loading}
              rows={3}
              placeholder={
                'best collagen jelly for glowing skin\n' +
                'vitamin c gummies for travel\n' +
                'what should I take for skin health'
              }
              className="w-full rounded-lg border border-[color:var(--merchant-line)] bg-transparent py-2 px-3 font-mono text-xs outline-none focus:border-[color:var(--merchant-accent,#6366f1)]"
            />
            {customPromptsError ? (
              <p className="text-xs text-red-700">{customPromptsError}</p>
            ) : (
              <p className="merchant-text-muted text-xs">
                We&apos;ll test exactly these buyer prompts and show whether AI
                cited you, the sources it used, and which competitors it named.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="merchant-text-muted text-xs">
              We fetch each link for clean data (Shopify, Wix, or any product
              page) and run it through AI shopping-agent queries. This can take
              1–3 minutes — you can leave this tab open.
            </p>
            <MerchantButton
              onClick={run}
              disabled={!canRun}
              icon={loading ? undefined : ArrowRight}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {elapsedSec > 0 ? `Auditing… (${elapsedSec}s)` : 'Auditing…'}
                </span>
              ) : (
                'Audit my products'
              )}
            </MerchantButton>
          </div>
        </div>
      </SurfaceCard>

      {error ? (
        <SurfaceCard>
          <div className="flex items-start gap-3 px-5 py-4 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </SurfaceCard>
      ) : null}

      {notice ? (
        <SurfaceCard>
          <div className="flex items-start gap-3 px-5 py-4 text-sm text-[color:var(--merchant-accent,#6366f1)]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        </SurfaceCard>
      ) : null}

      {result ? (
        <div ref={resultRef} className="space-y-4">
          {perSku.length > 0 ? (
            <>
              <SurfaceCard
                eyebrow="AI visibility · per product"
                title="How AI sees each of your products"
                description={result.audited_url || undefined}
              >
                <div className="space-y-2 px-5 py-4">
                  <p className="text-sm">
                    <span className="font-semibold">{citedCount}</span> of{' '}
                    <span className="font-semibold">{perSku.length}</span> product
                    {perSku.length === 1 ? '' : 's'}{' '}
                    {citedCount === 1 ? 'is' : 'are'} cited by AI shopping agents for
                    the buyer-intent prompts we tested.
                  </p>
                  {methodology ? (
                    <p className="merchant-text-muted text-xs">
                      {methodology.products_audited} product
                      {methodology.products_audited === 1 ? '' : 's'} ×{' '}
                      {methodology.queries_per_product} buyer-intent queries (Gemini
                      grounded search).
                    </p>
                  ) : null}
                  {typeof result.free_audits_remaining === 'number' ? (
                    <p className="merchant-text-muted text-xs">
                      {result.free_audits_remaining} free audit
                      {result.free_audits_remaining === 1 ? '' : 's'} left.
                    </p>
                  ) : null}
                  {!catalogAvail ? (
                    <div className="flex items-start gap-2 rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-2 text-xs">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="merchant-text-muted">
                        Catalog signals (identity, content depth, structured routing)
                        need a connected store — connect to unlock the full per-SKU
                        score and one-click execution.
                      </span>
                    </div>
                  ) : null}
                </div>
              </SurfaceCard>

              {/* The insight layer: headline story, what's working, where you're
                  losing, prioritized actions + answer-quality — before the
                  per-product detail. */}
              <MerchantNarrativePanel narrative={result.merchant_narrative} />

              {/* The ranked first moves the backend computes — the bridge from
                  the brand narrative into the per-product cards below. */}
              <PrioritizedActionsPanel
                actions={result.merchant_narrative?.prioritized_actions}
                runId={result.run_id ?? result.audit_run_id ?? null}
              />

              {/* One card per pasted product — its own analysis + action plan. */}
              <div className="space-y-3">
                {perSku.map((r, i) => (
                  <PerSkuReportCard
                    key={r.sku_key || i}
                    report={r}
                    index={i}
                    catalogDimensionsAvailable={catalogAvail}
                    runId={result.run_id ?? result.audit_run_id ?? null}
                    pdpUrl={
                      result.audited_products?.find((p) => p.sku_key === r.sku_key)
                        ?.pdp_url ?? null
                    }
                  />
                ))}
              </div>

              {/* Get cited on the INDEPENDENT external sources AI trusts, per
                  engine — the third-party evidence agents actually cite. */}
              {(() => {
                const authHosts =
                  (result.authority_map as { hosts?: { host: string; providers?: string[] }[] } | undefined)
                    ?.hosts ?? [];
                const enginesByHost: Record<string, string[]> = {};
                for (const h of authHosts) {
                  if (h?.host) enginesByHost[h.host] = h.providers ?? [];
                }
                const ep = perSku[0]?.engine_playbook ?? null;
                const categoryHint =
                  perSku[0]?.product_competitiveness?.discovery?.missed?.[0] ??
                  ep?.divergence?.[0]?.query ??
                  null;
                // Specific subreddits/threads the backend tracked, aggregated
                // across SKUs (the panel filters out junk + dedupes).
                const redditSubreddits = (
                  (result.authority_map as { skus?: { reddit?: { subreddits?: unknown[] } }[] } | undefined)
                    ?.skus ?? []
                ).flatMap((s) => s?.reddit?.subreddits ?? []);
                return (
                  <GetCitedPanel
                    moves={result.where_youre_losing?.outreach_moves}
                    enginesByHost={enginesByHost}
                    enginePlaybook={ep}
                    categoryHint={categoryHint}
                    brand={
                      (result.brand_report as { merchant_name?: string } | undefined)?.merchant_name ?? null
                    }
                    runId={result.run_id ?? result.audit_run_id ?? null}
                    redditSubreddits={redditSubreddits as Parameters<typeof GetCitedPanel>[0]['redditSubreddits']}
                  />
                );
              })()}

              {/* The merchant's own test prompts, if any (brand-level). */}
              <CustomPromptsPanel prompts={result.custom_prompts} />
            </>
          ) : report && agg ? (
            <>
          <SurfaceCard
            eyebrow="Brand verdict"
            title={report.merchant_name}
            description={result?.audited_url || undefined}
          >
            <div className="space-y-3 px-5 py-4">
              <div
                className={`inline-block rounded-lg border px-3 py-2 text-sm font-semibold ${verdictTone(
                  agg.brand_verdict_label,
                )}`}
              >
                {agg.brand_verdict_label || 'INSUFFICIENT DATA'}
              </div>
              {methodology ? (
                <p className="merchant-text-muted text-xs">
                  Based on {methodology.products_audited} product
                  {methodology.products_audited === 1 ? '' : 's'} ×{' '}
                  {methodology.queries_per_product} buyer-intent queries — a
                  focused sample, not an exhaustive measurement.
                </p>
              ) : null}
              {agg.brand_verdict_explanation ? (
                <p className="text-sm">{agg.brand_verdict_explanation}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {scorePill('AI visibility', agg.avg_visibility)}
                {scorePill('Your-URL attribution', agg.avg_attribution)}
                {scorePill('Category visibility', agg.avg_category_visibility)}
              </div>
              <p className="merchant-text-muted text-xs">
                {agg.products_succeeded}/{agg.products_count} products audited ·{' '}
                {typeof result?.free_audits_remaining === 'number'
                  ? `${result.free_audits_remaining} free audit${
                      result.free_audits_remaining === 1 ? '' : 's'
                    } left`
                  : null}
              </p>
            </div>
          </SurfaceCard>

          <SurfaceCard title="Per-product">
            <div className="divide-y divide-[color:var(--merchant-line)]">
              {(report.per_product || []).map((p: AgentCenterBdReport, i: number) => (
                <div key={`${p.merchant_pdp_url}-${i}`} className="space-y-2 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {p.product?.title || 'Product'}
                      </div>
                      {p.merchant_pdp_url ? (
                        <div className="truncate text-xs merchant-text-muted">
                          {p.merchant_pdp_url}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${verdictTone(
                        p.verdict?.label,
                      )}`}
                    >
                      {p.verdict?.label || '—'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {scorePill('Visibility', p.verdict?.visibility_score)}
                    {scorePill('Attribution', p.verdict?.attribution_score)}
                    {scorePill('Category', p.verdict?.category_visibility_score)}
                  </div>
                  {p.merchant_view?.headline?.plain_summary ? (
                    <p className="text-xs merchant-text-muted">
                      {p.merchant_view.headline.plain_summary}
                    </p>
                  ) : null}
                  {p.action_items?.[0]?.title ? (
                    <p className="text-xs">
                      <span className="merchant-text-muted">Next: </span>
                      {p.action_items[0].title}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </SurfaceCard>
            </>
          ) : null}

          {/* Honest, upfront disclosure of what this free sample did + didn't do. */}
          {methodology ? (
            <SurfaceCard eyebrow="Methodology" title="How we measured this">
              <div className="space-y-3 px-5 py-4 text-sm">
                <p>{methodology.what_we_checked}</p>
                <ul className="space-y-1.5">
                  {methodology.limitations.map((lim, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="merchant-text-muted text-xs">{lim}</span>
                    </li>
                  ))}
                </ul>
                {methodology.unresolved_urls.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    We couldn&apos;t read a product from{' '}
                    {methodology.unresolved_urls.length} of the URLs you gave
                    us, so they weren&apos;t audited:
                    <ul className="mt-1 list-disc pl-4">
                      {methodology.unresolved_urls.map((u, i) => (
                        <li key={i} className="break-all">
                          {u.url}
                          {u.reason ? ` — ${u.reason}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </SurfaceCard>
          ) : null}

          {/* Next step — tailored to the merchant's state. A subscribed +
              connected merchant gets a "run the full catalog" CTA, not the
              free-sample / connect-store / buy-credits funnel. */}
          {fullySetUp ? (
            <SurfaceCard
              eyebrow="Full catalog"
              title="Run this across your whole catalog"
              description="You're subscribed and connected — run the full per-SKU audit on your synced catalog, with availability, serving, and agent-checkout."
            >
              <div className="px-5 py-4">
                <a
                  href="/dashboard/agent-center/ai-readiness"
                  className="inline-flex items-center gap-1 rounded-md border border-[color:var(--merchant-accent,#6366f1)] px-3 py-1.5 text-sm font-semibold text-[color:var(--merchant-accent,#6366f1)]"
                >
                  Run the full per-SKU audit <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </SurfaceCard>
          ) : (
            <SurfaceCard
              eyebrow={deeperCta.eyebrow}
              title={deeperCta.title}
              description={deeperCta.description}
            >
              <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row">
                {!storeConnected ? (
                  <a
                    href="/dashboard/agent-center/ai-readiness"
                    className="flex-1 rounded-lg border border-[color:var(--merchant-line)] p-4 transition hover:border-[color:var(--merchant-accent,#6366f1)]"
                  >
                    <div className="text-sm font-semibold">Connect your store</div>
                    <p className="merchant-text-muted mt-1 text-xs">
                      Sync your catalog → we audit every SKU automatically with
                      availability + serving data, and make you transactable in
                      agent checkout.
                    </p>
                  </a>
                ) : null}
                {/* Pay-as-you-go / subscribe only when NOT already subscribed. */}
                {!isPaid ? <BuyCreditsCard /> : null}
                {!isPaid ? (
                  <a
                    href="/dashboard/billing"
                    className="flex-1 rounded-lg border border-[color:var(--merchant-line)] p-4 transition hover:border-[color:var(--merchant-accent,#6366f1)]"
                  >
                    <div className="text-sm font-semibold">Subscribe</div>
                    <p className="merchant-text-muted mt-1 text-xs">
                      Recurring audits + monitoring + more SKUs per run, so you
                      catch visibility drops before they cost you sales.
                    </p>
                  </a>
                ) : null}
              </div>
            </SurfaceCard>
          )}
        </div>
      ) : null}
    </div>
  );
}
