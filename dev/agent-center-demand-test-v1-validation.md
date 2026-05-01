# Agent Center Demand Test V1 Validation

Last updated: 2026-05-01

## Overview

Demand Test Agent V1 is the first production workflow inside Agentic GMV Center. It tests whether a merchant product is visible to an LLM, whether a merchant buying path can be attributed when merchant source context is provided, and whether a Pivota channel path can be verified when Pivota PDP/object/offer evidence exists.

Current merchant routes:

- `/agent-center`
- `/agent-center/run`
- `/agent-center/jobs/:jobId`
- `/agent-center/results/:scanId`
- `/agent-center/issues`
- `/agent-center/issues/:issueId`
- `/agent-center/verification/:verificationId`
- `/agent-center/usage`

Current API routes:

- `POST /api/agent-center/demo-scenarios`
- `GET /api/agent-center/demo-scenarios`
- `POST /api/agent-center/scan-targets`
- `GET /api/agent-center/scan-targets/:scanTargetId`
- `POST /api/agent-center/input-readiness`
- `GET /api/agent-center/input-readiness/:scanTargetId`
- `POST /api/agent-center/usage-estimate`
- `POST /api/agent-center/demand-test-jobs`
- `GET /api/agent-center/demand-test-jobs/:jobId`
- `POST /api/agent-center/demand-test-jobs/:jobId/run`
- `POST /api/agent-center/demand-test-jobs/:jobId/cancel`
- `GET /api/agent-center/results/:jobId`
- `GET /api/agent-center/query-clusters?scan_target_id=:scanTargetId`
- `GET /api/agent-center/query-clusters/:queryClusterId`
- `GET /api/agent-center/issues`
- `GET /api/agent-center/issues/:issueId`
- `GET /api/agent-center/issues/:issueId/debug` with internal authorization only
- `GET /api/agent-center/issues/:issueId/verification`
- `PATCH /api/agent-center/issues/:issueId`
- `POST /api/agent-center/issues/:issueId/approve`
- `POST /api/agent-center/issues/:issueId/ignore`
- `POST /api/agent-center/issues/:issueId/assign`
- `POST /api/agent-center/issues/:issueId/retest-preparation`
- `POST /api/agent-center/issues/:issueId/retest`
- `GET /api/agent-center/verification/:verificationId`
- `GET /api/agent-center/usage`
- `GET /api/agent-center/usage/by-store`
- `GET /api/agent-center/usage/by-provider`
- `POST /api/merchant-stores`

V1 uses Gemini as the only active provider. If `GEMINI_API_KEY` is unavailable or `PIVOTA_AGENT_CENTER_MOCK_GEMINI=true`, the provider adapter returns deterministic mock results so the workflow can still be demoed.

## Scan Mode Matrix

| Scan mode | Required inputs | Optional inputs | Primary scores | Issue types generated | What counts as success | What does not count as success |
|---|---|---|---|---|---|---|
| `open_product_visibility_test` | `ScanTarget`, store, product/entity context, query cluster, Gemini provider | competitor context, PDP attributes, Pivota normalized attributes | `product_entity_visibility_score`, `competitor_substitution_score`, `attribute_readiness_score`, `pivota_pdp_readiness_score` | `ai_visibility_loss`, `competitor_substitution`, `missing_attribute`, `pivota_pdp_readiness_gap` | The model recommends or mentions the canonical product entity, including normalized core product matches. | Product/entity recommendation does not prove merchant store visibility, Pivota PDP visibility, offer visibility, or checkout execution. |
| `merchant_store_attribution_test` | `ScanTarget`, merchant store name, merchant store URL, merchant PDP URL, product/entity context, query cluster, Gemini provider | SKU data, competitor context, merchant structured attributes | `product_entity_visibility_score`, `merchant_store_visibility_score`, `competitor_substitution_score`, `attribute_readiness_score` | `merchant_store_attribution_gap`, plus shared product/readiness issues | The model returns the merchant store, merchant PDP URL, or merchant offer as the buying path for the visible product. | Product/entity visibility alone does not count. Pivota attribution is not proven in this mode. |
| `pivota_pdp_attribution_test` | `ScanTarget`, Pivota product entity/object context, query cluster, Gemini provider, and a verifiable public Pivota PDP URL or product object ID for success | Pivota offer IDs, merchant offers under the unified PDP, competitor context | `product_entity_visibility_score`, `pivota_pdp_visibility_score`, `pivota_offer_visibility_score`, `pivota_attribution_echo_rate`, `pivota_pdp_readiness_score` | `pivota_pdp_attribution_gap`, `pivota_offer_attribution_gap`, `unverified_pivota_attribution`, plus shared product/readiness issues | Verified public Pivota PDP URL or verified product object ID for PDP visibility; verified offer ID for offer visibility. | Text that merely says "Pivota", unverified model claims, context echo, invalid/404 PDP URLs, or unverified offer IDs. |

