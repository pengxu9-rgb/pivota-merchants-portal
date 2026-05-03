# Agent Center Merchant Pilot Kit

Last updated: 2026-05-01

## Purpose

This pilot kit helps Pivota run controlled merchant pilots using the DB-backed Agent Center V1 workflow.

The kit is for Pivota operators. It describes how to collect merchant inputs, run internal production validation, review Agentic GMV Assurance results, create resolution plans, and share a curated merchant-facing report.

Internal production validation routes must not be exposed directly to merchants.

## Pilot Positioning

Agent Center V1 verifies pre-payment agentic GMV readiness.

It checks whether AI demand can move from discovery to product awareness to a ready pre-payment buying path by validating:

- organic / search-grounded / buying-path discoverability
- product visibility
- merchant attribution
- verified Pivota attribution
- product/SKU readiness
- offer readiness
- checkout path readiness
- issue resolution plan

Agent Center pilots validate dual-path readiness:

- Merchant-owned path: merchant PDP / store / checkout path
- Pivota agent-facing path: Pivota unified PDP / product object / offer / checkout handoff

Pivota PDP does not replace the merchant PDP. The merchant PDP remains the source-layer buying path and source of truth; the Pivota PDP is an agent-facing execution layer on top of that merchant-owned source layer.

Agent Center pilots should report discovery and readiness separately:

- Discoverability: can users or agents naturally find the product, merchant PDP, or Pivota PDP?
- Readiness: if found, can the product, offer, and checkout path support pre-payment execution?
- Transaction: not tested in V1.

The positioning for pilots is:

```text
Pivota does not only test whether an LLM mentions a merchant's product. Agent Center V1 tests whether that demand can be attributed to the merchant or Pivota path, whether the product and SKU are understood, and whether offer and checkout path readiness pass before payment.
```

## Pilot Prerequisites

Before running a merchant pilot:

- Agent Center DB backend is enabled with `AGENT_CENTER_STATE_BACKEND=db`.
- A restricted DB role is configured for `AGENT_CENTER_DATABASE_URL`.
- The restricted role is scoped to the `agent_center` schema.
- Internal production validation is enabled for Pivota operators with `ENABLE_INTERNAL_PRODUCTION_VALIDATION=true`.
- Gemini Search Grounding is enabled only when the operator sets `GEMINI_SEARCH_GROUNDING_ENABLED=true`.
- Internal routes require an internal secret.
- The merchant has approved the test scope.
- Test products, PDP URLs, offer metadata, and checkout metadata are approved for validation.
- Usage remains `preview_only` / `not_invoiced`.

Do not use broad backend DB credentials for merchant pilots.

## Merchant Input Checklist

Required inputs:

- merchant name
- store URL
- merchant PDP URL
- product name
- brand
- SKU / variant name
- category
- market / language / currency

Merchant PDP is always required because it is the source-layer buying path and attribution target.

Conditionally required input:

- Pivota PDP URL, when running Pivota PDP Attribution Test

Recommended inputs:

- merchant product attributes
- Pivota ProductEntity ID
- Pivota PDP URL, when Pivota PDP Attribution Test is not in scope
- merchant domain for discovery evaluation
- expected merchant/Pivota PDP URLs for discovery evaluation only, not prompt context
- merchant offer metadata
- Pivota offer metadata
- checkout path metadata if available

Useful product attributes for beauty and skincare pilots:

- product family
- size / pack size
- variant
- skin type
- finish / texture
- active ingredients
- claims
- SPF / PA rating where applicable
- price and currency
- inventory status
- coupon or promo state

## Pilot Intake JSON Template

Use this payload with:

```text
POST /api/internal/agent-center/production-validation-runs
```

