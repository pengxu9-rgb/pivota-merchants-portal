# Spec: External read / citation API contract

**Status:** proposal · **action item of [ADR-007](https://github.com/pengxu9-rgb/pivota-backend/blob/main/docs/adr/ADR-007-citable-index-vs-commerce-overlay.md)** (citable Knowledge Index vs Commerce overlay).
**Repos:** `pivota-backend` (the read surface). Cross-ref: [verify-to-serve.md](verify-to-serve.md), [store-less-brand-catalog.md](store-less-brand-catalog.md).

> **Goal:** define the contract a frontier model / external agent uses to **read and cite** the Pivota commerce index — the answer-completeness surface — **without** a commerce offer being involved. ADR-007 decoupled *citation* from *transaction*; this spec is the wire-level shape of the citation half: what's exposed, how Pivota is attributed, how access is governed, and how neutrality is preserved.

---

## 0. Why this needs its own contract

ADR-007 split eligibility into `index_eligible` (trust + quality + identity, offer-free → **citation**) vs `transact_eligible` (buyable offer → **shopping/checkout**). Slices 1–3 built the *internal* machinery (the eligibility column, verify-to-serve graduation, the citable recall lane). What's **not** yet defined is the **external-facing read contract** — and the current surface is not safe to simply open:

| Today (grounded on `origin/main`) | Problem for an open citation surface |
|---|---|
| `get_pdp` (`routes/agent_pdp_v1.py:393`, `GET /{id}`) has **no auth, no rate-limit, no caller identity** | Opening it wholesale = uncontrolled scrape + no attribution + no abuse ceiling |
| It returns `offers` + `price` inline (`:354–393`) for every row | Mixes commerce into a *citation* read; leaks offer/commercial shape onto offer-free rows |
| No caller is identified | No per-agent rate-limit, no attribution telemetry, no abuse cutoff |
| **No product-read MCP/UCP/ACP door** is mounted (only `/mcp` OAuth-AS + mgmt) | Frontier agents that speak MCP have no first-class tool to call |

This contract closes those four gaps **as a deliberate surface**, not by un-gating the existing endpoint.

---

## 1. The surface — two transports, one projection

The citation read is **one logical projection** (`CitationItem`, §3) exposed over two transports. Both read the **same** `index_eligible` gate and emit the **same** body — no transport-specific divergence.

1. **REST — `GET /agent/v1/citation/{content_key}`** and **`GET /agent/v1/citation/search?q=…`**
   New, citation-scoped routes (NOT a change to `get_pdp`). The single-item route is keyed by `content_key` and RETURNS the canonical PDP URL, which is always the **signature** form `agent.pivota.cc/products/{sig_*}`. Search wraps the slice-3 citable recall lane.

   > **There is no `content_key` form of the PDP URL.** An earlier draft of this
   > document asserted `agent.pivota.cc/products/{content_key}` was the canonical
   > target. Measured against prod 2026-07-26 it is a hard **HTTP 500** — 135
   > requests over 133 distinct content_keys, plus 103 further distinct ids in an
   > independent re-measurement, 103/103 dead with zero redirects. The gateway
   > resolves on `catalog_products.pivota_signature_id`, so no `ck_*` id can match.
   > `content_key` is the request KEY and the cite anchor; the **sig** is the URL.
   > Fixed in pivota-backend#1592.
2. **MCP — two read tools** on a (future) product-read door: `pivota.search_index(query, intent?)` and `pivota.get_product(content_key)`. Same body as REST. This is the surface a ChatGPT/Claude/Gemini agent calls natively. *(Door not built yet — see protocol-integration memory; this contract defines what it must return when it is.)*

> **Why not just open `get_pdp`?** `get_pdp` is the *internal/agent.pivota.cc render* surface and carries commerce (`offers`/`price`). The citation contract is a **narrower, offer-aware projection** with attribution + governance baked in. Keeping them separate means the commerce read can stay offer-bearing while the citation read stays neutral, and each gets its own auth/rate posture.

---

## 2. Access model — public-read, attributed, rate-limited

Citation is a **public good** (the moat is *being cited*, not gating reads). So: **open read, but identified and metered.**

| Concern | Contract |
|---|---|
| **Auth** | **Open read, no key required** for the citation projection. Optionally an agent may send `X-Pivota-Agent` (free-form UA-style id, e.g. `openai-chatgpt/1.0`) to earn a **higher rate tier** and cleaner attribution telemetry. Anonymous = lowest tier. |
| **Rate-limit** | Per-source token bucket keyed on `X-Pivota-Agent` else client IP. Anonymous tier conservative; identified agents higher; named partners (OpenAI/Google/Anthropic) highest, by allow-list. `429` + `Retry-After` on exceed. |
| **Abuse / cost** | No write, no PII, no merchant-private fields ever in this projection. Bulk-export (full-catalog crawl) is **not** this surface — point crawlers at the **sitemap** (`INDEX_ELIGIBLE_SITEMAP`) + per-item reads, which is cacheable + CDN-frontable. Hard ceiling per source per window; sustained abuse → block. |
| **Caching** | Responses are cacheable (`Cache-Control: public, max-age=…` + `ETag` on `content_key` + view version). Citation data is not real-time; staleness of minutes is fine and shifts load off the app. |
| **ToS** | A short machine-readable usage note (`attribution_required: true`, `commercial_use: cite-and-link`) in the response envelope + a human ToS page. Citation is permitted and encouraged; re-hosting the catalog as a competing index is not. |

> **Founder-confirmed (2026-06-24, ADR-007 Accepted):** **Pivota Agent's own** read **stays offer/seed-gated** while this external read opens — the asymmetry is intentional and permanent (open index for citation, curated gate for first-party transact). They are different callers hitting different lanes.

---

## 3. The response projection — `CitationItem`

The body an agent needs to **cite and route**, and nothing more. Offer-free by default; offers appear **only** when the row is `transact_eligible`, and even then as *informational* (the agent still transacts via the commerce surface, not this one).

```jsonc
{
  "content_key": "ck_9f3a…",               // stable Pivota identity (cite anchor).
                                           // A ck_*, NOT a sig — an earlier draft
                                           // put a sig here, which is where the
                                           // ck-vs-sig URL confusion started.
  "title": "Hydrating Vitamin C Serum 30ml",
  "brand": "Acme Skin",
  "summary": "One line an agent can quote verbatim.",
  "description": "…",                       // full content body
  "attributes": { "size": "30ml", "spf": null, … },
  "taxonomy_tags": ["skincare", "serum"],
  "image_url": "https://…",

  // ── trust / substantiation (the differentiator) ──
  "substantiation": {
    "claims": [ { "text": "vegan", "state": "substantiated", "evidence_ref": "…" } ],
    "trust_grade": "verified",             // identity + domain-verified
    "verify_coverage": { "checked": 20, "held": 18 }   // disclosed, never hidden
  },

  // ── attribution (REQUIRED for the moat) ──
  "attribution": {
    "source": "Pivota",
    "canonical_url": "https://agent.pivota.cc/products/sig_9f3a…",  // SIG form, or null
    "url_renderable": true,                  // true | false | null — see field rules
    "url_source": "self",                    // "self" | "elected_canonical" | null
    "cite_as": "Pivota — agent.pivota.cc",
    "attribution_required": true
  },

  // ── routing (content, NOT a commerce offer) ──
  "destination_url": "https://acmeskin.com/serum",  // "where to get it" — brand site
  "buyable": false,                         // ← citation rows: always false
  "catalog_track": "citation",              // citation | commerce

  // ── commerce (present ONLY if transact_eligible) ──
  "offers": null                            // [] / null on citation rows; populated only when buyable
}
```

**Field rules**
- `buyable=false` + `offers=null` + `catalog_track="citation"` is the invariant for an `index_eligible`-only row. Mirrors the slice-3 `_build_citable_items` shape (`offers=[]`, `buyable=False`).
- The `attribution` **block** is always present. `attribution.canonical_url` is `PDP_URL_PREFIX + `**`pivota_signature_id`** — never `+ content_key`, which does not resolve (see §2) — and is **nullable**: `null` when the content_key has no minted sig and no elected sibling to borrow one from, because there is then no followable PDP to name. This is how a citation becomes *Pivota's* citation.
- `attribution.attribution_required` and `cite_as` are **unconditional**, including when `canonical_url` is null. Attribution is owed to the SOURCE, which an agent can honour by name (`cite_as`) without a deep link. A null URL is not a licence to use the content uncredited.
- `attribution.url_renderable` — **will that URL answer HTTP 200?** Both of `get_pdp_v2`'s gates, asked about the exact sig the URL is built from. `true` follow it; `false` quote and credit the CONTENT but do not emit the link; `null` there is no URL to characterise. It is a **signal, not a filter**: the row is still served, because ADR-007 slice 1 exists to keep offer-free rows *citable* and withholding them would make the citation floor uncitable. Measured 2026-07-26: 879 of 5,887 rows do not render, and every one used to be served with a URL and no warning. Added in pivota-backend#1593.
- `attribution.url_source` — **which** URL you got: `"self"` (this content_key's own sig) or `"elected_canonical"` (a sibling's, substituted because this row's own PDP does not render but a renderable sibling holds the group's canonical URL). `null` when there is no URL. Disclosed rather than silently swapped: an agent should be able to tell whether the link points at the record it asked for or at that record's group canonical.
- `substantiation.verify_coverage` is **disclosed, not hidden** — carries the honesty-seam fix (don't imply 100% when we sampled ~25%).
- **Never** emitted on this projection: merchant id/email, internal scores beyond the public grade, take-rate / commercial-rank signals, raw competitor offers. Neutrality §5.

---

## 4. Intent — the same gate as recall

The search transport accepts an optional `intent` (`inform` | `shop`), and applies the **slice-3 rule**:
- `inform` / unspecified → citation rows included (offer-free), ranked by merit.
- `shop` / `strict_serving_mode` → citation rows **suppressed**; only `transact_eligible` rows (parity with `agent_shop_gateway` threading `strict_serving_mode = commerce_surface_explicit`).

So an agent asking "what's a good vitamin C serum" gets citable brand-authored products; an agent driving a *checkout* never sees a non-buyable row. The contract does not introduce a new classifier — it exposes the gate slice 3 already enforces (ADR-007 slice 4 may sharpen the classifier later).

## 5. Neutrality invariants (carried from ADR-007)

- **Merit ranking only.** Citation rows rank by answer-fit + substantiation, never take-rate. `multi_merchant_canonical` keeps its catalog-quality boost; `merchant_owned` / `brand_authored` stay neutral (no boost) — exactly as slices 2–3 set them.
- **All brands equal.** No paid placement field in the projection. There is no commercial signal an agent could rank on even if it wanted to.
- **Offer presence is a shopping signal, not a citation signal.** A buyable row isn't *cited* more; it's *transacted*. The two axes don't cross-contaminate.

## 6. Build phasing (after the canary proves the lane)

- **P0 — REST citation routes.** `GET /agent/v1/citation/{content_key}` + `/search`, reading `index_eligible`, emitting `CitationItem`, with rate-limit middleware + attribution block. Reuses slice-1 read gate + slice-3 recall. Flag: reuse `INDEX_ELIGIBLE_READ` / `INDEX_ELIGIBLE_RECALL`.
- **P1 — attribution telemetry.** Log `(content_key, X-Pivota-Agent, ts)` → "who cited what" (feeds the get-cited proof loop). Per [pivota-frontier-citation-architecture] memory, this closes the citation-observation gap on the *external* side.
- **P2 — MCP product-read door.** Mount `pivota.search_index` + `pivota.get_product` on the kernel (the protocol-integration memory's "product-read door not plugged in" item), same body. Default-OFF behind a door flag; fail-closed.
- **P3 — partner rate tiers + ToS page.** Allow-list named frontier agents to the top bucket; publish the machine + human usage terms.

## 7. Open decisions

- **Rate ceilings** — concrete tokens/min per tier (anonymous / identified / partner). Needs a load estimate.
- **MCP door auth** — does the product-read door reuse the existing MCP OAuth-AS, or is read-only deliberately key-free like REST? (Lean: read tools key-free + rate-limited; OAuth only if/when a write/transact tool joins the door.)
- **`offers` on `transact_eligible` rows in the *citation* projection** — include as informational, or omit entirely and force the agent to the commerce surface for any offer? (Lean: omit — keep this projection purely citation; one surface, one job.)
- **Bulk/crawl posture** — sitemap + per-item is the sanctioned path; do we ever offer a partner bulk feed, or never? (Lean: never a raw dump; partner feed only under contract.)

> Cross-ref: [ADR-007](https://github.com/pengxu9-rgb/pivota-backend/blob/main/docs/adr/ADR-007-citable-index-vs-commerce-overlay.md) (parent), `protocol-integration-architecture` memory (the MCP/UCP/ACP door state), `pivota-frontier-citation-architecture` memory (the get-cited north star), and [storeless-citable-canary-plan.md](storeless-citable-canary-plan.md) (how the lane goes live).
