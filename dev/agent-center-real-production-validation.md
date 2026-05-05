# Agent Center Real Production Validation

Last updated: 2026-05-01

## Purpose

Production Validation Runs provide an internal-only harness for validating the full Agent Center discovery and pre-payment workflow against real merchant and Pivota inputs.

This is different from internal demo fixtures:

- demo fixtures validate controlled expected cases
- production validation runs validate real product, store, PDP, offer, checkout, and discovery-evaluation metadata supplied by an internal operator

The harness is intended for production smoke and product-quality validation before exposing a merchant-facing workflow.

## Internal-Only Restriction

Routes:

```text
POST   /api/internal/agent-center/production-validation-runs
GET    /api/internal/agent-center/production-validation-runs/:id
POST   /api/internal/agent-center/production-validation-runs/:id/run
DELETE /api/internal/agent-center/production-validation-runs/:id
GET    /api/internal/agent-center/runtime-config
POST   /api/internal/agent-center/product-entity-index/sync
POST   /api/internal/agent-center/product-entity-index/verify-content
POST   /api/internal/agent-center/product-entity-index/audit
POST   /api/internal/agent-center/product-entity-index/gemini-rerun
POST   /api/internal/agent-center/product-entity-index/run-batch
GET    /api/internal/agent-center/product-entity-index/summary
GET    /api/internal/agent-center/product-entity-index/batch-runs
```

These routes are not linked from merchant UI. They are rewritten to the shared Agent Center handler so create, run, fetch, and cleanup operate against the same server-side Agent Center state.

## Env Flag And Auth

Required enablement flag:

```text
ENABLE_INTERNAL_PRODUCTION_VALIDATION=true
```

If the flag is missing or not `true`, routes return HTTP 403.

Optional Gemini Search Grounding flag:

```text
GEMINI_SEARCH_GROUNDING_ENABLED=true
```

This flag applies only to `search_grounded_product_discovery_test`. It adds the
Gemini Google Search grounding tool for that mode only. Organic discovery,
buying-path discovery, contextual attribution, Product Understanding, Offer
Execution, Checkout Verification, retest, and other modes remain ungrounded.

Required internal secret, in priority order:

```text
PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET
PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET
INTERNAL_DEMO_FIXTURE_TOKEN
PIVOTA_INTERNAL_API_SECRET
```

Send the secret with:

```text
Authorization: Bearer {secret}
```

or:

```text
x-pivota-internal-secret: {secret}
x-internal-production-validation-token: {secret}
```

Runtime config status:

```bash
curl "$BASE_URL/api/internal/agent-center/runtime-config" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET"
```

The response returns safe status only, such as state backend,
`gemini_search_grounding_enabled`, provider configured, production validation
enabled, and demo fixtures enabled. It must not return API keys, DB URLs,
internal secrets, provider credentials, or token-level costs.

## ProductEntity Index Registry

Real production validation should not assume that a Pivota PDP is discoverable
just because contextual attribution passed. Pivota PDP exposure depends on a
separate ProductEntity indexing pipeline:

1. Sync ProductEntity candidates from the configured ProductEntity source.
   Gateway `get_discovery_feed` is the default for smoke tests. Full backlog
   runs should use `gateway_product_entity_index_feed`, backed by the agent
   gateway `get_product_entity_index_feed` operation, so Agent Center can
   enumerate approved external-seed to ProductEntity mappings without direct
   backend DB credentials. Direct `backend_external_seeds` is an internal
   read-only fallback when explicitly approved.
2. Deduplicate by canonical `sellable_item_group_id` / `product_group_id`
   (`sig_*`).
3. Verify real main-path PDP content through `get_pdp_v2` using ProductEntity ID
   first and source alias second.
4. Audit the production public PDP with Googlebot-style checks.
5. Mark only passing records `sitemap_eligible=true`.
6. Publish canonical `sig_*` URLs through `sitemap-products.xml` and
   `/products/indexability`.
7. Record Search Console evidence and timed reruns.
8. Measure Gemini exposure with a scoped
   `search_grounded_product_discovery_test` runner.

`ext_*` IDs remain source aliases. They must not become canonical sitemap URLs
unless explicitly promoted to ProductEntity IDs.

Registry summary:

```bash
curl "$BASE_URL/api/internal/agent-center/product-entity-index/summary" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET"
```