```json
{
  "environment": "merchant-pilot",
  "merchant_name": "Example Merchant",
  "store_url": "https://merchant.example.com",
  "merchant_pdp_url": "https://merchant.example.com/products/example-product",
  "product_name": "Example Brand Daily Sunscreen SPF50+ PA++++ 50ml",
  "brand": "Example Brand",
  "sku_name": "Example Brand Daily Sunscreen SPF50+ PA++++ 50ml",
  "category": "skincare sunscreen",
  "market": "US",
  "language": "en",
  "currency": "USD",
  "pivota_product_entity_id": "pe_example_daily_sunscreen",
  "pivota_pdp_url": "https://agent.pivota.cc/products/ext_example_product",
  "pivota_offer_id": "offer_example_merchant_50ml",
  "merchant_product_attributes": {
    "spf_level": "SPF50+",
    "pa_rating": "PA++++",
    "skin_type": "all skin types",
    "finish": "lightweight natural finish",
    "active_ingredients": "UV filters and hydrating ingredients",
    "purchase_path": true
  },
  "pivota_product_attributes": {
    "spf_level": "SPF50+",
    "pa_rating": "PA++++",
    "skin_type": "all skin types",
    "finish": "lightweight natural finish",
    "active_ingredients": "UV filters and hydrating ingredients",
    "purchase_path": true,
    "agent_summary": "Daily sunscreen with lightweight finish."
  },
  "merchant_offer_input": {
    "price": 18.99,
    "currency": "USD",
    "promo_price": null,
    "coupon_code": null,
    "coupon_status": "none",
    "inventory_status": "in_stock",
    "inventory_quantity": 24,
    "source_url": "https://merchant.example.com/products/example-product"
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
  },
  "merchant_checkout_input": {
    "checkout_url": "https://merchant.example.com/checkout",
    "cart_url": "https://merchant.example.com/cart",
    "checkout_domain": "merchant.example.com",
    "required_params": ["variant", "quantity", "discount"],
    "variant_param_name": "variant",
    "quantity_param_name": "quantity",
    "coupon_param_name": "discount"
  },
  "pivota_checkout_input": {
    "checkout_url": "https://merchant.example.com/checkout",
    "checkout_domain": "merchant.example.com",
    "required_params": ["variant", "quantity", "discount"],
    "cart_handoff_payload": {
      "variant": "example_daily_sunscreen_50ml",
      "quantity": 1,
      "discount": "SUN10"
    },
    "variant_id": "example_daily_sunscreen_50ml",
    "quantity": 1,
    "coupon_code": "SUN10",
    "attached_to_pivota_offer": true
  },
  "competitor_brands": ["Beauty of Joseon", "COSRX", "Laneige", "Anua"],
  "repetitions": 1
}
```

Remove optional blocks when the merchant has not approved or provided that data.

## Pilot Workflow

1. Collect merchant inputs.
2. Confirm merchant approval for the test scope.
3. Run Organic Product Discovery Test without merchant/Pivota URL context.
4. Run Search-Grounded Product Discovery Test when `GEMINI_SEARCH_GROUNDING_ENABLED=true`.
5. Run Buying Path Discovery Test and evaluate returned URLs.
6. Validate merchant PDP preflight.
7. Validate merchant store attribution.
8. Validate Pivota PDP preflight when a Pivota PDP URL is provided.
9. Validate Pivota PDP attribution when a Pivota PDP URL is provided.
10. Compare the merchant-owned path against the Pivota agent-facing path.
11. Run checkout URL preflight where checkout metadata is available.
12. Create a production validation run through the internal route.
13. Run production validation.
14. Review the generated `GMVAssuranceSnapshot`.
15. Review generated issues and top blockers.
16. Review Product Understanding, Offer Execution, and Checkout Verification diagnoses when available.
17. Create resolution plans for pilot blockers.
18. Review owner, approval requirement, patch preview, and retest plan.
19. Share a curated merchant-facing report.
20. Apply state-only patches or approved patches where applicable.
21. Retest using the relevant agent or scan mode.
22. Record before/after result and pilot learning.

Resolution actions in V1 are state transitions unless an action is explicitly wired to an approved write-back path. Do not write to merchant production systems from the pilot workflow.

## Success Criteria

Readiness levels:

- `ready_for_agentic_checkout`: all relevant pre-payment checks pass and no high-severity blockers remain.
- `needs_work`: demand exists or the chain is partially ready, but at least one fixable blocker remains.
- `blocked`: a critical early-stage requirement is missing, such as low product visibility or unavailable core path data.
- `monitoring`: no immediate blocker needs action, but the product should continue to be watched through periodic validation.

Success examples:

- product visibility is proven
- merchant attribution or verified Pivota attribution is proven for the tested channel
- product/SKU readiness passes
- offer readiness passes
- checkout path readiness passes
- no high-severity blockers remain
- usage remains `preview_only` / `not_invoiced`

## Failure / Blocker Examples

Common pilot blockers:

- `organic_product_not_discovered`
- `organic_brand_not_discovered`
- `competitor_dominance`
- `merchant_pdp_not_discovered`
- `pivota_pdp_not_discovered`
- `wrong_buying_path_returned`
- `buying_path_missing`
- `offer_not_discovered`
- `search_grounding_not_configured`
- `merchant_store_attribution_gap`
- `pivota_pdp_attribution_gap`
- `unverified_pivota_attribution`
- `missing_attribute`
- `pivota_pdp_readiness_gap`
- `price_mismatch`
- `expired_coupon`
- `coupon_param_missing`
- `checkout_url_unreachable`

