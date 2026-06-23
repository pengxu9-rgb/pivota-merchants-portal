# Spec: store-less (brand-authored) catalog

**Status:** proposal · **Priority:** foundational — unblocks non-Shopify / pre-launch / wholesale / marketplace-only brands.
**Origin:** follow-on from the catalog-health redesign — today a brand **must sync a storefront before it can have or manage a catalog**, which contradicts the store-less / neutral-commerce-index positioning.
**Repos:** `pivota-backend` (source, identity, create path, scoring) · `pivota-merchants-portal` (authoring UI + reuse).

---

## 1. Problem & current state (grounded)

A merchant with no connected store has **no catalog in the system**, so there is nothing to enrich, evidence, or score. The coupling is concentrated in two places — everything else is already store-agnostic.

| Layer | Where | Store-coupled? |
|---|---|---|
| **Source selection** | `readiness/sources/__init__.py:9–24` | **Yes** — `load_merchant_source_dataset` routes `synthetic-demo-merchant` → synthetic, the alpha merchant → `shopify_live`, else **raises `KeyError`**. Only two real paths; both presuppose a store (or a fixture). |
| **Catalog input** | `readiness/sources/shopify_live.py` (`_load_runtime_cache_rows`, `_map_cache_row_to_standard_product`) | **Yes** — products come from a synced **products cache** (`get_cached_products(..., platform="shopify")`), written by the store sync job. No sync ⇒ no products. |
| Store linkage | `merchant_onboarding` (basic record) + `merchant_stores` (connections), `services/merchant_store_service.py` | A merchant **can exist with no `merchant_stores` row** — the data model already allows store-less merchants. |
| Dataset contract | `MerchantSourceDataset` (`readiness/models.py:506–526`) | Neutral — `merchant_connection` defaults to `{}`; `source_of_truth` is a free dict; `products: List[StandardProduct]`. |
| Product shape | `StandardProduct` (`models/standard_product.py:490–656`) | Neutral — requires only `id, platform, merchant_id, title, price, currency`; everything else optional. `platform` is a free string. |
| Product identity | `merchant_pdp.py` — `product_key = f"{merchant_id}|{platform}|{platform_product_id}"` | **Neutral** — any `platform` string works; no enum. |
| **Enrichment** | `db/product_enrichment.py` — PK `(merchant_id, platform, platform_product_id, geo_code)`, `upsert_enrichment(...)` | **Already store-agnostic** ✓ — works for any `platform`, no store required. |
| **Evidence** | `POST /product/{platform}/{platform_product_id}/evidence` (`routes/merchant_pdp.py:151`) | **Already store-agnostic** ✓ — keyed by product_key, no store linkage. |

**Takeaway:** identity, enrichment, and evidence are *already* platform-neutral. The only things missing for a store-less brand are **(a) a catalog source that isn't the Shopify cache** and **(b) a way to create products without a store**. There is no existing manual/CSV/brand-authored product path today (closest is the synthetic JSON fixture and an unwired `external_seed` reference in tests).

---

## 2. Why this is essential

The brands that gain the most from agent **discovery + citation** — pre-launch, wholesale-only, marketplace-only, or simply not-on-Shopify — are exactly the ones the current architecture **locks out**. For them, checkout isn't the wedge; **content + evidence + citation eligibility** is. Store-less support is what makes "every brand is equal in a neutral index" real instead of aspirational, and it's the concrete form of the missing **claim/content write path**.

## 3. Goal

Let a brand **create and manage a product catalog in Pivota with no store connection**, run **content/discovery readiness + evidence** on it, and become citation-eligible — while commerce signals (inventory, checkout, order-sync) are treated as **N/A**, not blockers. Connecting a store later is an *upgrade*, not a prerequisite.

---

## 4. Proposed architecture

### 4.1 Data — a brand-authored product store
A `brand_product` table keyed by `(merchant_id, product_id)` with `platform = "pivota"`, holding the `StandardProduct` core (title, brand/vendor, category, description, images, attributes, optional price). This is the **source of truth** for store-less catalogs — distinct from the Shopify products cache (which is a sync mirror).

