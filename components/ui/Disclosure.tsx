'use client';

/**
 * Shared collapse/expand primitive. Every audit panel used to roll its own
 * useState toggle (PromptEvidencePanel, RecentAuditsPanel, EvidencePlayPanel…)
 * — this is the one to use going forward so summary rows, evidence drawers,
 * and "view full report" sections all behave and read the same.
 */

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cx } from '@/lib/cx';

export function Disclosure({
  label,
  labelOpen,
  children,
  defaultOpen = false,
  className,
  buttonClassName,
}: {
  /** The toggle's text when closed (and when open, unless labelOpen is set). */
  label: ReactNode;
  /** Optional alternate toggle text while open (e.g. "Hide details"). */
  labelOpen?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={regionId}
        className={cx(
          'inline-flex items-center gap-1 text-xs font-medium text-[color:var(--merchant-accent,#6366f1)] transition hover:opacity-80',
          buttonClassName,
        )}
      >
        {open ? labelOpen ?? label : label}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
      {/* hidden, not unmounted: collapsing must never destroy the children's
          internal state (open drawers, in-flight action state) — the panels
          this wraps were always-mounted before the condensed view existed. */}
      <div id={regionId} hidden={!open} className="mt-2">
        {children}
      </div>
    </div>
  );
}
