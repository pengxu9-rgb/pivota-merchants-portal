'use client';

/**
 * "Two engines, two games" — the per-engine operating plan. Gemini and ChatGPT
 * ground in different indexes (Google vs Bing+community), so winning each is a
 * different job. Renders one card per engine (the primary_gap engine first, as
 * the priority) with its status, how it cites, and its concrete moves; a
 * divergence_note one-liner sits on top. This is THE answer to "why am I on one
 * engine but not the other, and what do I do about each."
 */

import { Bot, ArrowRight } from 'lucide-react';
import type { AgentCenterPerSkuReport, EnginePlaybookEngine } from '@/lib/types/ai-readiness';

const ENGINE_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
};

const STATUS: Record<string, { label: string; cls: string }> = {
  invisible: { label: 'Invisible', cls: 'border-red-200 bg-red-50 text-red-700' },
  weak: { label: 'Weak', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  present: { label: 'Showing up', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  couldnt_measure: {
    label: "Couldn't measure",
    cls: 'border-[color:var(--merchant-line)] text-slate-500',
  },
};

function statusFor(s?: string) {
  return (s && STATUS[s]) || { label: s || '—', cls: 'border-[color:var(--merchant-line)] text-slate-500' };
}

function EngineCard({
  engineKey,
  engine,
  isPriority,
}: {
  engineKey: string;
  engine: EnginePlaybookEngine;
  isPriority: boolean;
}) {
  const st = statusFor(engine.status);
  const name = engine.label || ENGINE_LABELS[engineKey] || engineKey;
  const measured = engine.status !== 'couldnt_measure';
  return (
    <div
      className={`rounded-md border px-3 py-2.5 ${
        isPriority
          ? 'border-[color:var(--merchant-accent,#6366f1)] bg-[color:var(--merchant-accent,#6366f1)]/[0.04]'
          : 'border-[color:var(--merchant-line)] bg-white/40'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold">{name}</span>
        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${st.cls}`}>
          {st.label}
        </span>
        {measured && engine.total ? (
          <span className="text-[11px] tabular-nums opacity-60">
            {engine.appeared ?? 0}/{engine.total}
          </span>
        ) : null}
        {isPriority ? (
          <span className="ml-auto rounded-full bg-[color:var(--merchant-accent,#6366f1)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--merchant-accent,#6366f1)]">
            Start here
          </span>
        ) : null}
      </div>
      {engine.how_it_cites ? (
        <p className="mt-1 text-[11px] leading-snug opacity-60">{engine.how_it_cites}</p>
      ) : null}
      {engine.moves && engine.moves.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {engine.moves.slice(0, 4).map((m, i) => (
            <li key={i} className="flex gap-1.5 text-xs leading-snug">
              <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 opacity-40" />
              <span>{m}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function EnginePlaybookPanel({ report }: { report: AgentCenterPerSkuReport }) {
  const ep = report.engine_playbook;
  if (!ep || !ep.has_signal || !ep.engines || Object.keys(ep.engines).length === 0) {
    return null;
  }

  // Priority engine first, then a stable gemini→chatgpt order.
  const fixed = ['gemini', 'chatgpt'];
  const entries = Object.entries(ep.engines).sort((a, b) => {
    if (a[0] === ep.primary_gap) return -1;
    if (b[0] === ep.primary_gap) return 1;
    return fixed.indexOf(a[0]) - fixed.indexOf(b[0]);
  });

  return (
    <div className="mt-3 rounded-md border border-[color:var(--merchant-line)] bg-white/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        <Bot className="h-3.5 w-3.5" />
        Win each AI engine
      </div>
      {ep.divergence_note ? (
        <p className="mt-1 rounded bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
          {ep.divergence_note}
        </p>
      ) : (
        <p className="mt-1 text-[11px] leading-snug opacity-60">
          Gemini and ChatGPT cite from different sources — winning each is a different job.
        </p>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {entries.map(([key, engine]) => (
          <EngineCard
            key={key}
            engineKey={key}
            engine={engine}
            isPriority={key === ep.primary_gap}
          />
        ))}
      </div>
    </div>
  );
}