### 4.2 New readiness source
`load_brand_authored_merchant_dataset(merchant_id)` returns a `MerchantSourceDataset` with:
- `products` from `brand_product`; `merchant_connection = {}`;
- `source_of_truth.catalog = "pivota_brand_catalog.v1"`; `field_sources`/`product_diagnostics` use product `created_at`/`updated_at` (no refresh cycle);
- a **new mode** (`merchant_alpha_mode = "brand_authored"`, or a `capability_flag`) the scorer reads to know commerce signals are N/A.

### 4.3 Source selection
In `load_merchant_source_dataset`, route a merchant with **no store connection but brand-authored products** to the new loader (instead of `KeyError`). (Hybrid — a merchant with *both* a store and brand-authored products — is an explicit open question; §7.)

### 4.4 The create primitive (the actual new write path)
`POST /merchant/products`, `PUT /merchant/products/{id}`, `DELETE /merchant/products/{id}` — create/edit/remove brand-authored products, merchant-scoped. MVP = manual single-product create; import (CSV / feed / paste-a-PDP-URL) is Phase 2.

### 4.5 Scoring adaptation (`readiness/scoring.py`)
For `brand_authored`, the price/inventory/checkout_capability/order_status families resolve to **N/A** (not blockers); readiness focuses on the **content/discovery** families (title, description, images, attributes, completeness) + evidence/substantiation. Net: a store-less brand gets a *content readiness* score and a citation-eligibility verdict, never a "checkout blocked" nag.

### 4.6 Reuse (no rebuild)
- **Enrichment** and **evidence** already key off `platform|product_id` → work as-is with `platform="pivota"`.
- **Product queue, quality, the catalog-health page** all render from the readiness payload → they light up for brand-authored products with no UI rework.
- The hidden store-setup banner stays hidden for these merchants (it's irrelevant until they want checkout) — consistent with the redesign.

---

## 5. Backend work
1. `brand_product` table + DAL (CRUD).
2. `load_brand_authored_merchant_dataset` source + register it in `load_merchant_source_dataset` (no-store-with-products branch).
3. `POST/PUT/DELETE /merchant/products` (create path) + rescore-on-write.
4. Scoring: `brand_authored` mode → commerce families N/A; content families drive the score.
5. Product identity: standardize `platform="pivota"` for brand-authored; ensure `make_product_key` + enrichment/evidence accept it (they do).

## 6. Frontend work
1. **"Add product" authoring surface** (the genuinely new UI): a product form (title, brand, category, description, images, attributes) → `POST /merchant/products`; edit/remove.
2. An empty-state on the Catalog / Catalog-health pages for store-less merchants: "Add your first product" instead of "connect a store."
3. Everything downstream (queue, workspace tabs, enrichment editor, evidence panel) is reused unchanged.
4. Nav/onboarding: let a merchant reach catalog management without the "connect a store" gate.

---

## 7. Phasing
- **MVP** — manual single-product create + content/evidence management + content-readiness score for store-less merchants. Proves the decoupling end-to-end with the smallest surface.
- **Phase 2** — bulk import (CSV / feed / import-from-URL), and dedup against the canonical commerce index.
- **Phase 3** — "upgrade to checkout": when the brand later connects a store/PSP, reconcile brand-authored products with synced ones (identity merge) and unlock commerce readiness.

## 8. Open decisions
- **Mode vs flag.** New `merchant_alpha_mode = "brand_authored"` or a separate capability flag the scorer reads? (Affects how many `scoring.py` branches change.)
- **Hybrid catalogs.** Can one merchant have *both* a synced store and brand-authored products? If yes, the source layer must merge two product sets and define precedence; if no (MVP), keep store-less and store-connected mutually exclusive.
- **Canonical index tie-in.** Do brand-authored products get a `content_key` and feed the cross-channel citation index immediately (the commerce-index thread), or stay merchant-private until reviewed? This is the highest-leverage coupling to get right.
- **Identity / dedup.** When a brand-authored product and a synced store product describe the same SKU (Phase 3), what's the merge key and which wins?
- **Alpha gating.** The live path is currently gated to a single alpha merchant (`readiness/sources/__init__.py`). Store-less onboarding implies opening readiness to general merchants — decide whether this rides the same gate or its own.
- **Platform string.** `"pivota"` vs `"brand"` vs `"brand_authored"` as the canonical `platform` value (it's load-bearing in keys and exports — pick once, never rename).
