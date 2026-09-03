'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { apiClient } from '@/lib/api-client';

/**
 * The check a merchant ran on the marketing site before they had an account,
 * now that it belongs to them.
 *
 * WHAT THIS DELIBERATELY DOES NOT SAY. A funnel run holds protocol facts only
 * — it never went near the audit pipeline, so it has no scores, no findings
 * and no report. This panel therefore reports what was OBSERVED and nothing
 * more: no verdict, no score, no "you're losing X". The audit form below is
 * where the real analysis happens, and this must not look like a substitute
 * for it.
 *
 * A signal appears only when the backend reports it, and the backend reports
 * only what it saw — there is no "not detected", because nothing records one
 * and telling a merchant their store lacks a checkout route we never observed
 * would be a claim we cannot make.
 */

type FunnelCheck = {
  audit_run_id: string;
  domain?: string | null;
  checked_at?: string | null;
  claimed_at?: string | null;
  observed_signals: Array<{
    signal: string;
    evidence_level: 'detected' | 'tested' | null;
  }>;
};

// Neutral by construction. The commerce probe writes its evidence row for
// every outcome its status enum allows — including "unavailable" and
// "blocked" — and the deterministic projection strips the payload, so
// presence reaches us without the verdict. A label promising "reachable"
// would print a success for a blocked checkout.
const SIGNAL_LABEL: Record<string, string> = {
  acceptance_signal: 'Agent checkout endpoint advertised',
  commerce_platform: 'Store platform identified',
  commerce_checkout_route: 'Checkout route observed',
  commerce_cartability: 'Cart observed',
};

const EVIDENCE_LABEL: Record<string, string> = {
  tested: 'tested live',
  detected: 'detected',
};

function formatWhen(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function FunnelChecksPanel() {
  const [checks, setChecks] = useState<FunnelCheck[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listClaimedFunnelChecks()
      .then((res) => {
        if (!cancelled) setChecks(res?.checks ?? []);
      })
      // Same contract as RecentAuditsPanel: a failure renders nothing rather
      // than an error. This panel is a nicety above the form the merchant came
      // here to use; it must never be the reason the page looks broken.
      .catch(() => {
        if (!cancelled) setChecks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (checks === null || checks.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <ShieldCheck className="h-4 w-4 text-slate-500" />
        Checks you ran before signing up
      </div>
      <ul className="space-y-3">
        {checks.map((check) => {
          const checkedOn = formatWhen(check.checked_at);
          return (
            <li
              key={check.audit_run_id}
              className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium text-slate-900">
                  {check.domain || 'Your store'}
                </span>
                {checkedOn ? (
                  <span className="text-xs text-slate-500">
                    checked {checkedOn}
                  </span>
                ) : null}
              </div>
              {check.observed_signals.length > 0 ? (
                <dl className="mt-1.5 space-y-1">
                  {check.observed_signals.map((signal) => (
                    <div
                      key={signal.signal}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <dt className="text-slate-700">
                        {SIGNAL_LABEL[signal.signal] ?? signal.signal}
                      </dt>
                      <dd className="shrink-0 text-xs uppercase tracking-wide text-slate-500">
                        {signal.evidence_level
                          ? EVIDENCE_LABEL[signal.evidence_level]
                          : 'observed'}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                // The probe drains on a ~5-minute cadence, so a check claimed
                // moments ago routinely has nothing yet. Saying so beats an
                // empty block that reads like a failure.
                <p className="mt-1 text-sm text-slate-500">
                  We haven&apos;t heard back from this store&apos;s endpoint yet.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        These are protocol checks — what your storefront advertises to an agent.
        Run the audit below to see how AI shopping agents actually answer for
        your products.
      </p>
    </div>
  );
}
