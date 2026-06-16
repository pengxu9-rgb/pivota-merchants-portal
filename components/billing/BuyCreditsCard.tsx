'use client';

/**
 * Pay-as-you-go credit top-up (ADR-005). The third funnel path after a free
 * AI Visibility sample, alongside "Connect your store" and "Subscribe": buy a
 * credit pack without a subscription and run the deeper audit immediately.
 *
 * Top-ups charge the merchant's verified Stripe card off-session (there is no
 * card-entry UI here) and land in the persistent `purchased_credits` bucket via
 * the Stripe `payment_intent.succeeded` webhook a few seconds later — so the
 * success copy says the wallet updates shortly rather than claiming an
 * immediate balance. A merchant with no card on file gets a 402 and is routed
 * to Billing to add one.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { apiClient, MissingVerifiedPaymentMethodError } from '@/lib/api-client';

// 1 credit = $0.01 (CREDIT_TO_USD on the backend). Packs sized so the labels
// stay obvious: 500 → $5, 1,500 → $15, 5,000 → $50.
const CREDIT_PACKS: Array<{ credits: number; usd: string }> = [
  { credits: 500, usd: '5' },
  { credits: 1500, usd: '15' },
  { credits: 5000, usd: '50' },
];

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; credits: number; usd: string }
  | { kind: 'missing_card'; message: string }
  | { kind: 'error'; message: string };

export function BuyCreditsCard() {
  const [selected, setSelected] = useState<number>(CREDIT_PACKS[0].credits);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const pack = CREDIT_PACKS.find((p) => p.credits === selected) ?? CREDIT_PACKS[0];

  const buy = useCallback(async () => {
    if (phase.kind === 'submitting') return; // guard double-click → double-charge
    setPhase({ kind: 'submitting' });
    // One key per attempt; the in-flight guard above prevents accidental dupes.
    const merchantId =
      typeof window !== 'undefined'
        ? localStorage.getItem('merchant_id') ?? 'anon'
        : 'anon';
    const key = `topup_${merchantId}_${pack.credits}_${Date.now()}`;
    try {
      const res = await apiClient.createCreditTopup(pack.credits, key);
      setPhase({
        kind: 'success',
        credits: res.pack_credits ?? pack.credits,
        usd: res.amount?.total ?? pack.usd,
      });
    } catch (err) {
      if (err instanceof MissingVerifiedPaymentMethodError) {
        setPhase({ kind: 'missing_card', message: err.message });
        return;
      }
      setPhase({
        kind: 'error',
        message:
          err instanceof Error && err.message
            ? err.message
            : 'Could not complete the purchase. Please try again.',
      });
    }
  }, [pack, phase.kind]);

  if (phase.kind === 'success') {
    return (
      <div className="flex flex-1 flex-col justify-center rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          ${phase.usd} charged · {phase.credits.toLocaleString()} credits
        </div>
        <p className="mt-1 text-xs text-emerald-700">
          Added to your card on file. Your wallet balance updates in a few
          seconds — then run the deeper audit.
        </p>
      </div>
    );
  }

  if (phase.kind === 'missing_card') {
    return (
      <div className="flex flex-1 flex-col justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div>
          <div className="text-sm font-semibold text-amber-900">
            Add a payment method first
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Credit top-ups charge a verified card on file. {phase.message}
          </p>
        </div>
        <Link
          href="/dashboard/billing"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-900 hover:underline"
        >
          Go to Billing <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const submitting = phase.kind === 'submitting';

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-[color:var(--merchant-line)] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CreditCard className="h-4 w-4" />
        Buy credits
      </div>
      <p className="merchant-text-muted mt-1 text-xs">
        Pay-as-you-go, no subscription. Credits never expire — use them on any
        audit or provider.
      </p>

      <div className="mt-3 flex gap-2">
        {CREDIT_PACKS.map((p) => {
          const active = p.credits === selected;
          return (
            <button
              key={p.credits}
              type="button"
              onClick={() => setSelected(p.credits)}
              disabled={submitting}
              className={`flex-1 rounded-md border px-2 py-2 text-center transition disabled:opacity-60 ${
                active
                  ? 'border-[color:var(--merchant-accent,#6366f1)] bg-[color:var(--merchant-accent,#6366f1)]/5'
                  : 'border-[color:var(--merchant-line)] hover:border-[color:var(--merchant-accent,#6366f1)]'
              }`}
            >
              <div className="text-sm font-semibold">
                {p.credits.toLocaleString()}
              </div>
              <div className="merchant-text-muted text-[11px]">${p.usd}</div>
            </button>
          );
        })}
      </div>

      {phase.kind === 'error' ? (
        <p className="mt-2 text-xs text-red-600">{phase.message}</p>
      ) : null}

      <button
        type="button"
        onClick={buy}
        disabled={submitting}
        className="merchant-button-primary mt-3 w-full justify-center disabled:opacity-70"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Charging your card…</span>
          </>
        ) : (
          <span>
            Buy {pack.credits.toLocaleString()} credits — ${pack.usd}
          </span>
        )}
      </button>
    </div>
  );
}
