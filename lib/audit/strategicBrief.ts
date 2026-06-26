import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';

type Nba = NonNullable<AgentCenterPerSkuReport['next_best_action']>;

/**
 * The strategic brief is worth showing ONLY when it's the real LLM brief. The
 * deterministic fallback is generic boilerplate (near-identical across SKUs,
 * can't name the site) — useless/misleading to a merchant — so we never render
 * it. Primary signal is brief_debug.outcome === 'llm'; when that's absent we use
 * the shape tell (the deterministic path emits object-shaped moves, the LLM path
 * emits strings).
 */
export function isRealLlmBrief(nba: Nba | null | undefined): boolean {
  const brief = nba?.strategic_brief;
  if (!brief) return false;
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
