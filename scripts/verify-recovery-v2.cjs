/* AI Revenue Recovery v2 — render the real v2 views against placeholder
 * fixtures and assert the audit contract (bands with n, unknowns left out,
 * "Sources mention you", Convert "Not run yet", no composite score, no
 * "$ at risk"). Fixtures are synthetic and use placeholder names only.
 * No network: lib/api-client is stubbed.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const stubs = {
  '@/lib/api-client': { apiClient: new Proxy({}, { get: () => () => Promise.reject(new Error('no network in verify')) }) },
  'next/link': { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href: typeof href === 'string' ? href : String(href?.pathname ?? ''), ...rest }, children) },
  'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams(), notFound: () => { throw new Error('notFound'); } },
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolve(request, parent, ...rest) {
  if (request in stubs) return request;
  if (request.startsWith('@/')) {
    const base = path.join(root, request.slice(2));
    for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
      if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
    }
  }
  return originalResolve.call(this, request, parent, ...rest);
};
for (const [id, exports] of Object.entries(stubs)) {
  const m = new Module(id); m.exports = exports; m.loaded = true; require.cache[id] = m;
}
for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = (module, filename) => {
    const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    module._compile(out, filename);
  };
}

const h = React.createElement;
const { MerchantLanguageProvider } = require('@/components/portal/merchant-language-provider');
const render = (node) => renderToStaticMarkup(h(MerchantLanguageProvider, null, node));
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/recovery-v2', `${name}.json`), 'utf8'));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

/* ── Banned copy, everywhere ─────────────────────────────────────────── */
const BANNED = [/\$\s?at risk/i, /at[- ]risk revenue/i, /composite/i, /overall score/i, /your link cited/i, /readiness score/i];
function assertHonest(html, label) {
  const plain = text(html);
  for (const pattern of BANNED) assert(!pattern.test(plain), `${label}: banned copy ${pattern}`);
  assert(!/\b\d+(\.\d+)?\s?\/\s?10\b/.test(plain), `${label}: 0–10 score`);
}

/* ── R1: mode, credits, shell ────────────────────────────────────────── */
check('store mode: active connection is the only "connected" signal', () => {
  const { deriveStoreMode, deriveCredits, isStoreConnected } = require('@/lib/recovery-v2/mode');
  const store = { id: 's1', platform: 'shopify', name: 'Example Store', is_active: true, is_primary: true, product_count: 248, last_sync: '2026-11-18T10:00:00Z' };
  assert.equal(deriveStoreMode(null).kind, 'unknown');
  assert.equal(deriveStoreMode([]).kind, 'links');
  assert.equal(deriveStoreMode([{ ...store, is_active: false }]).kind, 'links');
  assert.equal(deriveStoreMode([{ ...store, last_sync: null, product_count: 0 }]).kind, 'first_sync');
  const connected = deriveStoreMode([store]);
  assert.equal(connected.kind, 'connected');
  assert.equal(connected.platform, 'Shopify');
  assert.equal(connected.productCount, 248);
  assert(isStoreConnected({ kind: 'first_sync', platform: 'Shopify', storeName: 'x' }));
  assert(!isStoreConnected({ kind: 'links' }));
  // M16: purchased credits can exceed the allowance — both kept separate.
  assert.deepEqual(deriveCredits({ allowance_credits: 4000, consumed_credits: 3000, available_credits: 5200, tier: 'growth' }), { available: 5200, allowance: 4000, tier: 'growth' });
  assert.deepEqual(deriveCredits({ allowance_credits: 4000, consumed_credits: 3000 }), { available: 1000, allowance: 4000, tier: null });
  assert.equal(deriveCredits(null), null);
});

