import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMoney,
  formatProcessingTime,
  normalizeOrderSummary,
  normalizeRefundTotals,
  parseTimestamp,
  refundTone,
  toFiniteNumber,
} from "../lib/refund-summary.ts";

test("toFiniteNumber coerces API numerics and rejects junk", () => {
  assert.equal(toFiniteNumber(12.5), 12.5);
  // NUMERIC columns can serialize as strings.
  assert.equal(toFiniteNumber("12.50"), 12.5);
  assert.equal(toFiniteNumber("0"), 0);
  assert.equal(toFiniteNumber(null), 0);
  assert.equal(toFiniteNumber(undefined), 0);
  assert.equal(toFiniteNumber(""), 0);
  assert.equal(toFiniteNumber("  "), 0);
  assert.equal(toFiniteNumber("abc"), 0);
  assert.equal(toFiniteNumber(NaN), 0);
  assert.equal(toFiniteNumber(Infinity), 0);
  assert.equal(toFiniteNumber({}), 0);
  assert.equal(toFiniteNumber(undefined, 7), 7);
});

test("normalizeOrderSummary keeps the backend's refundable_amount", () => {
  // Backend reconciles orders.total_refunded against refund_records, so its
  // refundable_amount can disagree with total_amount - total_refunded. The
  // backend value must win.
  const summary = normalizeOrderSummary({
    order_id: "ord_1",
    total_amount: 100,
    total_refunded: 25,
    refundable_amount: 60,
    payment_status: "partially_refunded",
    currency: "eur",
  });
  assert.equal(summary.refundable_amount, 60);
  assert.notEqual(summary.refundable_amount, 75);
  assert.equal(summary.order_id, "ord_1");
  assert.equal(summary.total_amount, 100);
  assert.equal(summary.total_refunded, 25);
  assert.equal(summary.payment_status, "partially_refunded");
  assert.equal(summary.currency, "EUR");
});

test("normalizeOrderSummary derives refundable_amount only when absent", () => {
  const missing = normalizeOrderSummary({ total_amount: 100, total_refunded: 30 });
  assert.equal(missing.refundable_amount, 70);

  const explicitNull = normalizeOrderSummary({
    total_amount: 100,
    total_refunded: 30,
    refundable_amount: null,
  });
  assert.equal(explicitNull.refundable_amount, 70);

  // An explicit 0 is a real answer (fully refunded), not a missing value.
  const zero = normalizeOrderSummary({
    total_amount: 100,
    total_refunded: 100,
    refundable_amount: 0,
  });
  assert.equal(zero.refundable_amount, 0);
});

test("normalizeOrderSummary floors refundable_amount at zero", () => {
  // An over-refunded order must never advertise negative headroom, which
  // would otherwise let the dialog's `amount > maxRefundable` check pass.
  const over = normalizeOrderSummary({
    total_amount: 50,
    total_refunded: 80,
    refundable_amount: -30,
  });
  assert.equal(over.refundable_amount, 0);
});

test("normalizeOrderSummary defaults currency and tolerates string numerics", () => {
  const summary = normalizeOrderSummary({
    total_amount: "100.00",
    total_refunded: "25.50",
    refundable_amount: "74.50",
  });
  assert.equal(summary.total_amount, 100);
  assert.equal(summary.total_refunded, 25.5);
  assert.equal(summary.refundable_amount, 74.5);
  assert.equal(summary.currency, "USD");
  assert.equal(summary.payment_status, null);
  assert.equal(summary.order_id, null);

  assert.equal(normalizeOrderSummary({ currency: "" }).currency, "USD");
  assert.equal(normalizeOrderSummary({ currency: 42 }).currency, "USD");
});

test("normalizeOrderSummary returns null when the payload omits it", () => {
  // null (not a zeroed object) so the UI falls back instead of presenting
  // fabricated zeroes as the order's real figures.
  assert.equal(normalizeOrderSummary(undefined), null);
  assert.equal(normalizeOrderSummary(null), null);
  assert.equal(normalizeOrderSummary("nope"), null);
  assert.equal(normalizeOrderSummary([]), null);
});

test("normalizeRefundTotals coerces counts and amounts", () => {
  const totals = normalizeRefundTotals({
    total_refunds: 3,
    completed_amount: "45.25",
    pending_amount: 10,
    failed_count: 1,
  });
  assert.equal(totals.total_refunds, 3);
  assert.equal(totals.completed_amount, 45.25);
  assert.equal(totals.pending_amount, 10);
  assert.equal(totals.failed_count, 1);
});

