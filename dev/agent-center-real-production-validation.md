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
  "expected_pivota_pdp_url": "https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90",
  "competitor_brands": ["Beauty of Joseon", "COSRX", "Laneige", "Anua"]
}
```

Expected URLs are for evaluation only. Organic discovery prompts must not inject merchant PDP, Pivota PDP, or exact buying-path context. Search-grounded prompts may include product name and brand, but must not use expected URLs as source context.

Optional Pivota fields:

```json
{
  "pivota_product_entity_id": "pe_isntree_watery_sun_gel",
  "pivota_pdp_url": "https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90",
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

- `found`: the exact expected merchant or Pivota PDP URL was returned by model
  output or grounding metadata.
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
- Pivota PDP audit findings: public `agent.pivota.cc/products/{object_id}` URL,
  indexability, Product/Offer schema, verified merchant source reference, offer
  source URL, product intelligence, and similar/substitute highlights.
- Wrong URL evidence summary when Gemini returns another buying path.
- Merchant-owned fixes, Pivota-owned fixes, shared fixes, and a
  Search-Grounded Product Discovery retest plan.

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
