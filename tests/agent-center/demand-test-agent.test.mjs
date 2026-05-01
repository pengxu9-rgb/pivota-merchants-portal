import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.PIVOTA_AGENT_CENTER_MOCK_GEMINI = "true";

const repository = await import("../../lib/agent-center/repository.ts");
const provider = await import("../../lib/agent-center/provider.ts");
const services = await import("../../lib/agent-center/services.ts");
const apiHandlers = await import("../../lib/agent-center/api-handlers.ts");
const { NextRequest } = await import("next/server.js");

const {
  DEFAULT_GEMINI_MODEL,
  getAgentCenterState,
  resetAgentCenterState,
} = repository;
const {
  buildPivotaAttributionPreflight,
  GeminiProviderAdapter,
  PARSED_RECOMMENDATION_SCHEMA,
  parseProviderOutput,
} = provider;
const {
  DemoScenarioService,
  DemandTestJobService,
  FixTargetRouter,
  getIssueDebugView,
  InputReadinessService,
  IssueEngine,
  MerchantStoreService,
  ProductNameNormalizer,
  ProductMatchService,
  ProductUnderstandingService,
  QueryClusterService,
  ScanTargetService,
  ScoringService,
  UsageMeteringService,
  VerificationService,
} = services;
const { handleAgentCenterRequest } = apiHandlers;

const verifiedPivotaPdpUrl =
  "https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90?return=%2Fproducts%2Fext_0281be2868f91dcf200fa248%3Freturn%3D%252F";
const verifiedPivotaObjectId = "ext_d7c74bcb380cbc2bdd5d5d90";
const verifiedPivotaOfferId = "offer_isntree_direct_50ml";

function pivotaPreflight(overrides = {}) {
  return {
    status: "verified",
    candidate_url: verifiedPivotaPdpUrl,
    status_code: 200,
    final_url: verifiedPivotaPdpUrl,
    verified_url: verifiedPivotaPdpUrl,
    expected_product_entity_id: "pe_isntree_watery_sun_gel",
    expected_product_object_id: verifiedPivotaObjectId,
    verified_product_object_ids: [verifiedPivotaObjectId],
    expected_offer_ids: [verifiedPivotaOfferId],
    verified_offer_ids: [verifiedPivotaOfferId],
    ...overrides,
  };
}

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
    scanMode: target.scan_mode || "open_product_visibility_test",
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

const sunscreenRequiredAttributes = [
  "spf_level",
  "pa_rating",
  "skin_type",
  "finish",
  "active_ingredients",
];

const isntreeStrongMerchantAttributes = {
  spf_level: "SPF50+",
  pa_rating: "PA++++",
  skin_type: "dehydrated, normal, and combination skin",
  finish: "lightweight watery gel finish",
  active_ingredients: "UV filters plus hyaluronic acid hydration complex",
  hyaluronic_acid: true,
  texture: "watery gel",
  use_case: "daily sunscreen",
  skin_benefit: "skin hydration",
};

function createIsntreeProductUnderstandingTarget({
  merchantAttributes = isntreeStrongMerchantAttributes,
  pivotaAttributes = {},
  extraProducts = [],
} = {}) {
  resetAgentCenterState();
  const product = {
    id: "prod_isntree_pu_watery_sun_gel_50ml",
    product_entity_id: "pe_isntree_pu_watery_sun_gel",
    sku: "ISNTREE-PU-WATERY-SUN-GEL-SPF50-PA4-50ML",
    title: "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
    brand: "Isntree",
    category: "skincare sunscreen",
    price: 26,
    currency: "USD",
    pdp_url:
      "https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml",
    attributes: merchantAttributes,
    pivota_attributes: pivotaAttributes,
    agent_summary:
      "A lightweight watery Korean sunscreen gel with SPF50+ PA++++ and hyaluronic acid hydration.",
    priority: "high",
  };
  const store = new MerchantStoreService().create({
    store_name: "Isntree Product Understanding Acceptance",
    store_url: "https://isntree-global.com",
    platform: "shopify",
    integration_status: "connected",
    primary_category: "skincare sunscreen",
    competitor_brands: ["Beauty of Joseon", "COSRX", "Laneige", "Anua"],
    competitor_products: [
      "Relief Sun: Rice + Probiotics SPF50+ PA++++",
      "Aloe Soothing Sun Cream SPF50+ PA+++",
      "Hydro UV Defense Sunscreen",
      "Heartleaf Silky Moisture Sun Cream SPF50+ PA++++",
    ],
    products: [product, ...extraProducts],
  });
  const target = new ScanTargetService().create({
    store_id: store.id,
    selected_product_ids: [product.id],
  });
  const cluster = new QueryClusterService()
    .generateForScanTarget(target.id, [product.id])
    .find((item) => item.intent_type === "category_recommendation");

  return { store, target, product, cluster };
}

function runIsntreeProductUnderstandingCase({
  merchantAttributes = isntreeStrongMerchantAttributes,
  pivotaAttributes = {},
  extraProducts = [],
  modelProductName = "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
  issueType,
} = {}) {
  const { store, target, product, cluster } = createIsntreeProductUnderstandingTarget({
    merchantAttributes,
    pivotaAttributes,
    extraProducts,
  });
  const jobService = new DemandTestJobService();
  const job = jobService.create({
    scan_target_id: target.id,
    query_cluster_ids: [cluster.id],
    providers: ["gemini"],
    prompt_template_ids: ["general_recommendation_v1"],
    repetitions: 3,
  });

  for (let index = 0; index < 3; index += 1) {
    const input = {
      ...demandInput(store, target, cluster, product),
      query: cluster.queries[index % cluster.queries.length],
      repetitionIndex: index + 1,
    };
    const run = jobService.createRun(
      job,
      cluster,
      input.query,
      "gemini",
      DEFAULT_GEMINI_MODEL,
      "general_recommendation_v1",
      input
    );
    const output = {
      mentioned_brands: ["Isntree"],
      mentioned_products: [
        {
          name: modelProductName,
          brand: "Isntree",
          rank: 1,
          reason: "Recommended as a hydrating lightweight daily sunscreen.",
          purchase_path_present: true,
        },
      ],
      missing_attributes_identified: [],
      reasoning_summary: "Semi-real Isntree acceptance fixture.",
    };
    const raw = {
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
      raw_output: output,
      normalized_output: output,
      input_tokens: 110,
      output_tokens: 150,
      tool_calls: 0,
      provider_request_id: `isntree_acceptance_${index + 1}`,
    };
    const result = jobService.createResult(run, raw);
    const parsed = parseProviderOutput(raw, input);
    parsed.test_run_id = run.id;
    parsed.query_cluster_id = cluster.id;
    getAgentCenterState().parsedRecommendations.push(parsed);
    run.status = "completed";
    run.raw_output_id = result.id;
    new UsageMeteringService().record({ job, run, result });
  }

  const parsed = getAgentCenterState().parsedRecommendations.filter(
    (item) => item.query_cluster_id === cluster.id
  );
  const matches = parsed.map((item) =>
    new ProductMatchService().match(item, store, cluster)
  );
  const score = new ScoringService().scoreCluster({
    jobId: job.id,
    scanTarget: target,
    cluster,
    parsed,
    matches,
  });
  const generatedIssues = new IssueEngine().generateForScore({
    scanTarget: target,
    score,
    cluster,
    parsed,
    matches,
  });
  let issue = issueType
    ? generatedIssues.find((item) => item.issue_type === issueType)
    : generatedIssues[0];

  if (!issue && issueType) {
    issue = new IssueEngine().createIssue({
      issueType,
      severity: "medium",
      rootCause: "Acceptance fixture requires Product Understanding diagnosis.",
      recommendedAction: "Run Product Understanding diagnosis.",
      input: { scanTarget: target, score, cluster, parsed, matches },
      product,
      missingAttributes: [],
      parserConfidence: Math.min(...parsed.map((item) => item.parser_confidence), 1),
      matchConfidence: Math.min(...matches.map((item) => item.match_confidence_score), 1),
    });
    getAgentCenterState().issues.push(issue);
  }

  return { store, target, product, cluster, job, parsed, matches, score, issues: generatedIssues, issue };
}

