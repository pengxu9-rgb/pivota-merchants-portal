# Agent Center V1 Demo Guide

Last updated: 2026-05-01

## Product Positioning

Pivota Agent Center V1 helps merchants verify whether agentic demand can become executable pre-payment GMV by checking discoverability, product visibility, merchant/Pivota attribution, product data readiness, offer readiness, and checkout path readiness.

The core message for V1 is simple: Pivota does not only test whether an LLM mentions a product. It first separates natural discoverability from contextual attribution, then tests whether demand can be routed to the merchant or Pivota layer and whether the product, offer, and checkout path are ready before payment.

Pivota PDP should be explained as a canonical ProductEntity / Unified PDP with merchant offers and source references. It is not a replacement for the merchant PDP; it is an agent-facing execution layer on top of the merchant-owned source layer.

## Current Validated Baseline

Agent Center V1 currently includes:

- Agentic GMV Assurance Overview
- Discoverability Testing Layer
- Demand Test Agent
- Product Understanding + SKU Match Agent
- Offer Execution Agent
- Checkout Verification Agent
- Internal Demo Fixtures
- Usage Preview

This baseline has been production-smoked with internal demo fixtures. All merchant-facing usage remains preview-only and not invoiced.

Search-grounded discovery is gated by `GEMINI_SEARCH_GROUNDING_ENABLED=true`.
When enabled, Gemini Google Search grounding is used only for
`search_grounded_product_discovery_test`. Organic discovery, buying-path
discovery, contextual attribution, Product Understanding, Offer Execution,
Checkout Verification, and retest workflows remain ungrounded.

Pivota PDP public exposure now has an indexing pipeline:

- ProductEntity index registry in Agent Center
- gateway `get_discovery_feed` sync
- main-path `get_pdp_v2` content verification
- production Googlebot-style PDP audit
- dynamic `agent.pivota.cc/sitemap-products.xml`
- paginated public internal-link surface at `/products/indexability`
- Search Console evidence and timed rerun tasks
- scoped Gemini search-grounded measurement

Only `sitemap_eligible=true` canonical `sig_*` records enter the product
sitemap. `ext_*` URLs remain aliases and are excluded from canonical sitemap
output.

## Demo Story

Start with the problem merchants understand: AI agents can recommend products, but a recommendation is not GMV until the product can be attributed to the right buying path and the pre-payment chain is ready.

Agent Center V1 shows the chain from discovery to AI demand to pre-payment readiness:

1. Can users or agents naturally discover the product, merchant PDP, or Pivota PDP?
2. Is the product visible to the model?
3. Can the model attribute that demand to the merchant store or verified Pivota channel?
4. Does Pivota understand the product, SKU, variant, and query mapping correctly?
5. Is the merchant offer consistent with Pivota offer state?
6. Is the checkout path present, reachable, and correctly parameterized before payment?

The demo should make clear that V1 proves pre-payment readiness only. It does not prove payment authorization, order placement, settlement, or final GMV attribution.

## Merchant Pilot Report Quality

For real merchant pilots, do not share a report externally unless discovery
evidence is concrete enough for a merchant to act on.

Organic discovery failure should be explained as:

- no-context organic prompts did not surface the product or brand
- competitors appeared instead
- contextual attribution can still pass because it uses provided product/PDP context

Competitor dominance should list normalized examples:

- query tested
- returned competitor brands/products
- whether the merchant product appeared
- whether the merchant brand appeared
- likely reason competitors dominated
- recommended differentiation angles such as ingredients, skin type, texture,
  product family, use case, claim evidence, review proof, and substitute mapping

Search-grounded discovery should be phrased separately:

- Found: "Search-grounded Gemini found the official merchant PDP when the product name was specified."
- Not found: "Search-grounded Gemini did not return the expected merchant PDP."
- Not tested: "Search-grounded discovery was not tested in this run."
- Not configured: "Search-grounded discovery was not configured in this run."

Numeric `0` is a tested/not found result, not `not_tested`. Use `not_tested`
only when the mode did not run, and `not_configured` only when grounding or
provider configuration prevented the mode from running.

When search-grounded discovery returns `merchant_pdp_not_discovered`,
`pivota_pdp_not_discovered`, or `wrong_buying_path_returned`, the report should
include a Discoverability Fix Plan. That plan audits merchant-owned PDP signals
and Pivota agent-facing PDP signals separately, then recommends concrete fixes:
indexability, canonical URL, Product/Offer structured data, sitemap inclusion,
PDP copy, verified source references, product intelligence, offer references,
and wrong URL analysis where applicable.

Do not say contextual attribution equals discovery. Do not claim consumer Gemini
UI or AI Mode ranking.

For Pivota PDP URLs, avoid describing `/products/ext_*` as canonical product identity. Treat `ext_*` as an external seed/source alias unless it has been explicitly promoted to a ProductEntity ID. Search-grounded Pivota discovery counts a returned alias only when it canonicalizes or maps to the expected ProductEntity; unrelated `ext_*` URLs do not count.

For public exposure, separate these states:

- `ready for Google`: canonical PDP renders real server HTML, JSON-LD, source
  references, sitemap eligibility, and internal links.
- `submitted/requested`: Search Console sitemap or URL Inspection evidence has
  been recorded.
- `shown in Gemini search-grounded`: Gemini returned the canonical `sig_*` URL
  or a verified alias. Only this state allows a measured exposure/uplift claim.

## Demo Flow

1. Open `/agent-center`.
2. Show the `Agentic GMV Assurance Summary` card.
3. Show the `Discovery Readiness` section:
   - Organic Product Discovery
   - Merchant PDP Discovery
   - Pivota PDP Discovery
   - Buying Path Discovery
   - Competitor Dominance
4. Show readiness dimensions:
   - Product Visibility
   - Merchant Store Attribution
   - Pivota Channel Attribution
   - Product Data Readiness
   - SKU / Variant Readiness
   - Offer Readiness
   - Checkout Readiness
5. Show the top blocker and next best action.
6. Drill into Issue Detail at `/agent-center/issues/:issueId`.
7. Show Demand Test result.
8. Show `Product Understanding Diagnosis`.
9. Show `Offer Execution Diagnosis`.
10. Show `Checkout Verification Diagnosis`.
11. Show Usage Preview and confirm it says `preview_only` / `not_invoiced`.

## Demo Fixture Presets

Internal fixture presets for the V1 demo:

- `full_ready_pre_payment_chain`
- `offer_price_blocker_chain`

These fixtures are internal-only and must not be exposed in merchant UI. They are created through `/api/internal/agent-center/demo-fixtures` with internal authorization and the demo fixtures feature flag enabled.

## Expected `full_ready_pre_payment_chain` Result

Expected Agentic GMV Assurance Overview result:

- `readiness_level = ready_for_agentic_checkout`
- `overall_readiness_score = 100`
- 7/7 readiness dimensions passed
- no high-severity blocker
- usage remains `preview_only` / `not_invoiced`

Demo interpretation:

The product is visible, attribution is proven, product/SKU data is ready, offer state is consistent, and checkout path readiness passes V1 pre-payment checks. The merchant can treat the chain as ready for agentic checkout integration work, while still understanding that no real payment or order has been executed.

## Expected `offer_price_blocker_chain` Result

Expected Agentic GMV Assurance Overview result:

- `readiness_level = needs_work`
- top blocker = `price_mismatch`
- next best action = `Apply Offer Execution patches and rerun offer diagnosis.`
- offer dimension = `needs_work`
- other main dimensions passed
- usage remains `preview_only` / `not_invoiced`

Demo interpretation:

Demand, attribution, product understanding, and checkout readiness can be healthy while the offer layer still blocks agentic GMV readiness. Agent Center points to the exact blocker, the affected layer, and the next action instead of treating the whole workflow as a generic failure.

## Agent Explanations

### Demand Test Agent

Demand Test Agent verifies whether the product is visible in AI demand scenarios and whether attribution is proven for the selected scan mode.

It supports:

- organic product discovery testing
- search-grounded product discovery testing, when `GEMINI_SEARCH_GROUNDING_ENABLED=true`
- buying-path discovery testing
- open product/entity visibility testing
- merchant store attribution testing
- verified Pivota PDP / offer attribution testing
- retest and before/after verification
- usage preview

Important distinction: contextual attribution is not natural discovery. "Merchant PDP was returned in contextual attribution test" is different from "Merchant PDP was discovered in search-grounded discovery test." Search-grounded discovery evaluates URLs returned by the model or Gemini `groundingMetadata`, without injecting expected merchant/Pivota PDP URLs as source context. It does not prove consumer Gemini UI or AI Mode ranking. Product/entity visibility does not prove merchant store visibility or Pivota channel visibility. Pivota attribution only counts when a verified public canonical ProductEntity PDP URL, verified alias URL, verified product object ID, or verified offer ID is returned.

For pilots, "verified alias URL" means the alias resolves or canonicalizes to the expected ProductEntity. Product JSON-LD should use the canonical ProductEntity URL, and Offer/AggregateOffer JSON-LD should describe merchant offers under that ProductEntity.

### Product Understanding + SKU Match Agent

Product Understanding + SKU Match Agent diagnoses whether an issue is caused by weak merchant source data, incomplete Pivota unified PDP data, incorrect ProductEntity mapping, SKU/variant mismatch, missing query mapping, missing competitor/substitute mapping, or human-review ambiguity.

It compares the merchant source layer against the Pivota agent-facing layer and generates deterministic patch recommendations, including merchant source patches, variant map patches, Pivota unified PDP patches, product graph patches, and query mapping patches.

### Offer Execution Agent

Offer Execution Agent diagnoses offer readiness and consistency across merchant offer source data and Pivota offer state.

It checks:

- missing offer
- stale offer
- price mismatch
- promo/coupon mismatch
- expired coupon
- inventory mismatch
- offer attachment to Pivota PDP
- offer SKU/variant mismatch
- clean offer state

