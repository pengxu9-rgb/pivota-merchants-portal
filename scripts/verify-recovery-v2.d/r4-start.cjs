/* R4 — Start + run-cost modal: product links work without a store (and the
 * screen says so), no invented credit quote, honest 402/422/409 states,
 * purchase paths gated like the URL check page. */
module.exports = ({ check, render, h, text, assertHonest, assert }) => {
  const { StartView, startRequest } = require('@/components/recovery-v2/StartView');
  const { CostModal } = require('@/components/recovery-v2/CostModal');
  const links = { kind: 'links' };
  const start = (props = {}) => text(render(h(StartView, { mode: links, isPaid: false, canPurchase: true, questionsEnabled: true, onConnect() {}, onReview() {}, ...props })));
  const req = (q = []) => ({ product_urls: ['https://example-store.example/products/a', 'https://example-store.example/products/b'], website: 'https://example-store.example', consumer_answer_queries: q });
  const modal = (props) => text(render(h(CostModal, { request: req(), phase: 'review', quote: null, quoteStale: false, error: null, credits: { available: 1240, allowance: 4000, tier: 'growth' }, elapsedSec: 0, canPurchase: true, onGetQuote() {}, onStart() {}, onClose() {}, ...props })));
  const err = (e) => ({ upgradePath: null, unresolved: [], required: null, available: null, message: '', ...e });

  check('start: links work without a store, unmistakably; no publishing promise', () => {
    const plain = start();
    assert(plain.includes('No store needed') && plain.includes('Product links work too, with no store at all'));
    assert(plain.includes('Connect your store') && plain.includes('Recommended'));
    assert(plain.includes("Publishing suggested copy to your store isn't available yet"));
    assert(!/publish (it|suggested copy) to Shopify|one click/i.test(plain));
    assert(plain.includes('After you verify your domain (not available yet)'));
    assert(plain.includes('Up to 5 links on your plan. Paid plans check up to 20.'));
    assert(!start({ canPurchase: false }).includes('Paid plans check up to 20'), 'no upsell when purchase is not allowed');
    assert(start({ isPaid: true }).includes('Up to 20 links on your plan.'));
    assert(plain.includes('Shopify') && plain.includes('WooCommerce'));
    const connected = start({ mode: { kind: 'first_sync', platform: 'Shopify', storeName: 'x' } });
    assert(connected.includes('Shopify is connected and its first sync is running'));
    assert(!start({ questionsEnabled: false }).includes('Shopper questions to ask AI'));
    assertHonest(render(h(StartView, { mode: links, isPaid: false, canPurchase: true, questionsEnabled: true, onConnect() {}, onReview() {} })), 'start');
  });

  check('start: request mirrors the URL check (trim, drop blanks, dedupe questions)', () => {
    const r = startRequest({ links: [' https://a.example/p ', '', 'https://b.example/q'], website: ' ', questions: 'q1\nq1\n q2 \n', questionsEnabled: true });
    assert.deepEqual(r, { product_urls: ['https://a.example/p', 'https://b.example/q'], website: undefined, consumer_answer_queries: ['q1', 'q2'] });
    assert.deepEqual(startRequest({ links: ['https://a.example/p'], website: '', questions: 'q1', questionsEnabled: false }).consumer_answer_queries, []);
  });

  check('cost modal: every check is priced before it can start (review P2-2)', () => {
    const before = modal({});
    assert(before.includes('Every check is priced before it starts') && before.includes('Get the cost'));
    assert(!before.includes('Start check'), 'no start button before a quote');
    assert(before.includes('2 product links') && before.includes('1,240 credits available'));
    assert(!/can't show the credit cost/.test(before));
    const free = { scope: 'x', quote_id: 'quote-placeholder', credits: 0, base_credits: 0, providers: ['gemini'], product_count: 2 };
    const freeView = modal({ quote: free });
    assert(freeView.includes('About 0 credits (estimate)') && freeView.includes('covered by your free checks') && freeView.includes('Start check · about 0 credits'));
    const paid = modal({ quote: { ...free, credits: 30, base_credits: 30 } });
    // P3-3: without shopper questions the backend doesn't hold the price → estimate.
    assert(paid.includes('About 30 credits (estimate)') && paid.includes('2 products · gemini') && paid.includes('Start check · about 30 credits') && !paid.includes('free checks'));
    assert(paid.includes('the final amount can differ from this estimate') && !paid.includes('30 credits in total'));
    assert(modal({ phase: 'quoting' }).includes('Getting the cost'));
  });

  check('cost modal: shopper questions show the capture breakdown', () => {
    const quote = { scope: 'x', quote_id: 'quote-placeholder', credits: 120, base_credits: 60, providers: ['gemini'], product_count: 2, consumer_capture: { credits: 60, probe_count: 12 } };
    const after = modal({ request: req(['which serum is best?']), quote });
    assert(after.includes('120 credits in total') && after.includes('Diagnostics 60 · answer capture 60') && after.includes('Start check · 120 credits'));
    assert(!after.includes('estimate'), 'a quote with shopper questions is binding');
    assert(after.includes('Unverified extra answers are refunded'));
  });

  check('cost modal: upgrade link is internal only (no protocol-relative path)', () => {
    const html = render(h(CostModal, { request: req(), phase: 'review', quote: null, quoteStale: false, error: err({ kind: 'unresolved', upgradePath: '//evil.example/x' }), credits: null, elapsedSec: 0, canPurchase: true, onGetQuote() {}, onStart() {}, onClose() {} }));
    assert(!html.includes('//evil.example') && html.includes('href="/dashboard/billing"'));
  });

  check('cost modal: running, still running, and error states', () => {
    assert(modal({ phase: 'running', elapsedSec: 42, quote: { scope: 'x', quote_id: 'q', credits: 0, base_credits: 0, providers: [], product_count: 2 } }).includes('Checking… 42s'));
    assert(modal({ phase: 'still_running' }).includes('Go to Overview'));
    const credits = modal({ request: req(['q']), error: err({ kind: 'credits', required: 120, available: 40, message: 'Placeholder reason' }) });
    assert(credits.includes('Not enough credits') && credits.includes('120 required, 40 available') && credits.includes('remove the shopper questions'));
    assert(credits.includes('Details from the server: Placeholder reason'));
    const noQ = modal({ error: err({ kind: 'credits' }) });
    assert(noQ.includes('Top up in Plan & credits, or connect your store.') && !noQ.includes('shopper questions,'));
    const gated = render(h(CostModal, { request: req(), phase: 'review', quote: null, quoteStale: false, error: err({ kind: 'credits', upgradePath: '/dashboard/billing' }), credits: null, elapsedSec: 0, canPurchase: false, onGetQuote() {}, onStart() {}, onClose() {} }));
    assert(!/Top up|See plans|href="\/dashboard\/billing"/.test(gated), 'no purchase path when off_platform_billing is false');
    const unresolved = modal({ error: err({ kind: 'unresolved', unresolved: ['https://example-store.example/products/a'] }) });
    assert(unresolved.includes("couldn't read a product") && unresolved.includes('https://example-store.example/products/a'));
    assert(modal({ error: err({ kind: 'quote_required' }) }).includes('Get the cost again'));
    assert(modal({ error: err({ kind: 'other', message: 'Placeholder failure' }) }).includes('Details from the server: Placeholder failure'));
  });
};