Sync and audit:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/product-entity-index/sync" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{"limit":250,"page_size":100,"max_pages":10,"verify_content":true}'

curl -X POST "$BASE_URL/api/internal/agent-center/product-entity-index/audit" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{"limit":50}'
```

Scoped Gemini measurement:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/product-entity-index/gemini-rerun" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{"product_entity_ids":["sig_7ad40676c42fb9c96e2a8136"],"limit":1}'
```

This runner is intentionally scoped to `search_grounded_product_discovery_test`.
It must not run organic discovery, contextual attribution, Product
Understanding, Offer Execution, or Checkout Verification.

## Input Schema

Minimum payload:

```json
{
  "environment": "production-validation",
  "merchant_name": "Isntree Official",
  "store_url": "https://example.com",
  "merchant_pdp_url": "https://example.com/products/hyaluronic-acid-watery-sun-gel",
  "product_name": "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
  "brand": "Isntree",
  "sku_name": "isntree_watery_sun_gel_50ml",
  "category": "skincare sunscreen",
  "market": "US",
  "language": "en",
  "currency": "USD"
}
```

Discovery evaluation inputs:

```json
{
  "merchant_domain": "isntree.com",
  "expected_merchant_pdp_url": "https://www.isntree.com/products/hyaluronic-acid-watery-sun-gel",
  "expected_pivota_pdp_url": "https://agent.pivota.cc/products/pe_isntree_watery_sun_gel",
  "competitor_brands": ["Beauty of Joseon", "COSRX", "Laneige", "Anua"]
}
```

Expected URLs are for evaluation only. Organic discovery prompts must not inject merchant PDP, Pivota PDP, or exact buying-path context. Search-grounded prompts may include product name and brand, but must not use expected URLs as source context.

Optional Pivota fields:

```json
{
  "pivota_product_entity_id": "pe_isntree_watery_sun_gel",
  "canonical_product_slug": "pe_isntree_watery_sun_gel",
  "canonical_pivota_pdp_url": "https://agent.pivota.cc/products/pe_isntree_watery_sun_gel",
  "external_seed_id": "ext_d7c74bcb380cbc2bdd5d5d90",
  "pivota_pdp_url": "https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90",
  "merchant_offer_id": "merchant_offer_isntree_direct_50ml",
  "pivota_offer_id": "offer_isntree_direct_50ml"
}
```

Optional product attributes:

```json
{
  "merchant_product_attributes": {
    "spf_level": "SPF50+",
    "pa_rating": "PA++++",
    "skin_type": "all skin types",
    "finish": "watery lightweight gel",
    "active_ingredients": "hyaluronic acid and UV filters",
    "purchase_path": true
  },
  "pivota_product_attributes": {
    "spf_level": "SPF50+",
    "pa_rating": "PA++++",
    "skin_type": "all skin types",
    "finish": "watery lightweight gel",
    "active_ingredients": "hyaluronic acid and UV filters",
    "purchase_path": true,
    "agent_summary": "Daily hydrating sunscreen with watery gel finish."
  }
}
```

Optional offer inputs:

```json
{
  "merchant_offer_input": {
    "price": 18.99,
    "currency": "USD",
    "promo_price": null,
    "coupon_code": null,
    "coupon_status": "none",
    "inventory_status": "in_stock",
    "inventory_quantity": 24
  },
  "pivota_offer_input": {
    "price": 18.99,
    "currency": "USD",
    "promo_price": null,
    "coupon_code": null,
    "coupon_status": "none",
    "inventory_status": "in_stock",
    "execution_status": "ready",
    "attached_to_pivota_pdp": true
  }
}
```

Optional checkout inputs:

```json
{
  "merchant_checkout_input": {
    "checkout_url": "https://checkout.example.com/checkout",
    "cart_url": "https://checkout.example.com/cart",
    "checkout_domain": "checkout.example.com",
    "required_params": ["variant", "quantity", "discount"],
    "variant_param_name": "variant",
    "quantity_param_name": "quantity",
    "coupon_param_name": "discount"
  },
  "pivota_checkout_input": {
    "checkout_url": "https://checkout.example.com/checkout",
    "checkout_domain": "checkout.example.com",
    "required_params": ["variant", "quantity", "discount"],
    "cart_handoff_payload": {
      "variant": "isntree_watery_sun_gel_50ml",
      "quantity": 1,
      "discount": "SUN10"
    },
    "variant_id": "isntree_watery_sun_gel_50ml",
    "quantity": 1,
    "coupon_code": "SUN10",
    "attached_to_pivota_offer": true
  }
}
```

