/**
 * Store mode for AI Revenue Recovery v2 (build decision 6, review M2):
 * "Connected" means an ACTIVE store connection — not `catalog_products > 0`,
 * and not a run's `catalog_available` (each run's numbers follow that run's
 * own flag). A store that is active but has never synced is
 * "Connected, first sync running".
 */
export type StoreSummary = {
  id: string;
  platform: string;
  name: string;
  is_active: boolean;
  is_primary: boolean;
  product_count: number;
  last_sync: string | null;
};

export type StoreMode =
  | { kind: "loading" }
  | { kind: "unknown" }
  | { kind: "links" }
  | { kind: "first_sync"; platform: string; platformKey?: string; storeName: string }
  | { kind: "connected"; platform: string; platformKey?: string; storeName: string; productCount: number; lastSync: string | null };

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  wix: "Wix",
  bigcommerce: "BigCommerce",
  prestashop: "PrestaShop",
  shopline: "Shopline",
  shoplazza: "Shoplazza",
};

export function platformLabel(platform: string | null | undefined): string {
  const key = String(platform || "").trim().toLowerCase();
  if (!key) return "Store";
  return PLATFORM_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function deriveStoreMode(stores: StoreSummary[] | null | undefined): StoreMode {
  if (!Array.isArray(stores)) return { kind: "unknown" };
  const active = stores.filter((store) => store && store.is_active);
  if (active.length === 0) return { kind: "links" };
  const store = active.find((s) => s.is_primary) ?? active[0];
  const productCount = Number.isFinite(store.product_count) ? store.product_count : 0;
  const base = { platform: platformLabel(store.platform), platformKey: String(store.platform || "").toLowerCase(), storeName: store.name };
  if (!store.last_sync && productCount === 0) return { kind: "first_sync", ...base };
  return { kind: "connected", ...base, productCount, lastSync: store.last_sync };
}

export function isStoreConnected(mode: StoreMode): boolean {
  return mode.kind === "connected" || mode.kind === "first_sync";
}

/** Credits card (review M16): `available` can exceed the monthly allowance
 * because it includes purchased top-ups, so the two are shown separately —
 * never as "X of Y left". */
/** Free link checks (GET /api/billing/me/current-period `free_link_checks`): `allowed` / `remaining`
 * are null when the cap is lifted (link checks unmetered). Absent when the backend didn't send it. */
export type FreeLinkChecks = { allowed: number | null; remaining: number | null };

export type CreditsSummary = { available: number | null; allowance: number | null; tier: string | null; freeLinkChecks?: FreeLinkChecks };

type FreeLinkChecksPayload = { allowed?: number | null; remaining?: number | null } | null;

export function deriveCredits(period: { available_credits?: number; allowance_credits?: number; consumed_credits?: number; tier?: string | null; free_link_checks?: FreeLinkChecksPayload } | null | undefined): CreditsSummary | null {
  if (!period) return null;
  const allowance = Number.isFinite(period.allowance_credits) ? (period.allowance_credits as number) : null;
  let available: number | null = Number.isFinite(period.available_credits) ? (period.available_credits as number) : null;
  if (available === null && allowance !== null && Number.isFinite(period.consumed_credits)) {
    available = Math.max(0, allowance - (period.consumed_credits as number));
  }
  if (available === null && allowance === null) return null;
  const summary: CreditsSummary = { available, allowance, tier: typeof period.tier === "string" && period.tier ? period.tier : null };
  const free = period.free_link_checks;
  if (free && typeof free === "object") {
    const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null);
    summary.freeLinkChecks = { allowed: num(free.allowed), remaining: num(free.remaining) };
  }
  return summary;
}
