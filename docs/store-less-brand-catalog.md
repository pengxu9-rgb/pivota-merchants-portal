# Spec: store-less (brand-authored) catalog — merchant-portal management

**Status:** proposal · **Priority:** foundational — let non-Shopify / pre-launch / wholesale / marketplace-only brands *see and manage* a catalog in the portal without syncing a store.
**Repos:** `pivota-backend` (portal readiness source + manual intake) · `pivota-merchants-portal` (authoring + reuse).

> **Read first — reconciliation with the live commerce-index track.** The index side of "store-less" is **already built** on `origin/main` (the commerce-index P0/P1 work; see the `commerce-index-storeless-brand-decision-layer` memory). Specifically:
> - **`catalog_products` is the storefront-optional product registry** — it carries `pdp_scope` (default `unverified`), `pdp_lifecycle_stage`, `content_key`, `claim_state` (default `unclaimed`) (`db/catalog.py`). It is **not** the Shopify cache.
> - **Products already enter store-lessly** via audit-seed (`services/audit_index_intake.py`, `ENABLE_AUDIT_INDEX_INTAKE`) — a URL audit upserts a `catalog_products` row (`platform='url_audit'`).
> - **Brand claim + attest already exist**: `brand_claims` + `routes/brand_claim_routes.py` (claim/verify), `services/claim_state.py` (lifecycle), and the attest endpoint writes content to **`product_enrichment`** — the agent-read store the `agent_pdp_view` assembler merges from.
>
> So this spec is **not** "build a catalog from scratch." It is the **merchant-portal complement** to that track: surface the already-store-less `catalog_products` to the brand, and add the one listed-but-unbuilt P1 item — **(2c) a storefront-optional *manual* intake** (today products only enter via URL-audit, not brand-authored entry).

---

## 1. Problem & current state (grounded)

There are **two catalog representations**, and the merchant portal is wired to the store-gated one:

| | Merchant-portal catalog (this gap) | Commerce-index catalog (already store-less) |
|---|---|---|
| Backing store | Shopify **products cache** (`get_cached_products(..., platform="shopify")`) | **`catalog_products`** (`pdp_scope`/`claim_state`/`content_key`) |
| Entry point | Store **sync** only | URL **audit-seed**, brand claim/attest |
| Read by | `readiness/sources/shopify_live.py` → readiness pipeline → the Catalog-health page | `agent_pdp_view` assembler → agents |
| Source selection | `load_merchant_source_dataset` (`readiness/sources/__init__.py`) → only `synthetic` / `shopify_live`, else `KeyError` | n/a |

So a store-less brand may *already have* `catalog_products` rows (from an audit), yet the **portal shows nothing** — because the portal's readiness pipeline reads the Shopify cache, not `catalog_products`, and there's no way to **author** a product by hand.

The good news (unchanged from first draft, and now confirmed): **identity, enrichment, and evidence are platform-neutral** — `product_enrichment` PK is `(merchant_id, platform, platform_product_id, geo_code)`; the evidence route is `/product/{platform}/{id}/evidence`. No store coupling. The attest path *already* writes `product_enrichment`.

## 2. Why it's essential
The brands that gain most from agent discovery + citation (pre-launch, wholesale-only, marketplace-only, non-Shopify) are exactly the ones the portal locks out today. The index can already represent them; the **merchant-facing management surface** is the missing half.

## 3. The genuine gaps (narrowed)
- **(A) Portal pipeline is store-gated** — `readiness/sources` never reads `catalog_products`, so store-less index entries are invisible in the portal.
- **(B) No manual intake** — the listed P1 "(2c) storefront-optional intake (manual/feed)"; products only arrive via URL-audit-seed.
- **(C) No store-less management UX** — catalog / catalog-health pages assume a synced store (empty/blocked otherwise).

---

## 4. Proposed design (build on what exists)

### 4.1 Reuse `catalog_products` as the store-less registry — do **not** add a new table
Brand-authored products are `catalog_products` rows with a brand-authored provenance (`platform` value TBD — align with the audit-seed convention; `pdp_scope='unverified'`, `claim_state` per lifecycle). This keeps one identity/`content_key` and inherits the existing serving gates (un-served until graduated/claimed).

### 4.2 Manual intake — the one new write primitive (P1-2c)
`POST/PUT/DELETE /merchant/products` (merchant-scoped): create/edit a brand-authored `catalog_products` row + its content via the **existing** `product_enrichment` upsert (`db.product_enrichment.upsert_enrichment`) and the attest/claim_state machinery. MVP = manual single-product; Phase 2 = CSV/feed/URL import. This is the brand-authored sibling of audit-seed.

### 4.3 Portal readiness source for store-less merchants
Add a `readiness/sources` loader backed by `catalog_products` (brand-authored rows for the merchant) returning the existing `MerchantSourceDataset` contract: `merchant_connection={}`, `source_of_truth.catalog="pivota_brand_catalog.v1"`, diagnostics from `created_at/updated_at`. Route store-less merchants (no `merchant_stores` row, have brand-authored products) here instead of `KeyError`.

### 4.4 Scoring adaptation (`readiness/scoring.py`)
Commerce families (price/inventory/checkout_capability/order_status) → **N/A** for brand-authored; content/discovery families + substantiation drive the score. Net: a *content readiness* + citation-eligibility verdict, never a "checkout blocked" nag.

### 4.5 Reuse downstream (no rebuild)
Enrichment (already the attest target), evidence panel, the product queue, the tabbed workspace, and the Catalog-health page all key off `(platform, product_id)` + the readiness payload → they light up unchanged once the source feeds them.

---

## 5. Work
**Backend:** (1) `readiness/sources` loader over `catalog_products` + register in `load_merchant_source_dataset`; (2) `POST/PUT/DELETE /merchant/products` manual intake writing `catalog_products` + `product_enrichment` (reuse claim_state/attest); (3) `brand_authored` scoring mode (commerce N/A).
**Frontend:** (1) **"Add product"** authoring surface → the new intake; (2) store-less empty state ("Add your first product" instead of "connect a store"); (3) reuse queue/workspace/enrichment/evidence as-is; (4) un-gate catalog management from store connection in nav/onboarding.

## 6. Phasing
- **MVP** — manual create + content/evidence + content-readiness for store-less merchants, reading `catalog_products`.
- **Phase 2** — CSV/feed/URL import; dedup vs the canonical index on `content_key`.
- **Phase 3** — "upgrade to checkout" when a store/PSP connects (identity merge brand-authored ↔ synced).

## 7. Open decisions
- **Platform value** for brand-authored rows — reuse `url_audit`-style convention or a new `pivota`/`brand` value (load-bearing in keys/exports; pick once).
- **One pipeline or two** — does the portal get a *new source* over `catalog_products` (§4.3), or do we converge the portal onto the index read path the assembler uses? (Bigger, but removes the two-representation split.)
- **Hybrid merchants** (store + brand-authored) — precedence + dedup on `content_key`.
- **Claim/attest reuse** — is manual intake just the existing attest endpoint with a create step, or a distinct merchant-authored entry? (Avoid a parallel write path to `product_enrichment`.)
- **Alpha gating** — `load_merchant_source_dataset` is currently gated to one alpha merchant; store-less onboarding implies opening readiness to general merchants.

> Cross-ref: `commerce-index-storeless-brand-decision-layer` memory (P1 remaining item **2c**), and the merchant-policy-setup spec (sibling "no surface yet" gap).
