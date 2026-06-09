'use client';

/**
 * Merchant self-serve billing page.
 *
 * Shows current plan + usage, an upgrade CTA (Stripe-hosted Checkout), and
 * statement history. Talks to the backend `/api/billing/me/*` routes via the
 * JWT the api-client interceptor already attaches — no merchant API key ever
 * reaches the browser.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type {
  BillingCurrentPeriod,
  BillingPlan,
  BillingStatement,
} from '@/lib/types/billing';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import {
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';

const ACTIVATION_POLL_MS = 3000;
const ACTIVATION_MAX_ATTEMPTS = 10; // ~30s
// Remembers the plan tier at checkout time so the post-return poll can detect
// the change (rather than stopping on the merchant's *old* tier on an upgrade).
const PREV_TIER_KEY = 'billing_prev_tier';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalize an API error to a display string. Backend `detail` can be a string,
 * an object, or an array — rendering a non-string directly would crash React.
 */
function errToMessage(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
    return detail.message;
  }
  return fallback;
}

function formatUsdCents(cents: number): string {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

// Plan/tier names come from the backend lowercased ('starter'); capitalize for display.
function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * Format an ISO calendar month without timezone drift. `new Date("YYYY-MM-DD")`
 * is parsed as UTC midnight, which can render the *previous* month in negative
 * offsets — so we parse the parts and format in UTC explicitly.
 */
function formatMonth(iso: string | null): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export default function BillingPage() {
  const { t } = useMerchantLanguage();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<BillingCurrentPeriod | null>(null);
  const [statements, setStatements] = useState<BillingStatement[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);

  const [activating, setActivating] = useState(false);
  const [activationTimedOut, setActivationTimedOut] = useState(false);
  const [upgradingPriceId, setUpgradingPriceId] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);

  // Set on unmount so in-flight polls stop touching state after navigation.
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const token = localStorage.getItem('merchant_token');
    if (!token) {
      router.push('/login');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');

    if (status === 'success') {
      // Returned from Stripe Checkout. Render the page + banner immediately
      // (don't sit on the spinner) and poll until the plan actually changes.
      const prevTier = sessionStorage.getItem(PREV_TIER_KEY) || '';
      sessionStorage.removeItem(PREV_TIER_KEY);
      setActivating(true);
      setLoading(false);
      router.replace('/dashboard/billing');
      void loadPlans();
      void pollActivation(prevTier);
    } else {
      if (status === 'cancelled') {
        sessionStorage.removeItem(PREV_TIER_KEY);
        setCheckoutNotice(t('dashboard.billing.upgrade.cancelled'));
        router.replace('/dashboard/billing');
      }
      void loadBilling();
    }

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStatements = async () => {
    // Statements are secondary — a failure here must not block plan/usage/upgrade.
    try {
      const statementsRes = await apiClient.getBillingStatements(12);
      if (cancelledRef.current) return;
      setStatements(statementsRes.statements || []);
    } catch {
      /* leave statements empty; page stays usable */
    }
  };

  const loadPlans = async () => {
    // Plan catalogue is secondary — a failure shows the soft "no plans" copy.
    try {
      const plansRes = await apiClient.getBillingPlans();
      if (cancelledRef.current) return;
      setPlans(plansRes.plans || []);
    } catch {
      /* leave plans empty; upgrade section shows the soft message */
    }
  };

  const loadBilling = async () => {
    setLoading(true);
    setError(null);
    try {
      const periodRes = await apiClient.getBillingCurrentPeriod();
      if (cancelledRef.current) return;
      setPeriod(periodRes);
    } catch (err: any) {
      if (cancelledRef.current) return;
      console.error('Failed to load billing details:', err);
      setError(errToMessage(err, t('dashboard.billing.errors.load')));
      setLoading(false);
      return;
    }
    setLoading(false);
    await Promise.allSettled([loadStatements(), loadPlans()]);
  };

  const pollActivation = async (prevTier: string) => {
    setActivationTimedOut(false);
    for (let attempt = 0; attempt < ACTIVATION_MAX_ATTEMPTS; attempt++) {
      try {
        const periodRes = await apiClient.getBillingCurrentPeriod();
        if (cancelledRef.current) return;
        setPeriod(periodRes);
        // Converged when the plan changes from what it was at checkout time.
        // (prevTier === '' for a first subscription, so any plan converges.)
        if (periodRes.tier && periodRes.tier !== prevTier) {
          setActivating(false);
          await loadStatements();
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      if (attempt < ACTIVATION_MAX_ATTEMPTS - 1) {
        await sleep(ACTIVATION_POLL_MS);
        if (cancelledRef.current) return;
      }
    }
    // Webhook hasn't landed yet. Soft message, NOT a hard error.
    if (cancelledRef.current) return; // unmounted during the final attempt
    setActivating(false);
    setActivationTimedOut(true);
    await loadStatements();
  };

  const handleUpgrade = async (plan: BillingPlan) => {
    setUpgradingPriceId(plan.price_id);
    setCheckoutNotice(null);
    try {
      // Remember the current tier so the success-return poll can detect the change.
      sessionStorage.setItem(PREV_TIER_KEY, period?.tier || '');
      const origin = window.location.origin;
      const session = await apiClient.createBillingCheckoutSession({
        price_id: plan.price_id,
        success_url: `${origin}/dashboard/billing?status=success`,
        cancel_url: `${origin}/dashboard/billing?status=cancelled`,
      });
      window.location.href = session.session_url;
    } catch (err: any) {
      console.error('Failed to start checkout session:', err);
      sessionStorage.removeItem(PREV_TIER_KEY);
      setUpgradingPriceId(null);
      setCheckoutNotice(errToMessage(err, t('dashboard.billing.upgrade.error')));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="merchant-panel px-8 py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-success)]"></div>
        </div>
      </div>
    );
  }

  const hasPlan = Boolean(period?.tier);
  const allowance = period?.allowance_credits ?? 0;
  const consumed = period?.consumed_credits ?? 0;
  const usagePct = allowance > 0 ? Math.min(100, Math.round((consumed / allowance) * 100)) : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('dashboard.billing.eyebrow')}
        title={t('dashboard.billing.title')}
        description={t('dashboard.billing.description')}
      />

      {activating && (
        <div className="merchant-panel merchant-panel-muted flex items-start gap-3 px-5 py-4">
          <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-[color:var(--merchant-brand)]" />
          <div>
            <div className="font-medium text-[color:var(--merchant-ink)]">
              {t('dashboard.billing.activating.title')}
            </div>
            <div className="text-sm text-[color:var(--merchant-muted-strong)]">
              {t('dashboard.billing.activating.body')}
            </div>
          </div>
        </div>
      )}

      {activationTimedOut && (
        <div className="merchant-panel merchant-panel-muted px-5 py-4 text-sm text-[color:var(--merchant-muted-strong)]">
          {t('dashboard.billing.activating.timeout')}
        </div>
      )}

      {checkoutNotice && (
        <div className="merchant-panel px-5 py-4 text-[color:var(--merchant-critical)]">
          {checkoutNotice}
        </div>
      )}

      {error && (
        <div className="merchant-panel px-5 py-4 text-[color:var(--merchant-critical)]">
          {error}
        </div>
      )}

      {/* Current plan + usage */}
      <SurfaceCard
        eyebrow={t('dashboard.billing.plan.eyebrow')}
        title={hasPlan ? titleCase(period?.tier as string) : t('dashboard.billing.plan.none')}
        description={
          hasPlan
            ? t('dashboard.billing.usage.daysRemaining', { days: period?.days_remaining ?? 0 })
            : t('dashboard.billing.plan.noneBody')
        }
        action={
          hasPlan ? (
            <StatusBadge tone={period?.in_overage ? 'warning' : 'success'}>
              {period?.in_overage
                ? t('dashboard.billing.usage.overageBadge')
                : t('dashboard.billing.usage.activeBadge')}
            </StatusBadge>
          ) : null
        }
      >
        {hasPlan ? (
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-[color:var(--merchant-muted-strong)]">
                {t('dashboard.billing.usage.creditsUsed', {
                  used: consumed.toLocaleString(),
                  allowance: allowance.toLocaleString(),
                })}
              </span>
              <span className="font-semibold text-[color:var(--merchant-ink)]">{usagePct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--merchant-surface-muted)]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${usagePct}%`,
                  backgroundColor: period?.in_overage
                    ? 'var(--merchant-warning)'
                    : 'var(--merchant-success)',
                }}
              />
            </div>
            {period?.in_overage && (
              <div className="flex items-start gap-3 rounded-[1rem] bg-[color:var(--merchant-surface-muted)] px-4 py-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-[color:var(--merchant-warning)]" />
                <p className="text-sm text-[color:var(--merchant-muted-strong)]">
                  {t('dashboard.billing.usage.overageBanner', {
                    count: (period?.overage_count ?? 0).toLocaleString(),
                    amount: formatUsdCents(period?.overage_total_usd_cents ?? 0),
                  })}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 py-6 text-sm text-[color:var(--merchant-muted)]">
            {t('dashboard.billing.plan.noneHint')}
          </div>
        )}
      </SurfaceCard>

      {/* Upgrade / plans */}
      <SurfaceCard
        eyebrow={t('dashboard.billing.upgrade.eyebrow')}
        title={t('dashboard.billing.upgrade.title')}
        description={t('dashboard.billing.upgrade.description')}
      >
        {plans.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[color:var(--merchant-muted)]">
            {t('dashboard.billing.upgrade.none')}
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = hasPlan && period?.tier === plan.name;
              const isStarting = upgradingPriceId === plan.price_id;
              return (
                <div
                  key={plan.key}
                  className="flex flex-col gap-3 rounded-[1.1rem] border border-[color:var(--merchant-line)] p-4"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-[color:var(--merchant-ink)]">
                      {titleCase(plan.name)}
                    </div>
                    <div className="text-lg font-semibold text-[color:var(--merchant-ink)]">
                      {`$${Math.round(plan.price_cents / 100)} / mo`}
                    </div>
                    <div className="text-sm text-[color:var(--merchant-muted-strong)]">
                      {t('dashboard.billing.upgrade.creditsPerMonth', {
                        credits: plan.monthly_credit_allowance.toLocaleString(),
                      })}
                    </div>
                  </div>
                  <div className="mt-auto">
                    {isCurrent ? (
                      <StatusBadge tone="success">
                        {t('dashboard.billing.upgrade.current')}
                      </StatusBadge>
                    ) : (
                      <MerchantButton
                        type="button"
                        onClick={() => handleUpgrade(plan)}
                        disabled={Boolean(upgradingPriceId)}
                      >
                        {isStarting
                          ? t('dashboard.billing.upgrade.starting')
                          : t('dashboard.billing.upgrade.cta')}
                      </MerchantButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SurfaceCard>

      {/* Statement history */}
      <SurfaceCard
        eyebrow={t('dashboard.billing.statements.eyebrow')}
        title={t('dashboard.billing.statements.title')}
      >
        <table className="merchant-table">
          <thead>
            <tr>
              <th>{t('dashboard.billing.statements.month')}</th>
              <th>{t('dashboard.billing.statements.plan')}</th>
              <th>{t('dashboard.billing.statements.subscription')}</th>
              <th>{t('dashboard.billing.statements.overage')}</th>
              <th>{t('dashboard.billing.statements.status')}</th>
            </tr>
          </thead>
          <tbody>
            {statements.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-[color:var(--merchant-muted)]">
                  {t('dashboard.billing.statements.empty')}
                </td>
              </tr>
            ) : (
              statements.map((statement) => (
                <tr key={statement.calendar_month}>
                  <td className="font-medium text-[color:var(--merchant-ink)]">
                    {formatMonth(statement.calendar_month)}
                  </td>
                  <td className="text-[color:var(--merchant-muted-strong)]">
                    {statement.tier_name ? titleCase(statement.tier_name) : '—'}
                  </td>
                  <td className="text-[color:var(--merchant-muted-strong)]">
                    {formatUsdCents(statement.subscription_revenue_usd_cents)}
                  </td>
                  <td className="text-[color:var(--merchant-muted-strong)]">
                    {statement.overage_credits > 0
                      ? `${statement.overage_credits.toLocaleString()} cr · ${formatUsdCents(
                          statement.overage_revenue_usd_cents,
                        )}`
                      : '—'}
                  </td>
                  <td>
                    <StatusBadge tone={statement.status === 'invoiced' ? 'success' : 'neutral'}>
                      {statement.status === 'invoiced'
                        ? t('dashboard.billing.statements.statusInvoiced')
                        : t('dashboard.billing.statements.statusFrozen')}
                    </StatusBadge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SurfaceCard>
    </div>
  );
}