## Workflow

When `POST /api/internal/agent-center/production-validation-runs/:id/run` is called, the harness:

1. Preflights the merchant PDP URL.
2. Preflights the Pivota PDP URL when provided.
3. Preflights the checkout URL when checkout metadata is provided.
4. Creates an internal validation merchant store and scan target from the real inputs.
5. Runs Demand Test Agent modes:
   - `organic_product_discovery_test`
   - `search_grounded_product_discovery_test` when `GEMINI_SEARCH_GROUNDING_ENABLED=true`; otherwise this mode is marked `not_configured`
   - `buying_path_discovery_test`
   - `open_product_visibility_test`
   - `merchant_store_attribution_test`
   - `pivota_pdp_attribution_test` when `pivota_pdp_url` is provided
6. Runs Product Understanding diagnosis for generated or validation-anchor issues.
7. Runs Offer Execution diagnosis when offer inputs are provided.
8. Runs Checkout Verification diagnosis when checkout inputs are provided.
9. Generates a `GMVAssuranceSnapshot`.
10. Returns a `validation_report`.

The validation report includes:

- target summary
- URL preflight results
- discovery readiness summary
- demand test summary
- product understanding summary
- offer execution summary
- checkout verification summary
- GMV assurance snapshot
- top blockers
- next best action
- usage summary

All usage must remain `preview_only` / `not_invoiced`.

## What It Proves

A production validation run can prove:

- real merchant PDP URL preflight status
- real Pivota PDP URL preflight status when provided
- real checkout URL preflight status when provided
- organic product/brand discovery when tested
- merchant PDP discovery in search-grounded discovery tests
- Pivota PDP discovery in search-grounded or buying-path discovery tests
- buying-path discovery from returned URLs and offer signals
- product/entity visibility from Demand Test Agent
- merchant store attribution from Merchant Store Attribution Test
- verified Pivota attribution from Pivota PDP Attribution Test
- product data readiness from Product Understanding + SKU Match Agent
- offer consistency from Offer Execution Agent
- checkout path readiness from Checkout Verification Agent
- full pre-payment readiness from Agentic GMV Assurance Overview

## What It Does Not Prove

Production Validation Runs do not prove:

- PSP authorization
- payment token creation
- real payment success
- order placement
- order write-back
- refund
- fulfillment
- settlement
- transaction fees
- final GMV attribution
- real billing

The harness does not perform consumer UI scraping and does not execute checkout/payment/order logic.

Contextual attribution passed should not be described as natural discovery. Use "Merchant PDP was returned in contextual attribution test" for attribution modes and "Merchant PDP was discovered in search-grounded discovery test" only for discovery modes.

Search-grounded discovery uses Gemini with Google Search grounding to evaluate
model-returned URLs and `groundingMetadata` sources. It does not inject expected
merchant/Pivota PDP URLs as prompt context and it does not prove consumer Gemini
UI or AI Mode ranking.

Interpret search-grounded results as:

- `found`: the exact expected merchant PDP URL, canonical Pivota ProductEntity
  PDP URL, or a Pivota alias URL that resolves/canonicalizes to the expected
  ProductEntity was returned by model output or grounding metadata.
- `not_found`: grounding ran and produced a numeric score of `0`; the exact
  expected PDP URL was not returned.
- `not_tested`: the search-grounded mode did not run.
- `not_configured`: grounding was not enabled or unavailable; this is not a
  contextual attribution failure.

Numeric `0` means tested and not found. It must not be reported as
`not_tested`. `not_configured` means the mode could not run because the
grounding flag/provider config was unavailable.

When a run generates `merchant_pdp_not_discovered`,
`pivota_pdp_not_discovered`, or `wrong_buying_path_returned`, the merchant-facing
report should include a Discoverability Fix Plan:

- Merchant PDP audit findings: indexability, canonical URL, Product schema,
  Offer schema, price/availability/seller signals, sitemap inclusion, and PDP
  copy.
- Pivota PDP audit findings: public
  `agent.pivota.cc/products/{canonical_product_slug}` or
  `agent.pivota.cc/products/{product_entity_id}` URL, indexability,
  Product/Offer schema, verified merchant source reference, merchant offers,
  offer source URL, product intelligence, and similar/substitute highlights.
