'use client';

// Shared typed renderer for content_brief evidence (used by the executor
// activity feed and the task queue). Replaces a raw JSON.stringify dump with
// readable per-brief fields, and humanizes the raw agent slug.

export type ContentBrief = {
  target_query?: string;
  suggested_title?: string;
  suggested_word_count?: number;
  outline_h2_sections?: string[];
  outline?: string[];
  competitor_articles?: unknown[];
  key_talking_points?: string[];
};

const AGENT_LABELS: Record<string, string> = {
  content_brief_generator: 'Content brief generator',
  sitemap_freshness_monitor: 'Sitemap freshness monitor',
  gsc_url_submission_loop: 'Indexing submission',
};

export function humanizeAgentName(name: string | null | undefined): string {
  const n = name || '';
  if (AGENT_LABELS[n]) return AGENT_LABELS[n];
  return n
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function briefsOf(ev: Record<string, unknown> | null | undefined): ContentBrief[] {
  const briefs = ev?.['briefs'];
  if (!Array.isArray(briefs)) return [];
  return briefs.filter((b): b is ContentBrief => !!b && typeof b === 'object');
}

/** One-line summary naming the actual target queries (the per-run distinguisher
 *  the raw agent slug lacked). Returns null when there are no briefs. */
export function summarizeBriefs(ev: Record<string, unknown> | null | undefined): string | null {
  const briefs = briefsOf(ev);
  if (briefs.length === 0) return null;
  const queries = briefs
    .map((b) => (typeof b.target_query === 'string' ? b.target_query : ''))
    .filter(Boolean);
  if (queries.length === 0) return `${briefs.length} brief${briefs.length === 1 ? '' : 's'} drafted`;
  const shown = queries.slice(0, 2).join(', ');
  const extra = queries.length - 2;
  return `${briefs.length} brief${briefs.length === 1 ? '' : 's'} · ${shown}${
    extra > 0 ? `, +${extra} more` : ''
  }`;
}

export function BriefEvidence({ briefs }: { briefs: ContentBrief[] }) {
  if (briefs.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1.5">
      {briefs.map((b, idx) => {
        const outline = b.outline_h2_sections ?? b.outline ?? [];
        const competitors = Array.isArray(b.competitor_articles)
          ? b.competitor_articles.length
          : 0;
        return (
          <div
            key={`brief-${idx}`}
            className="rounded border border-slate-200 bg-white px-2.5 py-2 text-[11px]"
          >
            {b.target_query ? (
              <div className="font-semibold text-slate-800">{b.target_query}</div>
            ) : null}
            {b.suggested_title ? (
              <div className="mt-0.5 text-slate-700">{b.suggested_title}</div>
            ) : null}
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
              {b.suggested_word_count ? <span>~{b.suggested_word_count} words</span> : null}
              {outline.length > 0 ? <span>{outline.length} sections</span> : null}
              {competitors > 0 ? <span>{competitors} competitor articles</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
