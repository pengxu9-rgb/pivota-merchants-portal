import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PIVOTA_AGENT_CENTER_MOCK_GEMINI = "true";

const repository = await import("../../lib/agent-center/repository.ts");
const provider = await import("../../lib/agent-center/provider.ts");
const services = await import("../../lib/agent-center/services.ts");
const publicIndexability = await import("../../lib/agent-center/public-indexability.ts");
const runtimeConfig = await import("../../lib/agent-center/runtime-config.ts");
const apiHandlers = await import("../../lib/agent-center/api-handlers.ts");
const { NextRequest } = await import("next/server.js");

const {
  DEFAULT_GEMINI_MODEL,
  FileBackedAgentCenterRepository,
  getAgentCenterState,
  getAgentCenterRepository,
  InMemoryAgentCenterRepository,
  resetAgentCenterState,
  setAgentCenterRepositoryForTests,
} = repository;
const {
  buildPivotaAttributionPreflight,
  GeminiProviderAdapter,
  PARSED_RECOMMENDATION_SCHEMA,
  parseProviderOutput,
} = provider;
const {
  CheckoutVerificationService,
  cleanupExpiredDemoFixtures,
  DemoScenarioService,
  DemoFixtureService,
  DemandTestJobService,
  FixTargetRouter,
  GMVAssuranceService,
  getAgentCenterOverview,
  getIssueDebugView,
  InputReadinessService,
  IssueEngine,
  IssueResolutionService,
  mapDiscoveryScoreToReportStatus,
  MerchantFacingReportService,
  MerchantStoreService,
  OfferExecutionService,
  PivotaIndexingTaskService,
  PivotaPDPIndexabilityAuditService,
  PivotaOptimizationService,
  PilotProductEntityProvisioningService,
  ProductEntityIndexRegistryService,
  ProductionValidationRunService,
  ProductNameNormalizer,
  ProductMatchService,
  ProductUnderstandingService,
  QueryClusterService,
  ScanTargetService,
  ScoringService,
  UsageMeteringService,
  VerificationService,
  auditMerchantPDPDiscoverability,
  auditPivotaPDPDiscoverability,
} = services;
const {
  agentPivotaRobotsPolicy,
  agentPivotaSitemapEntries,
  publicProductEntityIndexEntries,
} = publicIndexability;
const {
  handleAgentCenterRequest,
  handleInternalDemoFixturesRequest,
  handleInternalProductEntityIndexRequest,
  handleInternalPivotaIndexingTasksRequest,
  handleInternalProductionValidationRunsRequest,
} = apiHandlers;
const {
  envFlagEnabled,
  getAgentCenterRuntimeConfigStatus,
} = runtimeConfig;

const verifiedPivotaPdpUrl =
  "https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90?return=%2Fproducts%2Fext_0281be2868f91dcf200fa248%3Freturn%3D%252F";
const canonicalPivotaProductEntityUrl =
  "https://agent.pivota.cc/products/pe_isntree_watery_sun_gel";
const verifiedExternalSeedId = "ext_d7c74bcb380cbc2bdd5d5d90";
const verifiedPivotaObjectId = "pe_isntree_watery_sun_gel";
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

async function withTempPersistentRepository(callback) {
  const directory = await mkdtemp(join(tmpdir(), "agent-center-state-"));
  const filePath = join(directory, "state.json");
  const previousRepository = getAgentCenterRepository();

  try {
    const repository = new FileBackedAgentCenterRepository(filePath);
    setAgentCenterRepositoryForTests(repository);
    resetAgentCenterState();
    return await callback({ repository, filePath });
  } finally {
    setAgentCenterRepositoryForTests(previousRepository || new InMemoryAgentCenterRepository());
    resetAgentCenterState();
    await rm(directory, { recursive: true, force: true });
  }
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
      canonical_pivota_pdp_url: canonicalPivotaProductEntityUrl,
      canonical_product_slug: "pe_isntree_watery_sun_gel",
      external_seed_id: verifiedExternalSeedId,
      external_seed_ids: [verifiedExternalSeedId],
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

function runOrganicDiscoveryBlockerCase() {
  const { store, target, product, cluster } = createIsntreeSunscreenTarget(
    [],
    "organic_product_discovery_test"
  );
  const jobService = new DemandTestJobService();
  const job = jobService.create({
    scan_target_id: target.id,
    query_cluster_ids: [cluster.id],
    providers: ["gemini"],
    prompt_template_ids: ["general_recommendation_v1"],
    repetitions: 2,
  });

  [competitorOnlyRecommendation([]), competitorOnlyRecommendation([])].forEach(
    (output, index) => {
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
        provider_request_id: `organic_blocker_${index + 1}`,
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
  );

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
  Object.assign(score.aggregate_scores, {
    product_entity_visibility_score: 100,
    merchant_store_visibility_score: 100,
    pivota_pdp_visibility_score: 100,
    pivota_offer_visibility_score: 100,
    visibility_score: 100,
    attribute_readiness_score: 100,
    pivota_pdp_readiness_score: 100,
  });
  score.provider_scores.production_validation = {
    ...score.aggregate_scores,
  };
  const issues = new IssueEngine().generateForScore({
    scanTarget: target,
    score,
    cluster,
    parsed,
    matches,
  });

  return { store, target, product, cluster, job, parsed, matches, score, issues };
}

function createOfferExecutionFixture({
  merchantOfferPatch = {},
  pivotaOfferPatch,
  issueType = "pivota_pdp_readiness_gap",
} = {}) {
  const result = runIsntreeProductUnderstandingCase({
    merchantAttributes: isntreeStrongMerchantAttributes,
    pivotaAttributes: {
      spf_level: "SPF50+",
      agent_summary: "Hydrating Korean sun gel.",
    },
    issueType,
  });
  const issue = result.issue;
  const now = new Date("2026-05-01T12:00:00.000Z").toISOString();
  const merchantOffer = {
    id: "merchant_offer_isntree_50ml",
    merchant_id: result.store.merchant_id,
    store_id: result.store.id,
    product_id: result.product.id,
    sku_id: result.product.sku,
    price: 18.99,
    currency: "USD",
    promo_price: null,
    coupon_code: null,
    coupon_status: "none",
    inventory_status: "in_stock",
    inventory_quantity: 24,
    expires_at: null,
    source_url: result.product.pdp_url,
    last_synced_at: now,
    created_at: now,
    updated_at: now,
    ...merchantOfferPatch,
  };
  const defaultPivotaOffer =
    pivotaOfferPatch === null
      ? null
      : {
          id: "pivota_offer_isntree_50ml",
          product_entity_id: result.product.product_entity_id,
          pivota_unified_pdp_id: `pdp_${result.product.product_entity_id}`,
          merchant_id: result.store.merchant_id,
          store_id: result.store.id,
          sku_id: result.product.sku,
          price: 18.99,
          currency: "USD",
          promo_price: null,
          coupon_code: null,
          coupon_status: "none",
          inventory_status: "in_stock",
          execution_status: "ready",
          attached_to_pivota_pdp: true,
          last_verified_at: now,
          created_at: now,
          updated_at: now,
          ...(pivotaOfferPatch || {}),
        };

  getAgentCenterState().merchantOffers.push(merchantOffer);
  if (defaultPivotaOffer) getAgentCenterState().pivotaOffers.push(defaultPivotaOffer);

  return { ...result, issue, merchantOffer, pivotaOffer: defaultPivotaOffer };
}

function offerFindingTypes(diagnosis) {
  return diagnosis.offer_layer_findings.flatMap((comparison) =>
    comparison.findings.map((finding) => finding.finding_type)
  );
}

function createCheckoutVerificationFixture({
  merchantCheckoutPatch = {},
  pivotaCheckoutPatch = {},
  merchantOfferPatch = {},
  pivotaOfferPatch = {},
  omitMerchantCheckout = false,
  omitPivotaCheckout = false,
} = {}) {
  const fixture = createOfferExecutionFixture({
    merchantOfferPatch,
    pivotaOfferPatch,
    issueType: "offer_execution_issue",
  });
  const now = new Date("2026-05-01T12:00:00.000Z").toISOString();
  const requiredParams = fixture.merchantOffer.coupon_code
    ? ["variant", "quantity", "discount"]
    : ["variant", "quantity"];
  const merchantCheckoutPath = omitMerchantCheckout
    ? null
    : {
        id: "merchant_checkout_isntree_50ml",
        merchant_id: fixture.store.merchant_id,
        store_id: fixture.store.id,
        merchant_offer_id: fixture.merchantOffer.id,
        sku_id: fixture.product.sku,
        checkout_url: "https://checkout.isntree.example/checkout",
        cart_url: "https://checkout.isntree.example/cart",
        checkout_domain: "checkout.isntree.example",
        required_params: requiredParams,
        supported_params: requiredParams,
        coupon_param_name: fixture.merchantOffer.coupon_code ? "discount" : null,
        quantity_param_name: "quantity",
        variant_param_name: "variant",
        expires_at: new Date("2027-05-01T13:00:00.000Z").toISOString(),
        last_verified_at: now,
        source: "test_fixture",
        created_at: now,
        updated_at: now,
        ...merchantCheckoutPatch,
      };
  const payload = {
    variant: fixture.product.sku,
    quantity: 1,
    ...(fixture.merchantOffer.coupon_code
      ? { discount: fixture.merchantOffer.coupon_code }
      : {}),
  };
  const pivotaCheckoutPath =
    omitPivotaCheckout || !fixture.pivotaOffer
      ? null
      : {
          id: "pivota_checkout_isntree_50ml",
          pivota_offer_id: fixture.pivotaOffer.id,
          product_entity_id: fixture.product.product_entity_id,
          merchant_id: fixture.store.merchant_id,
          store_id: fixture.store.id,
          sku_id: fixture.product.sku,
          checkout_url: "https://checkout.isntree.example/checkout",
          cart_handoff_payload: payload,
          checkout_domain: "checkout.isntree.example",
          required_params: requiredParams,
          coupon_code: fixture.merchantOffer.coupon_code,
          quantity: 1,
          variant_id: fixture.product.sku,
          execution_status: "ready",
          attached_to_pivota_offer: true,
          last_verified_at: now,
          created_at: now,
          updated_at: now,
          ...pivotaCheckoutPatch,
        };

  if (merchantCheckoutPath) getAgentCenterState().merchantCheckoutPaths.push(merchantCheckoutPath);
  if (pivotaCheckoutPath) getAgentCenterState().pivotaCheckoutPaths.push(pivotaCheckoutPath);

  return { ...fixture, merchantCheckoutPath, pivotaCheckoutPath };
}

function checkoutFindingTypes(diagnosis) {
  return diagnosis.checkout_layer_findings.flatMap((comparison) =>
    comparison.findings.map((finding) => finding.finding_type)
  );
}

async function withInternalFixtureEnv(callback) {
  const originalEnabled = process.env.ENABLE_INTERNAL_DEMO_FIXTURES;
  const originalSecret = process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET;
  process.env.ENABLE_INTERNAL_DEMO_FIXTURES = "true";
  process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET = "fixture-secret";
  try {
    return await callback();
  } finally {
    if (originalEnabled === undefined) delete process.env.ENABLE_INTERNAL_DEMO_FIXTURES;
    else process.env.ENABLE_INTERNAL_DEMO_FIXTURES = originalEnabled;
    if (originalSecret === undefined) delete process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET;
    else process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET = originalSecret;
  }
}

function internalFixtureRequest(url, options = {}) {
  return new NextRequest(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer fixture-secret",
      ...(options.headers || {}),
    },
  });
}

async function withInternalProductionValidationEnv(callback) {
  const originalEnabled = process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
  const originalSecret = process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET;
  process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION = "true";
  process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET = "validation-secret";
  try {
    return await callback();
  } finally {
    if (originalEnabled === undefined) {
      delete process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
    } else {
      process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION = originalEnabled;
    }
    if (originalSecret === undefined) {
      delete process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET;
    } else {
      process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET = originalSecret;
    }
  }
}

function internalProductionValidationRequest(url, options = {}) {
  return new NextRequest(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer validation-secret",
      ...(options.headers || {}),
    },
  });
}

async function withMockProductionValidationFetch(callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const status =
      url.includes("failed") ||
      url.includes("missing") ||
      url.includes("unreachable")
        ? 404
        : 200;
    return {
      status,
      url,
    };
  };
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function productionValidationPayload(overrides = {}) {
  return {
    environment: "test",
    merchant_name: "Isntree Official",
    store_url: "https://isntree.example",
    merchant_pdp_url:
      "https://isntree.example/products/hyaluronic-acid-watery-sun-gel",
    product_name: "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
    brand: "Isntree",
    sku_name: "isntree_watery_sun_gel_50ml",
    category: "skincare sunscreen",
    market: "US",
    language: "en",
    currency: "USD",
    pivota_product_entity_id: "pe_isntree_watery_sun_gel",
    merchant_product_attributes: {
      spf_level: "SPF50+",
      pa_rating: "PA++++",
      skin_type: "all skin types",
      finish: "watery lightweight gel",
      active_ingredients: "hyaluronic acid and UV filters",
      purchase_path: true,
    },
    pivota_product_attributes: {
      spf_level: "SPF50+",
      pa_rating: "PA++++",
      skin_type: "all skin types",
      finish: "watery lightweight gel",
      active_ingredients: "hyaluronic acid and UV filters",
      purchase_path: true,
      agent_summary: "Daily hydrating sunscreen with watery gel finish.",
    },
    competitor_brands: ["Beauty of Joseon", "COSRX", "Laneige", "Anua"],
    competitor_products: [
      "Beauty of Joseon Relief Sun",
      "COSRX Aloe Soothing Sun Cream",
    ],
    repetitions: 1,
    ...overrides,
  };
}

const indexablePivotaUrl =
  "https://agent.pivota.cc/products/ext_d7c74bcb380cbc2bdd5d5d90";
const canonicalIndexablePivotaUrl =
  "https://agent.pivota.cc/products/pe_isntree_watery_sun_gel";
const indexabilityMerchantUrl =
  "https://www.isntree.com/products/hyaluronic-acid-watery-sun-gel";
const indexabilityProductName =
  "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml";

function productJsonLd(overrides = {}) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: indexabilityProductName,
    brand: { "@type": "Brand", name: "Isntree" },
    sku: "isntree_watery_sun_gel_50ml",
    url: canonicalIndexablePivotaUrl,
    description:
      "Daily hydrating sunscreen with a watery gel texture and hyaluronic acid.",
    ...overrides,
  });
}

function offerJsonLd(overrides = {}) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Offer",
    identifier: verifiedPivotaOfferId,
    price: "18.99",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    seller: { "@type": "Organization", name: "Isntree Official" },
    url: canonicalIndexablePivotaUrl,
    ...overrides,
  });
}

function indexabilityHtml(options = {}) {
  const description =
    options.description === false
      ? ""
      : `<p>${"Daily hydrating sunscreen with watery gel texture, hyaluronic acid, SPF50+ PA++++ protection, source-backed merchant offer, and product intelligence context. ".repeat(5)}</p>`;
  const productSchema =
    options.productJsonLd === false
      ? ""
      : `<script type="application/ld+json">${options.productJsonLd || productJsonLd()}</script>`;
  const offerSchema =
    options.offerJsonLd === false
      ? ""
      : `<script type="application/ld+json">${options.offerJsonLd || offerJsonLd()}</script>`;
  const sourceReference =
    options.sourceReference === false
      ? ""
      : `<a href="${indexabilityMerchantUrl}">Verified official merchant source</a>
        <script type="application/json" data-pivota-product-source-references>${JSON.stringify([
          {
            source_type: "external_seed",
            source_id: verifiedExternalSeedId,
            maps_to_product_entity_id: "pe_isntree_watery_sun_gel",
          },
          {
            source_type: "official_merchant_pdp",
            source_url: indexabilityMerchantUrl,
            source_merchant_name: "Isntree Official",
            maps_to_product_entity_id: "pe_isntree_watery_sun_gel",
          },
        ])}</script>`;
  const productObjectId =
    options.productObjectId === false
      ? ""
      : `<meta name="pivota-product-object-id" content="${options.productObjectId || verifiedPivotaObjectId}">`;
  const canonical =
    options.canonical === false
      ? ""
      : `<link rel="canonical" href="${options.canonical || canonicalIndexablePivotaUrl}">`;
  const metaRobots = options.metaRobots
    ? `<meta name="robots" content="${options.metaRobots}">`
    : `<meta name="robots" content="index, follow">`;
  return `<!doctype html>
    <html>
      <head>
        <title>${options.title || indexabilityProductName}</title>
        <meta name="description" content="Daily hydrating sunscreen with watery gel finish.">
        ${metaRobots}
        ${canonical}
        ${productObjectId}
        ${productSchema}
        ${offerSchema}
      </head>
      <body>
        <h1>${options.h1 || indexabilityProductName}</h1>
        <p>Brand: Isntree</p>
        ${description}
        ${sourceReference}
        <a href="/products/ext_related">Related sunscreen</a>
      </body>
    </html>`;
}

async function withMockPivotaIndexabilityFetch(config, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) {
      return {
        status: config.robotsStatus ?? 200,
        url,
        text: async () => config.robots ?? "User-agent: *\nAllow: /products/\n",
      };
    }
    if (url.endsWith("/sitemap.xml")) {
      return {
        status: config.sitemapStatus ?? 200,
        url,
        text: async () =>
          config.sitemap ??
          `<?xml version="1.0"?><urlset><url><loc>${canonicalIndexablePivotaUrl}</loc></url></urlset>`,
      };
    }
    if (url.endsWith("/sitemap-products.xml")) {
      return {
        status: config.productSitemapStatus ?? config.sitemapStatus ?? 200,
        url,
        text: async () =>
          config.productSitemap ??
          config.sitemap ??
          `<?xml version="1.0"?><urlset><url><loc>${canonicalIndexablePivotaUrl}</loc></url></urlset>`,
      };
    }
    return {
      status: config.status ?? 200,
      url: config.finalUrl || url,
      text: async () => config.html ?? indexabilityHtml(),
    };
  };
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runPivotaIndexabilityAudit(config = {}) {
  return withMockPivotaIndexabilityFetch(config, () =>
    new PivotaPDPIndexabilityAuditService().audit({
      url: canonicalIndexablePivotaUrl,
      product_name: indexabilityProductName,
      brand: "Isntree",
      merchant_pdp_url: indexabilityMerchantUrl,
      offers_exist: true,
    })
  );
}

const pivotaLivePdpQualityFindings = [
  "missing_pdp_identity",
  "product_intel_module_empty_or_blocked",
  "missing_overview_from_available_description",
  "similar_card_missing_highlight",
];

const pivotaPdpQualityNextAction =
  "Complete Pivota PDP identity, overview, product intelligence module, and similar-card highlight, then rerun Pivota PDP Attribution Test and GMV Assurance Snapshot.";
const organicDiscoveryNextAction =
  "Strengthen merchant and Pivota discovery signals, update query cluster mapping, then rerun Organic Product Discovery Test.";
const competitorDominanceNextAction =
  "Analyze dominant competitor matches, add differentiation evidence, update substitute/query mappings, then rerun Organic Product Discovery Test.";

function markDemandScoresPassed(result) {
  Object.assign(result.score.aggregate_scores, {
    product_entity_visibility_score: 100,
    merchant_store_visibility_score: 100,
    pivota_pdp_visibility_score: 100,
    pivota_offer_visibility_score: 100,
    executable_offer_visibility_score: "not_tested",
    visibility_score: 100,
    recommendation_rank_score: 100,
    competitor_substitution_score: 0,
    attribute_readiness_score: 100,
    pivota_pdp_readiness_score: 100,
  });
  result.score.provider_scores.production_validation = {
    ...result.score.aggregate_scores,
  };
}

function addPivotaPdpQualityIssue(result, findings = pivotaLivePdpQualityFindings) {
  const issue = new IssueEngine().createIssue({
    issueType: "pivota_pdp_content_quality_gap",
    severity: "high",
    rootCause:
      "Merchant-owned PDP attribution passed. The main readiness gap is on the Pivota agent-facing PDP layer.",
    recommendedAction: pivotaPdpQualityNextAction,
    input: {
      scanTarget: result.target,
      score: result.score,
      cluster: result.cluster,
      parsed: result.parsed,
      matches: result.matches,
    },
    product: result.product,
    missingAttributes: [],
    parserConfidence: 1,
    matchConfidence: 1,
  });
  issue.evidence = {
    ...issue.evidence,
    blocker_eligible: true,
    target_layer: "pivota_agent_facing_path",
    affected_readiness_dimension: "product_data_readiness_status",
    pivota_pdp_quality_findings: findings,
  };
  issue.blocker_eligible = true;
  issue.fix_targets = ["pivota_unified_pdp", "pivota_product_graph"];
  issue.recommended_action = pivotaPdpQualityNextAction;
  issue.merchant_facing_summary =
    "Merchant-owned PDP attribution passed. The main readiness gap is on the Pivota agent-facing PDP layer.";
  issue.pivota_unified_pdp_patch = {
    complete_pdp_identity: true,
    add_overview_from_available_description: true,
  };
  issue.pivota_product_graph_patch = {
    populate_product_intelligence_module: true,
    add_similar_card_highlight: true,
  };
  getAgentCenterState().issues.push(issue);
  return issue;
}

function addValidationAnchorIssue(result) {
  const issue = new IssueEngine().createIssue({
    issueType: "human_review_required",
    severity: "low",
    rootCause: "Internal production validation anchor.",
    recommendedAction: "Review downstream validation outputs.",
    input: {
      scanTarget: result.target,
      score: result.score,
      cluster: result.cluster,
      parsed: result.parsed,
      matches: result.matches,
    },
    product: result.product,
    missingAttributes: [],
    parserConfidence: 1,
    matchConfidence: 1,
  });
  issue.evidence = {
    ...issue.evidence,
    validation_anchor: true,
    blocker_eligible: false,
  };
  issue.blocker_eligible = false;
  issue.fix_targets = ["human_review"];
  getAgentCenterState().issues.push(issue);
  return issue;
}

function addCleanOfferDiagnosis(result, issue) {
  const now = new Date("2026-05-01T12:00:00.000Z").toISOString();
  getAgentCenterState().merchantOffers.push({
    id: "merchant_offer_skin1004_clean",
    merchant_id: result.store.merchant_id,
    store_id: result.store.id,
    product_id: result.product.id,
    sku_id: result.product.sku,
    price: 12.6,
    currency: "USD",
    promo_price: null,
    coupon_code: null,
    coupon_status: "none",
    inventory_status: "in_stock",
    inventory_quantity: 42,
    expires_at: null,
    source_url: result.product.pdp_url,
    last_synced_at: now,
    created_at: now,
    updated_at: now,
  });
  getAgentCenterState().pivotaOffers.push({
    id: "pivota_offer_skin1004_clean",
    product_entity_id: result.product.product_entity_id,
    pivota_unified_pdp_id: `pdp_${result.product.product_entity_id}`,
    merchant_id: result.store.merchant_id,
    store_id: result.store.id,
    sku_id: result.product.sku,
    price: 12.6,
    currency: "USD",
    promo_price: null,
    coupon_code: null,
    coupon_status: "none",
    inventory_status: "in_stock",
    execution_status: "ready",
    attached_to_pivota_pdp: true,
    last_verified_at: now,
    created_at: now,
    updated_at: now,
  });
  return new OfferExecutionService().runDiagnosis(issue.id);
}

test("AgentCenterRepository CRUD and query helpers cover persisted core records", () => {
  resetAgentCenterState();
  const repository = getAgentCenterRepository();
  const timestamp = new Date().toISOString();
  const persistedCollections = [
    "stores",
    "scanTargets",
    "issues",
    "productUnderstandingDiagnoses",
    "offerExecutionDiagnoses",
    "checkoutVerificationDiagnoses",
    "gmvAssuranceSnapshots",
    "issueResolutionPlans",
    "usageEvents",
    "productionValidationRuns",
    "productEntityIndexRecords",
    "productEntityIndexBatchRuns",
    "pivotaIndexingTasks",
    "demoFixtures",
  ];

  for (const collection of persistedCollections) {
    const record = {
      id: `repo_${collection}`,
      merchant_id: "merchant_repo",
      store_id: "store_repo",
      scan_target_id: "scan_target_repo",
      issue_id: "issue_repo",
      fixture_id: "fixture_repo",
      production_validation_run_id: "prod_validation_repo",
      product_entity_id: "product_entity_repo",
      agent_type: "repository_test_agent",
      provider: "internal",
      idempotency_key: `repository:${collection}`,
      created_at: timestamp,
      updated_at: timestamp,
    };

    repository.upsert(collection, record);

    assert.equal(repository.getById(collection, record.id).id, record.id);
    assert.ok(
      repository.byMerchantId(collection, "merchant_repo").some((item) => item.id === record.id)
    );
    assert.ok(
      repository.byStoreId(collection, "store_repo").some((item) => item.id === record.id)
    );
    assert.ok(
      repository.byScanTargetId(collection, "scan_target_repo").some(
        (item) => item.id === record.id
      )
    );
    assert.ok(
      repository.byFixtureId(collection, "fixture_repo").some(
        (item) => item.id === record.id
      )
    );
  }

  assert.equal(
    repository.usageEventsBy({
      merchant_id: "merchant_repo",
      store_id: "store_repo",
      agent_type: "repository_test_agent",
      provider: "internal",
    })[0].id,
    "repo_usageEvents"
  );
  assert.equal(
    repository.snapshotsBy({
      merchant_id: "merchant_repo",
      store_id: "store_repo",
      product_entity_id: "product_entity_repo",
    })[0].id,
    "repo_gmvAssuranceSnapshots"
  );

  for (const collection of persistedCollections) {
    assert.equal(repository.deleteById(collection, `repo_${collection}`), true);
  }
});

test("persistent repository reload preserves issues and resolution plans", async () => {
  await withTempPersistentRepository(async ({ filePath }) => {
    const fixture = new DemoFixtureService().create({ preset: "price_mismatch" });
    const plan = new IssueResolutionService().generate(fixture.issue.id);

    setAgentCenterRepositoryForTests(new FileBackedAgentCenterRepository(filePath));

    assert.ok(
      getAgentCenterState().issues.some((issue) => issue.id === fixture.issue.id)
    );
    assert.ok(
      getAgentCenterState().issueResolutionPlans.some(
        (item) => item.id === plan.id && item.issue_id === fixture.issue.id
      )
    );
  });
});

test("persistent repository keeps usage event idempotency across reload", async () => {
  await withTempPersistentRepository(async ({ filePath }) => {
    const fixture = new DemoFixtureService().create({ preset: "price_mismatch" });
    new OfferExecutionService().runDiagnosis(fixture.issue.id);
    const usageCount = getAgentCenterState().usageEvents.length;

    setAgentCenterRepositoryForTests(new FileBackedAgentCenterRepository(filePath));
    new OfferExecutionService().runDiagnosis(fixture.issue.id);

    assert.equal(getAgentCenterState().usageEvents.length, usageCount);
    assert.ok(
      getAgentCenterState().usageEvents.every(
        (event) =>
          event.billing_mode === "preview_only" &&
          event.billing_status === "not_invoiced"
      )
    );
  });
});

test("production validation run survives fetch and delete across persistent repository reloads", async () => {
  await withTempPersistentRepository(async ({ filePath }) => {
    await withMockProductionValidationFetch(async () => {
      const service = new ProductionValidationRunService();
      const run = service.create(
        productionValidationPayload({
          merchant_offer_input: {
            price: 18.99,
            currency: "USD",
            coupon_status: "none",
            inventory_status: "in_stock",
          },
        })
      );

      setAgentCenterRepositoryForTests(new FileBackedAgentCenterRepository(filePath));
      const fetched = new ProductionValidationRunService().get(run.id);
      assert.equal(fetched.status, "created");

      const completed = await new ProductionValidationRunService().run(run.id);
      assert.equal(completed.status, "completed");
      assert.ok(completed.scan_target_id);
      assert.ok(completed.issue_ids.length > 0);

      const plan = new IssueResolutionService().generate(completed.issue_ids[0]);
      assert.equal(plan.issue_id, completed.issue_ids[0]);

      setAgentCenterRepositoryForTests(new FileBackedAgentCenterRepository(filePath));
      const deleted = new ProductionValidationRunService().delete(run.id);
      assert.equal(deleted.status, "deleted");

      setAgentCenterRepositoryForTests(new FileBackedAgentCenterRepository(filePath));
      assert.equal(new ProductionValidationRunService().get(run.id).status, "deleted");
      assert.equal(
        getAgentCenterState().scanTargets.some(
          (target) => target.id === completed.scan_target_id
        ),
        false
      );
      assert.equal(
        getAgentCenterState().issueResolutionPlans.some(
          (item) => item.issue_id === completed.issue_ids[0]
        ),
        false
      );
    });
  });
});

test("demo fixture fetch and cleanup work through persistent repository reloads", async () => {
  await withTempPersistentRepository(async ({ filePath }) => {
    const created = new DemoFixtureService().create({
      preset: "clean_offer",
      ttl_minutes: 60,
      environment: "persistent-test",
    });
    const fixtureId = created.fixture.fixture_id;

    setAgentCenterRepositoryForTests(new FileBackedAgentCenterRepository(filePath));
    const fetched = new DemoFixtureService().get(fixtureId);
    assert.equal(fetched.fixture.cleanup_status, "active");
    assert.ok(fetched.records.stores.length > 0);

    new DemoFixtureService().delete(fixtureId);

    setAgentCenterRepositoryForTests(new FileBackedAgentCenterRepository(filePath));
    assert.equal(
      getAgentCenterState().stores.some((store) => store.fixture_id === fixtureId),
      false
    );
    assert.equal(
      getAgentCenterState().demoFixtures.find((fixture) => fixture.fixture_id === fixtureId)
        .cleanup_status,
      "deleted"
    );
  });
});

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

async function captureGeminiRequestForScanMode(scanMode, groundingEnabled = true) {
  const { store, target } = createConnectedTarget();
  target.scan_mode = scanMode;
  const cluster = new QueryClusterService().generateForScanTarget(target.id)[0];
  const product = store.products[0];
  const input = {
    ...demandInput(store, target, cluster, product),
    scanMode,
  };
  const merchantPdpUrl = product.pdp_url;
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalMock = process.env.PIVOTA_AGENT_CENTER_MOCK_GEMINI;
  const originalGrounding = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  let requestBody;

  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.PIVOTA_AGENT_CENTER_MOCK_GEMINI = "false";
  if (groundingEnabled) {
    process.env.GEMINI_SEARCH_GROUNDING_ENABLED =
      typeof groundingEnabled === "string" ? groundingEnabled : "true";
  } else {
    delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  }
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init.body));
    const rawText = JSON.stringify({
      mentioned_brands: [product.brand],
      mentioned_products: [
        {
          name: product.title,
          brand: product.brand,
          rank: 1,
          reason: "Grounded Gemini found the merchant PDP.",
        },
      ],
      returned_urls: [],
      missing_attributes_identified: [],
      reasoning_summary: "Grounded response.",
    });
    return {
      ok: true,
      status: 200,
      headers: { get: () => "gemini_request_id" },
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: rawText }] },
            groundingMetadata: {
              webSearchQueries: [`${product.brand} ${product.title}`],
              groundingChunks: [
                {
                  web: {
                    uri: merchantPdpUrl,
                    title: `${product.brand} official product page`,
                  },
                },
              ],
              groundingSupports: [{ segment: { startIndex: 0, endIndex: 12 } }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 12,
          candidatesTokenCount: 24,
        },
      }),
    };
  };

  try {
    const raw = await new GeminiProviderAdapter().runDemandTest(input);
    return { raw, parsed: parseProviderOutput(raw, input), requestBody, merchantPdpUrl };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalMock === undefined) delete process.env.PIVOTA_AGENT_CENTER_MOCK_GEMINI;
    else process.env.PIVOTA_AGENT_CENTER_MOCK_GEMINI = originalMock;
    if (originalGrounding === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = originalGrounding;
  }
}

