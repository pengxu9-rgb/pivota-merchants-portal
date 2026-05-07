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
  Loader2,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  MerchantButton,
  PageHeader,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';
import type {
  AgentCenterBdBrandReport,
  AgentCenterBdPitchDraft,
  AgentCenterBdQueryRow,
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
              {/* #346: BD-curated "this week" task with specifics. */}
              {a.concrete_next_step ? (
                <div className="mt-2 rounded border border-indigo-200 bg-indigo-50/60 p-2 text-xs text-indigo-900">
                  <span className="font-semibold uppercase">
                    Next step:
                  </span>{' '}
                  {a.concrete_next_step}
                </div>
              ) : null}
              {/* Phase A: pre-filled email draft (mailto:) for editorial
                  pitch actions. Falls back to submission URL when host
                  has no published email contact. */}
              {a.pitch_draft ? <DraftPitchButton draft={a.pitch_draft} /> : null}
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
