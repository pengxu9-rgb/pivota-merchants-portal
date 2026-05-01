# Offer Execution Agent V1 Validation

Last updated: 2026-05-01

## Product Definition

Offer Execution Agent V1 diagnoses offer readiness and consistency across the merchant offer source layer and Pivota offer state.

The agent runs after Demand Test Agent V1 and Product Understanding + SKU Match Agent V1. It consumes an `AgenticGMVIssue` and related product context, then checks whether a merchant offer under a ProductEntity or Pivota unified PDP is ready to be represented as an agent-facing offer.

V1 is an offer readiness and offer consistency agent only. It does not execute checkout, authorize payments, write orders, settle funds, or calculate real merchant billing.

## V1 Scope

Offer Execution Agent V1 detects and explains:

- `missing_offer`: merchant offer source exists, but no matching Pivota offer state exists.
- `stale_offer`: merchant source was synced after the Pivota offer was last verified.
- `price_mismatch`: merchant source price or currency differs from Pivota offer price or currency.
- `promo_mismatch`: merchant promo price, coupon code, or coupon status differs from Pivota offer state.
- `expired_coupon`: merchant coupon is expired, but Pivota still exposes active or unknown coupon state.
- `inventory_mismatch`: merchant inventory source and Pivota offer inventory state differ.
- `offer_not_attached_to_pivota_pdp`: Pivota offer exists but is not attached to the unified PDP.
- `offer_sku_variant_mismatch`: offer SKU or variant mapping differs from the affected merchant product SKU.
- `clean_offer`: merchant offer source and Pivota offer state are consistent for V1 readiness checks.

## Explicitly Out Of Scope

Offer Execution Agent V1 does not implement:

- PSP authorization
- payment tokens
- checkout execution
- order write-back
- refunds
- settlement
- real billing
- transaction fees
- subscription management
- transaction-level GMV attribution

Any UI or API output that references offer execution in V1 means readiness verification only, not a successful checkout or payment transaction.

## Data Models

### `MerchantOffer`

Represents merchant source offer data for one product/SKU.

Key fields:

- `id`
- `merchant_id`
- `store_id`
- `product_id`
- `sku_id`
- `price`
- `currency`
- `promo_price`
- `coupon_code`
- `coupon_status`
- `inventory_status`
- `inventory_quantity`
- `expires_at`
- `source_url`
- `last_synced_at`

### `PivotaOffer`

Represents Pivota's agent-facing offer state for a ProductEntity/unified PDP/SKU.

Key fields:

- `id`
- `product_entity_id`
- `pivota_unified_pdp_id`
- `merchant_id`
- `store_id`
- `sku_id`
- `price`
- `currency`
- `promo_price`
- `coupon_code`
- `coupon_status`
- `inventory_status`
- `execution_status`
- `attached_to_pivota_pdp`
- `last_verified_at`

### `OfferExecutionDiagnosis`

Main agent output.

Key fields:

- `id`
- `merchant_id`
- `store_id`
- `issue_id`
- `product_entity_id`
- `sku_id`
- `merchant_offer_id`
- `pivota_offer_id`
- `source_agent = offer_execution_agent`
- `offer_layer_findings`
- `root_cause_summary`
- `refined_fix_targets`
- `patch_recommendations`
- `offer_readiness_score`
- `confidence`
- `usage_event_ids`
- `created_at`

### `OfferLayerComparison`

Compares merchant offer source with Pivota offer state.

Key fields:

- `merchant_offer`
- `pivota_offer`
- `price_consistent`
- `promo_consistent`
- `coupon_consistent`
- `inventory_consistent`
- `expiration_valid`
- `attached_to_pivota_pdp`
- `sku_variant_consistent`
- `findings`

### `OfferMismatchFinding`

One detected offer readiness finding.

Key fields:

- `finding_type`
- `severity`
- `field`
- `merchant_value`
- `pivota_value`
- `evidence`
- `fix_target`

### `OfferPatchRecommendation`

Deterministic recommended patch for the source or Pivota offer layer.

Patch types:

- `merchant_offer_patch`
- `pivota_offer_patch`
- `inventory_sync_patch`
- `promo_state_patch`
- `offer_attachment_patch`

## API Routes

Issue-scoped routes:

- `GET /api/agent-center/issues/:issueId/offer-diagnosis`
- `POST /api/agent-center/issues/:issueId/offer-diagnosis`
- `POST /api/agent-center/issues/:issueId/regenerate-offer-patch`
- `POST /api/agent-center/issues/:issueId/attach-offer-diagnosis-to-retest`

