'use client';

/**
 * Tier-1 URL-audit wedge — the low-friction front door to AI Commerce Readiness.
 *
 * Paste your store URL → we crawl it (no catalog sync needed) and show how AI
 * shopping agents see your brand + top products. The first 2 audits per merchant
 * are free; the deeper per-SKU audit (which unlocks serving + checkout) lives at
 * /dashboard/agent-center/ai-readiness and requires connecting your store.
 *
 * Backend: POST /api/merchant-center/audit/url-readiness (returns a brand_report
 * — the same shape the legacy brand audit renders).
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Globe, Loader2 } from 'lucide-react';
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
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UrlReadinessAuditResponse | null>(null);

  // Prefill with the merchant's onboarding store URL (best-effort).
  useEffect(() => {
    let cancelled = false;
    apiClient
      .getProfile()
      .then((p: { website?: string } | null) => {
        if (!cancelled && p?.website) setUrl(p.website);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiClient.runUrlReadinessAudit({
        url: url.trim() || undefined,
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
        setError(
          detail?.message ||
            "We couldn't audit that URL. Check the address, or try your store's homepage.",
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Free · no sync"
        title="See how AI sees your store"
        description="Paste your store URL and we'll crawl it to show how AI shopping agents (Gemini grounded search) find your brand and top products — no catalog sync required. Your first 2 audits are free."
      />

      <SurfaceCard title="Audit by URL">
        <div className="space-y-3 px-5 py-4">
          <label className="block text-sm font-medium" htmlFor="store-url">
            Your store URL
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
              <input
                id="store-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourstore.com"
                disabled={loading}
                className="w-full rounded-lg border border-[color:var(--merchant-line)] bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-[color:var(--merchant-accent,#6366f1)]"
              />
            </div>
            <MerchantButton
              onClick={run}
              disabled={loading}
              icon={loading ? undefined : ArrowRight}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Auditing…
                </span>
              ) : (
                'Audit my store'
              )}
            </MerchantButton>
          </div>
          <p className="merchant-text-muted text-xs">
            Crawls your public storefront (Shopify, Wix, or any sitemap). Takes
            ~60–90 seconds. For the deeper per-SKU audit that unlocks agent
            serving &amp; checkout,{' '}
            <a className="underline" href="/dashboard/agent-center/ai-readiness">
              connect your store
            </a>
            .
          </p>
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
            description={result?.audited_url}
          >
            <div className="space-y-3 px-5 py-4">
              <div
                className={`inline-block rounded-lg border px-3 py-2 text-sm font-semibold ${verdictTone(
                  agg.brand_verdict_label,
                )}`}
              >
                {agg.brand_verdict_label || 'INSUFFICIENT DATA'}
              </div>
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
        </div>
      ) : null}
    </div>
  );
}
