'use client';

import type { LucideIcon } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import { cx } from '@/lib/cx';

type ProgressStep = {
  id: string;
  title: string;
  icon: LucideIcon;
};

interface OnboardingProgressProps {
  steps: ProgressStep[];
  currentStep: string;
}

export function OnboardingProgress({ steps, currentStep }: OnboardingProgressProps) {
  const currentStepIndex = steps.findIndex((step) => step.id === currentStep);
  const { t } = useMerchantLanguage();

  return (
    <div className="rounded-[26px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-4 py-4">
      <div className={cx('grid gap-3', steps.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-4')}>
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isComplete = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;

          return (
            <div
              key={step.id}
              className={cx(
                'rounded-[20px] border px-3 py-3 transition-colors',
                isCurrent
                  ? 'border-[color:var(--merchant-brand)] bg-white shadow-[var(--merchant-shadow-panel)]'
                  : isComplete
                    ? 'border-[color:rgba(63,118,95,0.18)] bg-[color:var(--merchant-success-soft)]'
                    : 'border-[color:var(--merchant-line)] bg-white/65',
              )}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={cx(
                    'flex h-9 w-9 items-center justify-center rounded-2xl border',
                    isCurrent
                      ? 'border-[color:var(--merchant-brand)] bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]'
                      : isComplete
                        ? 'border-[color:rgba(63,118,95,0.22)] bg-white text-[color:var(--merchant-success)]'
                        : 'border-[color:var(--merchant-line-strong)] bg-white text-[color:var(--merchant-muted)]',
                  )}
                >
                  {isComplete ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Icon className="h-4.5 w-4.5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
                    {t('auth.signup.progress.step', { count: index + 1 })}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-[color:var(--merchant-ink)]">
                    {step.title}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
