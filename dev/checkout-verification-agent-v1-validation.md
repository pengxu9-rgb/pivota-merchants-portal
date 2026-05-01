# Checkout Verification Agent V1 Validation

Last updated: 2026-05-01

## Product Definition

Checkout Verification Agent V1 diagnoses checkout path readiness only. It verifies whether an agent/Pivota-routed offer has a reachable, correctly parameterized checkout path before payment.

The agent runs after Demand Test Agent V1, Product Understanding + SKU Match Agent V1, and Offer Execution Agent V1. It consumes an `AgenticGMVIssue`, related offer state, merchant checkout source metadata, and Pivota checkout path state, then produces a deterministic `CheckoutVerificationDiagnosis`.

V1 is pre-payment readiness verification. A positive result means checkout handoff appears ready enough for an agent-facing path. It does not prove payment success, order creation, fulfillment, settlement, or final GMV attribution.

## V1 Scope

Checkout Verification Agent V1 checks:

- checkout URL/session presence
- checkout URL deterministic preflight status
- cart handoff URL or payload completeness
- SKU / variant / quantity parameters
- coupon / promo passthrough parameters
- merchant checkout domain consistency
- stale or expired checkout session
- redirect/path availability at the preflight level
- missing checkout path
- checkout path attachment to the correct merchant offer / Pivota offer

Supported findings:

- `missing_checkout_path`
- `checkout_url_unreachable`
- `stale_checkout_session`
- `cart_handoff_missing_required_param`
- `variant_param_missing`
- `quantity_param_missing`
- `coupon_param_missing`
- `checkout_domain_mismatch`
- `checkout_not_attached_to_pivota_offer`
- `checkout_offer_sku_mismatch`
- `human_review_required`
- `clean_checkout_path`

## Explicit Exclusions

Checkout Verification Agent V1 does not implement:

- PSP authorization
- payment tokens
- card tokenization
- real payment execution
- real order placement
- order write-back
- refunds
- fulfillment
- settlement
- transaction fees
- real billing
- final order-level GMV attribution

Any UI or API output that says checkout-ready in V1 means pre-payment checkout path readiness only.

## Data Models

### `MerchantCheckoutPath`

Merchant source metadata for a checkout/cart path.

Key fields:

- `id`
- `merchant_id`
- `store_id`
- `merchant_offer_id`
- `sku_id`
- `checkout_url`
- `cart_url`
- `checkout_domain`
- `required_params`
- `supported_params`
- `coupon_param_name`
- `quantity_param_name`
- `variant_param_name`
- `expires_at`
- `last_verified_at`
- `source`

### `PivotaCheckoutPath`

Pivota agent-facing checkout path state attached to a Pivota offer.

Key fields:

- `id`
- `pivota_offer_id`
- `product_entity_id`
- `merchant_id`
- `store_id`
- `sku_id`
- `checkout_url`
- `cart_handoff_payload`
- `checkout_domain`
- `required_params`
- `coupon_code`
- `quantity`
- `variant_id`
- `execution_status`
- `attached_to_pivota_offer`
- `last_verified_at`

### `CheckoutVerificationDiagnosis`

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
- `merchant_checkout_path_id`
- `pivota_checkout_path_id`
- `source_agent = checkout_verification_agent`
- `checkout_layer_findings`
- `root_cause_summary`
- `refined_fix_targets`
- `patch_recommendations`
- `checkout_readiness_score`
- `confidence`
- `usage_event_ids`
- `created_at`

### `CheckoutPathComparison`

Compares merchant checkout source with Pivota checkout path state.

Key fields:

- `merchant_checkout_path`
- `pivota_checkout_path`
- `checkout_url_preflight_status`
- `checkout_url_status_code`
- `cart_handoff_required_params`
- `missing_params`
- `coupon_passthrough_consistent`
- `domain_consistent`
- `session_fresh`
- `attached_to_pivota_offer`
- `sku_variant_consistent`
- `findings`

### `CheckoutReadinessFinding`

One detected checkout readiness finding.

Key fields:

- `finding_type`
- `severity`
- `field`
- `merchant_value`
- `pivota_value`
- `evidence`
- `fix_target`

### `CheckoutPatchRecommendation`

Deterministic recommended patch.