Operator interpretation:

- `merchant_pdp_not_discovered`: search-grounded discovery did not return the expected merchant PDP URL from model output or Gemini grounding sources.
- `pivota_pdp_not_discovered`: search-grounded or buying-path discovery did not return the expected Pivota PDP URL from model output or grounding sources.
- `search_grounding_not_configured`: `GEMINI_SEARCH_GROUNDING_ENABLED` is not set to `true`, so search-grounded discovery is `not_configured`, not a failed attribution test.
- `merchant_store_attribution_gap`: the product may be visible, but the model did not return the merchant store or merchant PDP as the buying path.
- `pivota_pdp_attribution_gap`: the product may be visible, but verified Pivota channel attribution was not proven.
- `missing_attribute`: merchant PDP/catalog and/or Pivota PDP is missing important product attributes.
- `pivota_pdp_readiness_gap`: merchant source may be complete, but normalized Pivota PDP data is incomplete.
- `price_mismatch`: merchant offer source and Pivota offer state disagree on price.
- `expired_coupon`: coupon or promo state is stale or expired in one layer.
- `coupon_param_missing`: checkout handoff is missing coupon passthrough.
- `checkout_url_unreachable`: checkout path preflight failed.

## Discovery Interpretation

Organic discovery failure means the product did not naturally appear in
no-context category or intent prompts. It should not be softened into a
readiness pass just because contextual attribution passed later.

Competitor dominance means competitor brands/products appeared while the tested
merchant product or brand was absent. Merchant-facing reports should include
normalized examples:

- query tested
- top returned competitor brands/products
- whether the merchant product appeared
- whether the merchant brand appeared
- likely reason competitors dominated

Search-grounded discovery has three distinct states:

- Found: Gemini with Google Search grounding returned the exact expected PDP URL
  from model output or `groundingMetadata`.
- Not found: grounding ran, but the expected merchant/Pivota PDP URL was not
  returned.
- Not configured: `GEMINI_SEARCH_GROUNDING_ENABLED=true` was not active or the
  adapter could not use grounding. This is not a failed discovery result.

Use this phrasing:

- "Contextual attribution passed" means the path was returned when product/PDP
  context was provided.
- "Organic discovery passed" means the product/brand appeared without injected
  merchant or Pivota URL context.
- "Search-grounded discovery passed" means the exact expected PDP URL was found
  by search-grounded Gemini when the product name was specified.

Do not claim consumer Gemini UI / AI Mode ranking.

## Merchant-Facing Report Template

Use this structure for pilot reporting. Curate the contents before sharing externally.

```text
Executive summary
Pivota tested whether the selected product can move from discoverability to AI demand to a ready pre-payment buying path. The validation checked the merchant-owned source path and the Pivota agent-facing path separately, including discovery, product visibility, attribution, product/SKU readiness, offer readiness, and checkout path readiness. No real payment, order placement, refund, settlement, or billing occurred.

Tested product / store
- Merchant:
- Store URL:
- Product:
- Merchant PDP:
- Pivota PDP:
- SKU / variant:
- Market / language / currency:

Buying Path Readiness
Discoverability:
- Organic product discovery:
- Organic brand discovery:
- Merchant PDP discovery:
- Pivota PDP discovery:
- Buying path discovery:
- Competitor dominance:

Discovery evidence:
- Tested organic queries:
- Returned products:
- Returned competitor brands/products:
- Missing merchant product/brand summary:
- Competitor rank summary:
- Likely competitor advantage:
- Discovery interpretation:

Merchant-owned path:
- Merchant PDP URL:
- Merchant PDP preflight:
- Merchant attribution result:
- Merchant offer source:
- Merchant checkout path:
- Status:

Pivota agent-facing path:
- Pivota PDP URL:
- Pivota PDP preflight:
- Pivota attribution result:
- Pivota offer state:
- Pivota checkout handoff:
- Status:

What passed
- Product visibility:
- Merchant attribution:
- Pivota attribution:
- Product/SKU readiness:
- Offer readiness:
- Checkout path readiness:

What blocked readiness
- Blocker:
- Severity:
- Affected layer:
- Evidence:
- Root cause hypothesis:

Recommended fixes
Merchant-owned fixes:
- Strengthen PDP title with full searchable product name.
- Add category/use-case language.
- Add or verify Product structured data and Offer structured data where applicable.
- Ensure canonical PDP URL is clear.
- Make price, availability, brand, seller identity, and product description machine-readable.
- Add stronger ingredient, claim, and review evidence when available.

Pivota-owned fixes:
- Strengthen Pivota PDP identity.
- Generate stronger product overview from merchant description.
- Populate product intelligence module.
- Add organic query-cluster mappings.
- Add competitor/substitute graph relationships.
- Add merchant PDP as verified source reference.
- Rerun Organic Product Discovery Test.

Shared fixes:
- Identify which competitors dominated which queries.
- Add product differentiation evidence.
- Clarify use cases where the product should win.
- Add comparison/substitute graph relationships.
- Update query-cluster mapping.
- Rerun Organic Product Discovery Test.

Owner / approval required
- Merchant-owned actions:
- Pivota-owned actions:
- Shared actions:
- Human review required:

Retest plan
- Retest mode:
- Query cluster / agent:
- Expected improvement:
- Before score:
- After score:
- Result:

What V1 does not prove
Agent Center V1 does not prove payment authorization, PSP success, card tokenization, order placement, order write-back, refund, settlement, transaction fees, final GMV attribution, or real billing.

Usage preview statement
All pilot usage is preview-only and not invoiced. Merchant-facing usage should be shown as credits and usage, not token-level provider costs.
```

