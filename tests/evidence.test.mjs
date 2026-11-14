import assert from "node:assert/strict";
import test from "node:test";

import {
  gradeBadge,
  isVerifiedClaim,
  labCandidateToClaim,
  LAB_SOURCE,
  normalizeEvidenceSourceUrl,
  partitionClaims,
  statusBadge,
} from "../lib/evidence.ts";

test("gradeBadge maps a/b/c to distinct badges, else ungraded", () => {
  assert.equal(gradeBadge("a").label, "Grade A");
  assert.equal(gradeBadge("B").label, "Grade B"); // case-insensitive
  assert.equal(gradeBadge("c").label, "Grade C");
  assert.equal(gradeBadge(null).label, "Ungraded");
  assert.equal(gradeBadge("z").label, "Ungraded");
});

test("statusBadge keeps a submitted or legacy self-graded claim distinct from verified evidence", () => {
  for (const review_status of [undefined, 'submitted']) {
    assert.equal(statusBadge({ claim_text: 'x', substantiation_status: 'substantiated', review_status }).label, 'Submitted');
  }
  assert.equal(statusBadge({ claim_text: 'x', substantiation_status: 'substantiated', review_status: 'verified' }).label, 'Verified');
  assert.equal(statusBadge({ claim_text: 'x', source_type: 'merchant_positioning' }).label, 'Positioning');
  assert.equal(statusBadge({ claim_text: 'x', substantiation_status: 'flagged' }).label, 'Flagged');
  assert.equal(statusBadge({ claim_text: 'x', substantiation_status: 'rejected' }).label, 'Rejected');
});

test("isVerifiedClaim requires reviewed substantiation", () => {
  assert.equal(isVerifiedClaim({ claim_text: "x", substantiation_status: "substantiated", review_status: "verified" }), true);
  assert.equal(isVerifiedClaim({ claim_text: "x", substantiation_status: "substantiated" }), false);
  assert.equal(isVerifiedClaim({ claim_text: "x", substantiation_status: "unverified", review_status: "verified" }), false);
});

test("partitionClaims splits verified claims from all other evidence", () => {
  const claims = [
    { claim_text: "verified", substantiation_status: "substantiated", review_status: "verified" },
    { claim_text: "legacy", substantiation_status: "substantiated" },
    { claim_text: "positioning", substantiation_status: "unverified" },
    { claim_text: "flagged", substantiation_status: "flagged" },
  ];
  const { verified, other } = partitionClaims(claims);
  assert.deepEqual(verified.map((c) => c.claim_text), ["verified"]);
  assert.deepEqual(other.map((c) => c.claim_text), ["legacy", "positioning", "flagged"]);
});

test("partitionClaims tolerates empty / nullish", () => {
  const { verified, other } = partitionClaims([]);
  assert.deepEqual(verified, []);
  assert.deepEqual(other, []);
});

test("labCandidateToClaim includes the artifact and inspectable source URL", () => {
  const out = labCandidateToClaim(
    { claim_text: "SPF 30 verified", source_excerpt: "SPF 30" },
    "art_abc123",
    "https://example.com/report",
  );
  assert.equal(out.claim_text, "SPF 30 verified");
  assert.equal(out.source_type, LAB_SOURCE);
  assert.equal(out.source_type, "merchant_lab_report");
  assert.equal(out.source_ref, "art_abc123");
  assert.equal(out.public_source_url, "https://example.com/report");
});

test("evidence source links require HTTPS without credentials", () => {
  assert.equal(normalizeEvidenceSourceUrl(" https://example.com/report "), "https://example.com/report");
  for (const value of ["", "http://example.com/report", "javascript:alert(1)", "https://user:password@example.com", "https://localhost", "https://example.com/report x"]) {
    assert.equal(normalizeEvidenceSourceUrl(value), null);
  }
});
