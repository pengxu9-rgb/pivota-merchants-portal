/* R5 — Products: per-product bands from the backend, action plan in links
 * mode, suggested copy in connected mode with publishing disabled. */
module.exports = ({ check, render, h, fixture, text, assertHonest, assert }) => {
  const { buildProducts, productReportsFromRun, suggestedCopyFromDetail } = require('@/lib/recovery-v2/products');
  const { ProductsView } = require('@/components/recovery-v2/ProductsView');
  const links = { kind: 'links' };
  const connected = { kind: 'connected', platform: 'Shopify', platformKey: 'shopify', storeName: 'x', productCount: 248, lastSync: '2026-11-18T09:48:00Z' };
  const linkRows = () => buildProducts(productReportsFromRun(fixture('url-run')));
  const catalogRows = () => buildProducts(productReportsFromRun(fixture('catalog-run')));
  const base = { linksCount: 3, selectedKey: null, copy: { kind: 'idle' }, sync: 'idle', onSelect() {}, onClose() {}, onSync() {} };
  const view = (props) => render(h(ProductsView, { ...base, ...props }));

  check('products model: backend bands, weakest first, refs parsed, copy overlay read', () => {
    const rows = linkRows();
    assert.equal(rows.length, 3);
    assert.equal(rows[2].title, 'Example Night Cream', 'the product with a Ready band sorts last');
    assert.equal(rows[0].identity.kind, 'band');
    assert.equal(rows[0].identity.bandKey, 'recovery.band.blocked');
    assert.deepEqual(catalogRows()[0].ref, { platform: 'shopify', platformProductId: '1001' });
    const copy = suggestedCopyFromDetail(fixture('product-detail'));
    assert(copy && copy.title.includes('Example Serum') && copy.bullets.length === 3 && copy.adminUrl);
    assert.equal(suggestedCopyFromDetail({ enrichment: {} }), null);
    assert.deepEqual(buildProducts(null), []);
  });

  check('products (links): action plan, no suggested copy, no "Pass", no publish promise', () => {
    const rows = linkRows();
    const html = view({ state: { kind: 'ready', rows, catalogRun: false }, mode: links, selectedKey: rows[0].key });
    const plain = text(html);
    assertHonest(html, 'products links');
    assert(plain.includes('Checking 3 product links you added'));
    assert(plain.includes('Add product links') && plain.includes('Connect store'));
    assert(plain.includes('Action plan') && plain.includes('Suggested copy needs a connected store'));
    assert(plain.includes('Ask the sites AI cites to mention you') && plain.includes('Connect your store to get suggested copy'));
    assert(plain.includes('Name the exact product'));
    assert(!/\bPass\b/.test(plain) && plain.includes('Ready'));
    assert(!/one click|Publish to store/.test(plain));
    assert(plain.includes('3 product links checked. Connect your store to check up to 50 at a time.'));
  });

  check('products (connected): suggested copy, publish disabled and explained, sync', () => {
    const rows = catalogRows();
    const copy = { kind: 'ready', copy: suggestedCopyFromDetail(fixture('product-detail')) };
    const html = view({ state: { kind: 'ready', rows, catalogRun: true }, mode: connected, selectedKey: rows[0].key, copy });
    const plain = text(html);
    assertHonest(html, 'products connected');
    assert(plain.includes('Shopify connected · 248 products · last sync Nov 18'));
    assert(plain.includes('Sync now') && plain.includes('Suggested copy'));
    assert(plain.includes('[PLACEHOLDER SUGGESTED COPY]') && plain.includes('Open in store admin'));
    assert(/<button[^>]*disabled[^>]*>Publish to store<\/button>/.test(html), 'publish is disabled');
    assert(plain.includes("Publishing to your store isn't available yet"));
    assert(!/Published (on )?[A-Z][a-z]{2} \d/.test(plain), 'no "Published Nov 12" (publishing is off)');
    for (const [kind, phrase] of [['none', 'No suggested copy for this product yet'], ['no_ref', "isn't linked to a product in your store"], ['error', "Couldn't load the suggested copy"], ['loading', 'Loading suggested copy']]) {
      assert(text(view({ state: { kind: 'ready', rows, catalogRun: true }, mode: connected, selectedKey: rows[0].key, copy: { kind } })).includes(phrase), kind);
    }
    assert(text(view({ state: { kind: 'ready', rows, catalogRun: true }, mode: connected, sync: 'started' })).includes('Sync started'));
    // Connected store but only a links run so far → still the action plan.
    assert(text(view({ state: { kind: 'ready', rows: linkRows(), catalogRun: false }, mode: connected, selectedKey: linkRows()[0].key })).includes('Action plan'));
  });

  check('products: empty, error, loading', () => {
    assert(text(view({ state: { kind: 'none' }, mode: links })).includes('No products in your latest check'));
    assert(text(view({ state: { kind: 'error', retry() {} }, mode: links })).includes('loading problem, not a result'));
    assert(view({ state: { kind: 'loading' }, mode: links }).includes('aria-busy="true"'));
  });
};