## What Each Mode Proves

### `open_product_visibility_test`

Proves whether the LLM can surface the product entity for a demand query.

Does not prove:

- the merchant store was surfaced
- a merchant PDP was returned
- Pivota unified PDP was returned
- a Pivota offer was returned
- an executable offer or checkout path exists

When product visibility is strong but attribution scores are not proven, the results UI recommends running Merchant Store Attribution Test or Pivota PDP Attribution Test.

### `merchant_store_attribution_test`

Proves whether the LLM can return the merchant store/PDP as the purchase source when merchant context is provided.

Does not prove:

- Pivota PDP visibility
- Pivota offer visibility
- executable offer or checkout path
- final transaction or settlement success

### `pivota_pdp_attribution_test`

Proves whether the LLM returns a verified Pivota channel path when Pivota context is provided.

Does not prove:

- merchant store attribution unless merchant context is also explicitly involved
- checkout execution
- payment or transaction settlement
- consumer UI ranking in Gemini/ChatGPT/Copilot frontends

## Score Definitions

### `product_entity_visibility_score`

Formula:

```text
product_entity_visibility_matches / total_completed_runs * 100
```

Counts canonical product/entity matches, including high-confidence normalized core product matches. It does not require exact SKU/variant match.

### `merchant_store_visibility_score`

Formula:

```text
merchant_store_or_pdp_or_offer_attributed_runs / total_completed_runs * 100
```

Counts only in merchant attribution modes. A run counts when the model returns the merchant store, merchant PDP URL, or merchant offer as the buying path.

### `pivota_pdp_visibility_score`

Formula:

```text
verified_pivota_pdp_attribution_runs / total_completed_runs * 100
```

A run counts only if either:

- `pivota_pdp_url_present = true` and `pivota_pdp_url_verified = true`
- `pivota_product_object_id_present = true` and `pivota_product_object_id_verified = true`

Model text saying "Pivota" does not count.

### `pivota_offer_visibility_score`

Formula:

```text
verified_pivota_offer_runs / total_completed_runs * 100
```

A run counts only if:

- `pivota_offer_ids_present = true`
- `pivota_offer_ids_verified = true`

### `executable_offer_visibility_score`

V1 value is usually `not_tested`.

This score is reserved for future offer execution and checkout verification. Demand Test Agent V1 does not implement PSP/payment/checkout transaction logic.

### `pivota_attribution_echo_rate`

Formula:

```text
unverified_pivota_echo_runs / total_completed_runs * 100
```

Counts runs where the model appears to reference Pivota but does not return a verified public Pivota PDP URL, verified product object ID, or verified offer ID.

Echo rate is a debug and risk signal. It is not a success score.

### `competitor_substitution_score`

Formula:

```text
runs_where_competitor_appears_and_merchant_absent / total_relevant_runs * 100
```

Counts relevant runs where competitor products appear while the merchant product/entity is absent.

### `attribute_readiness_score`

Formula:

```text
required_attributes_present_on_merchant_pdp / required_attributes * 100
```

Measures readiness of merchant PDP/source fields for the query cluster. For sunscreen examples, required attributes include SPF level, PA rating, skin type, finish, and active ingredients.

### `pivota_pdp_readiness_score`

Formula:

```text
required_normalized_attributes + agent_summary + product_entity_id + graph_completeness
```

Measures whether Pivota's unified PDP/product graph has normalized attributes and agent-facing summary content for the query cluster. This is separate from verified Pivota channel attribution.

