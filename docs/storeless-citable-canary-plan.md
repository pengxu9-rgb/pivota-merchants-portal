# Canary plan: store-less brand → citable index

**Status:** ready to execute · **covers** the flags gating [ADR-007](https://github.com/pengxu9-rgb/pivota-backend/blob/main/docs/adr/ADR-007-citable-index-vs-commerce-overlay.md) + store-less catalog (slices 1–3 + declared-mode onboarding).
**Repos:** `pivota-backend` (Railway envs), `pivota-merchants-portal` (Vercel env). Cross-ref: [verify-to-serve.md](verify-to-serve.md), [external-citation-api-contract.md](external-citation-api-contract.md).

> **The key property that makes this safe:** every flag below only activates for **data that doesn't exist in prod yet** — a store-less merchant with brand-authored products, or an `index_eligible` row. Flipping a flag with zero such data is a **no-op** on every existing merchant, shopper, and agent. So the canary is: *seed exactly one hand-picked merchant, then open the gates in dependency order, watching that the existing commerce path never moves.*

---

## 0. The flags (all default OFF today)

| Flag | Repo / env | Gates | Blast radius when ON |
|---|---|---|---|
| `ENABLE_STORELESS_BRAND_CATALOG` | backend (Railway) | store-less catalog source + add-product intake + **verify-to-serve graduation** (slice 2) | only merchants with `operating_mode='store_less'` + `brand_authored` products |
| `NEXT_PUBLIC_ENABLE_STORELESS_BRAND_CATALOG` | portal (Vercel) | store-less signup mode + portal "Add a product" + catalog re-gate | only the store-less signup/portal path |
| `INDEX_ELIGIBLE_READ` | backend | direct citation **read** of offer-free rows (slice 1) | only `index_eligible=TRUE` rows (none until verify-to-serve runs) |
| `INDEX_ELIGIBLE_RECALL` | backend | citable **search** lane (slice 3), inform-intent only | only `index_eligible` rows; shopping intent untouched by construction |
| `INDEX_ELIGIBLE_SITEMAP` | backend | public **sitemap** inclusion of citable rows | SEO/exposure surface; most public — flip last, deliberately |

**Migrations that must be live first:** `164` (`operating_mode`, nullable `store_url`), `165` (`index_pipeline_state.index_eligible` + partial index). Verify both are applied to prod before any flag flip (`SELECT … information_schema` / the schema-ledger check) — DDL self-heal is a backstop, not the plan.

---

## 1. Sequence — dependency + exposure ordered, each independently reversible

```
Phase 0  Pre-flight ........ migrations live, code deployed, pick the canary merchant   (no flags)
Phase 1  Seed ............. create 1 store-less merchant + a few real-content products    (no flags)
Phase 2  Author ........... ENABLE_STORELESS_BRAND_CATALOG + NEXT_PUBLIC_…  → manage+verify → graduate
Phase 3  Read ............. INDEX_ELIGIBLE_READ        → citable by direct get_pdp/citation read
Phase 4  Recall ........... INDEX_ELIGIBLE_RECALL      → surfaces in inform-intent search
Phase 5  Sitemap (later) .. INDEX_ELIGIBLE_SITEMAP     → public sitemap inclusion (SEO)
```

Each phase is a **stop-and-observe gate**: confirm the expected new behavior AND the null-result (existing path unmoved) before the next flip. Any phase rolls back by flipping its one flag OFF — no data migration to unwind (verify-to-serve only *sets* `index_eligible`; turning READ/RECALL off re-hides instantly).

---

## 2. Phase detail

### Phase 0 — Pre-flight (no flags)
- Confirm `164` + `165` applied in prod; confirm the deployed backend `/version` `full_sha` includes slices 1–3 (#1010/#1013/#1016) and portal git-main alias includes the store-less UI.
- Pick the canary merchant: a **real K-beauty / store-less brand** we control or a partner who consented — one with a verifiable domain (DNS/email brand-claim works) and genuine product content (so it can clear the quality floor; thin content will *not* graduate — that's the honest dependency, not a bug).
- **Watch baseline:** record current shopping-recall counts, checkout success rate, `get_pdp` p95, and total `serving_eligible` rows. These must not move in later phases.

### Phase 1 — Seed (no flags)
- Onboard the merchant in `operating_mode='store_less'` (or set it via the onboarding route); add 3–5 brand-authored products with real titles/descriptions/images.
- **Expect:** rows land `pdp_scope=unverified`, `claim_state=unclaimed`, `index_eligible=false`, no SKU/offer → **invisible everywhere**. Confirm they do NOT appear in any agent surface. (Flags still OFF, so even the intake may be gated — that's fine; this phase just stages data + proves invisibility.)

### Phase 2 — Author + verify-to-serve  → `ENABLE_STORELESS_BRAND_CATALOG` + `NEXT_PUBLIC_…`
- Flip both store-less flags. The merchant can now manage the catalog and run the existing domain brand-claim.
- Domain-verify → `verify_brand_claim` → `graduate_brand_authored_products` (slice 2).
- **Expect:** for each product clearing the quality floor → `index_eligible=TRUE`, `pdp_scope='merchant_owned'` (neutral — NOT `multi_merchant_canonical`, NO `product_group_id`), `destination_url`=brand domain, `agent_pdp_view` row assembled. **No `catalog_skus`/`catalog_offers` minted** → `transact_eligible` stays false.
- **Watch:** the graduated rows exist with the right scope; **checkout still cannot transact them** (no offer — fail-closed by construction); existing `serving_eligible` count unchanged; thin products correctly did NOT graduate.
- **Still not agent-visible** (READ/RECALL off). This phase only proves the graduation writes the right state.

### Phase 3 — Read  → `INDEX_ELIGIBLE_READ`
- Flip it. Graduated rows become readable on the citation/`get_pdp` path by `content_key`.
- **Expect:** the canary products return on direct read with `buyable=false`, `offers` empty, attribution `canonical_url` = `agent.pivota.cc/products/{content_key}`.
- **Watch:** existing products' reads unchanged; a checkout attempt against a citable `content_key` still **fail-closes** (no offer); `get_pdp` p95 flat.

### Phase 4 — Recall  → `INDEX_ELIGIBLE_RECALL`
- Flip it. Citable rows now surface in **inform-intent** agent search (the slice-3 lane), deduped against canonical rows.
- **Expect:** "what's a good <category>" surfaces the canary brand's products with `buyable=false`; a **shopping-intent / `strict_serving_mode`** query does **not** (suppressed). 
- **Watch (the critical regression gate):** existing shopping recall results + ordering **unchanged** for buyable queries; canonical INNER-join lane untouched; neutrality holds (no take-rate ranking); the 1 known pre-existing recall-test failure is unrelated. If existing shopping results shift at all → **roll back this flag** and investigate before proceeding.

### Phase 5 — Sitemap (later, deliberate)  → `INDEX_ELIGIBLE_SITEMAP`
- Separate decision (SEO/public exposure). Flip only after Phases 3–4 are clean for a sustained window and we *want* the citable rows publicly crawlable.
- **Expect:** citable rows appear in the public sitemap; feeds the [external-citation-api-contract] crawl-via-sitemap path.
- **Watch:** sitemap well-formed; no merchant-private leakage; crawl volume sane.

---

## 3. Kill criteria (any → roll back the offending flag immediately)

- Existing **shopping recall** results or ordering change for buyable queries (Phase 4).
- Any **checkout** succeeds against a non-buyable / citation row, or checkout error rate rises (any phase).
- `get_pdp` / recall **latency** regresses materially vs the Phase-0 baseline.
- Any **merchant-private field** (id, email, internal score, take-rate) appears in a citation read.
- A **thin / unverified** product becomes citable (quality floor or verify gate leaking).
- `serving_eligible` count for existing merchants moves (slice-1 predicate bleed).

Rollback = flip the single responsible flag OFF. Because each layer is independent and additive, lower layers keep working; no data unwind needed.

---

## 4. Exit / promote

After Phases 2–4 hold clean on the canary merchant for an agreed window (suggest a few days of real agent traffic):
- Promote by **adding more store-less brands** under the same (now-ON) flags — the flags are global; "canary → GA" is widening the *data*, not re-flipping.
- `INDEX_ELIGIBLE_SITEMAP` (Phase 5) and the **external citation API** ([external-citation-api-contract.md] P0–P3) are the follow-on surfaces once the internal lane is trusted.
- Update ADR-007 `Proposed → Accepted` once the two founder questions resolve (offer-free citation as external end-state; whether Pivota-Agent stays offer-gated).

> **Honest dependency restated:** this whole path only lights up for brands that (a) declare store-less, (b) add *real* product content, and (c) domain-verify. A brand that does none of these sees nothing change — which is exactly the safety property, and also the adoption work that follows go-live.

> Cross-ref: [ADR-007](https://github.com/pengxu9-rgb/pivota-backend/blob/main/docs/adr/ADR-007-citable-index-vs-commerce-overlay.md), [verify-to-serve.md](verify-to-serve.md), [external-citation-api-contract.md](external-citation-api-contract.md); deploy-verify endpoints per the `pivota-deploy-verify-endpoints` memory (backend `api.pivota.cc/version`, portal `vercel inspect` git-main alias).