check('shell: nav labels, store card states, credits shown separately', () => {
  const { RecoveryShellView } = require('@/components/recovery-v2/RecoveryShell');
  const base = { pathname: '/dashboard', user: { business_name: 'Example Store', email: 'owner@example.com' }, onLogout() {}, credits: { available: 5200, allowance: 4000, tier: 'growth' }, linksCount: 3 };
  const links = render(h(RecoveryShellView, { ...base, mode: { kind: 'links' } }, h('main', null, 'page')));
  const plain = text(links);
  assert(plain.includes('Overview') && plain.includes('Products') && plain.includes('Plan & credits') && plain.includes('Settings'));
  assert(!/Orders|Analytics|Integrations/.test(plain), 'orders/analytics/integrations are out of the nav');
  assert(!/Shopper questions/.test(plain), 'Questions is held (R6)');
  assert(plain.includes('Store not connected') && plain.includes('Checking 3 product links'));
  assert(plain.includes('5,200 available') && plain.includes('Monthly allowance 4,000'));
  assert(!/ of 4,000 left/.test(plain), 'no "X of Y left" (M16)');
  assert(links.includes('aria-current="page"'));
  assert(!/type="search"/.test(links) && !/Notifications/.test(plain), 'search + notifications hidden (M7)');
  const first = text(render(h(RecoveryShellView, { ...base, mode: { kind: 'first_sync', platform: 'Shopify', storeName: 'x' } }, null)));
  assert(first.includes('Shopify connected') && first.includes('Connected, first sync running'));
  const connected = text(render(h(RecoveryShellView, { ...base, mode: { kind: 'connected', platform: 'Shopify', storeName: 'x', productCount: 248, lastSync: null } }, null)));
  assert(connected.includes('Shopify connected') && connected.includes('248 products synced'));
  const noCredits = text(render(h(RecoveryShellView, { ...base, credits: null, mode: { kind: 'unknown' } }, null)));
  assert(noCredits.includes('Credit balance unavailable') && noCredits.includes('Store status unavailable'));
  assertHonest(links, 'shell');
});

check('i18n: recovery.* copy resolves in all six locales (English fallback)', () => {
  const { translatePortalMessage, SUPPORTED_PORTAL_LANGUAGES } = require('@/lib/i18n/merchant-portal');
  const { recoveryV2EnMessages } = require('@/lib/i18n/recovery-v2');
  const keys = Object.keys(recoveryV2EnMessages);
  assert(keys.length > 0 && keys.every((k) => k.startsWith('recovery.')));
  for (const lang of SUPPORTED_PORTAL_LANGUAGES) {
    for (const key of keys) assert.notEqual(translatePortalMessage(lang, key), key, `${lang} ${key} unresolved`);
  }
  // Nav labelKeys must exist in the catalog.
  const nav = require('@/lib/recovery-v2/navigation');
  for (const item of [...nav.recoveryMainNav, ...nav.recoveryAccountNav]) assert(item.labelKey in recoveryV2EnMessages, item.labelKey);
  const src = fs.readFileSync(path.join(root, 'lib/i18n/merchant-portal.ts'), 'utf8');
  const pending = SUPPORTED_PORTAL_LANGUAGES.filter((l) => l !== 'en').map((l) => {
    const translated = keys.filter((k) => translatePortalMessage(l, k) !== recoveryV2EnMessages[k]).length;
    return `${l} ${translated}/${keys.length}`;
  });
  assert((src.match(/TODO\(recovery-v2 i18n\)/g) || []).length >= 5, 'TODO marker per locale');
  console.log(`  i18n translated (pending before the flag turns on): ${pending.join(' · ')}`);
});

/* Later slices register their checks here. */
const extra = path.join(__dirname, 'verify-recovery-v2.d');
if (fs.existsSync(extra)) {
  for (const file of fs.readdirSync(extra).filter((f) => f.endsWith('.cjs')).sort()) {
    require(path.join(extra, file))({ check, render, h, fixture, text, assertHonest, assert, React });
  }
}

let failed = 0;
for (const [name, fn] of checks) {
  try { fn(); console.log(`ok - ${name}`); } catch (error) { failed += 1; console.error(`not ok - ${name}\n  ${error && error.stack || error}`); }
}
if (failed) { console.error(`${failed} of ${checks.length} recovery-v2 checks failed`); process.exit(1); }
console.log(`recovery-v2: ${checks.length} checks passed`);
