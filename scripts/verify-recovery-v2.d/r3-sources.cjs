/* R3 — Sources: three outreach states with one label each, "Sources mention
 * you", Sent from the merchant's own tasks, Mark as sent. */
module.exports = ({ check, render, h, fixture, text, assertHonest, assert }) => {
  const { buildSources, sourcesInputFromRun, tabCounts, inTab } = require('@/lib/recovery-v2/sources');
  const { SourcesView } = require('@/components/recovery-v2/SourcesView');
  const tasks = fixture('tasks').tasks;
  const linksRows = () => buildSources({ ...sourcesInputFromRun(fixture('url-run')), tasks });
  const actions = { markSent: async () => {}, draftPitch: async () => ({ draft: 'x', charged: 1 }) };
  const view = (rows, initialHost) => render(h(SourcesView, { state: { kind: 'ready', rows, canDraft: true }, actions, initialHost }));

  check('sources model: three states, sent from tasks, mention from outcomes', () => {
    const rows = linksRows();
    const by = Object.fromEntries(rows.map((r) => [r.host, r]));
    assert.equal(by['reseller-one.example'].state, 'draft_ready');
    assert.equal(by['skin-review.example'].state, 'submission_only', 'contact form = submission_only, not "draft ready" (M5)');
    assert.equal(by['marketplace.example'].state, 'target_only');
    assert.equal(by['beauty-blog.example'].state, 'target_only');
    assert.equal(by['marketplace.example'].recipientEmail, null);
    assert.equal(by['derm-forum.example'].sent, true);
    assert.equal(by['glow-guide.example'].mentionsYou, 'yes');
    assert.equal(by['reseller-one.example'].mentionsYou, 'no');
    assert.deepEqual(tabCounts(rows), { all: 7, to_contact: 3, sent: 1, mention: 1 });
    assert(!inTab(by['marketplace.example'], 'to_contact'), 'no contact → not "to contact"');
    const catalog = buildSources({ ...sourcesInputFromRun(fixture('catalog-run')), tasks: [] });
    const reseller = catalog.find((r) => r.host === 'reseller-one.example');
    assert(reseller.pitch && reseller.pitch.subject.includes('PLACEHOLDER'));
    assert.equal(catalog.find((r) => r.host === 'marketplace.example').pitch, null);
    assert.deepEqual(buildSources({}), []);
  });

  check('sources view: labels, tabs, "Sources mention you", no "your link cited"', () => {
    const html = view(linksRows());
    const plain = text(html);
    assertHonest(html, 'sources');
    assert(plain.includes('Sources mention you'));
    assert(plain.includes('All 7') && plain.includes('To contact 3') && plain.includes('Sent 1') && plain.includes('Mention you now 1'));
    for (const label of ['Email pitch', 'Contact form', 'No contact yet']) assert(plain.includes(label), label);
    assert(!/Draft ready|Target — no contact yet|No contact found|Now cite you|link to you/.test(plain), 'retired labels (M5)');
    assert(plain.includes('Sent · re-check on next run') && plain.includes('Mentions you on last run'));
    assert(plain.includes('9 questions') && plain.includes('1 question'));
    assert(plain.includes('Pick a site'));
  });

  check('sources detail: form host, email host with draft, no-contact host, sent host', () => {
    const rows = linksRows();
    const form = text(view(rows, 'skin-review.example'));
    assert(form.includes('Contact form') && form.includes('Open their contact form') && form.includes('Mark as sent'));
    assert(form.includes("We can't show the amount before it runs"), 'draft cost honesty');
    const none = text(view(rows, 'marketplace.example'));
    assert(none.includes("We haven't found a way to reach this site yet") && !none.includes('Mark as sent'));
    const sent = text(view(rows, 'derm-forum.example'));
    assert(sent.includes("You marked this sent") && !sent.includes('Mark as sent'));
    const mention = text(view(rows, 'glow-guide.example'));
    assert(mention.includes("This site's sources mentioned you on your last run"));
    const catalog = buildSources({ ...sourcesInputFromRun(fixture('catalog-run')), tasks: [] });
    const email = view(catalog, 'reseller-one.example');
    assert(email.includes('href="mailto:partners@reseller-one.example') && text(email).includes('Check every fact'));
  });

  check('sources: empty, error and loading states', () => {
    const empty = text(render(h(SourcesView, { state: { kind: 'none' }, actions })));
    assert(empty.includes('No sources in your latest check'));
    const error = text(render(h(SourcesView, { state: { kind: 'error', retry() {} }, actions })));
    assert(error.includes('loading problem, not a result'));
    assert(render(h(SourcesView, { state: { kind: 'loading' }, actions })).includes('aria-busy="true"'));
  });
};