Patch types:

- `merchant_checkout_patch`
- `pivota_checkout_patch`
- `cart_handoff_payload_patch`
- `coupon_passthrough_patch`
- `checkout_attachment_patch`
- `checkout_domain_patch`

## API Routes

Issue-scoped routes:

- `GET /api/agent-center/issues/:issueId/checkout-diagnosis`
- `POST /api/agent-center/issues/:issueId/checkout-diagnosis`
- `POST /api/agent-center/issues/:issueId/regenerate-checkout-patch`
- `POST /api/agent-center/issues/:issueId/attach-checkout-diagnosis-to-retest`

Issue Detail UI route:

- `/agent-center/issues/:issueId`

The Issue Detail page includes a `Checkout Verification Diagnosis` section showing checkout readiness, merchant checkout path, Pivota checkout path, preflight status, required params, missing params, coupon passthrough status, domain consistency, root cause, patch recommendations, refined fix targets, confidence, and usage status.

## Fix Target Rules

| Finding | Typical refined fix target |
|---|---|
| Missing merchant and Pivota checkout path | `both_merchant_and_pivota`, `merchant_checkout_source`, `pivota_checkout_layer` |
| Merchant checkout source exists but Pivota path is missing | `pivota_checkout_layer` |
| Pivota checkout URL is unreachable | `pivota_checkout_layer` |
| Checkout session is stale or expired | `merchant_checkout_source` |
| Cart handoff required param missing | `pivota_checkout_layer`, `merchant_cart_config` |
| Variant parameter missing | `pivota_checkout_layer`, `merchant_cart_config` |
| Quantity parameter missing | `pivota_checkout_layer`, `merchant_cart_config` |
| Coupon parameter missing | `pivota_checkout_layer`, `merchant_promo_source` |
| Checkout domain mismatch | `pivota_checkout_layer` |
| Checkout path not attached to Pivota offer | `pivota_offer_layer` |
| Checkout SKU/variant mismatch | `pivota_product_graph` |
| Ambiguous evidence | `human_review` |

Supported fix target values added for checkout:

- `merchant_checkout_source`
- `pivota_checkout_layer`
- `merchant_cart_config`

Existing shared targets may also be used:

- `pivota_offer_layer`
- `merchant_promo_source`
- `pivota_product_graph`
- `both_merchant_and_pivota`
- `human_review`

## Patch Generation Rules

Patch recommendations are deterministic.

- `merchant_checkout_patch` is generated when checkout source metadata is missing or ambiguous.
- `pivota_checkout_patch` is generated when Pivota checkout path is missing, unreachable, or stale relative to merchant source.
- `cart_handoff_payload_patch` is generated when required handoff params, variant, or quantity are missing.
- `coupon_passthrough_patch` is generated when coupon/promo passthrough is missing.
- `checkout_attachment_patch` is generated when checkout path is not attached to the Pivota offer or points to the wrong SKU/variant.
- `checkout_domain_patch` is generated when Pivota checkout domain differs from merchant checkout source domain.

Clean checkout paths should produce high readiness and should not create a new issue.

## Usage Event Contract

Checkout Verification Agent V1 emits deterministic preview-only usage events:

- `agent_type = checkout_verification_agent`
- `source_agent = checkout_verification_agent`
- `workflow_type = checkout_readiness`
- `event_type = checkout_verification_credit`
- `provider = internal`
- `model = checkout-verification-deterministic-v1`
- `billing_mode = preview_only`
- `billing_status = not_invoiced`

Idempotency key format:

```text
checkout_verification:{issue_id}:checkout_readiness:v1
```

Patch regeneration creates a new diagnosis ID for traceability, but reuses the same idempotent usage event for the issue-level checkout readiness workflow.

## Controlled Scenarios

Automated coverage lives in `tests/agent-center/demand-test-agent.test.mjs`.

### Clean checkout path

Setup:

- merchant checkout source exists
- matching Pivota checkout path exists
- URL preflight passes
- required variant and quantity params are present
- domain and offer attachment match

Expected:

- finding: `clean_checkout_path`
- `checkout_readiness_score = 100`
- confidence high
- no new issue generated
- usage remains `preview_only` / `not_invoiced`

### Missing checkout path

Setup:

