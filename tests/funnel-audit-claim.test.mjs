import assert from "node:assert/strict";
import test from "node:test";

import {
  auditFunnelLandingPath,
  sanitizeFunnelAuditRunId,
} from "../lib/onboarding.ts";

// The marketing site mints an anonymous audit run, redirects here with
// ?audit_run_id=..., and the dashboard claims it after login. These two
// helpers are the whole contract between the two repos: if the parameter is
// dropped anywhere along the way, the merchant silently re-runs an audit they
// already watched — the exact failure this funnel exists to remove, and one
// that looks completely healthy from the outside.

test("a v4-shaped run id survives", () => {
  const id = "ce70de2f-c47d-4394-a875-277c85b3e70f";
  assert.equal(sanitizeFunnelAuditRunId(id), id);
  assert.equal(sanitizeFunnelAuditRunId(`  ${id}  `), id);
  assert.equal(sanitizeFunnelAuditRunId(id.toUpperCase()), id.toUpperCase());
});

test("anything not UUID-shaped is dropped", () => {
  // This value is interpolated into an API path segment, so the shape check is
  // the boundary. "Our own site sent it" is not something the browser can
  // verify — the query string is attacker-editable.
  for (const bad of [
    null,
    undefined,
    "",
    "   ",
    "not-a-uuid",
    "../../admin/migrations/pending/211/run",
    "ce70de2f-c47d-4394-a875-277c85b3e70f/../../x",
    "ce70de2f_c47d_4394_a875_277c85b3e70f",
    "ce70de2f-c47d-4394-a875-277c85b3e70",     // one char short
    "ce70de2f-c47d-4394-a875-277c85b3e70ff",   // one char long
    "<script>alert(1)</script>",
  ]) {
    assert.equal(sanitizeFunnelAuditRunId(bad), "", `leaked: ${String(bad)}`);
  }
});

test("the landing path carries the run id", () => {
  const path = auditFunnelLandingPath({
    storeUrl: "https://anua.com",
    businessName: "Anua",
    funnelAuditRunId: "ce70de2f-c47d-4394-a875-277c85b3e70f",
  });
  const url = new URL(path, "https://merchant.pivota.cc");
  assert.equal(url.pathname, "/dashboard/agent-center/url-audit");
  assert.equal(url.searchParams.get("website"), "https://anua.com");
  assert.equal(url.searchParams.get("brand"), "Anua");
  assert.equal(
    url.searchParams.get("audit_run_id"),
    "ce70de2f-c47d-4394-a875-277c85b3e70f",
  );
});

test("a bad run id is omitted rather than passed through", () => {
  const path = auditFunnelLandingPath({
    storeUrl: "https://anua.com",
    funnelAuditRunId: "../../etc/passwd",
  });
  assert.ok(!path.includes("audit_run_id"), path);
  assert.ok(!path.includes("passwd"), path);
});

test("the path still works for a non-funnel signup", () => {
  // The positive counterpart: a builder that dropped everything would pass
  // the omission tests above.
  const path = auditFunnelLandingPath({ storeUrl: "https://anua.com" });
  assert.equal(path, "/dashboard/agent-center/url-audit?website=https%3A%2F%2Fanua.com");
});

test("an empty input yields the bare path, not a dangling ?", () => {
  assert.equal(auditFunnelLandingPath({}), "/dashboard/agent-center/url-audit");
});

// ---- which id a signup uses -------------------------------------------------
//
// The bug this covers: reading the stored id inside the `source` branch made a
// STALE run override a fresh one. Every marketing-funnel arrival carries
// `source`, so it fired on the realistic path — go back, fix a typo, resubmit a
// different domain — and the claim then 403s forever against a domain the
// merchant never registered. Silent, and no test drove it.

test("the query id wins over a stale session id", async (t) => {
  const { resolveFunnelAuditRunId } = await import("../lib/onboarding.ts");
  const fresh = "ce70de2f-c47d-4394-a875-277c85b3e70f";
  const stale = "b43a3eb8-f79b-4be7-9dae-cf7a63f94f62";
  assert.equal(resolveFunnelAuditRunId(fresh, stale), fresh);
});

test("the session id is used only when the query has none", async () => {
  const { resolveFunnelAuditRunId } = await import("../lib/onboarding.ts");
  const stored = "b43a3eb8-f79b-4be7-9dae-cf7a63f94f62";
  assert.equal(resolveFunnelAuditRunId(null, stored), stored);
  assert.equal(resolveFunnelAuditRunId("", stored), stored);
  // ...and a junk query value must not shadow a good stored one, nor pass through
  assert.equal(resolveFunnelAuditRunId("../../x", stored), stored);
});

test("neither source yields empty, never a partial value", async () => {
  const { resolveFunnelAuditRunId } = await import("../lib/onboarding.ts");
  assert.equal(resolveFunnelAuditRunId(null, null), "");
  assert.equal(resolveFunnelAuditRunId("junk", "also-junk"), "");
});
