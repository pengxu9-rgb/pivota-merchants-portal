'use client';

/**
 * Wave-3 B1 (decision: FIXED WEEKLY, simple on/off — no cadence picker).
 * Backed by the existing APM endpoints (/apm-config + /configure-apm); the
 * daily cron re-runs the same product set and, when enabled server-side,
 * emails a change digest. Copy is honest about billing: standard credits per
 * run, skipped (not silently drained) when the balance can't cover it.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarClock, Info, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

const WHAT_RUNS_WEEKLY =
  'What runs weekly: the same product URLs from your latest completed ' +
  'audit — so week-over-week scores stay comparable. Run a new audit with ' +
  'different products and the schedule follows that newer set. Each run ' +
  'bills standard credits; on the free plan a run is skipped — and you are ' +
  'emailed, never silently drained — if your balance cannot cover it.';

export function WeeklyReauditSwitch({
  compact = false,
}: {
  /** Top-right one-row variant (verification feedback): label + info mark +
   *  switch; the full explanation lives behind the ⓘ popover. */
  compact?: boolean;
} = {}) {
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

  const switchButton = (
    <button
      type="button"
      role="switch"
      aria-checked={enabled === true}
      onClick={toggle}
      disabled={busy || enabled === null}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        enabled ? 'bg-indigo-500' : 'bg-slate-300'
      }`}
    >
      {busy ? (
        <Loader2 className="mx-auto h-3 w-3 animate-spin text-white" />
      ) : (
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      )}
    </button>
  );

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">Weekly re-audit</span>
          <CompactInfoMark text={WHAT_RUNS_WEEKLY} />
          {switchButton}
        </div>
        {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
          <div>
            <div className="text-sm font-medium">Weekly re-audit</div>
            <p className="merchant-text-muted mt-0.5 max-w-xl text-xs leading-snug">
              Re-runs the same product URLs from your latest completed audit
              every week (run a new audit with different products and the
              schedule follows that newer set) and emails you what changed.
              Each run bills standard credits; on the free plan a run is
              skipped — and you&apos;re emailed, never silently drained — if
              your balance can&apos;t cover it.
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


/** Same pattern as the score strip's info mark: hover tooltip + click
 * popover, Escape/outside-click close. */
function CompactInfoMark({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={popId}
        aria-label="What runs weekly and how it bills"
        title={text}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full opacity-50 transition hover:opacity-100 focus-visible:opacity-100"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <div
        id={popId}
        hidden={!open}
        role="note"
        className="absolute right-0 top-5 z-20 w-72 rounded-md border border-[color:var(--merchant-line)] bg-white px-3 py-2 text-left text-xs leading-relaxed shadow-lg"
      >
        {text}
      </div>
    </span>
  );
}