## Issue Type Definitions

| Issue type | Meaning | Typical fix target |
|---|---|---|
| `ai_visibility_loss` | Product/entity is not appearing for relevant AI demand scenarios. | merchant PDP and Pivota unified PDP |
| `competitor_substitution` | Competitors appear while merchant product/entity is absent. | merchant PDP, Pivota product graph, query mapping |
| `merchant_store_attribution_gap` | Product is visible but merchant store/PDP was not returned as the buying path in merchant attribution mode. | merchant PDP, merchant catalog, merchant structured data |
| `pivota_pdp_attribution_gap` | Product is visible but verified Pivota PDP/object attribution is missing in Pivota attribution mode. | Pivota unified PDP, Pivota product graph, Pivota query mapping |
| `pivota_offer_attribution_gap` | Verified Pivota PDP is visible but verified Pivota-managed offer IDs are not returned. | Pivota unified PDP, Pivota product graph |
| `unverified_pivota_attribution` | Model referenced Pivota, but returned no verified PDP URL, product object ID, or offer ID. | Pivota unified PDP, Pivota product graph, Pivota query mapping |
| `missing_attribute` | Required product attributes are missing or unclear. | merchant PDP, Pivota unified PDP, or both |
| `pivota_pdp_readiness_gap` | Pivota unified PDP lacks normalized attributes or agent-facing summary clarity. | Pivota unified PDP |
| `product_entity_mapping_issue` | Product/entity matching is ambiguous or incorrect. | Pivota product graph, human review |
| `wrong_product_family` | Model/matcher connected the wrong product family. | merchant variant map, Pivota product graph, human review |
| `no_purchase_path` | Product is visible but no buying path is returned. | merchant PDP, Pivota PDP, offer layer |
| `human_review_required` | Parser/matcher confidence is too low for automated routing. | human review |

## Strict Pivota Attribution Verification Rules

Pivota channel visibility must be evidence-based.

Pivota PDP visibility can only count when the parsed recommendation includes either:

- a verified public Pivota PDP URL
- a verified Pivota product object ID

Pivota offer visibility can only count when the parsed recommendation includes a verified Pivota offer ID/path.

Model text saying "Pivota", channel attribution claims from the model, or context echo must not count as Pivota attribution success.

The accepted public Pivota PDP URL structure is:

```text
https://agent.pivota.cc/products/{product_object_id}
```

Example:

```text
https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90?return=%2Fproducts%2Fext_0281be2868f91dcf200fa248%3Freturn%3D%252F
```

## Pivota Preflight Status

For `pivota_pdp_attribution_test`, the backend builds Pivota attribution preflight metadata before parsing/scoring.

| Status | Meaning | Scoring impact |
|---|---|---|
| `not_applicable` | Scan mode is not Pivota PDP attribution. | Pivota attribution scores are not tested unless another mode enables them. |
| `verified` | Candidate Pivota PDP URL returned 200 and matched expected product entity/object evidence. | Model output may count if it returns the verified URL/object/offer evidence. |
| `failed` | Candidate URL was present but failed preflight, for example 404 or product mismatch. | Pivota PDP/offer visibility must remain 0 unless another verified evidence path exists. |
| `negative_control` | No public Pivota PDP URL was available. | Pivota channel attribution cannot be verified; Pivota echo should be recorded if the model mentions Pivota. |

## Usage And Billing Preview Status

Demand Test Agent V1 records usage in backend `UsageEvent` records, but merchant-facing billing remains preview-only.

Defaults:

- `billing_mode = preview_only`
- `billing_status = not_invoiced`

Merchant Portal must show AI Test Credits, not provider token costs.

Usage events include:

- `merchant_id`
- `store_id`
- `scan_target_id`
- `provider`
- `model`
- `scan_mode`
- `query_cluster_id`
- `prompt_template_id`
- `input_tokens`
- `output_tokens`
- deterministic idempotency key

No real billing, invoicing, Stripe Billing, payment collection, subscription management, employee billing admin, or transaction settlement is implemented in V1.

## Current Production Validation Summary

Strict production validation was run against the Vercel production deployment using Gemini 2.5 Flash.