function createControlledSunscreenTarget({ attributes = {}, pivotaAttributes = {} } = {}) {
  resetAgentCenterState();
  const product = {
    id: "prod_seoul_shield_daily_rice_sun",
    product_entity_id: "pe_seoul_shield_daily_rice_sun",
    sku: "SS-RICE-SUN-SPF50-50ML",
    title: "Seoul Shield Daily Rice Sun SPF 50",
    brand: "Seoul Shield",
    category: "skincare sunscreen",
    price: 28,
    currency: "USD",
    pdp_url: "https://seoul-shield.example/products/daily-rice-sun-spf-50",
    attributes,
    pivota_attributes: pivotaAttributes,
    agent_summary: "A lightweight daily Korean sunscreen with rice extract.",
    priority: "high",
  };
  const store = new MerchantStoreService().create({
    store_name: "Seoul Shield",
    store_url: "https://seoul-shield.example",
    platform: "shopify",
    integration_status: "connected",
    primary_category: "skincare sunscreen",
    competitor_brands: ["Beauty of Joseon", "COSRX", "Laneige", "Anua"],
    competitor_products: [
      "Relief Sun: Rice + Probiotics",
      "Aloe Soothing Sun Cream",
      "Hydro UV Defense Sunscreen",
      "Heartleaf Silky Moisture Sunscreen",
    ],
    products: [product],
  });
  const target = new ScanTargetService().create({
    store_id: store.id,
    selected_product_ids: [product.id],
  });
  const cluster = new QueryClusterService()
    .generateForScanTarget(target.id, [product.id])
    .find((item) => item.intent_type === "category_recommendation");

  return { store, target, product, cluster };
}

function createIsntreeSunscreenTarget(extraProducts = [], scanMode = "open_product_visibility_test") {
  resetAgentCenterState();
  const product = {
    id: "prod_isntree_watery_sun_gel",
    product_entity_id: "pe_isntree_watery_sun_gel",
    sku: "ISNTREE-WATERY-SUN-GEL-SPF50-PA4-50ML",
    title: "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
    brand: "Isntree",
    category: "skincare sunscreen",
    price: 26,
    currency: "USD",
    pdp_url:
      "https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml",
    attributes: {
      spf_level: "SPF50+",
      pa_rating: "PA++++",
      skin_type: "dehydrated, normal, combination",
      finish: "fresh finish",
      active_ingredients: "chemical UV filters",
    },
    pivota_attributes: {
      spf_level: "SPF50+",
      pa_rating: "PA++++",
      skin_type: "dehydrated, normal, combination",
      finish: "fresh finish",
      active_ingredients: "chemical UV filters",
      agent_summary: "A hydrating Korean sun gel with SPF50+ PA++++.",
      pivota_pdp_url: verifiedPivotaPdpUrl,
      pivota_product_object_id: verifiedPivotaObjectId,
      offer_ids: [verifiedPivotaOfferId],
    },
    agent_summary: "A hydrating Korean sun gel with SPF50+ PA++++.",
    priority: "high",
  };
  const store = new MerchantStoreService().create({
    store_name: "Isntree Official Global Live Validation",
    store_url: "https://isntree-global.com",
    platform: "shopify",
    integration_status: "connected",
    primary_category: "skincare sunscreen",
    competitor_brands: ["Beauty of Joseon", "COSRX", "Laneige", "Anua"],
    competitor_products: [
      "Relief Sun: Rice + Probiotics SPF50+ PA++++",
      "Aloe Soothing Sun Cream SPF50+ PA+++",
      "Hydro UV Defense Sunscreen",
      "Heartleaf Silky Moisture Sun Cream SPF50+ PA++++",
    ],
    products: [product, ...extraProducts],
  });
  const target = new ScanTargetService().create({
    store_id: store.id,
    selected_product_ids: [product.id],
    scan_mode: scanMode,
  });
  const cluster = new QueryClusterService()
    .generateForScanTarget(target.id, [product.id])
    .find((item) => item.intent_type === "category_recommendation");

  return { store, target, product, cluster };
}

function competitorOnlyRecommendation(missing = sunscreenRequiredAttributes) {
  return {
    mentioned_brands: ["Beauty of Joseon", "COSRX", "Laneige", "Anua"],
    mentioned_products: [
      {
        name: "Relief Sun: Rice + Probiotics",
        brand: "Beauty of Joseon",
        rank: 1,
        reason: "Strong sunscreen claims and popular K-beauty demand fit.",
        purchase_path_present: false,
      },
      {
        name: "Aloe Soothing Sun Cream",
        brand: "COSRX",
        rank: 2,
        reason: "Known soothing sunscreen alternative.",
        purchase_path_present: false,
      },
    ],
    missing_attributes_identified: missing,
    reasoning_summary:
      "Competitor products have clearer sunscreen proof points than the merchant product.",
  };
}

function merchantRecommendation(missing = []) {
  return {
    mentioned_brands: ["Seoul Shield"],
    mentioned_products: [
      {
        name: "Seoul Shield Daily Rice Sun SPF 50",
        brand: "Seoul Shield",
        rank: 1,
        reason: "The merchant product is a direct sunscreen match.",
        purchase_path_present: true,
      },
    ],
    missing_attributes_identified: missing,
    reasoning_summary: "The merchant product is relevant when PDP evidence is available.",
  };
}

function runControlledSunscreenCase({ attributes, pivotaAttributes, outputs }) {
  const { store, target, product, cluster } = createControlledSunscreenTarget({
    attributes,
    pivotaAttributes,
  });
  const jobService = new DemandTestJobService();
  const job = jobService.create({
    scan_target_id: target.id,
    query_cluster_ids: [cluster.id],
    providers: ["gemini"],
    prompt_template_ids: ["general_recommendation_v1"],
    repetitions: outputs.length,
  });

  outputs.forEach((output, index) => {
    const input = {
      ...demandInput(store, target, cluster, product),
      query: cluster.queries[index % cluster.queries.length],
      repetitionIndex: index + 1,
    };
    const run = jobService.createRun(
      job,
      cluster,
      input.query,
      "gemini",
      DEFAULT_GEMINI_MODEL,
      "general_recommendation_v1",
      input
    );
    const raw = {
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
      raw_output: output,
      normalized_output: output,
      input_tokens: 120,
      output_tokens: 180,
      tool_calls: 0,
      provider_request_id: `controlled_${index + 1}`,
    };
    const result = jobService.createResult(run, raw);
    const parsed = parseProviderOutput(raw, input);
    parsed.test_run_id = run.id;
    parsed.query_cluster_id = cluster.id;
    getAgentCenterState().parsedRecommendations.push(parsed);
    run.status = "completed";
    run.raw_output_id = result.id;
    new UsageMeteringService().record({ job, run, result });
  });

  const parsed = getAgentCenterState().parsedRecommendations.filter(
    (item) => item.query_cluster_id === cluster.id
  );
  const matches = parsed.map((item) =>
    new ProductMatchService().match(item, store, cluster)
  );
  const score = new ScoringService().scoreCluster({
    jobId: job.id,
    scanTarget: target,
    cluster,
    parsed,
    matches,
  });
  const issues = new IssueEngine().generateForScore({
    scanTarget: target,
    score,
    cluster,
    parsed,
    matches,
  });

  return { store, target, product, cluster, job, parsed, matches, score, issues };
}

test("scan target creation requires a store and preserves scan scope", () => {
  const { store, target } = createConnectedTarget();
  assert.equal(target.store_id, store.id);
  assert.equal(target.scan_mode, "open_product_visibility_test");
  assert.equal(target.selected_product_ids.length, 3);
  assert.equal(target.market, "US");
});

