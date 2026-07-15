'use client';

/**
 * Wave-2 A2: who wins the prompts we probed — brand vs the competitors AI
 * actually named, as horizontal bars. Every number is prompt-level presence
 * from THIS run (one shared denominator, stated below the bars); absent or
 * unavailable contract block → renders nothing.
 */

import type { ReportSummary } from '@/lib/types/ai-readiness';

export function ShareOfVoiceBars({ summary }: { summary: ReportSummary }) {
  const sov = summary.share_of_voice;
  if (!sov?.available || !sov.prompts_probed) return null;
  const brand = sov.brand;
  const rows = [
    ...(brand
      ? [{
          name: brand.name || 'Your brand',
          pct: brand.pct ?? 0,
          count: brand.prompts_cited ?? 0,
          isBrand: true,
        }]
      : []),
    ...(sov.competitors ?? []).map((c) => ({
      name: c.name ?? '',
      pct: c.pct ?? 0,
      count: c.prompts_named ?? 0,
      isBrand: false,
    })),
  ].filter((r) => r.name);
  if (rows.length === 0) return null;

  return (
    <div className="border-t border-[color:var(--merchant-line)] px-5 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        Share of voice — who wins the prompts we tested
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className={`w-40 shrink-0 truncate text-xs ${r.isBrand ? 'font-semibold' : ''}`}
              title={r.name}
            >
              {r.name}
              {r.isBrand ? ' (you)' : ''}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-sm bg-black/5">
              <div
                className={r.isBrand ? 'h-full bg-indigo-500' : 'h-full bg-slate-400'}
                style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs tabular-nums">
              {r.pct}% · {r.count}
            </span>
          </div>
        ))}
      </div>
      <p className="merchant-text-muted mt-1.5 text-[11px]">
        Presence in the {sov.prompts_probed} buyer-intent prompts this audit
        probed — not market share.
      </p>
    </div>
  );
}
