/**
 * AI Revenue Recovery v2 — English copy.
 *
 * Merged into the merchant portal catalog (lib/i18n/merchant-portal.ts), so
 * every `recovery.*` key resolves in all six locales today: zh-CN, ja-JP,
 * ko-KR, fr-FR and de-DE fall back to this English text.
 *
 * TODO(recovery-v2 i18n): translate every `recovery.*` key into the five other
 * locales before NEXT_PUBLIC_FEATURE_RECOVERY_V2 is turned on in production
 * (build decision 2, 2026-11-19: "fill the other locales before the flag turns on").
 * `scripts/verify-recovery-v2.cjs` lists the keys still pending per locale.
 *
 * Copy rules (audit contract): bands with n, unknowns left out (never counted
 * as misses), 95% ranges, "Sources mention you", Convert stays "Not run yet"
 * until a checkout test runs. No composite score, no "$ at risk".
 */
export const recoveryV2EnMessages: Record<string, string> = {
  // Shell
  "recovery.product": "AI Revenue Recovery",
  "recovery.nav.main": "Main",
  "recovery.nav.overview": "Overview",
  "recovery.nav.products": "Products",
  "recovery.nav.sources": "Sources",
  "recovery.nav.checkout": "Checkout",
  "recovery.nav.reports": "Reports",
  "recovery.nav.accountGroup": "Account",
  "recovery.nav.plan": "Plan & credits",
  "recovery.nav.settings": "Settings",
  "recovery.shell.menu": "Menu",
  "recovery.shell.account": "Account",
  "recovery.shell.logout": "Log out",
  "recovery.shell.yourStore": "Your store",
  "recovery.shell.loading": "Loading…",
  "recovery.store.checking": "Checking store connection…",
  "recovery.store.notConnected": "Store not connected",
  "recovery.store.notConnectedLinks": "Checking {count} product links · Connect",
  "recovery.store.notConnectedNoLinks": "Product links work without it · Connect",
  "recovery.store.connected": "{platform} connected",
  "recovery.store.connectedProducts": "{count} products synced",
  "recovery.store.firstSync": "Connected, first sync running",
  "recovery.store.unknown": "Store status unavailable",
  "recovery.credits.title": "Credits",
  "recovery.credits.available": "{count} available",
  "recovery.credits.allowance": "Monthly allowance {count}",
  "recovery.credits.unavailable": "Credit balance unavailable",
};
