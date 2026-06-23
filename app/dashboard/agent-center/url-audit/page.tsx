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

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Globe,
  Info,
  Link2,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Target,
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
import { BuyCreditsCard } from '@/components/billing/BuyCreditsCard';
import { PerSkuReportCard } from '@/components/audit/PerSkuReportCard';
import type {
  AgentCenterBdReport,
  AgentCenterBdVerdictLabel,
  SkuIntelligence,
  UrlReadinessAuditResponse,
} from '@/lib/types/ai-readiness';

const MAX_PRODUCT_URLS = 5;

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
          'This free sample checks a handful of queries. The full audit covers your whole catalog with a per-SKU win-plan — connect your store to become buyable inside AI agents, too.',
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

function densityTone(band: string | undefined): string {
  if (band === 'low') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (band === 'high') return 'text-red-700 bg-red-50 border-red-200';
  return 'text-amber-700 bg-amber-50 border-amber-200';
}

function verdictColor(v: string | undefined): string {
  const s = (v || '').toLowerCase();
  if (s === 'win') return 'text-emerald-700';
  if (s === 'partial') return 'text-amber-700';
  if (s === 'loss') return 'text-red-700';
  return 'merchant-text-muted';
}

// Intent-ladder layers we surface, in merchant-readable terms. The sidewalk
// layer is the hook; branded layers show "demand you already have".
const LADDER_LAYERS: Array<[string, string]> = [
  ['branded_transactional', 'When buyers name you'],
  ['branded_consideration', 'Reviews & alternatives'],
  ['head_category', 'Broad category'],
  ['sidewalk_opportunity', 'Sidewalk opportunity'],
];

/** Per-SKU AI-visibility intelligence: the sidewalk money-shot + open lanes +
 * the prompt matrix. Renders nothing fabricated — empty/mock runs degrade to
 * the honest headline + matrix only. */
