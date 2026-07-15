'use client';

/**
 * Prominent expander for the report's collapsed diagnostics tier. Unlike the
 * small-text Disclosure, this is a full-width, accent-tinted CARD — merchants
 * must instantly understand there's a deeper layer behind one click (partner
 * feedback: highlight the collapsed tier). Content is hidden, never
 * unmounted, so expanding/collapsing preserves the panels' internal state.
 */

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';

export function DetailDisclosureCard({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** One line telling the merchant exactly what's inside. */
  subtitle?: string;
  /** Short count chip, e.g. "3 products". */
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[color:var(--merchant-accent,#6366f1)]/40 bg-[color:var(--merchant-accent,#6366f1)]/5 px-5 py-4 text-left transition hover:border-[color:var(--merchant-accent,#6366f1)] hover:bg-[color:var(--merchant-accent,#6366f1)]/10"
      >
        <span className="flex items-start gap-3">
          <Layers className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--merchant-accent,#6366f1)]" aria-hidden />
          <span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{title}</span>
              {badge ? (
                <span className="rounded-full border border-[color:var(--merchant-accent,#6366f1)]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--merchant-accent,#6366f1)]">
                  {badge}
                </span>
              ) : null}
            </span>
            {subtitle ? (
              <span className="merchant-text-muted mt-0.5 block text-xs leading-snug">
                {subtitle}
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[color:var(--merchant-accent,#6366f1)]">
          {open ? 'Hide' : 'Expand'}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      <div id={regionId} hidden={!open} className="mt-4 space-y-4">
        {children}
      </div>
    </div>
  );
}
