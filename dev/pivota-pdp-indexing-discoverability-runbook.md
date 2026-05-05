# Pivota PDP Indexing and Discoverability Runbook

## Purpose

Agent Center can apply Pivota-owned optimizations to the Pivota PDP, product graph,
structured data, source references, sitemap state, and product intelligence layer.
Those changes improve Pivota-owned readiness, but search-grounded discovery may
not improve until the public Pivota PDP is indexable, crawlable, structured, and
ingested by search systems.

Use this runbook to close the operational gap between "Pivota-owned optimization
applied" and "Gemini search-grounded discovery returned the Pivota PDP."

## When To Use

Use this runbook when:

- `pivota_pdp_not_discovered` persists after Pivota-owned optimization.
- `search_grounded_pivota_pdp_discovery_score = 0` after rerun.
- Merchant-facing report status is `applied_no_uplift`.
- The report says Pivota-owned readiness was updated, but search-grounded
  discovery has not yet returned the Pivota PDP.

Do not claim discovery uplift until a rerun shows a measured score improvement.

## Search Console Readiness

Current Agent Center runtime can verify public crawlability signals, sitemap
presence, and canonical ProductEntity URLs. It cannot verify Google Search
Console ownership unless an operator with Search Console access records that
evidence.

Before treating indexing work as operationally complete, record:

- Whether a Google Search Console property exists for `agent.pivota.cc`.
- Whether `https://agent.pivota.cc/sitemap.xml` has been submitted.
- Whether the canonical ProductEntity PDP URL is inspectable through URL
  Inspection.
- Whether indexing can be requested for that canonical URL.
- The user-declared canonical and Google-selected canonical when URL Inspection
  exposes them.
- The operator, timestamp, evidence note, and optional screenshot/reference URL.

If any item cannot be verified, mark the corresponding indexing task as
`blocked` or keep it `proposed`. Do not infer Search Console readiness from an
HTTP 200 PDP audit alone.

Completion rules are intentionally strict:

- `validate_search_console` cannot be completed until
  `search_console_property_verified=true`.
- `submit_sitemap` cannot be completed until `sitemap_submitted=true`.
- `request_indexing` cannot be completed unless URL Inspection status is
  `inspectable`, `indexed`, or `indexing_requested`, and
  `indexing_requested=true`.
- Search Console evidence, sitemap submission, and indexing requests never set
  `uplift_claim_allowed=true`. Only a measured search-grounded rerun where the
  canonical Pivota PDP or verified alias is returned can do that.

## ProductEntity Index Registry

Agent Center now keeps a DB-backed `ProductEntityIndexRecord` registry for
public PDP indexing eligibility. This registry is the safe source for
`agent.pivota.cc` product sitemap and internal-link surfaces.

The registry stores, per canonical ProductEntity:

- `product_entity_id`, which must be a canonical `sig_*` ID
- `canonical_url`, always `https://agent.pivota.cc/products/{sig_*}`
- external seed/source aliases, kept as source references only
- product name, brand, category, and source update timestamp
- `pdp_content_status`
- `indexability_status`
- `sitemap_eligible`
- Google/Search Console evidence status
- Gemini search-grounded measurement status
- failure reasons

Eligibility is fail-closed:

- `ext_*` URLs are never canonical sitemap URLs.
- records with no real `get_pdp_v2` content stay out of sitemap.
- generic app-shell PDPs stay out of sitemap.
- fabricated fallback content is not allowed.
- Search Console submission or indexing request does not prove uplift.

Bootstrap note: a ProductEntity can become sitemap eligible after main-path PDP
content and production HTML/JSON-LD checks pass. The first audit may still record
`missing_sitemap_entry`; after the record enters sitemap, a follow-up audit
should clear that finding.

Internal registry routes:

```text
POST /api/internal/agent-center/product-entity-index/sync
POST /api/internal/agent-center/product-entity-index/verify-content
POST /api/internal/agent-center/product-entity-index/audit
POST /api/internal/agent-center/product-entity-index/gemini-rerun
POST /api/internal/agent-center/product-entity-index/run-batch
GET  /api/internal/agent-center/product-entity-index/summary
GET  /api/internal/agent-center/product-entity-index/batch-runs
```

The shared Agent Center path is also supported:

```text
POST /api/agent-center/internal-product-entity-index/sync
POST /api/agent-center/internal-product-entity-index/verify-content
POST /api/agent-center/internal-product-entity-index/audit
POST /api/agent-center/internal-product-entity-index/gemini-rerun
POST /api/agent-center/internal-product-entity-index/run-batch
GET  /api/agent-center/internal-product-entity-index/summary
GET  /api/agent-center/internal-product-entity-index/batch-runs
```

