/**
 * Overview model (pure) — maps the revenue-recovery projection
 * (`GET /api/audits/{id}?audience=revenue_recovery`) to what the Overview
 * board draws, under the audit contract:
 *
 * - Bands per dimension with n (median and middle 50%). No composite score.
 * - Each answer cell carries ITS OWN `positive of n`, unknown and failed
 *   counts and 95% range (review B2). Unknown / failed answers are left out,
 *   never counted as misses. There is no shared "readable answers" column.
 * - `attempted = 0` ("not asked") and `n = 0` ("no readable answers") are
 *   different states (review M3).
 * - Exact-product results appear only on the category row, as "US test panel".
 * - Catalog routing needs a connected store; each run's numbers follow that
 *   run's own `catalog_available`.
 * - Convert stays "Not run yet" until a checkout test has actually run (the
 *   projection carries no checkout-test result yet).
 */
import { isRecoveryCompatible, recommendationRows, type Recovery } from "@/components/audit/RevenueRecovery";

export type Tone = "ok" | "warn" | "err" | "neu";

export type DimensionRow = {
  key: "identity" | "content_richness" | "routability" | "citation";
  labelKey: string;
  state: "measured" | "needs_store" | "not_in_check";
  bandKey?: string;
  bandLabel?: string;
  tone?: Tone;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  n?: number | null;
};

export type AnswerCell =
  | { kind: "measured"; positive: number; n: number; rate: number; ci: [number, number] | null; unknown: number; failed: number; panel?: "us_test_panel" }
  | { kind: "no_readable"; unknown: number; failed: number; panel?: "us_test_panel" }
  | { kind: "not_measured_type" }
  | { kind: "not_measured_check" };

export type TierRow =
  | { tier: TierKey; labelKey: string; kind: "not_asked" }
  | { tier: TierKey; labelKey: string; kind: "asked"; attempted: number; failed: number; brand: AnswerCell; sources: AnswerCell; exact: AnswerCell };

export type TierKey = "branded" | "unbranded" | "dupe";

export type OverviewModel = {
  catalogAvailable: boolean;
  productCount: number | null;
  observations: number | null;
  providers: string[];
  stage1: DimensionRow[];
  stage2: DimensionRow[];
  tiers: TierRow[];
  unavailableReason: string | null;
  limitation: string | null;
  mixedConditions: boolean;
  unclassified: number;
};

const DIMENSION_LABEL_KEYS: Record<DimensionRow["key"], string> = {
  identity: "recovery.dim.identity",
  content_richness: "recovery.dim.content",
  routability: "recovery.dim.routing",
  citation: "recovery.dim.citation",
};

const BAND_KEYS: Record<string, { key: string; tone: Tone }> = {
  blocked: { key: "recovery.band.blocked", tone: "err" },
  partial: { key: "recovery.band.partial", tone: "warn" },
  ready: { key: "recovery.band.ready", tone: "ok" },
  agent_ready: { key: "recovery.band.agentReady", tone: "ok" },
};

const TIER_LABEL_KEYS: Record<TierKey, string> = {
  branded: "recovery.tier.branded",
  unbranded: "recovery.tier.unbranded",
  dupe: "recovery.tier.dupe",
};

type HeadlineDimension = Recovery["headline"]["dimensions"][number] & { band?: string; p25?: number; p75?: number };

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dimensionRow(
  key: DimensionRow["key"],
  dims: HeadlineDimension[],
  opts: { needsStore?: boolean } = {},
): DimensionRow {
  const labelKey = DIMENSION_LABEL_KEYS[key];
  if (opts.needsStore) return { key, labelKey, state: "needs_store" };
  const dim = dims.find((d) => d && d.dimension === key);
  if (!dim || !finite(dim.n)) return { key, labelKey, state: "not_in_check" };
  const band = typeof dim.band === "string" ? BAND_KEYS[dim.band] : undefined;
  return {
    key,
    labelKey,
    state: "measured",
    bandKey: band?.key,
    bandLabel: dim.band_label,
    tone: band?.tone ?? "neu",
    median: finite(dim.median),
    p25: finite(dim.p25),
    p75: finite(dim.p75),
    n: finite(dim.n),
  };
}

type Estimate = Recovery["selection"]["tiers"][string]["brand_mentioned"];

