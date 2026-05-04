import { getAgentCenterState } from "./repository.ts";

export type PublicProductEntityIndexEntry = {
  product_entity_id: string;
  canonical_url: string;
  canonical_product_name: string;
  brand?: string;
  category?: string;
  lastmod?: string;
};

const DEFAULT_PUBLIC_PRODUCT_ENTITY: PublicProductEntityIndexEntry = {
  product_entity_id: "sig_7ad40676c42fb9c96e2a8136",
  canonical_url:
    "https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136",
  canonical_product_name: "The Ordinary Multi-Peptide Lash and Brow Serum",
  brand: "The Ordinary",
  category: "Lash and brow serum",
  lastmod: "2026-05-04",
};

function isCanonicalProductEntityUrl(url: string) {
  return /^https:\/\/agent\.pivota\.cc\/products\/(?!ext_)[^/?#]+$/i.test(url);
}

function canonicalUrlForProduct(product: {
  product_entity_id?: string;
  canonical_url?: string;
}) {
  if (product.canonical_url && isCanonicalProductEntityUrl(product.canonical_url)) {
    return product.canonical_url;
  }
  return product.product_entity_id
    ? `https://agent.pivota.cc/products/${encodeURIComponent(product.product_entity_id)}`
    : "";
}

export function publicProductEntityIndexEntries() {
  const entries = new Map<string, PublicProductEntityIndexEntry>();
  entries.set(DEFAULT_PUBLIC_PRODUCT_ENTITY.canonical_url, DEFAULT_PUBLIC_PRODUCT_ENTITY);

  for (const store of getAgentCenterState().stores) {
    for (const product of store.products || []) {
      const canonicalUrl = canonicalUrlForProduct(product);
      if (!canonicalUrl || !isCanonicalProductEntityUrl(canonicalUrl)) continue;
      entries.set(canonicalUrl, {
        product_entity_id: product.product_entity_id,
        canonical_url: canonicalUrl,
        canonical_product_name:
          product.canonical_product_name || product.title || product.product_entity_id,
        brand: product.brand,
        category: product.category,
        lastmod: product.updated_at || store.updated_at || DEFAULT_PUBLIC_PRODUCT_ENTITY.lastmod,
      });
    }
  }

  return [...entries.values()].sort((left, right) =>
    left.canonical_url.localeCompare(right.canonical_url)
  );
}

export function agentPivotaSitemapEntries() {
  return publicProductEntityIndexEntries().map((entry) => ({
    url: entry.canonical_url,
    lastModified: entry.lastmod ? new Date(entry.lastmod) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
}

export function agentPivotaRobotsPolicy() {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/products/", "/products/indexability"],
      disallow: ["/internal/", "/api/internal/"],
    },
    sitemap: "https://agent.pivota.cc/sitemap.xml",
    host: "https://agent.pivota.cc",
  };
}

