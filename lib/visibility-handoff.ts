// One-shot hand-off from the AI visibility check (where the merchant pastes
// product URLs) to the readiness audit's SKU picker. When they later open the
// audit, we pre-select the SKUs they just audited so they don't have to re-find
// them.
//
// Credit safety: the audit charges credits, so a URL is matched to a catalog
// row ONLY when it maps to exactly ONE row (by handle slug or exact storefront
// URL). Ambiguous (0 or >1) matches are skipped, and the merchant still reviews
// the selection + sees the cost preview before launching. Matching on the
// product handle (not the full URL) sidesteps the custom-domain vs myshopify
// mismatch — handles are unique per store.

const STASH_KEY = 'pivota_visibility_handoff';

export type VisibilityHandoff = {
  urls: string[];
  brand?: string;
  website?: string;
  at: string;
};

export function stashVisibilityHandoff(
  h: Omit<VisibilityHandoff, 'at'>,
): void {
  try {
    const urls = (h.urls || []).map((u) => String(u).trim()).filter(Boolean);
    if (urls.length === 0) return;
    const payload: VisibilityHandoff = {
      urls,
      brand: h.brand,
      website: h.website,
      at: new Date().toISOString(),
    };
    localStorage.setItem(STASH_KEY, JSON.stringify(payload));
  } catch {
    /* localStorage unavailable / quota — hand-off is best-effort */
  }
}

export function readVisibilityHandoff(): VisibilityHandoff | null {
  try {
    const raw = localStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VisibilityHandoff;
    if (!parsed || !Array.isArray(parsed.urls) || parsed.urls.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearVisibilityHandoff(): void {
  try {
    localStorage.removeItem(STASH_KEY);
  } catch {
    /* ignore */
  }
}

/** Last non-empty path segment, lowercased.
 *  https://brand.com/products/Best-Seller/?v=1#x -> "best-seller" */
export function productSlugFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const noProto = url.trim().replace(/^[a-z]+:\/\//i, '');
    const path = noProto.split('?')[0].split('#')[0].replace(/\/+$/, '');
    const seg = path.split('/').pop()?.trim().toLowerCase() ?? '';
    return seg || null;
  } catch {
    return null;
  }
}

/** Normalize a full URL for exact comparison: drop protocol, leading www,
 *  query, fragment, trailing slash; lowercase. */
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    let s = url.trim().toLowerCase().replace(/^[a-z]+:\/\//i, '');
    s = s.replace(/^www\./, '');
    s = s.split('?')[0].split('#')[0].replace(/\/+$/, '');
    return s || null;
  } catch {
    return null;
  }
}

export type HandoffMatchRow = {
  key: string; // the audit selection key, e.g. "shopify:12345"
  handle?: string | null;
  online_store_url?: string | null;
};

/**
 * Map audited URLs to catalog-row selection keys, credit-safely: a URL counts
 * only when it matches exactly one row (unique by handle slug OR exact
 * normalized storefront URL). Returns the keys to pre-select and how many of
 * the audited URLs resolved.
 */
export function matchHandoffSelections(
  urls: string[],
  rows: HandoffMatchRow[],
): { keys: string[]; matchedUrlCount: number } {
  const matchedKeys = new Set<string>();
  let matchedUrlCount = 0;

  for (const url of urls) {
    const slug = productSlugFromUrl(url);
    const normUrl = normalizeUrl(url);
    if (!slug && !normUrl) continue;

    const candidates = new Set<string>();
    for (const row of rows) {
      const rowHandle = (row.handle ?? '').trim().toLowerCase();
      const rowUrl = normalizeUrl(row.online_store_url);
      const handleHit = !!slug && !!rowHandle && rowHandle === slug;
      const urlHit = !!normUrl && !!rowUrl && rowUrl === normUrl;
      if (handleHit || urlHit) candidates.add(row.key);
    }

    // Only an unambiguous single match is safe to auto-select.
    if (candidates.size === 1) {
      matchedKeys.add([...candidates][0]);
      matchedUrlCount += 1;
    }
  }

  return { keys: [...matchedKeys], matchedUrlCount };
}
