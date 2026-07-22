import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

/** Locked-state stand-in for a paid actions panel (free-tier paywall).
 *
 * Renders the honest inventory of what's behind the lock (count + one
 * teaser headline, never action content) plus an optional upgrade CTA.
 * The CTA is a slot so billing gating (paid tier, App Store off-platform
 * merchants, public share views) stays at the call site — a share view
 * passes no CTA and this degrades to a plain notice.
 */
export function LockedActionsCard({
  title,
  count,
  teaserHeadline,
  upgradeCta,
}: {
  title: string;
  count: number;
  teaserHeadline?: string | null;
  upgradeCta?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        <Lock className="h-3.5 w-3.5" />
        {title}
      </div>
      <p className="mt-2 text-sm text-[color:var(--merchant-ink)]">
        {count > 0
          ? `${count} recommended ${count === 1 ? 'action is' : 'actions are'} ready for this report.`
          : 'Recommended actions are ready for this report.'}
        {teaserHeadline ? (
          <>
            {' '}
            The first one: <span className="font-medium">“{teaserHeadline}”</span>.
          </>
        ) : null}
      </p>
      <p className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
        Upgrade to see the full prioritized plan — what to fix, in what order,
        and how to track it.
      </p>
      {upgradeCta ? <div className="mt-3">{upgradeCta}</div> : null}
    </div>
  );
}
