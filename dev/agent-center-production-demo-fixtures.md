# Agent Center Production Demo Fixtures

Last updated: 2026-05-01

## Purpose

Production demo fixtures provide a safe internal-only way to seed controlled Agent Center records for production smoke testing.

The first supported use case is Offer Execution Agent V1 smoke validation. The fixture system can create merchant store/product/SKU/offer records, Pivota offer state, scan target context, and an issue that can be passed to `POST /api/agent-center/issues/:issueId/offer-diagnosis`.

This is not a merchant feature and must not be exposed in Merchant Portal UI.

## Internal-Only Restriction

Routes live under:

```text
POST   /api/internal/agent-center/demo-fixtures
GET    /api/internal/agent-center/demo-fixtures/:fixtureId
DELETE /api/internal/agent-center/demo-fixtures/:fixtureId
```

These routes are separate from merchant-facing Agent Center APIs and are not linked from any page. In the current Vercel deployment they are rewritten to the shared Agent Center API handler so fixture create, diagnosis, and cleanup run against the same in-memory Agent Center state during smoke tests.

## Enablement Flag

The routes require:

```text
ENABLE_INTERNAL_DEMO_FIXTURES=true
```

When the flag is missing or not `true`, every route returns HTTP 403.

## Auth Requirement

The routes require an internal secret. Configure one of:

```text
PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET
INTERNAL_DEMO_FIXTURE_TOKEN
PIVOTA_INTERNAL_API_SECRET
```

Send the secret using either:

```text
Authorization: Bearer {secret}
```

or:

```text
x-pivota-internal-secret: {secret}
```

or:

```text
x-internal-demo-fixture-token: {secret}
```

If the feature flag is enabled but no internal secret is configured, routes return HTTP 403.

## Supported Fixture Types

Fixture manifests can include:

- `merchant_store`
- `scan_target`
- `product_entity`
- `pivota_unified_pdp`
- `merchant_product`
- `merchant_sku`
- `merchant_offer`
- `pivota_offer`
- `agentic_gmv_issue`

The current implementation also tags tied runtime records such as query clusters and platform connections so cleanup can remove the complete fixture context.

## Fixture Metadata

Every fixture-owned record is tagged with:

- `demo_fixture = true`
- `fixture_id`
- `created_by = internal`
- `created_at`
- `expires_at`
- `ttl_minutes`
- `environment`
- `cleanup_status`

The manifest itself is stored as a `DemoFixture` record in backend state.

## Request Shape

Create a fixture:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/demo-fixtures" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "preset": "price_mismatch",
    "ttl_minutes": 60,
    "environment": "production-smoke"
  }'
```

Fetch a fixture manifest and live records:

```bash
curl "$BASE_URL/api/internal/agent-center/demo-fixtures/$FIXTURE_ID" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET"
```

Delete a fixture and tied records:

```bash
curl -X DELETE "$BASE_URL/api/internal/agent-center/demo-fixtures/$FIXTURE_ID" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET"
```

## Supported Fixture Presets

### `clean_offer`

Creates:

- merchant store/product/SKU
- merchant offer
- matching Pivota offer
- scan target and query cluster
- fixture issue for offer diagnosis

Expected smoke result:

- finding: `clean_offer`
- `offer_readiness_score` high
- no new offer issue generated
- usage remains `preview_only` / `not_invoiced`

### `price_mismatch`

Creates a merchant offer at the source price and a Pivota offer with a different price.

Expected smoke result:

- finding: `price_mismatch`
- refined fix target includes `pivota_offer_layer` or `both_merchant_and_pivota`
- `pivota_offer_patch` generated

### `expired_coupon`

Creates an expired merchant coupon while Pivota still exposes active coupon state.

Expected smoke result:

- finding: `expired_coupon` or `promo_mismatch`
- refined fix target includes `pivota_offer_layer`
- `promo_state_patch` generated

### `inventory_mismatch`

Creates merchant inventory as out of stock while Pivota offer state remains in stock.

Expected smoke result:

- finding: `inventory_mismatch`
- refined fix target includes `pivota_offer_layer` and `merchant_inventory_source`
- `inventory_sync_patch` generated

### `missing_pivota_offer`

Creates a merchant offer without a matching Pivota offer.

Expected smoke result:

- finding: `missing_offer`
- refined fix target includes `pivota_offer_layer`
- `pivota_offer_patch` generated

## Cleanup Behavior

`DELETE /api/internal/agent-center/demo-fixtures/:fixtureId` removes records tied to the fixture, including:

- stores
- platform connections
- scan targets
- readiness snapshots
- query clusters
- jobs, runs, and raw results tied to fixture scan targets
- parsed recommendations and match results tied to fixture runs/clusters
- scores
- issues
- merchant offers
- Pivota offers
- Product Understanding diagnoses tied to fixture issues
- Offer Execution diagnoses tied to fixture issues
- retest preparations and verification runs tied to fixture issues/targets
- usage events tied to fixture scan targets, query clusters, or issue idempotency keys

The fixture manifest remains for audit with `cleanup_status = deleted`.

The service helper `cleanupExpiredDemoFixtures()` removes active fixture records whose `expires_at` is in the past and marks the manifest `cleanup_status = expired`.

## Production Smoke Flow

1. Create fixture with the required preset.
2. Read `issue.id` from the response.
3. Run:

```text
POST /api/agent-center/issues/:issueId/offer-diagnosis
```

4. Optionally open:

```text
/agent-center/issues/:issueId
```

5. Verify:

- `Offer Execution Diagnosis` appears in Issue Detail.
- finding type matches preset expectation.
- patch recommendation is readable.
- `UsageEvent.agent_type = offer_execution_agent`
- `UsageEvent.workflow_type = offer_readiness`
- `UsageEvent.event_type = offer_verification_credit`
- `UsageEvent.billing_mode = preview_only`
- `UsageEvent.billing_status = not_invoiced`

6. Delete the fixture.

## Known Limitations

- Fixtures are internal-only and disabled unless explicitly enabled.
- Fixtures currently use the in-memory Agent Center state, so persistence follows the active serverless instance lifecycle.
- For long-lived production validation, add a persistent fixture store or production-safe demo tenant.
- This system does not implement checkout verification.
- This system does not validate PSP/payment authorization.
- This system does not write orders, refunds, settlement records, invoices, or transaction fees.
- This system does not expose token-level or real billing data to merchants.

## Validation

Automated tests cover:

- disabled route returns 403
- enabled route creates fixture
- fixture records are tagged `demo_fixture`
- clean offer fixture can run offer diagnosis
- price mismatch fixture generates `price_mismatch`
- expired coupon fixture generates `expired_coupon` or `promo_mismatch`
- inventory mismatch fixture works
- missing Pivota offer fixture works
- cleanup removes fixture records
- usage remains `preview_only` / `not_invoiced`

Run:

```bash
npm run test:agent-center
npm run lint
npm run build
```
