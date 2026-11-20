/**
 * Sources model (pure): the sites AI cites when shoppers ask about the
 * merchant or the category, and the outreach path for each.
 *
 * - Outreach has exactly three backend states, one label each (review M5):
 *   `draft_ready` = an email recipient is known; `submission_only` = a
 *   contact / submission form; `target_only` = no contact found yet.
 * - "Sent" is the merchant's own tracked record (a task with lever
 *   `outreach_pitch`), not an outreach state.
 * - "Sources mention you" is read from the run's outreach outcomes
 *   (`signals.current.names_you`); it never claims the merchant's link was
 *   cited, and never claims outreach caused it.
 *
 * Inputs come from either run kind: a links run's
 * `where_youre_losing.outreach_moves`, or a catalog run's `win_plan`.
 */
import type {
  AgentCenterOutreachOutcomes,
  AgentCenterWinPlan,
  MerchantTask,
  OutreachMove,
  WinPlanOutreachState,
} from "@/lib/types/ai-readiness";

export type OutreachState = WinPlanOutreachState;
export type Mention = "yes" | "no" | "unknown";

export type SourceRow = {
  host: string;
  typeKey: string;
  citedIn: number | null;
  mentionsYou: Mention;
  state: OutreachState;
  sent: boolean;
  sentAt: string | null;
  queries: string[];
  recipientEmail: string | null;
  recipientNote: string | null;
  submissionUrl: string | null;
  pitch: { subject: string; body: string } | null;
  hint: string | null;
  skuKey: string | null;
  skuTitle: string | null;
  tier: number | null;
};

export type SourcesTab = "all" | "to_contact" | "sent" | "mention";

const STATE_RANK: Record<OutreachState, number> = { draft_ready: 3, submission_only: 2, target_only: 1 };

export const OUTREACH_STATE_LABEL_KEYS: Record<OutreachState, string> = {
  draft_ready: "recovery.sources.state.email",
  submission_only: "recovery.sources.state.form",
  target_only: "recovery.sources.state.none",
};

function typeKeyFor(raw: string | null | undefined): string {
  const value = String(raw || "").toLowerCase();
  if (value.includes("marketplace")) return "recovery.sources.type.marketplace";
  if (value.includes("retail") || value.includes("reseller")) return "recovery.sources.type.retailer";
  if (value.includes("editorial") || value.includes("review") || value.includes("publisher") || value.includes("media")) return "recovery.sources.type.editorial";
  if (value.includes("community") || value.includes("forum") || value.includes("reddit") || value.includes("social")) return "recovery.sources.type.community";
  if (value.includes("creator") || value.includes("video")) return "recovery.sources.type.creator";
  return "recovery.sources.type.unclassified";
}

function normalizeHost(host: unknown): string {
  return String(host || "").trim().toLowerCase().replace(/^www\./, "");
}

/** Backend-crawled links render as hrefs: http(s) only, no credentials. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** A single plain address only (no `?`, `&`, `,` or whitespace that could add
 * mailto headers or recipients). */
