import assert from "node:assert/strict";
import test from "node:test";

import {
  gradeBadge,
  isServedToAgents,
  labCandidateToClaim,
  LAB_SOURCE,
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

test("statusBadge: only substantiated reads as cited to agents", () => {
  assert.equal(statusBadge("substantiated").label, "Cited to agents");
  assert.equal(statusBadge("unverified").label, "Improves copy only");
  assert.equal(statusBadge("flagged").label, "Flagged");
  assert.equal(statusBadge("rejected").label, "Rejected");
  assert.equal(statusBadge(undefined).label, "Improves copy only");
});

test("isServedToAgents is true only for substantiated", () => {
  assert.equal(isServedToAgents({ claim_text: "x", substantiation_status: "substantiated" }), true);
  assert.equal(isServedToAgents({ claim_text: "x", substantiation_status: "unverified" }), false);
  assert.equal(isServedToAgents({ claim_text: "x" }), false);
});

test("partitionClaims splits served (substantiated) vs copy-only", () => {
  const claims = [
    { claim_text: "served", substantiation_status: "substantiated" },
    { claim_text: "positioning", substantiation_status: "unverified" },
    { claim_text: "flagged", substantiation_status: "flagged" },
  ];
  const { served, copyOnly } = partitionClaims(claims);
  assert.deepEqual(served.map((c) => c.claim_text), ["served"]);
  assert.deepEqual(copyOnly.map((c) => c.claim_text), ["positioning", "flagged"]);
});

test("partitionClaims tolerates empty / nullish", () => {
  const { served, copyOnly } = partitionClaims([]);
  assert.deepEqual(served, []);
  assert.deepEqual(copyOnly, []);
});

test("labCandidateToClaim wires source_ref=artifactId (the grading handshake)", () => {
  const out = labCandidateToClaim(
    { claim_text: "SPF 30 verified", source_excerpt: "SPF 30" },
    "art_abc123",
  );
  assert.equal(out.claim_text, "SPF 30 verified");
  assert.equal(out.source_type, LAB_SOURCE);
  assert.equal(out.source_type, "merchant_lab_report");
  assert.equal(out.source_ref, "art_abc123");
});
