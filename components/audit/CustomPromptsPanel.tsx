'use client';

/**
 * "Your prompts" — renders the merchant's own test prompts (custom_prompts),
 * probed once brand-level by the per-SKU pipeline. For each: whether AI cited
 * the brand, the sources it grounded in, and which competitors it named.
 *
 * Shared by the AI-readiness audit and the URL audit so the two surfaces match.
 */

import type {
  CustomPromptLane,
  CustomPromptResult,
} from '@/lib/types/ai-readiness';

const CUSTOM_LANE_META: Record<
  CustomPromptLane,
  { label: string; chip: string; blurb: string }
> = {
  open: {
    label: 'Open lane',
    chip: 'border-green-300 bg-green-50 text-green-800',
    blurb: "You're cited with little competition — defend and scale this.",
  },
  contested: {
    label: 'Contested',
    chip: 'border-amber-300 bg-amber-50 text-amber-800',
    blurb: "You're cited, but the lane is crowded with competitors.",
  },
  absent: {
    label: 'Not cited',
    chip: 'border-red-300 bg-red-50 text-red-800',
    blurb: 'The AI answered with sources but never named you — competitors own this lane.',
  },
  no_signal: {
    label: 'No signal',
    chip: 'border-slate-300 bg-slate-50 text-slate-600',
    blurb: "This prompt didn't return grounded results — thin or no demand for it.",
  },
};

export function CustomPromptsPanel({
  prompts,
}: {
  prompts: CustomPromptResult[] | undefined;
}) {
  if (!prompts || prompts.length === 0) return null;
  const citedCount = prompts.filter((p) => p.cited).length;
  return (
    <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
          Your prompts ({prompts.length})
        </div>
        <div className="text-xs opacity-70">
          cited in <strong>{citedCount}</strong> of {prompts.length}
        </div>
      </div>
      <p className="mt-1 text-xs opacity-60">
        The prompts you added — for each, whether AI cited you, the sources it
        grounded in, and which competitors it named.
      </p>
      <div className="mt-3 space-y-2.5">
        {prompts.map((p, i) => {
          const meta = CUSTOM_LANE_META[p.lane] ?? CUSTOM_LANE_META.no_signal;
          return (
            <div
              key={`${p.prompt}-${i}`}
              className="rounded-md border border-[color:var(--merchant-line)] bg-white/40 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium">&ldquo;{p.prompt}&rdquo;</div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}
                >
                  {meta.label}
                </span>
              </div>
              <div className="mt-1 text-xs opacity-60">
                {meta.blurb}
                {p.runs > 0 ? (
                  <>
                    {' '}· cited in {p.runs_cited}/{p.runs} model
                    {p.runs === 1 ? '' : 's'}
                  </>
                ) : null}
              </div>

              {p.cited && (p.cited_sources?.length ?? 0) > 0 ? (
                <div className="mt-2 text-xs">
                  <span className="opacity-60">You were cited via: </span>
                  <span className="font-medium text-green-800">
                    {p.cited_sources?.join(', ')}
                  </span>
                </div>
              ) : null}

              {(p.competitors?.length ?? 0) > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs opacity-60">
                    {p.cited ? 'Also named:' : 'Lane owned by:'}
                  </span>
                  {p.competitors?.map((c) => (
                    <span
                      key={c}
                      className="rounded border border-[color:var(--merchant-line)] bg-white/60 px-1.5 py-0.5 text-[11px]"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : null}

              {!p.cited &&
              (p.competitors?.length ?? 0) === 0 &&
              (p.grounding_sources?.length ?? 0) > 0 ? (
                <div className="mt-1.5 text-xs opacity-60">
                  Grounded in: {p.grounding_sources?.join(', ')}
                </div>
              ) : null}

              {p.evidence_excerpt ? (
                <div className="mt-2 border-l-2 border-[color:var(--merchant-line)] pl-2 text-xs italic opacity-60">
                  {p.evidence_excerpt}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