All internal routes require `ENABLE_INTERNAL_PRODUCTION_VALIDATION=true` and the
internal production validation secret.

Public safe registry endpoint for `agent.pivota.cc` sitemap generation:

```text
GET /api/agent-center/product-entity-index/public
```

It returns only `sitemap_eligible=true` canonical records and must not expose DB
URLs, secrets, raw provider payloads, prompt traces, or token-level costs.

Example sync:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/product-entity-index/sync" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "limit": 250,
    "page_size": 100,
    "max_pages": 10,
    "verify_content": true
  }'
```

Recommended batch runner:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/product-entity-index/run-batch" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "stage": "auto",
    "run_id": "optional_existing_run_id",
    "sync_limit": 50,
    "page_size": 50,
    "max_pages": 1,
    "verify_limit": 5,
    "audit_limit": 5,
    "gemini_limit": 5,
    "include_gemini": false
  }'
```

The batch runner persists `next_page`, `next_cursor`, `has_more`,
`stages_completed`, and the last compact result. It intentionally advances in
small batches:

1. `sync`: page through a ProductEntity source and store canonical `sig_*`
   candidates without verifying content. The default source is gateway
   `get_discovery_feed` with anonymous browse context. For the full
   external-seed backlog, prefer
   `AGENT_CENTER_PRODUCT_ENTITY_INDEX_SYNC_SOURCE=gateway_product_entity_index_feed`
   once the agent gateway exposes `get_product_entity_index_feed`; this keeps
   backend DB credentials out of the portal. If an internal read-only source DB
   is explicitly approved, `backend_external_seeds` plus
   `AGENT_CENTER_PRODUCT_ENTITY_SOURCE_DATABASE_URL` can read approved
   `pdp_identity_listing` mappings directly.
2. `verify_content`: call `get_pdp_v2` main/source-alias path only for records
   that have not already been content-verified.
3. `audit`: fetch the production PDP as Googlebot-facing public HTML and verify
   title/H1, canonical, server-rendered identity, Product JSON-LD, source
   signals, and sitemap inclusion.
4. `gemini_rerun`: only when `include_gemini=true`, run
   `search_grounded_product_discovery_test` against `sitemap_eligible=true`
   records that have not yet been tested.

This is the preferred operating mode for the ~4000 PDP backlog. Do not run the
full production validation harness concurrently for bulk ProductEntity exposure
measurement.

Gateway browse sync is useful for smoke tests, but it is not the complete
external-seed corpus. The 4000-product rollout should use
`gateway_product_entity_index_feed` or an approved `backend_external_seeds`
source; records still fail closed unless `get_pdp_v2` returns real main-path
content and the production Googlebot audit passes.

Example production audit:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/product-entity-index/audit" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "limit": 50
  }'
```

Example scoped Gemini rerun:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/product-entity-index/gemini-rerun" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "product_entity_ids": ["sig_7ad40676c42fb9c96e2a8136"],
    "limit": 1
  }'
```

The Gemini rerun is scoped only to `search_grounded_product_discovery_test`.
It does not run organic discovery, contextual attribution, offer diagnosis, or
checkout diagnosis.

## Checklist

- `robots.txt` allows crawling `agent.pivota.cc/products/*`.
- Pivota PDP HTTP status returns `200`.
- PDP has no auth wall, login wall, preview gate, or internal-only gate.
- Meta robots allows `index, follow`.
- Canonical URL points to the public Pivota PDP.
- Product title and brand are visible in server-rendered HTML.
- Overview or product description is visible in server-rendered HTML.
- `Product` JSON-LD is present.
- `Offer` or `AggregateOffer` JSON-LD is present when offers exist.
- Verified merchant source reference is visible.
- Source merchant PDP URL is visible or machine-readable.
- Product object ID is visible or machine-readable.
- `sitemap.xml` points to `sitemap-products.xml`.
- `sitemap-products.xml` includes the canonical ProductEntity PDP URL.
- Product sitemap excludes `ext_*` alias URLs and query-param URLs.
- Sitemap is submitted to Google Search Console.
- Key Pivota PDP URLs are requested for indexing.
- Page passes Rich Results or schema validation where applicable.
- Internal Pivota pages link to the PDP from relevant product/category/discovery
  surfaces.
- No duplicate canonical conflict points search systems to a different URL.

