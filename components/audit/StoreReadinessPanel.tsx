'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  Store,
} from 'lucide-react';

import {
  apiClient,
  type StoreReadinessResponse,
  type StoreReadinessStepStatus,
} from '@/lib/api-client';

const STEP_LABELS: Record<string, string> = {
  storefront_access: 'Open storefront',
  product_search: 'Find product in store search',
  product_detail: 'Open product detail',
  add_to_cart: 'Add product to cart',
  shipping_address: 'Fill synthetic shipping address',
  checkout: 'Reach checkout',
};

const REASON_LABELS: Record<string, string> = {
  storefront_loaded: 'Storefront loaded',
  search_result_found: 'The product appeared in store search',
  search_unavailable: 'No usable store search control was found',
  search_no_result: 'Store search did not return this product',
  pdp_confirmed: 'Product identity and an add-to-cart control were found',
  pdp_unconfirmed: 'The page could not be confirmed as a purchasable product',
  cart_item_added: 'One item was added',
  cart_control_unavailable: 'No usable add-to-cart control was found',
  cart_item_not_observed: 'The product did not appear in the cart after the add-to-cart action',
  required_selection_unresolved: 'A required product or add-on selection blocked the cart',
  checkout_reached: 'A guest checkout page was reached',
  checkout_route_missing: 'No usable checkout route was found',
  address_fields_filled: 'The checkout exposed address fields and accepted synthetic values',
  address_form_unavailable: 'No usable shipping-address form was found',
  challenge: 'The store presented a security challenge',
  login_required: 'The store required a customer login',
  network: 'The storefront could not be reached safely',
  timeout: 'The storefront did not respond before the check timed out',
  not_attempted: 'This step was not reached',
};

function statusLabel(status: StoreReadinessStepStatus) {
  return {
    pending: 'Checking',
    passed: 'Passed',
    failed: 'Needs attention',
    blocked: 'Blocked',
    not_supported: 'Not available',
    not_run: 'Not checked',
  }[status];
}

function StatusIcon({ status }: { status: StoreReadinessStepStatus }) {
  if (status === 'pending') {
    return <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />;
  }
  if (status === 'passed') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  if (status === 'failed' || status === 'blocked') {
    return <AlertCircle className="h-4 w-4 text-amber-600" />;
  }
  return <Circle className="h-4 w-4 text-slate-400" />;
}

function errorMessage(error: unknown): string {
  const value = error as {
    response?: { status?: number; data?: { detail?: { error?: string } } };
  };
  const code = value?.response?.data?.detail?.error;
  if (code === 'DOMAIN_NOT_BOUND') {
    return 'This product link is not on a storefront linked to this merchant account.';
  }
  if (value?.response?.status === 503) {
    return 'Store Readiness is temporarily unavailable. Try again shortly.';
  }
  return 'The store check could not be started. Please try again.';
}

export function StoreReadinessPanel({ initialProductUrl }: { initialProductUrl?: string | null }) {
  const [result, setResult] = useState<StoreReadinessResponse | null>(null);
  const [productUrl, setProductUrl] = useState(String(initialProductUrl || ''));
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiClient.getStoreReadiness();
      setResult(response);
      setError(null);
      return response;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (result?.state !== 'pending') return;
    const timer = window.setInterval(() => {
      void load();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [load, result?.state]);

  const checkedAt = useMemo(() => {
    if (!result?.checked_at) return null;
    const date = new Date(result.checked_at);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
  }, [result?.checked_at]);

  async function run() {
    const url = productUrl.trim();
    if (!url) {
      setError('Paste a product URL, then run the storefront check.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      setResult(await apiClient.runStoreReadiness(url));
    } catch (runError) {
      setError(errorMessage(runError));
    } finally {
      setRunning(false);
    }
  }

  const isPending = result?.state === 'pending';
  const headline =
    result?.overall === 'ready'
      ? 'The tested purchase journey is ready'
      : result?.overall === 'attention' || result?.overall === 'blocked'
        ? 'The tested purchase journey needs attention'
        : isPending
          ? 'Checking the purchase journey'
          : 'Test whether an agent can buy from your store';

  return (
    <section className="rounded-lg border border-[color:var(--merchant-line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-slate-900">Purchase journey check</h2>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-800">{headline}</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            We follow one real product from store search through product detail,
            cart, shipping address, and checkout. The check uses synthetic
            shipping details and stops before payment or order submission.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running || isPending}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running || isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {result?.state === 'complete' || result?.state === 'failed' || result?.state === 'blocked'
            ? 'Run again'
            : 'Run store check'}
        </button>
      </div>

      <div className="mt-5 max-w-3xl">
        <label htmlFor="storefront-readiness-product-url" className="block text-sm font-medium text-slate-800">
          Product URL
        </label>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Use a live product page on a storefront linked to this merchant account. Catalog sync is not required.
        </p>
        <input
          id="storefront-readiness-product-url"
          type="url"
          inputMode="url"
          value={productUrl}
          onChange={(event) => setProductUrl(event.target.value)}
          placeholder="https://your-store.com/products/example"
          disabled={running || isPending}
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the latest check…
        </div>
      ) : result?.steps ? (
        <ol className="mt-5 grid gap-2 md:grid-cols-2">
          {result.steps.map((step, index) => (
            <li
              key={step.step}
              className="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-3"
            >
              <StatusIcon status={step.status} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">
                  {index + 1}. {STEP_LABELS[step.step] || step.step}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {statusLabel(step.status)}
                  {step.reason && REASON_LABELS[step.reason]
                    ? ' · ' + REASON_LABELS[step.reason]
                    : ''}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {checkedAt ? (
        <p className="mt-3 text-xs text-slate-500">Last checked {checkedAt}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-amber-700">{error}</p>
      ) : null}
    </section>
  );
}