test("Gemini grounding tool is included only for search-grounded discovery when enabled", async () => {
  const search = await captureGeminiRequestForScanMode(
    "search_grounded_product_discovery_test",
    true
  );
  const organic = await captureGeminiRequestForScanMode(
    "organic_product_discovery_test",
    true
  );
  const buyingPath = await captureGeminiRequestForScanMode(
    "buying_path_discovery_test",
    true
  );
  const contextual = await captureGeminiRequestForScanMode(
    "merchant_store_attribution_test",
    true
  );
  const disabled = await captureGeminiRequestForScanMode(
    "search_grounded_product_discovery_test",
    false
  );
  const escapedNewline = await captureGeminiRequestForScanMode(
    "search_grounded_product_discovery_test",
    "true\\n"
  );

  assert.deepEqual(search.requestBody.tools, [{ google_search: {} }]);
  assert.deepEqual(escapedNewline.requestBody.tools, [{ google_search: {} }]);
  assert.equal(search.requestBody.generationConfig.responseMimeType, undefined);
  assert.equal(search.requestBody.generationConfig.responseSchema, undefined);
  assert.equal(organic.requestBody.generationConfig.responseMimeType, "application/json");
  assert.equal(organic.requestBody.tools, undefined);
  assert.equal(buyingPath.requestBody.tools, undefined);
  assert.equal(contextual.requestBody.tools, undefined);
  assert.equal(disabled.requestBody.tools, undefined);
  assert.equal(search.raw.tool_calls, 1);
  assert.equal(disabled.raw.tool_calls, 0);
});

test("Gemini grounding metadata populates discovery sources and returned URLs", async () => {
  const result = await captureGeminiRequestForScanMode(
    "search_grounded_product_discovery_test",
    true
  );

  assert.equal(result.parsed.grounding_search_queries.length, 1);
  assert.match(result.parsed.grounding_search_queries[0], /Demo/i);
  assert.deepEqual(result.parsed.grounding_sources, [result.merchantPdpUrl]);
  assert.ok(result.parsed.returned_urls.includes(result.merchantPdpUrl));
  assert.equal(result.parsed.merchant_pdp_url_exact_match, true);
  assert.equal(result.parsed.discovery_type, "search_grounded");
});

test("Gemini parser normalizes structured grounded URL objects without object strings", () => {
  const { store, target } = createConnectedTarget();
  const cluster = new QueryClusterService().generateForScanTarget(target.id)[0];
  const product = store.products[0];
  const input = {
    ...demandInput(store, target, cluster, product),
    scanMode: "search_grounded_product_discovery_test",
  };
  const expectedUrl = product.pdp_url;
  const parsed = parseProviderOutput(
    {
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
      raw_output: "{}",
      normalized_output: {
        returned_urls: [
          { url: expectedUrl, title: "Official PDP" },
          { uri: "https://retailer.example/demo-product", title: "Retailer PDP" },
          { title: "Title-only source should not become a returned URL" },
        ],
        grounding_sources: [
          { web: { uri: "https://ignored.example/nested-web-shape" } },
          { uri: expectedUrl, title: "Grounding source" },
          { title: "Another title-only source" },
        ],
      },
      input_tokens: 1,
      output_tokens: 1,
      tool_calls: 1,
      provider_request_id: "structured_grounding",
    },
    input
  );

  assert.ok(parsed.returned_urls.includes(expectedUrl));
  assert.ok(parsed.returned_urls.includes("https://retailer.example/demo-product"));
  assert.equal(parsed.returned_urls.some((url) => url.includes("[object Object]")), false);
  assert.equal(
    parsed.returned_urls.some((url) => url.includes("Title-only source")),
    false
  );
  assert.deepEqual(parsed.grounding_sources, [expectedUrl]);
});