function SkuIntelligenceCard({ data }: { data: SkuIntelligence }) {
  const sub = data.substitution_alert;
  const lanes = data.top_open_lanes || [];
  const matrix = data.prompt_matrix || [];
  const ladder = data.intent_ladder || {};
  const nba = data.next_best_action;
  // Only show the ChatGPT column once it has actually run (OPENAI_API_KEY live);
  // before that every row is "absent", so the column stays hidden.
  const hasChatgpt = matrix.some((r) => r.chatgpt && r.chatgpt !== 'absent');
  return (
    <SurfaceCard
      eyebrow="Hero SKU · how AI sees this product"
      title={data.hero_sku?.title || 'Your hero product'}
      description={data.hero_sku?.pdp_url || undefined}
    >
      <div className="space-y-4 px-5 py-4">
        {/* The money-shot lead. */}
        <div className="flex items-start gap-2 rounded-lg border border-[color:var(--merchant-accent,#6366f1)] px-4 py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--merchant-accent,#6366f1)]" />
          <p className="text-sm font-medium leading-snug">{data.headline}</p>
        </div>

        {data.note ? (
          <p className="merchant-text-muted text-xs">{data.note}</p>
        ) : null}

        {/* "AI recommends a rival when asked about YOU." */}
        {sub?.present ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              When buyers ask for alternatives to you, AI recommends{' '}
              <span className="font-semibold">{sub.substituted_by || 'a competitor'}</span>
              {sub.engines?.length ? ` (${sub.engines.join(', ')})` : ''}.
            </span>
          </div>
        ) : null}

        {/* Intent ladder: demand you have vs the opening. */}
        {Object.keys(ladder).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {LADDER_LAYERS.map(([key, label]) =>
              ladder[key] != null ? (
                <span key={key}>{scorePill(label, ladder[key]?.score)}</span>
              ) : null,
            )}
          </div>
        ) : null}

        {/* Top open lanes — the sidewalk wins. */}
        {lanes.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Target className="h-4 w-4" /> Open lanes you can own
            </div>
            {lanes.map((lane, i) => (
              <div
                key={`${lane.query}-${i}`}
                className="rounded-lg border border-[color:var(--merchant-line)] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{lane.query}</span>
                  {lane.density_band ? (
                    <span
                      className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${densityTone(
                        lane.density_band,
                      )}`}
                    >
                      {lane.density_band} competition
                    </span>
                  ) : null}
                </div>
                {lane.why_fit?.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {lane.why_fit.map((w, j) => (
                      <span
                        key={j}
                        className="rounded border border-[color:var(--merchant-line)] px-1.5 py-0.5 text-[11px] merchant-text-muted"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                ) : null}
                {lane.first_move ? (
                  <p className="mt-1 text-xs">
                    <span className="merchant-text-muted">Move: </span>
                    {lane.first_move}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* Prompt matrix — the receipts. */}
        {matrix.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Search className="h-4 w-4" /> Prompts we tested
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="merchant-text-muted">
                  <tr className="border-b border-[color:var(--merchant-line)]">
                    <th className="py-1.5 pr-2 font-medium">Buyer prompt</th>
                    <th className="px-2 py-1.5 font-medium">Gemini</th>
                    <th className="px-2 py-1.5 font-medium">DeepSeek</th>
                    {hasChatgpt ? (
                      <th className="px-2 py-1.5 font-medium">ChatGPT</th>
                    ) : null}
                    <th className="px-2 py-1.5 font-medium">Who owns it</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, i) => {
                    const cited = row.cited_evidence;
                    const showExcerpt =
                      row.ownership_state !== 'merchant-owned' && !!cited?.excerpt;
                    return (
                      <Fragment key={`${row.query}-${i}`}>
                        <tr className="border-b border-[color:var(--merchant-line)]">
                          <td className="py-1.5 pr-2">
                            {row.query}
                            {row.demand_label ? (
                              <span className="ml-1.5 text-[10px] uppercase tracking-wide merchant-text-muted">
                                · {row.demand_label} demand
                              </span>
                            ) : null}
                          </td>
                          <td className={`px-2 py-1.5 font-medium ${verdictColor(row.gemini)}`}>
                            {row.gemini || '—'}
                          </td>
                          <td className={`px-2 py-1.5 font-medium ${verdictColor(row.deepseek)}`}>
                            {row.deepseek || '—'}
                          </td>
                          {hasChatgpt ? (
                            <td className={`px-2 py-1.5 font-medium ${verdictColor(row.chatgpt)}`}>
                              {row.chatgpt || '—'}
                            </td>
                          ) : null}
                          <td className="px-2 py-1.5 merchant-text-muted">
                            {row.who_owns ||
                              (row.ownership_state === 'merchant-owned'
                                ? 'You'
                                : row.ownership_state || '—')}
                          </td>
                        </tr>
                        {showExcerpt ? (
                          <tr className="border-b border-[color:var(--merchant-line)]">
                            <td
                              colSpan={hasChatgpt ? 5 : 4}
                              className="px-2 pb-2 merchant-text-muted text-xs italic"
                            >
                              AI said: “{cited!.excerpt}”
                              {cited!.cited_hosts && cited!.cited_hosts.length > 0
                                ? ` — pointing buyers to ${cited!.cited_hosts.join(', ')}`
                                : ''}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {data.demand_state_summary ? (
          <p className="merchant-text-muted text-xs">
            Demand read: {data.demand_state_summary}
          </p>
        ) : null}

        {/* What to do next — the per-SKU operational playbook (the prescription,
            not just the diagnosis). Hidden in the honest empty/degraded state
            (is_empty) and when there's no real content, so we never show a
            bordered box with just a header. */}
        {nba &&
        !data.is_empty &&
        (nba.headline ||
          nba.first_move ||
          nba.self_serve?.length ||
          nba.pivota_assisted?.length) ? (
          <div className="space-y-2 rounded-lg border border-[color:var(--merchant-line)] px-4 py-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <ArrowRight className="h-4 w-4" /> What to do next
            </div>
            {nba.headline ? (
              <p className="text-sm font-medium leading-snug">{nba.headline}</p>
            ) : null}
            {nba.first_move ? (
              <p className="text-xs">
                <span className="merchant-text-muted">First move: </span>
                {nba.first_move}
              </p>
            ) : null}
            {nba.self_serve?.length ? (
              <div>
                <p className="text-xs font-medium">You can do this yourself</p>
                <ul className="ml-4 list-disc text-xs merchant-text-muted">
                  {nba.self_serve.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {nba.pivota_assisted?.length ? (
              <p className="text-xs">
                <span className="merchant-text-muted">With Pivota: </span>
                {nba.pivota_assisted[0]}
              </p>
            ) : null}
            {nba.tracking_metrics?.length ? (
              <p className="text-xs merchant-text-muted">
                Track: {nba.tracking_metrics.join(' · ')}
              </p>
            ) : null}
            {nba.cta?.label ? (
              <div className="pt-1">
                <span className="inline-flex items-center gap-1 rounded-md border border-[color:var(--merchant-accent,#6366f1)] px-2.5 py-1 text-xs font-semibold text-[color:var(--merchant-accent,#6366f1)]">
                  {nba.cta.label}
                </span>
                {nba.cta.trust_note ? (
                  <p className="mt-1 text-[11px] merchant-text-muted">{nba.cta.trust_note}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </SurfaceCard>
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Step 1 · first 2 free · no sync"
        title="See how AI sees your products"
        description="Paste your top product links and we'll show how AI shopping agents (Gemini grounded search) find them — no catalog sync required. You pick the products; we audit exactly those. Your first 2 audits are free. Step 2 — the full per-SKU audit — unlocks once you connect your store."
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

              {/* One card per pasted product — its own analysis + action plan. */}
              <div className="space-y-3">
                {perSku.map((r, i) => (
                  <PerSkuReportCard
                    key={r.sku_key || i}
                    report={r}
                    index={i}
                    catalogDimensionsAvailable={catalogAvail}
                    pdpUrl={
                      result.audited_products?.find((p) => p.sku_key === r.sku_key)
                        ?.pdp_url ?? null
                    }
                  />
                ))}
              </div>
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

          {result?.sku_intelligence?.headline ? (
            <SkuIntelligenceCard data={result.sku_intelligence} />
          ) : null}

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

          {/* Funnel: integrate (sync → buyable) + subscribe (recurring).
              Headline tailored to the finding — see buildDeeperCta. */}
          <SurfaceCard
            eyebrow={deeperCta.eyebrow}
            title={deeperCta.title}
            description={deeperCta.description}
          >
            <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row">
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
              {/* Pay-as-you-go: buy credits and run the deeper audit now,
                  without committing to a subscription (ADR-005). */}
              <BuyCreditsCard />
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
