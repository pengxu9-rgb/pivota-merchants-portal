/* R10 — Settings → Store connections replaces the legacy Integrations page for v2: "Manage store
 * connections" opens it, /dashboard/integrations redirects to it (flag on only), and it shows the
 * stores with sync / primary / disconnect, never payment processors or API credentials. */
const fs = require('node:fs');
const path = require('node:path');
module.exports = ({ check, render, h, text, assertHonest, assert }) => {
  const root = path.resolve(__dirname, '../..');
  const store = (over) => ({ id: 's1', platform: 'shopify', name: 'Example Store', domain: 'shop.example.com', is_active: true, is_primary: true, product_count: 248, last_sync: '2026-11-18T10:00:00Z', ...over });
  const view = (over) => ({ state: { kind: 'ready', stores: [store({})] }, busy: null, confirming: null, notice: null, onSync() {}, onMakePrimary() {}, onAskDisconnect() {}, onCancelDisconnect() {}, onDisconnect() {}, ...over });

  check('store connections: Settings links here and Integrations redirects here', () => {
    const pages = fs.readFileSync(path.join(root, 'components/recovery-v2/RecoveryPages.tsx'), 'utf8');
    assert(pages.includes('href="/dashboard/settings/stores"'), 'Manage store connections opens the v2 page');
    assert(!pages.includes('href="/dashboard/integrations"'), 'no v2 screen links the legacy Integrations page');
    const config = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
    assert(config.includes('["/dashboard/integrations", "/dashboard/settings/stores"]'));
  });

  check('store connections: stores with sync, primary and a confirmed disconnect', () => {
    const { StoreConnectionsView } = require('@/components/recovery-v2/StoreConnections');
    const two = { state: { kind: 'ready', stores: [store({}), store({ id: 's2', name: 'Second Store', domain: 'second.example', platform: 'wix', is_primary: false, product_count: 0, last_sync: null })] } };
    const html = render(h(StoreConnectionsView, view(two)));
    const plain = text(html);
    assertHonest(html, 'store connections');
    assert(plain.includes('Store connections') && plain.includes('Example Store') && plain.includes('shop.example.com'));
    assert(plain.includes('Shopify') && plain.includes('Wix') && plain.includes('248'));
    assert(plain.includes('Primary') && plain.includes('Not yet'), 'primary badge and an unsynced store');
    assert.equal((plain.match(/Make primary/g) || []).length, 1, 'only the non-primary store offers Make primary');
    assert.equal((plain.match(/Sync products/g) || []).length, 2);
    assert(!/payment|processor|PSP|API key|webhook|routing/i.test(plain), 'no Integrations-page content');
    const asking = text(render(h(StoreConnectionsView, view({ ...two, confirming: 's2' }))));
    assert(asking.includes('Disconnect this store?') && asking.includes('Yes, disconnect') && asking.includes('Keep'));
    assert.equal((asking.match(/Yes, disconnect/g) || []).length, 1, 'confirm only on the chosen row');
  });

  check('store connections: empty, error and notice states', () => {
    const { StoreConnectionsView } = require('@/components/recovery-v2/StoreConnections');
    const empty = text(render(h(StoreConnectionsView, view({ state: { kind: 'ready', stores: [] } }))));
    assert(empty.includes('No store connected') && empty.includes('Product links work without a store') && empty.includes('Connect a store'));
    const failed = text(render(h(StoreConnectionsView, view({ state: { kind: 'error', retry() {} } }))));
    assert(failed.includes("Couldn't load your store connections.") && failed.includes('Try again'));
    const notice = render(h(StoreConnectionsView, view({ notice: { tone: 'err', key: 'recovery.stores.disconnect.failed' } })));
    assert(text(notice).includes("Couldn't disconnect this store.") && notice.includes('role="alert"'));
    const inactive = text(render(h(StoreConnectionsView, view({ state: { kind: 'ready', stores: [store({ is_active: false, is_primary: false })] } }))));
    assert(inactive.includes('Not active') && !inactive.includes('Make primary'));
  });
};