export function safeEmail(value: unknown): string | null {
  return typeof value === "string" && /^[^\s@?&,;:<>"'/\\]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.trim()) ? value.trim() : null;
}

function asState(value: unknown): OutreachState {
  return value === "draft_ready" || value === "submission_only" ? value : "target_only";
}

function emptyRow(host: string): SourceRow {
  return {
    host,
    typeKey: "recovery.sources.type.unclassified",
    citedIn: null,
    mentionsYou: "no",
    state: "target_only",
    sent: false,
    sentAt: null,
    queries: [],
    recipientEmail: null,
    recipientNote: null,
    submissionUrl: null,
    pitch: null,
    hint: null,
    skuKey: null,
    skuTitle: null,
    tier: null,
  };
}

function upgrade(row: SourceRow, state: OutreachState) {
  if (STATE_RANK[state] > STATE_RANK[row.state]) row.state = state;
}

export type SourcesInput = {
  moves?: OutreachMove[] | null;
  winPlan?: AgentCenterWinPlan | null;
  outcomes?: AgentCenterOutreachOutcomes | null;
  tasks?: MerchantTask[] | null;
};

export function buildSources(input: SourcesInput): SourceRow[] {
  const rows = new Map<string, SourceRow>();
  const get = (raw: unknown) => {
    const host = normalizeHost(raw);
    if (!host) return null;
    let row = rows.get(host);
    if (!row) {
      row = emptyRow(host);
      rows.set(host, row);
    }
    return row;
  };

  for (const move of input.moves ?? []) {
    const row = get(move?.host);
    if (!row) continue;
    row.typeKey = typeKeyFor(move.host_type);
    if (Number.isFinite(move.prompts_cited_count)) row.citedIn = Math.max(row.citedIn ?? 0, move.prompts_cited_count as number);
    upgrade(row, asState(move.pitch_state));
    row.recipientEmail = row.recipientEmail ?? move.pitch_email ?? null;
    row.submissionUrl = row.submissionUrl ?? move.pitch_submission_url ?? null;
    row.hint = row.hint ?? move.first_move ?? null;
    for (const q of move.losing_queries ?? []) if (q && !row.queries.includes(q)) row.queries.push(q);
  }

  if (input.winPlan?.available) {
    for (const plan of input.winPlan.sku_plans ?? []) {
      for (const losing of plan.losing_queries ?? []) {
        for (const target of losing.grounds_in ?? []) {
          const row = get(target?.host);
          if (!row) continue;
          if (row.typeKey === "recovery.sources.type.unclassified") row.typeKey = typeKeyFor(target.role);
          const outreach = target.outreach;
          upgrade(row, asState(outreach?.state));
          if (losing.query && !row.queries.includes(losing.query)) row.queries.push(losing.query);
          row.citedIn = row.queries.length > (row.citedIn ?? 0) ? row.queries.length : row.citedIn;
          row.recipientEmail = row.recipientEmail ?? outreach?.recipient?.email ?? outreach?.pitch_draft?.recipient_email ?? null;
          row.submissionUrl = row.submissionUrl ?? outreach?.recipient?.submission_url ?? outreach?.pitch_draft?.submission_url ?? null;
          row.recipientNote = row.recipientNote ?? outreach?.recipient?.note ?? outreach?.pitch_draft?.recipient_note ?? null;
          row.hint = row.hint ?? outreach?.hint ?? null;
          row.tier = row.tier ?? target.tier ?? null;
          if (!row.pitch && outreach?.pitch_draft?.subject && outreach.pitch_draft.body) {
            row.pitch = { subject: outreach.pitch_draft.subject, body: outreach.pitch_draft.body };
          }
          row.skuKey = row.skuKey ?? plan.sku_key ?? null;
          row.skuTitle = row.skuTitle ?? plan.sku_title ?? null;
        }
      }
    }
  }

  // A recipient only counts if the state says so: a target_only host never
  // shows an email or form, even if a stray field is present.
  for (const row of rows.values()) {
    row.recipientEmail = row.state === "draft_ready" ? safeEmail(row.recipientEmail) : null;
    row.submissionUrl = row.state === "submission_only" ? safeHttpUrl(row.submissionUrl) : null;
    if (row.state === "target_only") row.pitch = null;
  }

  for (const target of input.outcomes?.available ? input.outcomes.targets ?? [] : []) {
    const row = rows.get(normalizeHost(target?.host));
    if (!row) continue;
    if (target.outcome === "not_comparable") {
      if (row.mentionsYou !== "yes") row.mentionsYou = "unknown";
    } else if (target.signals?.current?.names_you === true || target.outcome === "won") {
      row.mentionsYou = "yes";
    }
  }

  for (const task of input.tasks ?? []) {
    if (task?.lever !== "outreach_pitch" || task.status === "failed") continue;
    const evidence = (task.evidence_jsonb ?? task.evidence ?? {}) as { outreach?: { host?: string } };
    const row = rows.get(normalizeHost(evidence.outreach?.host));
    if (!row) continue;
    row.sent = true;
    row.sentAt = row.sentAt ?? task.created_at ?? null;
  }

  return [...rows.values()].sort(
    (a, b) =>
      Number(b.mentionsYou === "no") - Number(a.mentionsYou === "no") ||
      STATE_RANK[b.state] - STATE_RANK[a.state] ||
      (b.citedIn ?? 0) - (a.citedIn ?? 0) ||
      a.host.localeCompare(b.host),
  );
}

export function inTab(row: SourceRow, tab: SourcesTab): boolean {
  if (tab === "all") return true;
  if (tab === "sent") return row.sent;
  if (tab === "mention") return row.mentionsYou === "yes";
  return row.state !== "target_only" && !row.sent && row.mentionsYou !== "yes";
}

export function tabCounts(rows: SourceRow[]): Record<SourcesTab, number> {
  return {
    all: rows.length,
    to_contact: rows.filter((r) => inTab(r, "to_contact")).length,
    sent: rows.filter((r) => inTab(r, "sent")).length,
    mention: rows.filter((r) => inTab(r, "mention")).length,
  };
}

/** Pulls the outreach inputs out of either run payload. */
export function sourcesInputFromRun(payload: unknown): Omit<SourcesInput, "tasks"> {
  const data = (payload ?? {}) as {
    where_youre_losing?: { outreach_moves?: OutreachMove[] };
    win_plan?: AgentCenterWinPlan | null;
    outreach_outcomes?: AgentCenterOutreachOutcomes | null;
    per_sku_reports?: { merchant_view?: { outreach_outcomes?: AgentCenterOutreachOutcomes | null } }[];
    report_jsonb?: unknown;
  };
  if (data.report_jsonb && typeof data.report_jsonb === "object") return sourcesInputFromRun(data.report_jsonb);
  const legacyOutcomes = (data.per_sku_reports ?? []).map((r) => r?.merchant_view?.outreach_outcomes).find((o) => o?.available);
  return {
    moves: Array.isArray(data.where_youre_losing?.outreach_moves) ? data.where_youre_losing!.outreach_moves : null,
    winPlan: data.win_plan ?? null,
    outcomes: data.outreach_outcomes ?? legacyOutcomes ?? null,
  };
}