test("runtime config normalizes Gemini search grounding flag without exposing secrets", () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true\\n";
  try {
    assert.equal(envFlagEnabled(process.env.GEMINI_SEARCH_GROUNDING_ENABLED), true);
    const status = getAgentCenterRuntimeConfigStatus();
    assert.equal(status.gemini_search_grounding_enabled, true);
    assert.equal(status.search_grounded_product_discovery_status, "configured");
    assert.equal(JSON.stringify(status).includes("GEMINI_API_KEY"), false);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("internal config status API is gated and reports grounding configuration", async () => {
  resetAgentCenterState();
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  const previousGemini = process.env.GEMINI_API_KEY;
  await withInternalProductionValidationEnv(async () => {
    process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true\\n";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const response = await handleAgentCenterRequest(
      internalProductionValidationRequest(
        "https://example.test/api/agent-center/internal-config-status"
      ),
      { path: ["internal-config-status"] }
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.config.production_validation_enabled, true);
    assert.equal(payload.config.gemini_provider_configured, true);
    assert.ok(payload.config.agent_center_state_backend);
    assert.equal(payload.config.gemini_search_grounding_enabled, true);
    assert.equal(
      payload.config.search_grounded_product_discovery_status,
      "configured"
    );
    assert.equal(JSON.stringify(payload).includes("validation-secret"), false);
    assert.equal(JSON.stringify(payload).includes("DATABASE_URL"), false);

    const runtimeResponse = await handleAgentCenterRequest(
      internalProductionValidationRequest(
        "https://example.test/api/agent-center/internal-runtime-config"
      ),
      { path: ["internal-runtime-config"] }
    );
    const runtimePayload = await runtimeResponse.json();
    assert.equal(runtimeResponse.status, 200);
    assert.equal(runtimePayload.config.gemini_search_grounding_enabled, true);
    assert.equal(JSON.stringify(runtimePayload).includes("validation-secret"), false);
  });
  if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousGemini;
});

test("internal Pivota indexing task API creates fetches and updates gated tasks", async () => {
  resetAgentCenterState();
  await withInternalProductionValidationEnv(async () => {
    const createResponse = await handleInternalPivotaIndexingTasksRequest(
      internalProductionValidationRequest(
        "https://example.test/api/internal/agent-center/pivota-indexing-tasks",
        {
          method: "POST",
          body: JSON.stringify({
            product_entity_id: "sig_7ad40676c42fb9c96e2a8136",
            canonical_pivota_pdp_url:
              "https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136",
            task_type: "submit_sitemap",
            evidence: {
              search_console_property_verified: false,
              sitemap_submitted: false,
              sitemap_url: "https://agent.pivota.cc/sitemap.xml",
              operator: "pivota_ops",
              evidence_note: "Created during internal test.",
            },
          }),
        }
      )
    );
    const createPayload = await createResponse.json();
    const task = createPayload.pivota_indexing_task;

    assert.equal(createResponse.status, 201);
    assert.equal(task.task_type, "submit_sitemap");
    assert.equal(task.status, "proposed");
    assert.equal(task.evidence.search_console_property_verified, false);
    assert.equal(task.evidence.sitemap_url, "https://agent.pivota.cc/sitemap.xml");

    const fetchResponse = await handleAgentCenterRequest(
      internalProductionValidationRequest(
        `https://example.test/api/agent-center/internal-pivota-indexing-tasks/${task.id}`
      ),
      { path: ["internal-pivota-indexing-tasks", task.id] }
    );
    const fetchPayload = await fetchResponse.json();
    assert.equal(fetchResponse.status, 200);
    assert.equal(fetchPayload.pivota_indexing_task.id, task.id);

    const updateResponse = await handleAgentCenterRequest(
      internalProductionValidationRequest(
        `https://example.test/api/agent-center/internal-pivota-indexing-tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "completed",
            evidence: {
              search_console_property_verified: true,
              sitemap_submitted: true,
              url_inspection_status: "inspectable",
              indexing_requested: true,
              operator: "pivota_ops",
              screenshot_or_reference_url:
                "https://search.google.com/search-console/example",
            },
          }),
        }
      ),
      { path: ["internal-pivota-indexing-tasks", task.id] }
    );
    const updatePayload = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(updatePayload.pivota_indexing_task.status, "completed");
    assert.ok(updatePayload.pivota_indexing_task.completed_at);
    assert.equal(
      updatePayload.pivota_indexing_task.evidence.search_console_property_verified,
      true
    );
    assert.equal(updatePayload.pivota_indexing_task.evidence.sitemap_submitted, true);
    assert.equal(updatePayload.pivota_indexing_task.evidence.indexing_requested, true);
    assert.ok(updatePayload.pivota_indexing_task.evidence.indexing_requested_at);

    const listResponse = await handleAgentCenterRequest(
      internalProductionValidationRequest(
        "https://example.test/api/agent-center/internal-pivota-indexing-tasks?product_entity_id=sig_7ad40676c42fb9c96e2a8136"
      ),
      { path: ["internal-pivota-indexing-tasks"] }
    );
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.ok(listPayload.pivota_indexing_tasks.length >= 7);
    assert.equal(listPayload.product_entity_summaries.length, 1);
    assert.ok(listPayload.product_entity_summaries[0].next_rerun_at);
    assert.equal(
      listPayload.product_entity_summaries[0].indexing_evidence_status,
      "waiting_for_indexing"
    );
    assert.equal(listPayload.product_entity_summaries[0].uplift_claim_allowed, false);
  });
});

test("internal Pivota indexing task API bulk creates tasks from sitemap-eligible ProductEntity records", async () => {
  resetAgentCenterState();
  const now = new Date().toISOString();
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_bulkready",
    product_entity_id: "sig_bulkready",
    canonical_url: "https://agent.pivota.cc/products/sig_bulkready",
    external_seed_id: "ext_bulk_alias",
    product_name: "Bulk Ready Product",
    brand: "Bulk Brand",
    category: "Serum",
    pdp_content_status: "ready",
    indexability_status: "ready",
    sitemap_eligible: true,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: [],
    created_at: now,
    updated_at: now,
  });
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_bulkblocked",
    product_entity_id: "sig_bulkblocked",
    canonical_url: "https://agent.pivota.cc/products/sig_bulkblocked",
    product_name: "Bulk Blocked Product",
    pdp_content_status: "weak_content",
    indexability_status: "needs_work",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: ["weak_content"],
    created_at: now,
    updated_at: now,
  });

  await withInternalProductionValidationEnv(async () => {
    const response = await handleInternalPivotaIndexingTasksRequest(
      internalProductionValidationRequest(
        "https://example.test/api/internal/agent-center/pivota-indexing-tasks/bulk",
        {
          method: "POST",
          body: JSON.stringify({
            limit: 10,
            task_types: ["submit_sitemap", "request_indexing"],
            evidence: {
              operator: "pivota_ops",
              evidence_note: "Bulk queue creation for sitemap-eligible PDPs.",
            },
          }),
        }
      ),
      { taskId: "bulk" }
    );
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.pivota_indexing_task_bulk.records_seen, 1);
    assert.equal(payload.pivota_indexing_task_bulk.tasks_created, 2);
    assert.equal(payload.pivota_indexing_task_bulk.errors.length, 0);
    assert.deepEqual(
      getAgentCenterState().pivotaIndexingTasks.map((task) => task.task_type).sort(),
      ["request_indexing", "submit_sitemap"]
    );
    assert.equal(
      getAgentCenterState().pivotaIndexingTasks.every(
        (task) => task.product_entity_id === "sig_bulkready"
      ),
      true
    );

    const dedupeResponse = await handleInternalPivotaIndexingTasksRequest(
      internalProductionValidationRequest(
        "https://example.test/api/internal/agent-center/pivota-indexing-tasks/bulk",
        {
          method: "POST",
          body: JSON.stringify({
            limit: 10,
            task_types: ["submit_sitemap", "request_indexing"],
          }),
        }
      ),
      { taskId: "bulk" }
    );
    const dedupePayload = await dedupeResponse.json();
    assert.equal(dedupePayload.pivota_indexing_task_bulk.tasks_created, 0);
    assert.equal(dedupePayload.pivota_indexing_task_bulk.records_seen, 0);

    const existingResponse = await handleInternalPivotaIndexingTasksRequest(
      internalProductionValidationRequest(
        "https://example.test/api/internal/agent-center/pivota-indexing-tasks/bulk",
        {
          method: "POST",
          body: JSON.stringify({
            limit: 10,
            task_types: ["submit_sitemap", "request_indexing"],
            include_fully_existing: true,
          }),
        }
      ),
      { taskId: "bulk" }
    );
    const existingPayload = await existingResponse.json();
    assert.equal(existingPayload.pivota_indexing_task_bulk.records_seen, 1);
    assert.equal(existingPayload.pivota_indexing_task_bulk.tasks_existing, 2);
  });
});

test("Pivota indexing task completion enforces Search Console evidence rules", () => {
  resetAgentCenterState();
  const service = new PivotaIndexingTaskService();
  assert.throws(
    () =>
      service.create({
        product_entity_id: "sig_search_console_guard",
        canonical_pivota_pdp_url:
          "https://agent.pivota.cc/products/sig_search_console_guard",
        task_type: "validate_search_console",
        status: "completed",
        evidence: {
          search_console_property_verified: false,
        },
      }),
    /Search Console property verification/
  );

  const requestTask = service.create({
    product_entity_id: "sig_search_console_guard",
    canonical_pivota_pdp_url:
      "https://agent.pivota.cc/products/sig_search_console_guard",
    task_type: "request_indexing",
    evidence: {
      search_console_property_verified: true,
      sitemap_submitted: true,
      url_inspection_status: "blocked",
      indexing_requested: false,
    },
  });

  assert.throws(
    () =>
      service.update(requestTask.id, {
        status: "completed",
        evidence: {
          url_inspection_status: "blocked",
          indexing_requested: true,
        },
      }),
    /URL inspection/
  );

  const completed = service.update(requestTask.id, {
    status: "completed",
    evidence: {
      url_inspection_status: "indexing_requested",
      indexing_requested: true,
    },
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.evidence.indexing_requested, true);
  assert.ok(completed.evidence.indexing_requested_at);
});

test("Pivota indexing summary tracks evidence status, next action, and no uplift until measured rerun improves", () => {
  resetAgentCenterState();
  const store = getAgentCenterState().stores[0];
  const target = new ScanTargetService().create({
    store_id: store.id,
    selected_product_ids: store.products.map((product) => product.id),
    scan_mode: "search_grounded_product_discovery_test",
  });
  const service = new PivotaIndexingTaskService();
  service.create({
    product_entity_id: "sig_indexing_summary",
    canonical_pivota_pdp_url:
      "https://agent.pivota.cc/products/sig_indexing_summary",
    task_type: "validate_search_console",
    status: "completed",
    evidence: {
      search_console_property_verified: true,
      sitemap_submitted: true,
      url_inspection_status: "indexing_requested",
      indexing_requested: true,
      operator: "pivota_ops",
    },
  });
  service.create({
    product_entity_id: "sig_indexing_summary",
    canonical_pivota_pdp_url:
      "https://agent.pivota.cc/products/sig_indexing_summary",
    task_type: "scheduled_search_grounded_rerun",
    evidence: {
      rerun_window: "T+24h",
      next_rerun_at: "2000-01-01T00:00:00.000Z",
      uplift_claim_allowed: false,
    },
  });

  const summary = service.summary("sig_indexing_summary");
  assert.equal(summary.indexing_evidence_status, "rerun_due");
  assert.match(summary.next_recommended_operator_action, /Rerun/i);
  assert.equal(summary.uplift_claim_allowed, false);

  getAgentCenterState().scores.push({
    id: "score_indexing_uplift",
    job_id: "job_indexing_uplift",
    scan_target_id: target.id,
    product_entity_id: "sig_indexing_summary",
    query_cluster_ids: [],
    provider_scores: {},
    aggregate_scores: {
      product_entity_visibility_score: 0,
      merchant_store_visibility_score: 0,
      pivota_pdp_visibility_score: 0,
      pivota_offer_visibility_score: 0,
      pivota_attribution_echo_rate: 0,
      executable_offer_visibility_score: "not_tested",
      organic_product_discovery_score: "not_tested",
      organic_brand_discovery_score: "not_tested",
      competitor_dominance_score: "not_tested",
      search_grounded_merchant_pdp_discovery_score: 0,
      search_grounded_pivota_pdp_discovery_score: 100,
      buying_path_discovery_score: "not_tested",
      offer_discovery_score: "not_tested",
      url_match_accuracy_score: 100,
      visibility_score: 0,
      recommendation_rank_score: 0,
      competitor_substitution_score: 0,
      attribute_readiness_score: 0,
      pivota_pdp_readiness_score: 0,
    },
    score_explanations: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  getAgentCenterState().jobs.push({
    id: "job_indexing_uplift",
    merchant_id: target.merchant_id,
    store_id: target.store_id,
    scan_target_id: target.id,
    scan_mode: "search_grounded_product_discovery_test",
    status: "completed",
    provider_set: ["gemini"],
    prompt_template_ids: [],
    query_cluster_ids: [],
    repetitions: 1,
    estimated_credits: 1,
    billing_mode: "preview_only",
    billing_status: "not_invoiced",
    usage_event_ids: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const upliftSummary = service.summary("sig_indexing_summary");
  assert.equal(upliftSummary.uplift_claim_allowed, true);
  assert.equal(upliftSummary.indexing_evidence_status, "uplift_verified");
});

test("Pivota PDP indexability audit passes clean indexable PDP", async () => {
  const audit = await runPivotaIndexabilityAudit();

  assert.equal(audit.audit_status, "passed");
  assert.deepEqual(audit.findings, []);
  assert.equal(audit.raw_safe_evidence.http_status, 200);
  assert.equal(audit.raw_safe_evidence.robots_blocked, false);
  assert.equal(audit.raw_safe_evidence.sitemap_includes_pdp_url, true);
  assert.equal(audit.raw_safe_evidence.product_jsonld_present, true);
  assert.equal(audit.raw_safe_evidence.offer_jsonld_present, true);
  assert.equal(JSON.stringify(audit).includes("<html"), false);
});

test("Pivota PDP indexability audit accepts machine-readable SEO signals without visible debug UI", async () => {
  const audit = await runPivotaIndexabilityAudit({
    html: indexabilityHtml({
      description: false,
      sourceReference: false,
    }).replace(
      "</body>",
      `<script type="application/json" data-pivota-product-seo-signals>${JSON.stringify({
        overview:
          "Daily hydrating sunscreen with watery gel texture, hyaluronic acid, SPF50+ PA++++ protection, and source-backed product intelligence context.",
        source_references: [
          {
            source_type: "official_merchant_pdp",
            source_url: indexabilityMerchantUrl,
          },
        ],
      })}</script></body>`
    ),
  });
  const findingTypes = audit.findings.map((finding) => finding.finding_type);

  assert.equal(audit.raw_safe_evidence.description_visible, true);
  assert.equal(audit.raw_safe_evidence.merchant_source_reference_visible, true);
  assert.equal(audit.raw_safe_evidence.source_merchant_pdp_url_visible, true);
  assert.equal(findingTypes.includes("thin_content"), false);
  assert.equal(findingTypes.includes("product_entity_missing_merchant_source"), false);
});

test("public ProductEntity indexability surfaces expose canonical URLs without ext aliases", async () => {
  resetAgentCenterState();
  const entries = publicProductEntityIndexEntries();
  const urls = entries.map((entry) => entry.canonical_url);
  assert.ok(
    urls.includes("https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136")
  );
  assert.equal(urls.some((url) => /\/products\/ext_/i.test(url)), false);

  const sitemapUrls = agentPivotaSitemapEntries().map((entry) => entry.url);
  assert.ok(
    sitemapUrls.includes(
      "https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136"
    )
  );
  assert.equal(sitemapUrls.some((url) => /\/products\/ext_/i.test(url)), false);

  const robotsPolicy = agentPivotaRobotsPolicy();
  assert.equal(robotsPolicy.sitemap, "https://agent.pivota.cc/sitemap.xml");

  const pageSource = await readFile(
    "app/products/indexability/page.tsx",
    "utf8"
  );
  assert.match(pageSource, /publicProductEntityIndexEntries/);
  assert.match(pageSource, /Open canonical PDP/);
  assert.equal(/raw|debug|token/i.test(pageSource), false);
});

test("ProductEntity index registry sync paginates, dedupes, and excludes no-content PDPs from sitemap eligibility", async () => {
  resetAgentCenterState();
  const originalFetch = global.fetch;
  const gatewayCalls = [];
  const longDescription =
    "A real server-side PDP description with enough product detail for crawlable ProductEntity content. ".repeat(
      3
    );
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    gatewayCalls.push(body);
    if (body.operation === "get_discovery_feed") {
      const page = body.payload?.page || 1;
      return {
        ok: true,
        json: async () =>
          page === 1
            ? {
                products: [
                  {
                    product_id: "ext_ready_1",
                    sellable_item_group_id: "sig_ready1",
                    title: "Ready Product One",
                    brand: { name: "Ready Brand" },
                  },
                ],
                has_more: true,
              }
            : {
                products: [
                  {
                    product_id: "ext_ready_1",
                    sellable_item_group_id: "sig_ready1",
                    title: "Ready Product One Duplicate",
                  },
                  {
                    product_id: "ext_empty_1",
                    sellable_item_group_id: "sig_empty1",
                    title: "Empty Product One",
                  },
                ],
                has_more: false,
              },
      };
    }
    if (body.operation === "get_pdp_v2") {
      const productId = body.payload?.product_ref?.product_id;
      if (productId === "sig_ready1") {
        return {
          ok: true,
          json: async () => ({
            status: "success",
            generated_at: "2026-05-05T00:00:00.000Z",
            modules: [
              {
                type: "canonical",
                data: {
                  product_group_id: "sig_ready1",
                  sellable_item_group_id: "sig_ready1",
                  pdp_payload: {
                    product: {
                      product_id: "ext_ready_1",
                      title: "Ready Product One",
                      brand: { name: "Ready Brand" },
                      description: longDescription,
                      category_path: ["Beauty", "Serum"],
                    },
                    modules: [
                      {
                        type: "product_overview",
                        title: "Overview",
                        description: longDescription,
                      },
                    ],
                  },
                },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ product: { title: "" } }),
      };
    }
    throw new Error(`Unexpected operation ${body.operation}`);
  };

  try {
    const result = await new ProductEntityIndexRegistryService().sync({
      limit: 5,
      page_size: 1,
      max_pages: 3,
    });
    const records = getAgentCenterState().productEntityIndexRecords;

    assert.equal(result.pages_fetched, 2);
    assert.equal(records.length, 2);
    assert.equal(
      records.filter((record) => record.product_entity_id === "sig_ready1").length,
      1
    );
    assert.equal(
      records.find((record) => record.product_entity_id === "sig_ready1")
        ?.pdp_content_status,
      "ready"
    );
    assert.equal(
      records.find((record) => record.product_entity_id === "sig_empty1")
        ?.sitemap_eligible,
      false
    );
    assert.equal(
      gatewayCalls.some(
        (call) =>
          call.operation === "get_pdp_v2" &&
          call.payload?.product_ref?.product_id === "sig_ready1"
      ),
      true
    );
    const discoveryCall = gatewayCalls.find((call) => call.operation === "get_discovery_feed");
    assert.equal(discoveryCall?.payload?.context?.auth_state, "anonymous");
    assert.deepEqual(discoveryCall?.payload?.context?.recent_views, []);
    assert.deepEqual(discoveryCall?.payload?.context?.recent_queries, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test("ProductEntity index registry audit promotes only production-ready canonical PDPs", async () => {
  resetAgentCenterState();
  const service = new ProductEntityIndexRegistryService();
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_readyaudit",
    product_entity_id: "sig_readyaudit",
    canonical_url: "https://agent.pivota.cc/products/sig_readyaudit",
    external_seed_id: "ext_d7c74bcb380cbc2bdd5d5d90",
    external_seed_ids: ["ext_d7c74bcb380cbc2bdd5d5d90"],
    product_name: indexabilityProductName,
    brand: "Isntree",
    category: "Sunscreen",
    pdp_content_status: "ready",
    indexability_status: "not_audited",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await withMockPivotaIndexabilityFetch(
    {
      sitemap: "<?xml version=\"1.0\"?><urlset></urlset>",
      html: indexabilityHtml({
        canonical: "https://agent.pivota.cc/products/sig_readyaudit",
        productObjectId: "sig_readyaudit",
        productJsonLd: productJsonLd({
          url: "https://agent.pivota.cc/products/sig_readyaudit",
        }),
        offerJsonLd: offerJsonLd({
          url: "https://agent.pivota.cc/products/sig_readyaudit",
        }),
      }),
    },
    () =>
      service.audit({
        product_entity_ids: ["sig_readyaudit"],
      })
  );

  const record = service.get("sig_readyaudit");
  assert.equal(record.indexability_status, "ready");
  assert.equal(record.sitemap_eligible, true);
  assert.ok(record.failure_reasons.includes("audit:missing_sitemap_entry"));
  assert.equal(record.canonical_url.includes("/products/ext_"), false);
});

test("ProductEntity index registry audit does not block sitemap eligibility on missing optional offer price fields", async () => {
  resetAgentCenterState();
  const service = new ProductEntityIndexRegistryService();
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_offerpartial",
    product_entity_id: "sig_offerpartial",
    canonical_url: "https://agent.pivota.cc/products/sig_offerpartial",
    product_name: indexabilityProductName,
    brand: "Isntree",
    category: "Sunscreen",
    pdp_content_status: "ready",
    indexability_status: "not_audited",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await withMockPivotaIndexabilityFetch(
    {
      sitemap: "<?xml version=\"1.0\"?><urlset></urlset>",
      html: indexabilityHtml({
        canonical: "https://agent.pivota.cc/products/sig_offerpartial",
        productObjectId: "sig_offerpartial",
        productJsonLd: productJsonLd({
          url: "https://agent.pivota.cc/products/sig_offerpartial",
        }),
        offerJsonLd: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Offer",
          url: "https://agent.pivota.cc/products/sig_offerpartial",
          seller: { "@type": "Organization", name: "Isntree" },
        }),
      }),
    },
    () =>
      service.audit({
        product_entity_ids: ["sig_offerpartial"],
      })
  );

  const record = service.get("sig_offerpartial");
  assert.equal(record.failure_reasons.includes("audit:incomplete_offer_jsonld"), true);
  assert.equal(record.indexability_status, "ready");
  assert.equal(record.sitemap_eligible, true);
});

test("ProductEntity index registry audit treats Product JSON-LD SKU as optional", async () => {
  resetAgentCenterState();
  const service = new ProductEntityIndexRegistryService();
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_skuoptional",
    product_entity_id: "sig_skuoptional",
    canonical_url: "https://agent.pivota.cc/products/sig_skuoptional",
    product_name: indexabilityProductName,
    brand: "Isntree",
    category: "Sunscreen",
    pdp_content_status: "ready",
    indexability_status: "not_audited",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await withMockPivotaIndexabilityFetch(
    {
      sitemap: "<?xml version=\"1.0\"?><urlset></urlset>",
      html: indexabilityHtml({
        canonical: "https://agent.pivota.cc/products/sig_skuoptional",
        productObjectId: "sig_skuoptional",
        productJsonLd: productJsonLd({
          sku: undefined,
          url: "https://agent.pivota.cc/products/sig_skuoptional",
        }),
        offerJsonLd: offerJsonLd({
          url: "https://agent.pivota.cc/products/sig_skuoptional",
        }),
      }),
    },
    () =>
      service.audit({
        product_entity_ids: ["sig_skuoptional"],
      })
  );

  const record = service.get("sig_skuoptional");
  assert.equal(record.failure_reasons.includes("audit:incomplete_product_jsonld"), false);
  assert.equal(record.indexability_status, "ready");
  assert.equal(record.sitemap_eligible, true);
});

test("ProductEntity index registry audit decodes HTML entity product identity", async () => {
  resetAgentCenterState();
  const service = new ProductEntityIndexRegistryService();
  const productName = "Soft'lit Naturally Luminous Longwear Foundation — 230";
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_htmlentity",
    product_entity_id: "sig_htmlentity",
    canonical_url: "https://agent.pivota.cc/products/sig_htmlentity",
    product_name: productName,
    brand: "Fenty Beauty",
    category: "Foundation",
    pdp_content_status: "ready",
    indexability_status: "not_audited",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await withMockPivotaIndexabilityFetch(
    {
      sitemap: "<?xml version=\"1.0\"?><urlset></urlset>",
      html: indexabilityHtml({
        title: "Fenty Beauty Soft&#x27;lit Naturally Luminous Longwear Foundation — 230 | Pivota",
        h1: "Fenty Beauty Soft&#x27;lit Naturally Luminous Longwear Foundation — 230",
        canonical: "https://agent.pivota.cc/products/sig_htmlentity",
        productObjectId: "sig_htmlentity",
        productJsonLd: productJsonLd({
          name: productName,
          brand: { "@type": "Brand", name: "Fenty Beauty" },
          sku: "fenty-softlit-230",
          url: "https://agent.pivota.cc/products/sig_htmlentity",
          description:
            "A luminous longwear foundation shade page with verified merchant source references and ProductEntity identity.",
        }),
        offerJsonLd: offerJsonLd({
          url: "https://agent.pivota.cc/products/sig_htmlentity",
          seller: { "@type": "Organization", name: "Fenty Beauty" },
        }),
      }),
    },
    () =>
      service.audit({
        product_entity_ids: ["sig_htmlentity"],
      })
  );

  const record = service.get("sig_htmlentity");
  assert.equal(record.failure_reasons.includes("audit:rendered_identity_mismatch"), false);
  assert.equal(record.indexability_status, "ready");
  assert.equal(record.sitemap_eligible, true);
});

test("ProductEntity index content verification runs separately from candidate sync", async () => {
  resetAgentCenterState();
  const originalFetch = global.fetch;
  const longDescription =
    "A real server-side PDP description with enough product detail for crawlable ProductEntity content. ".repeat(
      3
    );
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_verifycontent",
    product_entity_id: "sig_verifycontent",
    canonical_url: "https://agent.pivota.cc/products/sig_verifycontent",
    external_seed_id: "ext_verifycontent",
    external_seed_ids: ["ext_verifycontent"],
    source_product_id: "ext_verifycontent",
    product_name: "Verify Content Product",
    brand: "Verify Brand",
    category: "Serum",
    pdp_content_status: "no_content",
    indexability_status: "not_audited",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.operation, "get_pdp_v2");
    return {
      ok: true,
      json: async () => ({
        modules: [
          {
            type: "canonical",
            data: {
              pdp_payload: {
                product: {
                  title: "Verify Content Product",
                  brand: { name: "Verify Brand" },
                  description: longDescription,
                  category_path: ["Beauty", "Serum"],
                },
              },
            },
          },
        ],
      }),
    };
  };

  try {
    const result = await new ProductEntityIndexRegistryService().verifyContent({
      limit: 1,
    });
    const record = getAgentCenterState().productEntityIndexRecords.find(
      (item) => item.product_entity_id === "sig_verifycontent"
    );

    assert.equal(result.records_verified, 1);
    assert.equal(result.pdp_content_ready, 1);
    assert.equal(record?.pdp_content_status, "ready");
    assert.equal(record?.indexability_status, "not_audited");
    assert.equal(record?.sitemap_eligible, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("ProductEntity index registry can sync from gateway ProductEntity index feed", async () => {
  resetAgentCenterState();
  const originalFetch = global.fetch;
  const gatewayCalls = [];
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    gatewayCalls.push(body);
    if (body.operation === "get_product_entity_index_feed") {
      return {
        ok: true,
        json: async () => ({
          products: [
            {
              product_id: "ext_indexfeed_1",
              source_product_id: "ext_indexfeed_1",
              external_seed_id: "ext_indexfeed_1",
              product_entity_id: "sig_indexfeed1",
              sellable_item_group_id: "sig_indexfeed1",
              title: "Index Feed Serum",
              brand: "Index Feed Brand",
            },
          ],
          cursor_info: {
            next_cursor: null,
            has_next_page: false,
          },
        }),
      };
    }
    throw new Error(`Unexpected operation ${body.operation}`);
  };

  try {
    const result = await new ProductEntityIndexRegistryService().sync({
      source: "gateway_product_entity_index_feed",
      limit: 10,
      page_size: 10,
      verify_content: false,
    });
    const records = getAgentCenterState().productEntityIndexRecords;
    assert.equal(result.source, "gateway_product_entity_index_feed");
    assert.equal(result.records_upserted, 1);
    assert.equal(records[0].product_entity_id, "sig_indexfeed1");
    assert.equal(records[0].external_seed_id, "ext_indexfeed_1");
    assert.equal(
      gatewayCalls.some((call) => call.operation === "get_discovery_feed"),
      false
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("ProductEntity index batch runner persists sync cursor and verifies content in small batches", async () => {
  resetAgentCenterState();
  const originalFetch = global.fetch;
  const longDescription =
    "A crawlable ProductEntity PDP description generated from the real gateway payload. ".repeat(
      3
    );
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    if (body.operation === "get_discovery_feed") {
      const cursor = body.payload?.cursor || "";
      return {
        ok: true,
        json: async () =>
          cursor === "cursor_2"
            ? {
                products: [
                  {
                    product_id: "ext_batch_2",
                    sellable_item_group_id: "sig_batch2",
                    title: "Batch Product Two",
                    brand: { name: "Batch Brand" },
                  },
                ],
                has_more: false,
              }
            : {
                products: [
                  {
                    product_id: "ext_batch_1",
                    sellable_item_group_id: "sig_batch1",
                    title: "Batch Product One",
                    brand: { name: "Batch Brand" },
                  },
                ],
                cursor_info: {
                  next_cursor: "cursor_2",
                  has_next_page: true,
                  serving_mode: "curated_head",
                },
              },
      };
    }
    if (body.operation === "get_pdp_v2") {
      const productId = body.payload?.product_ref?.product_id;
      return {
        ok: true,
        json: async () => ({
          modules: [
            {
              type: "canonical",
              data: {
                pdp_payload: {
                  product: {
                    title:
                      productId === "sig_batch2"
                        ? "Batch Product Two"
                        : "Batch Product One",
                    brand: { name: "Batch Brand" },
                    description: longDescription,
                    category_path: ["Beauty", "Serum"],
                  },
                },
              },
            },
          ],
        }),
      };
    }
    throw new Error(`Unexpected operation ${body.operation}`);
  };

  try {
    const service = new ProductEntityIndexRegistryService();
    const firstSync = await service.runBatch({
      stage: "sync",
      sync_limit: 1,
      page_size: 1,
      max_pages: 1,
    });
    const secondSync = await service.runBatch({
      run_id: firstSync.id,
      stage: "auto",
      sync_limit: 1,
      page_size: 1,
      max_pages: 1,
    });
    const verify = await service.runBatch({
      run_id: firstSync.id,
      stage: "auto",
      verify_limit: 1,
    });

    assert.equal(firstSync.next_cursor, "cursor_2");
    assert.equal(secondSync.has_more, false);
    assert.equal(verify.stage, "verify_content");
    assert.ok(verify.stages_completed.includes("sync"));
    assert.ok(verify.stages_completed.includes("verify_content"));
    assert.equal(getAgentCenterState().productEntityIndexBatchRuns.length, 1);
    assert.equal(getAgentCenterState().productEntityIndexRecords.length, 2);
    assert.equal(
      getAgentCenterState().productEntityIndexRecords.filter(
        (record) => record.pdp_content_status === "ready"
      ).length,
      1
    );
    assert.equal(service.summary().content_verification_pending, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("ProductEntity index batch runner uses safe priority Gemini micro-batches", async () => {
  resetAgentCenterState();
  const previousGrounding = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  const createdAt = new Date().toISOString();
  for (const record of [
    {
      id: "product_entity_index_sig_gemini_batch_priority",
      product_entity_id: "sig_gemini_batch_priority",
      canonical_url: "https://agent.pivota.cc/products/sig_gemini_batch_priority",
      external_seed_id: "ext_gemini_batch_priority",
      product_name: "The Ordinary Multi-Peptide Lash and Brow Serum",
      brand: "The Ordinary",
      category: "Serum",
    },
    {
      id: "product_entity_index_sig_gemini_batch_skin1004",
      product_entity_id: "sig_gemini_batch_skin1004",
      canonical_url: "https://agent.pivota.cc/products/sig_gemini_batch_skin1004",
      external_seed_id: "ext_gemini_batch_skin1004",
      product_name: "Centella Ampoule",
      brand: "SKIN1004",
      category: "Ampoule",
    },
    {
      id: "product_entity_index_sig_gemini_batch_cosrx",
      product_entity_id: "sig_gemini_batch_cosrx",
      canonical_url: "https://agent.pivota.cc/products/sig_gemini_batch_cosrx",
      external_seed_id: "ext_gemini_batch_cosrx",
      product_name: "Aloe Soothing Sun Cream SPF50+ PA+++",
      brand: "COSRX",
      category: "Sunscreen",
    },
    {
      id: "product_entity_index_sig_gemini_batch_other",
      product_entity_id: "sig_gemini_batch_other",
      canonical_url: "https://agent.pivota.cc/products/sig_gemini_batch_other",
      external_seed_id: "ext_gemini_batch_other",
      product_name: "Everyday Body Lotion",
      brand: "Other Brand",
      category: "Body Care",
    },
  ]) {
    getAgentCenterRepository().upsert("productEntityIndexRecords", {
      ...record,
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: createdAt,
      updated_at: createdAt,
    });
  }

  try {
    const run = await new ProductEntityIndexRegistryService().runBatch({
      stage: "gemini_rerun",
      gemini_limit: 5,
    });

    assert.equal(run.status, "completed");
    assert.equal(run.stage, "gemini_rerun");
    assert.equal(run.limits.gemini_limit, 3);
    assert.equal(run.limits.gemini_strategy, "priority");
    assert.equal(run.records_processed, 3);
    assert.equal(run.last_result?.records_tested, 3);
    assert.equal(run.result_summary?.search_grounded_pending, 1);
    assert.equal(
      getAgentCenterState().productEntityIndexRecords.filter(
        (record) => record.gemini_search_grounded_status !== "not_tested"
      ).length,
      3
    );
  } finally {
    if (previousGrounding === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previousGrounding;
  }
});

test("ProductEntity index batch audit only processes unaudited ready records", async () => {
  resetAgentCenterState();
  const service = new ProductEntityIndexRegistryService();
  const createdAt = new Date().toISOString();
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_batchaudit_ready",
    product_entity_id: "sig_batchaudit_ready",
    canonical_url: "https://agent.pivota.cc/products/sig_batchaudit_ready",
    external_seed_id: verifiedExternalSeedId,
    external_seed_ids: [verifiedExternalSeedId],
    product_name: "Batch Audit Ready Product",
    brand: "Batch Audit Brand",
    pdp_content_status: "ready",
    indexability_status: "not_audited",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: [],
    created_at: createdAt,
    updated_at: createdAt,
  });
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_batchaudit_done",
    product_entity_id: "sig_batchaudit_done",
    canonical_url: "https://agent.pivota.cc/products/sig_batchaudit_done",
    external_seed_id: "ext_batchaudit_done",
    external_seed_ids: ["ext_batchaudit_done"],
    product_name: "Batch Audit Done Product",
    brand: "Batch Audit Brand",
    pdp_content_status: "ready",
    indexability_status: "ready",
    sitemap_eligible: true,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    last_indexability_audit_at: createdAt,
    failure_reasons: [],
    created_at: createdAt,
    updated_at: createdAt,
  });

  await withMockPivotaIndexabilityFetch(
    {
      sitemap:
        "<?xml version=\"1.0\"?><sitemapindex><sitemap><loc>https://agent.pivota.cc/sitemap-products.xml</loc></sitemap></sitemapindex>",
      productSitemap:
        "<?xml version=\"1.0\"?><urlset><url><loc>https://agent.pivota.cc/products/sig_batchaudit_ready</loc></url></urlset>",
      html: indexabilityHtml({
        title: "Batch Audit Brand Batch Audit Ready Product",
        h1: "Batch Audit Brand Batch Audit Ready Product",
        canonical: "https://agent.pivota.cc/products/sig_batchaudit_ready",
        productName: "Batch Audit Ready Product",
        brand: "Batch Audit Brand",
        productObjectId: "sig_batchaudit_ready",
        productJsonLd: productJsonLd({
          name: "Batch Audit Ready Product",
          brand: { "@type": "Brand", name: "Batch Audit Brand" },
          url: "https://agent.pivota.cc/products/sig_batchaudit_ready",
        }),
        offerJsonLd: offerJsonLd({
          url: "https://agent.pivota.cc/products/sig_batchaudit_ready",
        }),
      }),
    },
    async () => {
      const run = await service.runBatch({ stage: "audit", audit_limit: 10 });
      const audited = service.get("sig_batchaudit_ready");
      const alreadyAudited = service.get("sig_batchaudit_done");

      assert.equal(run.stage, "audit");
      assert.equal(run.last_result.records_audited, 1);
      assert.equal(audited.indexability_status, "ready");
      assert.equal(audited.sitemap_eligible, true);
      assert.deepEqual(
        audited.failure_reasons.filter(
          (reason) => reason !== "audit:missing_sitemap_entry"
        ),
        []
      );
      assert.ok(audited.last_indexability_audit_at);
      assert.equal(alreadyAudited.last_indexability_audit_at, createdAt);
    }
  );
});

test("ProductEntity index registry audit skips no-content records by default", async () => {
  resetAgentCenterState();
  const service = new ProductEntityIndexRegistryService();
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_auditready",
    product_entity_id: "sig_auditready",
    canonical_url: "https://agent.pivota.cc/products/sig_auditready",
    external_seed_id: "ext_auditready",
    external_seed_ids: ["ext_auditready"],
    product_name: "Audit Ready Product",
    brand: "Audit Brand",
    pdp_content_status: "ready",
    indexability_status: "not_audited",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_auditempty",
    product_entity_id: "sig_auditempty",
    canonical_url: "https://agent.pivota.cc/products/sig_auditempty",
    external_seed_id: "ext_auditempty",
    external_seed_ids: ["ext_auditempty"],
    product_name: "Audit Empty Product",
    brand: "Audit Brand",
    pdp_content_status: "no_content",
    indexability_status: "not_audited",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await withMockPivotaIndexabilityFetch(
    {
      html: indexabilityHtml({
        url: "https://agent.pivota.cc/products/sig_auditready",
        productName: "Audit Ready Product",
        brand: "Audit Brand",
      }),
      sitemap:
        "<?xml version=\"1.0\"?><urlset><url><loc>https://agent.pivota.cc/products/sig_auditready</loc></url></urlset>",
    },
    async () => {
      const result = await service.audit({ limit: 10 });

      assert.equal(result.records_audited, 1);
      assert.equal(result.records[0].product_entity_id, "sig_auditready");
      assert.equal(
        getAgentCenterState().productEntityIndexRecords.find(
          (record) => record.product_entity_id === "sig_auditempty"
        )?.indexability_status,
        "not_audited"
      );
    }
  );
});

test("ProductEntity index public API returns only sitemap-eligible canonical records", async () => {
  resetAgentCenterState();
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_publicready",
    product_entity_id: "sig_publicready",
    canonical_url: "https://agent.pivota.cc/products/sig_publicready",
    external_seed_id: "ext_public_ready",
    product_name: "Public Ready Product",
    brand: "Ready Brand",
    pdp_content_status: "ready",
    indexability_status: "ready",
    sitemap_eligible: true,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_publicempty",
    product_entity_id: "sig_publicempty",
    external_seed_id: "ext_public_empty",
    canonical_url: "https://agent.pivota.cc/products/sig_publicempty",
    product_name: "Public Empty Product",
    pdp_content_status: "no_content",
    indexability_status: "not_audited",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: ["no_content"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  getAgentCenterRepository().upsert("productEntityIndexRecords", {
    id: "product_entity_index_sig_publicresolver",
    product_entity_id: "sig_publicresolver",
    external_seed_id: "ext_public_resolver",
    external_seed_ids: ["ext_public_resolver"],
    canonical_url: "https://agent.pivota.cc/products/sig_publicresolver",
    product_name: "Public Resolver Product",
    brand: "Resolver Brand",
    pdp_content_status: "ready",
    indexability_status: "needs_work",
    sitemap_eligible: false,
    google_index_status: "unknown",
    gemini_search_grounded_status: "not_tested",
    failure_reasons: ["audit:rendered_identity_mismatch"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const response = await handleAgentCenterRequest(
    new NextRequest("https://example.test/api/agent-center/product-entity-index/public"),
    { path: ["product-entity-index", "public"] }
  );
  const payload = await response.json();
  const urls = payload.product_entity_index_records.map((record) => record.canonical_url);

  assert.deepEqual(urls, ["https://agent.pivota.cc/products/sig_publicready"]);
  assert.equal(urls.some((url) => url.includes("/products/ext_")), false);

  const sitemapResponse = await handleAgentCenterRequest(
    new NextRequest("https://example.test/api/agent-center/product-entity-index/public?shape=sitemap"),
    { path: ["product-entity-index", "public"] }
  );
  const sitemapPayload = await sitemapResponse.json();

  assert.deepEqual(sitemapPayload.product_entity_sitemap_entries, [
    {
      id: "sig_publicready",
      canonicalUrl: "https://agent.pivota.cc/products/sig_publicready",
      productName: "Public Ready Product",
      updatedAt: sitemapPayload.product_entity_sitemap_entries[0].updatedAt,
      externalSeedId: "ext_public_ready",
    },
  ]);
  assert.equal(
    sitemapPayload.product_entity_sitemap_entries.some((record) =>
      record.canonicalUrl.includes("/products/ext_")
    ),
    false
  );

  const resolverResponse = await handleAgentCenterRequest(
    new NextRequest(
      "https://example.test/api/agent-center/product-entity-index/public?shape=resolver&product_entity_id=sig_publicresolver"
    ),
    { path: ["product-entity-index", "public"] }
  );
  const resolverPayload = await resolverResponse.json();
  assert.deepEqual(
    resolverPayload.product_entity_resolver_records.map((record) => record.external_seed_id),
    ["ext_public_resolver"]
  );

  const emptyResolverResponse = await handleAgentCenterRequest(
    new NextRequest(
      "https://example.test/api/agent-center/product-entity-index/public?shape=resolver&external_seed_id=ext_public_empty"
    ),
    { path: ["product-entity-index", "public"] }
  );
  const emptyResolverPayload = await emptyResolverResponse.json();
  assert.deepEqual(emptyResolverPayload.product_entity_resolver_records, []);
});

test("ProductEntity index priority rerun plan selects canonical eligible high-priority PDPs", async () => {
  resetAgentCenterState();
  const now = new Date().toISOString();
  const records = [
    {
      id: "product_entity_index_sig_priority",
      product_entity_id: "sig_priority",
      canonical_url: "https://agent.pivota.cc/products/sig_priority",
      external_seed_id: "ext_priority",
      product_name: "The Ordinary Multi-Peptide Lash and Brow Serum",
      brand: "The Ordinary",
      category: "Serum",
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "indexed",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    },
    {
      id: "product_entity_index_sig_lower",
      product_entity_id: "sig_lower",
      canonical_url: "https://agent.pivota.cc/products/sig_lower",
      external_seed_id: "ext_lower",
      product_name: "Everyday Body Lotion",
      brand: "Other Brand",
      category: "Body Care",
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    },
    {
      id: "product_entity_index_sig_notfound",
      product_entity_id: "sig_notfound",
      canonical_url: "https://agent.pivota.cc/products/sig_notfound",
      external_seed_id: "ext_notfound",
      product_name: "COSRX Snail Mucin Essence",
      brand: "COSRX",
      category: "Essence",
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_found",
      last_search_grounded_score: 0,
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    },
    {
      id: "product_entity_index_sig_noneligible",
      product_entity_id: "sig_noneligible",
      canonical_url: "https://agent.pivota.cc/products/sig_noneligible",
      external_seed_id: "ext_noneligible",
      product_name: "SKIN1004 Centella Cleanser",
      brand: "SKIN1004",
      category: "Cleanser",
      pdp_content_status: "weak_content",
      indexability_status: "needs_work",
      sitemap_eligible: false,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: ["weak_content"],
      created_at: now,
      updated_at: now,
    },
  ];
  for (const record of records) {
    getAgentCenterRepository().upsert("productEntityIndexRecords", record);
  }

  const service = new ProductEntityIndexRegistryService();
  const plan = service.prioritySearchGroundedPlan({ limit: 5 });

  assert.equal(plan.strategy, "priority_search_grounded_product_discovery");
  assert.equal(plan.total_sitemap_eligible, 3);
  assert.deepEqual(
    plan.records.map((record) => record.product_entity_id),
    ["sig_priority", "sig_lower"]
  );
  assert.ok(plan.records[0].priority_reasons.includes("priority_brand"));
  assert.equal(plan.records.some((record) => record.product_entity_id === "sig_noneligible"), false);
  assert.equal(plan.records.some((record) => record.product_entity_id === "sig_notfound"), false);
  assert.equal(plan.uplift_claim_allowed, false);

  const includeNotFound = service.prioritySearchGroundedPlan({
    limit: 5,
    include_not_found: true,
  });
  assert.ok(
    includeNotFound.records.some((record) => record.product_entity_id === "sig_notfound")
  );
});

test("ProductEntity duplicate merge audit flags variant groups without mutating state", async () => {
  resetAgentCenterState();
  const now = new Date().toISOString();
  for (const record of [
    {
      id: "product_entity_index_sig_dup_30ml",
      product_entity_id: "sig_dup_30ml",
      canonical_url: "https://agent.pivota.cc/products/sig_dup_30ml",
      external_seed_id: "ext_dup_30ml",
      product_name: "Glow Brand Centella Ampoule 30ml",
      brand: "Glow Brand",
      category: "Ampoule",
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    },
    {
      id: "product_entity_index_sig_dup_50ml",
      product_entity_id: "sig_dup_50ml",
      canonical_url: "https://agent.pivota.cc/products/sig_dup_50ml",
      external_seed_id: "ext_dup_50ml",
      external_seed_ids: ["ext_dup_50ml", "ext_dup_alias"],
      product_name: "Glow Brand Centella Ampoule 50ml",
      brand: "Glow Brand",
      category: "Ampoule",
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    },
    {
      id: "product_entity_index_sig_unique",
      product_entity_id: "sig_unique",
      canonical_url: "https://agent.pivota.cc/products/sig_unique",
      external_seed_id: "ext_unique",
      product_name: "Unrelated Cleanser",
      brand: "Other Brand",
      category: "Cleanser",
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    },
  ]) {
    getAgentCenterRepository().upsert("productEntityIndexRecords", record);
  }

  const audit = new ProductEntityIndexRegistryService().duplicateMergeAudit({
    limit: 10,
    min_group_size: 2,
  });

  assert.equal(audit.audit_type, "product_entity_duplicate_offer_merge_audit");
  assert.equal(audit.mutation_performed, false);
  assert.equal(audit.duplicate_group_count, 1);
  assert.equal(audit.groups[0].product_entity_count, 2);
  assert.equal(audit.groups[0].variant_like, true);
  assert.equal(audit.groups[0].duplicate_kind, "variant_family");
  assert.equal(
    audit.groups[0].recommended_action,
    "create_product_entity_family_with_sku_variant_map"
  );
  assert.equal(audit.groups[0].merge_allowed_without_review, false);
  assert.equal(audit.groups[0].auto_apply_allowed, false);
  assert.match(audit.groups[0].offer_merge_policy.summary, /Do not merge offers blindly/);
  assert.ok(
    audit.groups[0].risk_flags.includes("offer_merge_requires_sku_variant_map")
  );
  assert.equal(
    audit.groups[0].sku_variant_map_review_plan.family_product_name,
    "glow brand centella ampoule"
  );
  assert.deepEqual(
    audit.groups[0].sku_variant_map_review_plan.variants.map(
      (variant) => variant.variant_label
    ),
    ["30ml", "50ml"]
  );
  assert.deepEqual(
    getAgentCenterState().productEntityIndexRecords.map((record) => record.product_entity_id).sort(),
    ["sig_dup_30ml", "sig_dup_50ml", "sig_unique"]
  );
});

test("ProductEntity duplicate merge audit supports brand-filtered Fenty variant review", async () => {
  resetAgentCenterState();
  const now = new Date().toISOString();
  for (const record of [
    {
      id: "product_entity_index_sig_fenty_120",
      product_entity_id: "sig_fenty_120",
      canonical_url: "https://agent.pivota.cc/products/sig_fenty_120",
      external_seed_id: "ext_fenty_120",
      product_name: "Fenty Beauty Pro Filt'r Soft Matte Longwear Foundation #120",
      brand: "Fenty Beauty",
      category: "Foundation",
    },
    {
      id: "product_entity_index_sig_fenty_130",
      product_entity_id: "sig_fenty_130",
      canonical_url: "https://agent.pivota.cc/products/sig_fenty_130",
      external_seed_id: "ext_fenty_130",
      product_name: "Fenty Beauty Pro Filt'r Soft Matte Longwear Foundation #130",
      brand: "Fenty Beauty",
      category: "Foundation",
    },
    {
      id: "product_entity_index_sig_fenty_140",
      product_entity_id: "sig_fenty_140",
      canonical_url: "https://agent.pivota.cc/products/sig_fenty_140",
      external_seed_id: "ext_fenty_140",
      product_name: "Fenty Beauty Pro Filt'r Soft Matte Longwear Foundation #140",
      brand: "Fenty Beauty",
      category: "Foundation",
    },
    {
      id: "product_entity_index_sig_other_120",
      product_entity_id: "sig_other_120",
      canonical_url: "https://agent.pivota.cc/products/sig_other_120",
      external_seed_id: "ext_other_120",
      product_name: "Other Brand Pro Filt'r Soft Matte Longwear Foundation #120",
      brand: "Other Brand",
      category: "Foundation",
    },
  ]) {
    getAgentCenterRepository().upsert("productEntityIndexRecords", {
      ...record,
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    });
  }

  const audit = new ProductEntityIndexRegistryService().duplicateMergeAudit({
    limit: 10,
    min_group_size: 2,
    brand_filter: ["Fenty Beauty"],
  });

  assert.deepEqual(audit.brand_filter, ["fenty beauty"]);
  assert.equal(audit.records_considered, 3);
  assert.equal(audit.duplicate_group_count, 1);
  const group = audit.groups[0];
  assert.equal(group.duplicate_kind, "variant_family");
  assert.equal(group.product_entity_count, 3);
  assert.equal(group.sku_variant_map_review_plan.variant_count, 3);
  assert.deepEqual(
    group.sku_variant_map_review_plan.variants.map((variant) => variant.variant_label),
    ["#120", "#130", "#140"]
  );
  assert.equal(group.merge_allowed_without_review, false);
  assert.equal(group.auto_apply_allowed, false);
  assert.equal(audit.mutation_performed, false);
});

test("ProductEntity variant review plan persists SKU variant map proposal without merging", async () => {
  resetAgentCenterState();
  const now = new Date().toISOString();
  for (const record of [
    {
      id: "product_entity_index_sig_fenty_plan_100",
      product_entity_id: "sig_fenty_plan_100",
      canonical_url: "https://agent.pivota.cc/products/sig_fenty_plan_100",
      external_seed_id: "ext_fenty_plan_100",
      product_name: "Fenty Beauty Pro Filt'r Instant Retouch Concealer #100",
      brand: "Fenty Beauty",
      category: "Concealer",
    },
    {
      id: "product_entity_index_sig_fenty_plan_110",
      product_entity_id: "sig_fenty_plan_110",
      canonical_url: "https://agent.pivota.cc/products/sig_fenty_plan_110",
      external_seed_id: "ext_fenty_plan_110",
      product_name: "Fenty Beauty Pro Filt'r Instant Retouch Concealer #110",
      brand: "Fenty Beauty",
      category: "Concealer",
    },
  ]) {
    getAgentCenterRepository().upsert("productEntityIndexRecords", {
      ...record,
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    });
  }

  const service = new ProductEntityIndexRegistryService();
  const result = service.createVariantReviewPlan({
    brand_filter: ["Fenty Beauty"],
    reviewer: "pivota_ops",
    review_notes: "Review Fenty concealer shade family before offer attachment.",
  });
  const plan = result.variant_review_plan;

  assert.equal(plan.plan_type, "product_entity_variant_family_review");
  assert.equal(plan.status, "proposed");
  assert.equal(plan.brand, "Fenty Beauty");
  assert.equal(plan.product_entity_count, 2);
  assert.deepEqual(plan.source_product_entity_ids.sort(), [
    "sig_fenty_plan_100",
    "sig_fenty_plan_110",
  ]);
  assert.deepEqual(
    (plan.sku_variant_map_review_plan.variants || []).map(
      (variant) => variant.variant_label
    ),
    ["#100", "#110"]
  );
  assert.equal(plan.merge_allowed_without_review, false);
  assert.equal(plan.auto_apply_allowed, false);
  assert.equal(plan.mutation_performed, false);
  assert.equal(getAgentCenterState().productEntityVariantReviewPlans.length, 1);
  assert.equal(getAgentCenterState().productEntityIndexRecords.length, 2);

  const plans = service.listVariantReviewPlans({ brand_filter: ["Fenty Beauty"] });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].reviewer, "pivota_ops");

  const decisionResult = service.decideVariantReviewPlan({
    plan_id: plan.id,
    reviewer: "pivota_ops",
    review_notes: "Strict human review approved unique shade map.",
  });
  const decidedPlan = decisionResult.variant_review_plan;
  assert.equal(decidedPlan.status, "approved_for_mapping");
  assert.equal(decidedPlan.review_decision.decision_status, "approved_for_mapping");
  assert.equal(
    decidedPlan.review_decision.canonical_family.product_entity_granularity,
    "family"
  );
  assert.equal(
    decidedPlan.review_decision.sku_variant_map_rules.variant_axis,
    "shade"
  );
  assert.equal(
    decidedPlan.review_decision.merchant_offer_attachment_rules.attach_to,
    "canonical_product_entity_plus_exact_sku_variant"
  );
  assert.equal(decidedPlan.review_decision.mutation_performed, false);
  assert.equal(getAgentCenterState().productEntityIndexRecords.length, 2);
});

test("internal ProductEntity index route exposes priority plan and duplicate audit", async () => {
  resetAgentCenterState();
  const previousEnabled = process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
  const previousSecret = process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET;
  process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION = "true";
  process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET = "index-secret";
  const now = new Date().toISOString();
  for (const record of [
    {
      id: "product_entity_index_sig_route_priority",
      product_entity_id: "sig_route_priority",
      canonical_url: "https://agent.pivota.cc/products/sig_route_priority",
      external_seed_id: "ext_route_priority",
      product_name: "Anua Heartleaf Toner",
      brand: "Anua",
      category: "Toner",
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    },
    {
      id: "product_entity_index_sig_route_dup_a",
      product_entity_id: "sig_route_dup_a",
      canonical_url: "https://agent.pivota.cc/products/sig_route_dup_a",
      external_seed_id: "ext_route_dup_a",
      product_name: "Route Brand Hydrating Serum 30ml",
      brand: "Route Brand",
      category: "Serum",
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    },
    {
      id: "product_entity_index_sig_route_dup_b",
      product_entity_id: "sig_route_dup_b",
      canonical_url: "https://agent.pivota.cc/products/sig_route_dup_b",
      external_seed_id: "ext_route_dup_b",
      product_name: "Route Brand Hydrating Serum 50ml",
      brand: "Route Brand",
      category: "Serum",
      pdp_content_status: "ready",
      indexability_status: "ready",
      sitemap_eligible: true,
      google_index_status: "unknown",
      gemini_search_grounded_status: "not_tested",
      failure_reasons: [],
      created_at: now,
      updated_at: now,
    },
  ]) {
    getAgentCenterRepository().upsert("productEntityIndexRecords", record);
  }

  try {
    const planResponse = await handleInternalProductEntityIndexRequest(
      new NextRequest(
        "https://example.test/api/internal/agent-center/product-entity-index/priority-rerun-plan",
        {
          method: "POST",
          headers: {
            authorization: "Bearer index-secret",
            "content-type": "application/json",
          },
          body: JSON.stringify({ limit: 2 }),
        }
      ),
      { action: "priority-rerun-plan" }
    );
    const planPayload = await planResponse.json();
    assert.equal(planResponse.status, 201);
    assert.equal(
      planPayload.product_entity_index_priority_rerun_plan.records[0].product_entity_id,
      "sig_route_priority"
    );

    const auditResponse = await handleInternalProductEntityIndexRequest(
      new NextRequest(
        "https://example.test/api/internal/agent-center/product-entity-index/duplicate-merge-audit?min_group_size=2",
        {
          method: "GET",
          headers: { authorization: "Bearer index-secret" },
        }
      ),
      { action: "duplicate-merge-audit" }
    );
    const auditPayload = await auditResponse.json();
    assert.equal(auditResponse.status, 200);
    assert.equal(
      auditPayload.product_entity_duplicate_merge_audit.groups[0].recommended_action,
      "create_product_entity_family_with_sku_variant_map"
    );
    assert.equal(
      auditPayload.product_entity_duplicate_merge_audit.mutation_performed,
      false
    );

    const variantPlanResponse = await handleInternalProductEntityIndexRequest(
      new NextRequest(
        "https://example.test/api/internal/agent-center/product-entity-index/variant-review-plan",
        {
          method: "POST",
          headers: {
            authorization: "Bearer index-secret",
            "content-type": "application/json",
          },
          body: JSON.stringify({ brand_filter: ["Route Brand"] }),
        }
      ),
      { action: "variant-review-plan" }
    );
    const variantPlanPayload = await variantPlanResponse.json();
    assert.equal(variantPlanResponse.status, 201);
    assert.equal(
      variantPlanPayload.product_entity_variant_review_plan.variant_review_plan.plan_type,
      "product_entity_variant_family_review"
    );
    assert.equal(
      variantPlanPayload.product_entity_variant_review_plan.variant_review_plan.mutation_performed,
      false
    );

    const decisionResponse = await handleInternalProductEntityIndexRequest(
      new NextRequest(
        "https://example.test/api/internal/agent-center/product-entity-index/variant-review-decision",
        {
          method: "POST",
          headers: {
            authorization: "Bearer index-secret",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            plan_id:
              variantPlanPayload.product_entity_variant_review_plan.variant_review_plan.id,
            reviewer: "pivota_ops",
          }),
        }
      ),
      { action: "variant-review-decision" }
    );
    const decisionPayload = await decisionResponse.json();
    assert.equal(decisionResponse.status, 201);
    assert.equal(
      decisionPayload.product_entity_variant_review_decision.variant_review_plan.status,
      "approved_for_mapping"
    );
    assert.equal(
      decisionPayload.product_entity_variant_review_decision.variant_review_plan
        .review_decision.mutation_performed,
      false
    );

    const listResponse = await handleInternalProductEntityIndexRequest(
      new NextRequest(
        "https://example.test/api/internal/agent-center/product-entity-index/variant-review-plans?brand_filter=Route%20Brand",
        {
          method: "GET",
          headers: { authorization: "Bearer index-secret" },
        }
      ),
      { action: "variant-review-plans" }
    );
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.product_entity_variant_review_plans.length, 1);
  } finally {
    if (previousEnabled === undefined) delete process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
    else process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION = previousEnabled;
    if (previousSecret === undefined) delete process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET;
    else process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET = previousSecret;
  }
});

test("internal ProductEntity index route is gated and exposes sync action", async () => {
  resetAgentCenterState();
  const previousEnabled = process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
  process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION = "false";
  try {
    const disabled = await handleInternalProductEntityIndexRequest(
      new NextRequest("https://example.test/api/internal/agent-center/product-entity-index/summary"),
      { action: "summary" }
    );
    assert.equal(disabled.status, 403);
  } finally {
    if (previousEnabled === undefined) delete process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
    else process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION = previousEnabled;
  }
});

test("internal ProductEntity index route creates persisted batch runs", async () => {
  resetAgentCenterState();
  const previousEnabled = process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
  const previousSecret = process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET;
  const originalFetch = global.fetch;
  process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION = "true";
  process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET = "index-secret";
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.operation, "get_discovery_feed");
    return {
      ok: true,
      json: async () => ({
        products: [
          {
            product_id: "ext_route_batch",
            sellable_item_group_id: "sig_routebatch",
            title: "Route Batch Product",
            brand: { name: "Route Brand" },
          },
        ],
        has_more: false,
      }),
    };
  };

  try {
    const response = await handleInternalProductEntityIndexRequest(
      new NextRequest(
        "https://example.test/api/internal/agent-center/product-entity-index/run-batch",
        {
          method: "POST",
          headers: {
            authorization: "Bearer index-secret",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            stage: "sync",
            sync_limit: 1,
            page_size: 1,
            max_pages: 1,
          }),
        }
      ),
      { action: "run-batch" }
    );
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.product_entity_index_batch_run.stage, "sync");
    assert.equal(payload.product_entity_index_batch_run.status, "completed");
    assert.equal(getAgentCenterState().productEntityIndexBatchRuns.length, 1);
    assert.equal(
      getAgentCenterState().productEntityIndexRecords[0].product_entity_id,
      "sig_routebatch"
    );
  } finally {
    global.fetch = originalFetch;
    if (previousEnabled === undefined) delete process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
    else process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION = previousEnabled;
    if (previousSecret === undefined) delete process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET;
    else process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET = previousSecret;
  }
});

test("canonical ProductEntity PDP passes binding audit with source seed and merchant offer", async () => {
  const audit = await withMockPivotaIndexabilityFetch(
    {
      sitemap: `<?xml version="1.0"?><urlset><url><loc>${canonicalIndexablePivotaUrl}</loc></url></urlset>`,
      html: indexabilityHtml({
        canonical: canonicalIndexablePivotaUrl,
        productObjectId: "pe_isntree_watery_sun_gel",
        productJsonLd: productJsonLd({ url: canonicalIndexablePivotaUrl }),
        offerJsonLd: offerJsonLd({ url: canonicalIndexablePivotaUrl }),
      }),
    },
    () =>
      new PivotaPDPIndexabilityAuditService().audit({
        url: canonicalIndexablePivotaUrl,
        product_name: indexabilityProductName,
        brand: "Isntree",
        merchant_pdp_url: indexabilityMerchantUrl,
        offers_exist: true,
        product_entity_id: "pe_isntree_watery_sun_gel",
        external_seed_id: verifiedExternalSeedId,
        merchant_offer_id: verifiedPivotaOfferId,
      })
  );

  assert.equal(audit.audit_status, "passed");
  assert.deepEqual(audit.findings, []);
  assert.equal(audit.raw_safe_evidence.expected_product_entity_id, "pe_isntree_watery_sun_gel");
  assert.equal(audit.raw_safe_evidence.source_reference_external_seed_present, true);
  assert.equal(audit.raw_safe_evidence.source_reference_merchant_pdp_present, true);
  assert.equal(audit.raw_safe_evidence.merchant_offer_attached, true);
});

test("external seed alias canonicalizes to ProductEntity PDP without becoming canonical", async () => {
  const audit = await withMockPivotaIndexabilityFetch(
    {
      sitemap: `<?xml version="1.0"?><urlset><url><loc>${canonicalIndexablePivotaUrl}</loc></url></urlset>`,
      html: indexabilityHtml({
        canonical: canonicalIndexablePivotaUrl,
        productObjectId: "pe_isntree_watery_sun_gel",
        productJsonLd: productJsonLd({ url: canonicalIndexablePivotaUrl }),
      }),
    },
    () =>
      new PivotaPDPIndexabilityAuditService().audit({
        url: indexablePivotaUrl,
        product_name: indexabilityProductName,
        brand: "Isntree",
        merchant_pdp_url: indexabilityMerchantUrl,
        offers_exist: true,
        product_entity_id: "pe_isntree_watery_sun_gel",
        external_seed_id: verifiedExternalSeedId,
      })
  );

  assert.equal(audit.audit_status, "passed");
  assert.equal(audit.raw_safe_evidence.external_seed_alias_detected, true);
  assert.equal(audit.raw_safe_evidence.external_seed_used_as_canonical, false);
  assert.equal(
    audit.findings.some((finding) => finding.finding_type === "external_seed_used_as_canonical"),
    false
  );
});

test("external seed used as canonical triggers ProductEntity warning", async () => {
  const audit = await withMockPivotaIndexabilityFetch(
    {
      html: indexabilityHtml({
        canonical: indexablePivotaUrl,
        productJsonLd: productJsonLd({ url: indexablePivotaUrl }),
      }),
    },
    () =>
      new PivotaPDPIndexabilityAuditService().audit({
        url: indexablePivotaUrl,
        product_name: indexabilityProductName,
        brand: "Isntree",
        merchant_pdp_url: indexabilityMerchantUrl,
        offers_exist: true,
        product_entity_id: "pe_isntree_watery_sun_gel",
        external_seed_id: verifiedExternalSeedId,
      })
  );
  const findingTypes = audit.findings.map((finding) => finding.finding_type);

  assert.equal(audit.raw_safe_evidence.external_seed_used_as_canonical, true);
  assert.ok(findingTypes.includes("external_seed_used_as_canonical"));
  assert.ok(findingTypes.includes("canonical_url_points_to_external_seed"));
});

test("merchant offer attached to wrong ProductEntity triggers binding finding", async () => {
  const audit = await withMockPivotaIndexabilityFetch(
    {
      sitemap: `<?xml version="1.0"?><urlset><url><loc>${canonicalIndexablePivotaUrl}</loc></url></urlset>`,
      html: indexabilityHtml({
        canonical: canonicalIndexablePivotaUrl,
        productObjectId: "pe_isntree_watery_sun_gel",
        productJsonLd: productJsonLd({ url: canonicalIndexablePivotaUrl }),
        offerJsonLd: offerJsonLd({ identifier: "offer_other_product" }),
      }),
    },
    () =>
      new PivotaPDPIndexabilityAuditService().audit({
        url: canonicalIndexablePivotaUrl,
        product_name: indexabilityProductName,
        brand: "Isntree",
        merchant_pdp_url: indexabilityMerchantUrl,
        offers_exist: true,
        product_entity_id: "pe_isntree_watery_sun_gel",
        external_seed_id: verifiedExternalSeedId,
        merchant_offer_id: verifiedPivotaOfferId,
      })
  );

  assert.ok(
    audit.findings.some((finding) => finding.finding_type === "offer_attached_to_wrong_product_entity")
  );
  assert.ok(
    audit.findings.some((finding) => finding.finding_type === "product_entity_missing_merchant_offer")
  );
});

test("Pivota PDP indexability audit maps missing JSON-LD to schema patches", async () => {
  const audit = await runPivotaIndexabilityAudit({
    html: indexabilityHtml({ productJsonLd: false, offerJsonLd: false }),
  });
  const findingTypes = audit.findings.map((finding) => finding.finding_type);

  assert.equal(audit.audit_status, "needs_work");
  assert.ok(findingTypes.includes("missing_product_jsonld"));
  assert.ok(findingTypes.includes("missing_offer_jsonld"));
  assert.ok(audit.recommended_fixes.includes("pivota_product_schema_patch"));
  assert.ok(audit.recommended_fixes.includes("pivota_offer_schema_patch"));
});

test("Pivota PDP indexability audit detects noindex robots meta", async () => {
  const audit = await runPivotaIndexabilityAudit({
    html: indexabilityHtml({ metaRobots: "noindex, nofollow" }),
  });

  assert.equal(audit.audit_status, "failed");
  assert.ok(audit.findings.some((finding) => finding.finding_type === "noindex"));
  assert.ok(audit.recommended_fixes.includes("pivota_indexability_patch"));
});

test("Pivota PDP indexability audit detects canonical mismatch", async () => {
  const audit = await runPivotaIndexabilityAudit({
    html: indexabilityHtml({
      canonical: "https://agent.pivota.cc/products/different_product",
    }),
  });

  assert.equal(audit.audit_status, "needs_work");
  assert.ok(
    audit.findings.some((finding) => finding.finding_type === "canonical_mismatch")
  );
  assert.ok(audit.recommended_fixes.includes("pivota_indexability_patch"));
});

test("Pivota PDP indexability audit accepts clean canonical for return-param PDP URL", async () => {
  const audit = await withMockPivotaIndexabilityFetch({}, () =>
    new PivotaPDPIndexabilityAuditService().audit({
      url: `${indexablePivotaUrl}?return=%2Fproducts%2Fext_related`,
      product_name: indexabilityProductName,
      brand: "Isntree",
      merchant_pdp_url: indexabilityMerchantUrl,
      offers_exist: true,
    })
  );

  assert.equal(audit.audit_status, "passed");
  assert.equal(
    audit.findings.some((finding) => finding.finding_type === "canonical_mismatch"),
    false
  );
});

test("pilot ProductEntity provisioning creates ProductEntity from merchant-approved metadata", async () => {
  resetAgentCenterState();
  const run = await withMockPivotaIndexabilityFetch({}, () =>
    new PilotProductEntityProvisioningService().create({
      merchant_id: "merchant_isntree",
      merchant_name: "Isntree Official",
      store_url: "https://www.isntree.com",
      merchant_pdp_url: indexabilityMerchantUrl,
      product_name: indexabilityProductName,
      brand: "Isntree",
      sku_name: "isntree_watery_sun_gel_50ml",
      category: "Skincare > Sunscreen",
      market: "US",
      language: "en",
      currency: "USD",
      merchant_product_attributes: {
        spf: "SPF50+",
        pa_rating: "PA++++",
      },
    })
  );
  const product = getAgentCenterState()
    .stores.flatMap((store) => store.products || [])
    .find((item) => item.product_entity_id === run.product_entity_id);

  assert.equal(run.status, "product_entity_created");
  assert.equal(run.product_entity_id, "pe_isntree_hyaluronic_acid_watery_sun_gel_spf50_pa_50ml");
  assert.equal(
    run.canonical_pivota_pdp_url,
    "https://agent.pivota.cc/products/isntree-hyaluronic-acid-watery-sun-gel-spf50-pa-50ml"
  );
  assert.ok(
    run.source_references.some(
      (source) =>
        source.source_type === "official_merchant_pdp" &&
        source.source_url === indexabilityMerchantUrl
    )
  );
  assert.ok(
    run.source_references.some(
      (source) => source.source_type === "manual_pilot_mapping"
    )
  );
  assert.equal(product?.canonical_url, run.canonical_pivota_pdp_url);
  assert.equal(JSON.stringify(product).includes("Pivota product intelligence summary"), false);
});

test("pilot ProductEntity provisioning binds merchant PDP as official source reference", async () => {
  resetAgentCenterState();
  const run = await withMockPivotaIndexabilityFetch({}, () =>
    new PilotProductEntityProvisioningService().create({
      merchant_id: "merchant_isntree",
      merchant_name: "Isntree Official",
      store_url: "https://www.isntree.com",
      merchant_pdp_url: indexabilityMerchantUrl,
      product_name: indexabilityProductName,
      brand: "Isntree",
      category: "Skincare > Sunscreen",
      market: "US",
      language: "en",
      currency: "USD",
      source_external_seed_id: verifiedExternalSeedId,
    })
  );

  assert.deepEqual(run.external_seed_ids, [verifiedExternalSeedId]);
  assert.ok(
    run.source_references.some(
      (source) =>
        source.source_type === "external_seed" &&
        source.source_id === verifiedExternalSeedId &&
        source.maps_to_product_entity_id === run.product_entity_id
    )
  );
  assert.ok(
    run.source_references.some(
      (source) =>
        source.source_type === "official_merchant_pdp" &&
        source.confidence === "merchant_approved"
    )
  );
});

test("pilot ProductEntity provisioning rejects external seed mapped to wrong product", async () => {
  resetAgentCenterState();
  const store = getAgentCenterState().stores[0];
  store.products.push({
    id: "wrong_seed_product",
    product_entity_id: "pe_wrong_product",
    external_seed_id: verifiedExternalSeedId,
    external_seed_ids: [verifiedExternalSeedId],
    sku: "wrong_sku",
    title: "Multi-Peptide Lash and Brow Serum",
    brand: "the ordinary",
    category: "Serum",
    currency: "USD",
    pdp_url: "https://theordinary.com/en-us/multi-peptide-lash-brow-serum-100111.html",
    attributes: {},
    pivota_attributes: {},
  });

  const run = await withMockPivotaIndexabilityFetch({}, () =>
    new PilotProductEntityProvisioningService().create({
      merchant_id: "merchant_isntree",
      merchant_name: "Isntree Official",
      store_url: "https://www.isntree.com",
      merchant_pdp_url: indexabilityMerchantUrl,
      product_name: indexabilityProductName,
      brand: "Isntree",
      category: "Skincare > Sunscreen",
      market: "US",
      language: "en",
      currency: "USD",
      source_external_seed_id: verifiedExternalSeedId,
    })
  );

  assert.equal(run.status, "failed");
  assert.match(run.failure_reason, /different product/);
});

test("pilot ProductEntity provisioning rejects mismatched existing ProductEntity", async () => {
  resetAgentCenterState();
  const run = await withMockPivotaIndexabilityFetch({}, () =>
    new PilotProductEntityProvisioningService().create({
      merchant_id: "merchant_isntree",
      merchant_name: "Isntree Official",
      store_url: "https://www.isntree.com",
      merchant_pdp_url: indexabilityMerchantUrl,
      product_name: indexabilityProductName,
      brand: "Isntree",
      category: "Skincare > Sunscreen",
      market: "US",
      language: "en",
      currency: "USD",
      existing_product_entity_id: "pe_vitamin_c_serum",
    })
  );

  assert.equal(run.status, "failed");
  assert.match(run.failure_reason, /different product|not found/);
});

test("pilot ProductEntity provisioning publishes and audits canonical PDP only when binding passes", async () => {
  resetAgentCenterState();
  const service = new PilotProductEntityProvisioningService();
  const run = await withMockPivotaIndexabilityFetch(
    {
      sitemap: `<?xml version="1.0"?><urlset><url><loc>${canonicalIndexablePivotaUrl}</loc></url></urlset>`,
      html: indexabilityHtml({
        canonical: canonicalIndexablePivotaUrl,
        productObjectId: "pe_isntree_watery_sun_gel",
        productJsonLd: productJsonLd({ url: canonicalIndexablePivotaUrl }),
        offerJsonLd: offerJsonLd({ url: canonicalIndexablePivotaUrl }),
      }),
    },
    () =>
      service.create({
        merchant_id: "merchant_isntree",
        merchant_name: "Isntree Official",
        store_url: "https://www.isntree.com",
        merchant_pdp_url: indexabilityMerchantUrl,
        product_name: indexabilityProductName,
        brand: "Isntree",
        category: "Skincare > Sunscreen",
        market: "US",
        language: "en",
        currency: "USD",
        source_external_seed_id: verifiedExternalSeedId,
        existing_product_entity_id: undefined,
        merchant_offer_input: {
          id: verifiedPivotaOfferId,
          price: 18.99,
          currency: "USD",
        },
      })
  );
  run.product_entity_id = "pe_isntree_watery_sun_gel";
  run.canonical_product_slug = undefined;
  run.canonical_pivota_pdp_url = canonicalIndexablePivotaUrl;

  const published = await withMockPivotaIndexabilityFetch(
    {
      sitemap: `<?xml version="1.0"?><urlset><url><loc>${canonicalIndexablePivotaUrl}</loc></url></urlset>`,
      html: indexabilityHtml({
        canonical: canonicalIndexablePivotaUrl,
        productObjectId: "pe_isntree_watery_sun_gel",
        productJsonLd: productJsonLd({ url: canonicalIndexablePivotaUrl }),
        offerJsonLd: offerJsonLd({ url: canonicalIndexablePivotaUrl }),
      }),
    },
    () => service.publish(run.id)
  );

  assert.equal(published.status, "published");
  assert.equal(published.binding_audit.audit_status, "passed");
  const audited = await withMockPivotaIndexabilityFetch(
    {
      sitemap: `<?xml version="1.0"?><urlset><url><loc>${canonicalIndexablePivotaUrl}</loc></url></urlset>`,
      html: indexabilityHtml({
        canonical: canonicalIndexablePivotaUrl,
        productObjectId: "pe_isntree_watery_sun_gel",
        productJsonLd: productJsonLd({ url: canonicalIndexablePivotaUrl }),
        offerJsonLd: offerJsonLd({ url: canonicalIndexablePivotaUrl }),
      }),
    },
    () => service.audit(run.id)
  );
  assert.equal(audited.status, "audit_passed");
  assert.equal(audited.binding_audit.audit_status, "passed");
  assert.equal(audited.binding_audit.raw_safe_evidence.external_seed_used_as_canonical, false);
});

test("pilot ProductEntity provisioning API is internal-gated and production validation can use canonical URL", async () => {
  resetAgentCenterState();
  process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION = "true";
  process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET = "pilot-secret";

  const denied = await handleAgentCenterRequest(
    new NextRequest("https://example.test/api/agent-center/internal-pilot-product-entities", {
      method: "POST",
    }),
    { path: ["internal-pilot-product-entities"] }
  );
  assert.equal(denied.status, 403);

  const created = await withMockPivotaIndexabilityFetch({}, () =>
    handleAgentCenterRequest(
      new NextRequest("https://example.test/api/agent-center/internal-pilot-product-entities", {
        method: "POST",
        headers: {
          authorization: "Bearer pilot-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          merchant_id: "merchant_isntree",
          merchant_name: "Isntree Official",
          store_url: "https://www.isntree.com",
          merchant_pdp_url: indexabilityMerchantUrl,
          product_name: indexabilityProductName,
          brand: "Isntree",
          category: "Skincare > Sunscreen",
          market: "US",
          language: "en",
          currency: "USD",
        }),
      }),
      { path: ["internal-pilot-product-entities"] }
    )
  );
  const payload = await created.json();
  const validationRun = new ProductionValidationRunService().create({
    merchant_name: "Isntree Official",
    store_url: "https://www.isntree.com",
    merchant_pdp_url: indexabilityMerchantUrl,
    product_name: indexabilityProductName,
    brand: "Isntree",
    market: "US",
    language: "en",
    currency: "USD",
    pivota_pdp_url: payload.run.canonical_pivota_pdp_url,
    pivota_product_entity_id: payload.run.product_entity_id,
    canonical_product_slug: payload.run.canonical_product_slug,
    canonical_pivota_pdp_url: payload.run.canonical_pivota_pdp_url,
  });

  assert.equal(created.status, 201);
  assert.equal(payload.run.status, "product_entity_created");
  assert.equal(validationRun.pivota_pdp_url, payload.run.canonical_pivota_pdp_url);
  assert.equal(validationRun.pivota_product_entity_id, payload.run.product_entity_id);
});

test("Pivota PDP indexability audit detects missing source reference", async () => {
  const audit = await runPivotaIndexabilityAudit({
    html: indexabilityHtml({ sourceReference: false }),
  });

  assert.equal(audit.audit_status, "needs_work");
  assert.ok(
    audit.findings.some((finding) => finding.finding_type === "missing_source_reference")
  );
  assert.ok(audit.recommended_fixes.includes("pivota_source_reference_patch"));
});

test("Pivota PDP indexability audit detects missing sitemap entry", async () => {
  const audit = await runPivotaIndexabilityAudit({
    sitemap: "<?xml version=\"1.0\"?><urlset></urlset>",
  });

  assert.equal(audit.audit_status, "needs_work");
  assert.ok(
    audit.findings.some((finding) => finding.finding_type === "missing_sitemap_entry")
  );
  assert.ok(audit.recommended_fixes.includes("pivota_sitemap_submission"));
});

test("Pivota PDP indexability audit detects thin server-rendered content", async () => {
  const audit = await runPivotaIndexabilityAudit({
    html: indexabilityHtml({
      description: false,
      productJsonLd: productJsonLd({ description: "" }),
    }),
  });

  assert.equal(audit.audit_status, "needs_work");
  assert.ok(audit.findings.some((finding) => finding.finding_type === "thin_content"));
  assert.ok(audit.recommended_fixes.includes("pivota_product_intelligence_patch"));
});

test("Pivota PDP indexability audit detects robots block and auth wall", async () => {
  const audit = await runPivotaIndexabilityAudit({
    robots: "User-agent: *\nDisallow: /products/",
    html: indexabilityHtml({
      title: "Login required",
      h1: "Sign in to preview this product",
      description: false,
    }),
  });

  assert.equal(audit.audit_status, "failed");
  assert.ok(audit.findings.some((finding) => finding.finding_type === "robots_blocked"));
  assert.ok(
    audit.findings.some((finding) => finding.finding_type === "auth_wall_detected")
  );
  assert.ok(audit.recommended_fixes.includes("pivota_indexability_patch"));
});

test("internal Pivota PDP indexability audit route is gated and returns safe output", async () => {
  resetAgentCenterState();
  const blocked = await handleAgentCenterRequest(
    new NextRequest(
      `${indexablePivotaUrl.replace("https://agent.pivota.cc/products/", "https://example.test/api/agent-center/internal-pivota-pdp-indexability-audit?url=https://agent.pivota.cc/products/")}`
    ),
    { path: ["internal-pivota-pdp-indexability-audit"] }
  );
  assert.equal(blocked.status, 403);

  await withInternalProductionValidationEnv(async () => {
    await withMockPivotaIndexabilityFetch({}, async () => {
      const response = await handleAgentCenterRequest(
        internalProductionValidationRequest(
          `https://example.test/api/agent-center/internal-pivota-pdp-indexability-audit?url=${encodeURIComponent(indexablePivotaUrl)}&product_name=${encodeURIComponent(indexabilityProductName)}&brand=Isntree&merchant_pdp_url=${encodeURIComponent(indexabilityMerchantUrl)}&offers_exist=true`
        ),
        { path: ["internal-pivota-pdp-indexability-audit"] }
      );
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.audit.audit_status, "passed");
      assert.equal(JSON.stringify(payload).includes("validation-secret"), false);
      assert.equal(JSON.stringify(payload).includes("<html"), false);
    });
  });
});

