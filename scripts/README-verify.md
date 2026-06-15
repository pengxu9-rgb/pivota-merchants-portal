# Verifying the Fix 2/3 merchant-narrative rendering (Workstream A / ADR-003)

Three levels, cheapest first.

## 1. Offline shape contract (no auth, no cost) — run anytime
Proves a **real prod** per-SKU `report_jsonb` matches exactly what
`MerchantNarrativePanel` consumes, and that the Fix 2 no-inflation guardrail holds
(no host is both findability and endorsement).

```
node scripts/verify-narrative-render.mjs
```

Fixture: `scripts/fixtures/per-sku-report.cc6d1f16.json` (real prod run
`cc6d1f16`, Aruen). Refresh it from any completed per-SKU run via
`GET /api/audits/{run_id}` → keep `{ merchant_name, merchant_domain, timestamp,
brand_verdict_label, brand_verdict_explanation, authority_map, merchant_narrative }`.

## 2. Live browser end-to-end (the real flow)
```
NEXT_PUBLIC_AI_READINESS_ASYNC=1 \
MERCHANT_API_BASE_URL=https://api.pivota.cc \
npm run dev
```
1. Log in as a merchant with catalog products.
2. Dashboard → Agent Center → AI Readiness → pick 1–5 SKUs → **Run**.
3. Expect a live **"Running… `<stage>`"** line (queued → probing → … takes
   minutes), then the narrative panel: headline, what's working, the
   **findability-vs-endorsement split** (two distinct buckets), who AI cites
   instead, per-SKU scorecard, actions, honest limits.
4. Free accounts run Gemini (`pilot_gemini`); requesting ChatGPT/Claude on a free
   account returns the 402 paywall copy.

## 3. Live contract smoke (CI / scripted, needs merchant creds)
The repo's `smoke:merchant` pattern logs in (`MERCHANT_EMAIL`/`MERCHANT_PASSWORD`)
and asserts response shapes against `api.pivota.cc`. To assert the async-audit
contract, GET a completed per-SKU run (`GET /api/audits/{run_id}`) and run the
same checks as script 1 on `report_jsonb.merchant_narrative` +
`authority_map.host_attribution_summary`.

## Gating before default-on
**GSC/indexing-arc parity** (backend issue #902): the per-SKU report does NOT
carry the legacy `merchant_view` GSC-tracking / indexing-arc surfaces. Resolve
(or consciously drop) before defaulting `NEXT_PUBLIC_AI_READINESS_ASYNC=1` on for
all merchants.
