# Design brief / PR: restructure Catalog health (`/dashboard/product-optimization`)

**Status:** proposal · **Surface:** `app/dashboard/product-optimization/page.tsx` (4,546 lines, single component)
**Nav label:** "Catalog health" · **Owner boundary (decided):** this page = *Catalog AI-readiness fixes*; the Catalog page (`/dashboard/products`) = *source data*.

---

## 1. Problem

The page stacks **four full working surfaces vertically**, each at a different scope but rendering the *same* concepts. An operator scrolls through a store scorecard, a triage dashboard, a product worklist, and a product editor — all at once, with no separation by job.

| Zone | Lines | What it is | Scope |
|---|---|---|---|
| **A — Readiness banner** | `2675–2869` | Tier badge, health score, ready/blocked counts, Eligibility/Exposure/Conversion chips, push-ready/excluded chips + 3-card grid (Issue overview · Recommended actions · Store setup) | Whole store |
| **B — Source-data triage** | `2871–3453` | "Batch-govern blocked variants", bulk-worklist stat row, 3 lane cards, a selected-lane panel, **"Products to review next" (8 cards)** *and* a **full variant table** | Lanes / batches |
| **C-left — Blocker queue** | `3457–3747` | Bulk-optimize, search, 5 filters, pagination, **a second product list** | Per product |
| **C-right — Selected product** | `3749–4542` | Status header + 5 stacked cards (incl. **a second variant table**) → Source/Enrichment editor → Quality panel → Evidence intake | Per product / per variant |

### Root causes (not just "it's busy")

1. **Same concept rendered 4–5×.** "Blocked / excluded variants" with identical rose/amber chips appears in the banner (`2687`, `2702–2707`), triage lanes (`2920–2939`), batch cards (`3262–3272`), the lane table (`3347–3357`), the product detail (`3771–3778`, `3959–3964`), and the affected-variants table (`3990–4080`). Nothing signals which is authoritative.
2. **Two competing product lists.** "Products to review next" (`3247–3304`) and "Blocker queue" (`3658–3744`) both let you pick a product to work on.
3. **Two competing destinations.** Almost every row offers "Review in catalog" (leave page → `/dashboard/products`, e.g. `3281–3290`, `3418–3428`) *and* "fix here" (enrichment, `3819–3826`). The page can't decide if it routes work or does work.
4. **Scope-mixing = role-mixing.** Store setup, source-data triage, and single-SKU editing are three different jobs (often different people / sessions) on one infinite-scroll screen.
5. **Vocabulary overload.** Catalog health score, Eligibility, Exposure, Conversion, CQ, MR, readiness blockers, agent-push exclusions, lanes, batches, variants, content opportunities — many are synonyms for "this SKU isn't ready."

### The key asset we're underusing

The data already carries the right organizing axis. Every issue knows **where the fix happens** via `recommended_action_type`, `fix_surface`, and `fixability` (used today only *inside* cards — see `3876–3899`). That tri-state should be the page's top-level structure, not buried.

---

## 2. Proposed IA

Three parts, not four zones. One scorecard, one worklist, one workspace.

### Part 1 — Slim health header (replaces Zone A)
- One line: page name · **one** health score + tier · ready/blocked count · `Refresh`.
- Demote Eligibility/Exposure/Conversion and the chip-soup behind a "score details" disclosure.
- The store-setup card becomes a **conditional banner** that renders only when `storeSetupActions.length > 0` — it should not permanently own a third of the hero.

### Part 2 — One unified work queue (collapses Zone A "Issue overview" + all of Zone B + Zone C-left)
Segment by **where the fix happens** — the axis that decides what the operator can actually do right now:

| Segment | Backed by | Action |
|---|---|---|
| **Fix here** | `recommended_action_type === 'run_product_enrichment'` | opens the workspace, AI fix |
| **In your store** | `fix_surface === 'catalog_data'` | routes to Catalog / store admin (hand-off, not a second editor) |
| **Setup** | merchant-level blockers (`storeSetupActions`) | routes to Integrations |

- "Lanes" become a **filter** on this one list, not a separate section with its own cards + table.
- This dissolves both the duplicate-list problem and the "review-in-catalog vs fix-here" ambiguity: the segment you're in already implies the action.

### Part 3 — One focused product workspace (collapses Zone C-right's 7 stacked sections into tabs)
On select: compact header + tabs **Overview · Edit content · Quality · Evidence**.
- **Overview** — what's wrong (`top_issues`) + the single recommended action (Preview/Apply *or* a route button, never both) + affected-variants table (one, on demand).
- **Edit content** — source read-only + enrichment editor.
- **Quality** / **Evidence** — behind their own tabs instead of stacking below the fold.

### Highest-leverage single change
**Delete the duplicate product list and the duplicate variant tables.** Keep one worklist (the segmented queue) and one variant table (inside the workspace). This removes most of the visual mass with zero capability loss.

### Boundary with Catalog
"In your store" is a hand-off queue *to* `/dashboard/products`. Keep it a routing segment, not a second editor, so the line stays clean: **this page fixes AI-readiness; Catalog owns source data.**

---

## 3. Component-by-component migration map