### Isntree Open Product/Entity Scan

Product:

```text
Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml
```

Result:

- Product/entity visibility was strong.
- Merchant Store Visibility remained not proven in open scan mode.
- Pivota Channel Visibility remained not proven in open scan mode.
- Executable Offer Visibility remained `not_tested`.

Important interpretation:

Open product visibility proves product/entity recognition only. It does not prove merchant or Pivota channel attribution.

### Merchant Attribution Scan

Merchant PDP:

```text
https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml
```

Preflight:

- official Isntree PDP returned HTTP 200

Result:

- Product/entity visibility was strong.
- Merchant store/PDP attribution passed.
- Gemini returned the merchant PDP URL as the buying path.
- UsageEvents remained `preview_only` / `not_invoiced`.

### Pivota PDP Negative Control

Earlier validation found candidate legacy Pivota URLs returned 404:

```text
https://pivota.cc/pdp/pe_isntree_watery_sun_gel
https://pivota-merchants-portal-clean.vercel.app/pdp/pe_isntree_watery_sun_gel
```

After strict verification was added, the negative-control production smoke returned:

- `pivota_pdp_visibility_score = 0`
- `pivota_offer_visibility_score = 0`
- `pivota_attribution_echo_rate = 100`
- `preflight_status = negative_control`
- generated `pivota_pdp_attribution_gap`
- generated `unverified_pivota_attribution`
- UsageEvents remained `preview_only` / `not_invoiced`

### Pivota PDP Positive Verification

The real Pivota URL pattern is:

```text
https://agent.pivota.cc/products/{product_object_id}
```

Preflight for an `agent.pivota.cc/products/...` URL can return HTTP 200. The positive verified Pivota PDP case is covered in automated tests:

- valid Pivota PDP URL returns 200
- model returns the exact verified Pivota PDP URL
- `pivota_pdp_url_verified = true`
- `pivota_pdp_visibility_score > 0`
- no attribution gap issue is generated

## Known Limitations

- Production custom seed positive-control smoke is currently limited by in-memory serverless state. `POST /api/merchant-stores` and subsequent scan calls can land on different serverless instances, so custom stores are not always available across requests.
- The positive verified Pivota PDP case is covered in automated tests, and preflight for `agent.pivota.cc/products/...` URLs can return HTTP 200.
- A persistent demo seed store or production-safe demo tenant is recommended before future live demos.
- V1 does not implement real consumer UI scraping.
- V1 does not implement PSP/payment/checkout transaction logic.
- V1 does not prove final order conversion, settlement, refund handling, or agentic checkout success.
- V1 Gemini API tests are not the same as exact consumer Gemini/ChatGPT/Copilot shopping-surface rankings.
- Offer execution and checkout verification are future phases.

## Demo Checklist

- [ ] Open `/agent-center/run`.
- [ ] Select or create a `ScanTarget`.
- [ ] Run `open_product_visibility_test`.
- [ ] Explain that Product Visibility proves product/entity recognition only.
- [ ] Explain that merchant/Pivota attribution is not proven by open product visibility.
- [ ] Run `merchant_store_attribution_test`.
- [ ] Show the returned merchant PDP URL.
- [ ] Run `pivota_pdp_attribution_test` as a negative-control scan if no verified public Pivota PDP URL exists.
- [ ] Show that `pivota_attribution_echo_rate` does not count as success.
- [ ] Show `pivota_pdp_attribution_gap` or `unverified_pivota_attribution`.
- [ ] Open `/agent-center/issues`.
- [ ] Open an issue detail page and show merchant-facing narrative and fix targets.
- [ ] Run retest from issue detail when a fix is available.
- [ ] Open `/agent-center/usage`.
- [ ] Show UsageEvents and confirm `preview_only` / `not_invoiced`.

## Validation Commands

Run before merging or demoing new Demand Test Agent changes:

```bash
npm run test:agent-center
npm run lint
npm run build
```

Optional diagnostic:

```bash
npx tsc --noEmit
```

The raw TypeScript diagnostic currently reports known non-Agent-Center project type errors. Demand Test Agent validation relies on the focused agent-center test suite, lint, and production build.
