import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { OnboardingData } from '@/lib/onboarding';

interface CompletionStepProps {
  data: OnboardingData;
  loginEmail?: string;
  password?: string;
  onClearSession: () => void;
}

type CompletionState = 'authenticating' | 'ready' | 'manual';

function buildLoginHref(email?: string) {
  if (!email) return '/login?from=signup';
  return `/login?from=signup&email=${encodeURIComponent(email)}`;
}

export default function CompletionStep({
  data,
  loginEmail,
  password,
  onClearSession,
}: CompletionStepProps) {
  const router = useRouter();
  const attemptedAutoLogin = useRef(false);
  const [state, setState] = useState<CompletionState>(
    loginEmail && password ? 'authenticating' : 'manual',
  );
  const [error, setError] = useState('');

  const loginHref = useMemo(() => buildLoginHref(loginEmail), [loginEmail]);

  useEffect(() => {
    if (attemptedAutoLogin.current) return;
    attemptedAutoLogin.current = true;

    if (!loginEmail || !password) {
      setState('manual');
      return;
    }

    let cancelled = false;

    async function runAutoLogin() {
      setState('authenticating');
      setError('');

      try {
        const resolvedEmail = loginEmail;
        const resolvedPassword = password;

        if (!resolvedEmail || !resolvedPassword) {
          setState('manual');
          return;
        }

        const response = await apiClient.login(resolvedEmail, resolvedPassword);
        const success = response.success === true || response.status === 'success';

        if (!success) {
          throw new Error(response.message || response.detail || 'Unable to sign in automatically.');
        }

        if (cancelled) return;
        onClearSession();
        router.push('/dashboard');
      } catch (err) {
        if (cancelled) return;

        const message =
          err instanceof Error ? err.message : 'Unable to sign in automatically right now.';

        setError(message);
        setState('manual');
      }
    }

    void runAutoLogin();

    return () => {
      cancelled = true;
    };
  }, [loginEmail, onClearSession, password, router]);

  const handleContinueToLogin = () => {
    onClearSession();
    router.push(loginHref);
  };

  if (state === 'authenticating') {
    return (
      <div className="space-y-6 py-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[color:var(--merchant-line-strong)] bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]">
          <Loader2 className="h-9 w-9 animate-spin" />
        </div>
        <div className="space-y-2">
          <div className="merchant-overline">Step 4 · Portal access</div>
          <h2 className="text-[2rem] font-semibold tracking-[-0.045em] text-[color:var(--merchant-ink)]">
            Finalizing your merchant portal access
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
            Your merchant record is ready. Pivota is signing you into the merchant portal now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[color:rgba(63,118,95,0.16)] bg-[color:var(--merchant-success-soft)] text-[color:var(--merchant-success)]">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <div className="merchant-overline">Step 4 · Account ready</div>
        <h2 className="text-[2rem] font-semibold tracking-[-0.045em] text-[color:var(--merchant-ink)]">
          Your merchant account is ready
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
          {data.business_name ? `Welcome, ${data.business_name}. ` : ''}
          Your merchant onboarding record and portal access are now tied to the same merchant ID.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[24px] border border-[color:var(--merchant-line)] bg-white/78 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                Merchant ID
              </p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--merchant-ink)]">
                <span className="font-mono">{data.merchant_id || 'Pending'}</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                Status
              </p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--merchant-ink)]">
                {data.auto_approved ? 'Auto-approved' : 'Pending review'}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[20px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-4 py-4">
            <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
              Next step in the portal
            </p>
            <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
              Finish merchant setup inside the dashboard, connect store integrations, and verify the live payment path.
            </p>
          </div>

          {error ? (
            <div className="mt-4 rounded-[20px] border border-[color:var(--merchant-critical)] bg-[color:var(--merchant-critical-soft)] px-4 py-3 text-sm text-[color:var(--merchant-critical)]">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4.5 w-4.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleContinueToLogin}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[color:var(--merchant-brand)] px-4 py-3 text-sm font-medium text-white shadow-[0_14px_30px_rgba(51,75,133,0.18)] transition hover:bg-[color:var(--merchant-brand-strong)]"
            >
              <span>Continue to login</span>
              <ArrowRight className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--merchant-line-strong)] bg-white/80 text-[color:var(--merchant-brand)]">
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                  Merchant record stays matched
                </p>
                <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                  The same merchant ID is used for onboarding, portal access, and later merchant configuration.
                </p>
              </div>
            </div>
          </div>

          {data.auto_approved ? (
            <div className="rounded-[24px] border border-[color:rgba(157,106,42,0.18)] bg-[color:var(--merchant-warning-soft)] p-4">
              <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                Pre-approved account
              </p>
              <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                You can continue immediately. Complete any remaining KYB follow-up inside the portal after sign-in.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
