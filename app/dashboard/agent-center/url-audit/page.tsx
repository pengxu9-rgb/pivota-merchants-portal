'use client';

/**
 * Tier-1 URL-audit wedge — the low-friction front door to AI Commerce Readiness.
 *
 * Merchant-CURATED: you give us your brand site + up to 5 product URLs (your
 * hero SKUs); we fetch each for clean data and show how AI shopping agents
 * (Gemini grounded search) see exactly those — no catalog sync, no guessing
 * which products to audit. The first 2 audits per merchant are free. The deeper
 * per-SKU audit (which unlocks serving + checkout) lives at
 * /dashboard/agent-center/ai-readiness and requires connecting your store.
 *
 * Backend: POST /api/merchant-center/audit/url-readiness — body
 * { product_urls[1-5], website?, brand? }.
 */

import { useEffect, useState } from 'react';
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
import {
  MerchantButton,
  PageHeader,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';
import type {
  AgentCenterBdReport,
  AgentCenterBdVerdictLabel,
  UrlReadinessAuditResponse,
} from '@/lib/types/ai-readiness';

const MAX_PRODUCT_URLS = 5;

function verdictTone(label: AgentCenterBdVerdictLabel | null | undefined): string {
  const l = (label || '').toUpperCase();
  if (l.includes('STRONG')) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (l.includes('INVISIBLE')) return 'text-red-700 bg-red-50 border-red-200';
  return 'text-amber-700 bg-amber-50 border-amber-200';
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
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UrlReadinessAuditResponse | null>(null);

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
  const canRun = cleanedUrls.length > 0 && !loading;

  const run = async () => {
    if (cleanedUrls.length === 0) {
      setError('Add at least one product URL to audit.');
      return;
    }
    setLoading(true);
    setElapsedSec(0);
    setError(null);
    setResult(null);
    try {
      const res = await apiClient.runUrlReadinessAudit({
        productUrls: cleanedUrls,
        website: website.trim() || undefined,
        brand: brand.trim() || undefined,
        onProgress: ({ elapsedMs }) =>
          setElapsedSec(Math.round(elapsedMs / 1000)),
      });
      setResult(res);
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      if (status === 402) {
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

  const report = result?.brand_report;
  const agg = report?.aggregate;
  const methodology = result?.methodology;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Free · no sync"
        title="See how AI sees your products"
        description="Give us your top product links and we'll show how AI shopping agents (Gemini grounded search) find them — no catalog sync required. You pick the products; we audit exactly those. Your first 2 audits are free."
      />

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

          {/* Product URLs (1–5, merchant-curated). */}
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

      {report && agg ? (
        <div className="space-y-4">
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
                  small free sample, not a definitive measurement.
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
                    We couldn't read a product from{' '}
                    {methodology.unresolved_urls.length} of the URLs you gave
                    us, so they weren't audited:
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

          {/* Funnel: integrate (sync → buyable) + subscribe (recurring). */}
          <SurfaceCard
            eyebrow="Go deeper"
            title="Get the full picture"
            description="This free sample checks a handful of queries. Connect your store for a verified, full-catalog audit — and to become buyable inside AI agents."
          >
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row">
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
              <a
                href="/dashboard/billing"
                className="flex-1 rounded-lg border border-[color:var(--merchant-line)] p-4 transition hover:border-[color:var(--merchant-accent,#6366f1)]"
              >
                <div className="text-sm font-semibold">Subscribe</div>
                <p className="merchant-text-muted mt-1 text-xs">
                  Recurring audits + monitoring + more SKUs per run, so you catch
                  visibility drops before they cost you sales.
                </p>
              </a>
            </div>
          </SurfaceCard>
        </div>
      ) : null}
    </div>
  );
}
