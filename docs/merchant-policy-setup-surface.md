# Spec: merchant policy-setup surface (shipping / returns / warranty / trust)

**Status:** proposal · **Origin:** open question from [catalog-health-ia-redesign.md](catalog-health-ia-redesign.md) — the "Store setup to review" banner surfaces policy gaps with nowhere to fix them.
**Repos:** `pivota-backend` (data + detection + API) · `pivota-merchants-portal` (the form + banner wiring).

---

## 1. Problem & current state (grounded)

The Catalog-health page tells a merchant their **shipping/returns/warranty/trust** setup is incomplete, but there is **no surface anywhere** to fix it:

- The setup banner's policy items used to deep-link to `/dashboard/product-optimization?focus=…`, which looped back and broke the queue (fixed in #110 — they now render as inert guidance).
- `/dashboard/integrations` is payment/PSP-only. `/dashboard/settings` is account/password-only. Neither handles policy.

**Why it's actually unfixable today:** merchant policy is not merchant-editable data — it's a **static JSON fixture**.

| Concern | Where | Detail |
|---|---|---|
| Policy data shape | `pivota-backend/readiness/sources/shopify_live.py:281–288` | `{ shipping_supported, returns_supported, shipping_summary, returns_summary, shipping_profile, policy_source, last_reviewed_at }` |
| Storage | `shopify_live.py:39–46` (`_load_policy_map`) | Reads a JSON **fixture file** keyed by `merchant_id`; synthetic merchants via `readiness/sources/synthetic.py:68`. **No DB, no write path.** |
| Detection | `readiness/scoring.py:142–147` | `!shipping_profile → missing_shipping_profile`; `!shipping_supported → merchant_shipping_policy_missing`; `!returns_supported → merchant_return_policy_missing`. Missing whole policy → `merchant_policy_missing` (`shopify_live.py:280`). |
| Buckets | `readiness/summary.py:128–140`, trigger map `:180–189` | `merchant_*_policy_missing → shipping_returns_setup`; `merchant_warranty_/authenticity_/customer_support_* → trust_support_setup` (both `fix_surface: policy`, `scope: merchant`). |

**Finding worth flagging:** only **shipping & returns** are actually *detected* (`scoring.py`). The `trust_support_setup` blocker codes (`merchant_warranty_policy_missing`, `merchant_authenticity_guarantee_missing`, `merchant_customer_support_contact_missing`) exist in the trigger map but have **no detection logic** — that bucket effectively never fires today. The surface should add both the fields *and* their detection.

---

## 2. Goal

Let a merchant declare their shipping, returns, warranty/authenticity, and support policy in Pivota, persist it, and have the readiness pipeline clear the corresponding blockers on the next rescore — so the "Store setup to review" banner resolves itself.

---

## 3. Proposed surface

### Route & IA
A dedicated page **`/dashboard/store-policy`** (nav: under "Catalog" or "Settings"), one screen, grouped into the two existing buckets:

- **Shipping & returns** (`shipping_returns_setup`)
- **Warranty, authenticity & support** (`trust_support_setup`)

> Decision: a dedicated page beats a tab on Integrations (which is payment-scoped) or Settings (account-scoped). Keep it close to Catalog-health since that's where the gap surfaces.

### Fields → data keys → blockers cleared
| Field (UI) | `merchant_policy` key | Clears blocker |
|---|---|---|
| "We ship to customers" (+ destinations, SLA, costs) | `shipping_supported`, `shipping_summary`, `shipping_profile` | `merchant_shipping_policy_missing`, `missing_shipping_profile` |
| "We accept returns" (+ window) | `returns_supported`, `returns_summary` | `merchant_return_policy_missing` |
| Warranty terms | `warranty_summary` *(new)* | `merchant_warranty_policy_missing` |
| Authenticity guarantee | `authenticity_guaranteed` *(new)* | `merchant_authenticity_guarantee_missing` |
| Customer support contact | `support_contact` *(new)* | `merchant_customer_support_contact_missing` |

Each group shows its live blocker state (resolved / still missing) pulled from the readiness payload, so the merchant sees progress.

---

## 4. Backend work (`pivota-backend`)

1. **Data store** — a `merchant_policy` table (or column on the existing merchant profile) keyed by `merchant_id`, holding the fields above + `updated_at`, `updated_by`. Replaces the fixture as source of truth.
2. **Read path** — `_load_policy_map` / the dataset builder reads DB first, falls back to the fixture (so alpha merchants keep working during migration). Single accessor `get_merchant_policy(merchant_id)`.
3. **Detection** — extend `readiness/scoring.py` policy block to emit the warranty/authenticity/support blockers from the new fields (currently absent).
4. **API** — `GET /merchant/store-policy` (current values + per-field blocker state) and `PUT /merchant/store-policy` (validate + persist, set `last_reviewed_at`). Merchant-scoped, same auth pattern as the readiness routes.
5. **Recompute** — on `PUT`, trigger a readiness rescore (reuse `build_readiness_optimization(..., force_refresh=True)`) so blockers clear without a manual refresh.

## 5. Frontend work (`pivota-merchants-portal`)

1. New `/dashboard/store-policy` page: a form bound to `GET/PUT /merchant/store-policy`, grouped as in §3, each group showing resolved/missing state. (`apiClient` methods mirror the readiness ones.)
2. **Reroute the banner**: in `CatalogHealthHeader.tsx`, change policy items from the inert guidance (#110) to real links to `/dashboard/store-policy`. Backend `direct_target` for `shipping_returns_setup` / `trust_support_setup` should point there too (so the link is data-driven, not hardcoded).
3. Add the page to `lib/merchant-navigation.ts`.

---

## 6. Phasing
- **MVP** — shipping + returns only (the blockers that actually fire today): DB table, GET/PUT, the form's first group, banner reroute. Smallest path that makes the existing banner resolvable.
- **Phase 2** — warranty/authenticity/support: add fields **and** detection in `scoring.py`, second form group.

## 7. Open questions
- **DB vs. platform sync — the load-bearing decision (decide before building).** Is policy meant to stay **Pivota-declared** (this spec), or eventually **derived from the merchant's commerce platform**? This is harder than it looks because **every platform models shipping/returns/warranty differently** — Shopify has shipping *zones/profiles* + a free-text refund policy page; WooCommerce/BigCommerce/custom carts each represent it their own way (or not at all). So "sync" is not one integration — it's a **per-platform adapter** that normalizes heterogeneous (and often free-text / absent) policy into our fields, with low confidence. That argues for: keep a **normalized Pivota-declared `merchant_policy` as the source of truth** (one schema, works for every platform), and treat any future platform import as an *optional pre-fill* that the merchant reviews — never the canonical store. The surface UX differs by answer: "enter from scratch" (declared) vs. "review & override synced values" (sync). **This unknown is the main reason to hold the MVP** until the model is chosen.
- **Where in nav** — under Catalog, or a new "Store setup" group alongside Integrations?
- **Validation depth** — free-text summaries vs. structured (destinations list, return-window days). Structured enables richer agent export (`readiness/channel_exports/*`) but is more UI.
- **`shipping_profile`** is a separate signal from `shipping_supported` — confirm whether the form sets it or it stays catalog-derived.
