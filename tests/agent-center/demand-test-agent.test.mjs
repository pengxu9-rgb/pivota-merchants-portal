import test from "node:test";
import assert from "node:assert/strict";

process.env.PIVOTA_AGENT_CENTER_MOCK_GEMINI = "true";

const repository = await import("../../lib/agent-center/repository.ts");
const provider = await import("../../lib/agent-center/provider.ts");
const services = await import("../../lib/agent-center/services.ts");

const {
  DEFAULT_GEMINI_MODEL,
  getAgentCenterState,
  resetAgentCenterState,
} = repository;
const {
  GeminiProviderAdapter,
  PARSED_RECOMMENDATION_SCHEMA,
  parseProviderOutput,
} = provider;
const {
  DemandTestJobService,
  FixTargetRouter,
  InputReadinessService,
  MerchantStoreService,
  ProductMatchService,
  QueryClusterService,
  ScanTargetService,
  ScoringService,
  UsageMeteringService,
  VerificationService,
} = services;

function createConnectedTarget() {
  resetAgentCenterState();
  const store = getAgentCenterState().stores[0];
  const target = new ScanTargetService().create({
    store_id: store.id,
    selected_product_ids: store.products.map((product) => product.id),
  });
  return { store, target };
}

function demandInput(store, target, cluster, product) {
  return {
    merchantId: store.merchant_id,
    storeId: store.id,
    scanTargetId: target.id,
    queryClusterId: cluster.id,
    query: cluster.queries[0],
    promptTemplateId: "general_recommendation_v1",
    prompt: `User query: ${cluster.queries[0]}`,
    provider: "gemini",
    model: DEFAULT_GEMINI_MODEL,
    language: "en",
    market: "US",
    currency: "USD",
    merchantContext: { store, product },
    pivotaContext: product.pivota_attributes,
    competitorContext: {
      brands: store.competitor_brands,
      products: store.competitor_products,
    },
    outputSchema: PARSED_RECOMMENDATION_SCHEMA,
    repetitionIndex: 1,
  };
}

test("scan target creation requires a store and preserves scan scope", () => {
  const { store, target } = createConnectedTarget();
  assert.equal(target.store_id, store.id);
  assert.equal(target.scan_mode, "catalog_integrated_demand_scan");
  assert.equal(target.selected_product_ids.length, 3);
  assert.equal(target.market, "US");
});

test("input readiness reports available modes, missing inputs, and V1 limitations", () => {
  const { target } = createConnectedTarget();
  const readiness = new InputReadinessService().createSnapshot(target.id);
  assert.ok(readiness.input_completeness_score >= 50);
  assert.ok(readiness.available_scan_modes.includes("url_only_demand_scan"));
  assert.ok(readiness.available_scan_modes.includes("catalog_integrated_demand_scan"));
  assert.ok(
    readiness.scan_limitations.some((item) => item.includes("Checkout verification"))
  );
});

test("usage estimate previews AI Test Credits without billing status", () => {
  const { target } = createConnectedTarget();
  const estimate = new UsageMeteringService().estimate({
    scan_target_id: target.id,
    providers: ["gemini"],
    prompt_template_ids: [
      "general_recommendation_v1",
      "purchase_ready_v1",
      "attribute_specific_v1",
    ],
    repetitions: 2,
  });

  assert.equal(estimate.estimated_query_clusters, 24);
  assert.equal(estimate.estimated_ai_test_credits, 144);
  assert.equal(estimate.billing_mode, "preview_only");
  assert.equal(estimate.billing_status, "not_invoiced");
});

test("usage estimate and job creation can scope to selected query clusters", () => {
  const { target } = createConnectedTarget();
  const cluster = new QueryClusterService().generateForScanTarget(target.id)[0];
  const estimate = new UsageMeteringService().estimate({
    scan_target_id: target.id,
    query_cluster_ids: [cluster.id],
    providers: ["gemini"],
    prompt_template_ids: ["general_recommendation_v1"],
    repetitions: 1,
  });
  const job = new DemandTestJobService().create({
    scan_target_id: target.id,
    query_cluster_ids: [cluster.id],
    providers: ["gemini"],
    prompt_template_ids: ["general_recommendation_v1"],
    repetitions: 1,
  });

  assert.equal(estimate.estimated_query_clusters, 1);
  assert.equal(estimate.estimated_ai_test_credits, 1);
  assert.deepEqual(job.scope.query_cluster_ids, [cluster.id]);
  assert.equal(job.estimated_credits, 1);
});

