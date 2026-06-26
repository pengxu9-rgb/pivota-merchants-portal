// Offline shape-contract check for the engine-playbook / evidence-play /
// competitor-intel / realism redesign, against the REAL report_jsonb of run
// be7d6caf (merch_efbc46b4619cfbdf, Anuko). No auth, no cost.
//   node scripts/verify-engine-playbook-render.mjs <path-to-run.json>

import { readFileSync } from 'node:fs';

const path =
  process.argv[2] ||
  '/private/tmp/claude-502/-Users-pengchydan-dev-PIVOTA-Agent/f6284fc2-442d-4cd0-8c56-a14c9ca794ec/scratchpad/run_be7d6caf.json';
const report = JSON.parse(readFileSync(path, 'utf8')).report;
const skus = report.per_sku_reports || [];

let failures = 0;
const ok = (c, m) => {
  console[c ? 'log' : 'error'](c ? '  ✓' : '  ✗', m);
  if (!c) failures += 1;
};
const s0 = skus[0];

console.log('EnginePlaybookPanel:');
const ep = s0.engine_playbook;
ok(ep?.has_signal === true, 'engine_playbook.has_signal');
ok(['gemini', 'chatgpt'].includes(ep?.primary_gap), `primary_gap = ${ep?.primary_gap}`);
ok(ep?.engines?.gemini && ep?.engines?.chatgpt, 'both engine cards present');
ok(['invisible', 'weak', 'present', 'couldnt_measure'].includes(ep?.engines?.gemini?.status), `gemini.status = ${ep?.engines?.gemini?.status}`);
ok((ep?.engines?.gemini?.moves || []).length > 0, 'gemini has moves');
ok(typeof ep?.engines?.gemini?.how_it_cites === 'string', 'gemini.how_it_cites');
ok(typeof ep?.divergence_note === 'string', 'divergence_note present (callout)');
// priority-first ordering the panel applies
const order = Object.entries(ep.engines).sort((a, b) => {
  if (a[0] === ep.primary_gap) return -1;
  if (b[0] === ep.primary_gap) return 1;
  return ['gemini', 'chatgpt'].indexOf(a[0]) - ['gemini', 'chatgpt'].indexOf(b[0]);
});
ok(order[0][0] === ep.primary_gap, `priority engine (${ep.primary_gap}) renders first`);

console.log('\nEvidencePlayPanel:');
const ev = s0.evidence_play;
ok(ev?.present === true, 'evidence_play.present (panel shows)');
ok(Array.isArray(ev?.claims_to_substantiate) && ev.claims_to_substantiate.length > 0, `claims_to_substantiate = ${JSON.stringify(ev?.claims_to_substantiate)}`);
ok(typeof ev?.unsubstantiated_in_ai === 'number', `unsubstantiated_in_ai = ${ev?.unsubstantiated_in_ai}`);
ok((ev?.moves || []).length > 0 && typeof ev?.pivota_value === 'string', 'moves + pivota_value present');

console.log('\nCompetitorIntelPanel:');
const ci = s0.next_best_action?.competitor_intel;
ok(ci?.status === 'assessed', 'competitor_intel.status = assessed');
ok(typeof ci?.known_for === 'string' && ci.known_for.length > 0, 'verbatim known_for present (the gold)');
ok(!!ci?.competitor, `competitor = ${ci?.competitor}`);
ok((ci?.attributes_present || []).length > 0, 'attributes_present');

console.log('\nStrategicBrief (position + brief_source gating):');
const nba = s0.next_best_action;
ok(nba?.brief_source === 'llm', `brief_source = ${nba?.brief_source} → rendered`);
ok(typeof nba?.strategic_brief?.position === 'string', 'strategic_brief.position present (now rendered)');

console.log('\nOutreachMoves realism sort:');
const moves = (report.merchant_narrative?.where_youre_losing?.outreach_moves) || [];
ok(moves.length > 0 && moves.every((m) => 'realism' in m), `all ${moves.length} moves carry realism`);
const RANK = { reachable: 0, diy: 1, onboarding: 2, investigate: 3, hard: 4 };
const rank = (m) => (m.realism in RANK ? RANK[m.realism] : 2.5);
const sorted = [...moves].sort((a, b) => rank(a) - rank(b));
ok(rank(sorted[0]) <= 1, `leads with reachable/diy (first = ${sorted[0].realism}: ${sorted[0].host})`);
ok(sorted[sorted.length - 1].realism === 'hard', `'hard' demoted last (= ${sorted[sorted.length - 1].host})`);
const hard = moves.find((m) => m.realism === 'hard');
ok(hard && /community|reviews|first/i.test(hard.first_move || ''), 'hard move shows reframed first_move (build community first)');

console.log(failures === 0 ? '\n✅ all contracts hold' : `\n❌ ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
