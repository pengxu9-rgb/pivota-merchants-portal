# Product Understanding + SKU Match Agent V1 Validation

Last updated: 2026-05-01

## Overview

Product Understanding + SKU Match Agent V1 runs after Demand Test Agent V1 has generated an `AgenticGMVIssue`. It does not run new provider scans and does not change Demand Test scan-mode semantics.

The agent diagnoses whether a Demand Test issue is caused by weak merchant source data, incomplete Pivota unified PDP data, ProductEntity mapping ambiguity, SKU/variant mismatch, missing query mapping, missing competitor/substitute mapping, or human-review ambiguity.

## Product Definition

Acceptance validation uses a semi-real skincare sunscreen product:

```text
Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml
```

Strong merchant PDP/source attributes for acceptance tests include:

- `spf_level = SPF50+`
- `pa_rating = PA++++`
- `active_ingredients`
- `hyaluronic_acid`
- `texture = watery gel`
- `use_case = daily sunscreen`
- `finish = lightweight watery gel finish`
- `skin_benefit = skin hydration`

## Workflow Position

Product Understanding V1 sits between Demand Test diagnosis and retest:

1. Demand Test Agent creates an `AgenticGMVIssue`.
2. Product Understanding loads the issue and related product context.
3. It compares merchant source data against the Pivota agent-facing product layer.
4. It generates `ProductUnderstandingDiagnosis`.
5. It refines fix targets and patch recommendations.
6. It attaches diagnosis metadata and patches back to the issue.
7. The issue can attach the diagnosis to the retest plan.

## Accepted Inputs

Product Understanding V1 uses existing backend records:

- `AgenticGMVIssue`
- `ScanTarget`
- `MerchantStore`
- merchant product/PDP fields
- SKU and variant map from catalog products
- Pivota ProductEntity data
- Pivota unified PDP attributes
- affected `QueryCluster` records
- `ParsedRecommendation` records
- `ProductMatchResult` records
- competitor/substitute evidence from Demand Test

It does not call Gemini, add new providers, scrape consumer UI, or execute checkout/payment flows.

## Diagnosis Outputs

The main output is `ProductUnderstandingDiagnosis` with:

- merchant layer findings
- Pivota layer findings
- SKU/variant findings
- entity mapping findings
- query mapping findings
- competitor mapping findings
- root cause summary
- refined fix targets
- patch recommendations
- confidence
- preview-only usage event IDs

Issue-scoped API routes:

- `GET /api/agent-center/issues/:issueId/product-diagnosis`
- `POST /api/agent-center/issues/:issueId/product-diagnosis`
- `POST /api/agent-center/issues/:issueId/regenerate-product-patch`
- `POST /api/agent-center/issues/:issueId/attach-product-diagnosis-to-retest`

The GET route returns both `diagnosis` and a merchant-safe debug payload with:

- source issue summary
- merchant layer inputs used
- Pivota layer inputs used
- findings
- refined fix targets
- patch recommendations
- confidence
- usage event IDs

## Fix Target Rules

| Finding | Refined fix target |
|---|---|
| Merchant source attributes missing | `merchant_pdp`, `merchant_catalog`, or `both_merchant_and_pivota` |
| Pivota normalized attributes missing while merchant source is complete | `pivota_unified_pdp` |
| Product/entity mapping ambiguity | `pivota_product_graph`, `human_review` |
| Same ProductEntity but ambiguous SKU/variant | `merchant_variant_map` |
| Missing query mapping | `pivota_query_mapping` |
| Missing competitor/substitute mapping | `pivota_product_graph` |
| Low-confidence automated diagnosis | `human_review` |

## Patch Generation Rules

Patch recommendations are deterministic.

- `merchant_source_patch` is generated only when merchant PDP/catalog attributes are missing.
- `merchant_variant_map_patch` is generated when product visibility succeeds but exact SKU/variant attribution is ambiguous or incomplete.
- `pivota_unified_pdp_patch` is generated when Pivota normalized attributes are missing.
- `pivota_product_graph_patch` is generated for ProductEntity or competitor/substitute mapping findings.
- `pivota_query_mapping_patch` is generated when the affected query cluster should map to the ProductEntity but Demand Test evidence points to missing or weak mapping.

If merchant PDP/source data is strong, merchant patch output should be empty or minimal.

## Acceptance Scenarios

### Scenario A: Merchant PDP strong, Pivota unified PDP weak

Product:

```text
Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml
```

Merchant source includes strong sunscreen and hydration attributes. Pivota unified PDP intentionally omits normalized sunscreen attributes.

Expected:

- diagnosis identifies Pivota layer gap
- `refined_fix_targets` includes `pivota_unified_pdp`
- no merchant source patch is required
- `pivota_unified_pdp_patch` includes missing normalized attributes

### Scenario B: Merchant PDP weak, Pivota unified PDP weak

Merchant source and Pivota unified PDP omit key sunscreen attributes.

Expected:

- diagnosis identifies merchant and Pivota gaps
- `refined_fix_targets` includes `both_merchant_and_pivota`
- `merchant_source_patch` is generated
- `pivota_unified_pdp_patch` is generated

### Scenario C: SKU / variant ambiguity

Catalog includes same-ProductEntity variants:

- 50ml
- 2-pack
- older packaging
- travel size

Model/product mention only says:

```text
Isntree Hyaluronic Acid Watery Sun Gel
```

Expected:

- product/entity match counts for visibility
- exact SKU/variant match is not high confidence
- diagnosis includes SKU/variant finding
- `refined_fix_targets` includes `merchant_variant_map` or `human_review`

## Usage Preview

Product Understanding emits one deterministic preview-only usage event per issue diagnosis workflow:

- `agent_type = product_understanding_agent`
- `source_agent = product_understanding_agent`
- `workflow_type = product_diagnosis`
- `event_type = product_understanding_credit`
- `billing_mode = preview_only`
- `billing_status = not_invoiced`

Patch regeneration is traceable by new diagnosis IDs. The usage event remains idempotent for the same issue diagnosis workflow.

## Known Limitations

- V1 diagnosis is deterministic and rule-based; it does not call an LLM.
- V1 uses in-memory serverless state in production demos unless a persistent tenant/store is added.
- Product graph patches are recommendations only; no write-back to a production product graph is implemented.
- Merchant source patches are recommendations only; no merchant PDP/CMS write-back is implemented.
- Pivota query mapping patches are recommendations only.
- It does not add providers, run Offer Execution, verify checkout, collect payment, invoice merchants, or settle transactions.

## Validation Commands

Run before merging:

```bash
npm run test:agent-center
npm run lint
npm run build
```