## Automated Report Draft

After an internal production validation run completes, Pivota operators can generate
a merchant-facing report draft from the validated run payload:

```text
POST /api/internal/agent-center/production-validation-runs/:id/report-draft
GET  /api/internal/agent-center/production-validation-runs/:id/report-draft
```

The draft is stored on the `ProductionValidationRun` payload. It does not require a
new DB table for V1. The report separates:

- discoverability vs contextual attribution
- merchant-owned path vs Pivota agent-facing path
- offer readiness vs checkout readiness
- organic discovery, search-grounded discovery, contextual attribution, and readiness
- normalized competitor evidence without raw provider output
- recommended fixes, owner, approval requirement, and retest plan
- usage preview as credits only

The report draft intentionally excludes raw provider payloads, prompt traces,
provider token counts, internal debug payloads, real billing, payment execution,
order placement, and final GMV attribution.

Sharing criteria before external merchant delivery:

- Discovery failures include concrete normalized query and competitor examples.
- Competitor dominance includes dominant competitors and differentiation angles.
- Search-grounded discovery state is explicit: found, not found, or not configured.
- Contextual attribution is not described as natural discovery.
- Checkout readiness is marked not tested when checkout metadata is missing.
- Usage remains `preview_only` / `not_invoiced`.

## Demo Script

Use this language when explaining the pilot:

```text
Pivota does not replace the merchant PDP. The pilot checks whether the merchant-owned path works, and whether Pivota's agent-facing path can provide an additional executable route for AI/agent demand.

We validate both layers separately. The merchant-owned path covers the merchant PDP, store attribution, merchant offer source, and merchant checkout path. The Pivota agent-facing path covers the Pivota unified PDP, product object, offer state, and checkout handoff.

This lets us show whether the product is visible, whether the correct buying path is attributed, and whether the product, offer, and checkout path are ready before payment.
```

## Internal Operator Runbook

Required env flags:

```text
AGENT_CENTER_STATE_BACKEND=db
AGENT_CENTER_DATABASE_URL=<restricted agent_center_app URL>
AGENT_CENTER_DB_SCHEMA=agent_center
AGENT_CENTER_DB_SSL=true
ENABLE_INTERNAL_PRODUCTION_VALIDATION=true
GEMINI_SEARCH_GROUNDING_ENABLED=true # optional; search-grounded discovery only
```

Internal authorization secret priority:

```text
PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET
PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET
INTERNAL_DEMO_FIXTURE_TOKEN
PIVOTA_INTERNAL_API_SECRET
```

Internal production validation endpoints:

```text
POST   /api/internal/agent-center/production-validation-runs
GET    /api/internal/agent-center/production-validation-runs/:id
POST   /api/internal/agent-center/production-validation-runs/:id/run
POST   /api/internal/agent-center/production-validation-runs/:id/report-draft
GET    /api/internal/agent-center/production-validation-runs/:id/report-draft
DELETE /api/internal/agent-center/production-validation-runs/:id
```

Resolution plan endpoints:

```text
GET   /api/agent-center/issues/:id/resolution-plan
POST  /api/agent-center/issues/:id/resolution-plan
PATCH /api/agent-center/issues/:id/resolution-plan
POST  /api/agent-center/issues/:id/resolution-plan/actions/:actionId/approve
POST  /api/agent-center/issues/:id/resolution-plan/actions/:actionId/apply
POST  /api/agent-center/issues/:id/resolution-plan/retest
```

