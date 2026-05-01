# Agent Center Real Production Validation

Last updated: 2026-05-01

## Purpose

Production Validation Runs provide an internal-only harness for validating the full Agent Center pre-payment workflow against real merchant and Pivota inputs.

This is different from internal demo fixtures:

- demo fixtures validate controlled expected cases
- production validation runs validate real product, store, PDP, offer, and checkout metadata supplied by an internal operator

The harness is intended for production smoke and product-quality validation before exposing a merchant-facing workflow.

## Internal-Only Restriction

Routes:

```text
POST   /api/internal/agent-center/production-validation-runs
GET    /api/internal/agent-center/production-validation-runs/:id
POST   /api/internal/agent-center/production-validation-runs/:id/run
DELETE /api/internal/agent-center/production-validation-runs/:id
```

These routes are not linked from merchant UI. They are rewritten to the shared Agent Center handler so create, run, fetch, and cleanup operate against the same server-side Agent Center state.

## Env Flag And Auth

Required enablement flag:

```text
ENABLE_INTERNAL_PRODUCTION_VALIDATION=true
```

If the flag is missing or not `true`, routes return HTTP 403.

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

## Known Limitations

- The harness is backed by current in-memory Agent Center state in the deployed serverless environment.
- Validation runs should be short-lived and cleaned up with `DELETE`.
- Demand Test execution uses the current Gemini baseline only.
- The default run scope is intentionally small for production safety: one purchase-ready query cluster, one prompt template, and one repetition unless explicitly overridden.
- A passed checkout readiness result means pre-payment path readiness only.
- No real payment, order, settlement, refund, transaction fee, or billing operation is executed.

## Validation Commands

Run before shipping changes to this harness:

```bash
npm run test:agent-center
npm run lint
npm run build
```
