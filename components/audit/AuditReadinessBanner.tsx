'use client';

/**
 * Pre-launch readiness banner for the per-SKU audit page. Reads
 * GET /api/audits/readiness (apiClient.getAuditReadiness) and tells the
 * merchant upfront whether the audit can run — instead of letting them pick
 * SKUs, click Run, and only then hit a 409. Three actionable states:
 *   - no catalog synced  → route to Integrations
 *   - catalog synced, quality backfill still running → "preparing", auto-/manual refresh
 *   - ready → compact confirmation
 *
 * The state is derived from `counts` (the two blocking deps), not the backend's
 * developer-facing `blocking_gaps` strings, so the copy stays merchant-friendly.
 */

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Store,
} from 'lucide-react';
import type { AuditReadiness } from '@/lib/types/ai-readiness';
import { MerchantButton } from '@/components/ui/merchant-primitives';

export function AuditReadinessBanner({
  readiness,
  loading,
  refreshing = false,
  onRefresh,
}: {
  readiness: AuditReadiness | null;
  loading: boolean;
  refreshing?: boolean;
  onRefresh: () => void;
}) {
  // First check in flight — keep it quiet so it doesn't flash a scary state.
  if (loading && !readiness) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[color:var(--merchant-line)] px-4 py-3 text-sm merchant-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking your catalog…
      </div>
    );
  }

  // Fetch failed — don't block the page. The launch POST still guards with a
  // 409, so a transient readiness error shouldn't strand the merchant here.
  if (!readiness) return null;

  if (readiness.ready) {
    const n = readiness.counts.catalog_products;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        <span>
          Catalog ready — {n} product{n === 1 ? '' : 's'} synced and
          quality-checked. You can run the audit.
        </span>
      </div>
    );
  }

  const noCatalog = readiness.counts.catalog_products === 0;
  const backfilling =
    !noCatalog && readiness.counts.product_quality_snapshot === 0;

  const title = noCatalog
    ? 'Connect your store to run the audit'
    : backfilling
      ? 'Preparing your catalog'
      : 'Your catalog isn’t audit-ready yet';

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="font-semibold">{title}</div>
          <p className="text-amber-800">
            {noCatalog ? (
              <>
                The readiness audit scores your own synced products. Connect your
                store and sync your catalog first, then come back to run it.
              </>
            ) : backfilling ? (
              <>
                Your products are synced. We’re running quality checks on them —
                this usually takes a few minutes. The audit unlocks
                automatically once they finish.
              </>
            ) : (
              <>
                A required step hasn’t finished yet. Check again in a moment, or
                re-sync your catalog from Integrations.
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {noCatalog ? (
              <Link href="/dashboard/integrations">
                <MerchantButton>
                  <Store className="mr-2 h-4 w-4" />
                  Go to integrations
                </MerchantButton>
              </Link>
            ) : (
              <MerchantButton
                variant="ghost"
                onClick={onRefresh}
                disabled={refreshing}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                />
                {refreshing ? 'Checking…' : 'Check again'}
              </MerchantButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
