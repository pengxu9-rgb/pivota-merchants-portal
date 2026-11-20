import assert from "node:assert/strict";
import test from "node:test";

import {
  mapUrlAuditFailure,
  needsQuote,
  runParams,
  safeInternalPath,
  urlAuditScope,
} from "../lib/audit/urlAuditRun.ts";

const request = (q = []) => ({
  product_urls: ["https://example-store.example/products/a"],
  website: "https://example-store.example",
  brand: undefined,
  custom_prompts: undefined,
  custom_prompts_by_url: undefined,
  consumer_answer_queries: q,
});

test("needsQuote: URL check page quotes only runs with shopper questions", () => {
  assert.equal(needsQuote(request(), null), false);
  assert.equal(needsQuote(request(["q"]), null), true);
  const quote = { scope: urlAuditScope(request(["q"])), quote_id: "x", credits: 1, base_credits: 1, providers: [], product_count: 1 };
  assert.equal(needsQuote(request(["q"]), quote), false, "a quote for the same scope is reused");
  assert.equal(needsQuote(request(["q2"]), quote), true, "a changed scope needs a new quote");
});

test("needsQuote: quoteAll (Recovery v2 Start) prices every run first", () => {
  assert.equal(needsQuote(request(), null, true), true);
  const quote = { scope: urlAuditScope(request()), quote_id: "x", credits: 0, base_credits: 0, providers: [], product_count: 1 };
  assert.equal(needsQuote(request(), quote, true), false);
});

test("runParams threads the accepted quote and request fields", () => {
  assert.deepEqual(runParams(request(["q"]), "quote-1"), {
    productUrls: ["https://example-store.example/products/a"],
    consumerAnswerQueries: ["q"],
    acceptedQuote: "quote-1",
    website: "https://example-store.example",
    brand: undefined,
    customPrompts: undefined,
    customPromptsByUrl: undefined,
  });
});

const http = (status, detail) => ({ response: { status, data: { detail } } });

test("mapUrlAuditFailure: poll_timeout is a still-running run, not an error", () => {
  assert.deepEqual(mapUrlAuditFailure({ code: "poll_timeout", message: "m", runId: "r1" }, false), { kind: "still_running", notice: "m", runId: "r1" });
  assert.equal(mapUrlAuditFailure({ code: "poll_timeout" }, false).notice, "Still auditing — check Past visibility checks shortly.");
});

test("mapUrlAuditFailure: 409 quote_required, 402 credits, 422 unresolved, fallback", () => {
  const q = mapUrlAuditFailure(http(409, { code: "quote_required" }), true);
  assert.equal(q.error.kind, "quote_required");
  assert.equal(q.error.message, "The audit scope or price changed. Get a fresh quote.");

  const c = mapUrlAuditFailure(http(402, { required: 120, available: 40 }), true);
  assert.equal(c.error.kind, "credits");
  assert.deepEqual([c.error.required, c.error.available], [120, 40]);
  assert.match(c.error.message, /^Not enough credits for this audit: 120 required, 40 available\./);
  assert.match(mapUrlAuditFailure(http(402, {}), false).error.message, /^You've used your free URL audits\./);
  assert.equal(mapUrlAuditFailure(http(402, { message: "server says" }), false).error.message, "server says");

  const u = mapUrlAuditFailure(http(422, { unresolved: [{ url: "https://a.example/x" }, {}], upgrade_path: "/dashboard/billing" }), false);
  assert.equal(u.error.kind, "unresolved");
  assert.deepEqual(u.error.unresolved, ["https://a.example/x"]);
  assert.equal(u.error.upgradePath, "/dashboard/billing");
  assert.match(u.error.message, /\(https:\/\/a\.example\/x\)$/);

  assert.equal(mapUrlAuditFailure(new Error("boom"), false).error.message, "boom");
  assert.equal(mapUrlAuditFailure({}, false).error.message, "Audit failed. Please try again.");
});

test("safeInternalPath accepts one leading slash only", () => {
  assert.equal(safeInternalPath("/dashboard/billing"), "/dashboard/billing");
  assert.equal(safeInternalPath("//evil.example/x"), null);
  assert.equal(safeInternalPath("/\\evil.example"), null);
  assert.equal(safeInternalPath("https://evil.example"), null);
  assert.equal(safeInternalPath(null), null);
  // Browsers strip tab / CR / LF: "/\t/evil" would become "//evil" (P3-1).
  for (const bad of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/ /evil.example", "/x\\y", "/\u0000x"]) {
    assert.equal(safeInternalPath(bad), null, JSON.stringify(bad));
  }
  assert.equal(safeInternalPath("/dashboard/billing?plan=growth#top"), "/dashboard/billing?plan=growth#top");
});
