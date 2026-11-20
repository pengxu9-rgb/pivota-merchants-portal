/* R2 — Overview: bands per dimension with n, per-cell n / unknown / failed /
 * 95% range, links mode keeps Identity, Content and Citation, Convert stays
 * "Not run yet". */
module.exports = ({ check, render, h, fixture, text, assertHonest, assert }) => {
  const { buildOverview, runPhase } = require('@/lib/recovery-v2/overview');
  const { OverviewView } = require('@/components/recovery-v2/OverviewView');
  const links = { kind: 'links' };
  const connected = { kind: 'connected', platform: 'Shopify', storeName: 'Example Store', productCount: 248, lastSync: '2026-11-18T09:48:00Z' };
  const view = (state, mode = links, linksCount = 3) => render(h(OverviewView, { state, mode, linksCount }));
  const ready = (name) => ({ kind: 'ready', model: buildOverview(fixture(name)), checkedAt: '2026-11-18T09:22:00Z' });

  check('overview model: per-cell estimates, not-asked vs no-readable, US panel on category row only', () => {
    const model = buildOverview(fixture('recovery-links'));
    assert(model);
    const [branded, unbranded, dupe] = model.tiers;
    assert.equal(branded.kind, 'asked');
    assert.deepEqual([branded.brand.positive, branded.brand.n, branded.brand.unknown], [10, 12, 1]);
    assert.deepEqual([branded.sources.positive, branded.sources.n], [3, 12]);
    assert.equal(branded.exact.kind, 'not_measured_type');
    assert.equal(unbranded.exact.kind, 'measured');
    assert.equal(unbranded.exact.panel, 'us_test_panel');
    assert.deepEqual([unbranded.exact.positive, unbranded.exact.n, unbranded.exact.ci], [3, 24, null]);
    assert.equal(unbranded.brand.failed, 1);
    assert.equal(dupe.kind, 'not_asked');
    const connectedModel = buildOverview(fixture('recovery-connected'));
    assert.equal(connectedModel.tiers[2].kind, 'asked');
    assert.equal(connectedModel.tiers[2].brand.kind, 'no_readable');
    assert.equal(buildOverview({ builder_version: 'old', stages: [] }), null, 'legacy projection → null');
    assert.equal(runPhase(null), 'none');
    assert.equal(runPhase({ status: 'running', completed_at: null }), 'running');
    assert.equal(runPhase({ status: 'failed' }), 'failed');
    assert.equal(runPhase({ status: null, completed_at: '2026-11-18T09:22:00Z' }), 'done');
  });

  check('overview (links mode): Identity, Content, Citation measured; only routing needs a store', () => {
    const html = view(ready('recovery-links'));
    const plain = text(html);
    assertHonest(html, 'overview links');
    assert(plain.includes('Last check Nov 18 · 3 product links'));
    assert(plain.includes("You're checking 3 product links") && plain.includes('Connecting is recommended'));
    assert(/Identity median 16 · 3 products/.test(plain) && plain.includes('Content') && plain.includes('Citation'));
    assert.equal((plain.match(/Needs a connected store/g) || []).length, 1, 'only Catalog routing needs a store');
    assert(plain.includes('10 of 12') && plain.includes('range 55–95%') && plain.includes('1 unknown, left out'));
    assert(plain.includes('3 of 12') && plain.includes('range 9–53%'));
    assert(plain.includes('7 of 24') && plain.includes('1 failed, left out'));
    assert(plain.includes('3 of 24') && plain.includes('US test panel only') && plain.includes('range not reported'));
    assert(plain.includes('Not asked in this check. Re-run to include these questions.'));
    assert(!/Readable answers/.test(plain), 'no shared "readable answers" column (B2)');
    assert(plain.includes('Sources mention you'));
    assert(plain.includes('Not run yet') && plain.includes("Domain verification isn't available yet"));
    assert(!/publish/i.test(plain), 'publishing is off for every store');
  });

  check('overview (connected): routing band shown, no links callout, no-readable alternatives row', () => {
    const plain = text(view(ready('recovery-connected'), connected));
    assert(plain.includes('Last check Nov 18 · 50 products from your catalog'));
    assert(/Catalog routing median 41 · 50 products/.test(plain));
    assert(!plain.includes("You're checking"));
    assert(plain.includes('No readable answers') && plain.includes('1 unknown, 3 failed, left out'));
    assert(plain.includes('Review your products'));
  });

  check('overview: connected store but a links-only run follows that run (catalog_available)', () => {
    const plain = text(view(ready('recovery-links'), connected));
    assert(plain.includes('Not in this check · re-run to include your catalog'));
    assert(!plain.includes('Needs a connected store'));
    const first = text(view(ready('recovery-links'), { kind: 'first_sync', platform: 'Shopify', storeName: 'x' }));
    assert(first.includes('first sync is running'));
  });

  check('overview: empty, running, failed, error and legacy states are honest', () => {
    const none = text(view({ kind: 'none' }));
    assert(none.includes('No checks yet') && none.includes('Product links work without a store'));
    const running = text(view({ kind: 'running' }));
    assert(running.includes('Your check is running') && !/\d+ of \d+/.test(running));
    const failed = text(view({ kind: 'failed' }));
    assert(failed.includes("didn't finish") && failed.includes('Nothing was measured'));
    const error = text(view({ kind: 'error', retry() {} }));
    assert(error.includes('loading problem, not a result') && error.includes('Try again'));
    const legacy = text(view({ kind: 'legacy', reportHref: '/dashboard/agent-center/url-audit' }));
    assert(legacy.includes('predates the new measurements'));
    const loading = view({ kind: 'loading' });
    assert(loading.includes('aria-busy="true"'));
    for (const html of [none, running, failed, error, legacy]) assertHonest(html, 'overview state');
  });
};
