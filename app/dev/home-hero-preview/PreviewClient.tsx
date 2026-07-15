'use client';

import { useEffect, useRef, useState } from 'react';

import { apiClient } from '@/lib/api-client';
import { AiReadinessHomeHero } from '@/components/audit/AiReadinessHomeHero';
import summaryFixture from '@/scripts/fixtures/report-summary.glowlab.json';

// Renders the hero in both states — "has a summary" and the "no audit yet"
// funnel — by overriding the two apiClient methods it self-fetches through.
// Same scoped-override pattern as /dev/ai-readiness-preview, with one twist:
// the overrides are installed in the useState INITIALIZER (child mount-effects
// run before parent effects, so an effect-installed override would lose the
// race) and read the current mode through a ref so the mode buttons work
// without reinstalling anything. Originals restored on unmount.
export function HomeHeroPreviewClient() {
  const modeRef = useRef<'summary' | 'empty'>('summary');
  const [mode, setMode] = useState<'summary' | 'empty'>('summary');
  const [originals] = useState(() => {
    const client = apiClient as unknown as {
      listAuditRuns: unknown;
      getUrlAuditRunDetail: unknown;
    };
    const orig = {
      listAuditRuns: client.listAuditRuns,
      getUrlAuditRunDetail: client.getUrlAuditRunDetail,
    };
    client.listAuditRuns = () =>
      Promise.resolve(
        modeRef.current === 'summary'
          ? [{ run_id: 'audit-1', status: 'succeeded' }]
          : [],
      );
    client.getUrlAuditRunDetail = () =>
      Promise.resolve({ status: 'succeeded', report_summary: summaryFixture });
    return orig;
  });

  useEffect(
    () => () => {
      const client = apiClient as unknown as {
        listAuditRuns: unknown;
        getUrlAuditRunDetail: unknown;
      };
      client.listAuditRuns = originals.listAuditRuns;
      client.getUrlAuditRunDetail = originals.getUrlAuditRunDetail;
    },
    [originals],
  );

  const switchMode = (m: 'summary' | 'empty') => {
    modeRef.current = m; // before setMode: the remounted hero reads this
    setMode(m);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="merchant-page-title">Home hero preview (dev)</h1>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => switchMode('summary')}
          className="rounded-md border border-[color:var(--merchant-line)] px-3 py-1.5 text-sm"
          aria-pressed={mode === 'summary'}
        >
          With latest audit
        </button>
        <button
          type="button"
          onClick={() => switchMode('empty')}
          className="rounded-md border border-[color:var(--merchant-line)] px-3 py-1.5 text-sm"
          aria-pressed={mode === 'empty'}
        >
          No audit yet (funnel)
        </button>
      </div>
      {/* key remounts the hero so its mount-effect refetches per mode. */}
      <AiReadinessHomeHero key={mode} />
    </div>
  );
}
