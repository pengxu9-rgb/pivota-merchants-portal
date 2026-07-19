'use client';

/**
 * Engine split — discovery rate by SKU.
 *
 * "Where each engine finds your products today." One row per audited product;
 * within it, one thin horizontal bar PER engine (Gemini, ChatGPT, …) showing the
 * share of non-branded discovery searches where that engine surfaced the product.
 * Gemini and ChatGPT ground different indexes, so a product can win one and lose
 * the other — the split is the point.
 *
 * Data: per_sku_reports[].product_competitiveness.by_model
 *   { <provider>: { appeared, total, rate } }.
 * We compute the percentage from appeared/total (deterministic) and fall back to
 * the backend `rate` only when the counts are missing. Providers are rendered
 * dynamically — whichever engines appear in by_model, in a stable order — so the
 * chart follows the run's real coverage instead of hard-coding two columns.
 *
 * Honesty rules baked in: a missing or 0 rate renders as a real 0% bar (a sliver
 * + a "0%" label), never a blank; percentages are clamped to 0–100. Never
 * color-alone: a legend maps every color to its engine, and each bar carries a
 * direct % label.
 */

import { SurfaceCard } from '@/components/ui/merchant-primitives';
import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';

// CVD-validated series pair (ΔE 43 protan on light surfaces) — Gemini blue /
// ChatGPT magenta. A third hue for Claude, then a neutral fallback for any
// future/unknown provider. Colors are used ONLY for the bar fill; every value
// and label renders in the portal's ink/muted text colors, and a legend + direct
// % labels mean the chart never relies on color alone.
const ENGINE_COLORS: Record<string, string> = {
  gemini: '#3B6FD4',
  chatgpt: '#C2517E',
  openai: '#C2517E',
  claude: '#6B4FA0',
  deepseek: '#3F7A6B',
};
const FALLBACK_COLOR = '#786f65'; // --merchant-muted

const ENGINE_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  openai: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
};

// Preferred column order; anything else falls in after, alphabetically.
const ENGINE_ORDER = ['gemini', 'chatgpt', 'claude', 'deepseek'];

function engineColor(provider: string): string {
  return ENGINE_COLORS[provider] ?? FALLBACK_COLOR;
}

function engineLabel(provider: string): string {
  return ENGINE_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

// Turn a by_model entry into a clamped 0–100 percentage. Prefer the honest
// appeared/total ratio; fall back to the backend `rate` (which may be a 0–1
// fraction or an already-scaled 0–100) only when counts are absent.
function toPct(entry: { appeared?: number; total?: number; rate?: number | null }): number {
  const { appeared, total, rate } = entry;
  let pct: number;
  if (typeof total === 'number' && total > 0 && typeof appeared === 'number') {
    pct = (appeared / total) * 100;
  } else if (typeof rate === 'number') {
    pct = rate <= 1 ? rate * 100 : rate;
  } else {
    pct = 0;
  }
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

function fmtPct(pct: number): string {
  return `${Math.round(pct)}%`;
}

type SkuRow = {
  key: string;
  title: string;
  bars: { provider: string; pct: number; appeared?: number; total?: number }[];
};

export function EngineDiscoverySplitChart({
  reports,
}: {
  reports: AgentCenterPerSkuReport[];
}) {
  // Union of providers seen across every SKU's by_model, in the preferred order
  // then alphabetical — so the legend and every row share one stable column set.
  const providerSet = new Set<string>();
  for (const r of reports) {
    const bm = r.product_competitiveness?.by_model;
    if (bm) for (const p of Object.keys(bm)) providerSet.add(p);
  }
  const providers = Array.from(providerSet).sort((a, b) => {
    const ia = ENGINE_ORDER.indexOf(a);
    const ib = ENGINE_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });

  // One row per SKU that actually carries per-model discovery data. A SKU whose
  // by_model is absent (no discovery probes ran for it) is dropped rather than
  // shown as a row of empty bars — that would read as "0% everywhere", a claim
  // we didn't measure.
  const rows: SkuRow[] = [];
  for (const r of reports) {
    const bm = r.product_competitiveness?.by_model;
    if (!bm || Object.keys(bm).length === 0) continue;
    rows.push({
      key: r.sku_key,
      title: r.sku_title?.trim() || r.sku_key,
      bars: providers.map((provider) => {
        const entry = bm[provider];
        return {
          provider,
          pct: entry ? toPct(entry) : 0,
          appeared: entry?.appeared,
          total: entry?.total,
        };
      }),
    });
  }

  if (rows.length === 0 || providers.length === 0) return null;

  return (
    <SurfaceCard
      title="Where each engine finds your products"
      description="The share of non-branded “best…” searches where each AI engine surfaced each product. Gemini and ChatGPT search different indexes, so wins can diverge — work each engine’s sources separately."
    >
      <div className="px-5 py-4">
        {/* Legend — once, above. Swatch + engine name; the only place color is
            introduced, so every bar below can be read by its own % label too. */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {providers.map((provider) => (
            <span
              key={provider}
              className="inline-flex items-center gap-1.5 text-xs text-[color:var(--merchant-muted-strong)]"
            >
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: engineColor(provider) }}
              />
              {engineLabel(provider)}
            </span>
          ))}
        </div>

        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.key}>
              <div
                className="truncate text-xs font-medium text-[color:var(--merchant-ink)]"
                title={row.title}
              >
                {row.title}
              </div>
              <div className="mt-1.5 space-y-1.5">
                {row.bars.map((bar) => (
                  <div key={bar.provider} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[11px] text-[color:var(--merchant-muted)]">
                      {engineLabel(bar.provider)}
                    </span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[color:var(--merchant-surface-muted)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${bar.pct}%`,
                          minWidth: bar.pct > 0 ? undefined : 2,
                          backgroundColor: engineColor(bar.provider),
                        }}
                      />
                    </div>
                    <span
                      className="w-16 shrink-0 text-right text-[11px] font-semibold tabular-nums text-[color:var(--merchant-ink)]"
                      title={
                        bar.total != null
                          ? `${bar.appeared ?? 0} of ${bar.total} searches`
                          : undefined
                      }
                    >
                      {fmtPct(bar.pct)}
                      {bar.total != null ? (
                        <span className="ml-1 font-normal text-[color:var(--merchant-muted)]">
                          {bar.appeared ?? 0}/{bar.total}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SurfaceCard>
  );
}

export default EngineDiscoverySplitChart;