test("Gemini parser fallback preserves grounding URLs when grounded text is not JSON", () => {
  const { store, target } = createConnectedTarget();
  target.scan_mode = "search_grounded_product_discovery_test";
  const cluster = new QueryClusterService().generateForScanTarget(target.id)[0];
  const product = store.products[0];
  const input = {
    ...demandInput(store, target, cluster, product),
    scanMode: "search_grounded_product_discovery_test",
  };
  const raw = {
    provider: "gemini",
    model: DEFAULT_GEMINI_MODEL,
    raw_output: "The official product page appears in the grounded sources.",
    normalized_output: {
      grounding_sources: [product.pdp_url],
      grounding_search_queries: [`${product.brand} ${product.title}`],
    },
    input_tokens: 12,
    output_tokens: 18,
    tool_calls: 1,
    provider_request_id: "grounding_fallback_test",
  };

  const parsed = parseProviderOutput(raw, input);

  assert.equal(parsed.schema_valid, false);
  assert.ok(parsed.validation_errors.includes("raw_output_json_invalid"));
  assert.ok(parsed.grounding_sources.includes(product.pdp_url));
  assert.ok(parsed.returned_urls.includes(product.pdp_url));
  assert.equal(parsed.merchant_pdp_url_exact_match, true);
  assert.equal(parsed.discovery_type, "search_grounded");
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

test("organic discovery passes when the merchant product is naturally returned", () => {
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Naturally surfaced as a hydrating daily Korean sunscreen.",
      },
    ],
    competitor_products: [],
    returned_urls: [],
    missing_attributes_identified: [],
    reasoning_summary: "Organic category discovery returned the Isntree product.",
  };
  const result = scoreAttributionFixture({
    scanMode: "organic_product_discovery_test",
    output,
  });

  assert.equal(result.score.aggregate_scores.organic_product_discovery_score, 100);
  assert.equal(result.score.aggregate_scores.organic_brand_discovery_score, 100);
  assert.equal(result.score.aggregate_scores.competitor_dominance_score, 0);
  assert.equal(
    result.issues.some((issue) => issue.issue_type === "organic_product_not_discovered"),
    false
  );
});

test("organic discovery creates competitor dominance issue when only competitors return", () => {
  const output = {
    mentioned_brands: ["Beauty of Joseon", "COSRX"],
    mentioned_products: [
      {
        name: "Relief Sun: Rice + Probiotics SPF50+ PA++++",
        brand: "Beauty of Joseon",
        rank: 1,
        reason: "Competitor sunscreen dominates the organic answer.",
      },
    ],
    competitor_products: ["Beauty of Joseon Relief Sun: Rice + Probiotics SPF50+ PA++++"],
    returned_urls: [],
    missing_attributes_identified: [],
    reasoning_summary: "Organic category discovery returned only competitor products.",
  };
  const result = scoreAttributionFixture({
    scanMode: "organic_product_discovery_test",
    output,
  });

  assert.equal(result.score.aggregate_scores.organic_product_discovery_score, 0);
  assert.equal(result.score.aggregate_scores.competitor_dominance_score, 100);
  assert.ok(
    result.issues.some((issue) => issue.issue_type === "competitor_dominance"),
    "expected competitor_dominance issue"
  );
});

test("search-grounded product discovery passes when merchant PDP URL is returned", () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const merchantPdpUrl =
      "https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml";
    const output = {
      mentioned_brands: ["Isntree"],
      mentioned_products: [
        {
          name: "Isntree Hyaluronic Acid Watery Sun Gel",
          brand: "Isntree",
          rank: 1,
          reason: "Search result returned the official merchant PDP.",
          product_url: merchantPdpUrl,
        },
      ],
      returned_urls: [merchantPdpUrl],
      grounding_sources: [merchantPdpUrl],
      missing_attributes_identified: [],
      reasoning_summary: "Search-grounded discovery returned the official PDP.",
    };
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output,
    });

    assert.equal(
      result.score.aggregate_scores.search_grounded_merchant_pdp_discovery_score,
      100
    );
    assert.equal(result.score.aggregate_scores.url_match_accuracy_score, 100);
    assert.equal(result.parsed[0].merchant_pdp_url_exact_match, true);
    assert.equal(
      result.issues.some((issue) => issue.issue_type === "merchant_pdp_not_discovered"),
      false
    );
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("grounded merchant PDP URL passes merchant PDP discovery", () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const merchantPdpUrl =
      "https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml";
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Grounding returned the official merchant PDP.",
          },
        ],
        grounding_sources: [merchantPdpUrl],
        grounding_search_queries: ["Isntree Hyaluronic Acid Watery Sun Gel"],
        missing_attributes_identified: [],
        reasoning_summary: "Grounding metadata supplied the merchant PDP URL.",
      },
    });

    assert.equal(
      result.score.aggregate_scores.search_grounded_merchant_pdp_discovery_score,
      100
    );
    assert.equal(result.parsed[0].merchant_pdp_url_exact_match, true);
    assert.equal(result.parsed[0].discovery_type, "search_grounded");
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("search-grounded product discovery flags wrong buying path URL", () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const output = {
      mentioned_brands: ["Isntree"],
      mentioned_products: [
        {
          name: "Isntree Hyaluronic Acid Watery Sun Gel",
          brand: "Isntree",
          rank: 1,
          reason: "Search result returned a marketplace page instead of expected paths.",
          product_url: "https://example-marketplace.com/isntree-watery-sun-gel",
        },
      ],
      returned_urls: ["https://example-marketplace.com/isntree-watery-sun-gel"],
      missing_attributes_identified: [],
      reasoning_summary: "The returned URL does not match merchant or Pivota PDP.",
    };
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output,
    });

    assert.equal(result.score.aggregate_scores.url_match_accuracy_score, 0);
    assert.ok(
      result.issues.some((issue) => issue.issue_type === "wrong_buying_path_returned"),
      "expected wrong_buying_path_returned issue"
    );
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("discovery report score-state mapping treats numeric zero as tested not found", () => {
  assert.equal(mapDiscoveryScoreToReportStatus(100), "found");
  assert.equal(mapDiscoveryScoreToReportStatus(1), "found");
  assert.equal(mapDiscoveryScoreToReportStatus(0), "not_found");
  assert.equal(mapDiscoveryScoreToReportStatus("not_configured"), "not_configured");
  assert.equal(mapDiscoveryScoreToReportStatus("not_tested"), "not_tested");
  assert.equal(mapDiscoveryScoreToReportStatus(null), "not_tested");
  assert.equal(mapDiscoveryScoreToReportStatus(undefined), "not_tested");
});

test("merchant PDP discoverability audit produces concrete schema, canonical, and copy findings", () => {
  const audit = auditMerchantPDPDiscoverability({
    merchant_pdp_url: "https://isntree.example/products/watery-sun-gel",
    expected_merchant_pdp_url: "https://isntree.example/products/watery-sun-gel",
    product_name: "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
    brand: "Isntree",
    sku: "50ml",
    category: "skincare sunscreen",
    returned_urls: [],
    issue_types: ["merchant_pdp_not_discovered"],
    preflight_status: "passed",
    preflight_status_code: 200,
    signals: {
      canonical_url: "https://isntree.example/products/old-sun-gel",
      title: "Daily sunscreen",
      h1: "Hydrating sunscreen",
      product_jsonld_present: false,
      offer_jsonld_present: false,
      price_present: false,
      availability_present: false,
      seller_present: false,
      sitemap_included: false,
    },
  });

  const findingTypes = audit.findings.map((finding) => finding.finding_type);
  assert.ok(findingTypes.includes("missing_product_schema"));
  assert.ok(findingTypes.includes("missing_offer_schema"));
  assert.ok(findingTypes.includes("canonical_gap"));
  assert.ok(findingTypes.includes("thin_content_gap"));
  assert.ok(findingTypes.includes("missing_price_or_availability_signal"));
  assert.ok(findingTypes.includes("missing_seller_signal"));
  assert.ok(findingTypes.includes("sitemap_gap"));
  assert.ok(audit.recommended_action_types.includes("merchant_product_schema_patch"));
  assert.ok(audit.recommended_action_types.includes("merchant_offer_schema_patch"));
  assert.ok(audit.recommended_action_types.includes("merchant_canonical_url_patch"));
  assert.ok(audit.recommended_action_types.includes("merchant_pdp_copy_patch"));
});

