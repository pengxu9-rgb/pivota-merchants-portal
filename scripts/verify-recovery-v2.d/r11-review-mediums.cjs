/* R11 — medium-severity findings from the 11-22 live review:
 * Settings no longer shows a design note or email toggles nothing sends; Checkout names the
 * storefront check and keeps it apart from Convert; the credits card shows free link checks;
 * the plan page and the login page speak for AI Revenue Recovery. */
const fs = require('node:fs');
const path = require('node:path');
module.exports = ({ check, render, h, text, assertHonest, assert }) => {
  const root = path.resolve(__dirname, '../..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

  check('settings: no leaked design note in any locale; v2 hides the email toggles', () => {
    const { translatePortalMessage, SUPPORTED_PORTAL_LANGUAGES } = require('@/lib/i18n/merchant-portal');
    for (const lang of SUPPORTED_PORTAL_LANGUAGES) {
      const value = translatePortalMessage(lang, 'settings.description');
      assert(!/calm place|internal admin|平静|落ち着いて|内部后台|社内向け/.test(value), `${lang}: ${value}`);
    }
    const page = read('app/dashboard/settings/page.tsx');
    assert(page.includes('<LegacySettingsPage v2 />'), 'v2 renders the settings body in v2 mode');
    assert(/\{v2 \? null : \(\s*<>\s*<SurfaceCard\s+title=\{t\('settings\.notificationsCardTitle'\)\}/.test(page), 'v2 hides the Notifications card');
    assert(page.includes("v2 ? t('recovery.settings.autoRunBody')"), 'v2 explains what auto-run runs');
    assert(page.includes('/dashboard/agent-center/ai-readiness'), 'auto-run off says where waiting tasks are');
  });

  check('checkout: names the storefront check and keeps it apart from Convert', () => {
    const { RecoveryCheckoutHeader } = require('@/components/recovery-v2/RecoveryPages');
    const html = render(h(RecoveryCheckoutHeader));
    const plain = text(html);
    assertHonest(html, 'checkout header');
    // One line in the header (the panel below carries "stops before payment" and the steps).
    assert(plain.includes('Checkout') && plain.includes('Storefront check') && plain.includes('where a purchase breaks'));
    assert(plain.includes('separate from Convert') && plain.includes('Not run yet') && plain.includes('domain verification'));
    const page = read('app/dashboard/checkout/page.tsx');
    assert(page.includes('<StorefrontCheckPanels />') && !page.includes('StorefrontAgentReadinessPage'), 'v2 Checkout drops the "Storefront Revenue Recovery" header');
    assert(!read('components/audit/StoreReadinessPanel.tsx').includes('Test whether an agent can buy from your store'));
  });

  check('credits: free link checks are shown, never invented', () => {
    const { deriveCredits } = require('@/lib/recovery-v2/mode');
    const { CreditsCard } = require('@/components/recovery-v2/RecoveryShell');
    const base = { allowance_credits: 0, consumed_credits: 0, available_credits: 0, tier: null };
    assert.deepEqual(deriveCredits({ ...base, free_link_checks: { allowed: 2, used: 0, remaining: 2 } }).freeLinkChecks, { allowed: 2, remaining: 2 });
    assert.equal('freeLinkChecks' in deriveCredits(base), false, 'absent when the backend did not send it');
    const card = (free) => text(render(h(CreditsCard, { credits: deriveCredits(free === undefined ? base : { ...base, free_link_checks: free }) })));
    assert(card({ allowed: 2, used: 0, remaining: 2 }).includes('2 free link checks left'));
    assert(card({ allowed: 2, used: 1, remaining: 1 }).includes('1 free link check left'));
    assert(!/free link check/.test(card({ allowed: 2, used: 2, remaining: 0 })), 'nothing when none are left');
    assert(card({ allowed: null, used: null, remaining: null }).includes('Link checks are free right now'));
    assert(!/free/i.test(card(undefined)), 'nothing when the backend did not say');
    assert(card({ allowed: 2, used: 0, remaining: 2 }).includes('0 available'), 'credits still shown beside it');
  });

  check('plan and login: named for the product in v2, unchanged with the flag off', () => {
    const billing = read('app/dashboard/billing/page.tsx');
    assert(billing.includes("RECOVERY_V2 ? t('recovery.nav.plan') : t('dashboard.billing.eyebrow')"));
    assert(billing.includes("RECOVERY_V2 ? t('recovery.plan.title') : t('dashboard.billing.title')"));
    const login = read('app/login/page.tsx');
    assert(login.includes("RECOVERY_V2 ? t('recovery.product') : t('auth.shell.controlCenter')"));
    for (const key of ['recovery.login.h1.title', 'recovery.login.h2.title', 'recovery.login.h3.title', 'recovery.login.newBody']) assert(login.includes(key), key);
    const { recoveryV2EnMessages } = require('@/lib/i18n/recovery-v2');
    const copy = ['recovery.login.h1.body', 'recovery.login.h2.body', 'recovery.login.h3.body', 'recovery.login.newBody'].map((k) => recoveryV2EnMessages[k]).join(' ');
    assert(!/order|checkout|KYB|payment|transaction/i.test(copy), 'v2 login copy is about recovery, not orders or payments');
  });
};
