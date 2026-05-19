"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Mail, Store } from 'lucide-react';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import { APP_CONFIG } from '@/lib/config';
import { cx } from '@/lib/cx';

type Highlight = {
  title: string;
  description: string;
  icon: LucideIcon;
};

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  highlights: readonly Highlight[];
  children: ReactNode;
  panelAction?: ReactNode;
  progress?: ReactNode;
  showSidebar?: boolean;
  className?: string;
  panelClassName?: string;
}

export function AuthShell({
  eyebrow,
  title,
  description,
  highlights,
  children,
  panelAction,
  progress,
  showSidebar = true,
  className,
  panelClassName,
}: AuthShellProps) {
  const { t } = useMerchantLanguage();

  return (
    <div className="min-h-screen bg-[color:var(--merchant-canvas)] text-[color:var(--merchant-ink)]">
      <div
        className={cx(
          showSidebar
            ? 'mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-5 sm:px-6 lg:grid lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-9 lg:px-10 lg:py-8'
            : 'mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-5 sm:px-6 lg:px-8 lg:py-8',
          className,
        )}
      >
        {showSidebar ? (
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--merchant-line-strong)] bg-white/72 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)] shadow-[var(--merchant-shadow-panel)]">
              <Store className="h-3.5 w-3.5 text-[color:var(--merchant-brand)]" />
              {eyebrow}
            </div>

            <h1 className="mt-5 text-[clamp(2.65rem,4.6vw,4.4rem)] font-semibold tracking-[-0.055em] text-[color:var(--merchant-ink)]">
              {title}
            </h1>
            {description.trim() ? (
              <p className="mt-4 max-w-lg text-[15px] leading-7 text-[color:var(--merchant-muted-strong)]">
                {description}
              </p>
            ) : null}

            <div className="mt-8 grid gap-3.5">
              {highlights.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="rounded-[28px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface)] px-5 py-4 shadow-[var(--merchant-shadow-panel)]"
                  >
                    <div className="flex items-start gap-3.5">
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

            <div className="mt-6 rounded-[28px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-5 py-4 shadow-[var(--merchant-shadow-panel)]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--merchant-line-strong)] bg-white/80 text-[color:var(--merchant-brand)]">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                    {t('auth.shell.needHelpTitle')}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                    <a
                      href={`mailto:${APP_CONFIG.SUPPORT_EMAIL}`}
                      className="font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
                    >
                      {t('auth.shell.needHelpDescription', {
                        email: APP_CONFIG.SUPPORT_EMAIL,
                      })}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
        ) : null}

        <section
          className={cx(
            'mx-auto flex w-full flex-col justify-center',
            showSidebar ? 'max-w-2xl' : 'max-w-4xl',
          )}
        >
          <div className={cx('mb-5', showSidebar ? 'lg:hidden' : '')}>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--merchant-line-strong)] bg-white/72 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)] shadow-[var(--merchant-shadow-panel)]">
              <Store className="h-3.5 w-3.5 text-[color:var(--merchant-brand)]" />
              {eyebrow}
            </div>
            <h1
              className={cx(
                'mt-4 font-semibold tracking-[-0.055em] text-[color:var(--merchant-ink)]',
                showSidebar ? 'text-[2.45rem]' : 'text-[2.1rem] sm:text-[2.6rem]',
              )}
            >
              {title}
            </h1>
            {description.trim() ? (
              <p
                className={cx(
                  'mt-3 leading-6 text-[color:var(--merchant-muted-strong)]',
                  showSidebar ? 'text-sm' : 'max-w-2xl text-[15px]',
                )}
              >
                {description}
              </p>
            ) : null}
          </div>

          <div
            className={cx(
              'rounded-[30px] border border-[color:var(--merchant-line-strong)] bg-[color:var(--merchant-surface-strong)] p-6 shadow-[var(--merchant-shadow-soft)] sm:p-7',
              panelClassName,
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <Link href="/login" className="flex items-center gap-3" aria-label="Pivota Merchant Portal">
                <span className="pv-logo pv-logo--gradient pv-logo--lg" aria-hidden="true" />
                <div>
                  <p className="pv-wordmark pv-wordmark--sm">
                    Pivota
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('auth.shell.portalWordmark')}
                  </p>
                </div>
              </Link>
              {panelAction ? <div className="flex items-center gap-2">{panelAction}</div> : null}
            </div>

            {progress ? <div className="mt-6">{progress}</div> : null}
            <div className={progress ? 'mt-6' : 'mt-8'}>{children}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
