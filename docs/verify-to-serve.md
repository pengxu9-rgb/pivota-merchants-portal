# Spec: verify-to-serve — store-less brand products → citable (not transactable)

**Status:** proposal · **Re-scoped under [ADR-007](https://github.com/pengxu9-rgb/pivota-backend/blob/main/docs/adr/ADR-007-citable-index-vs-commerce-overlay.md)** (citable Knowledge Index vs Commerce overlay). · **Depends on** ADR-007's eligibility split landing first.
**Repos:** `pivota-backend` (the verify hook). Cross-ref: [store-less-brand-catalog.md](store-less-brand-catalog.md).

> **Goal:** when a store-less brand **domain-verifies** (existing brand-claim flow), its brand-authored products become **citable** to agents — readable via the citation surface (`get_pdp` / `agent_pdp_view`), recommendable — and **NOT transactable** (no PSP/checkout). An agent cites/recommends the product and routes demand to the brand's site (link-out is *content*, not a commerce offer).

> **Approach changed (2026-06-23).** The earlier draft minted a `brand_direct` *referral offer* to slip through the offer-required recall. ADR-007 rejects that: it **binds citation to a commerce artifact**. Verify-to-serve is now the **first consumer of `index_eligible`** — domain-verify sets the product **citable without any offer**. The sections below reflect the ADR-007 approach.

---

## 1. Why it's blocked today (grounded on `origin/main`)

Brand-authored products land un-served: `pdp_scope='unverified'`, `claim_state='unclaimed'`, no `catalog_skus`, no `catalog_offers`. Two **commerce-shaped** gates keep them out of agent surfaces — the exact coupling ADR-007 removes:

| Gate | Where | Requires |
|---|---|---|
| **Recall** | `pivot_query_service.py:844` + `:924` | a SKU **and** a non-suppressed offer (both INNER joins) |
| **Serving eligibility** | `index_pipeline_state_service.py:279` / `:307–314` / `:454–459` | a `catalog_offers` row with `list_price > 0` (`has_price`) |

`agent_pdp_view` itself already tolerates offer-less rows; the post-verify hook already exists: `services/brand_claim_service.py:441 verify_brand_claim` → `services/claim_state.py:47 promote_merchant_skus_to_claimed`.

## 2. Approach (per ADR-007): verify → `index_eligible`, no offer

ADR-007 splits eligibility into `index_eligible` (trust + quality + identity, **offer-free** → citation surface) vs `transact_eligible` (has a buyable offer → shopping/checkout). Verify-to-serve is the special case:

- On domain-verify, mark the brand's `platform='brand_authored'` `catalog_products` rows **`index_eligible`** (subject to a content-quality floor + identity-resolved). **No `catalog_offers` row is created.**
- They become readable on the **citation surface** (`get_pdp` / `agent_pdp_view`) — which ADR-007 un-gates from `has_price` — and recommendable on inform/recommend-intent queries.
- An optional **`destination_url`** (the verified brand domain) is **content** for "where to get it" — not a commerce offer.
- They stay **`transact_eligible = false`** (no buyable offer) → **checkout fail-closed** by construction (no offer to execute). They become transactable only if/when an offer is connected later.

## 3. State machine
```
brand-authored (created)     pdp_scope=unverified, no sku/offer, index_eligible=false  → INVISIBLE
        │  (domain-verify via existing brand-claim DNS/email → promote_merchant_skus_to_claimed)
        ▼
verified                      claim_state=claimed
                              + index_eligible=TRUE  (quality floor + identity-resolved)
                              + optional destination_url = verified brand domain
                              + assembled into agent_pdp_view
                              → CITABLE (read/recommend surface) · NOT transactable
        │  (later: brand or retailer connects a buyable offer/PSP)
        ▼
+ transact_eligible           buyable → shopping + checkout
```

## 4. The build — the verify hook (after ADR-007's split exists)
Attach at `verify_brand_claim` → `promote_merchant_skus_to_claimed` (`claim_state.py:47`). For each of the brand's `brand_authored` `catalog_products` rows that clears the quality floor:
1. Set **`index_eligible = TRUE`** (the new ADR-007 status) — offer-independent.
2. Set `pdp_lifecycle_stage` to the citable stage; keep `pdp_scope` **brand-authored** (NOT `multi_merchant_canonical` — see invariants).
3. Persist `destination_url` = the verified brand domain (content).
4. Refresh `agent_pdp_view` for the `content_key`.
5. Do **not** create `catalog_skus`/`catalog_offers`. `transact_eligible` stays false.

Flag-gated (reuse `ENABLE_STORELESS_BRAND_CATALOG` or a sibling). Idempotent; best-effort (never break verify).

> **Dependency:** this requires ADR-007's `index_eligible` concept + the offer-free citation read lane. If ADR-007 is staged, verify-to-serve ships as the first slice that *sets* `index_eligible` and proves the read path.

## 5. Invariants (carry over from ADR-007)
- **Checkout fail-closed:** no offer is ever minted → no executable offer → not buyable. (Stronger than the referral-offer approach, which needed an explicit guard.)
- **No-GTIN mis-merge:** brand-authored stays isolated — `content_key` includes brand + source_system; never GTIN-auto-merge a no-GTIN brand-authored product; `pdp_scope` stays brand-authored (no canonical-PDP rank boost).
- **Neutrality:** citable-but-not-buyable products rank by merit; offer presence is a ranking *signal* (favored for shopping intent), never take-rate.

## 6. Phasing
- **MVP:** the verify hook sets `index_eligible` + assembles `agent_pdp_view` + destination_url → citable. Reuses the existing verify/claim hook; the only new dependency is ADR-007's eligibility split.
- **Later:** substantiation grading → higher trust/ranking; brand/retailer connects an offer → `transact_eligible`.

## 7. Open decisions
- **Quality floor for `index_eligible`** — serving today gates on `quality_score >= 65` (`index_pipeline_state_service.py:269`). What's the citation floor (same, lower, or content-completeness-based)?
- **`destination_url` semantics** — confirm agents surface it as "learn more / get it at …"; is it required for `index_eligible`, or optional?
- **Ranking** — exact treatment of citable-not-buyable vs buyable in mixed/ambiguous intent (ties to ADR-007's intent-aware ranking).
- **Flag** — reuse `ENABLE_STORELESS_BRAND_CATALOG` or a dedicated `ENABLE_VERIFY_TO_SERVE`.

> Cross-ref: [ADR-007](https://github.com/pengxu9-rgb/pivota-backend/blob/main/docs/adr/ADR-007-citable-index-vs-commerce-overlay.md) (the parent decision), `commerce-index-storeless-brand-decision-layer` memory, and the brand-claim/`claim_state` machinery (PRs #985/#988/#993).
