import type {
  AgentCenterState,
  MerchantStore,
  ProductRecord,
  ProviderRegistry,
  PromptTemplate,
  StorePlatformConnection,
} from "./types";

const DEMO_MERCHANT_ID = "merchant_demo";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

function nowIso() {
  return new Date().toISOString();
}

function configuredGeminiModel() {
  const configured = (process.env.PIVOTA_AGENT_CENTER_GEMINI_MODEL || "")
    .trim()
    .replace(/^models\//, "");

  if (!configured) {
    return DEFAULT_GEMINI_MODEL;
  }

  return configured === "gemini-3.0-flash-preview"
    ? "gemini-3-flash-preview"
    : configured;
}

function skincareProducts(): ProductRecord[] {
  return [
    {
      id: "prod_vitamin_c_serum",
      product_entity_id: "pe_vitamin_c_serum",
      sku: "sku_vitc_30ml",
      title: "Hydrating Vitamin C Serum",
      brand: "Demo Skincare Brand",
      category: "skincare",
      price: 42,
      currency: "USD",
      pdp_url: "https://demo.pivota.cc/products/hydrating-vitamin-c-serum",
      attributes: {
        vitamin_c: true,
        hydration: true,
        texture: "light serum",
      },
      pivota_attributes: {
        vitamin_c: true,
        hydration: true,
        agent_summary:
          "A lightweight vitamin C serum focused on glow and hydration.",
      },
      agent_summary:
        "A lightweight vitamin C serum focused on glow and hydration.",
      priority: "high",
    },
    {
      id: "prod_sensitive_moisturizer",
      product_entity_id: "pe_sensitive_moisturizer",
      sku: "sku_moist_sensitive_50ml",
      title: "Sensitive Skin Moisturizer",
      brand: "Demo Skincare Brand",
      category: "skincare",
      price: 36,
      currency: "USD",
      pdp_url: "https://demo.pivota.cc/products/sensitive-skin-moisturizer",
      attributes: {
        sensitive_skin: true,
        fragrance_free: true,
        moisturizer: true,
      },
      pivota_attributes: {
        moisturizer: true,
        agent_summary:
          "A gentle daily moisturizer. The sensitive-skin and fragrance-free claims need clearer structured attributes.",
      },
      agent_summary:
        "A gentle daily moisturizer for compromised or easily irritated skin.",
      priority: "high",
    },
    {
      id: "prod_beginner_retinol",
      product_entity_id: "pe_beginner_retinol",
      sku: "sku_retinol_beginner_30ml",
      title: "Beginner Retinol Cream",
      brand: "Demo Skincare Brand",
      category: "skincare",
      price: 48,
      currency: "USD",
      pdp_url: "https://demo.pivota.cc/products/beginner-retinol-cream",
      attributes: {
        retinol: true,
        beginner_friendly: true,
        nighttime: true,
      },
      pivota_attributes: {
        retinol: true,
        agent_summary:
          "A retinol cream positioned for first-time retinoid users.",
      },
      agent_summary:
        "A retinol cream positioned for first-time retinoid users.",
      priority: "medium",
    },
  ];
}

function providerRegistry(): ProviderRegistry[] {
  return [
    {
      provider: "gemini",
      status: "active",
      role: "baseline_provider",
      supports_structured_output: true,
      supports_web_grounding: true,
      supports_batch: true,
      default_model: configuredGeminiModel(),
      enabled_for_v1: true,
      credit_multiplier: 1,
    },
    {
      provider: "openai",
      status: "planned",
      role: "core_provider",
      supports_structured_output: true,
      supports_web_grounding: true,
      supports_batch: true,
      enabled_for_v1: false,
      credit_multiplier: 2,
    },
    {
      provider: "claude",
      status: "planned",
      role: "provider_and_evaluator",
      supports_structured_output: true,
      supports_batch: true,
      enabled_for_v1: false,
      credit_multiplier: 2,
    },
    {
      provider: "perplexity",
      status: "planned",
      role: "web_grounded_search_proxy",
      supports_web_grounding: true,
      supports_openai_compatible_client: true,
      enabled_for_v1: false,
      credit_multiplier: 2.5,
    },
    {
      provider: "copilot",
      status: "research_required",
      role: "enterprise_or_surface_specific_testing",
      enabled_for_v1: false,
      credit_multiplier: null,
    },
  ];
}

function promptTemplates(): PromptTemplate[] {
  return [
    {
      id: "general_recommendation_v1",
      template_type: "general_recommendation",
      version: 1,
      language: "en",
      prompt:
        'You are helping a consumer find products to buy.\n\nUser query:\n"{{query}}"\n\nReturn up to 5 recommended products. For each product include product_name, brand, rank, why_it_matches, likely_price_range, and purchase_path_present. Return only JSON matching the provided schema.',
      required_output_schema_id: "parsed_recommendation_v1",
      status: "active",
    },
    {
      id: "purchase_ready_v1",
      template_type: "purchase_ready",
      version: 1,
      language: "en",
      prompt:
        'A consumer is ready to buy.\n\nUser query:\n"{{query}}"\n\nRecommend products that are specific enough for a buyer to evaluate. Return only JSON matching the provided schema.',
      required_output_schema_id: "parsed_recommendation_v1",
      status: "active",
    },
    {
      id: "attribute_specific_v1",
      template_type: "attribute_specific",
      version: 1,
      language: "en",
      prompt:
        'Evaluate products for this attribute-specific shopping intent.\n\nUser query:\n"{{query}}"\n\nFocus on whether recommended products clearly satisfy the required attributes. Return only JSON matching the provided schema.',
      required_output_schema_id: "parsed_recommendation_v1",
      status: "active",
    },
    {
      id: "merchant_aware_evaluation_v1",
      template_type: "merchant_aware_evaluation",
      version: 1,
      language: "en",
      prompt:
        'You are evaluating whether the following product is a good match for the user shopping intent.\n\nUser query:\n"{{query}}"\n\nMerchant product data:\n{{merchant_product_data}}\n\nPivota unified PDP data:\n{{pivota_product_data}}\n\nReturn only JSON matching the provided schema.',
      required_output_schema_id: "parsed_recommendation_v1",
      status: "active",
    },
    {
      id: "pivota_pdp_readiness_v1",
      template_type: "pivota_pdp_readiness",
      version: 1,
      language: "en",
      prompt:
        'Evaluate whether this Pivota unified PDP is agent-ready for the user query.\n\nUser query:\n"{{query}}"\n\nPivota unified PDP:\n{{pivota_product_data}}\n\nReturn readiness, missing attributes, recommended updates, and confidence as JSON.',
      required_output_schema_id: "parsed_recommendation_v1",
      status: "active",
    },
  ];
}

function initialStores(createdAt: string): MerchantStore[] {
  return [
    {
      id: "store_shopify_us",
      merchant_id: DEMO_MERCHANT_ID,
      store_name: "Demo Skincare Shopify US",
      store_url: "https://demo.pivota.cc",
      platform: "shopify",
      market: "US",
      language: "en",
      currency: "USD",
      integration_status: "connected",
      primary_category: "skincare",
      competitor_brands: ["Competitor A", "Competitor B", "Competitor C"],
      competitor_products: [
        "Competitor Vitamin C Serum",
        "Barrier Repair Moisturizer",
        "Gentle Retinol Night Cream",
      ],
      products: skincareProducts(),
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];
}

function initialConnections(createdAt: string): StorePlatformConnection[] {
  return [
    {
      id: "conn_shopify_us",
      merchant_id: DEMO_MERCHANT_ID,
      store_id: "store_shopify_us",
      platform: "shopify",
      status: "connected",
      last_catalog_sync_at: createdAt,
      last_offer_sync_at: null,
      last_checkout_sync_at: null,
      capabilities: {
        catalog: true,
        pdp_urls: true,
        sku_variant_map: true,
        structured_attributes: true,
        offers: false,
        checkout: false,
        orders: false,
      },
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];
}

function createInitialState(): AgentCenterState {
  const createdAt = nowIso();

  return {
    stores: initialStores(createdAt),
    connections: initialConnections(createdAt),
    scanTargets: [],
    readinessSnapshots: [],
    providers: providerRegistry(),
    queryClusters: [],
    promptTemplates: promptTemplates(),
    jobs: [],
    testRuns: [],
    results: [],
    parsedRecommendations: [],
    matches: [],
    scores: [],
    issues: [],
    merchantOffers: [],
    pivotaOffers: [],
    merchantCheckoutPaths: [],
    pivotaCheckoutPaths: [],
    retestPreparations: [],
    verificationRuns: [],
    productUnderstandingDiagnoses: [],
    offerExecutionDiagnoses: [],
    checkoutVerificationDiagnoses: [],
    issueResolutionPlans: [],
    gmvAssuranceSnapshots: [],
    demoFixtures: [],
    productionValidationRuns: [],
    usageEvents: [],
    usagePlan: {
      included_credits: 1000,
      budget_cap_credits: 1500,
    },
    counters: {},
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __pivotaAgentCenterState: AgentCenterState | undefined;
}

export function getAgentCenterState() {
  if (!globalThis.__pivotaAgentCenterState) {
    globalThis.__pivotaAgentCenterState = createInitialState();
  }

  return globalThis.__pivotaAgentCenterState;
}

export function resetAgentCenterState() {
  globalThis.__pivotaAgentCenterState = createInitialState();
  return globalThis.__pivotaAgentCenterState;
}

export function nextId(prefix: string) {
  const state = getAgentCenterState();
  state.counters[prefix] = (state.counters[prefix] || 0) + 1;
  return `${prefix}_${String(state.counters[prefix]).padStart(4, "0")}`;
}

export function touch<T extends { updated_at?: string }>(record: T): T {
  record.updated_at = nowIso();
  return record;
}

export { DEFAULT_GEMINI_MODEL, DEMO_MERCHANT_ID, nowIso };