## Internal Agent Center Audit

Pivota operators can run the same checklist through the internal Agent Center
indexability audit endpoint:

```bash
BASE_URL="https://pivota-merchants-portal-clean.vercel.app"
PIVOTA_PDP_URL="https://agent.pivota.cc/products/pe_isntree_watery_sun_gel"
MERCHANT_PDP_URL="https://www.isntree.com/products/hyaluronic-acid-watery-sun-gel"

curl "$BASE_URL/api/internal/agent-center/pivota-pdp-indexability-audit?url=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$PIVOTA_PDP_URL")&product_name=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "Isntree Hyaluronic Acid Watery Sun Gel")&brand=Isntree&merchant_pdp_url=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$MERCHANT_PDP_URL")&offers_exist=true&product_entity_id=pe_isntree_watery_sun_gel&external_seed_id=ext_d7c74bcb380cbc2bdd5d5d90&canonical_pivota_pdp_url=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$PIVOTA_PDP_URL")" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET"
```

The endpoint is internal-only and gated by the production validation secret. It
returns safe booleans and summaries:

- `audit_status`: `passed`, `needs_work`, or `failed`
- `findings`
- `recommended_fixes`
- `raw_safe_evidence`

It must not return secrets, raw full HTML, raw provider payloads, prompt traces,
or token-level costs.

Recommended fix mapping:

- `missing_product_jsonld` or `incomplete_product_jsonld` ->
  `pivota_product_schema_patch`
- `missing_offer_jsonld` or `incomplete_offer_jsonld` ->
  `pivota_offer_schema_patch`
- `missing_canonical`, `canonical_mismatch`, `noindex`, `robots_blocked`,
  `http_status_failed`, or `auth_wall_detected` -> `pivota_indexability_patch`
- `missing_sitemap_entry` -> `pivota_sitemap_submission`
- `thin_content` -> `pivota_product_intelligence_patch`
- `missing_source_reference` -> `pivota_source_reference_patch`
- `missing_server_rendered_identity` or `missing_product_object_id` ->
  `pivota_discovery_signal_patch`
- `external_seed_used_as_canonical`, `canonical_url_points_to_external_seed`,
  or `product_entity_binding_mismatch` -> `pivota_indexability_patch` plus
  ProductEntity binding review
- `product_entity_missing_source_seed`,
  `product_entity_missing_merchant_source`, or
  `product_entity_missing_merchant_offer` -> source/offer binding patches

Pivota PDPs are ProductEntity-first. A `/products/ext_*` route is a source alias
unless the ID has been explicitly promoted to a ProductEntity. Alias routes
should redirect to the canonical ProductEntity PDP or render a canonical tag
pointing to it. Product JSON-LD should use the canonical ProductEntity URL.

## Validation Commands And Manual Checks

Set the URL first:

```bash
PIVOTA_PDP_URL="https://agent.pivota.cc/products/pe_isntree_watery_sun_gel"
PIVOTA_HOST="https://agent.pivota.cc"
PRODUCT_NAME="Isntree Hyaluronic Acid Watery Sun Gel"
```

Fetch the PDP and verify HTTP status:

```bash
curl -I "$PIVOTA_PDP_URL"
curl -L "$PIVOTA_PDP_URL" -o /tmp/pivota-pdp.html
```

Inspect `robots.txt`:

```bash
curl -L "$PIVOTA_HOST/robots.txt"
curl -L "$PIVOTA_HOST/robots.txt" | grep -Ei "user-agent|allow|disallow|sitemap"
```

Inspect sitemap:

```bash
curl -L "$PIVOTA_HOST/sitemap.xml" | grep -F "$PIVOTA_PDP_URL"
curl -L "$PIVOTA_HOST/sitemap-products.xml" | grep -F "$PIVOTA_PDP_URL"
curl -L "$PIVOTA_HOST/sitemap-products.xml" | grep -F "/products/ext_" && echo "FAIL: ext alias in product sitemap"
```

Inspect the public internal-link surface:

```bash
curl -L "$PIVOTA_HOST/products/indexability" | grep -F "$PIVOTA_PDP_URL"
curl -L "$PIVOTA_HOST/products/indexability/page/2" | grep -F "https://agent.pivota.cc/products/sig_"
```

Verify product name appears in HTML:

```bash
grep -i "$PRODUCT_NAME" /tmp/pivota-pdp.html
```

Verify JSON-LD exists:

