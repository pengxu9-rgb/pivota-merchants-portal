'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, ShoppingBag, Sparkles, Store } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import { apiClient } from '@/lib/api-client';

function normalizeEmail(value: string) {
  return (value || '').trim().toLowerCase();
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useMerchantLanguage();
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
      setEmail(normalizeEmail(queryEmail));
    }

    setFromSignup(signupFlag);
  }, []);

  const panelAction = useMemo(
    () => (
      <div className="text-right">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
          {t('auth.shell.needAccess')}
        </p>
        <Link
          href="/signup"
          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
        >
          <span>{t('auth.shell.startOnboarding')}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    ),
    [t],
  );

  const merchantHighlights = useMemo(
    () =>
      [
        {
          title: t('auth.login.highlightReadyTitle'),
          description: t('auth.login.highlightReadyDescription'),
          icon: Sparkles,
        },
        {
          title: t('auth.login.highlightCatalogTitle'),
          description: t('auth.login.highlightCatalogDescription'),
          icon: Store,
        },
        {
          title: t('auth.login.highlightFlowTitle'),
          description: t('auth.login.highlightFlowDescription'),
          icon: ShoppingBag,
        },
      ] as const,
    [t],
  );

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const normalizedEmail = normalizeEmail(email);
      setEmail(normalizedEmail);
      const response = await apiClient.login(normalizedEmail, password);

      if (response.success === true || response.status === 'success') {
        router.push('/dashboard');
        return;
      }

      setError(response.message || response.detail || t('auth.login.failed'));
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null) {
        const candidate = err as {
          response?: {
            data?: {
              detail?: string | { message?: string };
              error?: {
                message?: string;
              };
            };
          };
          message?: string;
        };

        setError(
          (typeof candidate.response?.data?.detail === 'string'
            ? candidate.response?.data?.detail
            : candidate.response?.data?.detail?.message) ||
            candidate.response?.data?.error?.message ||
            candidate.message ||
            t('auth.login.failed'),
        );
      } else {
        setError(t('auth.login.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
      <AuthShell
      eyebrow={t('auth.shell.controlCenter')}
      title={t('auth.login.pageTitle')}
      description={t('auth.login.pageDescription')}
      highlights={merchantHighlights}
      panelAction={panelAction}
      panelClassName="max-w-md"
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="merchant-overline">{t('auth.login.accessOverline')}</div>
          <h2 className="text-[1.9rem] font-semibold tracking-[-0.045em] text-[color:var(--merchant-ink)]">
            {t('auth.login.accessTitle')}
          </h2>
          <p className="text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
            {t('auth.login.accessDescription')}
          </p>
        </div>

        {fromSignup ? (
          <div className="rounded-[20px] border border-[color:rgba(63,118,95,0.16)] bg-[color:var(--merchant-success-soft)] px-4 py-3 text-sm text-[color:var(--merchant-success)]">
            {t('auth.login.fromSignupSuccess')}
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
              {t('auth.login.emailLabel')}
            </span>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-2xl border border-[color:var(--merchant-line-strong)] bg-white px-4 py-3 text-sm text-[color:var(--merchant-ink)] outline-none ring-0 transition focus:border-[color:var(--merchant-brand)] focus:ring-4 focus:ring-[rgba(51,75,133,0.12)]"
              placeholder={t('auth.login.emailPlaceholder')}
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-[color:var(--merchant-ink)]">{t('auth.login.passwordLabel')}</span>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
              >
                {t('auth.login.forgotPassword')}
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
              placeholder={t('auth.login.passwordPlaceholder')}
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
                <span>{t('auth.login.submitting')}</span>
              </>
            ) : (
              <>
                <span>{t('auth.login.submit')}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="rounded-[20px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-4 py-4">
          <p className="text-sm font-medium text-[color:var(--merchant-ink)]">{t('auth.login.newMerchantTitle')}</p>
          <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
            {t('auth.login.newMerchantDescription')}
          </p>
          <Link
            href="/signup"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
          >
            <span>{t('auth.login.newMerchantAction')}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
