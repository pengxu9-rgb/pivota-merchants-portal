/* R12 — low findings from the 11-22 live review: the account slot names the merchant (business name,
 * then connected store, then email) instead of "Your store", and production builds stop logging
 * every API request and response to the browser console. */
const fs = require('node:fs');
const path = require('node:path');
module.exports = ({ check, render, h, text, assert }) => {
  const root = path.resolve(__dirname, '../..');

  check('shell: account slot falls back to the store name, then the email, before "Your store"', () => {
    const { accountName, RecoveryShellView } = require('@/components/recovery-v2/RecoveryShell');
    const connected = { kind: 'connected', platform: 'Shopify', storeName: 'Example Store', productCount: 1, lastSync: null };
    assert.equal(accountName({ business_name: 'Example Co', email: 'owner@example.com' }, connected), 'Example Co');
    assert.equal(accountName({ business_name: '  ', email: 'owner@example.com' }, connected), 'Example Store');
    assert.equal(accountName({ email: 'owner@example.com' }, { kind: 'first_sync', platform: 'Shopify', storeName: 'Example Store' }), 'Example Store');
    assert.equal(accountName({ email: 'owner@example.com' }, { kind: 'links' }), 'owner@example.com');
    assert.equal(accountName(null, { kind: 'links' }), null);
    const base = { pathname: '/dashboard', onLogout() {}, credits: null, linksCount: null, mode: { kind: 'links' } };
    assert(text(render(h(RecoveryShellView, { ...base, user: { email: 'owner@example.com' } }, null))).includes('owner@example.com'));
    assert(text(render(h(RecoveryShellView, { ...base, user: null }, null))).includes('Your store'), 'placeholder only when nothing is known');
  });

  check('api client: request/response traffic is logged only outside production builds', () => {
    const src = fs.readFileSync(path.join(root, 'lib/api-client.ts'), 'utf8');
    assert(src.includes("const logTraffic = process.env.NODE_ENV !== 'production';"));
    for (const marker of ['🔄 API Request', '✅ API Response']) {
      const line = src.split('\n').find((l) => l.includes(marker) && l.includes('console.log'));
      assert(line && line.includes('if (logTraffic)'), `${marker} is gated`);
    }
    assert(src.includes('❌ API Error'), 'errors are still logged');
    // Request errors are logged as text, never as the error object (it carries the bearer token).
    for (const marker of ['❌ Request Error', 'getProducts v2 failed']) {
      const line = src.split('\n').find((l) => l.includes(marker) && /console\.(error|warn)/.test(l));
      assert(line && line.includes('describeRequestError(') && !/,\s*(error|err)\)/.test(line), `${marker} logs no error object`);
    }
    // And every request error is stripped of its bearer token before any caller can log it
    // (81 call sites log the error object): both interceptors of both axios clients.
    assert.equal((src.match(/stripAuthFromError\(error\)/g) || []).length, 2, 'api-client: request + response error interceptors');
    const responseErr = src.slice(src.indexOf('interceptors.response.use'));
    assert(responseErr.indexOf('stripAuthFromError(error)') < responseErr.indexOf('console.error'), 'stripped before the interceptor logs or rejects');
    const legacy = fs.readFileSync(path.join(root, 'lib/api.ts'), 'utf8');
    assert(/interceptors\.response\.use\([\s\S]*stripAuthFromError\(error\)/.test(legacy), 'lib/api.ts strips too');
  });
};
