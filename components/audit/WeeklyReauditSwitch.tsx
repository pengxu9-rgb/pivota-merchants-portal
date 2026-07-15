'use client';

/**
 * Wave-3 B1 (decision: FIXED WEEKLY, simple on/off — no cadence picker).
 * Backed by the existing APM endpoints (/apm-config + /configure-apm); the
 * daily cron re-runs the same product set and, when enabled server-side,
 * emails a change digest. Copy is honest about billing: standard credits per
 * run, skipped (not silently drained) when the balance can't cover it.
 */

import { useEffect, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export function WeeklyReauditSwitch() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getApmConfig()
      .then((cfg) => {
        if (!cancelled) setEnabled(Boolean(cfg?.enabled && cfg?.cadence_days === 7));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false); // no config yet -> off
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (busy || enabled === null) return;
    const next = !enabled;
    setBusy(true);
    setError(null);
    try {
      await apiClient.configureApm({ enabled: next, cadence_days: 7 });
      setEnabled(next);
    } catch {
      setError("Couldn't update the schedule — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
          <div>
            <div className="text-sm font-medium">Weekly re-audit</div>
            <p className="merchant-text-muted mt-0.5 max-w-xl text-xs leading-snug">
              Re-runs this audit every week on the same products and emails you
              what changed. Each run bills standard credits; runs are skipped
              (never silently drained) if your balance can&apos;t cover one.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled === true}
          onClick={toggle}
          disabled={busy || enabled === null}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
            enabled ? 'bg-indigo-500' : 'bg-slate-300'
          }`}
        >
          {busy ? (
            <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-white" />
          ) : (
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          )}
        </button>
      </div>
      {error ? <p className="mt-1 text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}
