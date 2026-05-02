import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PIVOTA_AGENT_CENTER_MOCK_GEMINI = "true";

const repository = await import("../../lib/agent-center/repository.ts");
const provider = await import("../../lib/agent-center/provider.ts");
const services = await import("../../lib/agent-center/services.ts");
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
  MerchantFacingReportService,
  MerchantStoreService,
  OfferExecutionService,
  ProductionValidationRunService,
  ProductNameNormalizer,
  ProductMatchService,
  ProductUnderstandingService,
  QueryClusterService,
  ScanTargetService,
  ScoringService,
  UsageMeteringService,
  VerificationService,
} = services;
const {
  handleAgentCenterRequest,
  handleInternalDemoFixturesRequest,
  handleInternalProductionValidationRunsRequest,
} = apiHandlers;

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

const pivotaLivePdpQualityFindings = [
  "missing_pdp_identity",
  "product_intel_module_empty_or_blocked",
  "missing_overview_from_available_description",
  "similar_card_missing_highlight",
];

const pivotaPdpQualityNextAction =
  "Complete Pivota PDP identity, overview, product intelligence module, and similar-card highlight, then rerun Pivota PDP Attribution Test and GMV Assurance Snapshot.";

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
  if (groundingEnabled) process.env.GEMINI_SEARCH_GROUNDING_ENABLED = "true";
  else delete process.env.GEMINI_SEARCH_GROUNDING_ENABLED;
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

  assert.deepEqual(search.requestBody.tools, [{ google_search: {} }]);
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

    const report = new MerchantFacingReportService().generate(completed.id);
    const serialized = JSON.stringify(report).toLowerCase();

    assert.equal(report.production_validation_run_id, completed.id);
    assert.equal(report.status, "draft");
    assert.equal(report.tested_product.product_name, completed.product_name);
    assert.equal(
      report.path_readiness.merchant_owned_path.merchant_pdp_url,
      completed.merchant_pdp_url
    );
    assert.equal(
      report.path_readiness.pivota_agent_facing_path.pivota_pdp_url,
      completed.pivota_pdp_url
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
    assert.ok(report.sharing_notes.some((note) => /raw provider/i.test(note)));
    assert.equal(serialized.includes("token_count"), false);
    assert.equal(serialized.includes("raw_output"), false);
    assert.equal(
      new MerchantFacingReportService().latestForRun(completed.id).id,
      report.id
    );
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
      assert.equal(
        fetchedPayload.report.usage_statement.billing_status,
        "not_invoiced"
      );
    });
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
