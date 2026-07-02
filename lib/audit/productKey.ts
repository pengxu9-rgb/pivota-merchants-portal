/**
 * Resolve a per-SKU audit report's `product_key` into the (platform,
 * platformProductId) pair that the merchant governance / evidence endpoints key
 * off (they scope the write to the authed merchant, then look up the row by
 * platform + source id).
 *
 * The backend emits product_key in TWO shapes, and the audit "supply proof" /
 * next-step / copy-to-store actions must work for BOTH:
 *   - pipe:    `merchant|platform|platform_product_id`
 *              — URL-audit seeds (agent_center_bd_report_service emits this so a
 *                URL-audited product is evidence-attachable).
 *   - catalog: `prod::merchant::platform::source_product_id`
 *              — make_catalog_product_key: Shopify / marketplace / brand-authored
 *                / synced connected-catalog rows. (Previously these parsed to null
 *                on the pipe-only splitter, so the action was dark on connected
 *                catalog audits even though the endpoints resolve fine.)
 *
 * Returns null for keys that carry no such pair (external_seed / canonical-URL /
 * malformed), so callers never render an action that can't post.
 */
export function parseAuditProductKey(
  productKey: string | null | undefined,
): { platform: string; platformProductId: string } | null {
  const key = String(productKey ?? '').trim();
  if (!key) return null;

  // Catalog format: prod::merchant::platform::source. The source id itself may
  // legally contain '::', so take everything after the 3rd separator.
  if (key.startsWith('prod::')) {
    const parts = key.split('::');
    if (parts.length < 4) return null;
    const platform = (parts[2] ?? '').trim();
    const platformProductId = parts.slice(3).join('::').trim();
    if (!platform || !platformProductId) return null;
    return { platform, platformProductId };
  }

  // Pipe format: merchant|platform|platform_product_id (exactly 3 non-empty).
  const parts = key.split('|');
  if (parts.length !== 3 || parts.some((p) => !p.trim())) return null;
  return { platform: parts[1].trim(), platformProductId: parts[2].trim() };
}