export function answerCell(estimate: Estimate | undefined, failed: number): AnswerCell {
  if (!estimate) return { kind: "not_measured_check" };
  const unknown = Math.max(0, finite(estimate.unknown) ?? 0);
  const n = finite(estimate.n) ?? 0;
  if (n <= 0 || estimate.rate === null || !finite(estimate.rate)) return { kind: "no_readable", unknown, failed };
  const ci = Array.isArray(estimate.ci95) && estimate.ci95.length === 2 && estimate.ci95.every((v) => finite(v) !== null)
    ? ([estimate.ci95[0], estimate.ci95[1]] as [number, number])
    : null;
  return { kind: "measured", positive: finite(estimate.positive) ?? 0, n, rate: estimate.rate as number, ci, unknown, failed };
}

/** Exact-product results, category row only, US test panel. The reviewed
 * recommendation rows carry counts but no interval, so `ci` stays null and
 * the view says the range isn't reported. */
export function exactProductCell(selection: Recovery["selection"]): AnswerCell {
  const rows = recommendationRows(selection.recommendations).filter((row) => row.market === "US");
  if (rows.length === 0) return { kind: "not_measured_check" };
  const sum = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const positive = sum((row) => row.recommended);
  const n = positive + sum((row) => row.other);
  const unknown = sum((row) => row.unknown);
  const failed = sum((row) => row.failed);
  if (n === 0) return { kind: "no_readable", unknown, failed, panel: "us_test_panel" };
  return { kind: "measured", positive, n, rate: positive / n, ci: null, unknown, failed, panel: "us_test_panel" };
}

export function buildOverview(data: unknown, opts: { productCount?: number | null } = {}): OverviewModel | null {
  if (!isRecoveryCompatible(data)) return null;
  const recovery = data as Recovery & { headline: { skus_audited?: number }; selection: { providers?: Record<string, number> } };
  const dims = (recovery.headline.dimensions ?? []) as HeadlineDimension[];
  const catalogAvailable = recovery.catalog_available === true;
  const selection = recovery.selection;
  const unavailable = typeof selection.unavailable_reason === "string" && selection.unavailable_reason ? selection.unavailable_reason : null;

  const tiers: TierRow[] = (Object.keys(TIER_LABEL_KEYS) as TierKey[]).map((tier) => {
    const t = selection.tiers[tier];
    const labelKey = TIER_LABEL_KEYS[tier];
    const attempted = finite(t?.attempted) ?? 0;
    if (!t || attempted <= 0) return { tier, labelKey, kind: "not_asked" };
    const failed = Math.max(0, finite(t.provider_failed) ?? 0);
    return {
      tier,
      labelKey,
      kind: "asked",
      attempted,
      failed,
      brand: answerCell(t.brand_mentioned, failed),
      sources: answerCell(t.source_visible, failed),
      exact: tier === "unbranded" ? exactProductCell(selection) : { kind: "not_measured_type" },
    };
  });

  const headlineCount = finite(recovery.headline.skus_audited);
  return {
    catalogAvailable,
    productCount: headlineCount ?? opts.productCount ?? null,
    observations: finite(selection.observations),
    providers: Object.keys(selection.providers ?? {}),
    stage1: [
      dimensionRow("identity", dims),
      dimensionRow("content_richness", dims),
      dimensionRow("routability", dims, { needsStore: !catalogAvailable }),
    ],
    stage2: [dimensionRow("citation", dims)],
    tiers,
    unavailableReason: unavailable,
    limitation: typeof selection.limitation === "string" ? selection.limitation : null,
    mixedConditions: Array.isArray(selection.mixed_execution_providers) && selection.mixed_execution_providers.length > 0,
    unclassified: Math.max(0, finite(selection.unclassified) ?? 0),
  };
}

export function percent(value: number): number {
  return Math.round(value * 100);
}

/** Run lifecycle from the run-history summary row. */
export type RunPhase = "none" | "running" | "failed" | "done";

export function runPhase(run: { status?: string | null; completed_at?: string | null } | null | undefined): RunPhase {
  if (!run) return "none";
  const status = String(run.status || "").toLowerCase();
  if (status === "failed" || status === "error" || status === "cancelled") return "failed";
  if (status === "succeeded" || status === "completed" || status === "done" || run.completed_at) return "done";
  return "running";
}