test("input readiness reports available modes, missing inputs, and V1 limitations", () => {
  const { target } = createConnectedTarget();
  const readiness = new InputReadinessService().createSnapshot(target.id);
  assert.ok(readiness.input_completeness_score >= 50);
  assert.ok(readiness.available_scan_modes.includes("open_product_visibility_test"));
  assert.ok(readiness.available_scan_modes.includes("merchant_store_attribution_test"));
  assert.ok(readiness.available_scan_modes.includes("pivota_pdp_attribution_test"));
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

test("Gemini provider registry defaults to the free-tier live test model", () => {
  const originalGeminiModel = process.env.GEMINI_MODEL;
  const originalAgentCenterGeminiModel =
    process.env.PIVOTA_AGENT_CENTER_GEMINI_MODEL;

  process.env.GEMINI_MODEL = "gemini-3-flash-preview";
  delete process.env.PIVOTA_AGENT_CENTER_GEMINI_MODEL;
  resetAgentCenterState();

  const gemini = getAgentCenterState().providers.find(
    (item) => item.provider === "gemini"
  );
  assert.equal(gemini?.default_model, DEFAULT_GEMINI_MODEL);

  if (originalGeminiModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalGeminiModel;
  if (originalAgentCenterGeminiModel === undefined) {
    delete process.env.PIVOTA_AGENT_CENTER_GEMINI_MODEL;
  } else {
    process.env.PIVOTA_AGENT_CENTER_GEMINI_MODEL = originalAgentCenterGeminiModel;
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

test("ProductNameNormalizer extracts optional sunscreen suffixes without removing the core family", () => {
  const { product, store } = createIsntreeSunscreenTarget();
  const profile = new ProductNameNormalizer().productProfile(product, store);

  assert.equal(
    profile.normalized_canonical_name,
    "isntree hyaluronic acid watery sun gel spf50+ pa++++ 50ml"
  );
  assert.equal(profile.normalized_core_name, "hyaluronic acid watery sun gel");
  assert.deepEqual(profile.optional_suffix_terms, ["SPF50+", "PA++++", "50ml"]);
  assert.ok(profile.normalized_core_name.includes("sun gel"));
});

test("partial Isntree product name counts as product visibility but not exact SKU", () => {
  const { store, target, product, cluster } = createIsntreeSunscreenTarget();
  const input = demandInput(store, target, cluster, product);
  const parsed = parseProviderOutput(
    {
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
      raw_output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Hydrating daily sun gel.",
            purchase_path_present: true,
          },
        ],
        missing_attributes_identified: [],
        reasoning_summary: "The model returned the product family without SPF/PA/size suffixes.",
      },
      normalized_output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Hydrating daily sun gel.",
            purchase_path_present: true,
          },
        ],
        missing_attributes_identified: [],
        reasoning_summary: "The model returned the product family without SPF/PA/size suffixes.",
      },
      input_tokens: 100,
      output_tokens: 120,
      tool_calls: 0,
      provider_request_id: "isntree_partial",
    },
    input
  );
  const match = new ProductMatchService().match(parsed, store, cluster);
  const score = new ScoringService().scoreCluster({
    scanTarget: target,
    cluster,
    parsed: [parsed],
    matches: [match],
  });

  assert.equal(parsed.merchant_product_mentioned, false);
  assert.equal(match.raw_model_product_name, "Isntree Hyaluronic Acid Watery Sun Gel");
  assert.equal(
    match.canonical_product_name,
    "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml"
  );
  assert.equal(match.normalized_model_name, "isntree hyaluronic acid watery sun gel");
  assert.equal(
    match.normalized_canonical_name,
    "isntree hyaluronic acid watery sun gel spf50+ pa++++ 50ml"
  );
  assert.equal(match.brand_match, true);
  assert.equal(match.core_product_match, true);
  assert.equal(match.match_level, "canonical_product_match");
  assert.equal(match.match_confidence, "high");
  assert.equal(match.counts_for_visibility, true);
  assert.equal(match.counts_for_sku_exact_match, false);
  assert.equal(match.ambiguous_match, false);
  assert.deepEqual(match.suffix_terms_missing, ["SPF50+", "PA++++", "50ml"]);
  assert.equal(score.aggregate_scores.visibility_score, 100);
  assert.equal(score.aggregate_scores.product_entity_visibility_score, 100);
  assert.equal(score.aggregate_scores.merchant_store_visibility_score, 0);
  assert.equal(score.aggregate_scores.pivota_pdp_visibility_score, 0);
  assert.equal(score.aggregate_scores.executable_offer_visibility_score, "not_tested");
  assert.match(
    score.score_explanations.product_entity_visibility_score.explanation,
    /Counted as visibility match because brand and core product name matched/
  );
  assert.match(
    score.score_explanations.product_entity_visibility_score.explanation,
    /not counted as an exact SKU match/
  );
  assert.match(
    score.score_explanations.product_entity_visibility_score.explanation,
    /Product entity was visible, but merchant store \/ Pivota channel attribution was not proven/
  );
});

test("Isntree partial matcher avoids unrelated same-brand products", () => {
  const { store, product, cluster } = createIsntreeSunscreenTarget();
  const input = demandInput(store, { id: "target_isntree", store_id: store.id }, cluster, product);
  const negativeNames = [
    "Isntree Hyaluronic Acid Toner",
    "Isntree Watery Sun Stick",
    "Isntree Hyaluronic Acid Aqua Gel Cream",
  ];

  for (const name of negativeNames) {
    const parsed = parseProviderOutput(
      {
        provider: "gemini",
        model: DEFAULT_GEMINI_MODEL,
        raw_output: {
          mentioned_brands: ["Isntree"],
          mentioned_products: [
            {
              name,
              brand: "Isntree",
              rank: 1,
              reason: "Same brand but different product.",
              purchase_path_present: true,
            },
          ],
          missing_attributes_identified: [],
          reasoning_summary: "Negative matcher fixture.",
        },
        normalized_output: {
          mentioned_brands: ["Isntree"],
          mentioned_products: [
            {
              name,
              brand: "Isntree",
              rank: 1,
              reason: "Same brand but different product.",
              purchase_path_present: true,
            },
          ],
          missing_attributes_identified: [],
          reasoning_summary: "Negative matcher fixture.",
        },
        input_tokens: 100,
        output_tokens: 120,
        tool_calls: 0,
        provider_request_id: `negative_${name}`,
      },
      input
    );
    const match = new ProductMatchService().match(parsed, store, cluster);

    assert.equal(match.brand_match, true);
    assert.equal(match.core_product_match, false);
    assert.notEqual(match.match_level, "canonical_product_match");
    assert.notEqual(match.match_level, "sku_match");
    assert.notEqual(match.match_level, "variant_match");
    assert.equal(match.counts_for_visibility, false);
    assert.equal(match.counts_for_sku_exact_match, false);
  }
});

test("partial Isntree product name is guarded when same-brand SKU variants are ambiguous", () => {
  const variant = {
    id: "prod_isntree_watery_sun_gel_100ml",
    product_entity_id: "pe_isntree_watery_sun_gel_100ml",
    sku: "ISNTREE-WATERY-SUN-GEL-SPF50-PA4-100ML",
    title: "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 100ml",
    brand: "Isntree",
    category: "skincare sunscreen",
    price: 42,
    currency: "USD",
    attributes: {},
    pivota_attributes: {},
  };
  const { store, product, cluster } = createIsntreeSunscreenTarget([variant]);
  const input = demandInput(store, { id: "target_isntree", store_id: store.id }, cluster, product);
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Product family without size.",
        purchase_path_present: true,
      },
    ],
    missing_attributes_identified: [],
    reasoning_summary: "The model omitted variant suffixes.",
  };
  const parsed = parseProviderOutput(
    {
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
      raw_output: output,
      normalized_output: output,
      input_tokens: 100,
      output_tokens: 120,
      tool_calls: 0,
      provider_request_id: "isntree_ambiguous_variant",
    },
    input
  );
  const match = new ProductMatchService().match(parsed, store, cluster);

  assert.equal(match.ambiguous_match, true);
  assert.equal(match.match_level, "product_family_match");
  assert.equal(match.counts_for_visibility, false);
  assert.equal(match.counts_for_sku_exact_match, false);
  assert.match(match.match_reason, /multiple same-brand products/);
});

test("open product visibility test does not claim merchant or Pivota channel attribution", () => {
  const { store, target, product, cluster } = createIsntreeSunscreenTarget();
  const outputs = [
    "Isntree Hyaluronic Acid Watery Sun Gel",
    "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
    "Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
  ].map((name, index) => {
    const output = {
      mentioned_brands: ["Isntree"],
      mentioned_products: [
        {
          name,
          brand: "Isntree",
          rank: index === 2 ? 2 : 1,
          reason: "Recommended as a hydrating sunscreen product.",
          purchase_path_present: true,
        },
      ],
      missing_attributes_identified: [],
      reasoning_summary:
        "Gemini recommended the Isntree product entity without merchant store or Pivota PDP attribution.",
    };
    const input = {
      ...demandInput(store, target, cluster, product),
      query: cluster.queries[index],
      repetitionIndex: index + 1,
    };
    const parsed = parseProviderOutput(
      {
        provider: "gemini",
        model: DEFAULT_GEMINI_MODEL,
        raw_output: output,
        normalized_output: output,
        input_tokens: 100,
        output_tokens: 150,
        tool_calls: 0,
        provider_request_id: `isntree_open_${index}`,
      },
      input
    );
    parsed.test_run_id = `run_isntree_open_${index}`;
    parsed.query_cluster_id = cluster.id;
    return parsed;
  });
  const matches = outputs.map((parsed) =>
    new ProductMatchService().match(parsed, store, cluster)
  );
  const score = new ScoringService().scoreCluster({
    scanTarget: target,
    cluster,
    parsed: outputs,
    matches,
  });
  const issues = new IssueEngine().generateForScore({
    scanTarget: target,
    score,
    cluster,
    parsed: outputs,
    matches,
  });

  assert.equal(target.scan_mode, "open_product_visibility_test");
  assert.equal(score.aggregate_scores.product_entity_visibility_score, 100);
  assert.equal(score.aggregate_scores.merchant_store_visibility_score, 0);
  assert.equal(score.aggregate_scores.pivota_pdp_visibility_score, 0);
  assert.equal(score.aggregate_scores.executable_offer_visibility_score, "not_tested");
  assert.equal(issues.some((issue) => issue.severity === "high"), false);
  assert.match(
    score.score_explanations.merchant_store_visibility_score.explanation,
    /open product recommendation does not prove merchant store attribution/
  );
  assert.match(
    score.score_explanations.pivota_pdp_visibility_score.explanation,
    /open product recommendation does not prove Pivota PDP attribution/
  );
});