test("Gemini provider registry enforces the V1 minimum model", () => {
  const originalGeminiModel = process.env.GEMINI_MODEL;
  const originalPublicGeminiModel = process.env.NEXT_PUBLIC_GEMINI_MODEL;

  process.env.GEMINI_MODEL = "gemini-2.0-flash";
  delete process.env.NEXT_PUBLIC_GEMINI_MODEL;
  resetAgentCenterState();

  const gemini = getAgentCenterState().providers.find(
    (item) => item.provider === "gemini"
  );
  assert.equal(gemini?.default_model, DEFAULT_GEMINI_MODEL);

  if (originalGeminiModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalGeminiModel;
  if (originalPublicGeminiModel === undefined) {
    delete process.env.NEXT_PUBLIC_GEMINI_MODEL;
  } else {
    process.env.NEXT_PUBLIC_GEMINI_MODEL = originalPublicGeminiModel;
  }
  resetAgentCenterState();
});

test("GeminiProviderAdapter uses deterministic mock results when configured", async () => {
  const { store, target } = createConnectedTarget();
  const cluster = new QueryClusterService().generateForScanTarget(target.id)[0];
  const product = store.products[0];
  const input = demandInput(store, target, cluster, product);
  const raw = await new GeminiProviderAdapter().runDemandTest(input);
  const parsed = parseProviderOutput(raw, input);

  assert.equal(raw.provider, "gemini");
  assert.equal(parsed.schema_valid, true);
  assert.ok(parsed.mentioned_products.length > 0);
  assert.ok(parsed.parser_confidence >= 0.7);
});

test("parser schema validation marks invalid raw output", () => {
  const { store, target } = createConnectedTarget();
  const cluster = new QueryClusterService().generateForScanTarget(target.id)[0];
  const input = demandInput(store, target, cluster, store.products[0]);
  const parsed = parseProviderOutput(
    {
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
      raw_output: "{}",
      normalized_output: {},
      input_tokens: 1,
      output_tokens: 1,
      tool_calls: 0,
      provider_request_id: "invalid",
    },
    input
  );

  assert.equal(parsed.schema_valid, false);
  assert.ok(parsed.validation_errors.includes("mentioned_products_missing"));
});

test("parser schema validation handles malformed JSON as parse evidence", () => {
  const { store, target } = createConnectedTarget();
  const cluster = new QueryClusterService().generateForScanTarget(target.id)[0];
  const input = demandInput(store, target, cluster, store.products[0]);
  const parsed = parseProviderOutput(
    {
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
      raw_output: "not-json",
      normalized_output: {},
      input_tokens: 1,
      output_tokens: 1,
      tool_calls: 0,
      provider_request_id: "malformed",
    },
    input
  );

  assert.equal(parsed.schema_valid, false);
  assert.ok(parsed.validation_errors.includes("raw_output_json_invalid"));
});

test("product and competitor matching drives scoring and issue generation", async () => {
  const { target } = createConnectedTarget();
  const job = new DemandTestJobService().create({
    scan_target_id: target.id,
    providers: ["gemini"],
    prompt_template_ids: [
      "general_recommendation_v1",
      "purchase_ready_v1",
      "attribute_specific_v1",
    ],
    repetitions: 2,
  });
  const results = await new DemandTestJobService().run(job.id);
  const issueTypes = new Set(results.issues.map((issue) => issue.issue_type));

  assert.ok(results.query_clusters.length >= 20);
  assert.ok(results.test_runs.length > 0);
  assert.ok(results.parsed_recommendations.every((parsed) => parsed.schema_valid));
  assert.ok(getAgentCenterState().matches.length > 0);
  assert.ok(results.scores.length > 0);
  assert.ok(issueTypes.has("ai_visibility_loss"));
  assert.ok(issueTypes.has("competitor_substitution"));
  assert.ok(issueTypes.has("missing_attribute"));
});

test("usage event idempotency prevents duplicate credit events", async () => {
  const { target } = createConnectedTarget();
  const job = new DemandTestJobService().create({
    scan_target_id: target.id,
    providers: ["gemini"],
    prompt_template_ids: ["general_recommendation_v1"],
    repetitions: 1,
  });
  await new DemandTestJobService().run(job.id);
  const state = getAgentCenterState();
  const initialCount = state.usageEvents.length;
  const run = state.testRuns[0];
  const result = state.results[0];
  const service = new UsageMeteringService();
  const first = service.record({ job, run, result });
  const second = service.record({ job, run, result });

  assert.equal(first.id, second.id);
  assert.equal(state.usageEvents.length, initialCount);
  assert.match(first.idempotency_key, /^job_0001:gemini:qc_/);
});

test("FixTargetRouter routes merchant, Pivota, both, and human review cases", () => {
  const router = new FixTargetRouter();
  const score = {
    aggregate_scores: {
      visibility_score: 5,
      recommendation_rank_score: 0,
      competitor_substitution_score: 80,
      attribute_readiness_score: 20,
      pivota_pdp_readiness_score: 40,
    },
  };

  assert.deepEqual(
    router.route({
      issueType: "missing_attribute",
      score,
      product: {
        attributes: { sensitive_skin: true },
        pivota_attributes: {},
      },
      missingAttributes: ["sensitive_skin"],
    }),
    ["pivota_unified_pdp"]
  );
  assert.deepEqual(
    router.route({
      issueType: "missing_attribute",
      score,
      product: { attributes: {}, pivota_attributes: {} },
      missingAttributes: ["fragrance_free"],
    }),
    ["both_merchant_and_pivota"]
  );
  assert.deepEqual(
    router.route({
      issueType: "ai_visibility_loss",
      score,
      missingAttributes: [],
      parserConfidence: 0.5,
    }),
    ["human_review"]
  );
});

test("retest flow stores before and after verification with improved visibility", async () => {
  const { target } = createConnectedTarget();
  const job = new DemandTestJobService().create({
    scan_target_id: target.id,
    providers: ["gemini"],
    prompt_template_ids: [
      "general_recommendation_v1",
      "purchase_ready_v1",
      "attribute_specific_v1",
    ],
    repetitions: 2,
  });
  await new DemandTestJobService().run(job.id);
  const issue = getAgentCenterState().issues.find(
    (item) => item.issue_type === "ai_visibility_loss"
  );
  assert.ok(issue, "expected an ai_visibility_loss issue");

  const beforeUsage = getAgentCenterState().usageEvents.length;
  const verification = await new VerificationService().retestIssue(issue.id);
  const afterUsage = getAgentCenterState().usageEvents.length;

  assert.equal(verification.status, "completed");
  assert.ok(
    verification.result.after_visibility_score >
      verification.result.before_visibility_score
  );
  assert.ok(afterUsage > beforeUsage);
  assert.equal(
    getAgentCenterState().issues.find((item) => item.id === issue.id).status,
    "resolved"
  );
});

test("URL-only store can create a demand scan target with limitations", () => {
  resetAgentCenterState();
  const store = new MerchantStoreService().create({
    store_name: "URL Only Brand",
    store_url: "https://url-only.example",
    platform: "unknown",
    primary_category: "skincare",
  });
  const target = new ScanTargetService().create({ store_id: store.id });
  const readiness = new InputReadinessService().createSnapshot(target.id);

  assert.equal(target.scan_mode, "url_only_demand_scan");
  assert.ok(
    readiness.scan_limitations.some((item) =>
      item.includes("URL-only mode uses merchant-provided public URLs")
    )
  );
});

test("manual parser, matcher, and scorer work for a focused cluster", async () => {
  const { store, target } = createConnectedTarget();
  const cluster = new QueryClusterService()
    .generateForScanTarget(target.id)
    .find((item) => item.intent_type === "competitor_comparison");
  const product = store.products[0];
  const input = demandInput(store, target, cluster, product);
  const raw = await new GeminiProviderAdapter().runDemandTest(input);
  const parsed = parseProviderOutput(raw, input);
  const match = new ProductMatchService().match(parsed, store, cluster);
  const score = new ScoringService().scoreCluster({
    scanTarget: target,
    cluster,
    parsed: [parsed],
    matches: [match],
  });

  assert.ok(match.match_confidence >= 0.7);
  assert.ok(score.aggregate_scores.visibility_score >= 0);
  assert.ok(score.aggregate_scores.competitor_substitution_score >= 0);
});
