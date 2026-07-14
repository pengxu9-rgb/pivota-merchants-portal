// Offline shape-contract check for the "Closed doors" block in GetCitedPanel,
// against the REAL where_youre_losing of run e3d3019a (merch_924da2be8503e5f7,
// Anuko hair oil) — the run whose grounded answers cited hair.com, L'Oreal's
// house media, on category questions. No auth, no cost.
//   npm run verify:closed-channels
//
// The contract the panel depends on:
//   1. closed_channels[] carries host + why_closed + what_it_means (the card),
//   2. closed_channels_note is a sentence (the block's lede),
//   3. the closed host is NOT also an outreach move — the whole point is that it
//      is unpitchable, so offering it as a pitch would be the bug we are fixing.

import { readFileSync } from 'node:fs';

const path = process.argv[2] || new URL('./fixtures/closed-channels.anuko.json', import.meta.url).pathname;
const { where_youre_losing: w } = JSON.parse(readFileSync(path, 'utf8'));

let failures = 0;
const ok = (c, m) => {
  console[c ? 'log' : 'error'](c ? '  ✓' : '  ✗', m);
  if (!c) failures += 1;
};

console.log('GetCitedPanel — closed doors:');
const closed = w?.closed_channels || [];
ok(closed.length > 0, `closed_channels present (${closed.length})`);
ok(closed.some((c) => c.host === 'hair.com'), 'hair.com surfaced (not silently dropped)');
for (const c of closed) {
  ok(typeof c.why_closed === 'string' && c.why_closed.length > 20, `${c.host}: why_closed renders`);
  ok(typeof c.what_it_means === 'string' && c.what_it_means.length > 20, `${c.host}: what_it_means renders`);
}
ok(typeof w?.closed_channels_note === 'string', 'closed_channels_note (block lede) present');

console.log('\nNo overlap with pitchable channels:');
const moveHosts = (w?.outreach_moves || []).map((m) => m.host);
const targetHosts = (w?.pitch_targets || []).map((t) => t.host);
for (const c of closed) {
  ok(!moveHosts.includes(c.host), `${c.host} is NOT offered as an outreach move`);
  ok(!targetHosts.includes(c.host), `${c.host} is NOT offered as a pitch target`);
}
ok(moveHosts.length > 0, `real moves still render alongside (${moveHosts.join(', ')})`);

console.log(failures ? `\n${failures} FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
