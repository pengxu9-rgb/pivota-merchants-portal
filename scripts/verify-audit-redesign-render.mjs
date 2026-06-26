// Offline shape-contract check for the redesigned per-product audit card.
// Runs against the REAL report_jsonb of run a51ae093 (merch_efbc46b4619cfbdf,
// Anuko) to assert the fields the new components consume are populated, and that
// the honest recommended-vs-listing split drives the right verdict. No auth, no
// cost. Usage:  node scripts/verify-audit-redesign-render.mjs <path-to-run.json>
//
// The fixture is { meta, report }, where report === the per_sku report_jsonb the
// GET envelope forwards intact (per_sku_reports + authority_map + merchant_narrative).

import { readFileSync } from 'node:fs';

const path =
  process.argv[2] ||
  '/private/tmp/claude-502/-Users-pengchydan-dev-PIVOTA-Agent/f6284fc2-442d-4cd0-8c56-a14c9ca794ec/scratchpad/run_a51ae093.json';
const report = JSON.parse(readFileSync(path, 'utf8')).report;

let failures = 0;
const ok = (cond, msg) => {
  console[cond ? 'log' : 'error'](cond ? '  ✓' : '  ✗', msg);
  if (!cond) failures += 1;
};

const skus = report.per_sku_reports || [];
ok(skus.length > 0, `per_sku_reports present (${skus.length})`);

// ── ProductCompetitivenessPanel: the honest split (NOT a flat "appears N/M") ──
console.log('\nProductCompetitivenessPanel — honest split:');
const sku0 = skus[0];
const disc = sku0.product_competitiveness?.discovery;
ok(disc != null, 'sku0 product_competitiveness.discovery present');
ok(typeof disc.appeared_recommended === 'number', 'discovery.appeared_recommended present (the lead metric)');
ok(typeof disc.appeared_listing === 'number', 'discovery.appeared_listing present');
ok(
  disc.appeared_recommended + disc.appeared_listing === disc.appeared,
  `split reconciles: recommended(${disc.appeared_recommended}) + listing(${disc.appeared_listing}) === appeared(${disc.appeared})`,
);
const bm = sku0.product_competitiveness?.by_model;
ok(bm && Object.keys(bm).length >= 2, `by_model populated (${Object.keys(bm || {}).join(', ')})`);
ok(Array.isArray(sku0.product_competitiveness?.model_divergence), 'model_divergence array present');

// ── Honest verdict logic (mirror of lib/audit/agenticVerdict) ────────────────
console.log('\nagenticVerdict — derived label:');
const verdictOf = (r) => {
  const pc = r.product_competitiveness;
  if (!pc) return null;
  if (pc.grounding_unavailable) return "Couldn't measure";
  if (!pc.has_discovery) return 'Needs a category';
  const d = pc.discovery;
  const rec = d.appeared_recommended ?? 0;
  const lst = d.appeared_listing ?? d.appeared;
  if (rec > 0) return 'Recommended';
  if (lst > 0) return 'Findable, not recommended';
  return 'Not yet visible';
};
const v0 = verdictOf(sku0);
ok(
  v0 === 'Findable, not recommended',
  `sku0 verdict = "${v0}" (rec=${disc.appeared_recommended}, listing=${disc.appeared_listing}) — the honest "found but not endorsed" state, not a false win`,
);

// ── PromptEvidencePanel: the verbatim AI answer (the richest dropped field) ───
console.log('\nPromptEvidencePanel — verbatim evidence:');
const perPrompt = sku0.opportunity?.per_prompt || [];
ok(perPrompt.length > 0, `opportunity.per_prompt present (${perPrompt.length} rows)`);
const withExcerpt = perPrompt.filter((r) => r?.cited_evidence?.excerpt);
ok(withExcerpt.length > 0, `${withExcerpt.length} rows carry cited_evidence.excerpt (the verbatim answer)`);
const withVerdicts = perPrompt.filter((r) => r?.provider_verdicts && Object.keys(r.provider_verdicts).length);
ok(withVerdicts.length > 0, `${withVerdicts.length} rows carry provider_verdicts`);
const withSub = perPrompt.filter((r) => r?.substitution?.present && r.substitution.substituted_by);
ok(withSub.length > 0, `${withSub.length} rows carry a substitution ("AI named X instead")`);

// ── StrategicBriefPanel: the previously-dropped sharp fields ──────────────────
console.log('\nStrategicBriefPanel — your_angle + substitution_play:');
const briefed = skus.find((r) => r.next_best_action?.strategic_brief);
ok(briefed != null, 'at least one SKU has a populated strategic_brief');
const brief = briefed?.next_best_action?.strategic_brief || {};
ok(typeof brief.your_angle === 'string' && brief.your_angle.length > 0, 'strategic_brief.your_angle present (was dropped)');
ok(typeof brief.substitution_play === 'string' && brief.substitution_play.length > 0, 'strategic_brief.substitution_play present (was dropped)');
const noBrief = skus.find((r) => r.next_best_action?.brief_status === 'unavailable');
ok(noBrief != null, 'a SKU with brief_status=unavailable exists (graceful-fallback path is exercised)');

// ── Brief gating: only the real LLM brief renders; deterministic is suppressed ─
console.log('\nBrief gating — never show the deterministic boilerplate:');
const isRealLlmBrief = (nba) => {
  const b = nba?.strategic_brief;
  if (!b) return false;
  const outcome = nba.brief_debug?.outcome;
  if (outcome) return outcome === 'llm';
  const moves = [...(b.first_moves || []), ...(b.traffic_strategy || []), ...(b.diy_vs_pivota?.self_serve || [])];
  return !moves.some((m) => m != null && typeof m === 'object');
};
const detSku = skus.find(
  (r) => r.next_best_action?.strategic_brief && r.next_best_action?.brief_debug?.outcome !== 'llm',
);
ok(detSku != null, 'a SKU shipped a deterministic brief (outcome !== "llm") — the case to suppress');
ok(detSku && isRealLlmBrief(detSku.next_best_action) === false, 'deterministic-brief SKU is gated OUT (boilerplate not shown)');
const llmSku = skus.find((r) => r.next_best_action?.brief_debug?.outcome === 'llm');
ok(llmSku != null && isRealLlmBrief(llmSku.next_best_action) === true, 'the real LLM brief IS shown');

// ── ChannelAppearancePanel: intents_cited ─────────────────────────────────────
console.log('\nChannelAppearancePanel — intents_cited:');
const channels = sku0.channel_appearance?.channels || [];
ok(channels.length > 0, `channel_appearance.channels present (${channels.length})`);
ok(channels.some((c) => Array.isArray(c.intents_cited) && c.intents_cited.length > 0), 'at least one channel has intents_cited');

// ── PrioritizedActionsPanel (run-level) ───────────────────────────────────────
console.log('\nPrioritizedActionsPanel — merchant_narrative.prioritized_actions:');
const actions = report.merchant_narrative?.prioritized_actions || [];
ok(actions.length > 0, `prioritized_actions present (${actions.length}) — was dropped entirely`);
ok(actions.every((a) => a.headline), 'every action has a headline');

console.log(failures === 0 ? '\n✅ all contracts hold' : `\n❌ ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