- Wrong URL evidence summary when Gemini returns another buying path.
- Merchant-owned fixes, Pivota-owned fixes, shared fixes, and a
  Search-Grounded Product Discovery retest plan.

Pivota PDPs are ProductEntity-first. `/products/ext_*` paths are external
seed/source aliases unless explicitly promoted to ProductEntity IDs. They should
redirect to the canonical ProductEntity URL, render a canonical tag pointing to
it, or be marked as aliases. JSON-LD should use the canonical ProductEntity URL,
while source references should keep external seed IDs and merchant PDP URLs
separate.

If Gemini returns `webSearchQueries` but no `groundingChunks`, keep the search
queries in internal/debug evidence and score URL discovery only from actual
returned URLs.

Merchant-facing reports should show concrete normalized discovery evidence:

- tested organic queries
- returned products and brands
- returned competitors
- competitor rank summary
- missing merchant product/brand summary
- likely competitor advantage
- merchant-owned, Pivota-owned, and shared discovery fixes

## Sample Isntree Validation Payload

```json
{
  "environment": "production-validation",
  "merchant_name": "Isntree Official",
  "store_url": "https://www.isntree.com",
  "merchant_pdp_url": "https://www.isntree.com/products/hyaluronic-acid-watery-sun-gel",
  "product_name": "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
  "brand": "Isntree",
  "sku_name": "isntree_watery_sun_gel_50ml",
  "category": "skincare sunscreen",
  "market": "US",
  "language": "en",
  "currency": "USD",
  "pivota_product_entity_id": "pe_isntree_watery_sun_gel",
  "pivota_pdp_url": "https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90?return=%2Fproducts%2Fext_0281be2868f91dcf200fa248%3Freturn%3D%252F",
  "pivota_offer_id": "offer_isntree_direct_50ml",
  "merchant_product_attributes": {
    "spf_level": "SPF50+",
    "pa_rating": "PA++++",
    "skin_type": "all skin types",
    "finish": "watery lightweight gel",
    "active_ingredients": "hyaluronic acid and UV filters",
    "purchase_path": true
  },
  "pivota_product_attributes": {
    "spf_level": "SPF50+",
    "pa_rating": "PA++++",
    "skin_type": "all skin types",
    "finish": "watery lightweight gel",
    "active_ingredients": "hyaluronic acid and UV filters",
    "purchase_path": true,
    "agent_summary": "Daily hydrating sunscreen with watery gel finish."
  },
  "merchant_offer_input": {
    "price": 18.99,
    "currency": "USD",
    "coupon_status": "none",
    "inventory_status": "in_stock",
    "inventory_quantity": 24
  },
  "pivota_offer_input": {
    "price": 18.99,
    "currency": "USD",
    "coupon_status": "none",
    "inventory_status": "in_stock",
    "execution_status": "ready",
    "attached_to_pivota_pdp": true
  },
  "merchant_checkout_input": {
    "checkout_url": "https://checkout.example.com/checkout",
    "checkout_domain": "checkout.example.com",
    "required_params": ["variant", "quantity"],
    "variant_param_name": "variant",
    "quantity_param_name": "quantity"
  },
  "pivota_checkout_input": {
    "checkout_url": "https://checkout.example.com/checkout",
    "checkout_domain": "checkout.example.com",
    "required_params": ["variant", "quantity"],
    "cart_handoff_payload": {
      "variant": "isntree_watery_sun_gel_50ml",
      "quantity": 1
    },
    "variant_id": "isntree_watery_sun_gel_50ml",
    "quantity": 1,
    "attached_to_pivota_offer": true
  }
}
```

Example create/run/delete flow:

```bash
BASE_URL="https://pivota-merchants-portal-clean.vercel.app"

curl -X POST "$BASE_URL/api/internal/agent-center/production-validation-runs" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data @isntree-production-validation.json

curl -X POST "$BASE_URL/api/internal/agent-center/production-validation-runs/$RUN_ID/run" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET"

curl "$BASE_URL/api/internal/agent-center/production-validation-runs/$RUN_ID" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET"

curl -X DELETE "$BASE_URL/api/internal/agent-center/production-validation-runs/$RUN_ID" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET"
```

Issue-scoped Pivota-owned optimization flow:

