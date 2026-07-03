// Offline checks for PivotaIndexingLane (the per-SKU request_indexing surface):
//   node scripts/verify-indexing-lane.mjs
// Asserts (A) the submit fires ONLY on an explicit click (no useEffect / auto-call),
// (B) the {status} -> message mapping covers every backend status, (C) the copy is
// backend-truth-driven — the old unconditional "Automatic / you don't need to do
// anything" over-promise is gone and the honest not_enabled / no_canonical_url
// states are surfaced, (D) the lane only renders for the request_indexing gap.
// Mirrors the offline shape/safety idiom of verify-publish-lane.mjs.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log('  ✓', msg);
  } else {
    console.error('  ✗', msg);
    failures += 1;
  }
};

const src = readFileSync(
  join(here, '..', 'components', 'audit', 'PerSkuNextStep.tsx'), 'utf8');
const apiSrc = readFileSync(
  join(here, '..', 'lib', 'api-client.ts'), 'utf8');

// (A) Safety — the submit fires only on an explicit click, never auto ─────────
console.log('safety — explicit-click-only submit:');
ok(!src.includes('useEffect('), 'PerSkuNextStep has no useEffect( (no fetch-on-mount / auto-submit)');
const submitCalls = (src.match(/apiClient\.requestSkuIndexing\(/g) || []).length;
ok(submitCalls === 1, `exactly one requestSkuIndexing call site (found ${submitCalls})`);
ok(/async function handleSubmit\(\)/.test(src), 'the submit is wrapped in a handleSubmit() handler');
ok(/onClick=\{handleSubmit\}/.test(src), 'handleSubmit() is bound to a button onClick (explicit gesture)');

// (B) {status} -> message mapping ─────────────────────────────────────────────
console.log('\nstatus mapping (backend-truth-driven):');
for (const s of ['submitted', 'pending', 'indexed', 'no_canonical_url', 'not_enabled']) {
  ok(src.includes(`case '${s}'`), `maps ${s}`);
}
ok(/switch \(result\.status\)/.test(src), 'the copy branches on result.status (not a hardcoded label)');
ok(/result\.message \|\|/.test(src), 'prefers the backend message when present, with a safe fallback');

// (C) honesty — the unconditional over-promise is gone ────────────────────────
console.log('\nhonesty — no unconditional Pivota-does-it promise on the indexing lane:');
// The old copy claimed Pivota submits the page automatically with no conditions.
ok(!/you don't need to do anything to start/.test(src),
  'the "you don\'t need to do anything to start" over-promise is not rendered on this lane');
ok(/isn't switched on/.test(src),
  'the not_enabled state honestly says indexing is not switched on yet');
ok(/nothing to submit/.test(src),
  'the no_canonical_url state honestly says there is no Pivota page to submit yet');

// (D) the lane renders only for the request_indexing gap ──────────────────────
console.log('\ngating — request_indexing only:');
ok(/const isIndexingLane = action === 'request_indexing'/.test(src),
  'isIndexingLane is derived from action === request_indexing');
ok(/showPivotaIndexingLane[\s\S]{0,40}isIndexingLane/.test(src),
  'showPivotaIndexingLane requires isIndexingLane');
ok(/<PivotaIndexingLane targetSkuKey=\{targetSkuKey\} \/>/.test(src),
  'the interactive lane is rendered with the resolved target_sku_key');

// (E) the client method targets the real backend route ────────────────────────
console.log('\nclient — real endpoint wiring:');
ok(apiSrc.includes('/api/merchant-center/audit/sku/request-indexing'),
  'requestSkuIndexing posts to the real /sku/request-indexing route');
ok(/target_sku_key: targetSkuKey/.test(apiSrc),
  'the POST body carries target_sku_key (backend resolves the canonical URL from it)');

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} failed)`);
process.exit(failures === 0 ? 0 : 1);