function scoreAttributionFixture({ scanMode, output, preflight }) {
  const { store, target, product, cluster } = createIsntreeSunscreenTarget([], scanMode);
  const parsed = [0, 1, 2].map((_, index) => {
    const input = {
      ...demandInput(store, target, cluster, product),
      query: cluster.queries[index],
      repetitionIndex: index + 1,
      pivotaAttributionPreflight: preflight,
    };
    const item = parseProviderOutput(
      {
        provider: "gemini",
        model: DEFAULT_GEMINI_MODEL,
        raw_output: output,
        normalized_output: output,
        input_tokens: 100,
        output_tokens: 150,
        tool_calls: 0,
        provider_request_id: `${scanMode}_${index}`,
      },
      input
    );
    item.test_run_id = `run_${scanMode}_${index}`;
    item.query_cluster_id = cluster.id;
    return item;
  });
  const matches = parsed.map((item) => new ProductMatchService().match(item, store, cluster));
  const score = new ScoringService().scoreCluster({
    scanTarget: target,
    cluster,
    parsed,
    matches,
  });
  const issues = new IssueEngine().generateForScore({
    scanTarget: target,
    score,
    cluster,
    parsed,
    matches,
  });

  return { store, target, product, cluster, parsed, matches, score, issues };
}

test("merchant attribution scan passes when merchant PDP is returned", () => {
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Merchant PDP supports this recommendation.",
        purchase_path_present: true,
        purchase_path_type: "merchant_pdp",
        product_url:
          "https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml",
      },
    ],
    merchant_store_mentioned: true,
    merchant_pdp_url_present: true,
    merchant_pdp_url:
      "https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml",
    merchant_store_attribution_confidence: 0.94,
    purchase_path_present: true,
    purchase_path_type: "merchant_pdp",
    channel_attribution: "merchant_store_attributed",
    missing_attributes_identified: [],
    reasoning_summary: "The merchant PDP was returned as the purchase source.",
  };
  const result = scoreAttributionFixture({
    scanMode: "merchant_store_attribution_test",
    output,
  });

  assert.equal(result.score.aggregate_scores.product_entity_visibility_score, 100);
  assert.equal(result.score.aggregate_scores.merchant_store_visibility_score, 100);
  assert.equal(result.score.aggregate_scores.pivota_pdp_visibility_score, 0);
  assert.equal(result.parsed[0].merchant_pdp_url_present, true);
  assert.equal(result.parsed[0].merchant_store_attribution_confidence, 0.94);
  assert.equal(result.parsed[0].channel_attribution, "merchant_store_attributed");
  assert.equal(result.issues.some((issue) => issue.issue_type === "merchant_store_attribution_gap"), false);
});

test("merchant attribution scan creates a gap when product is visible but merchant PDP is missing", () => {
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Product is relevant.",
        purchase_path_present: false,
      },
    ],
    channel_attribution: "unattributed_product_recommendation",
    missing_attributes_identified: [],
    reasoning_summary: "The product was recommended without a merchant buying path.",
  };
  const result = scoreAttributionFixture({
    scanMode: "merchant_store_attribution_test",
    output,
  });
  const issue = result.issues.find(
    (item) => item.issue_type === "merchant_store_attribution_gap"
  );

  assert.equal(result.score.aggregate_scores.product_entity_visibility_score, 100);
  assert.equal(result.score.aggregate_scores.merchant_store_visibility_score, 0);
  assert.ok(issue, "expected merchant_store_attribution_gap");
  assert.deepEqual(issue.fix_targets, [
    "merchant_pdp",
    "merchant_catalog",
    "merchant_structured_data",
  ]);
  assert.match(issue.root_cause, /merchant store\/PDP was not returned/);
});

test("Pivota attribution scan passes when Pivota PDP and offer are returned", () => {
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Pivota product object supports this recommendation.",
        purchase_path_present: true,
        purchase_path_type: "pivota_offer",
        product_url: verifiedPivotaPdpUrl,
      },
    ],
    pivota_pdp_mentioned: true,
    pivota_pdp_url_present: true,
    pivota_pdp_url: verifiedPivotaPdpUrl,
    pivota_product_object_id: verifiedPivotaObjectId,
    pivota_offer_present: true,
    pivota_offer_ids: [verifiedPivotaOfferId],
    purchase_path_present: true,
    purchase_path_type: "pivota_offer",
    channel_attribution: "pivota_offer_attributed_verified",
    missing_attributes_identified: [],
    reasoning_summary: "The Pivota PDP and offer were returned.",
  };
  const result = scoreAttributionFixture({
    scanMode: "pivota_pdp_attribution_test",
    output,
    preflight: pivotaPreflight(),
  });

  assert.equal(result.score.aggregate_scores.product_entity_visibility_score, 100);
  assert.equal(result.score.aggregate_scores.pivota_pdp_visibility_score, 100);
  assert.equal(result.score.aggregate_scores.pivota_offer_visibility_score, 100);
  assert.equal(result.score.aggregate_scores.pivota_attribution_echo_rate, 0);
  assert.equal(result.parsed[0].pivota_pdp_url_present, true);
  assert.equal(result.parsed[0].pivota_pdp_url_verified, true);
  assert.equal(result.parsed[0].pivota_product_object_id_verified, true);
  assert.deepEqual(result.parsed[0].pivota_offer_ids, [verifiedPivotaOfferId]);
  assert.equal(result.parsed[0].pivota_offer_ids_verified, true);
  assert.equal(result.issues.some((issue) => issue.issue_type === "pivota_pdp_attribution_gap"), false);
});

test("Pivota attribution scan creates PDP and offer attribution gaps", () => {
  const noPivotaOutput = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Product is relevant.",
        purchase_path_present: false,
      },
    ],
    channel_attribution: "unattributed_product_recommendation",
    missing_attributes_identified: [],
    reasoning_summary: "The product was recommended without Pivota attribution.",
  };
  const missingPdp = scoreAttributionFixture({
    scanMode: "pivota_pdp_attribution_test",
    output: noPivotaOutput,
  });
  assert.ok(
    missingPdp.issues.some((issue) => issue.issue_type === "pivota_pdp_attribution_gap")
  );

  const pdpOnlyOutput = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Pivota PDP supports this recommendation.",
        purchase_path_present: true,
        purchase_path_type: "pivota_pdp",
        product_url: verifiedPivotaPdpUrl,
      },
    ],
    pivota_pdp_mentioned: true,
    pivota_pdp_url_present: true,
    pivota_pdp_url: verifiedPivotaPdpUrl,
    pivota_product_object_id: verifiedPivotaObjectId,
    pivota_offer_present: false,
    pivota_offer_ids: [],
    purchase_path_present: true,
    purchase_path_type: "pivota_pdp",
    channel_attribution: "pivota_pdp_attributed_verified",
    missing_attributes_identified: [],
    reasoning_summary: "The Pivota PDP was returned without merchant offer IDs.",
  };
  const missingOffer = scoreAttributionFixture({
    scanMode: "pivota_pdp_attribution_test",
    output: pdpOnlyOutput,
    preflight: pivotaPreflight(),
  });
  assert.equal(missingOffer.score.aggregate_scores.pivota_pdp_visibility_score, 100);
  assert.equal(missingOffer.score.aggregate_scores.pivota_offer_visibility_score, 0);
  assert.ok(
    missingOffer.issues.some((issue) => issue.issue_type === "pivota_offer_attribution_gap")
  );
});

