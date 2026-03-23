'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, ShoppingBag, Sparkles, Store } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { apiClient } from '@/lib/api-client';

const merchantHighlights = [
  {
    title: 'Ready for LLM and agent traffic',
    description:
      'Prepare your catalog and storefront experience for product discovery and buyer traffic coming from LLMs and agents.',
    icon: Sparkles,
  },
  {
    title: 'Catalog readiness and exposure',
    description:
      'Review readiness issues and optimize product content so more items are eligible for stronger LLM and agent exposure.',
    icon: Store,
  },
  {
    title: 'Smooth product view to transaction',
    description:
      'Keep product discovery, order generation, and transaction flow reliable from discovery through checkout.',
    icon: ShoppingBag,
  },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fromSignup, setFromSignup] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const queryEmail = params.get('email');
    const signupFlag = params.get('from') === 'signup';

    if (queryEmail) {
      setEmail(queryEmail);
    }

    setFromSignup(signupFlag);
  }, []);

  const panelAction = useMemo(
    () => (
      <div className="text-right">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
          Need access?
        </p>
        <Link
          href="/signup"
          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
        >
          <span>Start onboarding</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    ),
    [],
  );

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.login(email, password);

      if (response.success === true || response.status === 'success') {
        router.push('/dashboard');
        return;
      }

      setError(response.message || response.detail || 'Login failed');
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null) {
        const candidate = err as {
          response?: {
            data?: {
              detail?: string;
              error?: {
                message?: string;
              };
            };
          };
          message?: string;
        };

        setError(
          candidate.response?.data?.detail ||
            candidate.response?.data?.error?.message ||
            candidate.message ||
            'Failed to login. Please try again.',
        );
      } else {
        setError('Failed to login. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Merchant control center"
      title="Sign in to the Pivota Merchant Portal"
      description="Use your merchant account to review readiness, improve LLM and agent exposure, and keep the path from discovery to merchant-native execution moving cleanly."
      highlights={merchantHighlights}
      panelAction={panelAction}
      panelClassName="max-w-md"
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="merchant-overline">Merchant access</div>
          <h2 className="text-[1.9rem] font-semibold tracking-[-0.045em] text-[color:var(--merchant-ink)]">
            Sign in
          </h2>
          <p className="text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
            Use the same merchant account created during onboarding to access your portal.
          </p>
        </div>

        {fromSignup ? (
          <div className="rounded-[20px] border border-[color:rgba(63,118,95,0.16)] bg-[color:var(--merchant-success-soft)] px-4 py-3 text-sm text-[color:var(--merchant-success)]">
            Your merchant account is ready. Sign in to continue into the dashboard.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[20px] border border-[color:var(--merchant-critical)] bg-[color:var(--merchant-critical-soft)] px-4 py-3 text-sm text-[color:var(--merchant-critical)]">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleLogin} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
              Email
            </span>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-2xl border border-[color:var(--merchant-line-strong)] bg-white px-4 py-3 text-sm text-[color:var(--merchant-ink)] outline-none ring-0 transition focus:border-[color:var(--merchant-brand)] focus:ring-4 focus:ring-[rgba(51,75,133,0.12)]"
              placeholder="merchant@brand.com"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-[color:var(--merchant-ink)]">Password</span>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-2xl border border-[color:var(--merchant-line-strong)] bg-white px-4 py-3 text-sm text-[color:var(--merchant-ink)] outline-none ring-0 transition focus:border-[color:var(--merchant-brand)] focus:ring-4 focus:ring-[rgba(51,75,133,0.12)]"
              placeholder="Enter your password"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--merchant-brand)] px-4 py-3 text-sm font-medium text-white shadow-[0_14px_30px_rgba(51,75,133,0.18)] transition hover:bg-[color:var(--merchant-brand-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="rounded-[20px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-4 py-4">
          <p className="text-sm font-medium text-[color:var(--merchant-ink)]">New merchant?</p>
          <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
            Start the portal-native onboarding flow to create your merchant account and connect payment setup, KYB, and dashboard access.
          </p>
          <Link
            href="/signup"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
          >
            <span>Start merchant onboarding</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
