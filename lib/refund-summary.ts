/**
 * Normalizers for GET /merchant/orders/{order_id}/refunds.
 *
 * The route returns three things — `refunds`, `order_summary` and
 * `refund_summary` (pivota_infra/routes/merchant_api_extensions.py). Numeric
 * fields arrive as JSON numbers from the canonical backend, but the same
 * columns are `NUMERIC` in Postgres and other callers have been seen to
 * serialize them as strings, so every number goes through `toFiniteNumber`
 * before the UI does arithmetic on it.
 *
 * Keys stay snake_case to match the wire format and the rest of the orders
 * page; the value of this module is coercion and defaulting, not renaming.
 */

export type RefundStatusTone = 'success' | 'error' | 'warning' | 'info';

/** `order_summary` from the refunds endpoint. */
export interface RefundOrderSummary {
  order_id: string | null;
  total_amount: number;
  total_refunded: number;
  refundable_amount: number;
  payment_status: string | null;
  currency: string;
}

/** `refund_summary` from the refunds endpoint. */
export interface RefundTotals {
  total_refunds: number;
  completed_amount: number;
  pending_amount: number;
  failed_count: number;
}

/**
 * Coerce an API numeric (number, numeric string, or absent) to a finite
 * number. NaN/Infinity/null/undefined/non-numeric strings all yield the
 * fallback, so callers never propagate NaN into a currency format.
 */
export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toNonNegativeInt(value: unknown): number {
  const n = toFiniteNumber(value, 0);
  return n > 0 ? Math.floor(n) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalize `order_summary`. Returns null when the payload omits it, so the
 * UI can fall back to its own arithmetic rather than render zeroes as fact.
 *
 * `refundable_amount` is the backend's authoritative figure; it is only
 * derived here when the payload omits it, and is floored at 0 so an
 * over-refunded order can never present a negative headroom.
 */
export function normalizeOrderSummary(raw: unknown): RefundOrderSummary | null {
  if (!isRecord(raw)) return null;

  const total_amount = toFiniteNumber(raw.total_amount, 0);
  const total_refunded = toFiniteNumber(raw.total_refunded, 0);
  const refundable_amount =
    raw.refundable_amount === undefined || raw.refundable_amount === null
      ? total_amount - total_refunded
      : toFiniteNumber(raw.refundable_amount, total_amount - total_refunded);

  const currency = typeof raw.currency === 'string' && raw.currency.trim() !== ''
    ? raw.currency.trim().toUpperCase()
    : 'USD';

  return {
    order_id: typeof raw.order_id === 'string' ? raw.order_id : null,
    total_amount,
    total_refunded,
    refundable_amount: Math.max(0, refundable_amount),
    payment_status: typeof raw.payment_status === 'string' ? raw.payment_status : null,
    currency,
  };
}

/** Normalize `refund_summary`. Returns null when the payload omits it. */
export function normalizeRefundTotals(raw: unknown): RefundTotals | null {
  if (!isRecord(raw)) return null;
  return {
    total_refunds: toNonNegativeInt(raw.total_refunds),
    completed_amount: toFiniteNumber(raw.completed_amount, 0),
    pending_amount: toFiniteNumber(raw.pending_amount, 0),
    failed_count: toNonNegativeInt(raw.failed_count),
  };
}

/**
 * Currency formatter that tolerates a bad ISO code. `Intl.NumberFormat`
 * throws a RangeError on an unknown currency, which would take the whole
 * order modal down for one malformed row.
 */
export function formatMoney(amount: unknown, currency = 'USD'): string {
  const value = toFiniteNumber(amount, 0);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
}

/**
 * Render `processing_time_seconds` (EXTRACT(EPOCH FROM processed_at -
 * created_at), so a float) as a short duration. Returns null when the refund
 * has not been processed yet or the value is unusable — the caller omits the
 * line entirely rather than printing a placeholder.
 */
export function formatProcessingTime(seconds: unknown): string | null {
  if (seconds === null || seconds === undefined) return null;
  const total = toFiniteNumber(seconds, NaN);
  if (!Number.isFinite(total) || total < 0) return null;

  if (total < 10) return `${total.toFixed(1)}s`;
  if (total < 60) return `${Math.round(total)}s`;
  if (total < 3600) {
    const minutes = Math.floor(total / 60);
    return `${minutes}m ${Math.round(total - minutes * 60)}s`;
  }
  const hours = Math.floor(total / 3600);
  return `${hours}h ${Math.round((total - hours * 3600) / 60)}m`;
}

/**
 * Tone for a refund row. The backend already computes `status_type`
 * (refund_service.get_refund_history); `status` is the fallback for rows
 * written before that column existed.
 */
export function refundTone(refund: unknown): RefundStatusTone {
  const record = isRecord(refund) ? refund : {};
  const statusType = record.status_type;
  if (statusType === 'success' || statusType === 'error' || statusType === 'warning' || statusType === 'info') {
    return statusType;
  }
  switch (record.status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'pending':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * Parse an API timestamp, returning null for absent or unparseable values so
 * callers never render "Invalid Date".
 */
export function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