test("Pivota negative control treats model-only Pivota mention as unverified echo", () => {
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Pivota product object appears relevant, but no public PDP URL is returned.",
        purchase_path_present: false,
      },
    ],
    pivota_pdp_mentioned: true,
    purchase_path_present: false,
    channel_attribution: "pivota_pdp_attributed",
    missing_attributes_identified: [],
    reasoning_summary: "Pivota was referenced without a public URL or offer.",
  };
  const result = scoreAttributionFixture({
    scanMode: "pivota_pdp_attribution_test",
    output,
    preflight: pivotaPreflight({
      status: "negative_control",
      candidate_url: undefined,
      status_code: null,
      final_url: undefined,
      verified_url: undefined,
      verified_product_object_ids: [],
      verified_offer_ids: [],
      failure_reason: "no_public_pivota_pdp_url_available",
    }),
  });
  const issueTypes = new Set(result.issues.map((issue) => issue.issue_type));

  assert.equal(result.score.aggregate_scores.pivota_pdp_visibility_score, 0);
  assert.equal(result.score.aggregate_scores.pivota_offer_visibility_score, 0);
  assert.ok(result.score.aggregate_scores.pivota_attribution_echo_rate > 0);
  assert.equal(result.parsed[0].pivota_pdp_url_present, false);
  assert.equal(result.parsed[0].pivota_attribution_verified, false);
  assert.equal(result.parsed[0].channel_attribution, "unverified_pivota_echo");
  assert.ok(
    issueTypes.has("pivota_pdp_attribution_gap") ||
      issueTypes.has("unverified_pivota_attribution")
  );
  assert.ok(issueTypes.has("unverified_pivota_attribution"));
});

test("Pivota PDP URL returning 404 does not count as channel visibility", () => {
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "The Pivota PDP was returned but is not verified.",
        purchase_path_present: true,
        purchase_path_type: "pivota_pdp",
        product_url: verifiedPivotaPdpUrl,
      },
    ],
    pivota_pdp_mentioned: true,
    pivota_pdp_url_present: true,
    pivota_pdp_url: verifiedPivotaPdpUrl,
    purchase_path_present: true,
    purchase_path_type: "pivota_pdp",
    channel_attribution: "pivota_pdp_attributed",
    missing_attributes_identified: [],
    reasoning_summary: "The model returned a Pivota URL that failed preflight.",
  };
  const result = scoreAttributionFixture({
    scanMode: "pivota_pdp_attribution_test",
    output,
    preflight: pivotaPreflight({
      status: "failed",
      status_code: 404,
      verified_url: undefined,
      verified_product_object_ids: [],
      verified_offer_ids: [],
      failure_reason: "pivota_pdp_url_not_public_or_product_mismatch",
    }),
  });

  assert.equal(result.parsed[0].pivota_pdp_url_present, true);
  assert.equal(result.parsed[0].pivota_pdp_url_verified, false);
  assert.equal(result.parsed[0].pivota_attribution_failure_reason, "pivota_pdp_url_not_verified");
  assert.equal(result.score.aggregate_scores.pivota_pdp_visibility_score, 0);
  assert.ok(result.score.aggregate_scores.pivota_attribution_echo_rate > 0);
});

test("Pivota mentioned without URL remains unverified", () => {
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Pivota may have a product page.",
        purchase_path_present: false,
      },
    ],
    pivota_pdp_mentioned: true,
    channel_attribution: "pivota_pdp_attributed_unverified",
    missing_attributes_identified: [],
    reasoning_summary: "Pivota is mentioned but no URL or object ID was returned.",
  };
  const result = scoreAttributionFixture({
    scanMode: "pivota_pdp_attribution_test",
    output,
    preflight: pivotaPreflight({ status: "verified" }),
  });

  assert.equal(result.parsed[0].pivota_pdp_url_present, false);
  assert.equal(result.parsed[0].pivota_product_object_id_present, false);
  assert.equal(result.score.aggregate_scores.pivota_pdp_visibility_score, 0);
  assert.equal(result.score.aggregate_scores.pivota_attribution_echo_rate, 100);
});

test("Pivota offer mention without verified offer ID does not count as offer visibility", () => {
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Pivota PDP is returned, but offer ID is unverified.",
        purchase_path_present: true,
        purchase_path_type: "pivota_offer",
        product_url: verifiedPivotaPdpUrl,
      },
    ],
    pivota_pdp_mentioned: true,
    pivota_pdp_url_present: true,
    pivota_pdp_url: verifiedPivotaPdpUrl,
    pivota_product_object_id: verifiedPivotaObjectId,
    pivota_offer_present: true,
    pivota_offer_ids: ["offer_unverified"],
    purchase_path_present: true,
    purchase_path_type: "pivota_offer",
    channel_attribution: "pivota_offer_attributed",
    missing_attributes_identified: [],
    reasoning_summary: "The model returned an unverified Pivota offer ID.",
  };
  const result = scoreAttributionFixture({
    scanMode: "pivota_pdp_attribution_test",
    output,
    preflight: pivotaPreflight({
      verified_offer_ids: [],
      expected_offer_ids: [verifiedPivotaOfferId],
    }),
  });

  assert.equal(result.score.aggregate_scores.pivota_pdp_visibility_score, 100);
  assert.equal(result.score.aggregate_scores.pivota_offer_visibility_score, 0);
  assert.equal(result.parsed[0].pivota_offer_ids_present, true);
  assert.equal(result.parsed[0].pivota_offer_ids_verified, false);
});

test("Pivota preflight verifies agent.pivota.cc PDP URL with 200 response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    status: 200,
    url: String(url),
  });
  try {
    const { store, target, product, cluster } = createIsntreeSunscreenTarget(
      [],
      "pivota_pdp_attribution_test"
    );
    const preflight = await buildPivotaAttributionPreflight(
      demandInput(store, target, cluster, product)
    );

    assert.equal(preflight.status, "verified");
    assert.equal(preflight.status_code, 200);
    assert.equal(preflight.verified_url, verifiedPivotaPdpUrl);
    assert.deepEqual(preflight.verified_product_object_ids, [verifiedPivotaObjectId]);
    assert.deepEqual(preflight.verified_offer_ids, [verifiedPivotaOfferId]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Pivota preflight records failed 404 PDP URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    status: 404,
    url: String(url),
  });
  try {
    const { store, target, product, cluster } = createIsntreeSunscreenTarget(
      [],
      "pivota_pdp_attribution_test"
    );
    const preflight = await buildPivotaAttributionPreflight(
      demandInput(store, target, cluster, product)
    );

    assert.equal(preflight.status, "failed");
    assert.equal(preflight.status_code, 404);
    assert.equal(preflight.verified_url, undefined);
    assert.deepEqual(preflight.verified_product_object_ids, []);
    assert.equal(
      preflight.failure_reason,
      "pivota_pdp_url_not_public_or_product_mismatch"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("controlled sunscreen case A detects visibility loss and competitor substitution", () => {
  const result = runControlledSunscreenCase({
    attributes: {},
    pivotaAttributes: {},
    outputs: [
      competitorOnlyRecommendation(),
      competitorOnlyRecommendation(),
      competitorOnlyRecommendation(),
    ],
  });
  const issueByType = new Map(result.issues.map((issue) => [issue.issue_type, issue]));

  assert.ok(issueByType.has("ai_visibility_loss"));
  assert.ok(issueByType.has("competitor_substitution"));
  assert.deepEqual(issueByType.get("ai_visibility_loss").fix_targets, [
    "merchant_pdp",
    "pivota_unified_pdp",
  ]);
  assert.deepEqual(
    issueByType.get("competitor_substitution").fix_targets,
    ["merchant_pdp", "pivota_unified_pdp"]
  );
  assert.equal(result.score.aggregate_scores.visibility_score, 0);
  assert.equal(result.score.aggregate_scores.competitor_substitution_score, 100);
  assert.match(
    result.score.score_explanations.competitor_substitution_score.formula,
    /runs_where_competitor_appears_and_merchant_absent/
  );
  assert.equal(result.issues[0].estimated_gmv_at_risk_confidence, "medium");
  assert.ok(result.issues[0].merchant_facing_summary.includes("Seoul Shield"));
  assert.ok(result.issues[0].merchant_facing_narrative.what_happened);
  assert.ok(
    result.issues[0].merchant_facing_narrative.what_ai_recommended_instead.includes(
      "Beauty of Joseon"
    )
  );
  assert.ok(result.issues[0].merchant_facing_narrative.where_to_fix);
  assert.ok(
    result.issues[0].merchant_facing_narrative.how_pivota_will_verify_the_fix.includes(
      "same query cluster"
    )
  );
});

test("controlled sunscreen case B routes missing merchant PDP attributes to both layers", () => {
  const result = runControlledSunscreenCase({
    attributes: {},
    pivotaAttributes: {},
    outputs: [merchantRecommendation(), merchantRecommendation(), merchantRecommendation()],
  });
  const missingAttributeIssue = result.issues.find(
    (issue) => issue.issue_type === "missing_attribute"
  );

  assert.ok(missingAttributeIssue, "expected missing_attribute issue");
  assert.deepEqual(missingAttributeIssue.fix_targets, ["both_merchant_and_pivota"]);
  assert.deepEqual(
    Object.keys(missingAttributeIssue.merchant_source_patch.attributes).sort(),
    sunscreenRequiredAttributes.slice().sort()
  );
  assert.deepEqual(
    Object.keys(missingAttributeIssue.pivota_unified_pdp_patch.normalized_attributes).sort(),
    sunscreenRequiredAttributes.slice().sort()
  );
  assert.equal(result.score.aggregate_scores.attribute_readiness_score, 0);
});

test("controlled sunscreen case C routes complete merchant PDP but incomplete Pivota PDP to Pivota only", () => {
  const completeMerchantAttributes = {
    spf_level: "SPF 50",
    pa_rating: "PA++++",
    skin_type: "sensitive and combination",
    finish: "dewy",
    active_ingredients: "chemical UV filters",
  };
  const result = runControlledSunscreenCase({
    attributes: completeMerchantAttributes,
    pivotaAttributes: {},
    outputs: [merchantRecommendation(), merchantRecommendation(), merchantRecommendation()],
  });
  const issueTypes = new Set(result.issues.map((issue) => issue.issue_type));
  const pivotaIssue = result.issues.find(
    (issue) => issue.issue_type === "pivota_pdp_readiness_gap"
  );

  assert.equal(issueTypes.has("missing_attribute"), false);
  assert.ok(pivotaIssue, "expected pivota_pdp_readiness_gap issue");
  assert.deepEqual(pivotaIssue.fix_targets, ["pivota_unified_pdp"]);
  assert.equal(result.score.aggregate_scores.attribute_readiness_score, 100);
  assert.ok(result.score.aggregate_scores.pivota_pdp_readiness_score < 70);
});

test("product understanding diagnosis attaches merchant and Pivota patches to a Demand Test issue", () => {
  const result = runControlledSunscreenCase({
    attributes: {},
    pivotaAttributes: {},
    outputs: [merchantRecommendation(), merchantRecommendation(), merchantRecommendation()],
  });
  const issue = result.issues.find((item) => item.issue_type === "missing_attribute");
  const diagnosis = new ProductUnderstandingService().runDiagnosis(issue.id);
  const updatedIssue = getAgentCenterState().issues.find((item) => item.id === issue.id);
  const usageEvent = getAgentCenterState().usageEvents.find(
    (event) => event.id === diagnosis.usage_event_ids[0]
  );

  assert.equal(diagnosis.issue_id, issue.id);
  assert.equal(diagnosis.source_agent, "product_understanding_agent");
  assert.deepEqual(
    diagnosis.merchant_layer_findings[0].missing_attributes.slice().sort(),
    sunscreenRequiredAttributes.slice().sort()
  );
  assert.deepEqual(
    diagnosis.pivota_layer_findings[0].missing_attributes.slice().sort(),
    sunscreenRequiredAttributes.slice().sort()
  );
  assert.ok(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "merchant_source_patch"
    )
  );
  assert.ok(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "pivota_unified_pdp_patch"
    )
  );
  assert.ok(diagnosis.refined_fix_targets.includes("both_merchant_and_pivota"));
  assert.equal(updatedIssue.product_understanding_diagnosis_id, diagnosis.id);
  assert.equal(updatedIssue.status, "diagnosed");
  assert.equal(usageEvent.event_type, "product_understanding_credit");
  assert.equal(usageEvent.agent_type, "product_understanding_agent");
  assert.equal(usageEvent.workflow_type, "product_diagnosis");
  assert.equal(usageEvent.billing_mode, "preview_only");
  assert.equal(usageEvent.billing_status, "not_invoiced");
});

