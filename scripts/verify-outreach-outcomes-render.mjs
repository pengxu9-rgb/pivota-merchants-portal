// Offline shape-contract check for OutreachOutcomesPanel.
// Asserts REAL backend-builder-produced `outreach_outcomes` payloads carry
// exactly the fields the panel consumes, and that the honesty guardrails the
// panel relies on hold in the data:
//   - every target has a machine `outcome` + observational `what_changed` copy
//   - `summary` counts match the targets (so the chip strip can't lie)
//   - when comparable === false, EVERY query-keyed target is `not_comparable`
//     (per-query claims are gated) and only endorsement wins survive
//   - no target string claims causation
// No auth, no cost — run anytime:  node scripts/verify-outreach-outcomes-render.mjs
//
// Refresh the fixtures with backend/scratchpad gen_oo_fixture.py (drives the
// merged services/outreach_outcomes.build_outreach_outcomes), or from any
// re-audit's report_jsonb.outreach_outcomes.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) =>
  JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

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

const OUTCOME_CLASSES = [
  'won',
  'progress',
  'no_change',
  'no_longer_grounded',
  'not_comparable',
];
// The panel would claim the merchant's action caused a change if any copy said
// so — the whole point is that it must not.
const CAUSATION_PHRASES = [
  'your pitch worked',
  'caused',
  'because of your outreach',
  'thanks to your',
];

function checkCommonShape(oo, label) {
  console.log(`\n${label} — top-level contract:`);
  ok(oo != null, 'outreach_outcomes present');
  for (const k of [
    'is_first_audit',
    'available',
    'note',
    'comparable',
    'basis_note',
    'targets',
    'summary',
    'closed_channels_excluded',
  ]) {
    ok(has(oo, k), `has ${k}`);
  }
  ok(Array.isArray(oo.targets), 'targets is array');
  ok(Array.isArray(oo.closed_channels_excluded), 'closed_channels_excluded is array');

  // summary must have every class and equal the actual target tally, or the
  // chip strip renders numbers that don't match the list below it.
  console.log(`${label} — summary integrity:`);
  const tally = Object.fromEntries(OUTCOME_CLASSES.map((c) => [c, 0]));
  for (const t of oo.targets) tally[t.outcome] = (tally[t.outcome] ?? 0) + 1;
  for (const c of OUTCOME_CLASSES) {
    ok(oo.summary[c] === tally[c], `summary.${c} (${oo.summary[c]}) == counted (${tally[c]})`);
  }

  console.log(`${label} — per-target fields the panel reads:`);
  for (const t of oo.targets) {
    const id = `${t.host}/${t.query ?? '(host-only)'}`;
    ok(typeof t.host === 'string' && t.host.length > 0, `host string (${id})`);
    ok(has(t, 'query'), `query key present (${id})`);
    ok(OUTCOME_CLASSES.includes(t.outcome), `outcome in enum (${t.outcome})`);
    ok(typeof t.reason === 'string' && t.reason.length > 0, `reason string (${id})`);
    ok(typeof t.what_changed === 'string' && t.what_changed.length > 0, `what_changed copy (${id})`);
    ok(has(t.signals, 'prior') && has(t.signals, 'current'), `signals.prior/current (${id})`);
    ok(has(t, 'merchant_action'), `merchant_action key present (${id})`);
    if (t.merchant_action) {
      ok(typeof t.merchant_action.note === 'string', `merchant_action.note copy (${id})`);
    }
  }

  console.log(`${label} — honesty: no causation copy:`);
  const allCopy = [
    // `note` excluded on purpose: it is the causation DISCLAIMER and
    // legitimately contains "caused". Scan the per-target CLAIMS only.
    ...oo.targets.map((t) => t.what_changed),
    ...oo.targets.map((t) => t.merchant_action?.note ?? ''),
  ]
    .join('  ')
    .toLowerCase();
  for (const phrase of CAUSATION_PHRASES) {
    ok(!allCopy.includes(phrase), `no "${phrase}" in any rendered copy`);
  }
}

// ── Fixture 1: same pinned basis — spans won/progress/no_change/no_longer_grounded
const same = load('per-sku-outreach-outcomes.anuko.json').outreach_outcomes;
checkCommonShape(same, 'same-basis (anuko)');
console.log('same-basis (anuko) — availability + spread:');
ok(same.is_first_audit === false, 'not a first audit');
ok(same.available === true, 'available === true');
ok(same.comparable === true, 'comparable === true');
ok(same.summary.won >= 1, 'has at least one won');
ok(same.summary.progress >= 1, 'has at least one progress');
ok(same.summary.no_change >= 1, 'has at least one no_change');
ok(same.summary.no_longer_grounded >= 1, 'has at least one no_longer_grounded');
ok(
  same.closed_channels_excluded.length >= 1,
  'closed_channels_excluded surfaced (competitor-owned door)',
);
// A host-only (outreach-move) target must carry query === null so the panel
// renders it without a phantom query line.
ok(
  same.targets.some((t) => t.query === null),
  'at least one host-only target (query === null)',
);

// ── Fixture 2: basis changed — the not_comparable gate + reset banner
const changed = load('per-sku-outreach-outcomes.basis-changed.json').outreach_outcomes;
checkCommonShape(changed, 'basis-changed');
console.log('basis-changed — the per-query gate:');
ok(changed.comparable === false, 'comparable === false (drives the reset banner)');
ok(typeof changed.basis_note === 'string' && changed.basis_note.length > 0, 'basis_note copy present');
// Every query-keyed target must degrade to not_comparable; only host-level
// endorsement transitions may still be `won`.
for (const t of changed.targets) {
  if (t.query != null && t.reason !== 'host_now_endorses') {
    ok(t.outcome === 'not_comparable', `query-keyed target gated to not_comparable (${t.host}/${t.query})`);
  }
}
ok(
  changed.targets.every((t) => t.outcome !== 'won' || t.reason === 'host_now_endorses'),
  'the only wins on a changed basis are endorsement transitions',
);

console.log(
  failures === 0
    ? '\n✅ outreach_outcomes render contract holds.'
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
