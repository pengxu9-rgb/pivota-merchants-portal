/* Every v2-only page (one that calls notFound() when the flag is off) must be
 * listed in next.config.mjs RECOVERY_V2_ONLY_ROUTES, so a flag-off build still
 * answers a real 404 for it. */
const fs = require('node:fs');
const path = require('node:path');
module.exports = ({ check, assert }) => {
  check('v2-only routes are rewritten to 404 when the flag is off', () => {
    const root = path.resolve(__dirname, '../..');
    const config = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
    const block = (config.match(/RECOVERY_V2_ONLY_ROUTES = \[([^\]]*)\]/) || [])[1] || '';
    const listed = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const pages = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'page.tsx' && /if \(!FEATURE_FLAGS\.RECOVERY_V2\) notFound\(\)/.test(fs.readFileSync(full, 'utf8'))) {
          pages.push('/' + path.relative(path.join(root, 'app'), path.dirname(full)).split(path.sep).join('/'));
        }
      }
    };
    walk(path.join(root, 'app'));
    assert(pages.length > 0);
    for (const route of pages) assert(listed.includes(route), `${route} is v2-only but not in RECOVERY_V2_ONLY_ROUTES`);
  });
};