V1 does not execute checkout or payments. It only verifies whether the offer state is ready and consistent before payment.

### Checkout Verification Agent

Checkout Verification Agent diagnoses checkout path readiness before payment.

It checks:

- checkout URL/session presence
- checkout URL preflight status
- cart handoff payload completeness
- SKU / variant / quantity parameters
- coupon / promo passthrough parameters
- merchant checkout domain consistency
- stale or expired checkout session
- checkout path attachment to the correct offer

V1 does not authorize payments, tokenize cards, place orders, write orders back, refund, settle funds, or prove final GMV.

## What V1 Proves

Agent Center V1 can prove:

- organic product/entity discovery
- organic brand discovery
- merchant PDP discovery in search-grounded discovery tests
- Pivota PDP discovery in search-grounded or buying-path discovery tests
- buying-path discovery from returned URLs, domains, offer, price, or availability signals
- product/entity visibility
- merchant attribution when tested in Merchant Store Attribution mode
- verified Pivota attribution when tested in Pivota PDP Attribution mode
- product data readiness
- SKU / variant readiness
- offer consistency
- checkout path readiness before payment
- pre-payment readiness across the agentic GMV chain

## What V1 Does Not Prove

Agent Center V1 does not prove:

- real payment authorization
- PSP success
- payment token creation
- order placement
- order write-back
- refund
- settlement
- transaction fees
- final GMV attribution
- real billing
- consumer UI scraping

Any V1 claim that a path is ready means pre-payment readiness only.

## Usage Explanation

All usage remains `preview_only` / `not_invoiced`.

Merchant UI should show credits and usage only. It should not expose token-level provider costs or imply that billing, invoicing, subscriptions, payment collection, or settlement have been enabled.

V1 usage areas include:

- AI Test Credits
- Product Understanding Credits
- Offer Verification Credits
- Checkout Verification Credits
- Pivota Optimization Credits, when Pivota-owned optimization patches are applied

These are preview usage signals for product validation and merchant understanding.

## Pivota-Owned Optimization Demo

For discovery blockers, Agent Center can now show the first optimization execution step before the full Optimization Proof Loop:

1. Open an issue such as `pivota_pdp_not_discovered`, `pivota_pdp_readiness_gap`, or `competitor_dominance`.
2. Generate a Pivota-owned optimization patch from the Resolution Plan.
3. Apply only Pivota-owned actions, such as source references, product intelligence, Product/Offer schema, sitemap instructions, query mappings, or competitor/substitute graph updates.
4. Rerun the relevant validation mode.
5. Regenerate the report draft and show the "Pivota-Owned Optimization Applied" section.

This does not write to merchant production systems. Merchant PDP copy, merchant structured data, canonical URL, sitemap, or catalog changes still require merchant approval and merchant-side execution.

Do not claim discovery uplift unless a rerun score improves. If Pivota PDP readiness improves but search-grounded discovery still does not return the Pivota PDP, explain that external indexing/search ingestion can require more time.

## Pivota Discovery Progress

After Pivota-owned discoverability fixes are applied, the report can show a
merchant-safe Pivota Discovery Progress section:

- Pivota PDP published
- ProductEntity binding verified
- Product schema added
- Offer schema added when an offer exists
- Merchant source reference added
- Sitemap includes canonical PDP
- Search Console sitemap submitted
- URL inspection / indexing requested
- Waiting for indexing window
- Search-grounded Gemini returned Pivota PDP
- Uplift verified

This progress proves prerequisites and operator evidence only. It does not prove
consumer Gemini UI or AI Mode ranking, and it does not allow an uplift claim
until a measured `search_grounded_product_discovery_test` rerun returns the
canonical Pivota PDP URL or a verified canonicalized alias. Contextual
attribution is still separate from discovery.

## Founder Demo Script

Use this concise script for merchants or investors:

```text
Agent Center starts with the question merchants actually care about: not just "does AI know my product?", but "can AI demand become a ready buying path?"

Here, the Assurance Overview shows the full pre-payment chain. Product Visibility tells us whether the model surfaces the product. Merchant and Pivota Attribution tell us whether the demand can be routed to the right channel. Product Data and SKU readiness tell us whether the agent is working with the right product and variant. Offer Readiness checks price, promo, coupon, inventory, and attachment. Checkout Readiness checks that the pre-payment checkout path exists, is reachable, and has the right parameters.

In the ready fixture, all seven readiness dimensions pass and the system marks the chain ready for agentic checkout work. In the blocker fixture, most of the chain passes, but the offer layer has a price mismatch. Agent Center does not hide that under a generic score. It identifies the blocker, shows the affected layer, recommends the next action, and keeps usage clearly marked as preview-only and not invoiced.

V1 does not process payments or place orders. It proves the pre-payment readiness layer that has to be correct before agentic checkout can safely execute.
```

## Validation Commands

Run these before shipping Agent Center V1 changes:

```bash
npm run test:agent-center
npm run lint
npm run build
git diff --check
```

For production smoke, use internal demo fixtures only and delete each fixture after validation.
