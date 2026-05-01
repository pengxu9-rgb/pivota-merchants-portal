# Issue Resolution Workflow V1 Validation

## Product Definition

Issue Resolution Workflow V1 turns Agent Center blockers into deterministic resolution plans with owners, fix targets, recommended patches, approval state, and a retest path.

It sits after the existing Agent Center agents:

- Demand Test Agent
- Product Understanding + SKU Match Agent
- Offer Execution Agent
- Checkout Verification Agent
- GMV Assurance Overview

The workflow does not diagnose a new class of issue. It converts existing `AgenticGMVIssue` records and attached diagnosis outputs into an actionable remediation workflow.

## Scope

V1 supports deterministic plan generation for:

- `merchant_store_attribution_gap`
- `pivota_pdp_attribution_gap`
- `unverified_pivota_attribution`
- `missing_attribute`
- `pivota_pdp_readiness_gap`
- `price_mismatch`
- `expired_coupon`
- `coupon_param_missing`
- `checkout_url_unreachable`

For each supported blocker, the workflow creates:

- owner and owner team
- refined fix targets
- root cause hypothesis
- recommended actions
- patch payload previews
- approval requirements
- verification plan
- retest result metadata
- preview-only `UsageEvent`

## Out Of Scope

Issue Resolution Workflow V1 does not implement:

- new LLM providers
- new diagnosis agents
- PSP authorization
- payment tokens
- real checkout execution
- order placement
- order write-back
- refunds
- settlement
- transaction fees
- real billing
- automatic merchant-site write-back

## Data Model

### IssueResolutionPlan

Fields:

- `id`
- `issue_id`
- `merchant_id`
- `store_id`
- `scan_target_id`
- `blocker_type`
- `source_agent = resolution_workflow`
- `status`
- `severity`
- `owner_type`
- `owner_team`
- `fix_targets`
- `root_cause_hypothesis`
- `recommended_actions`
- `approval_required`
- `merchant_approval_status`
- `pivota_internal_status`
- `verification_plan`
- `retest_result`
- `usage_event_ids`
- `created_at`
- `updated_at`

### RecommendedAction

Fields:

- `id`
- `action_type`
- `title`
- `description`
- `target_layer`
- `requires_merchant_approval`
- `can_apply_automatically`
- `patch_payload`
- `status`
- `evidence`
- `expected_impact`

## Owner Model

Owner types:

- `merchant`
- `pivota_ops`
- `pivota_eng`
- `shared`
- `human_review`

V1 routing:

- Merchant attribution and missing merchant/Pivota product data usually route to `shared`.
- Pivota PDP attribution and Pivota PDP readiness gaps route to `pivota_ops`.
- Checkout URL availability routes to `pivota_eng`.
- Unsupported blockers route to `human_review`.

## Action Model

Actions are deterministic by blocker type.

### merchant_store_attribution_gap

Actions:

- `merchant_pdp_structured_data_patch`
- `pivota_product_graph_buying_path_binding`
- `pivota_unified_pdp_source_reference_patch`
- `rerun_merchant_store_attribution_test`

### pivota_pdp_attribution_gap

Actions:

- `publish_or_verify_pivota_pdp_url`
- `bind_product_object_id`
- `rerun_pivota_pdp_attribution_test`

### unverified_pivota_attribution

Actions:

- `require_verified_pivota_url_or_object_id`
- `update_pivota_product_graph_object_reference`
- `rerun_pivota_pdp_attribution_test`

### missing_attribute

Actions:

- `merchant_source_patch`
- `pivota_unified_pdp_patch`
- `rerun_product_understanding_diagnosis`

### pivota_pdp_readiness_gap

Actions:

- `pivota_unified_pdp_patch`
- `pivota_product_graph_patch`
- `rerun_product_understanding_diagnosis`

### price_mismatch

Actions:

- `pivota_offer_patch`
- `rerun_offer_diagnosis`

### expired_coupon

Actions:

- `promo_state_patch`
- `rerun_offer_diagnosis`

### coupon_param_missing

Actions:

- `coupon_passthrough_patch`
- `rerun_checkout_diagnosis`

### checkout_url_unreachable

Actions:

- `pivota_checkout_patch`
- `rerun_checkout_diagnosis`

## Status Flow

Plan statuses:

- `draft`
- `assigned`
- `waiting_merchant_approval`
- `in_progress`
- `ready_for_retest`
- `retesting`
- `resolved`
- `rejected`
- `ignored`

Recommended action statuses:

- `proposed`
- `approved`
- `applied`
- `rejected`
- `skipped`

Default flow:

1. Generate plan.
2. Approve merchant-required actions.
3. Apply actions.
4. Retest using the verification plan.
5. Review retest result before marking resolved.

## Approval Rules

Merchant-layer actions require merchant approval when they would affect merchant PDP/catalog data or merchant-owned source metadata.

Examples:

- `merchant_pdp_structured_data_patch` requires merchant approval.
- `merchant_source_patch` requires merchant approval.

Pivota internal actions can be marked applicable automatically in V1, but they still only update the plan state and patch preview. V1 does not write to production product, offer, checkout, or merchant systems automatically.

## Retest Rules

Resolution retest reuses the affected issue context and routes to the correct existing agent:

- Merchant attribution gaps use Demand Test retest with `merchant_store_attribution_test`.
- Pivota attribution gaps use Demand Test retest with `pivota_pdp_attribution_test`.
- Missing attributes and Pivota PDP readiness gaps rerun Product Understanding diagnosis.
- Price mismatch and expired coupon rerun Offer Execution diagnosis.
- Coupon passthrough and unreachable checkout URL rerun Checkout Verification diagnosis.

Retest preserves the existing Agent Center preview-only usage semantics.

## API Routes

Merchant-facing routes:

- `GET /api/agent-center/issues/:id/resolution-plan`
- `POST /api/agent-center/issues/:id/resolution-plan`
- `PATCH /api/agent-center/issues/:id/resolution-plan`
- `POST /api/agent-center/issues/:id/resolution-plan/actions/:actionId/approve`
- `POST /api/agent-center/issues/:id/resolution-plan/actions/:actionId/apply`
- `POST /api/agent-center/issues/:id/resolution-plan/retest`

## UI Integration

Issue Detail includes a `Resolution Plan` section showing:

- owner
- status
- root cause hypothesis
- fix targets
- recommended actions
- approval state
- patch preview
- verification plan
- retest button
- retest result
- preview usage state

GMV Assurance Overview links top blockers to the issue detail resolution plan section. When a resolution plan exists, the overview next best action is pulled from the first unresolved recommended action.

## Usage Metering

Plan generation emits:

- `agent_type = resolution_workflow`
- `workflow_type = issue_resolution`
- `event_type = resolution_plan_credit`
- `provider = internal`
- `model = issue-resolution-deterministic-v1`
- `billing_mode = preview_only`
- `billing_status = not_invoiced`

Merchant UI must continue to show credits/usage only. It must not expose token-level provider cost.

## Known Limitations

- V1 creates patch previews and workflow state only; it does not write patches into merchant or Pivota production systems.
- Resolution retest does not prove that a merchant actually published a PDP change unless the upstream source data has changed.
- Unsupported issue types route to human review.
- Plan state is backed by the current Agent Center in-memory state in development/demo flows; persistent production storage should be added before long-running operational use.
- Billing remains preview-only and not invoiced.

## Validation Commands

Run:

```bash
npm run test:agent-center
npm run lint
npm run build
```

Expected:

- all Agent Center tests pass
- lint passes
- build passes
- existing Demand/Product/Offer/Checkout/GMV Assurance semantics remain unchanged
