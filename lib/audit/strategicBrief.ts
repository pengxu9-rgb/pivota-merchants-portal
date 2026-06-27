import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';

type Nba = NonNullable<AgentCenterPerSkuReport['next_best_action']>;

/**
 * The strategic brief is worth showing ONLY when it's the real LLM brief. The
 * deterministic fallback is safe-but-generic (near-identical across SKUs, can't
 * name the site) — so we suppress it and fall back to the operational next-step.
 * Prefer the explicit `brief_source` ('llm'|'deterministic'); fall back to the
 * older brief_debug.outcome, then to the shape tell (the deterministic path
 * emits object-shaped moves, the LLM path emits strings).
 */
export function isRealLlmBrief(nba: Nba | null | undefined): boolean {
  const brief = nba?.strategic_brief;
  if (!brief) return false;
  if (nba?.brief_source) return nba.brief_source === 'llm';
  const outcome = nba?.brief_debug?.outcome;
  if (outcome) return outcome === 'llm';
  const moves = [
    ...(brief.first_moves || []),
    ...(brief.traffic_strategy || []),
    ...(brief.diy_vs_pivota?.self_serve || []),
  ];
  return !moves.some((m) => m != null && typeof m === 'object');
}

/** The real LLM brief if there is one, else null (deterministic is suppressed). */
export function realBrief(nba: Nba | null | undefined) {
  return isRealLlmBrief(nba) ? nba!.strategic_brief! : null;
}