test("product understanding diagnosis detects Pivota-only PDP gaps", () => {
  const completeMerchantAttributes = {
    spf_level: "SPF 50",
    pa_rating: "PA++++",
    skin_type: "sensitive and combination",
    finish: "dewy",
    active_ingredients: "chemical UV filters",
  };
  const result = runControlledSunscreenCase({
    attributes: completeMerchantAttributes,
    pivotaAttributes: {},
    outputs: [merchantRecommendation(), merchantRecommendation(), merchantRecommendation()],
  });
  const issue = result.issues.find(
    (item) => item.issue_type === "pivota_pdp_readiness_gap"
  );
  const diagnosis = new ProductUnderstandingService().runDiagnosis(issue.id);

  assert.deepEqual(diagnosis.merchant_layer_findings[0].missing_attributes, []);
  assert.deepEqual(
    diagnosis.pivota_layer_findings[0].missing_attributes.slice().sort(),
    sunscreenRequiredAttributes.slice().sort()
  );
  assert.ok(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "pivota_unified_pdp_patch"
    )
  );
  assert.equal(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "merchant_source_patch"
    ),
    false
  );
  assert.deepEqual(diagnosis.refined_fix_targets, ["pivota_unified_pdp"]);
  assert.match(diagnosis.root_cause_summary, /Merchant source data is complete/);
});

test("product understanding diagnosis flags brand match with wrong product family", () => {
  const completeAttributes = {
    spf_level: "SPF 50",
    pa_rating: "PA++++",
    skin_type: "sensitive and combination",
    finish: "dewy",
    active_ingredients: "chemical UV filters",
  };
  const result = runControlledSunscreenCase({
    attributes: completeAttributes,
    pivotaAttributes: completeAttributes,
    outputs: [
      {
        mentioned_brands: ["Seoul Shield"],
        mentioned_products: [
          {
            name: "Seoul Shield Daily Rice Sun Stick",
            brand: "Seoul Shield",
            rank: 1,
            reason: "Same brand, different product family.",
            purchase_path_present: false,
          },
        ],
        missing_attributes_identified: [],
        reasoning_summary: "The model returned the brand but not the canonical product.",
      },
      {
        mentioned_brands: ["Seoul Shield"],
        mentioned_products: [
          {
            name: "Seoul Shield Daily Rice Sun Stick",
            brand: "Seoul Shield",
            rank: 1,
            reason: "Same brand, different product family.",
            purchase_path_present: false,
          },
        ],
        missing_attributes_identified: [],
        reasoning_summary: "The model returned the brand but not the canonical product.",
      },
      {
        mentioned_brands: ["Seoul Shield"],
        mentioned_products: [
          {
            name: "Seoul Shield Daily Rice Sun Stick",
            brand: "Seoul Shield",
            rank: 1,
            reason: "Same brand, different product family.",
            purchase_path_present: false,
          },
        ],
        missing_attributes_identified: [],
        reasoning_summary: "The model returned the brand but not the canonical product.",
      },
    ],
  });
  const issue = result.issues.find((item) => item.issue_type === "ai_visibility_loss");
  const diagnosis = new ProductUnderstandingService().runDiagnosis(issue.id);

  assert.ok(
    diagnosis.entity_mapping_findings.some((finding) =>
      ["product_entity_mapping_issue", "wrong_product_family"].includes(
        finding.finding_type
      )
    )
  );
  assert.ok(diagnosis.refined_fix_targets.includes("human_review"));
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_product_graph"));
  assert.match(diagnosis.root_cause_summary, /product\/entity mapping ambiguity/);
});

test("product understanding diagnosis generates Pivota query mapping patch", () => {
  const completeAttributes = {
    spf_level: "SPF 50",
    pa_rating: "PA++++",
    skin_type: "sensitive and combination",
    finish: "dewy",
    active_ingredients: "chemical UV filters",
  };
  const result = runControlledSunscreenCase({
    attributes: completeAttributes,
    pivotaAttributes: completeAttributes,
    outputs: [
      competitorOnlyRecommendation([]),
      competitorOnlyRecommendation([]),
      competitorOnlyRecommendation([]),
    ],
  });
  const issue = result.issues.find(
    (item) => item.issue_type === "competitor_substitution"
  );
  const diagnosis = new ProductUnderstandingService().runDiagnosis(issue.id);

  assert.ok(
    diagnosis.query_mapping_findings.some(
      (finding) => finding.finding_type === "missing_query_mapping"
    )
  );
  assert.ok(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "pivota_query_mapping_patch"
    )
  );
  assert.ok(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "pivota_product_graph_patch"
    )
  );
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_query_mapping"));
});