```bash
grep -i 'application/ld+json' /tmp/pivota-pdp.html
grep -Ei '\"@type\"[[:space:]]*:[[:space:]]*\"Product\"|\"@type\"[[:space:]]*:[[:space:]]*\"Offer\"|\"@type\"[[:space:]]*:[[:space:]]*\"AggregateOffer\"' /tmp/pivota-pdp.html
```

Verify canonical tag:

```bash
grep -Ei '<link[^>]+rel=["'\"']canonical["'\"']' /tmp/pivota-pdp.html
```

Verify meta robots:

```bash
grep -Ei '<meta[^>]+name=["'\"']robots["'\"']' /tmp/pivota-pdp.html
```

Verify source reference and product object ID:

```bash
grep -Ei 'official_merchant_pdp|source reference|merchant source|isntree.com' /tmp/pivota-pdp.html
grep -Ei 'pe_[a-z0-9_]+|sig_[a-z0-9_]+|ext_[a-z0-9_]+' /tmp/pivota-pdp.html
```

Manual checks:

- Open the PDP in a private browser session and confirm no auth wall appears.
- Run the PDP through Google Rich Results Test or schema validation tooling.
- Confirm Google Search Console has the sitemap submitted for `agent.pivota.cc`.
- Request indexing for the specific Pivota PDP URL when appropriate.

## Internal Indexing Task Tracker

Use the internal task tracker to record the operational indexing work that
cannot be proven from the public PDP audit alone:

```bash
BASE_URL="https://pivota-merchants-portal-clean.vercel.app"
PIVOTA_PDP_URL="https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136"

curl -X POST "$BASE_URL/api/internal/agent-center/pivota-indexing-tasks" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data "{
    \"product_entity_id\": \"sig_7ad40676c42fb9c96e2a8136\",
    \"canonical_pivota_pdp_url\": \"$PIVOTA_PDP_URL\",
    \"task_type\": \"submit_sitemap\",
    \"status\": \"proposed\",
    \"evidence\": {
      \"source\": \"operator_runbook\",
      \"search_console_property_verified\": false,
      \"sitemap_submitted\": false,
      \"sitemap_url\": \"https://agent.pivota.cc/sitemap.xml\",
      \"url_inspection_status\": \"not_checked\",
      \"indexing_requested\": false,
      \"operator\": \"pivota_ops\",
      \"evidence_note\": \"Created before Search Console verification.\",
      \"no_uplift_claim_allowed\": true
    }
  }"
```

Supported task types:

- `submit_sitemap`
- `request_indexing`
- `validate_search_console`
- `add_internal_link`
- `wait_for_indexing_window`
- `scheduled_search_grounded_rerun`
- `rerun_search_grounded_discovery`

Supported statuses:

- `proposed`
- `in_progress`
- `completed`
- `blocked`
- `skipped`

Fetch or update a task:

```bash
curl "$BASE_URL/api/internal/agent-center/pivota-indexing-tasks/$TASK_ID" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET"

curl -X PATCH "$BASE_URL/api/internal/agent-center/pivota-indexing-tasks/$TASK_ID" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "status": "completed",
    "evidence": {
      "operator": "pivota_ops",
      "search_console_property_verified": true,
      "sitemap_submitted": true,
      "sitemap_url": "https://agent.pivota.cc/sitemap.xml",
      "url_inspection_status": "inspectable",
      "indexing_requested": true,
      "indexing_requested_at": "2026-05-04T00:00:00.000Z",
      "evidence_note": "Sitemap submitted and URL inspection request recorded.",
      "screenshot_or_reference_url": "https://search.google.com/search-console/..."
    }
  }'
```

Bulk-create indexing tasks for all sitemap-eligible ProductEntity PDPs:

```bash
curl -X POST "$BASE_URL/api/internal/agent-center/pivota-indexing-tasks/bulk" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "limit": 5000,
    "task_types": [
      "validate_search_console",
      "submit_sitemap",
      "request_indexing",
      "add_internal_link"
    ],
    "evidence": {
      "operator": "pivota_ops",
      "evidence_note": "Bulk queue created for sitemap-eligible canonical ProductEntity PDPs."
    }
  }'
```

The bulk route only reads `sitemap_eligible=true` ProductEntity index records,
uses canonical `sig_*` URLs, deduplicates existing task types per ProductEntity,
and keeps every task as operational evidence. It must not be interpreted as
Google indexing or Gemini uplift.

List ProductEntity task status and rerun state:

```bash
curl "$BASE_URL/api/internal/agent-center/pivota-indexing-tasks?product_entity_id=sig_7ad40676c42fb9c96e2a8136" \
  -H "Authorization: Bearer $PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET"
```

