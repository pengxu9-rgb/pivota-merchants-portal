# Spec: verify-to-serve — store-less brand products → discoverable (not transactable)

**Status:** proposal · **Priority:** completes the store-less arc (the "verify" in the founder-chosen "A+verify").
**Repos:** `pivota-backend` (serving pipeline + the verify hook). Cross-ref: [store-less-brand-catalog.md](store-less-brand-catalog.md).

> **Goal:** when a store-less brand **domain-verifies** (existing brand-claim flow), its brand-authored products should become **discoverable / citable** to agents — recallable + present in `agent_pdp_view` — and **NOT transactable** (store-less brands have no PSP/checkout). An agent cites/recommends the product and **routes demand to the brand's site** (link-out), consistent with Pivota's demand-router positioning.

---

## 1. Current state — the two gates that block discovery (grounded on `origin/main`)

Brand-authored products land un-served: `pdp_scope='unverified'`, `claim_state='unclaimed'`, `pdp_lifecycle_stage` NULL, **no `catalog_skus`, no `catalog_offers`**. Two commerce-shaped gates keep them out of agent results:

| Gate | Where | Requires | Brand-authored fails because |
|---|---|---|---|
| **Recall** | `services/pivot_query_service.py:844` (`JOIN catalog_skus`) + `:~924` (`JOIN catalog_offers o … AND o.suppressed_at IS NULL`) | a **SKU and a non-suppressed offer** (both INNER joins) | has neither |
| **Serving eligibility** | `services/index_pipeline_state_service.py:279` (`not has_price → blocker 'no_price'`), formula `:307–314` (`… and has_price`) | a real **offer with `list_price > 0`** | has no offer/price |

**The opening:** the agent-READ surface is already permissive — `agent_pdp_view` LEFT-joins SKUs/offers and assembles from `title/description/image_url/content_key` alone. And there's precedent for synthetic rows: the external-seed mirror mints a `<product_key>::canonical` SKU. **The post-verify hook also already exists**: `services/brand_claim_service.py:441 verify_brand_claim` → `services/claim_state.py:47 promote_merchant_skus_to_claimed`.

---

## 2. Key insight — don't invent a "discovery-eligible" flag; mint a *referral offer*

The naive design (new `discovery_eligible` column + decouple serving from price + LEFT-join the recall query) is invasive and forks the serving model. Cleaner: because recall needs a SKU **and** an offer, give the verified product exactly that — a **`brand_direct` / `external_referral` referral offer** (link-out, **no PSP**), carrying the brand's own `list_price`. Then:

- It flows through the **existing** recall (SKU + offer joins satisfied) and serving (`has_price` satisfied) gates — **no new eligibility concept**.
- "Not transactable" is enforced where it belongs: **at checkout**. `external_referral` offers are "retailer / not first-party" (`services/offer_classification.py:9–13`); a store-less brand has no PSP connector → the quote/execution path has no buyable offer → **fail-closed link-out**, not a Pivota checkout.
- It reuses machinery already on `origin/main`: the external-seed SKU mint, the `brand_direct` offer type + reader (`offer_classification.py`, `pivot_query_service.py:557 _brand_direct_reader_enabled`), the `has_price` serving gate, and the `agent_pdp_view` assembler.

So **discovery = a priced referral offer**; **commerce = a PSP-backed buyable offer**. The split is the *offer*, not a new column.

---

## 3. State machine
```
brand-authored (created)         pdp_scope=unverified, claim_state=unclaimed, no sku/offer  → INVISIBLE
        │  (domain-verify via existing brand-claim DNS/email)
        ▼
verified + graduated             + synthetic canonical SKU
                                 + brand_direct REFERRAL offer (list_price = brand price, NO PSP, link-out)
                                 + pdp_lifecycle_stage=validated, sync_status=live
                                 + claim_state=claimed (already done by promote_merchant_skus_to_claimed)
                                 → RECALLABLE + in agent_pdp_view + CITABLE + link-out
        │  (later: connect a store / PSP / real offer)
        ▼
commerce-eligible                buyable offer → transactable
```

## 4. The build — the verify-to-serve hook
Attach at `verify_brand_claim` → `promote_merchant_skus_to_claimed` (`claim_state.py:47`). For each of the brand's `platform='brand_authored'` `catalog_products` rows **that has a price**:
1. **Mint a synthetic canonical SKU** (reuse the external-seed mirror pattern) so the recall SKU-join passes.
2. **Mint a `brand_direct` referral offer** (`offer_type` per `offer_classification`, `is_first_party` true, **no PSP/connector**, `list_price` = the brand-supplied price, link-out URL = the verified brand domain).
3. Set `pdp_lifecycle_stage='validated'`, `sync_status='live'`; keep `pdp_scope` **brand-authored** (see hazards — NOT `multi_merchant_canonical`).
4. `recompute_serving_eligibility(content_key, reason='brand_verified')` — now passes (`has_price` via the referral offer).
5. Refresh `agent_pdp_view` for the content_key.

Flag-gated (reuse `ENABLE_STORELESS_BRAND_CATALOG` or a sibling). Idempotent; best-effort (never break verify).

## 5. Invariants & hazards (all live on `origin/main`)
- **Checkout fail-closed (must prove):** a `brand_direct` referral offer with no PSP must NOT be buyable — the quote/execution path returns no executable offer → link-out only. Add an explicit "no executable offer → reject" assertion + test.
- **No-GTIN mis-merge:** brand-authored stays isolated — `content_key` includes brand + source_system; never GTIN-auto-merge a no-GTIN brand-authored product onto another entity; route ambiguous to `pdp_identity_review_queue`. Keep `pdp_scope` brand-authored so it can't inherit the canonical-PDP rank boost.
- **Neutrality:** referral (not-first-party) offers must rank by merit, below real buyable offers in mixed results; no take-rate/commercial boost (the P0.3 neutrality firewall still applies).
- **Identity gate:** GTIN-or-resolved before any cross-merchant capture (unchanged).

## 6. Phasing
- **MVP:** the verify hook mints SKU + referral offer for **priced** brand-authored products → discoverable + cited + link-out; checkout fail-closed proven. Reuses existing gates; minimal new code.
- **Later:** price-less discovery (if we want brands with no price to be citable — needs the decoupled discovery path the naive design described); substantiation grading → trust; retailer/PSP connect → commerce-eligible.

## 7. Open decisions
- **Price-less brands:** require a price to be discoverable (MVP, simplest — the Add-product form already collects it), or build a true price-less discovery lane later?
- **Link-out target:** the verified brand domain (from the claim) — confirm the referral offer carries it and agents surface it as "buy at …".
- **Quality floor:** serving today also gates on `quality_score >= 65` (`index_pipeline_state_service.py:269`). Should discovery require a content-quality floor too, or a lower bar?
- **Ranking:** exact position of referral (link-out) offers vs PSP-buyable offers in mixed agent results.
- **Flag:** reuse `ENABLE_STORELESS_BRAND_CATALOG` or a separate `ENABLE_VERIFY_TO_SERVE` for independent canary.

> Cross-ref: `commerce-index-storeless-brand-decision-layer` memory (this is the "verify-to-serve" remaining slice of the founder-chosen **A+verify**), and the brand-claim / `claim_state` machinery (PRs #985/#988/#993).
