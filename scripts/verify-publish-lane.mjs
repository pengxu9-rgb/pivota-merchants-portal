// Offline checks for PublishToStoreLane (the metafield-rung publish surface):
//   node scripts/verify-publish-lane.mjs
// Asserts (A) the write fires ONLY on an explicit click (no useEffect / auto-call),
// (B) the {status} -> message mapping, (C) the copy-back card stays render+copy-only
// (its no-write invariant intact), (D) the lane only renders from the loaded preview.
// Mirrors the offline shape/safety idiom of verify-copyback-render.mjs.

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

const laneSrc = readFileSync(
  join(here, '..', 'components', 'audit', 'PublishToStoreLane.tsx'), 'utf8');
const cardSrc = readFileSync(
  join(here, '..', 'components', 'audit', 'PerSkuCopyToStore.tsx'), 'utf8');

// (A) Safety — the write fires only on an explicit click, never auto ──────────
console.log('safety — explicit-click-only write:');
// match the call form so the docstring ("no useEffect") doesn't trip the check
ok(!laneSrc.includes('useEffect('), 'lane has no useEffect( (no fetch-on-mount / auto-write)');
const publishCalls = (laneSrc.match(/apiClient\.publishStorePdp\(/g) || []).length;
ok(publishCalls === 1, `exactly one publishStorePdp call site (found ${publishCalls})`);
ok(/async function publish\(\)/.test(laneSrc), 'the write is wrapped in a publish() handler');
ok(/onClick=\{publish\}/.test(laneSrc), 'publish() is bound to a Confirm onClick (explicit gesture)');
ok(
  /kind: 'confirming'/.test(laneSrc) && /Confirm publish/.test(laneSrc),
  'a confirm step gates the publish (preview -> confirm -> write, not one-click)',
);

// (B) {status} -> message mapping ─────────────────────────────────────────────
console.log('\nstatus mapping:');
for (const s of ['written', 'blocked', 'needs_write_products', 'no_copy']) {
  ok(laneSrc.includes(`case '${s}'`), `maps ${s}`);
}
ok(/write_products/.test(laneSrc), 'needs_write_products message names the scope (merchant guidance)');

// (C) the copy-back card stays render+copy-only (legacy invariant intact) ──────
console.log('\ncopy-back card invariant (no store write in PerSkuCopyToStore):');
for (const f of ['.post(', '.put(', '.patch(', '.delete(', 'publishStorePdp(', 'runMerchantReadinessAction(']) {
  ok(!cardSrc.includes(f), `PerSkuCopyToStore.tsx never calls ${f} (the write lives in PublishToStoreLane)`);
}
ok(cardSrc.includes('<PublishToStoreLane'), 'card renders the lane');

// (D) the lane renders only from the loaded preview state ──────────────────────
console.log('\npreview precondition:');
const loadedIdx = cardSrc.indexOf("state.kind === 'loaded'");
const laneIdx = cardSrc.indexOf('<PublishToStoreLane');
ok(loadedIdx !== -1 && laneIdx > loadedIdx, 'lane is rendered within the loaded branch (copy previewed first)');

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} failed)`);
process.exit(failures === 0 ? 0 : 1);
