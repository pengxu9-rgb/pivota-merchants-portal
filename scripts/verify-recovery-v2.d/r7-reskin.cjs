/* R7 — re-skinned pages and redirects: legacy routes land on their v2 home
 * (flag on only, 307), Orders + refunds live under Settings, Reports lists
 * past checks honestly. */
const fs = require('node:fs');
const path = require('node:path');
module.exports = ({ check, render, h, text, assertHonest, assert }) => {
  const root = path.resolve(__dirname, '../..');
  check('redirects: flag-on only, temporary, map from the migration plan', () => {
    const config = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
    assert(/async redirects\(\) \{\s*if \(!RECOVERY_V2\) return \[\];/.test(config), 'no redirects with the flag off');
    assert(/permanent: false/.test(config), '307, not 308');
    for (const [from, to] of [
      ['/dashboard/analytics', '/dashboard'],
      ['/dashboard/agent-center/funnel', '/dashboard'],
      ['/dashboard/product-optimization', '/dashboard/products'],
      ['/dashboard/pdp-status', '/dashboard/products'],
      ['/dashboard/agent-chat', '/dashboard/products'],
      ['/dashboard/agent-center/storefront-agent-readiness', '/dashboard/checkout'],
      ['/dashboard/orders', '/dashboard/settings/orders'],
    ]) assert(config.includes(`["${from}", "${to}"]`), `${from} → ${to}`);
  });

  check('nav: Checkout and Reports added; Orders/Analytics/Integrations still out', () => {
    const nav = require('@/lib/recovery-v2/navigation');
    const hrefs = nav.recoveryMainNav.map((i) => i.href);
    assert.deepEqual(hrefs, ['/dashboard', '/dashboard/products', '/dashboard/sources', '/dashboard/checkout', '/dashboard/reports']);
    assert(!hrefs.some((h) => /orders|analytics|integrations|questions/.test(h)));
  });

  check('reports: past checks with status, no invented report content', () => {
    const { ReportsView } = require('@/components/recovery-v2/RecoveryPages');
    const run = (over) => ({ run_id: 'r', requested_at: '2026-11-18T09:00:00Z', completed_at: '2026-11-18T09:22:00Z', status: 'succeeded', product_keys: ['a', 'b', 'c'], verdict_labels: [], visibility_score_avg: 42, attribution_score_avg: 10, category_visibility_score_avg: 5, audited_via_pivota_canonical_count: 0, ...over });
    const html = render(h(ReportsView, { state: { kind: 'ready', rows: [
      { run: run({}), kind: 'links' },
      { run: run({ run_id: 'r2', status: 'running', completed_at: null }), kind: 'catalog' },
      { run: run({ run_id: 'r3', status: 'failed', completed_at: null }), kind: 'links' },
    ] } }));
    const plain = text(html);
    assertHonest(html, 'reports');
    assert(plain.includes('Product links') && plain.includes('Catalog'));
    assert(plain.includes('Finished') && plain.includes('Running') && plain.includes("Didn't finish"));
    assert(!/\b42\b/.test(plain), 'no 0–100 visibility score averages');
    assert.equal((html.match(/aria-label="Open report"/g) || []).length, 1, 'only finished checks open');
    assert(plain.includes("Sharing a report link isn't available yet"));
    assert(text(render(h(ReportsView, { state: { kind: 'ready', rows: [] } }))).includes('No checks yet'));
  });

  check('settings: store connection + Past orders & refunds', () => {
    const { RecoverySettingsHeader } = require('@/components/recovery-v2/RecoveryPages');
    const { RecoveryContextStatic } = require('@/components/recovery-v2/RecoveryContext');
    const value = (mode) => ({ merchantId: 'm', mode, credits: null, linksCount: null, refresh() {} });
    const links = text(render(h(RecoveryContextStatic, { value: value({ kind: 'links' }) }, h(RecoverySettingsHeader))));
    assert(links.includes('No store connected. Product links work without one.') && links.includes('Connect a store'));
    assert(links.includes('Past orders & refunds') && links.includes('UCP / ACP'));
    const on = text(render(h(RecoveryContextStatic, { value: value({ kind: 'connected', platform: 'Shopify', storeName: 'x', productCount: 1, lastSync: null }) }, h(RecoverySettingsHeader))));
    assert(on.includes('Shopify connected') && !on.includes('Connect a store'));
  });

  check('re-skin is scoped to the flag-on body class', () => {
    const css = fs.readFileSync(path.join(root, 'styles/recovery-v2-legacy.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = css.split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
    for (const sel of selectors) for (const part of sel.split(',')) assert(part.trim().startsWith('body.rv2'), `unscoped: ${part.trim()}`);
    const v2 = fs.readFileSync(path.join(root, 'styles/recovery-v2.css'), 'utf8');
    assert(!/box-shadow:\s*(?!none)[^;]+;/.test(v2.replace(/\/\*[\s\S]*?\*\//g, '')), 'no shadows in v2 styles');
    assert(!/gradient\(/.test(v2), 'no gradients in v2 styles');
  });
};