test("Pivota PDP discoverability audit produces source reference and product intelligence findings", () => {
  const audit = auditPivotaPDPDiscoverability({
    pivota_pdp_url: verifiedPivotaPdpUrl,
    expected_pivota_pdp_url: verifiedPivotaPdpUrl,
    product_name: "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
    brand: "Isntree",
    returned_urls: [],
    issue_types: ["pivota_pdp_not_discovered"],
    preflight_status: "passed",
    preflight_status_code: 200,
    signals: {
      title: "Pivota Product",
      h1: "Product details",
      product_jsonld_present: false,
      offer_jsonld_present: false,
      source_reference_present: false,
      offer_source_url_present: false,
      product_intelligence_populated: false,
      similar_card_highlight_present: false,
      product_object_id_present: true,
    },
  });

  const findingTypes = audit.findings.map((finding) => finding.finding_type);
  assert.ok(findingTypes.includes("missing_source_reference"));
  assert.ok(findingTypes.includes("pivota_product_intelligence_gap"));
  assert.ok(findingTypes.includes("similar_card_missing_highlight"));
  assert.ok(findingTypes.includes("missing_product_schema"));
  assert.ok(findingTypes.includes("missing_offer_schema"));
  assert.ok(audit.recommended_action_types.includes("pivota_source_reference_patch"));
  assert.ok(audit.recommended_action_types.includes("pivota_product_intelligence_patch"));
});

test("wrong buying path discoverability audit recommends URL analysis and canonical fixes", () => {
  const audit = auditMerchantPDPDiscoverability({
    merchant_pdp_url: "https://isntree.example/products/watery-sun-gel",
    expected_merchant_pdp_url: "https://isntree.example/products/watery-sun-gel",
    product_name: "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
    brand: "Isntree",
    returned_urls: ["https://marketplace.example/isntree-watery-sun-gel"],
    issue_types: ["wrong_buying_path_returned"],
    preflight_status: "passed",
    preflight_status_code: 200,
  });

  assert.ok(
    audit.findings.some((finding) => finding.finding_type === "wrong_url_returned")
  );
  assert.ok(audit.recommended_action_types.includes("wrong_url_analysis"));
  assert.ok(audit.recommended_action_types.includes("canonical_buying_path_patch"));
});

test("grounded merchant domain with wrong PDP URL creates partial discovery failure", () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const wrongSameDomainUrl =
      "https://isntree-global.com/blog/hyaluronic-acid-watery-sun-gel-review";
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Grounding returned the merchant domain but not the PDP.",
          },
        ],
        grounding_sources: [wrongSameDomainUrl],
        missing_attributes_identified: [],
        reasoning_summary: "The source is on the merchant domain but is not the PDP.",
      },
    });

    assert.equal(result.parsed[0].merchant_domain_found, true);
    assert.equal(result.parsed[0].merchant_pdp_url_exact_match, false);
    assert.equal(
      result.score.aggregate_scores.search_grounded_merchant_pdp_discovery_score,
      0
    );
    assert.ok(
      result.issues.some((issue) => issue.issue_type === "merchant_pdp_not_discovered")
    );
    assert.ok(
      result.issues.some((issue) => issue.issue_type === "wrong_buying_path_returned")
    );
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("buying-path discovery passes when Pivota PDP URL is returned", () => {
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Pivota PDP appeared as an agent-facing buying path.",
        product_url: verifiedPivotaPdpUrl,
      },
    ],
    returned_urls: [verifiedPivotaPdpUrl],
    buying_path_present: true,
    offer_signal_present: true,
    price_signal_present: true,
    availability_signal_present: true,
    missing_attributes_identified: [],
    reasoning_summary: "Buying-path discovery returned the Pivota PDP URL.",
  };
  const result = scoreAttributionFixture({
    scanMode: "buying_path_discovery_test",
    output,
  });

  assert.equal(
    result.score.aggregate_scores.search_grounded_pivota_pdp_discovery_score,
    100
  );
  assert.equal(result.score.aggregate_scores.buying_path_discovery_score, 100);
  assert.equal(result.score.aggregate_scores.offer_discovery_score, 100);
  assert.equal(result.parsed[0].pivota_pdp_url_exact_match, true);
});

test("grounded Pivota PDP URL passes Pivota discovery", () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Grounding returned the Pivota PDP.",
          },
        ],
        grounding_sources: [verifiedPivotaPdpUrl],
        missing_attributes_identified: [],
        reasoning_summary: "Grounding metadata supplied the Pivota PDP URL.",
      },
    });

    assert.equal(
      result.score.aggregate_scores.search_grounded_pivota_pdp_discovery_score,
      100
    );
    assert.equal(result.parsed[0].pivota_pdp_url_exact_match, true);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("returned Pivota alias URL counts only when mapped to expected ProductEntity", () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const aliasResult = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Grounding returned an external seed alias mapped to the ProductEntity.",
          },
        ],
        returned_urls: [verifiedPivotaPdpUrl],
        missing_attributes_identified: [],
      },
    });
    const unrelatedResult = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Grounding returned an unrelated Pivota external seed URL.",
          },
        ],
        returned_urls: ["https://agent.pivota.cc/products/ext_unrelated_product"],
        missing_attributes_identified: [],
      },
    });

    assert.equal(
      aliasResult.score.aggregate_scores.search_grounded_pivota_pdp_discovery_score,
      100
    );
    assert.equal(aliasResult.parsed[0].pivota_pdp_url_exact_match, true);
    assert.equal(
      unrelatedResult.score.aggregate_scores.search_grounded_pivota_pdp_discovery_score,
      0
    );
    assert.equal(unrelatedResult.parsed[0].pivota_pdp_url_exact_match, false);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("canonical ProductEntity PDP URL counts for Pivota discovery", () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Grounding returned the canonical ProductEntity PDP.",
          },
        ],
        returned_urls: [canonicalPivotaProductEntityUrl],
        missing_attributes_identified: [],
      },
    });

    assert.equal(
      result.score.aggregate_scores.search_grounded_pivota_pdp_discovery_score,
      100
    );
    assert.equal(result.parsed[0].pivota_pdp_url_exact_match, true);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("search-grounded discovery marks not_configured instead of contextual fallback", () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  try {
    const merchantPdpUrl =
      "https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml";
    const output = {
      mentioned_brands: ["Isntree"],
      mentioned_products: [
        {
          name: "Isntree Hyaluronic Acid Watery Sun Gel",
          brand: "Isntree",
          rank: 1,
          reason: "Even if URL is present, grounding is not configured.",
          product_url: merchantPdpUrl,
        },
      ],
      returned_urls: [merchantPdpUrl],
      missing_attributes_identified: [],
      reasoning_summary: "Search grounding disabled fixture.",
    };
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output,
    });

    assert.equal(
      result.score.aggregate_scores.search_grounded_merchant_pdp_discovery_score,
      "not_configured"
    );
    assert.equal(result.score.aggregate_scores.url_match_accuracy_score, "not_configured");
    assert.ok(
      result.issues.some((issue) => issue.issue_type === "search_grounding_not_configured"),
      "expected search_grounding_not_configured issue"
    );
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("contextual attribution tests do not populate discovery scores", () => {
  const output = {
    mentioned_brands: ["Isntree"],
    mentioned_products: [
      {
        name: "Isntree Hyaluronic Acid Watery Sun Gel",
        brand: "Isntree",
        rank: 1,
        reason: "Merchant PDP supports this contextual attribution test.",
        product_url:
          "https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml",
      },
    ],
    merchant_store_mentioned: true,
    merchant_pdp_url_present: true,
    merchant_pdp_url:
      "https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml",
    channel_attribution: "merchant_store_attributed",
    missing_attributes_identified: [],
    reasoning_summary: "Contextual attribution passed but is not natural discovery.",
  };
  const result = scoreAttributionFixture({
    scanMode: "merchant_store_attribution_test",
    output,
  });

  assert.equal(result.score.aggregate_scores.merchant_store_visibility_score, 100);
  assert.equal(result.score.aggregate_scores.organic_product_discovery_score, "not_tested");
  assert.equal(
    result.score.aggregate_scores.search_grounded_merchant_pdp_discovery_score,
    "not_tested"
  );
  assert.equal(result.score.aggregate_scores.buying_path_discovery_score, "not_tested");
});

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
    assert.equal(preflight.verified_url, canonicalPivotaProductEntityUrl);
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

test("offer execution diagnosis detects missing Pivota offer", () => {
  const fixture = createOfferExecutionFixture({ pivotaOfferPatch: null });
  const diagnosis = new OfferExecutionService().runDiagnosis(fixture.issue.id);
  const updatedIssue = getAgentCenterState().issues.find(
    (item) => item.id === fixture.issue.id
  );
  const usageEvent = getAgentCenterState().usageEvents.find(
    (event) => event.id === diagnosis.usage_event_ids[0]
  );

  assert.ok(offerFindingTypes(diagnosis).includes("missing_offer"));
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_offer_layer"));
  assert.ok(
    diagnosis.patch_recommendations.some(
      (patch) => patch.patch_type === "pivota_offer_patch"
    )
  );
  assert.equal(updatedIssue.offer_execution_diagnosis_id, diagnosis.id);
  assert.equal(updatedIssue.status, "diagnosed");
  assert.equal(usageEvent.event_type, "offer_verification_credit");
  assert.equal(usageEvent.agent_type, "offer_execution_agent");
  assert.equal(usageEvent.workflow_type, "offer_readiness");
  assert.equal(usageEvent.billing_mode, "preview_only");
  assert.equal(usageEvent.billing_status, "not_invoiced");
});

test("offer execution diagnosis detects price mismatch", () => {
  const fixture = createOfferExecutionFixture({
    pivotaOfferPatch: { price: 21.99 },
  });
  const diagnosis = new OfferExecutionService().runDiagnosis(fixture.issue.id);
  const finding = diagnosis.offer_layer_findings[0].findings.find(
    (item) => item.finding_type === "price_mismatch"
  );
  const pivotaPatch = diagnosis.patch_recommendations.find(
    (patch) => patch.patch_type === "pivota_offer_patch"
  );

  assert.ok(finding, "expected price_mismatch");
  assert.ok(
    diagnosis.refined_fix_targets.includes("pivota_offer_layer") ||
      diagnosis.refined_fix_targets.includes("both_merchant_and_pivota")
  );
  assert.equal(pivotaPatch.patch.price, 18.99);
  assert.equal(pivotaPatch.patch.currency, "USD");
});

test("offer execution diagnosis detects expired coupon and promo mismatch", () => {
  const fixture = createOfferExecutionFixture({
    merchantOfferPatch: {
      promo_price: 16.99,
      coupon_code: "SUN10",
      coupon_status: "expired",
      expires_at: "2026-04-01T00:00:00.000Z",
    },
    pivotaOfferPatch: {
      promo_price: 16.99,
      coupon_code: "SUN10",
      coupon_status: "active",
    },
  });
  const diagnosis = new OfferExecutionService().runDiagnosis(fixture.issue.id);
  const promoPatch = diagnosis.patch_recommendations.find(
    (patch) => patch.patch_type === "promo_state_patch"
  );

  assert.ok(offerFindingTypes(diagnosis).includes("expired_coupon"));
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_offer_layer"));
  assert.ok(diagnosis.refined_fix_targets.includes("merchant_promo_source"));
  assert.equal(promoPatch.patch.coupon_status, "expired");
  assert.equal(promoPatch.patch.coupon_code, "SUN10");
});

test("offer execution diagnosis detects inventory mismatch", () => {
  const fixture = createOfferExecutionFixture({
    merchantOfferPatch: {
      inventory_status: "out_of_stock",
      inventory_quantity: 0,
    },
    pivotaOfferPatch: {
      inventory_status: "in_stock",
    },
  });
  const diagnosis = new OfferExecutionService().runDiagnosis(fixture.issue.id);
  const inventoryPatch = diagnosis.patch_recommendations.find(
    (patch) => patch.patch_type === "inventory_sync_patch"
  );

  assert.ok(offerFindingTypes(diagnosis).includes("inventory_mismatch"));
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_offer_layer"));
  assert.ok(diagnosis.refined_fix_targets.includes("merchant_inventory_source"));
  assert.equal(inventoryPatch.patch.source_inventory_status, "out_of_stock");
  assert.equal(inventoryPatch.patch.source_inventory_quantity, 0);
});

test("offer execution diagnosis detects wrong SKU or variant attachment", () => {
  const fixture = createOfferExecutionFixture({
    pivotaOfferPatch: {
      sku_id: "ISNTREE-PU-WATERY-SUN-GEL-SPF50-PA4-50ML-2PACK",
      attached_to_pivota_pdp: true,
    },
  });
  const diagnosis = new OfferExecutionService().runDiagnosis(fixture.issue.id);
  const attachmentPatch = diagnosis.patch_recommendations.find(
    (patch) => patch.patch_type === "offer_attachment_patch"
  );

  assert.ok(offerFindingTypes(diagnosis).includes("offer_sku_variant_mismatch"));
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_product_graph"));
  assert.equal(attachmentPatch.target, "pivota_product_graph");
  assert.equal(attachmentPatch.patch.expected_sku_id, fixture.product.sku);
  assert.equal(
    attachmentPatch.patch.current_pivota_sku_id,
    "ISNTREE-PU-WATERY-SUN-GEL-SPF50-PA4-50ML-2PACK"
  );
});

test("offer execution diagnosis treats clean offer as high readiness without a new offer issue", () => {
  const fixture = createOfferExecutionFixture();
  const issueCountBefore = getAgentCenterState().issues.length;
  const diagnosis = new OfferExecutionService().runDiagnosis(fixture.issue.id);
  const updatedIssue = getAgentCenterState().issues.find(
    (item) => item.id === fixture.issue.id
  );

  assert.deepEqual(offerFindingTypes(diagnosis), ["clean_offer"]);
  assert.equal(diagnosis.offer_readiness_score, 100);
  assert.equal(diagnosis.confidence, "high");
  assert.equal(getAgentCenterState().issues.length, issueCountBefore);
  assert.equal(
    getAgentCenterState().issues.some(
      (item) => item.issue_type === "offer_execution_issue"
    ),
    false
  );
  assert.equal(updatedIssue.offer_execution_diagnosis_id, diagnosis.id);
});

test("offer execution usage events are idempotent across reruns and patch regeneration", () => {
  const fixture = createOfferExecutionFixture({ pivotaOfferPatch: null });
  const service = new OfferExecutionService();
  const first = service.runDiagnosis(fixture.issue.id);
  const usageCount = getAgentCenterState().usageEvents.length;
  const second = service.runDiagnosis(fixture.issue.id);
  const regenerated = service.regeneratePatch(fixture.issue.id);

  assert.equal(first.id, second.id);
  assert.notEqual(first.id, regenerated.id);
  assert.equal(getAgentCenterState().usageEvents.length, usageCount);
  assert.deepEqual(first.usage_event_ids, second.usage_event_ids);
  assert.deepEqual(first.usage_event_ids, regenerated.usage_event_ids);
  assert.ok(
    getAgentCenterState()
      .issues.find((item) => item.id === fixture.issue.id)
      .offer_execution_diagnosis_ids.includes(regenerated.id)
  );
});

test("offer execution API returns debug payload and can attach diagnosis to retest plan", async () => {
  const fixture = createOfferExecutionFixture({ pivotaOfferPatch: null });
  const created = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${fixture.issue.id}/offer-diagnosis`,
      { method: "POST" }
    ),
    { path: ["issues", fixture.issue.id, "offer-diagnosis"] }
  );
  const createdPayload = await created.json();
  const attached = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${fixture.issue.id}/attach-offer-diagnosis-to-retest`,
      { method: "POST" }
    ),
    { path: ["issues", fixture.issue.id, "attach-offer-diagnosis-to-retest"] }
  );
  const attachedPayload = await attached.json();
  const fetched = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${fixture.issue.id}/offer-diagnosis`
    ),
    { path: ["issues", fixture.issue.id, "offer-diagnosis"] }
  );
  const fetchedPayload = await fetched.json();

  assert.equal(created.status, 201);
  assert.equal(createdPayload.diagnosis.issue_id, fixture.issue.id);
  assert.equal(attached.status, 200);
  assert.equal(
    attachedPayload.issue.evidence.offer_execution_attached_to_retest_plan,
    attachedPayload.diagnosis.id
  );
  assert.match(
    attachedPayload.issue.verification_plan.target_improvement,
    /Offer Execution diagnosis/
  );
  assert.equal(fetched.status, 200);
  assert.equal(fetchedPayload.debug.source_issue_summary.issue_id, fixture.issue.id);
  assert.equal(fetchedPayload.debug.merchant_offer_source.id, fixture.merchantOffer.id);
  assert.equal(fetchedPayload.debug.pivota_offer_state, null);
  assert.deepEqual(
    fetchedPayload.debug.refined_fix_targets,
    fetchedPayload.diagnosis.refined_fix_targets
  );
  assert.ok(
    fetchedPayload.debug.usage_events.every(
      (event) =>
        event.billing_mode === "preview_only" &&
        event.billing_status === "not_invoiced"
    )
  );
});

test("checkout verification diagnosis treats clean path as high readiness without a new issue", () => {
  const fixture = createCheckoutVerificationFixture();
  const issueCountBefore = getAgentCenterState().issues.length;
  const diagnosis = new CheckoutVerificationService().runDiagnosis(fixture.issue.id);
  const usageEvent = getAgentCenterState().usageEvents.find(
    (event) => event.id === diagnosis.usage_event_ids[0]
  );

  assert.deepEqual(checkoutFindingTypes(diagnosis), ["clean_checkout_path"]);
  assert.equal(diagnosis.checkout_readiness_score, 100);
  assert.equal(diagnosis.confidence, "high");
  assert.equal(getAgentCenterState().issues.length, issueCountBefore);
  assert.equal(usageEvent.event_type, "checkout_verification_credit");
  assert.equal(usageEvent.agent_type, "checkout_verification_agent");
  assert.equal(usageEvent.workflow_type, "checkout_readiness");
  assert.equal(usageEvent.provider, "internal");
  assert.equal(usageEvent.model, "checkout-verification-deterministic-v1");
  assert.equal(usageEvent.billing_mode, "preview_only");
  assert.equal(usageEvent.billing_status, "not_invoiced");
});

test("checkout verification diagnosis detects missing checkout path", () => {
  const fixture = createCheckoutVerificationFixture({
    omitMerchantCheckout: true,
    omitPivotaCheckout: true,
  });
  const diagnosis = new CheckoutVerificationService().runDiagnosis(fixture.issue.id);
  const patch = diagnosis.patch_recommendations.find(
    (item) => item.patch_type === "merchant_checkout_patch"
  );

  assert.ok(checkoutFindingTypes(diagnosis).includes("missing_checkout_path"));
  assert.ok(diagnosis.refined_fix_targets.includes("merchant_checkout_source"));
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_checkout_layer"));
  assert.equal(patch.target, "merchant_checkout_source");
});

test("checkout verification diagnosis detects unreachable checkout URL", () => {
  const fixture = createCheckoutVerificationFixture({
    pivotaCheckoutPatch: {
      checkout_url: "https://checkout.isntree.example/unreachable/session",
    },
  });
  const diagnosis = new CheckoutVerificationService().runDiagnosis(fixture.issue.id);
  const comparison = diagnosis.checkout_layer_findings[0];
  const patch = diagnosis.patch_recommendations.find(
    (item) => item.patch_type === "pivota_checkout_patch"
  );

  assert.ok(checkoutFindingTypes(diagnosis).includes("checkout_url_unreachable"));
  assert.equal(comparison.checkout_url_preflight_status, "failed");
  assert.equal(comparison.checkout_url_status_code, 404);
  assert.equal(patch.target, "pivota_checkout_layer");
});

test("checkout verification diagnosis detects missing variant parameter", () => {
  const fixture = createCheckoutVerificationFixture({
    pivotaCheckoutPatch: {
      cart_handoff_payload: { quantity: 1 },
      variant_id: null,
    },
  });
  const diagnosis = new CheckoutVerificationService().runDiagnosis(fixture.issue.id);
  const patch = diagnosis.patch_recommendations.find(
    (item) => item.patch_type === "cart_handoff_payload_patch"
  );

  assert.ok(checkoutFindingTypes(diagnosis).includes("variant_param_missing"));
  assert.ok(diagnosis.refined_fix_targets.includes("merchant_cart_config"));
  assert.equal(patch.patch.expected_variant_id, fixture.product.sku);
});

test("checkout verification diagnosis detects missing coupon passthrough parameter", () => {
  const fixture = createCheckoutVerificationFixture({
    merchantOfferPatch: {
      promo_price: 16.99,
      coupon_code: "SUN10",
      coupon_status: "active",
    },
    pivotaOfferPatch: {
      promo_price: 16.99,
      coupon_code: "SUN10",
      coupon_status: "active",
    },
    pivotaCheckoutPatch: {
      cart_handoff_payload: {
        variant: "ISNTREE-PU-WATERY-SUN-GEL-SPF50-PA4-50ML",
        quantity: 1,
      },
      coupon_code: null,
    },
  });
  const diagnosis = new CheckoutVerificationService().runDiagnosis(fixture.issue.id);
  const patch = diagnosis.patch_recommendations.find(
    (item) => item.patch_type === "coupon_passthrough_patch"
  );

  assert.ok(checkoutFindingTypes(diagnosis).includes("coupon_param_missing"));
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_checkout_layer"));
  assert.ok(diagnosis.refined_fix_targets.includes("merchant_promo_source"));
  assert.equal(patch.patch.coupon_code, "SUN10");
});

test("checkout verification diagnosis detects stale checkout session", () => {
  const fixture = createCheckoutVerificationFixture({
    merchantCheckoutPatch: {
      expires_at: "2026-04-01T00:00:00.000Z",
    },
  });
  const diagnosis = new CheckoutVerificationService().runDiagnosis(fixture.issue.id);

  assert.ok(checkoutFindingTypes(diagnosis).includes("stale_checkout_session"));
  assert.ok(diagnosis.refined_fix_targets.includes("merchant_checkout_source"));
});

test("checkout verification diagnosis detects checkout domain mismatch", () => {
  const fixture = createCheckoutVerificationFixture({
    pivotaCheckoutPatch: {
      checkout_url: "https://checkout.other.example/checkout",
      checkout_domain: "checkout.other.example",
    },
  });
  const diagnosis = new CheckoutVerificationService().runDiagnosis(fixture.issue.id);
  const patch = diagnosis.patch_recommendations.find(
    (item) => item.patch_type === "checkout_domain_patch"
  );

  assert.ok(checkoutFindingTypes(diagnosis).includes("checkout_domain_mismatch"));
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_checkout_layer"));
  assert.equal(patch.patch.expected_checkout_domain, "checkout.isntree.example");
});

test("checkout verification diagnosis detects checkout not attached to offer", () => {
  const fixture = createCheckoutVerificationFixture({
    pivotaCheckoutPatch: {
      attached_to_pivota_offer: false,
    },
  });
  const diagnosis = new CheckoutVerificationService().runDiagnosis(fixture.issue.id);
  const patch = diagnosis.patch_recommendations.find(
    (item) => item.patch_type === "checkout_attachment_patch"
  );

  assert.ok(
    checkoutFindingTypes(diagnosis).includes(
      "checkout_not_attached_to_pivota_offer"
    )
  );
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_offer_layer"));
  assert.equal(patch.patch.attached_to_pivota_offer, true);
});

test("checkout verification usage events are idempotent across reruns and patch regeneration", () => {
  const fixture = createCheckoutVerificationFixture({
    pivotaCheckoutPatch: {
      cart_handoff_payload: { quantity: 1 },
      variant_id: null,
    },
  });
  const service = new CheckoutVerificationService();
  const first = service.runDiagnosis(fixture.issue.id);
  const usageCount = getAgentCenterState().usageEvents.length;
  const second = service.runDiagnosis(fixture.issue.id);
  const regenerated = service.regeneratePatch(fixture.issue.id);

  assert.equal(first.id, second.id);
  assert.notEqual(first.id, regenerated.id);
  assert.equal(getAgentCenterState().usageEvents.length, usageCount);
  assert.deepEqual(first.usage_event_ids, second.usage_event_ids);
  assert.deepEqual(first.usage_event_ids, regenerated.usage_event_ids);
  assert.ok(
    getAgentCenterState()
      .issues.find((item) => item.id === fixture.issue.id)
      .checkout_verification_diagnosis_ids.includes(regenerated.id)
  );
});

test("checkout verification API returns debug payload and can attach diagnosis to retest plan", async () => {
  const fixture = createCheckoutVerificationFixture({
    pivotaCheckoutPatch: {
      checkout_url: "https://checkout.isntree.example/unreachable/session",
    },
  });
  const created = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${fixture.issue.id}/checkout-diagnosis`,
      { method: "POST" }
    ),
    { path: ["issues", fixture.issue.id, "checkout-diagnosis"] }
  );
  const createdPayload = await created.json();
  const attached = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${fixture.issue.id}/attach-checkout-diagnosis-to-retest`,
      { method: "POST" }
    ),
    { path: ["issues", fixture.issue.id, "attach-checkout-diagnosis-to-retest"] }
  );
  const attachedPayload = await attached.json();
  const fetched = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${fixture.issue.id}/checkout-diagnosis`
    ),
    { path: ["issues", fixture.issue.id, "checkout-diagnosis"] }
  );
  const fetchedPayload = await fetched.json();

  assert.equal(created.status, 201);
  assert.equal(createdPayload.diagnosis.issue_id, fixture.issue.id);
  assert.equal(attached.status, 200);
  assert.equal(
    attachedPayload.issue.evidence.checkout_verification_attached_to_retest_plan,
    attachedPayload.diagnosis.id
  );
  assert.match(
    attachedPayload.issue.verification_plan.target_improvement,
    /Checkout Verification diagnosis/
  );
  assert.equal(fetched.status, 200);
  assert.equal(fetchedPayload.debug.source_issue_summary.issue_id, fixture.issue.id);
  assert.equal(
    fetchedPayload.debug.merchant_checkout_path.id,
    fixture.merchantCheckoutPath.id
  );
  assert.deepEqual(
    fetchedPayload.debug.refined_fix_targets,
    fetchedPayload.diagnosis.refined_fix_targets
  );
  assert.ok(
    fetchedPayload.debug.usage_events.every(
      (event) =>
        event.billing_mode === "preview_only" &&
        event.billing_status === "not_invoiced"
    )
  );
});

test("internal demo fixture route returns 403 when disabled", async () => {
  resetAgentCenterState();
  const originalEnabled = process.env.ENABLE_INTERNAL_DEMO_FIXTURES;
  const originalSecret = process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET;
  delete process.env.ENABLE_INTERNAL_DEMO_FIXTURES;
  process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET = "fixture-secret";
  try {
    const response = await handleInternalDemoFixturesRequest(
      internalFixtureRequest(
        "https://example.test/api/internal/agent-center/demo-fixtures",
        {
          method: "POST",
          body: JSON.stringify({ preset: "clean_offer" }),
        }
      )
    );
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.match(payload.error, /disabled/);
  } finally {
    if (originalEnabled === undefined) delete process.env.ENABLE_INTERNAL_DEMO_FIXTURES;
    else process.env.ENABLE_INTERNAL_DEMO_FIXTURES = originalEnabled;
    if (originalSecret === undefined) delete process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET;
    else process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET = originalSecret;
  }
});

test("internal demo fixture route creates tagged fixture records", async () => {
  resetAgentCenterState();
  await withInternalFixtureEnv(async () => {
    const response = await handleInternalDemoFixturesRequest(
      internalFixtureRequest(
        "https://example.test/api/internal/agent-center/demo-fixtures",
        {
          method: "POST",
          body: JSON.stringify({
            preset: "clean_offer",
            ttl_minutes: 30,
            environment: "production-smoke",
          }),
        }
      )
    );
    const payload = await response.json();
    const fixture = payload.demo_fixture.fixture;
    const store = payload.demo_fixture.store;
    const product = payload.demo_fixture.product;
    const issue = payload.demo_fixture.issue;

    assert.equal(response.status, 201);
    assert.equal(fixture.demo_fixture, true);
    assert.equal(fixture.created_by, "internal");
    assert.equal(fixture.cleanup_status, "active");
    assert.equal(fixture.environment, "production-smoke");
    assert.ok(fixture.expires_at);
    assert.equal(store.demo_fixture, true);
    assert.equal(product.demo_fixture, true);
    assert.equal(issue.demo_fixture, true);
    assert.equal(issue.fixture_id, fixture.fixture_id);
    assert.ok(
      fixture.records.some(
        (record) => record.fixture_type === "merchant_offer"
      )
    );

    const fetched = await handleInternalDemoFixturesRequest(
      internalFixtureRequest(
        `https://example.test/api/internal/agent-center/demo-fixtures/${fixture.fixture_id}`,
        { method: "GET" }
      ),
      { fixtureId: fixture.fixture_id }
    );
    const fetchedPayload = await fetched.json();

    assert.equal(fetched.status, 200);
    assert.equal(fetchedPayload.demo_fixture.fixture.fixture_id, fixture.fixture_id);
    assert.equal(fetchedPayload.demo_fixture.records.stores[0].fixture_id, fixture.fixture_id);
  });
});

test("internal demo fixture rewrite target uses shared Agent Center handler", async () => {
  resetAgentCenterState();
  await withInternalFixtureEnv(async () => {
    const response = await handleAgentCenterRequest(
      internalFixtureRequest(
        "https://example.test/api/agent-center/internal-demo-fixtures",
        {
          method: "POST",
          body: JSON.stringify({ preset: "price_mismatch" }),
        }
      ),
      { path: ["internal-demo-fixtures"] }
    );
    const payload = await response.json();
    const fixtureId = payload.demo_fixture.fixture.fixture_id;
    const issueId = payload.demo_fixture.issue.id;
    const diagnosis = new OfferExecutionService().runDiagnosis(issueId);

    assert.equal(response.status, 201);
    assert.ok(offerFindingTypes(diagnosis).includes("price_mismatch"));

    const deleted = await handleAgentCenterRequest(
      internalFixtureRequest(
        `https://example.test/api/agent-center/internal-demo-fixtures/${fixtureId}`,
        { method: "DELETE" }
      ),
      { path: ["internal-demo-fixtures", fixtureId] }
    );
    const deletedPayload = await deleted.json();

    assert.equal(deleted.status, 200);
    assert.equal(deletedPayload.demo_fixture.fixture.cleanup_status, "deleted");
  });
});

