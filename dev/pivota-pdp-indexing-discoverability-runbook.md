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
- `sitemap.xml` includes the Pivota PDP URL.
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
PIVOTA_PDP_URL="https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90"
MERCHANT_PDP_URL="https://www.isntree.com/products/hyaluronic-acid-watery-sun-gel"

curl "$BASE_URL/api/internal/agent-center/pivota-pdp-indexability-audit?url=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$PIVOTA_PDP_URL")&product_name=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "Isntree Hyaluronic Acid Watery Sun Gel")&brand=Isntree&merchant_pdp_url=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$MERCHANT_PDP_URL")&offers_exist=true" \
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

## Validation Commands And Manual Checks

Set the URL first:

```bash
PIVOTA_PDP_URL="https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90"
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
grep -Ei 'ext_[a-z0-9]+' /tmp/pivota-pdp.html
```

Manual checks:

- Open the PDP in a private browser session and confirm no auth wall appears.
- Run the PDP through Google Rich Results Test or schema validation tooling.
- Confirm Google Search Console has the sitemap submitted for `agent.pivota.cc`.
- Request indexing for the specific Pivota PDP URL when appropriate.

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
