import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';

export interface AgenticVerdict {
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'muted';
  meaning: string;
}

/**
 * The honest per-product agentic status, derived from the recommended-vs-listing
 * split (NOT the catalog-dominated dimension band, which reads "blocked" for a
 * store-less brand even when AI finds it). Keeps the four states the merchant
 * cares about distinct: recommended, findable-only, invisible, unmeasured.
 */
export function agenticVerdict(report: AgentCenterPerSkuReport): AgenticVerdict | null {
  const pc = report.product_competitiveness;
  if (!pc) return null;

  if (pc.grounding_unavailable) {
    return {
      label: "Couldn't measure",
      tone: 'muted',
      meaning: "AI didn't cite sources this run — re-run to measure.",
    };
  }
  if (!pc.has_discovery) {
    return {
      label: 'Needs a category',
      tone: 'muted',
      meaning: 'Add a product type so we can probe discovery demand.',
    };
  }

  // `discovery` is typed required but can be absent on older/sparse payloads
  // even when has_discovery is set — treat that as unmeasured, never throw.
  const d = pc.discovery;
  if (!d) {
    return {
      label: "Couldn't measure",
      tone: 'muted',
      meaning: 'This run carried no discovery measurements — re-run to measure.',
    };
  }
  const recommended = d.appeared_recommended ?? 0;
  const listing = d.appeared_listing ?? d.appeared ?? 0;

  if (recommended > 0) {
    return {
      label: 'Recommended',
      tone: 'good',
      meaning: `AI recommends you in ${recommended} of ${d.total} discovery searches.`,
    };
  }
  if (listing > 0) {
    return {
      label: 'Findable, not recommended',
      tone: 'warn',
      meaning: 'AI can retrieve your listing, but no independent source endorses you yet.',
    };
  }
  return {
    label: 'Not yet visible',
    tone: 'bad',
    meaning: "AI doesn't surface you for the category demand you could win.",
  };
}

export function verdictPillClasses(tone: AgenticVerdict['tone']): string {
  switch (tone) {
    case 'good':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'warn':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'bad':
      return 'border-red-200 bg-red-50 text-red-700';
    default:
      return 'border-[color:var(--merchant-line)] text-slate-500';
  }
}