test("normalizeRefundTotals clamps counts to non-negative integers", () => {
  const totals = normalizeRefundTotals({
    total_refunds: 2.9,
    failed_count: -4,
    completed_amount: null,
    pending_amount: undefined,
  });
  assert.equal(totals.total_refunds, 2);
  assert.equal(totals.failed_count, 0);
  assert.equal(totals.completed_amount, 0);
  assert.equal(totals.pending_amount, 0);
});

test("normalizeRefundTotals returns null when the payload omits it", () => {
  assert.equal(normalizeRefundTotals(undefined), null);
  assert.equal(normalizeRefundTotals(null), null);
  assert.equal(normalizeRefundTotals(7), null);
});

test("formatMoney honours the order currency", () => {
  assert.equal(formatMoney(1234.5, "USD"), "$1,234.50");
  assert.equal(formatMoney(10, "USD"), "$10.00");
  assert.equal(formatMoney("25.5", "USD"), "$25.50");
  assert.ok(formatMoney(10, "EUR").includes("10.00"));
  assert.notEqual(formatMoney(10, "EUR"), formatMoney(10, "USD"));
});

test("formatMoney falls back instead of throwing on a bad currency code", () => {
  // Intl.NumberFormat throws RangeError on an unknown code; one malformed
  // row must not take the whole order modal down.
  assert.equal(formatMoney(10, "NOT_A_CURRENCY"), "$10.00");
  assert.equal(formatMoney(10, ""), "$10.00");
  assert.equal(formatMoney(null, "USD"), "$0.00");
});

test("formatProcessingTime renders sub-minute, minute and hour durations", () => {
  assert.equal(formatProcessingTime(0), "0.0s");
  assert.equal(formatProcessingTime(1.24), "1.2s");
  assert.equal(formatProcessingTime(9.99), "10.0s");
  assert.equal(formatProcessingTime(42.4), "42s");
  assert.equal(formatProcessingTime(65), "1m 5s");
  assert.equal(formatProcessingTime(3600), "1h 0m");
  assert.equal(formatProcessingTime(7500), "2h 5m");
  assert.equal(formatProcessingTime("125"), "2m 5s");
});

test("formatProcessingTime returns null for unprocessed or unusable values", () => {
  assert.equal(formatProcessingTime(null), null);
  assert.equal(formatProcessingTime(undefined), null);
  assert.equal(formatProcessingTime(-1), null);
  assert.equal(formatProcessingTime("abc"), null);
  assert.equal(formatProcessingTime(NaN), null);
});

test("refundTone prefers the backend status_type", () => {
  assert.equal(refundTone({ status: "completed", status_type: "success" }), "success");
  assert.equal(refundTone({ status: "failed", status_type: "error" }), "error");
  assert.equal(refundTone({ status: "pending", status_type: "warning" }), "warning");
  assert.equal(refundTone({ status: "cancelled", status_type: "info" }), "info");
  // status_type wins over status when the two disagree.
  assert.equal(refundTone({ status: "completed", status_type: "warning" }), "warning");
});

test("refundTone falls back to status, and never mislabels an unknown one", () => {
  assert.equal(refundTone({ status: "completed" }), "success");
  assert.equal(refundTone({ status: "failed" }), "error");
  assert.equal(refundTone({ status: "pending" }), "warning");
  // The old inline ternary painted every non-completed/non-pending status
  // red; 'cancelled' is not a failure.
  assert.equal(refundTone({ status: "cancelled" }), "info");
  assert.equal(refundTone({ status: "processing" }), "info");
  assert.equal(refundTone({ status_type: "bogus" }), "info");
  assert.equal(refundTone({}), "info");
  assert.equal(refundTone(null), "info");
});

test("parseTimestamp rejects unparseable values", () => {
  assert.equal(parseTimestamp("2026-08-11T10:37:00Z").toISOString(), "2026-08-11T10:37:00.000Z");
  assert.equal(parseTimestamp(null), null);
  assert.equal(parseTimestamp(undefined), null);
  assert.equal(parseTimestamp(""), null);
  assert.equal(parseTimestamp("not a date"), null);
  assert.equal(parseTimestamp(1754900000000), null);
  assert.equal(parseTimestamp(new Date("nope")), null);
});
