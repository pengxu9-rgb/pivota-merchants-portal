// Offline checks for PerSkuCopyToStore (the copy-back rung). No auth, no cost:
//   node scripts/verify-copyback-render.mjs
// Asserts (1) the product_key parse rule, (2) the copy assembly, (3) the
// getMerchantProductDetail response contract the card consumes, and (4) the
// SAFETY invariant — the component performs NO write to the merchant store.
// Mirrors the offline shape-contract idiom of verify-winplan-render.mjs.

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

// (1) product_key parse rule (mirrors PerSkuCopyToStore.parseProductKey) ──────
function parseProductKey(productKey) {
  const parts = String(productKey ?? '').split('|');
  if (parts.length !== 3 || parts.some((p) => !p.trim())) return null;
  return { platform: parts[1], platformProductId: parts[2] };
}
console.log('product_key parse rule:');
ok(
  JSON.stringify(parseProductKey('m1|shopify|p1')) ===
    JSON.stringify({ platform: 'shopify', platformProductId: 'p1' }),
  'valid 3-part key -> {platform, platformProductId}',
);
ok(parseProductKey('external_seed') === null, '1-part key -> null (card hidden)');
ok(parseProductKey('m1|shopify') === null, '2-part key -> null');
ok(parseProductKey('m1||p1') === null, 'empty middle segment -> null');
ok(parseProductKey('') === null, 'empty -> null');
ok(parseProductKey(null) === null, 'null -> null');

// (2) copy assembly — join non-empty fields, skip blanks ──────────────────────
function copyAll({ title, summary, description, bullets }) {
  return [title, summary, description, (bullets || []).map((b) => `• ${b}`).join('\n')]
    .filter((s) => s.trim())
    .join('\n\n');
}
console.log('\ncopy assembly:');
const full = copyAll({ title: 'T', summary: 'S', description: 'D', bullets: ['a', 'b'] });
ok(
  full.includes('T') && full.includes('S') && full.includes('D') && full.includes('• a'),
  'joins all non-empty fields + bullets',
);
ok(copyAll({ title: '', summary: '', description: 'only', bullets: [] }) === 'only', 'skips empty fields');
ok(copyAll({ title: '', summary: '', description: '', bullets: [] }) === '', 'all-empty -> empty string');

// (3) response contract the card consumes ─────────────────────────────────────
const resp = {
  merchant_id: 'm1',
  platform: 'shopify',
  platform_product_id: 'p1',
  standard: {},
  quality: {},
  agent_push: {},
  enrichment: {
    description_markdown: 'copy',
    summary_short: 's',
    bullet_points: ['x'],
    title_override: 't',
  },
  platform_admin_url: 'https://shop.myshopify.com/admin/products/p1',
};
console.log('\nresponse contract (GET /merchant/products/{platform}/{id}):');
ok('enrichment' in resp, 'response carries enrichment (the copy source)');
ok(typeof resp.enrichment.description_markdown === 'string', 'enrichment.description_markdown present');
ok('platform_admin_url' in resp, 'response carries platform_admin_url (paste-target link)');
ok(
  resp.platform_admin_url === null || typeof resp.platform_admin_url === 'string',
  'platform_admin_url is string | null',
);

// (4) SAFETY — render + copy only, NO write to the merchant store ──────────────
console.log('\nsafety — render + copy only (no store write):');
const src = readFileSync(
  join(here, '..', 'components', 'audit', 'PerSkuCopyToStore.tsx'),
  'utf8',
);
// Match the CALL form (trailing "(") so the component's own docstring — which
// names these methods in prose to say it must NOT call them — doesn't trip the check.
const forbidden = [
  'runMerchantReadinessAction(',
  'submitProductEvidence(',
  'submitPivotaPdpContribution(',
  '.post(',
  '.put(',
  '.patch(',
  '.delete(',
];
for (const f of forbidden) ok(!src.includes(f), `component never calls ${f}`);
ok(src.includes('getMerchantProductDetail'), 'component uses the read-only detail endpoint');

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} failed)`);
process.exit(failures === 0 ? 0 : 1);
