/**
 * Typed error surfaces for the credit-balance system (spec §I).
 *
 * Extracted to its own module so node:test (which only handles
 * self-contained TS modules without extensionless imports) can
 * smoke-test the error class. Re-exported from `lib/api-client.ts`
 * for caller compatibility.
 *
 * Per memory feedback_no_execution_layer_fallbacks: callers catch
 * this specifically to render the gap honestly. Never auto-shrink
 * scope to fit available credits — the merchant decides.
 */

export type CreditKind = 'audit' | 'prompt' | 'execution';

export class InsufficientCreditsError extends Error {
  readonly kind: CreditKind;
  readonly required: number;
  readonly available: number;
  readonly short: number;
  readonly previewUrl: string | null;

  constructor(detail: {
    kind: CreditKind;
    required: number;
    available: number;
    previewUrl: string | null;
    message: string;
  }) {
    super(detail.message);
    this.name = 'InsufficientCreditsError';
    this.kind = detail.kind;
    this.required = detail.required;
    this.available = detail.available;
    // Floor at 0 so a stale-preview / race-condition response where
    // required < available doesn't surface a negative "short" amount.
    this.short = Math.max(0, detail.required - detail.available);
    this.previewUrl = detail.previewUrl;
  }
}

/**
 * Thrown when a free/unentitled account requests a premium audit provider
 * (ChatGPT/Claude). The tiered audit model gates these behind a paid plan;
 * the backend returns HTTP 402 `{ code: 'premium_provider_subscription_required' }`
 * rather than silently downgrading to Gemini, so the UI can surface a paywall
 * that honors the merchant's explicit model choice. Callers catch this to render
 * a "subscribe to use premium models" CTA (→ /dashboard/billing).
 */
export class PremiumProviderRequiredError extends Error {
  readonly premiumProvidersRequested: string[];
  readonly freeAlternativeProvider: string | null;
  readonly billingUrl: string;

  constructor(detail: {
    premiumProvidersRequested: string[];
    freeAlternativeProvider: string | null;
    message: string;
  }) {
    super(detail.message);
    this.name = 'PremiumProviderRequiredError';
    this.premiumProvidersRequested = detail.premiumProvidersRequested;
    this.freeAlternativeProvider = detail.freeAlternativeProvider;
    this.billingUrl = '/dashboard/billing';
  }
}

/**
 * Thrown when a credit top-up is attempted but the merchant has no verified
 * Stripe card on file. Top-ups charge the saved card off-session (no card-entry
 * UI in the portal), so the merchant must add a payment method first. The
 * backend returns HTTP 402 `{ error, message, reason }`; callers catch this to
 * route the merchant to Billing to add a card rather than showing a generic
 * failure.
 */
export class MissingVerifiedPaymentMethodError extends Error {
  readonly code: string | null;
  readonly reason: string | null;
  readonly billingUrl: string;

  constructor(detail: {
    code: string | null;
    reason: string | null;
    message: string;
  }) {
    super(detail.message);
    this.name = 'MissingVerifiedPaymentMethodError';
    this.code = detail.code;
    this.reason = detail.reason;
    this.billingUrl = '/dashboard/billing';
  }
}
