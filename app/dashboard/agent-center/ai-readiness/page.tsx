'use client';

/**
 * Merchant self-service AI Commerce Readiness Audit (multi-SKU).
 *
 * Pick 1–5 of your own SKUs from the catalog → click Run → wait
 * ~60–90 sec for grounded Gemini probes → see brand-level aggregate
 * + per-product cards.
 *
 * Cost guard (backend-enforced): 2 audits per merchant per 24h.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  MerchantButton,
  PageHeader,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';
import type {
  AgentCenterBdBrandReport,
  AgentCenterBdReport,
  AgentCenterBdVerdictLabel,
  AiReadinessAuditResponse,
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

const MAX_SELECTED = 5;

export default function AiReadinessAuditPage() {
  const [products, setProducts] = useState<CatalogProductRow[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // key = "platform:source_id"

  const [running, setRunning] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AiReadinessAuditResponse | null>(null);

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

  const fillTopByPrice = () => {
    const top = sortedByPrice.slice(0, MAX_SELECTED).map(productKey);
    setSelected(new Set(top));
  };
  const fillFirstFive = () => {
    const top = usableProducts.slice(0, MAX_SELECTED).map(productKey);
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

  const runAudit = async () => {
    if (selectedRefs.length < 1 || selectedRefs.length > 5) return;
    setRunning(true);
    setAuditError(null);
    setAuditResult(null);
    try {
      const res = await apiClient.runAiReadinessAudit(selectedRefs);
      setAuditResult(res);
    } catch (err) {
      // Try to surface backend-supplied detail (429 / 422 / 404 messages).
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
          `You've used today's audit budget (${d?.limit || 2}/24h). Resets in ~${hrs}h.`,
        );
      } else if (status === 422 && typeof detail === 'object' && detail) {
        // Generic 422 — backend returned a validation error (e.g.
        // empty product list, > 5 products). The Pivota canonical
        // fallback means individual URL-less products no longer
        // 422; we shouldn't see this in practice for typical input.
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
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Beta"
        title="AI Commerce Readiness Audit"
        description="Audit up to 5 of your SKUs against AI shopping agents (Gemini grounded search). Same engine our BD team uses; gives you discovery + attribution + competitive pressure data per product."
      />

      <SurfaceCard
        title="1. Pick 1–5 SKUs to audit"
        description={`${selected.size} of ${MAX_SELECTED} selected · audit cost ≈ ${selected.size * 9} grounded probes ≈ ${Math.max(15, selected.size * 18)} sec`}
        action={
          <div className="flex flex-wrap gap-2">
            <MerchantButton variant="ghost" onClick={fillTopByPrice} disabled={running}>
              Top {MAX_SELECTED} by price
            </MerchantButton>
            <MerchantButton variant="ghost" onClick={fillFirstFive} disabled={running}>
              First {MAX_SELECTED}
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

      <div className="flex items-center justify-between rounded border border-indigo-200 bg-indigo-50/50 px-4 py-3">
        <div className="text-sm text-slate-700">
          Limit: <strong>2 audits per 24h</strong>. Each audit runs
          ~{selected.size || 0} × 9 = {(selected.size || 0) * 9} grounded
          Gemini probes (typically 60–90 sec).
        </div>
        <MerchantButton
          onClick={runAudit}
          disabled={
            running || selected.size < 1 || selected.size > MAX_SELECTED
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

      {auditError ? (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-900">{auditError}</p>
          </div>
        </div>
      ) : null}

      {auditResult ? (
        <AuditReportRenderer
          report={auditResult.brand_report}
          remaining={auditResult.rate_limit_remaining}
          pivotaCanonicalKeys={auditResult.audited_via_pivota_canonical}
        />
      ) : null}
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
      <CrossProductCompetitors report={report} />
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
  return (
    <SurfaceCard
      title="Per-product summary"
      description="Drill-down for each audited SKU. Click to expand."
    >
      <div className="divide-y">
        {list.map((p, i) => (
          <PerProductCard key={i} report={p} />
        ))}
      </div>
    </SurfaceCard>
  );
}

function PerProductCard({ report }: { report: AgentCenterBdReport }) {
  const [open, setOpen] = useState(false);
  const v = report.verdict;
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
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">
              Verdict explanation
            </div>
            <p className="mt-1 text-sm text-slate-700">{v.explanation}</p>
          </div>
          {report.competitive_pressure?.framing ? (
            <div className="rounded bg-amber-50 p-3 text-xs text-amber-900">
              <div className="font-semibold uppercase">Competitive pressure</div>
              <p className="mt-1">{report.competitive_pressure.framing}</p>
            </div>
          ) : null}
          {report.action_items?.length ? (
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">
                Recommended actions
              </div>
              <ul className="mt-1 space-y-1 text-xs text-slate-700">
                {report.action_items.map((a, i) => (
                  <li key={i}>
                    <span className="font-semibold">[{a.severity}]</span> {a.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.what_pivota_changes?.discovery_lift?.layers?.length ? (
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">
                What lifts your visibility (multi-layer)
              </div>
              <ul className="mt-1 space-y-2 text-xs text-slate-700">
                {report.what_pivota_changes.discovery_lift.layers.map((l, i) => (
                  <li key={i}>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-3 w-3 text-indigo-600" />
                      <span className="font-semibold">{l.name}</span>
                    </div>
                    <p className="ml-5 text-slate-600">{l.pivota_status}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.what_pivota_changes?.checkout_loop?.outcome ? (
            <div className="rounded bg-green-50 p-3 text-xs text-green-900">
              <div className="flex items-center gap-2 font-semibold uppercase">
                <CheckCircle2 className="h-3 w-3" />
                Checkout loop
              </div>
              <p className="mt-1">
                {report.what_pivota_changes.checkout_loop.outcome}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
