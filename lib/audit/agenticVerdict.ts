import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';

export interface AgenticVerdict {
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'muted';
  meaning: string;
}

/** Legacy discovery diagnostics do not establish consumer recommendation outcomes. */
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
  // Legacy discovery flags do not retain verified complete-answer evidence.
  // Even a positive flag cannot establish a matching-product recommendation.
  return {
    label: 'Recommendation not measured',
    tone: 'muted',
    meaning: 'Diagnostic search flags are available below. They do not establish whether an AI answer recommends this product.',
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
