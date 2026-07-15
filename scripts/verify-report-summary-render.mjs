// Offline shape-contract check for ReportSummaryView (Report Summary Contract
// v1). The fixture is REAL output of the backend builder — regenerate with:
//
//   cd pivota-backend && python3 -c "
//   import sys, json; sys.path.insert(0, '.')
//   from tests.services.test_report_summary_builder import _brand_report
//   from services.report_summary_builder import build_report_summary
//   print(json.dumps(build_report_summary(_brand_report()), indent=2))
//   " > scripts/fixtures/report-summary.glowlab.json
//
// Asserts the fields the condensed view consumes exist AND the contract's
// honesty guardrails hold (display = raw/10 at one decimal; supporting prompts
// only under a stamped basis; caps disclosed). No auth, no cost:
//   node scripts/verify-report-summary-render.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const summary = JSON.parse(
  readFileSync(join(here, 'fixtures', 'report-summary.glowlab.json'), 'utf8'),
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

console.log('envelope:');
ok(['1.0', '1.1'].includes(summary.contract_version), 'contract_version 1.x');
ok(typeof summary.audit_run_id === 'string', 'audit_run_id present');
ok(summary.subject?.type === 'brand', 'subject.type brand');

console.log('\nscore (page 1):');
const score = summary.score ?? {};
ok(typeof score.raw === 'number', 'raw 0-100 present');
ok(typeof score.display === 'number', 'display 0-10 present');
ok(
  Math.abs(score.display - Math.round((score.raw / 10) * 10) / 10) < 1e-9,
  'display === raw/10 at one decimal (never re-derived or rounded further)',
);
ok(score.scale_max === 10, 'scale_max 10');
ok(
  ['needs_work', 'pass', 'good', 'excellent'].includes(score.band),
  'band is a known enum value',
);
ok(Array.isArray(score.band_thresholds) && score.band_thresholds.length === 3,
  'band_thresholds present (calibration constant)');
ok(Array.isArray(score.subscores), 'subscores array');
ok(
  score.subscores.every((s) => typeof s.display === 'number'),
  'backend omits unmeasured subscores (no nulls)',
);

console.log('\nverdict + findings (pages 1-2):');
ok(typeof summary.verdict?.headline === 'string', 'verdict.headline present');
ok(Array.isArray(summary.top_findings), 'top_findings array');
ok(summary.top_findings.length <= 3, 'findings capped at 3');
ok(
  summary.top_findings.every((f) => typeof f.evidence_summary === 'string'),
  'every finding carries pre-written evidence_summary',
);
const snapshot = summary.competitive_snapshot ?? {};
ok(typeof snapshot.available === 'boolean', 'competitive_snapshot.available');
ok(Array.isArray(snapshot.top_cited_hosts), 'snapshot hosts array');

console.log('\nactions (page 3) — honesty guardrails:');
ok(Array.isArray(summary.top_actions), 'top_actions array');
ok(summary.top_actions.length <= 3, 'actions capped at 3');
for (const [i, a] of summary.top_actions.entries()) {
  ok(typeof a.headline === 'string', `action ${i + 1} headline`);
  ok(
    typeof a.supporting_prompts_basis === 'string',
    `action ${i + 1} basis stamped`,
  );
  const prompts = a.supporting_prompts ?? [];
  ok(prompts.length <= 3, `action ${i + 1} prompts capped at 3`);
  if (a.supporting_prompts_basis === 'none') {
    ok(prompts.length === 0, `action ${i + 1}: basis none → no prompts`);
  } else {
    ok(
      prompts.every((p) => typeof p.query === 'string' && p.query.length > 0),
      `action ${i + 1}: every prompt is a real measured query`,
    );
  }
}

console.log('\nmeta — disclosed truncation + coverage:');
ok(typeof summary.meta?.actions_total === 'number', 'actions_total disclosed');
ok(Array.isArray(summary.meta?.honest_limits), 'honest_limits array');
ok(Array.isArray(summary.sku_summaries), 'sku_summaries array');
ok(
  summary.sku_summaries.every(
    (r) => r.score && typeof r.score.raw === 'number',
  ),
  'every SKU row carries a raw score (weakest-dimension semantics)',
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed.');