test("clean offer fixture can run offer diagnosis without generating offer issue", () => {
  resetAgentCenterState();
  const fixture = new DemoFixtureService().create({
    preset: "clean_offer",
    environment: "test",
  });
  const issueCount = getAgentCenterState().issues.length;
  const diagnosis = new OfferExecutionService().runDiagnosis(fixture.issue.id);
  const usageEvent = getAgentCenterState().usageEvents.find(
    (event) => event.id === diagnosis.usage_event_ids[0]
  );

  assert.deepEqual(offerFindingTypes(diagnosis), ["clean_offer"]);
  assert.equal(diagnosis.offer_readiness_score, 100);
  assert.equal(getAgentCenterState().issues.length, issueCount);
  assert.equal(
    getAgentCenterState().issues.some(
      (issue) => issue.issue_type === "offer_execution_issue" && !issue.demo_fixture
    ),
    false
  );
  assert.equal(usageEvent.event_type, "offer_verification_credit");
  assert.equal(usageEvent.billing_mode, "preview_only");
  assert.equal(usageEvent.billing_status, "not_invoiced");
});

test("price mismatch fixture generates price mismatch patch", () => {
  resetAgentCenterState();
  const fixture = new DemoFixtureService().create({
    preset: "price_mismatch",
    environment: "test",
  });
  const diagnosis = new OfferExecutionService().runDiagnosis(fixture.issue.id);
  const patch = diagnosis.patch_recommendations.find(
    (item) => item.patch_type === "pivota_offer_patch"
  );

  assert.ok(offerFindingTypes(diagnosis).includes("price_mismatch"));
  assert.ok(
    diagnosis.refined_fix_targets.includes("pivota_offer_layer") ||
      diagnosis.refined_fix_targets.includes("both_merchant_and_pivota")
  );
  assert.equal(patch.patch.price, 18.99);
});

test("expired coupon fixture generates expired coupon or promo mismatch patch", () => {
  resetAgentCenterState();
  const fixture = new DemoFixtureService().create({
    preset: "expired_coupon",
    environment: "test",
  });
  const diagnosis = new OfferExecutionService().runDiagnosis(fixture.issue.id);
  const findingTypes = offerFindingTypes(diagnosis);
  const patch = diagnosis.patch_recommendations.find(
    (item) => item.patch_type === "promo_state_patch"
  );

  assert.ok(
    findingTypes.includes("expired_coupon") || findingTypes.includes("promo_mismatch")
  );
  assert.ok(diagnosis.refined_fix_targets.includes("pivota_offer_layer"));
  assert.equal(patch.patch.coupon_status, "expired");
});

test("internal demo fixture presets cover inventory mismatch and missing Pivota offer", () => {
  resetAgentCenterState();
  const inventoryFixture = new DemoFixtureService().create({
    preset: "inventory_mismatch",
    environment: "test",
  });
  const inventoryDiagnosis = new OfferExecutionService().runDiagnosis(
    inventoryFixture.issue.id
  );

  assert.ok(offerFindingTypes(inventoryDiagnosis).includes("inventory_mismatch"));

  const missingFixture = new DemoFixtureService().create({
    preset: "missing_pivota_offer",
    environment: "test",
  });
  const missingDiagnosis = new OfferExecutionService().runDiagnosis(
    missingFixture.issue.id
  );

  assert.ok(offerFindingTypes(missingDiagnosis).includes("missing_offer"));
  assert.equal(missingFixture.pivota_offer, null);
});

test("internal demo fixture presets cover checkout verification scenarios", () => {
  resetAgentCenterState();
  const cleanFixture = new DemoFixtureService().create({
    preset: "clean_checkout_path",
    environment: "test",
  });
  const cleanDiagnosis = new CheckoutVerificationService().runDiagnosis(
    cleanFixture.issue.id
  );

  assert.deepEqual(checkoutFindingTypes(cleanDiagnosis), ["clean_checkout_path"]);
  assert.equal(cleanDiagnosis.checkout_readiness_score, 100);
  assert.ok(cleanFixture.merchant_checkout_path.demo_fixture);
  assert.ok(cleanFixture.pivota_checkout_path.demo_fixture);

  const expectations = [
    ["missing_checkout_path", "missing_checkout_path"],
    ["checkout_url_unreachable", "checkout_url_unreachable"],
    ["missing_variant_param", "variant_param_missing"],
    ["missing_coupon_param", "coupon_param_missing"],
    ["stale_checkout_session", "stale_checkout_session"],
    ["checkout_domain_mismatch", "checkout_domain_mismatch"],
    ["checkout_not_attached_to_offer", "checkout_not_attached_to_pivota_offer"],
  ];

  for (const [preset, expectedFinding] of expectations) {
    const fixture = new DemoFixtureService().create({
      preset,
      environment: "test",
    });
    const diagnosis = new CheckoutVerificationService().runDiagnosis(
      fixture.issue.id
    );

    assert.ok(
      checkoutFindingTypes(diagnosis).includes(expectedFinding),
      `${preset} should generate ${expectedFinding}`
    );
    assert.equal(
      getAgentCenterState()
        .usageEvents.find((event) => event.id === diagnosis.usage_event_ids[0])
        .billing_mode,
      "preview_only"
    );
  }
});

test("internal demo fixture cleanup removes fixture records", async () => {
  resetAgentCenterState();
  await withInternalFixtureEnv(async () => {
    const created = await handleInternalDemoFixturesRequest(
      internalFixtureRequest(
        "https://example.test/api/internal/agent-center/demo-fixtures",
        {
          method: "POST",
          body: JSON.stringify({ preset: "price_mismatch" }),
        }
      )
    );
    const createdPayload = await created.json();
    const fixtureId = createdPayload.demo_fixture.fixture.fixture_id;
    const issueId = createdPayload.demo_fixture.issue.id;
    const diagnosis = new OfferExecutionService().runDiagnosis(issueId);

    assert.ok(
      getAgentCenterState().merchantOffers.some(
        (offer) => offer.fixture_id === fixtureId
      )
    );
    assert.ok(diagnosis.usage_event_ids.length);

    const deleted = await handleInternalDemoFixturesRequest(
      internalFixtureRequest(
        `https://example.test/api/internal/agent-center/demo-fixtures/${fixtureId}`,
        { method: "DELETE" }
      ),
      { fixtureId }
    );
    const deletedPayload = await deleted.json();

    assert.equal(deleted.status, 200);
    assert.equal(deletedPayload.demo_fixture.fixture.cleanup_status, "deleted");
    assert.equal(
      getAgentCenterState().stores.some((store) => store.fixture_id === fixtureId),
      false
    );
    assert.equal(
      getAgentCenterState().merchantOffers.some(
        (offer) => offer.fixture_id === fixtureId
      ),
      false
    );
    assert.equal(
      getAgentCenterState().issues.some((issue) => issue.fixture_id === fixtureId),
      false
    );
    assert.equal(
      getAgentCenterState().offerExecutionDiagnoses.some(
        (item) => item.issue_id === issueId
      ),
      false
    );
    assert.equal(
      getAgentCenterState().usageEvents.some((event) =>
        event.idempotency_key.includes(issueId)
      ),
      false
    );
  });
});

test("internal demo fixture cleanup removes checkout fixture records", async () => {
  resetAgentCenterState();
  await withInternalFixtureEnv(async () => {
    const created = await handleInternalDemoFixturesRequest(
      internalFixtureRequest(
        "https://example.test/api/internal/agent-center/demo-fixtures",
        {
          method: "POST",
          body: JSON.stringify({ preset: "missing_variant_param" }),
        }
      )
    );
    const createdPayload = await created.json();
    const fixtureId = createdPayload.demo_fixture.fixture.fixture_id;
    const issueId = createdPayload.demo_fixture.issue.id;
    const diagnosis = new CheckoutVerificationService().runDiagnosis(issueId);

    assert.ok(
      getAgentCenterState().merchantCheckoutPaths.some(
        (path) => path.fixture_id === fixtureId
      )
    );
    assert.ok(
      getAgentCenterState().checkoutVerificationDiagnoses.some(
        (item) => item.id === diagnosis.id
      )
    );

    const deleted = await handleInternalDemoFixturesRequest(
      internalFixtureRequest(
        `https://example.test/api/internal/agent-center/demo-fixtures/${fixtureId}`,
        { method: "DELETE" }
      ),
      { fixtureId }
    );
    const deletedPayload = await deleted.json();

    assert.equal(deleted.status, 200);
    assert.equal(deletedPayload.demo_fixture.fixture.cleanup_status, "deleted");
    assert.equal(
      getAgentCenterState().merchantCheckoutPaths.some(
        (path) => path.fixture_id === fixtureId
      ),
      false
    );
    assert.equal(
      getAgentCenterState().pivotaCheckoutPaths.some(
        (path) => path.fixture_id === fixtureId
      ),
      false
    );
    assert.equal(
      getAgentCenterState().checkoutVerificationDiagnoses.some(
        (item) => item.issue_id === issueId
      ),
      false
    );
  });
});

test("GMV assurance snapshot creation aggregates demand and agent readiness", () => {
  resetAgentCenterState();
  const fixture = new DemoFixtureService().create({
    preset: "full_ready_pre_payment_chain",
    environment: "test",
  });

  const snapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: fixture.scan_target.id,
    product_entity_id: fixture.product.product_entity_id,
  });

  assert.equal(snapshot.scan_target_id, fixture.scan_target.id);
  assert.equal(
    snapshot.demand_test_summary.product_visibility_status.status,
    "passed"
  );
  assert.equal(
    snapshot.product_understanding_summary.product_data_readiness_status.status,
    "passed"
  );
  assert.equal(
    snapshot.offer_execution_summary.offer_readiness_status.status,
    "passed"
  );
  assert.equal(
    snapshot.checkout_verification_summary.checkout_readiness_status.status,
    "passed"
  );
});

test("GMV overview separates discovery readiness from execution readiness", () => {
  resetAgentCenterState();
  const fixture = new DemoFixtureService().create({
    preset: "full_ready_pre_payment_chain",
    environment: "test",
  });

  const fullSnapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: fixture.scan_target.id,
    product_entity_id: fixture.product.product_entity_id,
    assurance_scope: "full_assurance",
  });
  const readinessOnlySnapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: fixture.scan_target.id,
    product_entity_id: fixture.product.product_entity_id,
    assurance_scope: "readiness_only",
  });

  assert.equal(
    fullSnapshot.discovery_readiness_summary.organic_product_discovery_status.status,
    "not_tested"
  );
  assert.equal(fullSnapshot.readiness_level, "monitoring");
  assert.equal(readinessOnlySnapshot.readiness_level, "ready_for_agentic_checkout");
  assert.equal(
    readinessOnlySnapshot.offer_execution_summary.offer_readiness_status.status,
    "passed"
  );
});

test("GMV assurance blocker logic blocks low product visibility", () => {
  const result = runControlledSunscreenCase({
    attributes: {},
    pivotaAttributes: {},
    outputs: [competitorOnlyRecommendation(), competitorOnlyRecommendation()],
  });
  result.score.aggregate_scores.product_entity_visibility_score = 0;
  result.score.aggregate_scores.visibility_score = 0;

  const snapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: result.target.id,
    product_entity_id: result.product.product_entity_id,
  });

  assert.equal(snapshot.readiness_level, "blocked");
  assert.equal(
    snapshot.demand_test_summary.product_visibility_status.status,
    "blocked"
  );
  assert.equal(snapshot.top_blockers[0].blocker_type, "low_product_visibility");
});

test("GMV assurance marks untested dimensions as not_tested instead of failed", () => {
  const result = runIsntreeProductUnderstandingCase({
    merchantAttributes: isntreeStrongMerchantAttributes,
    pivotaAttributes: isntreeStrongMerchantAttributes,
    issueType: "pivota_pdp_readiness_gap",
  });

  const snapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: result.target.id,
    product_entity_id: result.product.product_entity_id,
  });

  assert.equal(snapshot.readiness_level, "monitoring");
  assert.equal(
    snapshot.demand_test_summary.merchant_attribution_status.status,
    "not_tested"
  );
  assert.equal(
    snapshot.offer_execution_summary.offer_readiness_status.status,
    "not_tested"
  );
  assert.equal(
    snapshot.checkout_verification_summary.checkout_readiness_status.status,
    "not_tested"
  );
});

test("full ready pre-payment chain fixture produces ready assurance snapshot", () => {
  resetAgentCenterState();
  const fixture = new DemoFixtureService().create({
    preset: "full_ready_pre_payment_chain",
    environment: "test",
  });
  const snapshot = fixture.gmv_assurance_snapshot;

  assert.equal(snapshot.readiness_level, "ready_for_agentic_checkout");
  assert.equal(snapshot.overall_readiness_score, 100);
  assert.equal(snapshot.top_blockers.length, 0);
  assert.equal(
    snapshot.demand_test_summary.product_visibility_status.status,
    "passed"
  );
  assert.equal(
    snapshot.demand_test_summary.merchant_attribution_status.status,
    "passed"
  );
  assert.equal(
    snapshot.demand_test_summary.pivota_attribution_status.status,
    "passed"
  );
  assert.equal(
    snapshot.checkout_verification_summary.checkout_readiness_status.status,
    "passed"
  );
});

test("offer price blocker chain fixture surfaces price mismatch as top blocker", () => {
  resetAgentCenterState();
  const fixture = new DemoFixtureService().create({
    preset: "offer_price_blocker_chain",
    environment: "test",
  });
  const snapshot = fixture.gmv_assurance_snapshot;

  assert.equal(snapshot.readiness_level, "needs_work");
  assert.equal(
    snapshot.offer_execution_summary.offer_readiness_status.status,
    "needs_work"
  );
  assert.equal(snapshot.top_blockers[0].blocker_type, "price_mismatch");
  assert.ok(
    snapshot.offer_execution_summary.offer_readiness_status.recommended_next_action.includes(
      "Offer Execution"
    )
  );
});

test("GMV assurance selects Pivota PDP quality blocker when attribution and offer pass", () => {
  const result = runIsntreeProductUnderstandingCase({
    merchantAttributes: isntreeStrongMerchantAttributes,
    pivotaAttributes: {
      ...isntreeStrongMerchantAttributes,
      pivota_pdp_url: verifiedPivotaPdpUrl,
      pivota_product_object_id: verifiedPivotaObjectId,
      offer_ids: [verifiedPivotaOfferId],
      agent_summary: "Daily hydrating sunscreen with watery gel finish.",
    },
  });
  result.target.scan_mode = "agentic_execution_test";
  markDemandScoresPassed(result);
  const qualityIssue = addPivotaPdpQualityIssue(result);
  const anchorIssue = addValidationAnchorIssue(result);
  addCleanOfferDiagnosis(result, qualityIssue);

  const snapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: result.target.id,
    product_entity_id: result.product.product_entity_id,
  });
  const topBlockerTypes = snapshot.top_blockers.map(
    (blocker) => blocker.blocker_type
  );

  assert.equal(snapshot.readiness_level, "needs_work");
  assert.equal(snapshot.top_blockers[0].blocker_type, "pivota_pdp_content_quality_gap");
  assert.equal(snapshot.top_blockers[0].issue_id, qualityIssue.id);
  assert.equal(
    snapshot.demand_test_summary.merchant_attribution_status.status,
    "passed"
  );
  assert.equal(
    snapshot.demand_test_summary.pivota_attribution_status.status,
    "passed"
  );
  assert.equal(
    snapshot.offer_execution_summary.offer_readiness_status.status,
    "passed"
  );
  assert.equal(
    snapshot.checkout_verification_summary.checkout_readiness_status.status,
    "not_tested"
  );
  assert.ok(!topBlockerTypes.includes("merchant_store_attribution_gap"));
  assert.ok(!snapshot.top_blockers.some((blocker) => blocker.issue_id === anchorIssue.id));
  assert.equal(snapshot.recommended_next_actions[0], pivotaPdpQualityNextAction);
  assert.match(
    qualityIssue.merchant_facing_summary,
    /Merchant-owned PDP attribution passed/
  );
});

test("GMV assurance does not let a passed dimension own top blocker", () => {
  const result = runIsntreeProductUnderstandingCase({
    merchantAttributes: isntreeStrongMerchantAttributes,
    pivotaAttributes: {
      ...isntreeStrongMerchantAttributes,
      agent_summary: "Daily hydrating sunscreen with watery gel finish.",
    },
    issueType: "merchant_store_attribution_gap",
  });
  result.target.scan_mode = "merchant_store_attribution_test";
  markDemandScoresPassed(result);

  const snapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: result.target.id,
    product_entity_id: result.product.product_entity_id,
  });

  assert.equal(
    snapshot.demand_test_summary.merchant_attribution_status.status,
    "passed"
  );
  assert.ok(
    !snapshot.top_blockers.some(
      (blocker) => blocker.blocker_type === "merchant_store_attribution_gap"
    )
  );
});

test("GMV assurance does not let a not-tested dimension own top blocker", () => {
  const result = runIsntreeProductUnderstandingCase({
    merchantAttributes: isntreeStrongMerchantAttributes,
    pivotaAttributes: {
      ...isntreeStrongMerchantAttributes,
      agent_summary: "Daily hydrating sunscreen with watery gel finish.",
    },
    issueType: "merchant_store_attribution_gap",
  });
  result.target.scan_mode = "open_product_visibility_test";
  markDemandScoresPassed(result);

  const snapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: result.target.id,
    product_entity_id: result.product.product_entity_id,
  });

  assert.equal(
    snapshot.demand_test_summary.merchant_attribution_status.status,
    "not_tested"
  );
  assert.ok(
    !snapshot.top_blockers.some(
      (blocker) => blocker.blocker_type === "merchant_store_attribution_gap"
    )
  );
});

test("GMV assurance prefers production validation consolidated score over latest mode score", () => {
  const result = runIsntreeProductUnderstandingCase({
    merchantAttributes: isntreeStrongMerchantAttributes,
    pivotaAttributes: {
      ...isntreeStrongMerchantAttributes,
      pivota_pdp_url: verifiedPivotaPdpUrl,
      pivota_product_object_id: verifiedPivotaObjectId,
      offer_ids: [verifiedPivotaOfferId],
      agent_summary: "Daily hydrating sunscreen with watery gel finish.",
    },
  });
  result.target.scan_mode = "agentic_execution_test";
  markDemandScoresPassed(result);
  result.score.provider_scores = {
    production_validation: { ...result.score.aggregate_scores },
  };
  result.score.created_at = "2026-05-01T12:00:00.000Z";
  const latestModeScore = structuredClone(result.score);
  latestModeScore.id = "score_latest_single_mode";
  latestModeScore.created_at = "2026-05-01T12:01:00.000Z";
  latestModeScore.provider_scores = {
    gemini: {
      ...result.score.aggregate_scores,
      merchant_store_visibility_score: 0,
    },
  };
  latestModeScore.aggregate_scores = {
    ...result.score.aggregate_scores,
    merchant_store_visibility_score: 0,
  };
  getAgentCenterState().scores.push(latestModeScore);
  addPivotaPdpQualityIssue(result);

  const snapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: result.target.id,
    product_entity_id: result.product.product_entity_id,
  });

  assert.equal(
    snapshot.demand_test_summary.merchant_attribution_status.status,
    "passed"
  );
  assert.equal(snapshot.top_blockers[0].blocker_type, "pivota_pdp_content_quality_gap");
});

test("GMV assurance checkout blocker chain surfaces checkout finding", () => {
  const fixture = createCheckoutVerificationFixture({
    pivotaCheckoutPatch: {
      checkout_url: "https://checkout.isntree.example/unreachable/session",
    },
  });
  new ProductUnderstandingService().runDiagnosis(fixture.issue.id);
  new OfferExecutionService().runDiagnosis(fixture.issue.id);
  new CheckoutVerificationService().runDiagnosis(fixture.issue.id);

  const snapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: fixture.target.id,
    product_entity_id: fixture.product.product_entity_id,
  });

  assert.equal(snapshot.readiness_level, "needs_work");
  assert.equal(
    snapshot.checkout_verification_summary.checkout_readiness_status.status,
    "needs_work"
  );
  assert.ok(
    snapshot.top_blockers.some(
      (blocker) => blocker.blocker_type === "checkout_url_unreachable"
    )
  );
});

test("GMV assurance usage summary aggregates preview credit categories", () => {
  const fixture = createCheckoutVerificationFixture();
  new ProductUnderstandingService().runDiagnosis(fixture.issue.id);
  new OfferExecutionService().runDiagnosis(fixture.issue.id);
  new CheckoutVerificationService().runDiagnosis(fixture.issue.id);

  const snapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: fixture.target.id,
    product_entity_id: fixture.product.product_entity_id,
  });

  assert.equal(snapshot.usage_summary.ai_test_credits, 3);
  assert.equal(snapshot.usage_summary.product_understanding_credits, 1);
  assert.equal(snapshot.usage_summary.offer_verification_credits, 1);
  assert.equal(snapshot.usage_summary.checkout_verification_credits, 1);
  assert.equal(snapshot.usage_summary.billing_mode, "preview_only");
  assert.equal(snapshot.usage_summary.billing_status, "not_invoiced");
});

test("GMV assurance next action uses discovery-specific resolution guidance", () => {
  const result = runOrganicDiscoveryBlockerCase();
  const snapshot = new GMVAssuranceService().createSnapshot({
    scan_target_id: result.target.id,
    product_entity_id: result.product.product_entity_id,
  });
  const organicIssue = result.issues.find(
    (issue) => issue.issue_type === "organic_product_not_discovered"
  );
  const competitorIssue = result.issues.find(
    (issue) => issue.issue_type === "competitor_dominance"
  );
  new IssueResolutionService().generate(organicIssue.id);
  new IssueResolutionService().generate(competitorIssue.id);
  const overview = getAgentCenterOverview();

  assert.equal(snapshot.top_blockers[0].blocker_type, "organic_product_not_discovered");
  assert.equal(snapshot.top_blockers[0].recommended_action, organicDiscoveryNextAction);
  assert.ok(snapshot.recommended_next_actions.includes(competitorDominanceNextAction));
  assert.equal(
    overview.latest_assurance_snapshot.top_blockers[0].recommended_action,
    organicDiscoveryNextAction
  );
});

