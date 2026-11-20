/**
 * Products model (pure): one row per product in the latest check, with its
 * Identity / Content / Citation bands as the backend labels them.
 *
 * - Bands come from the backend's own `band` / `band_label` (never re-derived
 *   from the score). `unscored` = not measured, shown as such — not a fail.
 * - No "Pass" badge (review m1): a ready band reads "Ready".
 * - Suggested copy needs a connected store; publishing is off for every store,
 *   so the view only offers copy-and-paste.
 */
import { parseAuditProductKey } from "@/lib/audit/productKey";
import type { AgentCenterPerSkuReport, SkuDimensionScore } from "@/lib/types/ai-readiness";
import type { Tone } from "@/lib/recovery-v2/overview";

export type BandCell =
  | { kind: "band"; bandKey: string | null; bandLabel: string | null; tone: Tone; score: number | null }
  | { kind: "unscored" }
  | { kind: "missing" };

export type ProductRow = {
  key: string;
  productKey: string;
  title: string;
  identity: BandCell;
  content: BandCell;
  citation: BandCell;
  gaps: { label: string; why: string }[];
  ref: { platform: string; platformProductId: string } | null;
};

const BANDS: Record<string, { key: string; tone: Tone }> = {
  blocked: { key: "recovery.band.blocked", tone: "err" },
  partial: { key: "recovery.band.partial", tone: "warn" },
  ready: { key: "recovery.band.ready", tone: "ok" },
  agent_ready: { key: "recovery.band.agentReady", tone: "ok" },
};

export function bandCell(score: SkuDimensionScore | null | undefined): BandCell {
  if (!score || typeof score !== "object") return { kind: "missing" };
  if (score.band === "unscored") return { kind: "unscored" };
  const band = score.band ? BANDS[score.band] : undefined;
  if (!band && !score.band_label) return { kind: "missing" };
  return {
    kind: "band",
    bandKey: band?.key ?? null,
    bandLabel: score.band_label ?? null,
    tone: band?.tone ?? "neu",
    score: Number.isFinite(score.score) ? score.score : null,
  };
}

const RANK: Record<string, number> = { err: 0, warn: 1, neu: 2, ok: 3 };

function weight(cell: BandCell): number {
  return cell.kind === "band" ? RANK[cell.tone] : 2;
}

export function buildProducts(reports: AgentCenterPerSkuReport[] | null | undefined): ProductRow[] {
  const rows: ProductRow[] = [];
  const seen = new Set<string>();
  for (const report of reports ?? []) {
    if (!report || typeof report !== "object") continue;
    const productKey = String(report.product_key || report.sku_key || "");
    const key = productKey || `row-${rows.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = (report.identity?.name || report.sku_title || report.sku_key || productKey || "").toString().trim();
    rows.push({
      key,
      productKey,
      title: title || "—",
      identity: bandCell(report.scores?.identity),
      content: bandCell(report.scores?.content_richness),
      citation: bandCell(report.scores?.citation),
      gaps: (report.primary_gaps ?? [])
        .filter((g) => g && typeof g.label === "string" && g.label.trim())
        .slice(0, 3)
        .map((g) => ({ label: g.label, why: typeof g.why === "string" ? g.why : "" })),
      ref: parseAuditProductKey(productKey),
    });
  }
  // Most to fix first: lowest total across the three bands
  // (Not yet visible 0 · Needs work 1 · unmeasured 2 · Ready 3).
  const total = (row: ProductRow) => weight(row.identity) + weight(row.content) + weight(row.citation);
  return rows.sort((a, b) => total(a) - total(b) || a.title.localeCompare(b.title));
}

export type SuggestedCopy = { title: string; summary: string; description: string; bullets: string[]; adminUrl: string | null };

/** Same read as the existing copy-to-store card: the `enrichment` overlay of
 * GET /merchant/products/{platform}/{id}. Null when there is no copy yet. */
export function suggestedCopyFromDetail(detail: unknown): SuggestedCopy | null {
  const data = (detail ?? {}) as { enrichment?: Record<string, unknown>; platform_admin_url?: unknown; data?: unknown };
  const source = data.enrichment ? data : ((data.data ?? {}) as typeof data);
  const enr = (source.enrichment ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const copy = {
    title: str(enr.title_override),
    summary: str(enr.summary_short),
    description: str(enr.description_markdown),
    bullets: Array.isArray(enr.bullet_points) ? enr.bullet_points.filter((b): b is string => typeof b === "string" && b.trim().length > 0) : [],
    adminUrl: str(source.platform_admin_url) || null,
  };
  if (!copy.title && !copy.summary && !copy.description && copy.bullets.length === 0) return null;
  return copy;
}

/** Pull per-product reports out of either run payload. */
export function productReportsFromRun(payload: unknown): AgentCenterPerSkuReport[] {
  const data = (payload ?? {}) as { per_sku_reports?: AgentCenterPerSkuReport[]; report_jsonb?: unknown };
  if (data.report_jsonb && typeof data.report_jsonb === "object") return productReportsFromRun(data.report_jsonb);
  return Array.isArray(data.per_sku_reports) ? data.per_sku_reports : [];
}
