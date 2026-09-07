/* Render the real component against backend-produced compatibility/contract fixtures.
 * The contract example is synthetic; it is not a production performance claim.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = path.resolve('components/audit/RevenueRecovery.tsx');
const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module(source, module);
loaded.filename = source;
loaded.paths = module.paths;
const originalRequire = loaded.require.bind(loaded);
loaded.require = id => id === '@/lib/api-client' ? { apiClient: {} } : originalRequire(id);
loaded._compile(compiled, source);
const render = data => renderToStaticMarkup(React.createElement(loaded.exports.RecoveryView, { data }));
(async () => {
  const fixtures = ['historical', 'contract-example'].map(name => JSON.parse(fs.readFileSync(`scripts/fixtures/recovery/${name}.json`)));
  const [historical, example] = fixtures.map(render);
  const postgres = JSON.parse(fs.readFileSync('scripts/fixtures/recovery/postgres-url.json'));
  const postgresHtml = render(postgres);
  assert(postgresHtml.includes('0/1') && postgresHtml.includes('1 failed, excluded'));
  assert(postgresHtml.includes('Catalog routing is not measured'));

  assert(historical.includes('Older reports cannot establish'));
  assert(historical.includes('Not measured'));
  assert(!historical.includes('95% interval'));
  assert(example.includes('1/1') && example.includes('1 unknown') && example.includes('1 failed, excluded'));
  assert(example.includes('95% interval'));
  for (const html of [historical, example]) {
    assert(!html.includes('NaN') && !html.includes('Infinity'));
    assert(html.includes('Catalog routing is not measured'));
    assert(html.includes('Convert sales') && html.includes('Not verified'));
  }
  const locked = render({ ...fixtures[1], actions_locked: true, selection_gap: {
    gaps: [{ query: 'LOCKED-QUERY' }], won_queries: [], lost_queries_without_product: [], counts: { lost_queries: 1, won_queries: 0 }
  }});
  assert(!locked.includes('LOCKED-QUERY'));
  assert(locked.includes('paid plan'));
  const hostile = structuredClone(fixtures[1]);
  hostile.stages[0].findings[0].summary = '<script>alert(1)</script>';
  assert(render(hostile).includes('&lt;script&gt;'));
  if (process.argv[2]) {
    const postcss = require('postcss');
    const tailwind = require('tailwindcss');
    const css = (await postcss([tailwind({ content: [{ raw: fs.readFileSync(source, 'utf8'), extension: 'tsx' }], theme: {}, plugins: [] })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })).css;
    fs.writeFileSync(process.argv[2], `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Recovery contract review</title><style>${css}body{background:#f1f5f9;font-family:system-ui;margin:auto;max-width:1120px;padding:24px}h1{font-size:24px;font-weight:700;margin:16px 0}.case-note{margin:16px 0;color:#475569}</style><body><h1>Revenue recovery · local review</h1><p class="case-note">Actual component rendered from backend test fixtures. This is not a live merchant report.</p><h1>Historical URL report compatibility</h1>${historical}<h1>New contract · synthetic observations</h1><p class="case-note">Illustrates known, unknown and failed responses. Not evidence of production improvement.</p>${example}<h1>PostgreSQL → HTTP → React</h1><p class="case-note">Same test report persisted in local PostgreSQL and returned by the authenticated API. Synthetic observations, no production claims.</p>${postgresHtml}</body></html>`);
  }
  console.log('PASS: historical unknowns, response denominator, intervals, URL scope, paywall, escaping; real React component rendered, including PostgreSQL-to-HTTP fixture.');
})().catch(err => { console.error(err); process.exit(1); });