test("GMV assurance API creates and fetches snapshots", async () => {
  const fixture = createCheckoutVerificationFixture();
  new ProductUnderstandingService().runDiagnosis(fixture.issue.id);
  new OfferExecutionService().runDiagnosis(fixture.issue.id);
  new CheckoutVerificationService().runDiagnosis(fixture.issue.id);

  const created = await handleAgentCenterRequest(
    new NextRequest("https://example.test/api/agent-center/gmv-assurance/snapshots", {
      method: "POST",
      body: JSON.stringify({
        scan_target_id: fixture.target.id,
        product_entity_id: fixture.product.product_entity_id,
      }),
    }),
    { path: ["gmv-assurance", "snapshots"] }
  );
  const createdPayload = await created.json();
  const fetched = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/gmv-assurance/snapshots/${createdPayload.snapshot.id}`
    ),
    { path: ["gmv-assurance", "snapshots", createdPayload.snapshot.id] }
  );
  const overview = await handleAgentCenterRequest(
    new NextRequest("https://example.test/api/agent-center/gmv-assurance/overview"),
    { path: ["gmv-assurance", "overview"] }
  );
  const fetchedPayload = await fetched.json();
  const overviewPayload = await overview.json();

  assert.equal(created.status, 201);
  assert.equal(fetchedPayload.snapshot.id, createdPayload.snapshot.id);
  assert.equal(
    overviewPayload.latest_snapshot.id,
    createdPayload.snapshot.id
  );
});

test("issue resolution plan generation handles merchant store attribution gaps", () => {
  const fixture = runIsntreeProductUnderstandingCase({
    issueType: "merchant_store_attribution_gap",
  });
  const plan = new IssueResolutionService().generate(fixture.issue.id);
  const actionTypes = plan.recommended_actions.map((action) => action.action_type);
  const usageEvent = getAgentCenterState().usageEvents.find(
    (event) => event.id === plan.usage_event_ids[0]
  );

  assert.equal(plan.blocker_type, "merchant_store_attribution_gap");
  assert.equal(plan.owner_type, "shared");
  assert.ok(actionTypes.includes("merchant_pdp_structured_data_patch"));
  assert.ok(actionTypes.includes("pivota_product_graph_buying_path_binding"));
  assert.ok(actionTypes.includes("pivota_unified_pdp_source_reference_patch"));
  assert.ok(actionTypes.includes("rerun_merchant_store_attribution_test"));
  assert.equal(usageEvent.event_type, "resolution_plan_credit");
  assert.equal(usageEvent.billing_mode, "preview_only");
  assert.equal(usageEvent.billing_status, "not_invoiced");
});

test("issue resolution plan generation handles organic discovery blockers", () => {
  const result = runOrganicDiscoveryBlockerCase();
  const issue = result.issues.find(
    (item) => item.issue_type === "organic_product_not_discovered"
  );
  const plan = new IssueResolutionService().generate(issue.id);
  const actionTypes = plan.recommended_actions.map((action) => action.action_type);
  const usageEvent = getAgentCenterState().usageEvents.find(
    (event) => event.id === plan.usage_event_ids[0]
  );

  assert.equal(plan.blocker_type, "organic_product_not_discovered");
  assert.equal(plan.owner_type, "shared");
  assert.ok(plan.fix_targets.includes("merchant_structured_data"));
  assert.ok(plan.fix_targets.includes("pivota_query_mapping"));
  assert.ok(actionTypes.includes("merchant_discovery_signal_patch"));
  assert.ok(actionTypes.includes("pivota_discovery_signal_patch"));
  assert.ok(actionTypes.includes("query_cluster_mapping_patch"));
  assert.ok(actionTypes.includes("rerun_organic_product_discovery_test"));
  assert.equal(plan.verification_plan.scan_mode, "organic_product_discovery_test");
  assert.notEqual(plan.owner_type, "human_review");
  assert.ok(
    plan.recommended_actions.some(
      (action) =>
        action.action_type === "merchant_discovery_signal_patch" &&
        action.requires_merchant_approval === true
    )
  );
  assert.equal(usageEvent.billing_mode, "preview_only");
  assert.equal(usageEvent.billing_status, "not_invoiced");
});

test("issue resolution plan generation handles competitor dominance blockers", () => {
  const result = runOrganicDiscoveryBlockerCase();
  const issue = result.issues.find(
    (item) => item.issue_type === "competitor_dominance"
  );
  const plan = new IssueResolutionService().generate(issue.id);
  const actionTypes = plan.recommended_actions.map((action) => action.action_type);

  assert.equal(plan.blocker_type, "competitor_dominance");
  assert.equal(plan.owner_type, "shared");
  assert.ok(actionTypes.includes("competitor_dominance_analysis"));
  assert.ok(actionTypes.includes("differentiation_evidence_patch"));
  assert.ok(actionTypes.includes("competitor_substitute_graph_patch"));
  assert.ok(actionTypes.includes("rerun_organic_product_discovery_test"));
  assert.equal(plan.verification_plan.scan_mode, "organic_product_discovery_test");
  assert.equal(plan.verification_plan.success_metric, "competitor_dominance_score");
  assert.notEqual(plan.owner_type, "human_review");
  assert.ok(
    plan.recommended_actions.some(
      (action) =>
        action.action_type === "differentiation_evidence_patch" &&
        action.requires_merchant_approval === true
    )
  );
});

test("issue resolution plan generation handles search-grounded merchant PDP discovery gaps", () => {
  resetAgentCenterState();
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Product was mentioned but no official PDP URL was returned.",
          },
        ],
        returned_urls: [],
        missing_attributes_identified: [],
      },
    });
    const issue = result.issues.find(
      (item) => item.issue_type === "merchant_pdp_not_discovered"
    );
    const plan = new IssueResolutionService().generate(issue.id);
    const actionTypes = plan.recommended_actions.map((action) => action.action_type);

    assert.equal(plan.blocker_type, "merchant_pdp_not_discovered");
    assert.equal(plan.owner_type, "shared");
    assert.ok(actionTypes.includes("merchant_indexability_patch"));
    assert.ok(actionTypes.includes("merchant_product_schema_patch"));
    assert.ok(actionTypes.includes("merchant_offer_schema_patch"));
    assert.ok(actionTypes.includes("merchant_canonical_url_patch"));
    assert.ok(actionTypes.includes("merchant_pdp_copy_patch"));
    assert.ok(actionTypes.includes("merchant_sitemap_submission"));
    assert.ok(actionTypes.includes("rerun_search_grounded_product_discovery_test"));
    assert.equal(
      plan.verification_plan.scan_mode,
      "search_grounded_product_discovery_test"
    );
    assert.equal(
      plan.verification_plan.success_metric,
      "search_grounded_merchant_pdp_discovery_score"
    );
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("issue resolution plan generation handles search-grounded Pivota PDP discovery gaps", () => {
  resetAgentCenterState();
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Product was mentioned but no Pivota PDP URL was returned.",
          },
        ],
        returned_urls: [],
        missing_attributes_identified: [],
      },
    });
    const issue = result.issues.find(
      (item) => item.issue_type === "pivota_pdp_not_discovered"
    );
    const plan = new IssueResolutionService().generate(issue.id);
    const actionTypes = plan.recommended_actions.map((action) => action.action_type);

    assert.equal(plan.blocker_type, "pivota_pdp_not_discovered");
    assert.equal(plan.owner_type, "pivota_ops");
    assert.ok(actionTypes.includes("pivota_indexability_patch"));
    assert.ok(actionTypes.includes("pivota_product_schema_patch"));
    assert.ok(actionTypes.includes("pivota_offer_schema_patch"));
    assert.ok(actionTypes.includes("pivota_source_reference_patch"));
    assert.ok(actionTypes.includes("pivota_sitemap_submission"));
    assert.ok(actionTypes.includes("pivota_search_console_indexing_request"));
    assert.ok(actionTypes.includes("pivota_internal_link_patch"));
    assert.ok(actionTypes.includes("pivota_search_console_url_inspection"));
    assert.ok(actionTypes.includes("pivota_product_intelligence_patch"));
    assert.ok(actionTypes.includes("rerun_search_grounded_product_discovery_test"));
    const indexingTasks = getAgentCenterState().pivotaIndexingTasks.filter(
      (task) => task.evidence?.issue_id === issue.id
    );
    assert.deepEqual(
      indexingTasks.map((task) => task.task_type).sort(),
      [
        "add_internal_link",
        "request_indexing",
        "scheduled_search_grounded_rerun",
        "scheduled_search_grounded_rerun",
        "scheduled_search_grounded_rerun",
        "submit_sitemap",
        "validate_search_console",
        "wait_for_indexing_window",
        "wait_for_indexing_window",
        "wait_for_indexing_window",
      ].sort()
    );
    const rerunWindows = indexingTasks
      .filter((task) => task.task_type === "scheduled_search_grounded_rerun")
      .map((task) => task.evidence?.rerun_window)
      .sort();
    assert.deepEqual(rerunWindows, ["T+24h", "T+72h", "T+7d"].sort());
    assert.equal(
      indexingTasks
        .filter((task) => task.task_type === "scheduled_search_grounded_rerun")
        .every((task) => Boolean(task.evidence?.next_rerun_at)),
      true
    );
    assert.equal(
      indexingTasks.every(
        (task) =>
          task.status === "proposed" &&
          task.billing_mode === undefined &&
          task.canonical_pivota_pdp_url.includes(task.product_entity_id)
      ),
      true
    );
    const taskSummary = new PivotaIndexingTaskService().summary(
      issue.affected_product_entities[0]
    );
    assert.equal(taskSummary.uplift_claim_allowed, false);
    assert.ok(taskSummary.next_rerun_time);
    assert.equal(
      plan.verification_plan.scan_mode,
      "search_grounded_product_discovery_test"
    );
    assert.equal(
      plan.verification_plan.success_metric,
      "search_grounded_pivota_pdp_discovery_score"
    );
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("issue resolution plan generation handles wrong buying path discovery gaps", () => {
  resetAgentCenterState();
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "A marketplace URL was returned.",
            product_url: "https://marketplace.example/isntree-watery-sun-gel",
          },
        ],
        returned_urls: ["https://marketplace.example/isntree-watery-sun-gel"],
        missing_attributes_identified: [],
      },
    });
    const issue = result.issues.find(
      (item) => item.issue_type === "wrong_buying_path_returned"
    );
    const plan = new IssueResolutionService().generate(issue.id);
    const actionTypes = plan.recommended_actions.map((action) => action.action_type);

    assert.equal(plan.blocker_type, "wrong_buying_path_returned");
    assert.equal(plan.owner_type, "shared");
    assert.ok(actionTypes.includes("wrong_url_analysis"));
    assert.ok(actionTypes.includes("canonical_buying_path_patch"));
    assert.ok(actionTypes.includes("competitor_or_retailer_confusion_patch"));
    assert.ok(actionTypes.includes("rerun_search_grounded_product_discovery_test"));
    assert.equal(
      plan.verification_plan.scan_mode,
      "search_grounded_product_discovery_test"
    );
    assert.equal(plan.verification_plan.success_metric, "url_match_accuracy_score");
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("Pivota optimization generates patches for Pivota PDP discovery gaps", () => {
  resetAgentCenterState();
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Product was mentioned without a Pivota PDP URL.",
          },
        ],
        returned_urls: [],
        missing_attributes_identified: [],
      },
    });
    const issue = result.issues.find(
      (item) => item.issue_type === "pivota_pdp_not_discovered"
    );
    const patches = new PivotaOptimizationService().generate(issue.id);
    const patchTypes = patches.map((patch) => patch.patch_type);

    assert.ok(patchTypes.includes("pivota_source_reference_patch"));
    assert.ok(patchTypes.includes("pivota_product_intelligence_patch"));
    assert.ok(patchTypes.includes("pivota_product_schema_patch"));
    assert.ok(patchTypes.includes("pivota_offer_schema_patch"));
    assert.ok(patchTypes.includes("pivota_sitemap_submission"));
    assert.equal(patches.every((patch) => patch.status === "proposed"), true);
    assert.equal(
      patches.every((patch) => patch.evidence.merchant_writeback === false),
      true
    );
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("Pivota optimization applies source reference, intelligence, and schema patches", () => {
  resetAgentCenterState();
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "Product was mentioned without a Pivota PDP URL.",
          },
        ],
        returned_urls: [],
        missing_attributes_identified: [],
      },
    });
    const issue = result.issues.find(
      (item) => item.issue_type === "pivota_pdp_not_discovered"
    );
    const service = new PivotaOptimizationService();
    const patches = service.generate(issue.id);
    const desiredPatches = patches.filter((patch) =>
      [
        "pivota_source_reference_patch",
        "pivota_product_intelligence_patch",
        "pivota_product_schema_patch",
      ].includes(patch.patch_type)
    );
    for (const patch of desiredPatches) service.apply(issue.id, { patch_id: patch.id });

    const product = getAgentCenterState().stores
      .find((store) => store.id === issue.store_id)
      .products.find((item) =>
        issue.affected_product_entities.includes(item.product_entity_id)
      );
    const usage = getAgentCenterState().usageEvents.filter(
      (event) => event.agent_type === "pivota_optimization_workflow"
    );

    assert.ok(product.pivota_attributes.source_references.length);
    assert.ok(product.pivota_attributes.product_intelligence_module.populated);
    assert.ok(product.pivota_attributes.structured_data.product_schema);
    assert.equal(
      desiredPatches.every(
        (patch) => service.list(issue.id).find((item) => item.id === patch.id).status === "applied"
      ),
      true
    );
    assert.equal(usage.length, desiredPatches.length);
    assert.equal(usage.every((event) => event.billing_mode === "preview_only"), true);
    assert.equal(usage.every((event) => event.billing_status === "not_invoiced"), true);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("Pivota optimization applies query mapping and competitor graph patches", () => {
  resetAgentCenterState();
  const result = scoreAttributionFixture({
    scanMode: "organic_product_discovery_test",
    output: {
      mentioned_brands: ["Beauty of Joseon", "COSRX"],
      mentioned_products: [
        {
          name: "Beauty of Joseon Relief Sun",
          brand: "Beauty of Joseon",
          rank: 1,
          reason: "Dominant competitor in the organic query.",
        },
      ],
      missing_attributes_identified: [],
    },
  });
  const organicIssue = result.issues.find(
    (item) => item.issue_type === "organic_product_not_discovered"
  );
  const competitorIssue = result.issues.find(
    (item) => item.issue_type === "competitor_dominance"
  );
  const service = new PivotaOptimizationService();
  const queryPatch = service
    .generate(organicIssue.id)
    .find((patch) => patch.patch_type === "query_cluster_mapping_patch");
  const competitorPatch = service
    .generate(competitorIssue.id)
    .find((patch) => patch.patch_type === "competitor_substitute_graph_patch");

  service.apply(organicIssue.id, { patch_id: queryPatch.id });
  service.apply(competitorIssue.id, { patch_id: competitorPatch.id });

  const product = getAgentCenterState().stores
    .find((store) => store.id === organicIssue.store_id)
    .products.find((item) =>
      organicIssue.affected_product_entities.includes(item.product_entity_id)
    );
  const cluster = getAgentCenterState().queryClusters.find(
    (item) => item.id === result.cluster.id
  );

  assert.ok(cluster.queries.some((query) => /where to buy/i.test(query)));
  assert.ok(product.pivota_attributes.competitor_substitute_graph_patch);
  assert.ok(product.pivota_attributes.query_cluster_mapping_patch);
});

test("Pivota optimization rejects merchant-owned actions", () => {
  resetAgentCenterState();
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  try {
    const result = scoreAttributionFixture({
      scanMode: "search_grounded_product_discovery_test",
      output: {
        mentioned_brands: ["Isntree"],
        mentioned_products: [
          {
            name: "Isntree Hyaluronic Acid Watery Sun Gel",
            brand: "Isntree",
            rank: 1,
            reason: "No official merchant PDP was returned.",
          },
        ],
        returned_urls: [],
        missing_attributes_identified: [],
      },
    });
    const issue = result.issues.find(
      (item) => item.issue_type === "merchant_pdp_not_discovered"
    );
    const plan = new IssueResolutionService().generate(issue.id);
    const merchantAction = plan.recommended_actions.find(
      (action) => action.action_type === "merchant_indexability_patch"
    );

    assert.throws(() =>
      new PivotaOptimizationService().generate(issue.id, {
        action_id: merchantAction.id,
      })
    );
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
});

test("issue resolution plan generation handles Pivota attribution gaps", () => {
  const fixture = runIsntreeProductUnderstandingCase({
    issueType: "pivota_pdp_attribution_gap",
  });
  const plan = new IssueResolutionService().generate(fixture.issue.id);
  const actionTypes = plan.recommended_actions.map((action) => action.action_type);

  assert.equal(plan.blocker_type, "pivota_pdp_attribution_gap");
  assert.equal(plan.owner_type, "pivota_ops");
  assert.ok(actionTypes.includes("publish_or_verify_pivota_pdp_url"));
  assert.ok(actionTypes.includes("bind_product_object_id"));
  assert.ok(actionTypes.includes("rerun_pivota_pdp_attribution_test"));
  assert.equal(plan.verification_plan.scan_mode, "pivota_pdp_attribution_test");
});

test("issue resolution plan generation handles Pivota PDP quality gaps", () => {
  const result = runIsntreeProductUnderstandingCase({
    merchantAttributes: isntreeStrongMerchantAttributes,
    pivotaAttributes: {
      ...isntreeStrongMerchantAttributes,
      pivota_pdp_url: verifiedPivotaPdpUrl,
      agent_summary: "Daily hydrating sunscreen with watery gel finish.",
    },
  });
  markDemandScoresPassed(result);
  const issue = addPivotaPdpQualityIssue(result);
  const plan = new IssueResolutionService().generate(issue.id);
  const actionTypes = plan.recommended_actions.map((action) => action.action_type);

  assert.equal(plan.blocker_type, "pivota_pdp_content_quality_gap");
  assert.equal(plan.owner_type, "pivota_ops");
  assert.ok(actionTypes.includes("pivota_pdp_identity_and_overview_patch"));
  assert.ok(actionTypes.includes("pivota_product_intelligence_module_patch"));
  assert.ok(actionTypes.includes("rerun_pivota_pdp_attribution_test"));
  assert.equal(plan.verification_plan.scan_mode, "pivota_pdp_attribution_test");
});

test("issue resolution plan generation handles missing attributes", () => {
  const fixture = runIsntreeProductUnderstandingCase({
    merchantAttributes: {},
    pivotaAttributes: {},
    issueType: "missing_attribute",
  });
  const plan = new IssueResolutionService().generate(fixture.issue.id);
  const actionTypes = plan.recommended_actions.map((action) => action.action_type);

  assert.equal(plan.blocker_type, "missing_attribute");
  assert.ok(plan.fix_targets.includes("both_merchant_and_pivota"));
  assert.ok(actionTypes.includes("merchant_source_patch"));
  assert.ok(actionTypes.includes("pivota_unified_pdp_patch"));
  assert.ok(actionTypes.includes("rerun_product_understanding_diagnosis"));
});

test("issue resolution plan generation handles price mismatch findings", () => {
  const fixture = createOfferExecutionFixture({
    pivotaOfferPatch: { price: 21.99 },
    issueType: "offer_execution_issue",
  });
  new OfferExecutionService().runDiagnosis(fixture.issue.id);
  const plan = new IssueResolutionService().generate(fixture.issue.id);
  const actionTypes = plan.recommended_actions.map((action) => action.action_type);

  assert.equal(plan.blocker_type, "price_mismatch");
  assert.ok(plan.fix_targets.includes("pivota_offer_layer"));
  assert.ok(actionTypes.includes("pivota_offer_patch"));
  assert.ok(actionTypes.includes("rerun_offer_diagnosis"));
});

test("issue resolution plan generation handles coupon passthrough gaps", () => {
  const fixture = createCheckoutVerificationFixture({
    merchantOfferPatch: {
      coupon_code: "SUN10",
      coupon_status: "active",
    },
    pivotaCheckoutPatch: {
      cart_handoff_payload: {
        variant: "ISNTREE-PU-WATERY-SUN-GEL-SPF50-PA4-50ML",
        quantity: 1,
      },
    },
  });
  new CheckoutVerificationService().runDiagnosis(fixture.issue.id);
  const plan = new IssueResolutionService().generate(fixture.issue.id);
  const actionTypes = plan.recommended_actions.map((action) => action.action_type);

  assert.equal(plan.blocker_type, "coupon_param_missing");
  assert.ok(plan.fix_targets.includes("pivota_checkout_layer"));
  assert.ok(plan.fix_targets.includes("merchant_promo_source"));
  assert.ok(actionTypes.includes("coupon_passthrough_patch"));
  assert.ok(actionTypes.includes("rerun_checkout_diagnosis"));
});

test("issue resolution action approval and apply update action state", () => {
  const fixture = runIsntreeProductUnderstandingCase({
    issueType: "merchant_store_attribution_gap",
  });
  const service = new IssueResolutionService();
  const plan = service.generate(fixture.issue.id);
  const merchantAction = plan.recommended_actions.find(
    (action) => action.action_type === "merchant_pdp_structured_data_patch"
  );

  assert.throws(() => service.applyAction(fixture.issue.id, merchantAction.id));
  service.approveAction(fixture.issue.id, merchantAction.id);
  const applied = service.applyAction(fixture.issue.id, merchantAction.id);
  const updatedAction = applied.recommended_actions.find(
    (action) => action.id === merchantAction.id
  );

  assert.equal(updatedAction.status, "applied");
  assert.equal(applied.merchant_approval_status, "approved");
});

test("issue resolution retest uses the correct agent and scan mode", async () => {
  const fixture = runIsntreeProductUnderstandingCase({
    issueType: "merchant_store_attribution_gap",
  });
  const service = new IssueResolutionService();
  const plan = service.generate(fixture.issue.id);

  assert.equal(plan.verification_plan.source_agent, "demand_test_agent");
  assert.equal(plan.verification_plan.scan_mode, "merchant_store_attribution_test");

  const retested = await service.retest(fixture.issue.id);
  assert.equal(retested.retest_result.source_agent, "demand_test_agent");
  assert.equal(
    retested.retest_result.scan_mode,
    "merchant_store_attribution_test"
  );
});

test("issue resolution API creates, approves, applies, and retests a plan", async () => {
  const fixture = runIsntreeProductUnderstandingCase({
    issueType: "pivota_pdp_attribution_gap",
  });
  const created = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${fixture.issue.id}/resolution-plan`,
      { method: "POST" }
    ),
    { path: ["issues", fixture.issue.id, "resolution-plan"] }
  );
  const createdPayload = await created.json();
  const plan = createdPayload.resolution_plan;
  const firstAction = plan.recommended_actions[0];

  const applied = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${fixture.issue.id}/resolution-plan/actions/${firstAction.id}/apply`,
      { method: "POST" }
    ),
    {
      path: [
        "issues",
        fixture.issue.id,
        "resolution-plan",
        "actions",
        firstAction.id,
        "apply",
      ],
    }
  );
  const retested = await handleAgentCenterRequest(
    new NextRequest(
      `https://example.test/api/agent-center/issues/${fixture.issue.id}/resolution-plan/retest`,
      { method: "POST" }
    ),
    { path: ["issues", fixture.issue.id, "resolution-plan", "retest"] }
  );
  const appliedPayload = await applied.json();
  const retestedPayload = await retested.json();

  assert.equal(created.status, 201);
  assert.equal(
    appliedPayload.resolution_plan.recommended_actions[0].status,
    "applied"
  );
  assert.equal(retestedPayload.resolution_plan.retest_result.status, "completed");
});

test("GMV overview next action reads from the resolution plan", () => {
  resetAgentCenterState();
  const fixture = new DemoFixtureService().create({
    preset: "offer_price_blocker_chain",
    environment: "test",
  });
  const blocker = fixture.gmv_assurance_snapshot.top_blockers[0];
  const plan = new IssueResolutionService().generate(blocker.issue_id);
  const overview = getAgentCenterOverview();

  assert.equal(
    overview.latest_assurance_snapshot.top_blockers[0].resolution_plan_id,
    plan.id
  );
  assert.equal(
    overview.latest_assurance_snapshot.recommended_next_actions[0],
    plan.recommended_actions[0].title
  );
});

test("internal production validation route returns 403 when disabled", async () => {
  resetAgentCenterState();
  const originalEnabled = process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
  const originalSecret = process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET;
  delete process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
  process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET = "validation-secret";
  try {
    const response = await handleInternalProductionValidationRunsRequest(
      internalProductionValidationRequest(
        "https://example.test/api/internal/agent-center/production-validation-runs",
        {
          method: "POST",
          body: JSON.stringify(productionValidationPayload()),
        }
      )
    );
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.match(payload.error, /disabled/);
  } finally {
    if (originalEnabled === undefined) {
      delete process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION;
    } else {
      process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION = originalEnabled;
    }
    if (originalSecret === undefined) {
      delete process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET;
    } else {
      process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET = originalSecret;
    }
  }
});

test("internal production validation route creates validation run", async () => {
  resetAgentCenterState();
  await withInternalProductionValidationEnv(async () => {
    const response = await handleInternalProductionValidationRunsRequest(
      internalProductionValidationRequest(
        "https://example.test/api/internal/agent-center/production-validation-runs",
        {
          method: "POST",
          body: JSON.stringify(productionValidationPayload()),
        }
      )
    );
    const payload = await response.json();
    const run = payload.production_validation_run;

    assert.equal(response.status, 201);
    assert.equal(run.status, "created");
    assert.equal(run.merchant_name, "Isntree Official");
    assert.equal(run.merchant_pdp_url.includes("isntree.example"), true);
  });
});

test("production validation preflights merchant and Pivota PDP URLs", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        pivota_pdp_url:
          "https://agent.pivota.cc/products/ext_isntree_watery_sun_gel",
        pivota_offer_id: "offer_isntree_direct_50ml",
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const report = completed.validation_report;

    assert.equal(report.url_preflight_results.merchant_pdp.status, "passed");
    assert.equal(report.url_preflight_results.merchant_pdp.status_code, 200);
    assert.equal(report.url_preflight_results.pivota_pdp.status, "passed");
    assert.equal(report.url_preflight_results.pivota_pdp.status_code, 200);
    assert.ok(
      report.demand_test_summary.modes_run.some(
        (item) => item.scan_mode === "organic_product_discovery_test"
      )
    );
    assert.ok(
      report.demand_test_summary.modes_run.some(
        (item) => item.scan_mode === "search_grounded_product_discovery_test"
      )
    );
    assert.ok(
      report.demand_test_summary.modes_run.some(
        (item) => item.scan_mode === "buying_path_discovery_test"
      )
    );
    assert.ok(
      report.demand_test_summary.modes_run.some(
        (item) => item.scan_mode === "pivota_pdp_attribution_test"
      )
    );
    assert.ok(report.gmv_assurance_snapshot.discovery_readiness_summary);
  });
});

test("production validation records failed merchant and Pivota PDP preflight", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        merchant_pdp_url: "https://isntree.example/failed/product",
        pivota_pdp_url: "https://agent.pivota.cc/products/failed_object",
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const report = completed.validation_report;

    assert.equal(report.url_preflight_results.merchant_pdp.status, "failed");
    assert.equal(report.url_preflight_results.pivota_pdp.status, "failed");
  });
});

test("production validation without Pivota PDP skips Pivota attribution mode", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        pivota_pdp_url: undefined,
        pivota_offer_id: undefined,
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const report = completed.validation_report;
    const modes = report.demand_test_summary.modes_run.map(
      (item) => item.scan_mode
    );

    assert.ok(modes.includes("organic_product_discovery_test"));
    assert.ok(modes.includes("search_grounded_product_discovery_test"));
    assert.ok(modes.includes("buying_path_discovery_test"));
    assert.ok(!modes.includes("pivota_pdp_attribution_test"));
    assert.ok(report.demand_test_summary.skipped_modes.includes("pivota_pdp_attribution_test"));
    assert.equal(
      report.gmv_assurance_snapshot.demand_test_summary.pivota_attribution_status.status,
      "not_tested"
    );
  });
});

test("production validation can scope demand modes for internal grounding smoke", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        demand_scan_modes: ["search_grounded_product_discovery_test"],
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const report = completed.validation_report;
    const modes = report.demand_test_summary.modes_run.map(
      (item) => item.scan_mode
    );

    assert.deepEqual(modes, ["search_grounded_product_discovery_test"]);
    assert.equal(completed.demand_test_job_ids.length, 1);
    assert.equal(
      report.demand_test_summary.modes_run[0].aggregate_scores
        .search_grounded_merchant_pdp_discovery_score,
      "not_configured"
    );
  });
});

test("production validation offer inputs trigger Offer Execution diagnosis", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        merchant_offer_input: {
          price: 18.99,
          currency: "USD",
          coupon_status: "none",
          inventory_status: "in_stock",
        },
        pivota_offer_input: {
          price: 21.99,
          currency: "USD",
          coupon_status: "none",
          inventory_status: "in_stock",
        },
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const report = completed.validation_report;

    assert.equal(completed.offer_diagnosis_ids.length, 1);
    assert.ok(report.offer_execution_summary.findings.includes("price_mismatch"));
    assert.ok(report.top_blockers.some((item) => item.blocker_type === "price_mismatch"));
  });
});

test("production validation checkout inputs trigger Checkout Verification diagnosis", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        merchant_offer_input: {
          price: 18.99,
          currency: "USD",
          coupon_code: "SUN10",
          coupon_status: "active",
          inventory_status: "in_stock",
        },
        pivota_offer_input: {
          price: 18.99,
          currency: "USD",
          coupon_code: "SUN10",
          coupon_status: "active",
          inventory_status: "in_stock",
        },
        merchant_checkout_input: {
          checkout_url: "https://checkout.isntree.example/checkout",
          checkout_domain: "checkout.isntree.example",
          required_params: ["variant", "quantity", "discount"],
          variant_param_name: "variant",
          quantity_param_name: "quantity",
          coupon_param_name: "discount",
        },
        pivota_checkout_input: {
          checkout_url: "https://checkout.isntree.example/checkout",
          checkout_domain: "checkout.isntree.example",
          required_params: ["variant", "quantity", "discount"],
          cart_handoff_payload: {
            variant: "isntree_watery_sun_gel_50ml",
            quantity: 1,
          },
          variant_id: "isntree_watery_sun_gel_50ml",
          quantity: 1,
        },
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const report = completed.validation_report;

    assert.equal(completed.checkout_diagnosis_ids.length, 1);
    assert.ok(
      report.checkout_verification_summary.findings.includes("coupon_param_missing")
    );
    assert.equal(
      report.gmv_assurance_snapshot.checkout_verification_summary
        .checkout_readiness_status.status,
      "needs_work"
    );
  });
});

test("production validation report includes snapshot blockers and preview usage", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        merchant_offer_input: {
          price: 18.99,
          currency: "USD",
          coupon_status: "none",
          inventory_status: "in_stock",
        },
        pivota_offer_input: {
          price: 18.99,
          currency: "USD",
          coupon_status: "none",
          inventory_status: "in_stock",
        },
        merchant_checkout_input: {
          checkout_url: "https://checkout.isntree.example/checkout",
          checkout_domain: "checkout.isntree.example",
          required_params: ["variant", "quantity"],
          variant_param_name: "variant",
          quantity_param_name: "quantity",
        },
        pivota_checkout_input: {
          checkout_url: "https://checkout.isntree.example/checkout",
          checkout_domain: "checkout.isntree.example",
          required_params: ["variant", "quantity"],
          cart_handoff_payload: {
            variant: "isntree_watery_sun_gel_50ml",
            quantity: 1,
          },
          variant_id: "isntree_watery_sun_gel_50ml",
          quantity: 1,
        },
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const report = completed.validation_report;
    const usageEvents = getAgentCenterState().usageEvents.filter((event) =>
      completed.usage_event_ids.includes(event.id)
    );

    assert.ok(report.gmv_assurance_snapshot.id);
    assert.ok(report.gmv_assurance_snapshot.discovery_readiness_summary);
    assert.equal(
      report.gmv_assurance_snapshot.discovery_readiness_summary
        .merchant_pdp_discovery_status.status,
      "not_configured"
    );
    assert.ok(Array.isArray(report.top_blockers));
    assert.equal(report.usage_summary.billing_mode, "preview_only");
    assert.equal(report.usage_summary.billing_status, "not_invoiced");
    assert.ok(usageEvents.length >= 4);
    assert.ok(
      usageEvents.every(
        (event) =>
          event.billing_mode === "preview_only" &&
          event.billing_status === "not_invoiced"
      )
    );
  });
});

test("merchant-facing report draft summarizes dual-path readiness safely", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        pivota_pdp_url:
          "https://agent.pivota.cc/products/ext_isntree_watery_sun_gel",
        pivota_offer_id: "offer_isntree_direct_50ml",
        pivota_pdp_quality_findings: pivotaLivePdpQualityFindings,
        merchant_offer_input: {
          price: 18.99,
          currency: "USD",
          coupon_status: "none",
          inventory_status: "in_stock",
        },
        pivota_offer_input: {
          price: 18.99,
          currency: "USD",
          coupon_status: "none",
          inventory_status: "in_stock",
        },
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const blocker = completed.validation_report.top_blockers.find(
      (item) => item.issue_id
    );
    if (blocker?.issue_id) new IssueResolutionService().generate(blocker.issue_id);
    completed.validation_report.gmv_assurance_snapshot.discovery_readiness_summary.organic_product_discovery_status = {
      status: "blocked",
      score: 0,
      issue_id: "issue_organic_fixture",
      recommended_next_action: organicDiscoveryNextAction,
      evidence: "Organic product discovery score is 0.",
    };
    completed.validation_report.gmv_assurance_snapshot.discovery_readiness_summary.competitor_dominance_status = {
      status: "blocked",
      score: 100,
      issue_id: "issue_competitor_fixture",
      recommended_next_action: competitorDominanceNextAction,
      evidence: "Competitor dominance score is 100; lower is better.",
    };
    completed.validation_report.gmv_assurance_snapshot.demand_test_summary.product_visibility_status.status = "passed";
    completed.validation_report.gmv_assurance_snapshot.demand_test_summary.merchant_attribution_status.status = "passed";
    completed.validation_report.gmv_assurance_snapshot.demand_test_summary.pivota_attribution_status.status = "passed";
    completed.validation_report.gmv_assurance_snapshot.offer_execution_summary.offer_readiness_status.status = "passed";

    const report = new MerchantFacingReportService().generate(completed.id);
    const serialized = JSON.stringify(report).toLowerCase();

    assert.equal(report.production_validation_run_id, completed.id);
    assert.equal(report.status, "draft");
    assert.equal(report.tested_product.product_name, completed.product_name);
    assert.match(report.discovery_vs_readiness, /no-context organic discovery/i);
    assert.match(report.discovery_vs_readiness, /buying paths appear ready when surfaced/i);
    assert.match(report.discovery_vs_readiness, /Contextual attribution passed does not mean organic discovery passed/i);
    assert.match(report.discovery_vs_readiness, /Search-grounded discovery is separate/i);
    assert.ok(report.discovery_evidence.tested_organic_queries.length > 0);
    assert.ok(report.discovery_evidence.returned_products.length > 0);
    assert.ok(report.discovery_evidence.returned_competitors.length > 0);
    assert.match(report.discovery_evidence.competitor_rank_summary, /competitor/i);
    assert.match(
      report.discovery_evidence.missing_merchant_product_summary,
      /appeared in/i
    );
    assert.ok(
      report.discovery_evidence.competitor_dominance_evidence.likely_reasons.includes(
        "stronger category association"
      )
    );
    assert.ok(
      report.discovery_evidence.competitor_dominance_evidence
        .recommended_differentiation_angles.includes("ingredient positioning")
    );
    assert.match(report.discovery_result.interpretation, /discovery/i);
    assert.match(
      report.discovery_result.search_grounded_merchant_pdp_discovery.summary,
      /not configured|official merchant PDP|did not return/i
    );
    assert.match(
      report.readiness_result.contextual_merchant_attribution.summary,
      /contextual attribution/i
    );
    assert.ok(
      report.recommended_fix_sections.merchant_owned_fixes.some((fix) =>
        /Product structured data/i.test(fix)
      )
    );
    assert.ok(
      report.recommended_fix_sections.pivota_owned_fixes.some((fix) =>
        /product intelligence module/i.test(fix)
      )
    );
    assert.ok(
      report.recommended_fix_sections.shared_fixes.some((fix) =>
        /competitors dominated/i.test(fix)
      )
    );
    assert.equal(
      report.path_readiness.merchant_owned_path.merchant_pdp_url,
      completed.merchant_pdp_url
    );
    assert.equal(
      report.path_readiness.pivota_agent_facing_path.pivota_pdp_url,
      completed.pivota_pdp_url
    );
    assert.ok(report.path_readiness.pivota_agent_facing_path.product_entity_id);
    assert.ok(
      report.path_readiness.pivota_agent_facing_path.canonical_pivota_pdp_url.includes(
        "/products/pe_"
      )
    );
    assert.notEqual(
      report.path_readiness.pivota_agent_facing_path.canonical_pivota_pdp_url,
      completed.pivota_pdp_url
    );
    assert.match(
      new MerchantFacingReportService().toMarkdown(report),
      /canonical product entity with merchant offers/i
    );
    assert.match(
      report.path_readiness.pivota_agent_facing_path.summary,
      /agent-facing/
    );
    assert.equal(report.usage_statement.billing_mode, "preview_only");
    assert.equal(report.usage_statement.billing_status, "not_invoiced");
    assert.match(report.usage_statement.merchant_copy, /not invoiced/i);
    assert.ok(report.v1_does_not_prove.includes("Real payment authorization"));
    assert.ok(report.v1_does_not_prove.includes("Final GMV attribution"));
    assert.ok(report.recommended_fixes.length > 0);
    assert.ok(
      report.sharing_notes.some((note) => /Provider response details/i.test(note))
    );
    assert.equal(serialized.includes("\"prompt\""), false);
    assert.equal(serialized.includes("input_tokens"), false);
    assert.equal(serialized.includes("output_tokens"), false);
    assert.equal(serialized.includes("token_count"), false);
    assert.equal(serialized.includes("raw_output"), false);
    assert.equal(
      new MerchantFacingReportService().latestForRun(completed.id).id,
      report.id
    );
  });
});

test("merchant-facing report handles search-grounded discovery interpretations", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const service = new MerchantFacingReportService();

    const merchantFoundRun = await new ProductionValidationRunService().run(
      new ProductionValidationRunService().create(productionValidationPayload()).id
    );
    merchantFoundRun.validation_report.gmv_assurance_snapshot.discovery_readiness_summary.organic_product_discovery_status = {
      status: "blocked",
      score: 0,
      recommended_next_action: organicDiscoveryNextAction,
      evidence: "Organic product discovery score is 0.",
    };
    merchantFoundRun.validation_report.gmv_assurance_snapshot.discovery_readiness_summary.merchant_pdp_discovery_status = {
      status: "passed",
      score: 100,
      recommended_next_action: "Merchant PDP discovered.",
      evidence: "Merchant PDP exact URL returned.",
    };
    merchantFoundRun.validation_report.gmv_assurance_snapshot.discovery_readiness_summary.pivota_pdp_discovery_status = {
      status: "needs_work",
      score: 0,
      recommended_next_action: "Improve Pivota PDP discovery.",
      evidence: "Pivota PDP exact URL was not returned.",
    };
    const merchantFoundReport = service.generate(merchantFoundRun.id);
    assert.match(
      merchantFoundReport.discovery_result.interpretation,
      /official merchant PDP can be found when the product name (is|was) specified/i
    );
    assert.match(
      merchantFoundReport.discovery_result.interpretation,
      /Pivota agent-facing path is not yet discoverable/i
    );

    const bothMissingRun = await new ProductionValidationRunService().run(
      new ProductionValidationRunService().create(productionValidationPayload()).id
    );
    bothMissingRun.validation_report.gmv_assurance_snapshot.discovery_readiness_summary.organic_product_discovery_status = {
      status: "blocked",
      score: 0,
      recommended_next_action: organicDiscoveryNextAction,
      evidence: "Organic product discovery score is 0.",
    };
    bothMissingRun.validation_report.gmv_assurance_snapshot.discovery_readiness_summary.merchant_pdp_discovery_status = {
      status: "needs_work",
      score: 0,
      recommended_next_action: "Merchant PDP not discovered.",
      evidence: "Merchant PDP exact URL was not returned.",
    };
    bothMissingRun.validation_report.gmv_assurance_snapshot.discovery_readiness_summary.pivota_pdp_discovery_status = {
      status: "needs_work",
      score: 0,
      recommended_next_action: "Pivota PDP not discovered.",
      evidence: "Pivota PDP exact URL was not returned.",
    };
    const bothMissingReport = service.generate(bothMissingRun.id);
    assert.match(
      bothMissingReport.discovery_result.interpretation,
      /Neither organic discovery nor search-grounded product discovery returned the official merchant PDP/i
    );

    const notConfiguredRun = await new ProductionValidationRunService().run(
      new ProductionValidationRunService().create(productionValidationPayload()).id
    );
    notConfiguredRun.validation_report.gmv_assurance_snapshot.discovery_readiness_summary.merchant_pdp_discovery_status = {
      status: "not_configured",
      score: "not_configured",
      recommended_next_action: "Configure search grounding.",
      evidence: "Search grounding not configured.",
    };
    const notConfiguredReport = service.generate(notConfiguredRun.id);
    assert.match(
      notConfiguredReport.discovery_result.search_grounded_merchant_pdp_discovery.summary,
      /not configured/i
    );
  });
});

