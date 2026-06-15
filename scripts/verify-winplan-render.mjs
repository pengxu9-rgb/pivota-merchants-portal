// Offline shape-contract check for MerchantNarrativePanel + WinPlanPanel.
// Asserts a REAL backend-builder-produced per-SKU response carries exactly the
// fields the two panels consume, and that the Fix-2 / Fix-4 guardrails hold
// (findability never overlaps endorsement; no fabricated pitch on a target with
// no recipient). No auth, no cost — run anytime:  node scripts/verify-winplan-render.mjs
//
// Refresh the fixture from the backend builders (see the generator in the Fix 4
// PR description) or from any completed per-SKU run's report_jsonb.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, 'fixtures', 'per-sku-winplan.aruen.json'), 'utf8'),
);

let failures = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log('  ✓', msg);
  } else {
    console.error('  ✗', msg);
    failures += 1;
  }
};
const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

// ── merchant_narrative — the 7 sections MerchantNarrativePanel reads ─────────
console.log('merchant_narrative (MerchantNarrativePanel):');
const n = fixture.merchant_narrative;
ok(n != null, 'merchant_narrative present');
ok(typeof n.headline_story === 'string', 'headline_story string');
ok(has(n.whats_working, 'findability_hosts'), 'whats_working.findability_hosts');
ok(Array.isArray(n.whats_working.findability_hosts), 'findability_hosts is array');
const wl = n.where_youre_losing;
ok(typeof wl.summary === 'string', 'where_youre_losing.summary');
ok(has(wl.who_ai_cites_instead, 'available'), 'who_ai_cites_instead.available');
ok(Array.isArray(wl.endorsement_hosts), 'endorsement_hosts array');
ok(has(wl, 'win_plan_summary'), 'where_youre_losing.win_plan_summary present (Fix 4)');
ok(Array.isArray(n.per_sku_scorecard), 'per_sku_scorecard array');
ok(typeof n.verify_summary_plain.text === 'string', 'verify_summary_plain.text');
ok(Array.isArray(n.prioritized_actions), 'prioritized_actions array');
ok(Array.isArray(n.honest_limits), 'honest_limits array');

// ── Fix 2 guardrail — findability and endorsement are disjoint ───────────────
console.log('\nFix 2 guardrail (no inflation):');
const summary = fixture.authority_map?.host_attribution_summary;
ok(summary != null, 'authority_map.host_attribution_summary present');
const fset = new Set(summary.findability_hosts);
const overlap = (summary.endorsement_hosts || []).filter((h) => fset.has(h));
ok(overlap.length === 0, `no host is both findability and endorsement (overlap=${overlap.length})`);

// ── win_plan — what WinPlanPanel reads ──────────────────────────────────────
console.log('\nwin_plan (WinPlanPanel):');
const wp = fixture.win_plan;
ok(wp != null && wp.available === true, 'win_plan present and available');
ok(has(wp.rollup, 'pitch_ready_hosts'), 'rollup.pitch_ready_hosts');
ok(Array.isArray(wp.sku_plans) && wp.sku_plans.length > 0, 'sku_plans non-empty');

let targetsChecked = 0;
let draftReadyWithPitch = 0;
let nonDraftWithoutPitch = 0;
for (const plan of wp.sku_plans) {
  ok(typeof plan.sku_key === 'string', `sku_plan.sku_key (${plan.sku_key})`);
  for (const q of plan.losing_queries) {
    ok(typeof q.query === 'string', `losing_query.query ("${q.query}")`);
    ok(Array.isArray(q.competitor_benchmark), 'competitor_benchmark array');
    ok(has(q, 'win_condition'), 'win_condition present');
    ok(has(q, 'limit'), 'limit present');
    for (const t of q.grounds_in) {
      targetsChecked += 1;
      const o = t.outreach;
      ok(has(t, 'host') && has(t, 'tier') && o, `target ${t.host} has host/tier/outreach`);
      ok(['draft_ready', 'submission_only', 'target_only'].includes(o.state), `${t.host} state valid (${o.state})`);
      // Fix 4 guardrail: a draft renders ONLY where there's a real recipient.
      if (o.state === 'draft_ready') {
        if (o.pitch_draft && o.pitch_draft.recipient_email) draftReadyWithPitch += 1;
      } else {
        if (o.pitch_draft == null) nonDraftWithoutPitch += 1;
        ok(o.pitch_draft == null, `${t.host} (${o.state}) carries NO fabricated pitch_draft`);
      }
    }
  }
}
ok(targetsChecked > 0, `inspected ${targetsChecked} grounded targets`);
ok(draftReadyWithPitch > 0, `>=1 draft_ready target has a real one-click pitch (${draftReadyWithPitch})`);

// ── win_plan_summary consistency with the rollup ────────────────────────────
console.log('\nwin_plan_summary <-> rollup consistency:');
const wps = wl.win_plan_summary;
ok(wps != null, 'win_plan_summary present');
ok(wps.losing_category_queries === wp.rollup.losing_category_queries, 'summary losing count matches rollup');
ok(wps.pitch_ready_hosts.length === wp.rollup.pitch_ready_hosts.length, 'summary pitch_ready matches rollup');

// ── issue #902 — GSC-connect CTA (IntegrationCtaPanel) + indexing arc ────────
console.log('\n#902 integration CTA + indexing arc:');
const integration = fixture.brand_rollup?.integration;
ok(integration != null, 'brand_rollup.integration present');
ok(Array.isArray(integration.actions) && integration.actions.length > 0, 'integration.actions non-empty');
const gsc = (integration.actions || []).find((a) => a.lever === 'gsc_integration');
ok(gsc != null, 'a gsc_integration action is present (not connected)');
if (gsc) {
  ok(typeof gsc.title === 'string' && gsc.title.length > 0, 'CTA has a title');
  ok(typeof gsc.body === 'string' && gsc.body.length > 0, 'CTA has a body');
  ok(typeof gsc.cta_url === 'string' && gsc.cta_url.length > 0, 'CTA has a cta_url (button link)');
  ok(typeof gsc.cta_label === 'string' && gsc.cta_label.length > 0, 'CTA has a cta_label');
}
const arc = fixture.brand_rollup?.indexing_arc;
ok(arc != null, 'brand_rollup.indexing_arc present');
ok(typeof arc.caveat === 'string' && arc.caveat.length > 0, 'indexing_arc.caveat is a string');
// the arc caveat also surfaces in the narrative honest_limits (renders today)
ok(
  (n.honest_limits || []).some((l) => /indexing/i.test(l)),
  'indexing-arc caveat surfaces in narrative honest_limits',
);

console.log(
  failures === 0
    ? `\n✅ ALL CONTRACT CHECKS PASSED (${targetsChecked} targets)`
    : `\n❌ ${failures} CONTRACT CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