test("product understanding diagnosis detects SKU variant suffix mismatch", () => {
  const { store, target, product, cluster } = createIsntreeSunscreenTarget();
  const jobService = new DemandTestJobService();
  const job = jobService.create({
    scan_target_id: target.id,
    query_cluster_ids: [cluster.id],
    providers: ["gemini"],
    prompt_template_ids: ["general_recommendation_v1"],
    repetitions: 1,
  });
  const input = demandInput(store, target, cluster, product);
  const run = jobService.createRun(
    job,
    cluster,
    input.query,
    "gemini",
    DEFAULT_GEMINI_MODEL,
    "general_recommendation_v1",
    input
  );
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "The model omitted SPF, PA, and size suffixes.",
        purchase_path_present: true,
      },
    ],
    missing_attributes_identified: [],
    reasoning_summary: "Entity-level mention without exact SKU.",
  };
  const raw = {
    provider: "gemini",
    model: DEFAULT_GEMINI_MODEL,
    raw_output: output,
    normalized_output: output,
    input_tokens: 90,
    output_tokens: 110,
    tool_calls: 0,
    provider_request_id: "variant_suffix_fixture",
  };
  const result = jobService.createResult(run, raw);
  const parsed = parseProviderOutput(raw, input);
  parsed.test_run_id = run.id;
  parsed.query_cluster_id = cluster.id;
  getAgentCenterState().parsedRecommendations.push(parsed);
  run.status = "completed";
  run.raw_output_id = result.id;
  new UsageMeteringService().record({ job, run, result });
  const match = new ProductMatchService().match(parsed, store, cluster);
  const score = new ScoringService().scoreCluster({
    jobId: job.id,
    scanTarget: target,
    cluster,
    parsed: [parsed],
    matches: [match],
  });
  const issue = new IssueEngine().createIssue({
    issueType: "human_review_required",
    severity: "medium",
    rootCause: "Entity-level product visibility needs SKU/variant diagnosis.",
    recommendedAction: "Clarify variant suffixes and SKU aliases.",
    input: { scanTarget: target, score, cluster, parsed: [parsed], matches: [match] },
    product,
    missingAttributes: [],
    parserConfidence: parsed.parser_confidence,
    matchConfidence: match.match_confidence_score,
  });
  getAgentCenterState().issues.push(issue);

  const diagnosis = new ProductUnderstandingService().runDiagnosis(issue.id);

  assert.ok(
    diagnosis.sku_variant_findings.some(
      (finding) => finding.finding_type === "sku_variant_suffix_gap"
    )
  );
  assert.ok(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "merchant_variant_map_patch"
    )
  );
  assert.ok(diagnosis.refined_fix_targets.includes("merchant_variant_map"));
});

test("acceptance Scenario A: Isntree merchant PDP strong and Pivota unified PDP weak", () => {
  const result = runIsntreeProductUnderstandingCase({
    merchantAttributes: isntreeStrongMerchantAttributes,
    pivotaAttributes: {
      spf_level: "SPF50+",
      agent_summary: "Hydrating Korean sun gel.",
    },
    issueType: "pivota_pdp_readiness_gap",
  });
  const diagnosis = new ProductUnderstandingService().runDiagnosis(result.issue.id);
  const updatedIssue = getAgentCenterState().issues.find(
    (item) => item.id === result.issue.id
  );
  const pivotaPatch = diagnosis.patch_recommendations.find(
    (patch) => patch.patch_type === "pivota_unified_pdp_patch"
  );

  assert.equal(result.score.aggregate_scores.attribute_readiness_score, 100);
  assert.deepEqual(diagnosis.merchant_layer_findings[0].missing_attributes, []);
  assert.ok(diagnosis.pivota_layer_findings[0].missing_attributes.includes("pa_rating"));
  assert.ok(diagnosis.pivota_layer_findings[0].missing_attributes.includes("finish"));
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_unified_pdp"));
  assert.equal(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "merchant_source_patch"
    ),
    false
  );
  assert.deepEqual(updatedIssue.merchant_source_patch, {});
  assert.ok(pivotaPatch);
  assert.equal(
    pivotaPatch.patch.normalized_attributes.pa_rating,
    isntreeStrongMerchantAttributes.pa_rating
  );
  assert.equal(
    pivotaPatch.patch.normalized_attributes.finish,
    isntreeStrongMerchantAttributes.finish
  );
});

test("acceptance Scenario B: Isntree merchant PDP weak and Pivota unified PDP weak", () => {
  const result = runIsntreeProductUnderstandingCase({
    merchantAttributes: {},
    pivotaAttributes: {},
    issueType: "missing_attribute",
  });
  const diagnosis = new ProductUnderstandingService().runDiagnosis(result.issue.id);

  assert.deepEqual(
    diagnosis.merchant_layer_findings[0].missing_attributes.slice().sort(),
    sunscreenRequiredAttributes.slice().sort()
  );
  assert.deepEqual(
    diagnosis.pivota_layer_findings[0].missing_attributes.slice().sort(),
    sunscreenRequiredAttributes.slice().sort()
  );
  assert.ok(diagnosis.refined_fix_targets.includes("both_merchant_and_pivota"));
  assert.ok(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "merchant_source_patch"
    )
  );
  assert.ok(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "pivota_unified_pdp_patch"
    )
  );
});

test("acceptance Scenario C: Isntree same-entity SKU variants stay visible but not SKU-exact", () => {
  const sameEntityId = "pe_isntree_pu_watery_sun_gel";
  const variants = [
    {
      id: "prod_isntree_pu_watery_sun_gel_2pack",
      product_entity_id: sameEntityId,
      sku: "ISNTREE-PU-WATERY-SUN-GEL-SPF50-PA4-50ML-2PACK",
      title: "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml 2-pack",
      brand: "Isntree",
      category: "skincare sunscreen",
      currency: "USD",
      attributes: isntreeStrongMerchantAttributes,
      pivota_attributes: isntreeStrongMerchantAttributes,
    },
    {
      id: "prod_isntree_pu_watery_sun_gel_old_packaging",
      product_entity_id: sameEntityId,
      sku: "ISNTREE-PU-WATERY-SUN-GEL-SPF50-PA4-50ML-OLD-PACKAGING",
      title:
        "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml older packaging",
      brand: "Isntree",
      category: "skincare sunscreen",
      currency: "USD",
      attributes: isntreeStrongMerchantAttributes,
      pivota_attributes: isntreeStrongMerchantAttributes,
    },
    {
      id: "prod_isntree_pu_watery_sun_gel_travel",
      product_entity_id: sameEntityId,
      sku: "ISNTREE-PU-WATERY-SUN-GEL-SPF50-PA4-TRAVEL-20ML",
      title:
        "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ travel size 20ml",
      brand: "Isntree",
      category: "skincare sunscreen",
      currency: "USD",
      attributes: isntreeStrongMerchantAttributes,
      pivota_attributes: isntreeStrongMerchantAttributes,
    },
  ];
  const result = runIsntreeProductUnderstandingCase({
    merchantAttributes: isntreeStrongMerchantAttributes,
    pivotaAttributes: isntreeStrongMerchantAttributes,
    extraProducts: variants,
    modelProductName: "Isntree Hyaluronic Acid Watery Sun Gel",
    issueType: "human_review_required",
  });
  const diagnosis = new ProductUnderstandingService().runDiagnosis(result.issue.id);

  assert.ok(result.matches.every((match) => match.counts_for_visibility));
  assert.ok(result.matches.every((match) => !match.counts_for_sku_exact_match));
  assert.ok(result.matches.every((match) => match.ambiguous_match));
  assert.ok(result.matches.every((match) => match.match_confidence !== "high"));
  assert.ok(
    diagnosis.sku_variant_findings.some(
      (finding) =>
        finding.finding_type === "ambiguous_variant_match" ||
        finding.finding_type === "sku_variant_suffix_gap"
    )
  );
  assert.ok(
    diagnosis.refined_fix_targets.includes("merchant_variant_map") ||
      diagnosis.refined_fix_targets.includes("human_review")
  );
});

test("product understanding usage events are idempotent", () => {
  const result = runControlledSunscreenCase({
    attributes: {},
    pivotaAttributes: {},
    outputs: [merchantRecommendation(), merchantRecommendation(), merchantRecommendation()],
  });
  const issue = result.issues.find((item) => item.issue_type === "missing_attribute");
  const service = new ProductUnderstandingService();
  const first = service.runDiagnosis(issue.id);
  const usageCount = getAgentCenterState().usageEvents.length;
  const second = service.runDiagnosis(issue.id);
  const regenerated = service.regeneratePatch(issue.id);

  assert.equal(first.id, second.id);
  assert.notEqual(first.id, regenerated.id);
  assert.equal(getAgentCenterState().usageEvents.length, usageCount);
  assert.deepEqual(first.usage_event_ids, second.usage_event_ids);
  assert.deepEqual(first.usage_event_ids, regenerated.usage_event_ids);
  assert.ok(
    getAgentCenterState()
      .issues.find((item) => item.id === issue.id)
      .product_understanding_diagnosis_ids.includes(regenerated.id)
  );
});

