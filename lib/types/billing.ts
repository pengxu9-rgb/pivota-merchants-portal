/**
 * Billing types for the merchant self-serve billing page.
 *
 * Mirrors the merchant-safe payloads returned by the backend billing routes
 * (`routes/billing_routes.py`). All monetary fields are USD *cents* — divide by
 * 100 for display. Only merchant-safe fields are returned by the backend (no
 * COGS / margin / GMV), so this is the full surface available to the portal.
 */

/** GET /api/billing/me/current-period */
export interface BillingCurrentPeriod {
  /** Active plan/tier name, or null when the merchant has no active subscription. */
  tier: string | null;
  allowance_credits: number;
  consumed_credits: number;
  overage_count: number;
  overage_total_usd_cents: number;
  days_remaining: number;
  /** ISO date (first day of the calendar month). */
  period_start: string;
  /** ISO date (first day of the next calendar month). */
  period_end: string;
  in_overage: boolean;
  /**
   * Purchased top-up credits in the merchant's wallet. These persist across
   * calendar months and are spent AFTER the monthly allowance is drained —
   * they are distinct from `allowance_credits`. May be absent on older
   * backends. Defaults to 0.
   */
  purchased_credits?: number;
  /**
   * Total spendable credits available right now = remaining monthly allowance
   * + purchased top-ups. NOT additive with allowance/consumed (which describe
   * allowance usage). May be absent on older backends.
   */
  available_credits?: number;
}

export type BillingStatementStatus = "frozen" | "invoiced";

/** One row of GET /api/billing/me/statements. */
export interface BillingStatement {
  /** ISO date for the statement's calendar month. */
  calendar_month: string;
  tier_name: string | null;
  subscription_revenue_usd_cents: number;
  overage_credits: number;
  overage_revenue_usd_cents: number;
  status: BillingStatementStatus;
  frozen_at: string | null;
  invoiced_at: string | null;
}

/** GET /api/billing/me/statements envelope. */
export interface BillingStatementsResponse {
  statements: BillingStatement[];
}

/** POST /api/billing/checkout-session request body. */
export interface BillingCheckoutSessionRequest {
  price_id: string;
  success_url: string;
  cancel_url: string;
}

/** POST /api/billing/checkout-session response. */
export interface BillingCheckoutSession {
  session_url: string;
  session_id: string;
}

/** One entry of GET /api/billing/plans (mode-scoped, merchant-safe). */
export interface BillingPlan {
  /** Stable id for React keys (the Stripe price id). */
  key: string;
  /** Plan/tier name — matches `BillingCurrentPeriod.tier`. */
  name: string;
  /** Stripe price id to pass to checkout-session. */
  price_id: string;
  price_cents: number;
  monthly_credit_allowance: number;
  currency: string;
}

/** GET /api/billing/plans envelope. */
export interface BillingPlansResponse {
  plans: BillingPlan[];
  /**
   * False for App Store / exempt merchants who must never be billed
   * off-platform — the portal hides all billing UI (and Stripe references)
   * when this is explicitly false. Absent/true keeps billing visible.
   */
  off_platform_billing?: boolean;
}
