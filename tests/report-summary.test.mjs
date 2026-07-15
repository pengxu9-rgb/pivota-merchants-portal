import assert from "node:assert/strict";
import test from "node:test";

import {
  actionSupportingPrompts,
  bandLabel,
  bandTone,
  formatDisplayDelta,
  formatDisplayScore,
  measuredSubscores,
  summaryRenderable,
} from "../lib/audit/reportSummary.ts";

test("formatDisplayScore renders the backend display value at one decimal", () => {
  assert.equal(formatDisplayScore(4.2), "4.2");
  assert.equal(formatDisplayScore(10), "10.0");
  assert.equal(formatDisplayScore(0), "0.0"); // a real zero renders, never hides
  assert.equal(formatDisplayScore(null), null);
  assert.equal(formatDisplayScore(undefined), null);
  assert.equal(formatDisplayScore(NaN), null);
});

test("formatDisplayDelta keeps small movements visible on the 0-10 scale", () => {
  assert.equal(formatDisplayDelta(5), "+0.5"); // raw 42→47 must not vanish
  assert.equal(formatDisplayDelta(-3), "−0.3");
  assert.equal(formatDisplayDelta(0), "±0.0");
  assert.equal(formatDisplayDelta(null), null);
});

test("band label + tone map the contract enum, unknown degrades to neutral", () => {
  assert.equal(bandLabel("needs_work"), "Needs work");
  assert.equal(bandLabel("pass"), "Pass");
  assert.equal(bandLabel("mystery_band"), null); // never invent a label
  assert.equal(bandLabel(null), null);
  assert.equal(bandTone("needs_work"), "warning");
  assert.equal(bandTone("excellent"), "success");
  assert.equal(bandTone("mystery_band"), "neutral");
});

test("actionSupportingPrompts honours the backend's basis stamp", () => {
  const prompts = [{ query: "best serum" }, { query: "" }, null];
  assert.deepEqual(
    actionSupportingPrompts({
      supporting_prompts: prompts,
      supporting_prompts_basis: "evidence_used",
    }),
    [{ query: "best serum" }],
  );
  // basis 'none' → nothing renders even if prompts are (wrongly) present.
  assert.deepEqual(
    actionSupportingPrompts({
      supporting_prompts: prompts,
      supporting_prompts_basis: "none",
    }),
    [],
  );
  // missing basis → treated as no join, never inferred client-side.
  assert.deepEqual(actionSupportingPrompts({ supporting_prompts: prompts }), []);
  assert.deepEqual(actionSupportingPrompts(null), []);
});

test("summaryRenderable requires a score or a verdict headline", () => {
  assert.equal(summaryRenderable(null), false);
  assert.equal(summaryRenderable({}), false);
  assert.equal(summaryRenderable({ score: { display: null } }), false);
  assert.equal(summaryRenderable({ score: { display: 4.2 } }), true);
  assert.equal(
    summaryRenderable({ verdict: { headline: "Invisible today." } }),
    true,
  );
});

test("measuredSubscores drops unmeasured axes", () => {
  assert.deepEqual(
    measuredSubscores({
      subscores: [
        { key: "visibility", raw: 42, display: 4.2 },
        { key: "attribution", raw: null, display: null },
        null,
      ],
    }),
    [{ key: "visibility", raw: 42, display: 4.2 }],
  );
  assert.deepEqual(measuredSubscores(null), []);
});