test("product understanding API returns debug payload and can attach diagnosis to retest plan", async () => {
  const result = runControlledSunscreenCase({
    attributes: {},
    pivotaAttributes: {},
    outputs: [merchantRecommendation(), merchantRecommendation(), merchantRecommendation()],
  });
  const issue = result.issues.find((item) => item.issue_type === "missing_attribute");
  const created = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${issue.id}/product-diagnosis`,
      { method: "POST" }
    ),
    { path: ["issues", issue.id, "product-diagnosis"] }
  );
  const createdPayload = await created.json();
  const attached = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${issue.id}/attach-product-diagnosis-to-retest`,
      { method: "POST" }
    ),
    { path: ["issues", issue.id, "attach-product-diagnosis-to-retest"] }
  );
  const attachedPayload = await attached.json();

  assert.equal(created.status, 201);
  assert.equal(createdPayload.diagnosis.issue_id, issue.id);
  const fetched = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${issue.id}/product-diagnosis`
    ),
    { path: ["issues", issue.id, "product-diagnosis"] }
  );
  const fetchedPayload = await fetched.json();

  assert.equal(fetched.status, 200);
  assert.equal(fetchedPayload.diagnosis.id, attachedPayload.diagnosis.id);
  assert.notEqual(createdPayload.diagnosis.id, attachedPayload.diagnosis.id);
  assert.equal(fetchedPayload.debug.source_issue_summary.issue_id, issue.id);
  assert.equal(
    fetchedPayload.debug.merchant_layer_inputs_used.product_title,
    result.product.title
  );
  assert.ok(fetchedPayload.debug.pivota_layer_inputs_used);
  assert.ok(fetchedPayload.debug.findings.merchant_layer_findings.length);
  assert.deepEqual(
    fetchedPayload.debug.refined_fix_targets,
    fetchedPayload.diagnosis.refined_fix_targets
  );
  assert.deepEqual(
    fetchedPayload.debug.usage_event_ids,
    fetchedPayload.diagnosis.usage_event_ids
  );
  assert.ok(
    fetchedPayload.debug.usage_events.every(
      (event) =>
        event.billing_mode === "preview_only" &&
        event.billing_status === "not_invoiced"
    )
  );
  assert.equal(attached.status, 200);
  assert.equal(
    attachedPayload.issue.evidence.product_understanding_attached_to_retest_plan,
    attachedPayload.diagnosis.id
  );
  assert.match(
    attachedPayload.issue.verification_plan.target_improvement,
    /Product Understanding diagnosis/
  );
});

test("Issue Detail renders Product Understanding Diagnosis controls", async () => {
  const source = await readFile(
    new URL("../../app/agent-center/issues/[issueId]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /Product Understanding Diagnosis/);
  assert.match(source, /Run Product Diagnosis/);
  assert.match(source, /Regenerate Patch/);
  assert.match(source, /Attach to Retest Plan/);
  assert.match(source, /product-diagnosis/);
});

test("issue debug view and retest preparation expose internal validation evidence", () => {
  const result = runControlledSunscreenCase({
    attributes: {},
    pivotaAttributes: {},
    outputs: [
      competitorOnlyRecommendation(),
      competitorOnlyRecommendation(),
      competitorOnlyRecommendation(),
    ],
  });
  const issue = result.issues.find(
    (item) => item.issue_type === "competitor_substitution"
  );
  const debug = getIssueDebugView(issue.id);
  const preparation = new VerificationService().prepareRetestIssue(issue.id);

  assert.equal(debug.generated_issue_json.id, issue.id);
  assert.equal(debug.raw_gemini_recommendation_list.length, 3);
  assert.equal(debug.parsed_recommendations.length, 3);
  assert.equal(debug.match_results.length, 3);
  assert.equal(debug.generated_scores.length, 1);
  assert.equal(debug.usage_event_ids.length, 3);
  assert.deepEqual(preparation.query_cluster_ids, issue.affected_query_clusters);
  assert.deepEqual(preparation.providers, result.job.scope.providers);
  assert.deepEqual(preparation.prompt_templates, result.job.scope.prompt_templates);
  assert.equal(preparation.repetitions, result.job.scope.repetitions);
  assert.equal(preparation.estimated_credits, 3);
  assert.equal(preparation.billing_mode, "preview_only");
  assert.equal(preparation.billing_status, "not_invoiced");
});

test("issue debug API is internal-only in production mode", async () => {
  const result = runControlledSunscreenCase({
    attributes: {},
    pivotaAttributes: {},
    outputs: [
      competitorOnlyRecommendation(),
      competitorOnlyRecommendation(),
      competitorOnlyRecommendation(),
    ],
  });
  const issue = result.issues.find(
    (item) => item.issue_type === "competitor_substitution"
  );
  const originalNodeEnv = process.env.NODE_ENV;
  const originalInternalDebug = process.env.PIVOTA_AGENT_CENTER_INTERNAL_DEBUG;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.PIVOTA_AGENT_CENTER_INTERNAL_DEBUG;

    const denied = await handleAgentCenterRequest(
      new NextRequest(
        `https://example.test/api/agent-center/issues/${issue.id}/debug`
      ),
      { path: ["issues", issue.id, "debug"] }
    );
    assert.equal(denied.status, 403);

    process.env.PIVOTA_AGENT_CENTER_INTERNAL_DEBUG = "true";
    const allowed = await handleAgentCenterRequest(
      new NextRequest(
        `https://example.test/api/agent-center/issues/${issue.id}/debug`
      ),
      { path: ["issues", issue.id, "debug"] }
    );
    assert.equal(allowed.status, 200);
    const payload = await allowed.json();
    assert.equal(payload.debug.generated_issue_json.id, issue.id);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalInternalDebug === undefined) {
      delete process.env.PIVOTA_AGENT_CENTER_INTERNAL_DEBUG;
    } else {
      process.env.PIVOTA_AGENT_CENTER_INTERNAL_DEBUG = originalInternalDebug;
    }
  }
});

test("controlled demo scenarios generate expected issue types", () => {
  resetAgentCenterState();
  const seeded = new DemoScenarioService().seed({ scenario: "all" });
  const byScenario = new Map(
    seeded.scenarios.map((scenario) => [scenario.scenario, scenario])
  );

  assert.deepEqual(
    new Set(byScenario.get("competitor_substitution").issue_types),
    new Set([
      "ai_visibility_loss",
      "competitor_substitution",
      "missing_attribute",
      "pivota_pdp_readiness_gap",
    ])
  );
  assert.ok(
    byScenario
      .get("missing_merchant_pdp_attributes")
      .issue_types.includes("missing_attribute")
  );
  assert.ok(
    byScenario
      .get("pivota_pdp_readiness_gap")
      .issue_types.includes("pivota_pdp_readiness_gap")
  );
  assert.equal(getAgentCenterState().issues.length >= 6, true);
  assert.ok(
    getAgentCenterState().usageEvents.every(
      (event) =>
        event.billing_mode === "preview_only" &&
        event.billing_status === "not_invoiced"
    )
  );
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
    verification.after_scores.aggregate_scores.visibility_score >
      verification.before_scores.aggregate_scores.visibility_score
  );
  assert.ok(verification.score_delta.visibility_score > 0);
  assert.deepEqual(verification.query_cluster_ids, issue.affected_query_clusters);
  assert.deepEqual(verification.provider_set, job.scope.providers);
  assert.deepEqual(verification.prompt_template_ids, job.scope.prompt_templates);
  assert.equal(verification.repetition_count, job.scope.repetitions);
  assert.equal(verification.source_agent, "demand_test_agent");
  assert.equal(verification.before_issue_snapshot.id, issue.id);
  assert.equal(verification.after_result_snapshot.retest_job_id, verification.retest_job_id);
  assert.equal(
    getAgentCenterState().retestPreparations.find(
      (item) => item.issue_id === issue.id
    ).status,
    "consumed"
  );
  assert.ok(verification.usage_event_ids.length > 0);
  for (const usageEventId of verification.usage_event_ids) {
    const event = getAgentCenterState().usageEvents.find(
      (item) => item.id === usageEventId
    );
    assert.ok(event, "expected retest usage event");
    assert.equal(event.billing_mode, "preview_only");
    assert.equal(event.billing_status, "not_invoiced");
    assert.equal(event.provider, "gemini");
    assert.equal(event.scan_target_id, issue.scan_target_id);
  }
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

  assert.equal(target.scan_mode, "open_product_visibility_test");
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

  assert.ok(match.match_confidence_score >= 0.7);
  assert.ok(score.aggregate_scores.visibility_score >= 0);
  assert.ok(score.aggregate_scores.competitor_substitution_score >= 0);
});