```bash
curl -X POST "$BASE_URL/api/agent-center/issues/$ISSUE_ID/pivota-optimization-patch" \
  -H "content-type: application/json"

curl -X POST "$BASE_URL/api/agent-center/issues/$ISSUE_ID/apply-pivota-optimization" \
  -H "content-type: application/json"

curl -X POST "$BASE_URL/api/agent-center/issues/$ISSUE_ID/rerun-after-pivota-optimization" \
  -H "content-type: application/json"
```

The optimization endpoints only apply Pivota-owned patch types:

- Pivota PDP discovery signals
- Pivota source references
- Pivota product intelligence
- Pivota Product / Offer schema payloads
- Pivota sitemap submission instructions
- Pivota query-cluster mappings
- Pivota competitor/substitute graph mappings

They do not write to merchant production systems. Merchant-owned actions remain approval-required and must be handled outside this V1 endpoint.

After applying a Pivota-owned patch, rerun the relevant validation mode and regenerate the merchant-facing report. The report may show readiness changes, but it must not claim discoverability uplift unless the rerun score actually improves.

For production smoke in the current serverless in-memory baseline, prefer cleanup in the same run invocation:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/production-validation-runs/$RUN_ID/run" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{"cleanup_after_run":true}'
```

This returns the completed validation run plus a `cleanup` object with `status = deleted`. It avoids relying on a later request landing on the same warm serverless instance.

## Known Limitations

- The harness is backed by current in-memory Agent Center state in the deployed serverless environment.
- Validation runs should be short-lived and cleaned up with `DELETE`.
- In production serverless smoke, `cleanup_after_run = true` is recommended because later `GET` or `DELETE` requests can land on a different instance until a persistent validation store is added.
- Demand Test execution uses the current Gemini baseline only.
- Search-grounded discovery requires `GEMINI_SEARCH_GROUNDING_ENABLED=true`. If unavailable, the score is `not_configured` and must not fall back to contextual attribution.
- Search grounding applies only to `search_grounded_product_discovery_test`; all other Agent Center modes remain ungrounded.
- Pivota-owned optimization can update Pivota Agent Center/PDP/product graph state, but public search-grounded discovery may still require external indexing time before Gemini returns the Pivota PDP.
- Search Console evidence is operational evidence only. Property verification,
  sitemap submission, URL Inspection, and request indexing should be recorded on
  `PivotaIndexingTask`, but none of these fields prove uplift by themselves.
- Merchant-facing reports may show Pivota Discovery Progress, but must hide
  internal task IDs, raw Gemini payloads, prompt traces, token-level costs, DB
  URLs, secrets, and Search Console screenshots.
- Timed reruns should stay scoped to `search_grounded_product_discovery_test`
  at T+24h, T+72h, and T+7d. Do not use contextual attribution results as
  discovery uplift.
- The default run scope is intentionally small for production safety: one purchase-ready query cluster, one prompt template, and one repetition unless explicitly overridden.
- A passed checkout readiness result means pre-payment path readiness only.
- No real payment, order, settlement, refund, transaction fee, or billing operation is executed.

## Validation Commands

Run before shipping changes to this harness:

```bash
npm run test:agent-center
npm run lint
npm run build
git diff --check
```

## ProductEntity Provisioning Before Real Validation

Real production validation must use a correctly bound canonical Pivota ProductEntity PDP. For a new pilot SKU, first run the internal Pilot ProductEntity Provisioning flow:

```bash
BASE_URL="https://pivota-merchants-portal-clean.vercel.app"

curl -X POST "$BASE_URL/api/internal/agent-center/pilot-product-entities" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "merchant_id": "merchant_isntree",
    "merchant_name": "Isntree Official",
    "store_url": "https://www.isntree.com",
    "merchant_pdp_url": "https://www.isntree.com/products/hyaluronic-acid-watery-sun-gel",
    "product_name": "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
    "brand": "Isntree",
    "sku_name": "50ml",
    "category": "Skincare > Sunscreen",
    "market": "US",
    "language": "en",
    "currency": "USD"
  }'
```

Then publish/audit the returned run. Only pass `canonical_pivota_pdp_url` into a production validation payload after the audit passes. If the audit fails, skip Pivota PDP attribution/discovery or mark the Pivota path `not_ready`; do not substitute a public but unrelated `ext_*` URL.