The list response includes current task status, next rerun time, last
search-grounded Pivota PDP discovery score, last returned URLs, and
`uplift_claim_allowed`. It also returns an indexing evidence status and next
recommended operator action:

- `not_started`
- `search_console_needed`
- `sitemap_submitted`
- `indexing_requested`
- `waiting_for_indexing`
- `rerun_due`
- `uplift_verified`
- `no_uplift_yet`

Completing Search Console tasks does not set `uplift_claim_allowed=true`; only a
measured rerun where the canonical Pivota PDP or verified alias is returned can
do that.

Manual rerun plan:

- T+24h: rerun `search_grounded_product_discovery_test`.
- T+72h: rerun `search_grounded_product_discovery_test`.
- T+7d: rerun `search_grounded_product_discovery_test`.

No background scheduler is required for V1. Use `wait_for_indexing_window` and
`scheduled_search_grounded_rerun` tasks to track the manual windows.

The task tracker is internal-only. It records operational evidence, not measured
Gemini discovery uplift.

## Merchant-Safe Pivota Discovery Progress

Merchant-facing reports may show a Pivota Discovery Progress module with safe
statuses only:

- Pivota PDP published
- ProductEntity binding verified
- Product schema added
- Offer schema added when an offer exists
- Merchant source reference added
- Sitemap includes canonical PDP
- Search Console sitemap submitted
- URL inspection or indexing requested
- Waiting for indexing window
- Search-grounded Gemini returned Pivota PDP
- Uplift verified

Do not expose internal task IDs, Search Console screenshots, raw Gemini
grounding metadata, prompt traces, token-level costs, DB URLs, or secrets. If
contextual Pivota attribution passes but search-grounded discovery remains `0`,
use: "Pivota PDP is ready when surfaced, but search-grounded Gemini has not yet
returned the canonical Pivota PDP. No discovery uplift is claimed yet."

## Agent Center Rerun Plan

After public indexing work:

1. Rerun `search_grounded_product_discovery_test`.
2. Compare before/after scores for:
   - `search_grounded_pivota_pdp_discovery_score`
   - `url_match_accuracy_score`
   - relevant blocker status
3. Regenerate the GMV Assurance Snapshot.
4. Regenerate the merchant-facing report draft.
5. Claim uplift only if the comparable score improves.
6. If the score remains `0`, keep report status as `applied_no_uplift`.

If the Pivota PDP readiness improved but search-grounded discovery did not, report
that public indexing/search ingestion may require more time or additional signals.

## Merchant-Facing Language

Use this safe copy when Pivota-owned optimization has been applied but search-grounded
discovery still does not return the Pivota PDP:

> Pivota-owned PDP readiness has been improved, but search-grounded discovery has
> not yet returned the Pivota PDP. Public indexing and search ingestion may require
> additional time and signals.

Also keep these distinctions clear:

- Contextual attribution is not natural discovery.
- Search-grounded discovery does not prove consumer Gemini UI or AI Mode ranking.
- Pivota-owned readiness improvement is not the same as measured discovery uplift.
- No final GMV attribution is proven in V1.

## Known Limitations

- Search-grounding results do not prove consumer Gemini UI or AI Mode ranking.
- Search indexing and ingestion can take time after PDP changes.
- Google Search Console access may be required for sitemap submission and URL
  indexing requests.
- Some search systems may need additional public links before surfacing the PDP.
- V1 does not prove payment authorization, PSP success, order placement, settlement,
  final GMV attribution, or real billing.

## ProductEntity Binding Prerequisite

Indexability work starts only after the pilot product has a correct ProductEntity binding. Use the internal Pilot ProductEntity Provisioning flow before indexing checks for a new merchant SKU.

Binding prerequisites:

- Merchant PDP preflight passes.
- Product name, brand, SKU, category, market, language, and currency are merchant-approved.
- The canonical Pivota PDP URL is ProductEntity-first: `/products/{canonical_product_slug}` or `/products/{product_entity_id}`.
- External seeds are source aliases only.
- The merchant PDP is attached as an `official_merchant_pdp` source reference.
- Manual pilot mappings are marked `manual_pilot_mapping` with `confidence = pilot_only`.
- Binding and indexability audit passes before the PDP is used in a pilot report.

If a Pivota PDP does not exist or fails binding audit, the report should say the Pivota agent-facing path is not ready or not tested. It should not count an unrelated Pivota PDP as attribution or discovery success.