> Line ranges reference `app/dashboard/product-optimization/page.tsx` at the time of writing. Component body begins at `return (` on `2673`; everything before is loading/error/helper returns (`951, 962, 968, 1036, 1429, 2072`) and state (`selected 1076`, filters `1114–1120`).

### Zone A — Readiness banner (`2675–2869`)
| Current | Lines | Disposition |
|---|---|---|
| Tier badge + health score + ready/blocked | `2680–2688` | **Keep** → Part 1 header (one score only) |
| h1 + summary text | `2690–2695` | Keep → header title |
| Action chips (next action, push-ready, excluded) | `2696–2710` | **Demote** → "score details" disclosure |
| Meta line (last checked, rescore, plan id, hidden opps) | `2711–2728` | Demote → disclosure / footnote |
| Score bundle chips (Eligibility/Exposure/Conversion) | `2729–2751` | **Demote** → disclosure |
| Refresh / Review integrations buttons | `2753–2776` | Keep → header (`Refresh`); "Review integrations" moves to Setup banner |
| Card: Issue overview (`issueBuckets`) | `2779–2812` | **Merge** → Part 2 queue segments + counts |
| Card: Recommended actions | `2814–2832` | **Merge** → per-row action in Part 2 |
| Card: Store setup to review | `2834–2866` | **Move** → conditional Setup banner / "Setup" segment |

### Zone B — Source-data triage (`2871–3453`)
| Current | Lines | Disposition |
|---|---|---|
| Header + "Review whole lane" / "Export lane" | `2875–2906` | Keep "Export"; **fold** lane concept into Part 2 filter |
| Merchant bulk worklist + stat chips | `2909–2941` | **Collapse** → counts on the segment chips |
| Lane delta refreshed notice | `2943–2953` | Keep as transient toast |
| 3 lane cards (`triageLaneWorklists`) | `~2955–3203` | **Remove** as cards → become filter options on the queue |
| Selected-lane header + filter chips | `3204–3231` | **Merge** → Part 2 filter state |
| "Products to review next" (8 batch cards) | `3232–3311` | **Remove (dedupe)** → the one queue in Part 2 |
| Full variant-level table (`triageRows`) | `3312–3450` | **Remove (dedupe)** → workspace affected-variants table |

### Zone C-left — Blocker queue (`3457–3747`)
| Current | Lines | Disposition |
|---|---|---|
| Header "Blocker queue" + count | `3458–3474` | **Keep as the canonical worklist** → Part 2 |
| Bulk optimize button + excluded chip | `3475–3525` | Keep → queue toolbar |
| Search + filters + pagination | `3528–3649` | **Keep + extend** → add the 3 fix-location segments above filters |
| Product list (`filteredProducts`) | `3650–3745` | **Keep** → the single product list |

### Zone C-right — Selected product (`3749–4542`)
| Current | Lines | Disposition |
|---|---|---|
| Detail header (status, counts, actions) | `3752–3838` | **Keep** → workspace header (collapse Preview/Apply vs manual-review into one primary action by `fixability`) |
| Action feedback | `3840–3844` | Keep |
| Card: Main issues (`top_issues`) | `3847–3867` | **Keep** → Overview tab |
| Card: Recommended action | `3869–3904` | **Keep** → Overview tab (single action) |
| Card: Agent push status | `3906–3946` | Merge → Overview tab (secondary) |
| Card: Affected variants + table | `3948–4082` | **Keep (the one variant table)** → Overview tab, on demand |
| Card: Preview and verification | `4084–4150` | Keep → Overview tab |
| Empty state | `4155–4160` | Keep |
| Standard view "Source platform (read-only)" | `4163–4231` | **Move** → "Edit content" tab |
| Enrichment editor | `4232–4473` | **Move** → "Edit content" tab |
| Quality panel | `4475–4532` | **Move** → "Quality" tab |
| Evidence intake (`ProductEvidencePanel`) | `4534–4541` | **Move** → "Evidence" tab |

---

## 4. Suggested execution order (de-risked)

1. **Split the file first.** Extract `<HealthHeader>`, `<WorkQueue>`, `<ProductWorkspace>` from the 4,546-line component. No behavior change — pure extraction so the diff for steps 2–4 is reviewable.
2. **Dedupe.** Remove the Zone B "Products to review next" cards (`3232–3311`) and the Zone B variant table (`3312–3450`); the Zone C-left queue and the workspace variant table become canonical. (Biggest visual win, lowest risk.)
3. **Re-segment the queue.** Add the 3 fix-location segments (`recommended_action_type` / `fix_surface`) above the existing filters; convert lanes (`~2955–3231`) into filter state.
4. **Tab the workspace.** Wrap `4163–4541` in Overview / Edit content / Quality / Evidence tabs; default Overview.
5. **Slim the header.** Collapse Zone A chip-soup behind a disclosure; make Store setup a conditional banner.

## 5. Open questions / pre-build checks
- Confirm the three fix-location buckets partition cleanly against a real merchant's data (does every queue item resolve to exactly one of `fix here` / `in your store` / `setup`?). If items can be both, decide precedence before building the segments.
- "In your store" hand-off: link to the Catalog page deep-link (`buildCatalogReviewHref`, already used at `3281`, `3418`) vs. store admin — keep both or pick one per platform.
- Tab persistence: should the selected tab survive product-to-product navigation, or reset to Overview each select?