test("merchant-facing report maps scoped numeric zero search-grounded scores as not found", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        demand_scan_modes: ["search_grounded_product_discovery_test"],
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const modeSummary =
      completed.validation_report.demand_test_summary.modes_run[0];
    Object.assign(modeSummary.aggregate_scores, {
      search_grounded_merchant_pdp_discovery_score: 0,
      search_grounded_pivota_pdp_discovery_score: 0,
      url_match_accuracy_score: 0,
      organic_product_discovery_score: "not_tested",
      organic_brand_discovery_score: "not_tested",
      buying_path_discovery_score: "not_tested",
    });

    const state = getAgentCenterState();
    const baseIssue = state.issues.find((issue) =>
      modeSummary.issue_ids.includes(issue.id)
    );
    assert.ok(baseIssue, "expected production validation to create a base issue");
    const merchantIssue = {
      ...baseIssue,
      id: "issue_report_merchant_pdp_not_discovered",
      issue_type: "merchant_pdp_not_discovered",
      severity: "high",
      merchant_facing_summary:
        "Search-grounded Gemini did not return the expected merchant PDP.",
      evidence: {
        ...baseIssue.evidence,
        summary: "Expected merchant PDP URL was not returned by Gemini or grounding metadata.",
      },
    };
    const pivotaIssue = {
      ...baseIssue,
      id: "issue_report_pivota_pdp_not_discovered",
      issue_type: "pivota_pdp_not_discovered",
      severity: "high",
      merchant_facing_summary:
        "Search-grounded Gemini did not return the expected Pivota PDP.",
      evidence: {
        ...baseIssue.evidence,
        summary: "Expected Pivota PDP URL was not returned by Gemini or grounding metadata.",
      },
    };
    const wrongPathIssue = {
      ...baseIssue,
      id: "issue_report_wrong_buying_path",
      issue_type: "wrong_buying_path_returned",
      severity: "medium",
      merchant_facing_summary:
        "Gemini returned a URL, but it did not match the expected merchant or Pivota PDP.",
      evidence: {
        ...baseIssue.evidence,
        summary:
          "A returned URL was captured, but it did not match the expected merchant or Pivota PDP.",
      },
    };
    state.issues.push(merchantIssue, pivotaIssue, wrongPathIssue);
    modeSummary.issue_ids = [merchantIssue.id, pivotaIssue.id, wrongPathIssue.id];
    completed.issue_ids = [...modeSummary.issue_ids];
    completed.validation_report.top_blockers = [
      {
        blocker_type: "merchant_pdp_not_discovered",
        severity: "high",
        affected_layer: "merchant_discovery",
        fix_target: "both_merchant_and_pivota",
        issue_id: merchantIssue.id,
        recommended_action:
          "Improve merchant PDP discovery signals and rerun search-grounded discovery.",
      },
      {
        blocker_type: "pivota_pdp_not_discovered",
        severity: "high",
        affected_layer: "pivota_discovery",
        fix_target: "both_merchant_and_pivota",
        issue_id: pivotaIssue.id,
        recommended_action:
          "Improve Pivota PDP discovery signals and rerun discovery.",
      },
      {
        blocker_type: "low_product_visibility",
        severity: "critical",
        affected_layer: "demand_test",
        recommended_action: "Improve product visibility and rerun Demand Test.",
      },
      {
        blocker_type: "merchant_store_attribution_gap",
        severity: "high",
        affected_layer: "merchant_attribution",
        recommended_action: "Return a verified merchant store/PDP buying path.",
      },
      {
        blocker_type: "pivota_attribution_gap",
        severity: "high",
        affected_layer: "pivota_channel",
        recommended_action: "Publish or verify Pivota PDP / offer attribution.",
      },
    ];

    const report = new MerchantFacingReportService().generate(completed.id, {
      regenerate: true,
    });

    assert.equal(
      report.discovery_result.search_grounded_merchant_pdp_discovery.status,
      "not_found"
    );
    assert.equal(
      report.discovery_result.search_grounded_pivota_pdp_discovery.status,
      "not_found"
    );
    assert.equal(report.discovery_result.url_match_accuracy.status, "not_found");
    assert.equal(
      report.discovery_result.search_grounded_merchant_pdp_discovery.score,
      0
    );
    assert.equal(
      report.discovery_result.search_grounded_pivota_pdp_discovery.score,
      0
    );
    assert.equal(report.discovery_result.url_match_accuracy.score, 0);
    assert.equal(report.discovery_result.organic_product_discovery.status, "not_tested");
    assert.equal(report.discovery_result.buying_path_discovery.status, "not_tested");
    assert.equal(
      report.discovery_result.search_grounded_merchant_pdp_discovery.summary,
      "Search-grounded Gemini did not return the expected merchant PDP."
    );
    assert.equal(
      report.discovery_result.search_grounded_pivota_pdp_discovery.summary,
      "Search-grounded Gemini did not return the expected Pivota PDP."
    );
    assert.match(report.discovery_result.url_match_accuracy.summary, /0%/);
    assert.equal(
      report.discovery_result.search_grounded_merchant_pdp_discovery.issue_id,
      merchantIssue.id
    );
    assert.equal(
      report.discovery_result.search_grounded_pivota_pdp_discovery.issue_id,
      pivotaIssue.id
    );
    assert.match(
      report.discovery_result.search_grounded_merchant_pdp_discovery.evidence,
      /Expected merchant PDP URL was not returned/
    );
    assert.match(report.discoverability_fix_plan.summary, /official merchant PDP/i);
    assert.match(report.discoverability_fix_plan.summary, /Pivota PDP/i);
    assert.ok(
      report.discoverability_fix_plan.merchant_pdp_audit.findings.some(
        (finding) => finding.finding_type === "missing_product_schema"
      )
    );
    assert.ok(
      report.discoverability_fix_plan.pivota_pdp_audit.findings.some(
        (finding) => finding.finding_type === "missing_source_reference"
      )
    );
    assert.ok(
      report.discoverability_fix_plan.merchant_owned_fixes.some((fix) =>
        /Product structured data/i.test(fix)
      )
    );
    assert.ok(
      report.discoverability_fix_plan.pivota_owned_fixes.some((fix) =>
        /verified source reference/i.test(fix)
      )
    );
    assert.ok(
      report.discoverability_fix_plan.pivota_owned_fixes.some((fix) =>
        /Request indexing/i.test(fix)
      )
    );
    assert.ok(
      report.discoverability_fix_plan.pivota_owned_fixes.some((fix) =>
        /internal links/i.test(fix)
      )
    );
    assert.ok(
      report.discoverability_fix_plan.shared_fixes.some((fix) =>
        /wrong URLs/i.test(fix)
      )
    );
    assert.ok(
      report.discoverability_fix_plan.retest_plan.some((step) =>
        /Search-Grounded Product Discovery Test/i.test(step)
      )
    );
    assert.equal(
      report.readiness_result.contextual_merchant_attribution.status,
      "not_tested"
    );
    assert.equal(
      report.readiness_result.contextual_pivota_attribution.status,
      "not_tested"
    );
    const blockerTypes = report.blockers.map((blocker) => blocker.blocker_type);
    assert.ok(blockerTypes.includes("merchant_pdp_not_discovered"));
    assert.ok(blockerTypes.includes("pivota_pdp_not_discovered"));
    assert.equal(blockerTypes.includes("low_product_visibility"), false);
    assert.equal(blockerTypes.includes("merchant_store_attribution_gap"), false);
    assert.equal(blockerTypes.includes("pivota_attribution_gap"), false);
  });
});

test("merchant-facing report states Pivota surfaced-readiness passed while search-grounded discovery failed", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        demand_scan_modes: ["search_grounded_product_discovery_test"],
        pivota_pdp_url: verifiedPivotaPdpUrl,
        canonical_pivota_pdp_url: canonicalPivotaProductEntityUrl,
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const searchMode = completed.validation_report.demand_test_summary.modes_run[0];
    Object.assign(searchMode.aggregate_scores, {
      search_grounded_pivota_pdp_discovery_score: 0,
      search_grounded_merchant_pdp_discovery_score: 0,
      url_match_accuracy_score: 0,
    });
    completed.validation_report.demand_test_summary.modes_run.push({
      ...searchMode,
      scan_mode: "pivota_pdp_attribution_test",
      issue_ids: [],
      aggregate_scores: {
        ...searchMode.aggregate_scores,
        product_entity_visibility_score: 100,
        pivota_pdp_visibility_score: 100,
        pivota_offer_visibility_score: 100,
      },
    });
    completed.validation_report.gmv_assurance_snapshot.demand_test_summary.pivota_attribution_status = {
      status: "passed",
      score: 100,
      issue_id: undefined,
      recommended_next_action: "Monitor Pivota attribution.",
      evidence: "Pivota contextual attribution score is 100.",
    };

    const report = new MerchantFacingReportService().generate(completed.id, {
      regenerate: true,
    });

    assert.match(
      report.discovery_result.search_grounded_pivota_pdp_discovery.summary,
      /ready when surfaced/i
    );
    assert.match(
      report.discovery_result.search_grounded_pivota_pdp_discovery.summary,
      /No discovery uplift is claimed/i
    );
    assert.match(report.discovery_vs_readiness, /ready when surfaced/i);
    assert.match(report.discovery_vs_readiness, /No discovery uplift is claimed/i);
    assert.equal(
      report.discovery_result.search_grounded_pivota_pdp_discovery.status,
      "not_found"
    );
    assert.equal(report.usage_statement.billing_mode, "preview_only");
    assert.equal(report.usage_statement.billing_status, "not_invoiced");
  });
});

test("merchant-facing report records indexing work without claiming uplift when discovery score remains zero", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const completed = await new ProductionValidationRunService().run(
      new ProductionValidationRunService().create(
        productionValidationPayload({
          demand_scan_modes: ["search_grounded_product_discovery_test"],
          pivota_pdp_url: verifiedPivotaPdpUrl,
          canonical_pivota_pdp_url: canonicalPivotaProductEntityUrl,
        })
      ).id
    );
    const searchMode = completed.validation_report.demand_test_summary.modes_run[0];
    Object.assign(searchMode.aggregate_scores, {
      search_grounded_pivota_pdp_discovery_score: 0,
      search_grounded_merchant_pdp_discovery_score: 0,
      url_match_accuracy_score: 0,
    });
    for (const score of getAgentCenterState().scores.filter(
      (item) => item.scan_target_id === completed.scan_target_id
    )) {
      Object.assign(score.aggregate_scores, searchMode.aggregate_scores);
    }
    new PivotaIndexingTaskService().create({
      product_entity_id: completed.validation_report.target_summary.product_entity_id,
      canonical_pivota_pdp_url:
        completed.validation_report.target_summary.canonical_pivota_pdp_url,
      task_type: "request_indexing",
      status: "completed",
      evidence: {
        search_console_property_verified: true,
        sitemap_submitted: true,
        sitemap_url: "https://agent.pivota.cc/sitemap.xml",
        url_inspection_status: "inspectable",
        indexing_requested: true,
        operator: "pivota_ops",
        evidence_note: "Indexing request recorded after public PDP fixes.",
      },
    });

    const report = new MerchantFacingReportService().generate(completed.id, {
      regenerate: true,
    });
    const summary = new PivotaIndexingTaskService().summary(
      completed.validation_report.target_summary.product_entity_id
    );

    assert.equal(
      report.discovery_result.search_grounded_pivota_pdp_discovery.status,
      "not_found"
    );
    assert.match(
      report.discovery_result.search_grounded_pivota_pdp_discovery.summary,
      /Indexing work was recorded/i
    );
    assert.match(
      report.discovery_result.search_grounded_pivota_pdp_discovery.summary,
      /No discovery uplift is claimed yet/i
    );
    assert.equal(summary.last_search_grounded_discovery_score, 0);
    assert.equal(summary.uplift_claim_allowed, false);
    assert.equal(report.pivota_discovery_progress.uplift_claim_allowed, false);
    assert.match(report.pivota_discovery_progress.summary, /Indexing work was recorded/i);
    assert.ok(
      report.pivota_discovery_progress.steps.some(
        (step) =>
          step.step_key === "url_inspection_indexing_requested" &&
          step.status === "completed"
      )
    );
    const markdown = new MerchantFacingReportService().toMarkdown(report);
    assert.ok(markdown.includes("## Pivota Discovery Progress"));
    assert.equal(markdown.includes("pivota_indexing_task_"), false);
    const overview = getAgentCenterOverview(
      completed.validation_report.gmv_assurance_snapshot.merchant_id
    );
    assert.equal(overview.pivota_discovery_progress.uplift_claim_allowed, false);
    assert.equal(report.usage_statement.billing_mode, "preview_only");
    assert.equal(report.usage_statement.billing_status, "not_invoiced");
  });
});

test("merchant-facing report includes Pivota-owned optimization applied section", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const completed = await new ProductionValidationRunService().run(
      new ProductionValidationRunService().create(
        productionValidationPayload({
          demand_scan_modes: ["search_grounded_product_discovery_test"],
          pivota_pdp_url: verifiedPivotaPdpUrl,
        })
      ).id
    );
    const baseIssue = getAgentCenterState().issues.find(
      (issue) => issue.scan_target_id === completed.scan_target_id
    );
    const pivotaIssue = {
      ...baseIssue,
      id: "issue_report_pivota_optimization_gap",
      issue_type: "pivota_pdp_not_discovered",
      severity: "high",
      merchant_facing_summary:
        "Search-grounded Gemini did not return the expected Pivota PDP.",
      evidence: {
        ...baseIssue.evidence,
        summary: "Expected Pivota PDP URL was not returned by search-grounded Gemini.",
      },
    };
    getAgentCenterState().issues.push(pivotaIssue);
    completed.issue_ids = [pivotaIssue.id];
    completed.validation_report.top_blockers = [
      {
        blocker_type: "pivota_pdp_not_discovered",
        severity: "high",
        affected_layer: "pivota_discovery",
        fix_target: "pivota_unified_pdp",
        issue_id: pivotaIssue.id,
        recommended_action:
          "Improve Pivota PDP discovery signals and rerun discovery.",
      },
    ];

    const optimization = new PivotaOptimizationService();
    const sourcePatch = optimization
      .generate(pivotaIssue.id)
      .find((patch) => patch.patch_type === "pivota_source_reference_patch");
    const [appliedPatch] = optimization.apply(pivotaIssue.id, {
      patch_id: sourcePatch.id,
    });
    appliedPatch.rerun_result = {
      before_scores: {
        aggregate_scores: {
          search_grounded_pivota_pdp_discovery_score: 0,
        },
      },
      after_scores: {
        aggregate_scores: {
          search_grounded_pivota_pdp_discovery_score: 0,
        },
      },
      score_delta: {},
    };

    const report = new MerchantFacingReportService().generate(completed.id, {
      regenerate: true,
    });
    const markdown = new MerchantFacingReportService().toMarkdown(report);

    assert.equal(
      report.pivota_owned_optimization_applied.status,
      "applied_no_uplift"
    );
    assert.match(
      report.pivota_owned_optimization_applied.summary,
      /search-grounded discovery has not yet returned the Pivota PDP/i
    );
    assert.ok(
      report.pivota_owned_optimization_applied.actions_applied.some(
        (action) => action.patch_type === "pivota_source_reference_patch"
      )
    );
    assert.equal(
      report.pivota_owned_optimization_applied.score_deltas[0].delta,
      0
    );
    assert.match(markdown, /Pivota-Owned Optimization Applied/);
    assert.doesNotMatch(markdown, /raw_output|prompt trace|input_tokens|output_tokens/i);
  });
});

test("merchant-facing report draft API is internal and idempotent", async () => {
  resetAgentCenterState();
  await withInternalProductionValidationEnv(async () => {
    await withMockProductionValidationFetch(async () => {
      const run = new ProductionValidationRunService().create(
        productionValidationPayload({
          pivota_pdp_quality_findings: pivotaLivePdpQualityFindings,
        })
      );
      const completed = await new ProductionValidationRunService().run(run.id);
      const created = await handleAgentCenterRequest(
        internalProductionValidationRequest(
          `https://example.test/api/agent-center/internal-production-validation-runs/${completed.id}/report-draft`,
          { method: "POST" }
        ),
        {
          path: [
            "internal-production-validation-runs",
            completed.id,
            "report-draft",
          ],
        }
      );
      const fetched = await handleAgentCenterRequest(
        internalProductionValidationRequest(
          `https://example.test/api/agent-center/internal-production-validation-runs/${completed.id}/report-draft`
        ),
        {
          path: [
            "internal-production-validation-runs",
            completed.id,
            "report-draft",
          ],
        }
      );
      const createdPayload = await created.json();
      const fetchedPayload = await fetched.json();

      assert.equal(created.status, 201);
      assert.equal(fetched.status, 200);
      assert.equal(fetchedPayload.report.id, createdPayload.report.id);
      assert.equal(fetchedPayload.report.report_status, "draft");
      assert.equal(
        fetchedPayload.report.usage_statement.billing_status,
        "not_invoiced"
      );

      const reviewed = await handleAgentCenterRequest(
        internalProductionValidationRequest(
          `https://example.test/api/agent-center/internal-production-validation-runs/${completed.id}/report-draft`,
          {
            method: "PATCH",
            body: JSON.stringify({
              report_status: "reviewed",
              reviewed_by: "operator@example.com",
            }),
          }
        ),
        {
          path: [
            "internal-production-validation-runs",
            completed.id,
            "report-draft",
          ],
        }
      );
      const reviewedPayload = await reviewed.json();

      assert.equal(reviewed.status, 200);
      assert.equal(reviewedPayload.report.report_status, "reviewed");
      assert.equal(reviewedPayload.report.status, "reviewed");
      assert.equal(reviewedPayload.report.reviewed_by, "operator@example.com");
      assert.ok(reviewedPayload.report.reviewed_at);

      const approved = await handleAgentCenterRequest(
        internalProductionValidationRequest(
          `https://example.test/api/agent-center/internal-production-validation-runs/${completed.id}/report-draft`,
          {
            method: "PATCH",
            body: JSON.stringify({
              report_status: "approved_to_share",
              approved_by: "lead@example.com",
            }),
          }
        ),
        {
          path: [
            "internal-production-validation-runs",
            completed.id,
            "report-draft",
          ],
        }
      );
      const approvedPayload = await approved.json();

      assert.equal(approved.status, 200);
      assert.equal(approvedPayload.report.report_status, "approved_to_share");
      assert.equal(approvedPayload.report.approved_by, "lead@example.com");
      assert.ok(approvedPayload.report.approved_to_share_at);
    });
  });
});

test("merchant-facing report markdown and safety warnings exclude raw debug payload", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        pivota_pdp_url: undefined,
        merchant_offer_input: undefined,
        pivota_offer_input: undefined,
        merchant_checkout_input: undefined,
        pivota_checkout_input: undefined,
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const service = new MerchantFacingReportService();
    const report = service.generate(completed.id);
    const markdown = service.toMarkdown(report).toLowerCase();

    assert.ok(
      report.safety_warnings.some(
        (warning) => warning.warning_type === "checkout_not_tested"
      )
    );
    assert.ok(
      report.safety_warnings.some(
        (warning) => warning.warning_type === "pivota_pdp_not_provided"
      )
    );
    assert.ok(
      report.safety_warnings.some(
        (warning) => warning.warning_type === "raw_debug_payload_excluded"
      )
    );
    assert.match(markdown, /merchant-owned path/);
    assert.match(markdown, /pivota agent-facing path/);
    assert.match(markdown, /discovery vs readiness/);
    assert.equal(markdown.includes("raw_output"), false);
    assert.equal(markdown.includes("token_count"), false);
    assert.equal(markdown.includes("provider response details"), true);
    assert.equal(markdown.includes("debug payload"), false);
  });
});

test("production validation maps live Pivota PDP quality findings to blocker issue", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const run = new ProductionValidationRunService().create(
      productionValidationPayload({
        pivota_pdp_url: verifiedPivotaPdpUrl,
        pivota_offer_id: verifiedPivotaOfferId,
        pivota_pdp_quality_findings: pivotaLivePdpQualityFindings,
        merchant_offer_input: {
          price: 12.6,
          currency: "USD",
          coupon_status: "none",
          inventory_status: "in_stock",
        },
        pivota_offer_input: {
          price: 12.6,
          currency: "USD",
          coupon_status: "none",
          inventory_status: "in_stock",
        },
      })
    );
    const completed = await new ProductionValidationRunService().run(run.id);
    const report = completed.validation_report;
    const issue = getAgentCenterState().issues.find(
      (item) => item.issue_type === "pivota_pdp_content_quality_gap"
    );

    assert.ok(issue, "expected Pivota PDP content quality issue");
    assert.equal(issue.blocker_eligible, true);
    assert.deepEqual(
      issue.evidence.pivota_pdp_quality_findings,
      pivotaLivePdpQualityFindings
    );
    assert.equal(report.pivota_pdp_quality_summary.status, "needs_work");
    assert.deepEqual(
      report.pivota_pdp_quality_summary.findings,
      pivotaLivePdpQualityFindings
    );
    assert.ok(
      report.top_blockers.some(
        (blocker) => blocker.blocker_type === "pivota_pdp_content_quality_gap"
      )
    );
    assert.equal(report.usage_summary.billing_mode, "preview_only");
    assert.equal(report.usage_summary.billing_status, "not_invoiced");
  });
});

test("production validation delete marks run deleted and cleans temporary state", async () => {
  resetAgentCenterState();
  await withMockProductionValidationFetch(async () => {
    const service = new ProductionValidationRunService();
    const run = service.create(
      productionValidationPayload({
        merchant_offer_input: {
          price: 18.99,
          currency: "USD",
          coupon_status: "none",
          inventory_status: "in_stock",
        },
      })
    );
    const completed = await service.run(run.id);
    const scanTargetId = completed.scan_target_id;
    const issueId = completed.issue_ids[0];
    const deleted = service.delete(run.id);

    assert.equal(deleted.status, "deleted");
    assert.ok(deleted.deleted_at);
    assert.equal(
      getAgentCenterState().scanTargets.some((target) => target.id === scanTargetId),
      false
    );
    assert.equal(
      getAgentCenterState().issues.some((issue) => issue.id === issueId),
      false
    );
    assert.equal(
      getAgentCenterState().usageEvents.some((event) =>
        completed.usage_event_ids.includes(event.id)
      ),
      false
    );
  });
});

test("internal production validation rewrite target uses shared Agent Center handler", async () => {
  resetAgentCenterState();
  await withInternalProductionValidationEnv(async () => {
    await withMockProductionValidationFetch(async () => {
      const created = await handleAgentCenterRequest(
        internalProductionValidationRequest(
          "https://example.test/api/agent-center/internal-production-validation-runs",
          {
            method: "POST",
            body: JSON.stringify(productionValidationPayload()),
          }
        ),
        { path: ["internal-production-validation-runs"] }
      );
      const createdPayload = await created.json();
      const runId = createdPayload.production_validation_run.id;
      const ran = await handleAgentCenterRequest(
        internalProductionValidationRequest(
          `https://example.test/api/agent-center/internal-production-validation-runs/${runId}/run`,
          { method: "POST" }
        ),
        { path: ["internal-production-validation-runs", runId, "run"] }
      );
      const ranPayload = await ran.json();
      const deleted = await handleAgentCenterRequest(
        internalProductionValidationRequest(
          `https://example.test/api/agent-center/internal-production-validation-runs/${runId}`,
          { method: "DELETE" }
        ),
        { path: ["internal-production-validation-runs", runId] }
      );
      const deletedPayload = await deleted.json();

      assert.equal(created.status, 201);
      assert.equal(ranPayload.production_validation_run.status, "completed");
      assert.equal(deletedPayload.production_validation_run.status, "deleted");
    });
  });
});

test("production validation run route can clean up in the same invocation", async () => {
  resetAgentCenterState();
  await withInternalProductionValidationEnv(async () => {
    await withMockProductionValidationFetch(async () => {
      const created = await handleAgentCenterRequest(
        internalProductionValidationRequest(
          "https://example.test/api/agent-center/internal-production-validation-runs",
          {
            method: "POST",
            body: JSON.stringify(productionValidationPayload()),
          }
        ),
        { path: ["internal-production-validation-runs"] }
      );
      const createdPayload = await created.json();
      const runId = createdPayload.production_validation_run.id;
      const ran = await handleAgentCenterRequest(
        internalProductionValidationRequest(
          `https://example.test/api/agent-center/internal-production-validation-runs/${runId}/run`,
          {
            method: "POST",
            body: JSON.stringify({ cleanup_after_run: true }),
          }
        ),
        { path: ["internal-production-validation-runs", runId, "run"] }
      );
      const ranPayload = await ran.json();

      assert.equal(ranPayload.production_validation_run.status, "completed");
      assert.equal(ranPayload.cleanup.status, "deleted");
      assert.equal(
        getAgentCenterState().scanTargets.some(
          (target) =>
            target.id === ranPayload.production_validation_run.scan_target_id
        ),
        false
      );
    });
  });
});

test("cleanupExpiredDemoFixtures expires stale internal fixtures", () => {
  resetAgentCenterState();
  const created = new DemoFixtureService().create({
    preset: "clean_offer",
    ttl_minutes: -1,
    environment: "test",
  });
  const fixtureId = created.fixture.fixture_id;
  const cleaned = cleanupExpiredDemoFixtures();

  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].fixture.cleanup_status, "expired");
  assert.equal(
    getAgentCenterState().stores.some((store) => store.fixture_id === fixtureId),
    false
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

test("Issue Detail renders Offer Execution Diagnosis controls", async () => {
  const source = await readFile(
    new URL("../../app/agent-center/issues/[issueId]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /Offer Execution Diagnosis/);
  assert.match(source, /Run Offer Diagnosis/);
  assert.match(source, /Regenerate Offer Patch/);
  assert.match(source, /Attach to Retest Plan/);
  assert.match(source, /offer-diagnosis/);
  assert.match(source, /regenerate-offer-patch/);
  assert.match(source, /attach-offer-diagnosis-to-retest/);
});

test("Issue Detail renders Checkout Verification Diagnosis controls", async () => {
  const source = await readFile(
    new URL("../../app/agent-center/issues/[issueId]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /Checkout Verification Diagnosis/);
  assert.match(source, /Run Checkout Diagnosis/);
  assert.match(source, /Regenerate Checkout Patch/);
  assert.match(source, /Attach to Retest Plan/);
  assert.match(source, /checkout-diagnosis/);
  assert.match(source, /regenerate-checkout-patch/);
  assert.match(source, /attach-checkout-diagnosis-to-retest/);
});

test("Issue Detail renders Issue Resolution Workflow controls", async () => {
  const source = await readFile(
    new URL("../../app/agent-center/issues/[issueId]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /Resolution Plan/);
  assert.match(source, /Generate Resolution Plan/);
  assert.match(source, /Retest Resolution Plan/);
  assert.match(source, /Discovery blocker/);
  assert.match(source, /Recommended discovery fixes/);
  assert.match(source, /Tested organic queries/);
  assert.match(source, /Dominant competitors/);
  assert.match(source, /Differentiation recommendations/);
  assert.match(source, /organic_product_discovery_test/);
  assert.match(source, /resolution-plan/);
  assert.match(source, /Recommended actions/);
});

test("Agent Center overview renders GMV Assurance summary", async () => {
  const source = await readFile(
    new URL("../../app/agent-center/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /Agentic GMV Assurance Summary/);
  assert.match(source, /Readiness Dimensions/);
  assert.match(source, /Top Blockers/);
  assert.match(source, /Assurance Usage Preview/);
  assert.match(source, /ready_for_agentic_checkout/);
  assert.ok(source.includes("gmv-assurance/snapshots"));
});

test("internal report preview page renders report review controls", async () => {
  const source = await readFile(
    new URL(
      "../../app/internal/agent-center/production-validation-runs/[runId]/report/page.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const copySource = await readFile(
    new URL(
      "../../app/internal/agent-center/production-validation-runs/[runId]/report/copy-markdown-button.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(source, /Merchant Validation Report Preview/);
  assert.match(source, /Report draft missing/);
  assert.match(source, /Generate report draft/);
  assert.match(source, /Regenerate report draft/);
  assert.match(source, /Mark reviewed/);
  assert.match(source, /Mark approved_to_share/);
  assert.match(source, /Executive Summary/);
  assert.match(source, /Discovery vs Readiness/);
  assert.match(source, /Discoverability/);
  assert.match(source, /Discovery Result/);
  assert.match(source, /Discovery Evidence/);
  assert.match(source, /Discoverability Fix Plan/);
  assert.match(source, /Merchant PDP audit findings/);
  assert.match(source, /Pivota PDP \/ Indexability audit findings/);
  assert.match(source, /Indexability Audit/);
  assert.match(source, /status \\?\\?/);
  assert.match(source, /Merchant-owned fixes/);
  assert.match(source, /Pivota-owned fixes/);
  assert.match(source, /Shared fixes/);
  assert.match(source, /Merchant-Owned Path/);
  assert.match(source, /Pivota Agent-Facing Path/);
  assert.match(source, /Blockers and Recommended Fixes/);
  assert.match(source, /What V1 Does Not Prove/);
  assert.match(source, /Usage Preview/);
  assert.match(source, /Safety Warnings/);
  assert.match(source, /Provider response details and internal diagnostics are excluded/i);
  assert.match(copySource, /Copy report as Markdown/);
  assert.match(copySource, /navigator.clipboard.writeText/);
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

test("search-grounded discovery usage remains preview-only and not invoiced", async () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
  try {
    const { target } = createConnectedTarget();
    target.scan_mode = "search_grounded_product_discovery_test";
    const cluster = new QueryClusterService().generateForScanTarget(target.id)[0];
    const job = new DemandTestJobService().create({
      scan_target_id: target.id,
      query_cluster_ids: [cluster.id],
      providers: ["gemini"],
      prompt_template_ids: ["general_recommendation_v1"],
      repetitions: 1,
    });
    const results = await new DemandTestJobService().run(job.id);

    assert.equal(
      results.aggregate_scores.search_grounded_merchant_pdp_discovery_score,
      "not_configured"
    );
    assert.ok(results.usage_events.length > 0);
    assert.ok(
      results.usage_events.every(
        (event) =>
          event.billing_mode === "preview_only" &&
          event.billing_status === "not_invoiced"
      )
    );
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
    else process.env.GEMINI_SEARCH_GROUNDING_ENABLED = previous;
  }
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