- offer exists
- no merchant checkout source or Pivota checkout path exists

Expected:

- finding: `missing_checkout_path`
- refined fix targets include `merchant_checkout_source` and `pivota_checkout_layer`
- `merchant_checkout_patch` generated

### Unreachable checkout URL

Setup:

- Pivota checkout URL fails deterministic preflight

Expected:

- finding: `checkout_url_unreachable`
- preflight status `failed`
- `pivota_checkout_patch` generated

### Missing variant param

Setup:

- merchant source requires variant param
- Pivota cart handoff payload and variant field omit it

Expected:

- finding: `variant_param_missing`
- refined fix target includes `merchant_cart_config`
- `cart_handoff_payload_patch` generated

### Missing coupon param

Setup:

- merchant offer has active coupon
- checkout source requires coupon passthrough param
- Pivota cart handoff omits coupon param

Expected:

- finding: `coupon_param_missing`
- refined fix targets include `pivota_checkout_layer` and `merchant_promo_source`
- `coupon_passthrough_patch` generated

### Stale checkout session

Setup:

- merchant checkout source expiration is in the past

Expected:

- finding: `stale_checkout_session`
- refined fix target includes `merchant_checkout_source`

### Checkout domain mismatch

Setup:

- merchant checkout domain and Pivota checkout domain differ

Expected:

- finding: `checkout_domain_mismatch`
- `checkout_domain_patch` generated

### Checkout not attached to offer

Setup:

- Pivota checkout path exists but `attached_to_pivota_offer = false`

Expected:

- finding: `checkout_not_attached_to_pivota_offer`
- refined fix target includes `pivota_offer_layer`
- `checkout_attachment_patch` generated

## Internal Demo Fixture Presets

Internal-only fixture presets now include:

- `clean_checkout_path`
- `missing_checkout_path`
- `checkout_url_unreachable`
- `missing_variant_param`
- `missing_coupon_param`
- `stale_checkout_session`
- `checkout_domain_mismatch`
- `checkout_not_attached_to_offer`

These routes remain gated by:

- `ENABLE_INTERNAL_DEMO_FIXTURES=true`
- an internal auth secret sent through `Authorization: Bearer ...` or supported internal headers

They are not exposed in merchant UI.

## Production Smoke Checklist

1. Create a fixture with `clean_checkout_path`.
2. Run `POST /api/agent-center/issues/:issueId/checkout-diagnosis`.
3. Verify finding `clean_checkout_path`, high readiness, no new issue, and UsageEvent `preview_only / not_invoiced`.
4. Create a fixture with `checkout_url_unreachable`.
5. Run checkout diagnosis and verify `checkout_url_unreachable`, failed preflight, and readable `pivota_checkout_patch`.
6. Create a fixture with `missing_coupon_param`.
7. Run checkout diagnosis and verify `coupon_param_missing`, `coupon_passthrough_patch`, and fix targets including `pivota_checkout_layer` / `merchant_promo_source`.
8. Open Issue Detail and verify the `Checkout Verification Diagnosis` section renders.
9. Verify `regenerate-checkout-patch` works and remains usage-idempotent.
10. Verify `attach-checkout-diagnosis-to-retest` updates the retest plan.
11. Delete every fixture and confirm checkout fixture records and usage events are cleaned up.

## Known Limitations

- URL preflight is deterministic in V1 and intended for readiness validation, not full browser checkout automation.
- V1 does not validate PSP/payment authorization or payment token state.
- V1 does not place orders or write order records.
- V1 does not perform refund, fulfillment, settlement, or transaction-fee checks.
- V1 does not attribute final GMV to a completed checkout.
- Internal demo fixtures use in-memory Agent Center state, so persistence follows the active serverless instance lifecycle.
- A persistent production-safe demo tenant is recommended for longer-lived smoke validation.

## Validation

Automated validation covers:

- clean checkout path gives high readiness and no new issue
- missing checkout path
- unreachable checkout URL
- missing variant parameter
- missing coupon parameter
- stale checkout session
- checkout domain mismatch
- checkout path not attached to Pivota offer
- UsageEvent idempotency
- Issue Detail rendering
- internal fixture cleanup for checkout records
- existing Demand Test, Product Understanding, and Offer Execution tests

