'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowRight,
  Loader2,
  ShoppingBag,
  Sparkles,
  Store,
} from 'lucide-react';
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
      'Review readiness issues and optimize product content so more items are eligible for strong LLM and agent exposure.',
    icon: Store,
  },
  {
    title: 'Smooth product view to transaction',
    description:
      'Keep product view, order generation, and transaction flow clear and reliable from discovery through checkout.',
    icon: ShoppingBag,
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.login(email, password);

      if (response.success === true || response.status === 'success') {
        try {
          if (response.user?.merchant_id) {
            localStorage.setItem('merchant_id', response.user.merchant_id);
          } else if (response.user?.id) {
            localStorage.setItem('merchant_id', response.user.id);
          }
        } catch {
          // no-op
        }

        router.push('/dashboard');
        return;
      }

      setError(response.message || response.detail || 'Login failed');
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.error?.message ||
          err?.message ||
          'Failed to login. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[color:var(--merchant-canvas)] text-[color:var(--merchant-ink)]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:grid lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-10 lg:px-10">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--merchant-line-strong)] bg-white/72 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)] shadow-[var(--merchant-shadow-panel)]">
              <Store className="h-3.5 w-3.5 text-[color:var(--merchant-brand)]" />
              Merchant control center
            </div>

            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              Sign in to the Pivota Merchant Portal
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[color:var(--merchant-muted-strong)]">
              Help your catalog get ready for LLM and agent traffic, improve product exposure, and keep commerce execution smooth.
            </p>

            <div className="mt-10 grid gap-4">
              {merchantHighlights.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="rounded-3xl border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface)] px-5 py-4 shadow-[var(--merchant-shadow-panel)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--merchant-line-strong)] bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-md flex-col justify-center">
          <div className="mb-6 lg:hidden">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--merchant-line-strong)] bg-white/72 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)] shadow-[var(--merchant-shadow-panel)]">
              <Store className="h-3.5 w-3.5 text-[color:var(--merchant-brand)]" />
              Merchant control center
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
              Sign in to the Pivota Merchant Portal
            </h1>
            <p className="mt-3 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
              Get your catalog ready for LLM and agent traffic, improve exposure, and keep the path to transaction smooth.
            </p>
          </div>

          <div className="rounded-[28px] border border-[color:var(--merchant-line-strong)] bg-[color:var(--merchant-surface-strong)] p-7 shadow-[var(--merchant-shadow-soft)] sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--merchant-line-strong)] bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-[0.01em] text-[color:var(--merchant-ink)]">
                  Pivota
                </p>
                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                  Merchant Portal
                </p>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[color:var(--merchant-ink)]">
                Sign in
              </h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                Use your merchant account to review readiness, improve LLM and agent exposure, and keep order flow moving cleanly.
              </p>
            </div>

            {error ? (
              <div className="mt-6 rounded-2xl border border-[color:var(--merchant-critical)] bg-[color:var(--merchant-critical-soft)] px-4 py-3 text-sm text-[color:var(--merchant-critical)]">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleLogin} className="mt-6 space-y-5">
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
                  <span className="text-sm font-medium text-[color:var(--merchant-ink)]">
                    Password
                  </span>
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

            <div className="mt-6 rounded-2xl border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-4 py-4">
              <p className="text-sm font-medium text-[color:var(--merchant-ink)]">Need access?</p>
              <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                Create a merchant account to prepare your catalog for agent-driven demand and build a smoother path from product discovery to checkout.
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
        </section>
      </div>
    </div>
  );
}
