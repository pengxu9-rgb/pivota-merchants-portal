// Offline contract check for CitationByIntentPanel on the FREE url-audit tier.
//
// WHY THIS EXISTS. The panel was defined inside the ai-readiness page, so the
// only merchants who saw a citation rate WITH ITS DENOMINATOR ("12/36 (33%)")
// were the ones who had already connected a store. The free url-audit tier led
// with `avg_visibility` as a bare "6/100" — a composite that moves several-fold
// on denominator choice and cannot express the thing this panel shows plainly.
//
// The fixture is a VERBATIM slice of a real url_per_sku run, not a hand-written
// dict: the question "does the free tier even populate citation_by_intent?" is
// exactly what a hand-written fixture would have answered wrongly.
//
//   node scripts/verify-citation-by-intent-render.mjs
//
// No auth, no cost, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(
  readFileSync(join(here, 'fixtures', 'citation-by-intent.url-tier.json'), 'utf8'),
);
const panelSrc = readFileSync(
  join(here, '..', 'components', 'audit', 'CitationByIntentPanel.tsx'),
  'utf8',
);
const urlAuditSrc = readFileSync(
  join(here, '..', 'app', 'dashboard', 'agent-center', 'url-audit', 'page.tsx'),
  'utf8',
);

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
};

console.log('the free tier actually carries the data:');
const data = fx.citation_by_intent;
ok(!!data, 'citation_by_intent present on a real url_per_sku run');
const renderable = Object.entries(data).filter(([, v]) => v && v.total > 0);
ok(renderable.length > 0, `${renderable.length} axes have total > 0, so the panel renders`);
ok(
  renderable.every(([, v]) => Number.isInteger(v.cited) && Number.isInteger(v.total)),
  'every axis carries integer cited AND total (the denominator)',
);
ok(
  renderable.every(([, v]) => v.cited <= v.total),
  'no axis reports more citations than questions asked',
);

console.log('the panel keeps the denominator:');
// The whole point. A future edit that renders only the percentage puts the free
// tier back where it started — a rate with no idea how many questions produced
// it. Asserted against the SOURCE so it cannot be lost silently.
ok(
  /\{r\.cited\}\/\{r\.total\}/.test(panelSrc),
  'renders cited/total, not a bare percentage',
);
ok(/\(\{pct\}%\)/.test(panelSrc), 'shows the percentage alongside, not instead');

console.log('it is mounted on the path that actually renders:');
// THE CHECK THIS FILE ORIGINALLY GOT WRONG. The first version asserted only
// that the panel appeared somewhere in the file before the score pills. It
// passed while the panel sat exclusively in the LEGACY branch
// (`report && agg`, agg = brand_report.aggregate), which a modern run never
// reaches — `perSku.length > 0` renders `perSkuDetail` instead. A browser
// screenshot of a real run showed no panel at all while this file said green.
//
// So: assert it is inside the per-SKU `detailBlocks` object, which is the
// branch every current run takes.
const detailStart = urlAuditSrc.indexOf('const detailBlocks =');
const detailEnd = urlAuditSrc.indexOf('const perSkuDetail =');
ok(detailStart > -1 && detailEnd > detailStart, 'found the detailBlocks block');
const detailBlock = urlAuditSrc.slice(detailStart, detailEnd);
ok(
  /<CitationByIntentPanel/.test(detailBlock),
  'panel is mounted inside detailBlocks (the per-SKU path real runs render)',
);
// And still present on the legacy path, so an old run is not left with three
// bare composites.
const legacyAt = urlAuditSrc.indexOf("scorePill('AI visibility'");
ok(legacyAt > -1, 'legacy score pills still located');
const legacyBlock = urlAuditSrc.slice(detailEnd);
ok(
  /<CitationByIntentPanel/.test(legacyBlock),
  'panel is also mounted on the legacy path',
);

console.log('it self-hides rather than rendering an empty shell:');
ok(/if \(!data\) return null;/.test(panelSrc), 'returns null when the field is absent');
ok(
  /if \(rows\.length === 0\) return null;/.test(panelSrc),
  'returns null when every axis is empty',
);

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