Issue Detail UI route:

- `/agent-center/issues/:issueId`

The Issue Detail page includes an `Offer Execution Diagnosis` section with:

- offer readiness score
- merchant offer source
- Pivota offer state
- price mismatch evidence
- promo/coupon mismatch evidence
- inventory mismatch evidence
- offer attachment status
- root cause summary
- recommended patches
- refined fix targets
- confidence
- usage status

## Fix Target Rules

| Finding | Typical refined fix target |
|---|---|
| Missing Pivota offer for existing merchant offer | `pivota_offer_layer` |
| Pivota offer stale against newer merchant source | `pivota_offer_layer` |
| Price mismatch with fresh merchant source | `pivota_offer_layer` |
| Price mismatch with ambiguous freshness | `both_merchant_and_pivota` |
| Promo or coupon mismatch | `pivota_offer_layer`, `merchant_promo_source` |
| Expired merchant coupon still active in Pivota | `pivota_offer_layer`, `merchant_promo_source` |
| Inventory mismatch | `pivota_offer_layer`, `merchant_inventory_source` |
| Offer not attached to unified PDP | `pivota_offer_layer` |
| Offer attached to wrong SKU/variant | `pivota_product_graph` |
| No merchant or Pivota offer evidence | `human_review` |

Supported fix target values:

- `merchant_offer_source`
- `pivota_offer_layer`
- `merchant_inventory_source`
- `merchant_promo_source`
- `pivota_product_graph`
- `both_merchant_and_pivota`
- `human_review`

## Patch Generation Rules

Patch recommendations are deterministic.

- `pivota_offer_patch` is generated for missing Pivota offers, price mismatch, or stale Pivota offer state.
- `inventory_sync_patch` is generated when merchant inventory state differs from Pivota offer inventory state.
- `promo_state_patch` is generated for promo mismatch, coupon mismatch, or expired coupon findings.
- `offer_attachment_patch` is generated when the offer is not attached to the Pivota PDP or points to the wrong SKU/variant.
- `merchant_offer_patch` is used as a human-review fallback when offer evidence is incomplete or ambiguous.

Clean offers should produce high readiness and should not create a new `offer_execution_issue`.

## Usage Metering

Offer Execution Agent V1 emits deterministic preview-only usage events:

- `agent_type = offer_execution_agent`
- `source_agent = offer_execution_agent`
- `workflow_type = offer_readiness`
- `event_type = offer_verification_credit`
- `provider = internal`
- `model = offer-execution-deterministic-v1`
- `billing_mode = preview_only`
- `billing_status = not_invoiced`

Idempotency key format:

```text
offer_execution:{issue_id}:offer_readiness:v1
```

Patch regeneration creates a new diagnosis ID for traceability, but reuses the same idempotent usage event for the issue-level offer readiness workflow.

## Controlled Scenarios

Automated coverage lives in `tests/agent-center/demand-test-agent.test.mjs`.

### Missing offer

Setup:

- merchant offer exists
- no matching Pivota offer exists

Expected:

- finding: `missing_offer`
- refined fix target includes `pivota_offer_layer`
- `pivota_offer_patch` generated
- `UsageEvent.billing_mode = preview_only`
- `UsageEvent.billing_status = not_invoiced`

### Stale offer

Setup:

- merchant offer `last_synced_at` is newer than Pivota offer `last_verified_at`

Expected:

- finding: `stale_offer`
- refined fix target includes `pivota_offer_layer`
- `pivota_offer_patch` generated

### Price mismatch

Setup:

- merchant source price differs from Pivota offer price

Expected:

- finding: `price_mismatch`
- refined fix target includes `pivota_offer_layer` or `both_merchant_and_pivota`
- `pivota_offer_patch` generated with merchant source price/currency

### Promo / coupon mismatch

Setup:

- merchant promo price, coupon code, or coupon status differs from Pivota offer state

Expected:

- finding: `promo_mismatch`
- refined fix target includes `pivota_offer_layer` and `merchant_promo_source`
- `promo_state_patch` generated

### Expired coupon

Setup:

- merchant coupon is expired
- Pivota coupon status remains active or unknown

Expected:

- finding: `expired_coupon`
- refined fix target includes `pivota_offer_layer` and `merchant_promo_source`
- `promo_state_patch` generated

### Inventory mismatch

Setup:

- merchant source says out of stock
- Pivota offer says in stock

Expected:

- finding: `inventory_mismatch`
- refined fix target includes `pivota_offer_layer` and `merchant_inventory_source`
- `inventory_sync_patch` generated

### Offer attachment mismatch

Setup:

- Pivota offer exists but is not attached to the Pivota PDP, or the Pivota offer points to the wrong SKU/variant

Expected:

- finding: `offer_not_attached_to_pivota_pdp` or `offer_sku_variant_mismatch`
- refined fix target includes `pivota_offer_layer` or `pivota_product_graph`
- `offer_attachment_patch` generated

### Clean offer

Setup:

- merchant offer source and Pivota offer state agree on price, promo/coupon, inventory, PDP attachment, and SKU/variant

Expected:

- finding: `clean_offer`
- `offer_readiness_score` is high
- confidence is high when both source and Pivota offer are present
- no new offer issue is generated

## Production Smoke Checklist

Use a production-safe demo tenant or gated internal seed flow that can create `MerchantOffer` and `PivotaOffer` fixtures.

Checklist:

- Run clean offer diagnosis.
- Confirm `offer_readiness_score` is high.
- Confirm no new offer issue is generated for clean offer.
- Run price mismatch diagnosis where merchant source price differs from Pivota offer price.
- Confirm finding includes `price_mismatch`.
- Confirm refined fix target is `pivota_offer_layer` or `both_merchant_and_pivota`.
- Confirm `pivota_offer_patch` is generated and readable.
- Run expired coupon diagnosis where merchant coupon is expired and Pivota coupon remains active.
- Confirm finding includes `expired_coupon` or `promo_mismatch`.
- Confirm refined fix target includes `pivota_offer_layer`.
- Confirm `promo_state_patch` is generated and readable.
- Open `/agent-center/issues/:issueId`.
- Confirm the page displays `Offer Execution Diagnosis`.
- Confirm merchant offer source and Pivota offer state are understandable.
- Confirm patch recommendation JSON is readable.
- Run `POST /api/agent-center/issues/:issueId/attach-offer-diagnosis-to-retest`.
- Confirm `issue.evidence.offer_execution_attached_to_retest_plan` is set.
- Confirm `issue.verification_plan.target_improvement` references the Offer Execution diagnosis.
- Confirm usage event fields:
  - `agent_type = offer_execution_agent`
  - `workflow_type = offer_readiness`
  - `event_type = offer_verification_credit`
  - `billing_mode = preview_only`
  - `billing_status = not_invoiced`

## Production Smoke Summary

Production deployment validated on 2026-05-01:

```text
https://pivota-merchants-portal-clean.vercel.app
```

Observed:

- production deployment status: `Ready`
- `GET /api/agent-center/usage` returned `billing_mode = preview_only` and `billing_status = not_invoiced`
- a minimal Gemini demand scan created preview-only `ai_test_credit` usage events
- a Pivota attribution negative-control scan generated Demand Test issues
- `POST /api/agent-center/issues/:issueId/offer-diagnosis` returned an `OfferExecutionDiagnosis`
- `GET /api/agent-center/issues/:issueId/offer-diagnosis` returned diagnosis and debug payload
- `POST /api/agent-center/issues/:issueId/attach-offer-diagnosis-to-retest` updated the verification plan
- `offer_verification_credit` usage event remained `preview_only` / `not_invoiced`
- Issue Detail rendered the `Offer Execution Diagnosis` section after authenticated browser smoke setup

The production smoke issue did not include merchant/Pivota offer fixtures, so it correctly routed to `human_review_required` with a fallback `merchant_offer_patch`.

## Known Limitations

- V1 does not verify checkout execution.
- V1 does not validate PSP/payment authorization.
- V1 does not validate payment tokens.
- V1 does not write orders back to merchant systems.
- V1 does not handle refunds or settlement.
- V1 does not perform order-level GMV attribution.
- V1 usage is preview-only and not invoiced.
- Current production demo seeding is disabled by default.
- Current production APIs do not expose a safe external fixture writer for `MerchantOffer` and `PivotaOffer`.
- Production custom offer positive/negative smoke cases are limited by in-memory serverless state unless a production-safe demo tenant or persistent fixture store is added.
- Automated tests cover clean offer, price mismatch, expired coupon, inventory mismatch, missing offer, attachment mismatch, API behavior, UI rendering, and usage event idempotency.

## Validation Commands

Run before merging or deploying changes that affect this agent:

```bash
npm run test:agent-center
npm run lint
npm run build
```

