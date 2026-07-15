'use client';

/**
 * Verification feedback: '0 free audits left' is a dead end — when the free
 * quota is spent, sell the path forward instead of stating the wall. Paid
 * merchants see nothing (their runs bill plan credits; a free-quota line is
 * noise). Honest: never claims audits are free when they aren't.
 */

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export function AuditQuotaLine({
  remaining,
  isPaid,
}: {
  remaining?: number | null;
  isPaid?: boolean;
}) {
  if (typeof remaining !== 'number' || isPaid) return null;
  if (remaining > 0) {
    return (
      <p className="merchant-text-muted text-xs">
        {remaining} free audit{remaining === 1 ? '' : 's'} left.
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="merchant-text-muted">
        Free audits used — upgrade for more audits and weekly tracking.
      </span>
      <Link
        href="/dashboard/billing"
        className="inline-flex items-center gap-0.5 font-semibold text-[color:var(--merchant-accent,#6366f1)] hover:underline"
      >
        Upgrade <ArrowUpRight className="h-3 w-3" />
      </Link>
    </p>
  );
}
