#!/usr/bin/env node
/**
 * E2E shape verification (ADR-003 / Workstream A).
 *
 * Proves a REAL prod per-SKU `report_jsonb` (captured fixture) matches exactly
 * what `MerchantNarrativePanel` + `lib/types/ai-readiness.ts` consume — i.e. the
 * panel will render real data without runtime shape errors, and the Fix 2
 * no-inflation guardrail holds (no host is both findability and endorsement).
 *
 * Offline, no auth. Run:  node scripts/verify-narrative-render.mjs
 * (For the LIVE contract check against api.pivota.cc, see scripts/README-verify.md.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, 'fixtures/per-sku-report.cc6d1f16.json'), 'utf8'),
);

let failures = 0;
const ok = (cond, label) => {
  if (cond) console.log('  ✓', label);
  else {
    console.error('  ✗', label);
    failures += 1;
  }
};
const isArr = Array.isArray;
const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number';
const isBool = (v) => typeof v === 'boolean';

console.log('Verifying real per-SKU report renders through the narrative panel contract...\n');

const n = fixture.merchant_narrative;
ok(n && typeof n === 'object', 'merchant_narrative present');
ok(isStr(n.headline_story) && n.headline_story.length > 0, 'headline_story non-empty string');

const w = n.whats_working || {};
ok(isStr(w.summary), 'whats_working.summary string');
ok(isArr(w.findability_hosts), 'whats_working.findability_hosts array');
ok(isNum(w.branded_navigational_probes), 'whats_working.branded_navigational_probes number');
ok(isNum(w.category_discovery_probes), 'whats_working.category_discovery_probes number');
ok(
  w.evidence_excerpt === null || (w.evidence_excerpt && isStr(w.evidence_excerpt.excerpt)),
  'whats_working.evidence_excerpt is null or { excerpt }',
);

const wl = n.where_youre_losing || {};
ok(isStr(wl.summary), 'where_youre_losing.summary string');
ok(isBool(wl.independently_recommended_for_category), 'where_youre_losing.independently_recommended_for_category bool');
ok(isArr(wl.endorsement_hosts), 'where_youre_losing.endorsement_hosts array');
const who = wl.who_ai_cites_instead || {};
ok(isBool(who.available), 'who_ai_cites_instead.available bool');
ok(isArr(who.cited_hosts), 'who_ai_cites_instead.cited_hosts array');
ok(isArr(who.competitors), 'who_ai_cites_instead.competitors array');

ok(isArr(n.per_sku_scorecard), 'per_sku_scorecard array');
for (const row of n.per_sku_scorecard || []) {
  ok(isStr(row.sku_key), `scorecard row sku_key (${row.sku_key})`);
  ok(isBool(row.surfaced_only_via_own_listing), 'scorecard row surfaced_only_via_own_listing bool');
}

ok(n.verify_summary_plain && isStr(n.verify_summary_plain.text), 'verify_summary_plain.text string');

ok(isArr(n.prioritized_actions), 'prioritized_actions array');
for (const a of n.prioritized_actions || []) {
  ok(isStr(a.headline) && isStr(a.growth_phase_label), `action has headline + growth_phase_label`);
  // Part-B guard: no synthetic scaffolding leaks into merchant-facing copy.
  ok(!/shopper question\s+\d+/i.test(a.headline), 'action headline has no "shopper question N" scaffolding');
}

ok(isArr(n.honest_limits) && n.honest_limits.every(isStr), 'honest_limits string[]');

const am = fixture.authority_map || {};
const s = am.host_attribution_summary || {};
ok(isArr(s.findability_hosts), 'host_attribution_summary.findability_hosts array');
ok(isArr(s.endorsement_hosts), 'host_attribution_summary.endorsement_hosts array');
ok(isArr(s.endorsement_category_hosts), 'host_attribution_summary.endorsement_category_hosts array');
ok(isArr(s.competitor_hosts ?? []), 'host_attribution_summary.competitor_hosts array (or absent)');
ok(isBool(s.surfaced_only_via_own_listing), 'host_attribution_summary.surfaced_only_via_own_listing bool');

// Fix 2 guardrail: a host must never be BOTH findability and endorsement.
const fset = new Set(s.findability_hosts || []);
const overlap = (s.endorsement_hosts || []).filter((h) => fset.has(h));
ok(overlap.length === 0, `no host is both findability AND endorsement (no-inflation guardrail)`);

console.log(
  `\n${failures === 0 ? '✅ PASS' : `❌ ${failures} FAILURE(S)`} — ` +
    (failures === 0
      ? 'the real prod report renders cleanly through the panel contract.'
      : 'real prod report has shape mismatches vs the renderer.'),
);
process.exit(failures === 0 ? 0 : 1);