Create a production validation run:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/production-validation-runs" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data @pilot-payload.json
```

Run validation:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/production-validation-runs/$RUN_ID/run" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json"
```

Fetch validation run:

```bash
curl "$BASE_URL/api/internal/agent-center/production-validation-runs/$RUN_ID" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET"
```

Create resolution plan:

```bash
curl -X POST "$BASE_URL/api/agent-center/issues/$ISSUE_ID/resolution-plan" \
  -H "content-type: application/json"
```

Fetch resolution plan:

```bash
curl "$BASE_URL/api/agent-center/issues/$ISSUE_ID/resolution-plan"
```

Cleanup validation run:

```bash
curl -X DELETE "$BASE_URL/api/internal/agent-center/production-validation-runs/$RUN_ID" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET"
```

Cleanup expectations:

- The validation run should be marked `deleted`.
- Tied issues should no longer be returned by merchant-facing issue APIs.
- Tied resolution plans should no longer be returned.
- Usage event ledger entries may remain for auditability, but must remain `preview_only` / `not_invoiced`.

Where to check usage:

- production validation report `usage_summary`
- `/api/agent-center/usage`
- persisted `agent_center.agent_center_usage_events`

Credential rules:

- Use `agent_center_app` or another restricted role scoped to `agent_center`.
- Do not use broad backend DB owner credentials for merchant pilots.
- Do not print DB URLs, internal secrets, provider keys, or merchant secrets in logs.

## Security / Privacy

Pilot safety rules:

- Internal production validation routes are not merchant-facing.
- Internal routes require a secret and must remain feature-flag gated.
- Restricted DB role is required for merchant pilots.
- Do not store API keys, internal secrets, PSP tokens, checkout credentials, or merchant platform secrets in payload JSON.
- No real payment, PSP authorization, order write-back, refund, settlement, transaction fee, or real billing is performed.
- Raw provider outputs should be reviewed and redacted before external sharing.
- Share merchant-facing summaries, evidence, findings, and recommendations rather than raw debug payloads.

## What V1 Proves

Agent Center V1 can separately prove:

- organic product/brand discovery
- merchant PDP discovery in search-grounded discovery tests
- Pivota PDP discovery in search-grounded or buying-path discovery tests
- buying-path discovery from returned URLs/signals
- product/entity visibility
- merchant PDP attribution
- Pivota PDP attribution
- product/SKU readiness
- offer readiness
- checkout path readiness
- issue resolution plan readiness

Merchant PDP attribution and Pivota PDP attribution are separate results. Product/entity visibility alone does not prove either buying path.

## Known Limitations

V1 limitations:

- Gemini baseline only.
- Search-Grounded Product Discovery is `not_configured` unless `GEMINI_SEARCH_GROUNDING_ENABLED=true`; it must not fall back to contextual attribution.
- Gemini Search Grounding applies only to `search_grounded_product_discovery_test`. It is not enabled for organic discovery, buying-path discovery, contextual attribution, Product Understanding, Offer Execution, Checkout Verification, or retest workflows.
- Search grounding tests public web/search-grounded Gemini discovery. It does not prove consumer Gemini UI or AI Mode ranking.
- No consumer UI scraping.
- No real checkout execution.
- No payment authorization.
- No PSP validation.
- No order placement.
- No order write-back.
- No refund or settlement verification.
- No final GMV attribution.
- Usage is not invoiced.
- Merchant-facing self-serve production validation is not yet implemented.
- If Pivota PDP is not provided or not public, Pivota path attribution is not proven. This should be reported as `not_tested` or `needs_work`, not as failure of the merchant PDP.

## Pilot Rollout Checklist

1. Select 1-3 merchants.
2. Select 1-5 products per merchant.
3. Confirm merchant-approved validation scope.
4. Collect required and recommended inputs.
5. Run production validation.
6. Review report internally.
7. Create resolution plans for blockers.
8. Share curated merchant-facing report.
9. Collect merchant feedback.
10. Prioritize fixes.
11. Apply state-only or approved patches where applicable.
12. Rerun validation.
13. Record before/after results.
14. Decide whether the merchant is ready for a deeper agentic checkout pilot.

## Validation Commands

Run these before shipping Agent Center V1 pilot workflow changes:

```bash
npm run test:agent-center
npm run lint
npm run build
git diff --check
```
