/* R13 — second live review (2026-11-22): Settings' v2 header doesn't mention the hidden
 * notifications; the Security / Language / AI actions card lines are plain; Past orders & refunds
 * drops the legacy header and design-note copy and doesn't call archived orders "Needs action";
 * Checkout's header is one line. Flag off: unchanged. */
const fs = require('node:fs');
const path = require('node:path');
module.exports = ({ check, assert }) => {
  const root = path.resolve(__dirname, '../..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

  check('settings (v2): no shared description, plain card lines', () => {
    const page = read('app/dashboard/settings/page.tsx');
    assert(page.includes("description={v2 ? undefined : t('settings.description')}"), 'v2 header has no "notification preferences" line');
    for (const [key, legacy] of [
      ['recovery.settings.autoRunCardBody', 'settings.automationCardDescription'],
      ['recovery.settings.languageBody', 'settings.languageCardDescription'],
      ['recovery.settings.securityBody', 'settings.securityCardDescription'],
    ]) assert(page.includes(`v2 ? t('${key}') : t('${legacy}')`), key);
    const { recoveryV2EnMessages: en } = require('@/lib/i18n/recovery-v2');
    const copy = ['recovery.settings.autoRunCardBody', 'recovery.settings.languageBody', 'recovery.settings.securityBody'].map((k) => en[k]).join(' ');
    assert(!/fixes|surfaces|verification flow|will return/.test(copy), copy);
  });

  check('past orders (v2): no legacy header or design-note copy; "Still open", not "Needs action"', () => {
    const page = read('app/dashboard/orders/page.tsx');
    assert(/RECOVERY_V2 \? \(\s*<div className="flex justify-end">/.test(page), 'v2 keeps only the Export button');
    assert(page.includes("RECOVERY_V2 ? t('recovery.orders.stillOpen') : t('dashboard.orders.stats.needsAction')"));
    assert(page.includes("description={RECOVERY_V2 ? undefined : t('dashboard.orders.filters.description')}"));
    assert(page.includes("description={RECOVERY_V2 ? undefined : t('dashboard.orders.table.description')}"));
    assert(page.includes("description={t('dashboard.orders.description')}"), 'flag off keeps its header');
  });
};
