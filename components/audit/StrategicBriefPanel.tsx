'use client';

/**
 * Per-product "what's really going on + what to do" — the consultant-grade
 * brief the backend already computes (next_best_action.strategic_brief) but the
 * UI used to drop, leaving only a shallow headline and a dead-end "Pivota
 * handles this". This renders the ROOT CAUSE (why you lose), the decision, the
 * concrete first moves you can execute yourself, and an honest you-vs-Pivota
 * split (no "Automatic" black box).
 */

import {
  AlertTriangle,
  ArrowRight,
  ListChecks,
  Megaphone,
  Crosshair,
  ArrowLeftRight,
} from 'lucide-react';
import type { AgentCenterPerSkuReport, BriefMove } from '@/lib/types/ai-readiness';
import { realBrief } from '@/lib/audit/strategicBrief';

// The LLM brief emits move strings; the deterministic fallback emits
// {how, where, who_controls} objects. Normalize either to one readable line so
// the panel never crashes on `.replace` of a non-string (a real prior bug).
function briefLine(move: BriefMove): string {
  if (typeof move === 'string') return move.replace(/^\s*\d+[.)]\s*/, '');
  if (move && typeof move === 'object') {
    const lead =
      move.move || move.how || move.step || move.action || move.text || move.title;
    if (typeof lead === 'string' && lead) {
      const where = typeof move.where === 'string' && move.where ? ` — for “${move.where}”` : '';
      const who =
        typeof move.who_controls === 'string' && move.who_controls
          ? ` (controlled by ${move.who_controls})`
          : '';
      return `${lead.replace(/^\s*\d+[.)]\s*/, '')}${where}${who}`;
    }
    const firstStr = Object.values(move).find((v) => typeof v === 'string');
    if (typeof firstStr === 'string') return firstStr;
  }
  return '';
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        {icon}
        {title}
      </div>
      <div className="mt-1 text-xs leading-relaxed">{children}</div>
    </div>
  );
}

export function StrategicBriefPanel({ report }: { report: AgentCenterPerSkuReport }) {
  const nba = report.next_best_action;
  if (!nba) return null;
  // Suppress the deterministic fallback brief entirely; only the real LLM brief
  // is rendered. Everything below reads through `brief`, so nulling it cleanly
  // degrades to the data-grounded headline + self-serve next-step.
  const brief = realBrief(nba);
  // Concrete steps: prefer the brief's first_moves, then the diy self-serve,
  // then the deterministic self_serve checklist.
  const steps =
    (brief?.first_moves && brief.first_moves.length > 0 && brief.first_moves) ||
    (brief?.diy_vs_pivota?.self_serve && brief.diy_vs_pivota.self_serve.length > 0
      ? brief.diy_vs_pivota.self_serve
      : null) ||
    (nba.self_serve && nba.self_serve.length > 0 ? nba.self_serve : nba.self_serve_actions) ||
    [];
  const whyLose = brief?.why_you_lose || nba.why_this_first || null;
  const decision = brief?.core_decision || null;
  const traffic = brief?.traffic_strategy || [];
  const pivota = brief?.diy_vs_pivota?.pivota || null;
  const angle = brief?.your_angle || null;
  const subPlay = brief?.substitution_play || null;

  // Nothing meaningful to say.
  if (!whyLose && !decision && steps.length === 0 && !nba.headline && !angle) {
    return (
      <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-2.5 text-xs opacity-60">
        No specific next step yet — re-run after enriching this page.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-3">
      {nba.headline ? (
        <div className="text-sm font-semibold">{nba.headline}</div>
      ) : null}

      {angle ? (
        <Section title="Your angle" icon={<Crosshair className="h-3.5 w-3.5" />}>
          {angle}
        </Section>
      ) : null}

      {whyLose ? (
        <Section title="Why you're losing this" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
          {whyLose}
        </Section>
      ) : null}

      {decision ? (
        <Section title="The call" icon={<ArrowRight className="h-3.5 w-3.5" />}>
          {decision}
        </Section>
      ) : null}

      {steps.length > 0 ? (
        <Section title="Do this now" icon={<ListChecks className="h-3.5 w-3.5" />}>
          <ol className="ml-4 list-decimal space-y-1">
            {steps.slice(0, 5).map((s, i) => (
              <li key={i}>{briefLine(s)}</li>
            ))}
          </ol>
        </Section>
      ) : null}

      {traffic.length > 0 ? (
        <Section title="Channel plan" icon={<Megaphone className="h-3.5 w-3.5" />}>
          <ul className="ml-4 list-disc space-y-1 opacity-80">
            {traffic.slice(0, 3).map((t, i) => (
              <li key={i}>{briefLine(t)}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {subPlay ? (
        <Section title="Win back substituted buyers" icon={<ArrowLeftRight className="h-3.5 w-3.5" />}>
          {subPlay}
        </Section>
      ) : null}

      {pivota ? (
        <div className="mt-3 rounded-md border border-dashed border-[color:var(--merchant-line)] px-2.5 py-2 text-xs">
          <span className="font-semibold">Connect your store to let Pivota do it for you: </span>
          <span className="opacity-80">{pivota}</span>
        </div>
      ) : null}

      {nba.tracking_metrics && nba.tracking_metrics.length > 0 ? (
        <div className="mt-2 text-[11px] opacity-60">
          Track: {nba.tracking_metrics.join(' · ')}
        </div>
      ) : null}
    </div>
  );
}
