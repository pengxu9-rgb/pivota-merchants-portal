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

console.log('it is mounted where the free tier can see it:');
ok(
  /CitationByIntentPanel/.test(urlAuditSrc),
  'url-audit page mounts CitationByIntentPanel',
);
// Ordering is the claim: the breakdown must precede the composite pills, or the
// merchant reads the single number first and the panel becomes a footnote.
const panelAt = urlAuditSrc.indexOf('<CitationByIntentPanel');
const pillsAt = urlAuditSrc.indexOf("scorePill('AI visibility'");
ok(panelAt > -1 && pillsAt > -1, 'both the panel and the score pills are present');
ok(panelAt < pillsAt, 'the distribution is rendered BEFORE the composite pills');

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
