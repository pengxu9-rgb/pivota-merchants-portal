import assert from "node:assert/strict";
import test from "node:test";

import { InsufficientCreditsError } from "../lib/credit-errors.ts";

test("InsufficientCreditsError surfaces typed credit-gap detail", () => {
  const err = new InsufficientCreditsError({
    kind: "audit",
    required: 50,
    available: 12,
    previewUrl: "https://example.test/preview",
    message: "insufficient_credits",
  });
  assert.equal(err.name, "InsufficientCreditsError");
  assert.equal(err.kind, "audit");
  assert.equal(err.required, 50);
  assert.equal(err.available, 12);
  assert.equal(err.short, 38);
  assert.equal(err.previewUrl, "https://example.test/preview");
  assert.ok(err instanceof Error);
});

test("InsufficientCreditsError short is never negative (defensive)", () => {
  // If a stale preview said 'sufficient' but the balance changed
  // between preview and launch and the backend's 402 reports
  // required<available (shouldn't happen, but be defensive), short
  // floors to 0.
  const err = new InsufficientCreditsError({
    kind: "prompt",
    required: 5,
    available: 10,
    previewUrl: null,
    message: "insufficient_credits",
  });
  assert.equal(err.short, 0);
});

test("InsufficientCreditsError supports all three credit kinds", () => {
  for (const kind of ["audit", "prompt", "execution"]) {
    const err = new InsufficientCreditsError({
      kind,
      required: 1,
      available: 0,
      previewUrl: null,
      message: "insufficient_credits",
    });
    assert.equal(err.kind, kind);
    assert.equal(err.short, 1);
  }
});
