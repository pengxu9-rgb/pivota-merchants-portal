import crypto from "node:crypto";
import {
  buildPivotaAttributionPreflight,
  GeminiProviderAdapter,
  PARSED_RECOMMENDATION_SCHEMA,
  parseProviderOutput,
} from "./provider.ts";
import {
  DEFAULT_GEMINI_MODEL,
  DEMO_MERCHANT_ID,
  getAgentCenterRepository,
  getAgentCenterState,
  nextId,
  nowIso,
  touch,
} from "./repository.ts";
import { geminiSearchGroundingEnabled } from "./runtime-config.ts";
import type {
  AgenticGMVIssue,
  AgenticGMVIssueType,
  AttributeGap,
  CheckoutIssueType,
  CheckoutPatchRecommendation,
  CheckoutPathComparison,
  CheckoutReadinessFinding,
  CheckoutVerificationDiagnosis,
  CompetitorMappingFinding,
  CouponStatus,
  DemoFixture,
  DemoFixtureMetadata,
  DemoFixturePreset,
  DemoFixtureType,
  DemandTestInput,
  DemandTestJob,
  DemandTestJobStatus,
  DemandVisibilityScore,
  DiscoverabilityAuditInput,
  DiscoverabilityAuditFinding,
  DiscoverabilityAuditFindingType,
  EntityMappingFinding,
  FixTarget,
  GMVAssuranceBlocker,
  GMVAssuranceDimensionStatus,
  GMVAssuranceDimensionSummary,
  GMVAssuranceSnapshot,
  GMVAssuranceUsageSummary,
  InputReadinessSnapshot,
  InventoryStatus,
  IssueResolutionOwnerType,
  IssueResolutionPlan,
  MerchantFacingDiscoveryReportStatus,
  LLMSurfaceResult,
  LLMSurfaceTestRun,
  MerchantPDPDiscoverabilityAudit,
  MerchantFacingValidationReport,
  MerchantStore,
  MerchantCheckoutPath,
  MentionedProduct,
  MatchConfidence,
  MerchantOffer,
  ParsedRecommendation,
  OfferExecutionDiagnosis,
  OfferExecutionStatus,
  OfferIssueType,
  OfferLayerComparison,
  OfferMismatchFinding,
  OfferPatchRecommendation,
  PivotaOffer,
  PivotaCheckoutPath,
  PivotaPDPDiscoverabilityAudit,
  PivotaPDPIndexabilityAudit,
  PivotaPDPIndexabilityFinding,
  PivotaPDPIndexabilityFindingType,
  PivotaOptimizationPatch,
  PivotaOptimizationPatchType,
  PivotaOptimizationTargetLayer,
  PivotaDiscoveryProgress,
  PivotaIndexingEvidenceStatus,
  PivotaIndexingTask,
  PivotaIndexingTaskEvidence,
  PivotaIndexingTaskStatus,
  PivotaIndexingTaskType,
  PilotProductEntityProvisioningRun,
  ProductEntityIndexBatchRun,
  ProductEntityIndexBatchStage,
  ProductEntityIndexRecord,
  ProductEntityIndexabilityStatus,
  ProductEntityPdpContentStatus,
  ProductLayerComparison,
  ProductMatchLevel,
  ProductMatchResult,
  ProductPatchRecommendation,
  ProductRecord,
  ProductUnderstandingDiagnosis,
  ProductionValidationReport,
  ProductionValidationRun,
  ProductionValidationUrlPreflight,
  ProviderName,
  QueryCluster,
  QueryMappingFinding,
  QueryIntentType,
  RecommendedAction,
  RecommendedActionStatus,
  RetestPreparation,
  ScanMode,
  ScanTarget,
  Severity,
  UsageEstimate,
  UsageEvent,
  VariantMappingFinding,
  VisibilityScoreValue,
  VerificationRun,
} from "./types";

type CreateStoreInput = Partial<MerchantStore> & {
  store_name: string;
  store_url: string;
};

type CreateScanTargetInput = {
  merchant_id?: string;
  store_id: string;
  scan_mode?: ScanMode;
  selected_product_ids?: string[];
  target_type?: ScanTarget["target_type"];
};

type UsageEstimateInput = {
  scan_target_id: string;
  selected_product_ids?: string[];
  query_cluster_ids?: string[];
  providers?: ProviderName[];
  prompt_template_ids?: string[];
  repetitions?: number;
};

type CreateJobInput = UsageEstimateInput & {
  job_type?: DemandTestJob["job_type"];
  parent_issue_id?: string;
};

function hashJson(value: unknown) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function asLower(value: unknown) {
  return String(value || "").toLowerCase();
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isAttributePresent(value: unknown) {
  return value !== undefined && value !== null && value !== "" && value !== false;
}

function missingAttributesForLayer(
  product: ProductRecord | undefined,
  cluster: QueryCluster,
  layer: "merchant" | "pivota"
) {
  const attributes =
    layer === "merchant" ? product?.attributes || {} : product?.pivota_attributes || {};
  return cluster.required_attributes.filter(
    (attribute) => !isAttributePresent(attributes[attribute])
  );
}

function scoreExplanation(
  score: VisibilityScoreValue,
  formula: string,
  explanation: string,
  supportingRuns: string[]
) {
  return {
    score,
    formula,
    explanation,
    supporting_runs: supportingRuns,
  };
}

function numericScore(value: VisibilityScoreValue | undefined) {
  return typeof value === "number" ? value : 0;
}

function executableOfferTestEnabled(scanMode?: ScanMode) {
  return [
    "agentic_execution_test",
    "offer_aware_demand_scan",
    "checkout_aware_gmv_scan",
  ].includes(scanMode || "");
}

function organicDiscoveryTestEnabled(scanMode?: ScanMode) {
  return scanMode === "organic_product_discovery_test";
}

function searchGroundedDiscoveryTestEnabled(scanMode?: ScanMode) {
  return scanMode === "search_grounded_product_discovery_test";
}

function buyingPathDiscoveryTestEnabled(scanMode?: ScanMode) {
  return scanMode === "buying_path_discovery_test";
}

function discoveryTestEnabled(scanMode?: ScanMode) {
  return (
    organicDiscoveryTestEnabled(scanMode) ||
    searchGroundedDiscoveryTestEnabled(scanMode) ||
    buyingPathDiscoveryTestEnabled(scanMode)
  );
}

function geminiSearchGroundingConfigured() {
  return geminiSearchGroundingEnabled();
}

function merchantAttributionTestEnabled(scanMode?: ScanMode) {
  return [
    "merchant_store_attribution_test",
    "agentic_execution_test",
    "offer_aware_demand_scan",
    "checkout_aware_gmv_scan",
  ].includes(scanMode || "");
}

function pivotaAttributionTestEnabled(scanMode?: ScanMode) {
  return [
    "pivota_pdp_attribution_test",
    "agentic_execution_test",
    "offer_aware_demand_scan",
    "checkout_aware_gmv_scan",
  ].includes(scanMode || "");
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type ProductNameProfile = {
  canonical_name: string;
  normalized_canonical_name: string;
  normalized_core_name: string;
  optional_suffix_terms: string[];
  brand_aliases: string[];
  product_aliases: string[];
};

type ProductMentionEvaluation = {
  product: ProductRecord;
  raw_model_product_name: string;
  canonical_product_name: string;
  normalized_model_name: string;
  normalized_model_core_name: string;
  normalized_canonical_name: string;
  normalized_core_name: string;
  optional_suffix_terms: string[];
  brand_aliases: string[];
  product_aliases: string[];
  brand_match: boolean;
  core_product_match: boolean;
  suffix_terms_missing: string[];
  match_level: ProductMatchLevel;
  match_confidence_score: number;
  counts_for_visibility: boolean;
  counts_for_sku_exact_match: boolean;
  ambiguous_match: boolean;
  match_reason: string;
  matched_recommendation_rank: number | null;
};

const PRODUCT_FAMILY_PHRASES = [
  "sunscreen",
  "sun gel",
  "sun cream",
  "sun stick",
  "serum",
  "toner",
  "cleanser",
  "moisturizer",
  "cream",
  "stick",
  "gel",
  "sun",
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function confidenceLabel(score: number): MatchConfidence {
  if (score >= 0.86) return "high";
  if (score >= 0.62) return "medium";
  return "low";
}

function numericMatchLevel(level: ProductMatchLevel): ProductMatchResult["matched_level"] {
  const levels: Record<ProductMatchLevel, ProductMatchResult["matched_level"]> = {
    no_match: 0,
    brand_match: 1,
    product_family_match: 2,
    canonical_product_match: 3,
    sku_match: 4,
    variant_match: 5,
  };
  return levels[level];
}

function isVisibilityMatch(match: { match_level: ProductMatchLevel }) {
  return ["canonical_product_match", "sku_match", "variant_match"].includes(
    match.match_level
  );
}

function isSkuExactMatch(match: { match_level: ProductMatchLevel }) {
  return ["sku_match", "variant_match"].includes(match.match_level);
}

function displayModelProductName(product: { brand?: string; name?: string }) {
  const brand = compactWhitespace(product.brand || "");
  const name = compactWhitespace(product.name || "");
  if (!brand) return name;
  if (!name) return brand;
  const normalizedName = new ProductNameNormalizer().normalizeForCompare(name);
  const normalizedBrand = new ProductNameNormalizer().normalizeForCompare(brand);
  return normalizedName.startsWith(`${normalizedBrand} `) || normalizedName === normalizedBrand
    ? name
    : `${brand} ${name}`;
}

function tokenSet(value: string) {
  return new Set(value.split(" ").filter(Boolean));
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return overlap / union;
}

function tokenCoverage(source: string, target: string) {
  const sourceTokens = tokenSet(source);
  const targetTokens = tokenSet(target);
  if (!sourceTokens.size || !targetTokens.size) return 0;
  const overlap = [...sourceTokens].filter((token) => targetTokens.has(token)).length;
  return overlap / targetTokens.size;
}

function primaryProductFamily(value: string) {
  return PRODUCT_FAMILY_PHRASES.find((phrase) =>
    new RegExp(`(^|\\s)${escapeRegExp(phrase)}(?=\\s|$)`).test(value)
  );
}

function productFamilyCompatible(modelCore: string, canonicalCore: string) {
  const modelFamily = primaryProductFamily(modelCore);
  const canonicalFamily = primaryProductFamily(canonicalCore);
  if (!modelFamily || !canonicalFamily) return modelCore === canonicalCore;
  return modelFamily === canonicalFamily;
}

function suffixFamilyLabel(terms: string[]) {
  const families = new Set<string>();
  if (terms.some((term) => term.startsWith("SPF"))) families.add("SPF");
  if (terms.some((term) => term.startsWith("PA"))) families.add("PA");
  if (terms.some((term) => /\d+(ml|g|oz)$/i.test(term))) families.add("size");
  return [...families].join("/") || "suffix";
}

export class ProductNameNormalizer {
  normalizeUnicode(value: string) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  normalizeForCompare(value: string) {
    return compactWhitespace(
      this.normalizeUnicode(value)
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[\u2010-\u2015]/g, " ")
        .replace(/[^\p{L}\p{N}+]+/gu, " ")
    );
  }

  extractOptionalSuffixTerms(value: string) {
    const normalized = this.normalizeUnicode(value);
    const terms: string[] = [];

    for (const match of normalized.matchAll(/\bspf\s*([0-9]{2,3})\s*(\+)?/gi)) {
      terms.push(`SPF${match[1]}${match[2] || ""}`);
    }
    for (const match of normalized.matchAll(/(?:^|\s)pa\s*(\+{2,4})(?=\s|$)/gi)) {
      terms.push(`PA${match[1]}`);
    }
    for (const match of normalized.matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|g|oz)\b/gi)) {
      terms.push(`${match[1]}${match[2].toLowerCase()}`);
    }
    for (const match of normalized.matchAll(/\b(pack of \d+|\d+\s*pack|value pack|duo|trio|set)\b/gi)) {
      terms.push(compactWhitespace(match[1]).replace(/\s+/g, " "));
    }
    for (const match of normalized.matchAll(/\b(limited edition|special edition|mini edition|travel size|refill)\b/gi)) {
      terms.push(compactWhitespace(match[1]).toLowerCase());
    }

    return unique(terms);
  }

  stripOptionalSuffixTerms(value: string) {
    return compactWhitespace(
      this.normalizeForCompare(value)
        .replace(/\bspf\s*\d{2,3}\s*\+?/g, " ")
        .replace(/(^|\s)pa\s*\+{2,4}(?=\s|$)/g, " ")
        .replace(/\b\d+(?:\.\d+)?\s*(ml|g|oz)\b/g, " ")
        .replace(/\b(pack of \d+|\d+\s*pack|value pack|duo|trio|set)\b/g, " ")
        .replace(/\b(limited edition|special edition|mini edition|travel size|refill)\b/g, " ")
    );
  }

  stripBrandAliases(value: string, aliases: string[]) {
    let stripped = this.normalizeForCompare(value);
    for (const alias of aliases
      .map((item) => this.normalizeForCompare(item))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)) {
      stripped = stripped.replace(
        new RegExp(`(^|\\s)${escapeRegExp(alias)}(?=\\s|$)`, "g"),
        " "
      );
    }
    return compactWhitespace(stripped);
  }

  normalizedCoreName(value: string, brandAliases: string[] = []) {
    return this.stripBrandAliases(this.stripOptionalSuffixTerms(value), brandAliases);
  }

  productProfile(product: ProductRecord, store?: MerchantStore): ProductNameProfile {
    const brandAliases = unique(
      [product.brand, store?.store_name].filter((item): item is string => Boolean(item))
    );
    const normalizedCanonicalName = this.normalizeForCompare(product.title);
    const normalizedCoreName = this.normalizedCoreName(product.title, brandAliases);
    const optionalSuffixTerms = this.extractOptionalSuffixTerms(product.title);
    const productAliases = unique(
      [
        product.title,
        `${product.brand} ${product.title}`,
        product.sku,
        product.product_entity_id,
        normalizedCoreName,
      ]
        .filter(Boolean)
        .map((item) => this.normalizeForCompare(String(item)))
    );

    return {
      canonical_name: product.title,
      normalized_canonical_name: normalizedCanonicalName,
      normalized_core_name: normalizedCoreName,
      optional_suffix_terms: optionalSuffixTerms,
      brand_aliases: brandAliases,
      product_aliases: productAliases,
    };
  }

  missingSuffixTerms(canonicalTerms: string[], modelTerms: string[]) {
    const modelSet = new Set(modelTerms.map((term) => term.toLowerCase()));
    return canonicalTerms.filter((term) => !modelSet.has(term.toLowerCase()));
  }
}

function formatFixTarget(target: FixTarget) {
  const labels: Record<FixTarget, string> = {
    merchant_pdp: "merchant PDP",
    merchant_catalog: "merchant catalog",
    merchant_structured_data: "merchant structured data",
    merchant_variant_map: "merchant variant map",
    pivota_unified_pdp: "Pivota unified PDP",
    pivota_product_graph: "Pivota product graph",
    pivota_query_mapping: "Pivota query mapping",
    merchant_offer_source: "merchant offer source",
    pivota_offer_layer: "Pivota offer layer",
    merchant_inventory_source: "merchant inventory source",
    merchant_promo_source: "merchant promo source",
    merchant_checkout_source: "merchant checkout source",
    pivota_checkout_layer: "Pivota checkout layer",
    merchant_cart_config: "merchant cart configuration",
    both_merchant_and_pivota: "merchant PDP and Pivota unified PDP",
    human_review: "human review",
  };
  return labels[target] || titleCase(target);
}

function patchAttributeActions(attributes: string[], layer: "merchant" | "pivota") {
  if (!attributes.length) {
    return [
      layer === "merchant"
        ? "Clarify product positioning, evidence, and purchase path on the merchant PDP."
        : "Refresh the agent summary and normalized product graph for this query intent.",
    ];
  }

  return attributes.map((attribute) =>
    layer === "merchant"
      ? `Add or clarify ${titleCase(attribute)} on the merchant PDP.`
      : `Normalize ${titleCase(attribute)} on the Pivota unified PDP.`
  );
}

function scanModePromptInstructions(input: {
  scanMode: ScanMode;
  store: MerchantStore;
  product?: ProductRecord;
}) {
  const merchantPdpUrl = input.product?.pdp_url || input.store.store_url;
  const pivotaPdpUrl =
    typeof input.product?.pivota_attributes?.pivota_pdp_url === "string"
      ? input.product.pivota_attributes.pivota_pdp_url
      : "";
  const pivotaProductObjectId =
    typeof input.product?.pivota_attributes?.pivota_product_object_id === "string"
      ? input.product.pivota_attributes.pivota_product_object_id
      : input.product?.product_entity_id || "";
  const pivotaOfferIds = Array.isArray(input.product?.pivota_attributes?.offer_ids)
    ? input.product?.pivota_attributes?.offer_ids
    : [];

  if (input.scanMode === "organic_product_discovery_test") {
    return [
      "",
      "Scan mode: organic_product_discovery_test.",
      "This scan measures natural discovery from category, problem, or shopping-intent prompts.",
      "Do not use or assume merchant PDP URL, Pivota PDP URL, exact product URL, offer ID, or checkout path context.",
      "Return mentioned_brands, mentioned_products, competitor_products, returned_urls if naturally provided, and discovery_type.",
    ].join("\n");
  }

  if (input.scanMode === "search_grounded_product_discovery_test") {
    return [
      "",
      "Scan mode: search_grounded_product_discovery_test.",
      `Product name for search query: ${input.product?.title || "unknown"}.`,
      `Brand for search query: ${input.product?.brand || input.store.store_name}.`,
      "Do not treat expected URLs as context. Evaluate discovery by the URLs and domains returned by the model/search grounding.",
      "Return returned_urls, returned_domains, grounding_sources, merchant_pdp_url_found, pivota_pdp_url_found, and exact-match flags when applicable.",
    ].join("\n");
  }

  if (input.scanMode === "buying_path_discovery_test") {
    return [
      "",
      "Scan mode: buying_path_discovery_test.",
      `Product: ${input.product?.title || "unknown"} by ${input.product?.brand || input.store.store_name}.`,
      "Ask where a shopper or agent should buy this product from official or verified options.",
      "Do not force expected merchant or Pivota URLs. Score only URLs, domains, offers, prices, and availability signals that are returned.",
      "Return returned_urls, returned_domains, buying_path_present, offer_signal_present, price_signal_present, and availability_signal_present.",
    ].join("\n");
  }

  if (input.scanMode === "merchant_store_attribution_test") {
    return [
      "",
      "Scan mode: merchant_store_attribution_test.",
      `Merchant store: ${input.store.store_name}.`,
      `Merchant store URL: ${input.store.store_url}.`,
      `Merchant PDP URL: ${merchantPdpUrl}.`,
      "If a recommended product is supported by the merchant source, include the merchant store and merchant PDP URL as the purchase source.",
      "Set merchant_store_mentioned, merchant_pdp_url_present, merchant_pdp_url, merchant_store_attribution_confidence, purchase_path_type, and channel_attribution accurately.",
      "Use channel_attribution = merchant_store_attributed only when the merchant store or merchant PDP is actually returned as the buying path.",
    ].join("\n");
  }

  if (input.scanMode === "pivota_pdp_attribution_test") {
    return [
      "",
      "Scan mode: pivota_pdp_attribution_test.",
      `Pivota ProductEntity: ${input.product?.product_entity_id || "unknown"}.`,
      `Pivota product object ID: ${pivotaProductObjectId || "unknown"}.`,
      `Pivota PDP URL: ${pivotaPdpUrl || "not available"}.`,
      `Pivota offer IDs: ${pivotaOfferIds.join(", ") || "none"}.`,
      "Pivota public PDP URLs use the agent.pivota.cc/products/{object_id} structure. Do not claim verified Pivota attribution unless that URL or product object ID is explicitly returned.",
      "If a recommended product is supported by the Pivota unified PDP or Pivota product object, include the Pivota PDP URL or product object as the agent-facing path.",
      "Set pivota_pdp_mentioned, pivota_pdp_url_present, pivota_pdp_url, pivota_offer_present, pivota_offer_ids, purchase_path_type, and channel_attribution accurately.",
      "Use verified Pivota channel_attribution values only when the PDP URL, product object ID, or offer ID is actually returned. Otherwise use an unverified Pivota attribution value.",
    ].join("\n");
  }

  return [
    "",
    "Scan mode: open_product_visibility_test.",
    "This scan measures whether the product entity is known and recommended by the model.",
    "Do not mark merchant store, merchant PDP, Pivota PDP, or offer attribution as successful unless the answer explicitly returns those paths.",
  ].join("\n");
}

function promptForScanMode(input: {
  templatePrompt: string;
  query: string;
  scanMode: ScanMode;
  store: MerchantStore;
  product?: ProductRecord;
}) {
  return `${input.templatePrompt.replace("{{query}}", input.query)}${scanModePromptInstructions(input)}`;
}

function queryForScanMode(
  cluster: QueryCluster,
  product: ProductRecord | undefined,
  scanMode: ScanMode,
  repetitionIndex: number
) {
  if (scanMode !== "organic_product_discovery_test") {
    return cluster.queries[(repetitionIndex - 1) % cluster.queries.length];
  }

  const productTitle = asLower(product?.title);
  const brand = asLower(product?.brand);
  const organicQueries = cluster.queries.filter((query) => {
    const text = asLower(query);
    return (
      (!productTitle || !text.includes(productTitle)) &&
      (!brand || !text.includes(brand)) &&
      !text.includes("http")
    );
  });

  return (organicQueries.length ? organicQueries : cluster.queries)[
    (repetitionIndex - 1) % (organicQueries.length ? organicQueries.length : cluster.queries.length)
  ];
}

function topCompetitorRecommendations(matches: ProductMatchResult[]) {
  return unique(
    matches.flatMap((match) =>
      match.competitor_matches.map(
        (competitor) => `${competitor.competitor_name} ${competitor.product_name}`
      )
    )
  ).slice(0, 5);
}

function textIncludesLoose(haystack: string, needle?: string | null) {
  if (!needle) return false;
  return asLower(haystack).includes(asLower(needle));
}

function safeProductLabel(product: { brand?: string; name?: string; title?: string }) {
  return compactWhitespace(`${product.brand || ""} ${product.name || product.title || ""}`);
}

function safeMentionedProductLabel(product: MentionedProduct) {
  return safeProductLabel(product);
}

const DISCOVERY_COMPETITOR_LIKELY_REASONS = [
  "stronger category association",
  "clearer use-case wording",
  "stronger ingredient/claim evidence",
  "stronger public web presence",
  "clearer product page metadata",
  "more obvious buying path",
];

const BEAUTY_DISCOVERY_DIFFERENTIATION_ANGLES = [
  "ingredient positioning",
  "skin type",
  "texture / finish",
  "product family",
  "use case",
  "claim evidence",
  "review proof",
  "comparison/substitute mapping",
];

function merchantSafeDiscoveryEvidence(input: {
  scanTargetId?: string;
  cluster: QueryCluster;
  parsed: ParsedRecommendation[];
  matches?: ProductMatchResult[];
  product?: ProductRecord;
  store?: MerchantStore;
}) {
  const state = getAgentCenterState();
  const testRunsById = new Map(state.testRuns.map((run) => [run.id, run]));
  const competitorBrands = input.store?.competitor_brands || [];
  const targetProduct = input.product?.title || "the merchant product";
  const targetBrand = input.product?.brand || input.store?.store_name || "the merchant brand";
  const returnedProducts = unique(
    input.parsed.flatMap((item) =>
      item.mentioned_products.map(safeMentionedProductLabel).filter(Boolean)
    )
  ).slice(0, 12);
  const returnedBrands = unique(
    input.parsed.flatMap((item) => item.mentioned_brands)
  ).slice(0, 12);
  const returnedCompetitors = unique(
    input.parsed.flatMap((item) =>
      item.competitor_products.length
        ? item.competitor_products
        : item.mentioned_products
            .filter((product) =>
              competitorBrands.some((brand) => textIncludesLoose(product.brand, brand))
            )
            .map(safeMentionedProductLabel)
    )
  ).slice(0, 12);
  const dominantCompetitors = unique(
    input.parsed.flatMap((item) =>
      item.mentioned_products
        .filter((product) =>
          competitorBrands.some((brand) => textIncludesLoose(product.brand, brand))
        )
        .map((product) => product.brand)
        .concat(
          item.competitor_products.map((product) => {
            const brand = competitorBrands.find((candidate) =>
              textIncludesLoose(product, candidate)
            );
            return brand || product.split(" ")[0] || product;
          })
        )
    )
  ).slice(0, 8);
  const testedOrganicQueries = input.parsed
    .map((item, index) => {
      const run = testRunsById.get(item.test_run_id);
      const returnedCompetitorsForRun = unique(
        item.competitor_products.length
          ? item.competitor_products
          : item.mentioned_products
              .filter((product) =>
                competitorBrands.some((brand) =>
                  textIncludesLoose(product.brand, brand)
                )
              )
              .map(safeMentionedProductLabel)
      ).slice(0, 5);

      return {
        query: run?.query || input.cluster.queries[index % input.cluster.queries.length] || input.cluster.cluster_name,
        query_cluster_id: item.query_cluster_id || input.cluster.id,
        returned_products: item.mentioned_products
          .slice()
          .sort((left, right) => left.rank - right.rank)
          .slice(0, 5)
          .map((product) => ({
            brand: product.brand,
            name: product.name,
            rank: product.rank,
            ...(product.reason ? { reason: product.reason } : {}),
          })),
        returned_brands: item.mentioned_brands.slice(0, 8),
        returned_competitors: returnedCompetitorsForRun,
        merchant_product_appeared:
          item.merchant_product_mentioned || item.product_entity_mentioned,
        merchant_brand_appeared: item.merchant_brand_mentioned,
      };
    })
    .slice(0, 6);
  const competitorWins = testedOrganicQueries.filter(
    (item) =>
      item.returned_competitors.length &&
      !item.merchant_product_appeared &&
      !item.merchant_brand_appeared
  );
  const topRankedCompetitors = input.parsed
    .flatMap((item) =>
      item.mentioned_products
        .filter((product) =>
          competitorBrands.some((brand) => textIncludesLoose(product.brand, brand))
        )
        .map((product) => `${product.rank}. ${safeMentionedProductLabel(product)}`)
    )
    .slice(0, 5);
  const competitorRankSummary = topRankedCompetitors.length
    ? `Top competitor recommendations included ${topRankedCompetitors.join("; ")}.`
    : returnedCompetitors.length
      ? `Competitor recommendations appeared: ${returnedCompetitors.slice(0, 5).join(", ")}.`
      : "No concrete competitor recommendations were captured in the normalized output.";
  const missingMerchantProductSummary = testedOrganicQueries.length
    ? `${targetProduct} appeared in ${
        testedOrganicQueries.filter((item) => item.merchant_product_appeared).length
      } of ${testedOrganicQueries.length} normalized organic query example(s); ${targetBrand} appeared in ${
        testedOrganicQueries.filter((item) => item.merchant_brand_appeared).length
      } of ${testedOrganicQueries.length}.`
    : `No normalized organic query examples were available for ${targetProduct}.`;
  const likelyReasons = unique<string>(
    input.parsed
      .flatMap((item) => item.mentioned_products.map((product) => product.reason))
      .filter(Boolean)
      .map((reason) => {
        const lower = asLower(reason);
        if (lower.includes("ingredient") || lower.includes("claim")) {
          return "stronger ingredient/claim evidence";
        }
        if (lower.includes("use") || lower.includes("intent")) {
          return "clearer use-case wording";
        }
        if (lower.includes("metadata") || lower.includes("page")) {
          return "clearer product page metadata";
        }
        if (lower.includes("path") || lower.includes("buy")) {
          return "more obvious buying path";
        }
        if (lower.includes("public") || lower.includes("known")) {
          return "stronger public web presence";
        }
        return "stronger category association";
      })
      .concat([...DISCOVERY_COMPETITOR_LIKELY_REASONS])
  ).slice(0, 6);

  return {
    tested_organic_queries: testedOrganicQueries,
    returned_products: returnedProducts,
    returned_brands: returnedBrands,
    returned_competitors: returnedCompetitors,
    competitor_rank_summary: competitorRankSummary,
    missing_merchant_product_summary: missingMerchantProductSummary,
    likely_competitor_advantage_summary:
      competitorWins.length || returnedCompetitors.length
        ? `Competitors likely dominated because of ${likelyReasons.slice(0, 4).join(", ")}.`
        : "The normalized output did not provide enough competitor evidence to infer a concrete advantage.",
    discovery_interpretation:
      competitorWins.length || returnedCompetitors.length
        ? "Organic no-context discovery did not surface the merchant product/brand in the tested examples, while competitor products occupied the answer surface."
        : "Organic discovery evidence is limited; retesting with additional organic category prompts is recommended before external sharing.",
    competitor_dominance_evidence: {
      dominant_competitors: dominantCompetitors,
      competitor_products: returnedCompetitors,
      query_clusters_where_competitors_won: unique(
        competitorWins.map((item) => input.cluster.cluster_name || item.query_cluster_id)
      ),
      likely_reasons: likelyReasons,
      recommended_differentiation_angles: BEAUTY_DISCOVERY_DIFFERENTIATION_ANGLES,
    },
  };
}

function merchantNarrative(input: {
  issueType: AgenticGMVIssueType;
  rootCause: string;
  recommendedAction: string;
  product?: ProductRecord;
  cluster: QueryCluster;
  parsed: ParsedRecommendation[];
  matches: ProductMatchResult[];
  fixTargets: FixTarget[];
  missingAttributes: string[];
  visibilityScore: number;
  competitorSubstitutionScore: number;
}) {
  const merchantMentions = input.matches.length
    ? input.matches.filter((match) => match.counts_for_visibility).length
    : input.parsed.filter((item) => item.merchant_product_mentioned).length;
  const competitorRecommendations = topCompetitorRecommendations(input.matches);
  const productLabel = input.product?.title || "the merchant product";
  const recommendedInstead = competitorRecommendations.length
    ? competitorRecommendations.join(", ")
    : "No competitor replacement was consistently detected.";

  return {
    what_happened:
      `${productLabel} was tested in "${input.cluster.cluster_name}". ` +
      `Gemini mentioned it in ${merchantMentions} of ${input.parsed.length} completed runs, producing a ${input.visibilityScore}% visibility score.`,
    what_ai_recommended_instead: recommendedInstead,
    why_this_likely_happened: input.rootCause,
    where_to_fix: input.fixTargets.map(formatFixTarget).join(", "),
    recommended_merchant_pdp_changes: input.fixTargets.some((target) =>
      ["merchant_pdp", "merchant_catalog", "both_merchant_and_pivota"].includes(target)
    )
      ? patchAttributeActions(input.missingAttributes, "merchant")
      : ["No merchant PDP change is required for this issue."],
    recommended_pivota_pdp_changes: input.fixTargets.some((target) =>
      [
        "pivota_unified_pdp",
        "pivota_product_graph",
        "pivota_query_mapping",
        "both_merchant_and_pivota",
      ].includes(target)
    )
      ? patchAttributeActions(input.missingAttributes, "pivota")
      : ["No Pivota unified PDP change is required for this issue."],
    how_pivota_will_verify_the_fix:
      `Pivota will rerun the same query cluster with the same Gemini provider set, prompt templates, and repetition count, then compare visibility and substitution scores before and after the patch.`,
  };
}

function getMerchantId(merchantId?: string) {
  return merchantId || DEMO_MERCHANT_ID;
}

function findStore(storeId: string) {
  const store = getAgentCenterState().stores.find((item) => item.id === storeId);
  if (!store) throw new Error(`Store not found: ${storeId}`);
  return store;
}

function findScanTarget(scanTargetId: string) {
  const target = getAgentCenterState().scanTargets.find(
    (item) => item.id === scanTargetId
  );
  if (!target) throw new Error(`Scan target not found: ${scanTargetId}`);
  return target;
}

function findIssue(issueId: string) {
  const issue = getAgentCenterState().issues.find((item) => item.id === issueId);
  if (!issue) throw new Error(`Issue not found: ${issueId}`);
  return issue;
}

function findProduct(store: MerchantStore, productId?: string) {
  if (!productId) return store.products?.[0];
  return store.products?.find((product) => product.id === productId);
}

function findProductForIssue(
  store: MerchantStore,
  issue: AgenticGMVIssue,
  clusters: QueryCluster[] = []
) {
  return (
    store.products?.find(
      (product) =>
        issue.affected_product_entities.includes(product.product_entity_id) ||
        issue.affected_skus.includes(product.sku) ||
        clusters.some((cluster) => cluster.product_id === product.id)
    ) || store.products?.[0]
  );
}

function applyQueryClusterScope(
  clusters: QueryCluster[],
  queryClusterIds?: string[]
) {
  if (!queryClusterIds?.length) return clusters;
  const requested = new Set(queryClusterIds);
  const scoped = clusters.filter((cluster) => requested.has(cluster.id));
  if (!scoped.length) {
    throw new Error("No matching query clusters found for requested scope");
  }
  return scoped;
}

function activePromptTemplateIds() {
  return getAgentCenterState()
    .promptTemplates.filter(
      (template) =>
        template.status === "active" &&
        [
          "general_recommendation_v1",
          "purchase_ready_v1",
          "attribute_specific_v1",
        ].includes(template.id)
    )
    .map((template) => template.id);
}

function pushProgress(job: DemandTestJob, status: DemandTestJobStatus) {
  job.status = status;
  job.progress.push({ status, at: nowIso() });
  touch(job);
}

export class MerchantStoreService {
  list(merchantId = DEMO_MERCHANT_ID) {
    return getAgentCenterState().stores.filter(
      (store) => store.merchant_id === merchantId
    );
  }

  create(input: CreateStoreInput, merchantId = DEMO_MERCHANT_ID) {
    const now = nowIso();
    const store: MerchantStore = {
      id: nextId("store_url"),
      merchant_id: merchantId,
      store_name: input.store_name,
      store_url: input.store_url,
      platform: input.platform || "unknown",
      market: input.market || "US",
      language: input.language || "en",
      currency: input.currency || "USD",
      integration_status: input.integration_status || "url_only",
      primary_category: input.primary_category || "skincare",
      optional_pdp_urls: input.optional_pdp_urls || [],
      optional_sitemap_url: input.optional_sitemap_url,
      competitor_brands: input.competitor_brands || ["Competitor A", "Competitor B"],
      competitor_products: input.competitor_products || [],
      products: input.products || [],
      created_at: now,
      updated_at: now,
    };

    getAgentCenterState().stores.push(store);
    getAgentCenterState().connections.push({
      id: nextId("conn"),
      merchant_id: merchantId,
      store_id: store.id,
      platform: store.platform,
      status: "url_only",
      last_catalog_sync_at: null,
      last_offer_sync_at: null,
      last_checkout_sync_at: null,
      capabilities: {
        catalog: false,
        pdp_urls: Boolean(store.optional_pdp_urls?.length || store.store_url),
        sku_variant_map: false,
        structured_attributes: false,
        offers: false,
        checkout: false,
        orders: false,
      },
      created_at: now,
      updated_at: now,
    });

    return store;
  }

  update(storeId: string, patch: Partial<MerchantStore>) {
    const store = findStore(storeId);
    Object.assign(store, patch);
    return touch(store);
  }
}

export class ScanTargetService {
  create(input: CreateScanTargetInput) {
    const merchantId = getMerchantId(input.merchant_id);
    const store = findStore(input.store_id);
    if (store.merchant_id !== merchantId) {
      throw new Error("Store does not belong to merchant");
    }

    const scanMode =
      input.scan_mode || "open_product_visibility_test";
    const now = nowIso();
    const scanTarget: ScanTarget = {
      id: nextId("scan_target"),
      merchant_id: merchantId,
      store_id: store.id,
      target_type:
        input.target_type ||
        (store.integration_status === "url_only" ? "store_url" : "store"),
      store_name: store.store_name,
      store_url: store.store_url,
      platform: store.platform,
      integration_status: store.integration_status,
      market: store.market,
      language: store.language,
      currency: store.currency,
      scan_mode: scanMode,
      selected_product_ids: input.selected_product_ids || [],
      primary_category: store.primary_category,
      created_at: now,
      updated_at: now,
    };

    getAgentCenterState().scanTargets.push(scanTarget);
    return scanTarget;
  }

  get(scanTargetId: string) {
    return findScanTarget(scanTargetId);
  }
}

export class InputReadinessService {
  createSnapshot(scanTargetId: string) {
    const target = findScanTarget(scanTargetId);
    const store = findStore(target.store_id);
    const connection = getAgentCenterState().connections.find(
      (item) => item.store_id === store.id
    );
    const missingInputs: InputReadinessSnapshot["missing_inputs"] = [];
    const limitations: string[] = [];
    const modes: ScanMode[] = [
      "organic_product_discovery_test",
      "search_grounded_product_discovery_test",
      "buying_path_discovery_test",
      "open_product_visibility_test",
    ];

    let score = 24;
    if (store.store_url) score += 10;
    if (store.primary_category) score += 8;
    if (store.optional_pdp_urls?.length || connection?.capabilities.pdp_urls) score += 8;
    if (store.competitor_brands?.length) score += 10;

    if (connection?.capabilities.catalog || store.products?.length) {
      modes.push("merchant_store_attribution_test");
      modes.push("pivota_pdp_attribution_test");
      score += 20;
    } else {
      missingInputs.push({
        input: "catalog",
        impact: "medium",
        reason: "Needed for SKU-level product matching and catalog-integrated scans.",
      });
    }

    if (connection?.capabilities.structured_attributes) score += 10;
    else {
      missingInputs.push({
        input: "structured_attributes",
        impact: "high",
        reason: "Needed to detect missing attributes with higher confidence.",
      });
    }

    if (!store.competitor_brands?.length) {
      missingInputs.push({
        input: "competitor_list",
        impact: "high",
        reason: "Needed to detect competitor substitution.",
      });
    }

    if (connection?.capabilities.offers && connection.capabilities.checkout) {
      modes.push("agentic_execution_test");
    }

    if (!connection?.capabilities.offers) {
      missingInputs.push({
        input: "offer_promo_data",
        impact: "high",
        reason: "Needed to unlock offer execution testing.",
      });
      limitations.push("Offer execution validation is unavailable without offer data.");
    }

    if (!connection?.capabilities.checkout) {
      limitations.push("Checkout verification is unavailable without checkout integration.");
    }

    if (!geminiSearchGroundingConfigured()) {
      limitations.push(
        "Search-grounded product discovery is available only when Gemini search grounding is configured; otherwise it is marked not configured."
      );
    }

    if (!connection?.capabilities.orders) {
      limitations.push("Order-level GMV attribution is unavailable without order data.");
    }

    if (store.integration_status === "url_only") {
      limitations.push("SKU-level inventory validation is limited in URL-only mode.");
      limitations.push("URL-only mode uses merchant-provided public URLs and avoids cart, account, and checkout paths.");
    }

    const now = nowIso();
    const snapshot: InputReadinessSnapshot = {
      id: nextId("readiness"),
      merchant_id: target.merchant_id,
      store_id: target.store_id,
      scan_target_id: target.id,
      input_completeness_score: clampScore(score),
      available_scan_modes: unique(modes),
      missing_inputs: missingInputs,
      scan_limitations: limitations,
      recommended_run_window: {
        recommendation: score >= 40 ? "run_now" : "improve_inputs_first",
        reason:
          "AI Demand Scan uses product and public PDP inputs and does not touch checkout, payment, or customer data.",
        risk_level: "low",
      },
      created_at: now,
      updated_at: now,
    };

    getAgentCenterState().readinessSnapshots.push(snapshot);
    return snapshot;
  }

  getLatest(scanTargetId: string) {
    const snapshots = getAgentCenterState().readinessSnapshots.filter(
      (snapshot) => snapshot.scan_target_id === scanTargetId
    );
    return snapshots[snapshots.length - 1] || this.createSnapshot(scanTargetId);
  }
}

export class QueryClusterService {
  intentTypes: QueryIntentType[] = [
    "category_recommendation",
    "problem_solution",
    "attribute_specific",
    "budget_constrained",
    "competitor_comparison",
    "dupe_or_substitute",
    "purchase_ready",
    "occasion_or_use_case",
  ];

  generateForScanTarget(scanTargetId: string, selectedProductIds?: string[]) {
    const target = findScanTarget(scanTargetId);
    const store = findStore(target.store_id);
    const selectedIds =
      selectedProductIds?.length
        ? selectedProductIds
        : target.selected_product_ids?.length
          ? target.selected_product_ids
          : store.products?.map((product) => product.id) || [];
    const products =
      store.products?.filter((product) => selectedIds.includes(product.id)) || [];
    const fallbackProducts = products.length
      ? products
      : [
          {
            id: "url_only_product",
            product_entity_id: "pe_url_only",
            sku: "sku_url_only",
            title: `${store.store_name} hero product`,
            brand: store.store_name,
            category: store.primary_category || "skincare",
            currency: store.currency,
            attributes: {},
            pivota_attributes: {},
            priority: "medium" as const,
          },
        ];

    const existing = getAgentCenterState().queryClusters.filter(
      (cluster) =>
        cluster.scan_target_id === scanTargetId &&
        (!selectedIds.length || selectedIds.includes(cluster.product_id || ""))
    );
    if (existing.length >= fallbackProducts.length * this.intentTypes.length) {
      return existing;
    }

    const created: QueryCluster[] = [];
    const now = nowIso();

    for (const product of fallbackProducts) {
      for (const intent of this.intentTypes) {
        const requiredAttributes = this.requiredAttributes(intent, product);
        const cluster: QueryCluster = {
          id: nextId("qc"),
          merchant_id: target.merchant_id,
          store_id: target.store_id,
          scan_target_id: target.id,
          product_entity_id: product.product_entity_id,
          target_skus: product.sku ? [product.sku] : [],
          cluster_name: this.clusterName(intent, product),
          intent_type: intent,
          category: product.category || store.primary_category || "skincare",
          queries: this.queries(intent, product, store),
          priority:
            product.priority === "high" ||
            target.selected_product_ids.includes(product.id)
              ? "high"
              : intent === "competitor_comparison" ||
                  intent === "dupe_or_substitute"
                ? "high"
                : "medium",
          estimated_demand_value:
            product.priority === "high" || intent === "purchase_ready" ? 8400 : 3600,
          created_by: "demand_test_agent",
          required_attributes: requiredAttributes,
          product_id: product.id,
          created_at: now,
          updated_at: now,
        };
        created.push(cluster);
      }
    }

    getAgentCenterState().queryClusters.push(...created);
    return getAgentCenterState().queryClusters.filter(
      (cluster) => cluster.scan_target_id === scanTargetId
    );
  }

  requiredAttributes(intent: QueryIntentType, product: ProductRecord) {
    const title = asLower(product.title);
    const category = asLower(product.category);
    const attributes = new Set<string>();
    if (title.includes("sunscreen") || category.includes("sunscreen")) {
      attributes.add("spf_level");
      attributes.add("pa_rating");
      attributes.add("skin_type");
      attributes.add("finish");
      attributes.add("active_ingredients");
    }
    if (title.includes("sensitive")) attributes.add("sensitive_skin");
    if (title.includes("moisturizer")) attributes.add("fragrance_free");
    if (title.includes("vitamin c")) attributes.add("vitamin_c");
    if (title.includes("retinol")) attributes.add("beginner_friendly");
    if (intent === "budget_constrained") attributes.add("price_band_clarity");
    if (intent === "purchase_ready") attributes.add("purchase_path");
    return [...attributes];
  }

  clusterName(intent: QueryIntentType, product: ProductRecord) {
    const intentLabel = titleCase(intent);
    return `${product.title} ${intentLabel}`;
  }

  queries(intent: QueryIntentType, product: ProductRecord, store: MerchantStore) {
    const category = product.category || store.primary_category || "skincare";
    const competitor = store.competitor_brands?.[0] || "a leading competitor";
    const base = product.title.toLowerCase();

    const queryMap: Record<QueryIntentType, string[]> = {
      category_recommendation: [
        `best ${category} products for visible results`,
        `top ${category} products to buy online`,
        `which ${category} product should I choose for daily use`,
      ],
      problem_solution: [
        `${base} alternative for dull or irritated skin`,
        `best ${category} product for sensitive skin concerns`,
        `what should I buy for stronger skin barrier and glow`,
      ],
      attribute_specific: [
        `fragrance-free ${category} product for sensitive skin`,
        `gentle ${base} with clear ingredient claims`,
        `${category} product with attributes that are easy to compare`,
      ],
      budget_constrained: [
        `best ${category} product under $50`,
        `${base} under ${product.price ? `$${Math.ceil(product.price + 8)}` : "$50"}`,
        `affordable ${category} product with strong reviews`,
      ],
      competitor_comparison: [
        `${product.brand} vs ${competitor} for ${category}`,
        `is ${base} better than ${competitor}`,
        `compare ${base} with ${competitor} alternatives`,
      ],
      dupe_or_substitute: [
        `dupe for ${base}`,
        `substitute for ${base} if it is not available`,
        `similar products to ${base} with clearer claims`,
      ],
      purchase_ready: [
        `where can I buy a reliable ${base}`,
        `recommend a specific ${category} product I can buy today`,
        `best purchase-ready ${category} option with a clear product page`,
      ],
      occasion_or_use_case: [
        `${category} product before an event`,
        `${base} for a simple weekly routine`,
        `easy ${category} product for travel or busy mornings`,
      ],
    };

    return queryMap[intent];
  }
}

export class UsageMeteringService {
  estimate(input: UsageEstimateInput): UsageEstimate {
    const target = findScanTarget(input.scan_target_id);
    const store = findStore(target.store_id);
    const selectedProductIds =
      input.selected_product_ids?.length
        ? input.selected_product_ids
        : target.selected_product_ids.length
          ? target.selected_product_ids
          : store.products?.map((product) => product.id) || [];
    const clusters = new QueryClusterService().generateForScanTarget(
      target.id,
      selectedProductIds
    );
    const scopedClusters = applyQueryClusterScope(clusters, input.query_cluster_ids);
    const scopedProductIds = unique(
      scopedClusters.map((cluster) => cluster.product_id).filter(Boolean)
    );
    const productCount =
      scopedProductIds.length ||
      selectedProductIds.length ||
      Math.max(1, store.products?.length || 1);
    const providers: ProviderName[] = input.providers?.length
      ? input.providers
      : ["gemini"];
    const promptTemplateIds = input.prompt_template_ids?.length
      ? input.prompt_template_ids
      : activePromptTemplateIds();
    const repetitions = input.repetitions || 2;
    const enabledProviders = getAgentCenterState().providers.filter((provider) =>
      providers.includes(provider.provider)
    );
    const providerMultiplier = enabledProviders.reduce(
      (sum, provider) => sum + (provider.credit_multiplier || 0),
      0
    );
    const estimatedCredits = Math.ceil(
      scopedClusters.length *
        promptTemplateIds.length *
        repetitions *
        providerMultiplier
    );
    const used = this.usedCredits(target.merchant_id);
    const included = getAgentCenterState().usagePlan.included_credits;
    const remaining = Math.max(0, included - used);
    const readiness = new InputReadinessService().getLatest(target.id);

    return {
      products_selected: productCount,
      estimated_query_clusters: scopedClusters.length,
      providers,
      prompt_templates: promptTemplateIds,
      repetitions,
      estimated_ai_test_credits: estimatedCredits,
      plan_included_credits: included,
      credits_used_this_month: used,
      remaining_credits: remaining,
      estimated_overage_credits: Math.max(0, estimatedCredits - remaining),
      recommended_run_window: readiness.recommended_run_window,
      billing_mode: "preview_only",
      billing_status: "not_invoiced",
    };
  }

  usedCredits(merchantId = DEMO_MERCHANT_ID) {
    return getAgentCenterState().usageEvents
      .filter((event) => event.merchant_id === merchantId && event.billable)
      .reduce((sum, event) => sum + event.quantity, 0);
  }

  idempotencyKey(input: {
    jobId: string;
    provider: ProviderName;
    queryClusterId: string;
    promptTemplateId: string;
    repetitionIndex: number;
  }) {
    return `${input.jobId}:${input.provider}:${input.queryClusterId}:${input.promptTemplateId}:${input.repetitionIndex}`;
  }

  record(input: {
    job: DemandTestJob;
    run: LLMSurfaceTestRun;
    result: LLMSurfaceResult;
    quantity?: number;
    billable?: boolean;
  }) {
    const key = this.idempotencyKey({
      jobId: input.job.id,
      provider: input.run.provider,
      queryClusterId: input.run.query_cluster_id,
      promptTemplateId: input.run.prompt_template_id,
      repetitionIndex: input.run.repetition_index,
    });
    const repository = getAgentCenterRepository();
    const state = repository.getState();
    const existing = state.usageEvents.find((event) => event.idempotency_key === key);
    if (existing) return existing;

    const now = nowIso();
    const event: UsageEvent = {
      id: nextId("usage"),
      idempotency_key: key,
      merchant_id: input.job.merchant_id,
      store_id: input.job.store_id,
      scan_target_id: input.job.scan_target_id,
      event_type: "ai_test_credit",
      quantity: input.quantity || 1,
      source_agent: "demand_test_agent",
      agent_type: "demand_test_agent",
      workflow_type: input.job.job_type === "retest" ? "retest" : "demand_scan",
      scan_mode: input.job.scan_mode,
      provider: input.run.provider,
      model: input.run.model,
      query_cluster_id: input.run.query_cluster_id,
      prompt_template_id: input.run.prompt_template_id,
      input_tokens: input.result.input_tokens,
      output_tokens: input.result.output_tokens,
      billable: input.billable ?? true,
      billing_mode: "preview_only",
      billing_status: "not_invoiced",
      created_at: now,
      updated_at: now,
    };
    repository.upsert("usageEvents", event);
    return event;
  }

  recordProductUnderstanding(input: {
    issue: AgenticGMVIssue;
    diagnosisId?: string;
    quantity?: number;
  }) {
    const key = `product_understanding:${input.issue.id}:product_diagnosis:v1`;
    const repository = getAgentCenterRepository();
    const state = repository.getState();
    const existing = state.usageEvents.find((event) => event.idempotency_key === key);
    if (existing) return existing;

    const target = findScanTarget(input.issue.scan_target_id);
    const now = nowIso();
    const event: UsageEvent = {
      id: nextId("usage"),
      idempotency_key: key,
      merchant_id: input.issue.merchant_id,
      store_id: input.issue.store_id,
      scan_target_id: input.issue.scan_target_id,
      event_type: "product_understanding_credit",
      quantity: input.quantity || 1,
      source_agent: "product_understanding_agent",
      agent_type: "product_understanding_agent",
      workflow_type: "product_diagnosis",
      scan_mode: target.scan_mode,
      provider: "internal",
      model: "product-understanding-deterministic-v1",
      query_cluster_id: input.issue.affected_query_clusters[0] || "none",
      prompt_template_id: "product_understanding_diagnosis_v1",
      input_tokens: 0,
      output_tokens: 0,
      billable: true,
      billing_mode: "preview_only",
      billing_status: "not_invoiced",
      created_at: now,
      updated_at: now,
    };
    repository.upsert("usageEvents", event);
    return event;
  }

  recordOfferExecution(input: {
    issue: AgenticGMVIssue;
    diagnosisId?: string;
    quantity?: number;
  }) {
    const key = `offer_execution:${input.issue.id}:offer_readiness:v1`;
    const repository = getAgentCenterRepository();
    const state = repository.getState();
    const existing = state.usageEvents.find((event) => event.idempotency_key === key);
    if (existing) return existing;

    const target = findScanTarget(input.issue.scan_target_id);
    const now = nowIso();
    const event: UsageEvent = {
      id: nextId("usage"),
      idempotency_key: key,
      merchant_id: input.issue.merchant_id,
      store_id: input.issue.store_id,
      scan_target_id: input.issue.scan_target_id,
      event_type: "offer_verification_credit",
      quantity: input.quantity || 1,
      source_agent: "offer_execution_agent",
      agent_type: "offer_execution_agent",
      workflow_type: "offer_readiness",
      scan_mode: target.scan_mode,
      provider: "internal",
      model: "offer-execution-deterministic-v1",
      query_cluster_id: input.issue.affected_query_clusters[0] || "none",
      prompt_template_id: "offer_execution_readiness_v1",
      input_tokens: 0,
      output_tokens: 0,
      billable: true,
      billing_mode: "preview_only",
      billing_status: "not_invoiced",
      created_at: now,
      updated_at: now,
    };
    repository.upsert("usageEvents", event);
    return event;
  }

  recordCheckoutVerification(input: {
    issue: AgenticGMVIssue;
    diagnosisId?: string;
    quantity?: number;
  }) {
    const key = `checkout_verification:${input.issue.id}:checkout_readiness:v1`;
    const repository = getAgentCenterRepository();
    const state = repository.getState();
    const existing = state.usageEvents.find((event) => event.idempotency_key === key);
    if (existing) return existing;

    const target = findScanTarget(input.issue.scan_target_id);
    const now = nowIso();
    const event: UsageEvent = {
      id: nextId("usage"),
      idempotency_key: key,
      merchant_id: input.issue.merchant_id,
      store_id: input.issue.store_id,
      scan_target_id: input.issue.scan_target_id,
      event_type: "checkout_verification_credit",
      quantity: input.quantity || 1,
      source_agent: "checkout_verification_agent",
      agent_type: "checkout_verification_agent",
      workflow_type: "checkout_readiness",
      scan_mode: target.scan_mode,
      provider: "internal",
      model: "checkout-verification-deterministic-v1",
      query_cluster_id: input.issue.affected_query_clusters[0] || "none",
      prompt_template_id: "checkout_verification_readiness_v1",
      input_tokens: 0,
      output_tokens: 0,
      billable: true,
      billing_mode: "preview_only",
      billing_status: "not_invoiced",
      created_at: now,
      updated_at: now,
    };
    repository.upsert("usageEvents", event);
    return event;
  }

  recordIssueResolutionPlan(input: {
    issue: AgenticGMVIssue;
    planId?: string;
    quantity?: number;
  }) {
    const key = `resolution_workflow:${input.issue.id}:issue_resolution:v1`;
    const repository = getAgentCenterRepository();
    const state = repository.getState();
    const existing = state.usageEvents.find((event) => event.idempotency_key === key);
    if (existing) return existing;

    const target = findScanTarget(input.issue.scan_target_id);
    const now = nowIso();
    const event: UsageEvent = {
      id: nextId("usage"),
      idempotency_key: key,
      merchant_id: input.issue.merchant_id,
      store_id: input.issue.store_id,
      scan_target_id: input.issue.scan_target_id,
      event_type: "resolution_plan_credit",
      quantity: input.quantity || 1,
      source_agent: "resolution_workflow",
      agent_type: "resolution_workflow",
      workflow_type: "issue_resolution",
      scan_mode: target.scan_mode,
      provider: "internal",
      model: "issue-resolution-deterministic-v1",
      query_cluster_id: input.issue.affected_query_clusters[0] || "none",
      prompt_template_id: "issue_resolution_plan_v1",
      input_tokens: 0,
      output_tokens: 0,
      billable: true,
      billing_mode: "preview_only",
      billing_status: "not_invoiced",
      created_at: now,
      updated_at: now,
    };
    repository.upsert("usageEvents", event);
    return event;
  }

  recordPivotaOptimization(input: {
    issue: AgenticGMVIssue;
    patch: PivotaOptimizationPatch;
    quantity?: number;
  }) {
    const actionId = input.patch.action_ids[0] || input.patch.id;
    const key = `pivota_optimization:${input.issue.id}:${actionId}:${input.patch.patch_type}:v1`;
    const repository = getAgentCenterRepository();
    const state = repository.getState();
    const existing = state.usageEvents.find((event) => event.idempotency_key === key);
    if (existing) return existing;

    const target = findScanTarget(input.issue.scan_target_id);
    const now = nowIso();
    const event: UsageEvent = {
      id: nextId("usage"),
      idempotency_key: key,
      merchant_id: input.issue.merchant_id,
      store_id: input.issue.store_id,
      scan_target_id: input.issue.scan_target_id,
      event_type: "pivota_optimization_credit",
      quantity: input.quantity || 1,
      source_agent: "pivota_optimization_workflow",
      agent_type: "pivota_optimization_workflow",
      workflow_type: "pivota_discoverability_optimization",
      scan_mode: target.scan_mode,
      provider: "internal",
      model: "pivota-optimization-deterministic-v1",
      query_cluster_id: input.issue.affected_query_clusters[0] || "none",
      prompt_template_id: "pivota_optimization_patch_v1",
      input_tokens: 0,
      output_tokens: 0,
      billable: true,
      billing_mode: "preview_only",
      billing_status: "not_invoiced",
      created_at: now,
      updated_at: now,
    };
    repository.upsert("usageEvents", event);
    return event;
  }
}

export class ProductMatchService {
  private normalizer = new ProductNameNormalizer();

  private evaluateMention(
    mentionedProduct: ParsedRecommendation["mentioned_products"][number],
    product: ProductRecord,
    store: MerchantStore
  ): ProductMentionEvaluation {
    const profile = this.normalizer.productProfile(product, store);
    const rawModelProductName = displayModelProductName(mentionedProduct);
    const normalizedModelName = this.normalizer.normalizeForCompare(rawModelProductName);
    const normalizedModelCoreName = this.normalizer.normalizedCoreName(
      rawModelProductName,
      profile.brand_aliases
    );
    const modelSuffixTerms = this.normalizer.extractOptionalSuffixTerms(
      rawModelProductName
    );
    const suffixTermsMissing = this.normalizer.missingSuffixTerms(
      profile.optional_suffix_terms,
      modelSuffixTerms
    );
    const normalizedMentionBrand = this.normalizer.normalizeForCompare(
      mentionedProduct.brand
    );
    const brandAliases = profile.brand_aliases.map((alias) =>
      this.normalizer.normalizeForCompare(alias)
    );
    const brandMatch =
      brandAliases.some(
        (alias) =>
          normalizedMentionBrand === alias ||
          normalizedModelName.startsWith(`${alias} `) ||
          normalizedModelName === alias
      ) ||
      brandAliases.some((alias) =>
        new RegExp(`(^|\\s)${escapeRegExp(alias)}(?=\\s|$)`).test(
          normalizedModelName
        )
      );
    const coreExact =
      normalizedModelCoreName === profile.normalized_core_name &&
      normalizedModelCoreName.length > 0;
    const similarity = tokenSimilarity(
      normalizedModelCoreName,
      profile.normalized_core_name
    );
    const modelCoverage = tokenCoverage(
      normalizedModelCoreName,
      profile.normalized_core_name
    );
    const canonicalCoverage = tokenCoverage(
      profile.normalized_core_name,
      normalizedModelCoreName
    );
    const familyCompatible = productFamilyCompatible(
      normalizedModelCoreName,
      profile.normalized_core_name
    );
    const coreProductMatch =
      brandMatch &&
      familyCompatible &&
      (coreExact ||
        (similarity >= 0.82 && modelCoverage >= 0.86 && canonicalCoverage >= 0.86));
    const productFamilyMatch =
      brandMatch &&
      !coreProductMatch &&
      Boolean(primaryProductFamily(normalizedModelCoreName)) &&
      primaryProductFamily(normalizedModelCoreName) ===
        primaryProductFamily(profile.normalized_core_name);
    const normalizedSku = this.normalizer.normalizeForCompare(product.sku);
    const explicitSkuMatch =
      Boolean(normalizedSku) &&
      new RegExp(`(^|\\s)${escapeRegExp(normalizedSku)}(?=\\s|$)`).test(
        normalizedModelName
      );
    const fullSuffixMatch =
      coreProductMatch &&
      profile.optional_suffix_terms.length > 0 &&
      suffixTermsMissing.length === 0;
    let matchLevel: ProductMatchLevel = "no_match";
    if (brandMatch) matchLevel = "brand_match";
    if (productFamilyMatch) matchLevel = "product_family_match";
    if (coreProductMatch) matchLevel = "canonical_product_match";
    if (explicitSkuMatch || fullSuffixMatch) matchLevel = "sku_match";

    const confidenceScore =
      matchLevel === "sku_match"
        ? 0.97
        : matchLevel === "canonical_product_match"
          ? suffixTermsMissing.length > 0
            ? 0.9
            : 0.93
          : matchLevel === "product_family_match"
            ? 0.72
            : matchLevel === "brand_match"
              ? 0.58
              : 0.18;
    const missingSuffixLabel = suffixTermsMissing.length
      ? ` Missing ${suffixFamilyLabel(suffixTermsMissing)} suffix terms: ${suffixTermsMissing.join(", ")}.`
      : "";
    const matchReason =
      matchLevel === "sku_match"
        ? "Matched brand, core product name, and SKU/variant suffix terms."
        : matchLevel === "canonical_product_match"
          ? `Matched brand and normalized core product name.${missingSuffixLabel}`
          : matchLevel === "product_family_match"
            ? "Matched the merchant brand and product family, but not the full core product name."
            : matchLevel === "brand_match"
              ? "Matched the merchant brand, but product-family evidence was insufficient."
              : "No reliable merchant brand or product-name match was found.";

    return {
      product,
      raw_model_product_name: rawModelProductName,
      canonical_product_name: profile.canonical_name,
      normalized_model_name: normalizedModelName,
      normalized_model_core_name: normalizedModelCoreName,
      normalized_canonical_name: profile.normalized_canonical_name,
      normalized_core_name: profile.normalized_core_name,
      optional_suffix_terms: profile.optional_suffix_terms,
      brand_aliases: profile.brand_aliases,
      product_aliases: profile.product_aliases,
      brand_match: brandMatch,
      core_product_match: coreProductMatch,
      suffix_terms_missing: suffixTermsMissing,
      match_level: matchLevel,
      match_confidence_score: Number(confidenceScore.toFixed(2)),
      counts_for_visibility: isVisibilityMatch({ match_level: matchLevel }),
      counts_for_sku_exact_match: isSkuExactMatch({ match_level: matchLevel }),
      ambiguous_match: false,
      match_reason: matchReason,
      matched_recommendation_rank: mentionedProduct.rank || null,
    };
  }

  private applyAmbiguityGuard(
    evaluation: ProductMentionEvaluation,
    mentionedProduct: ParsedRecommendation["mentioned_products"][number],
    store: MerchantStore
  ) {
    if (!["canonical_product_match", "sku_match"].includes(evaluation.match_level)) {
      return evaluation;
    }

    const candidates = (store.products || [])
      .filter((candidate) => candidate.id !== evaluation.product.id)
      .map((candidate) => this.evaluateMention(mentionedProduct, candidate, store))
      .filter(
        (candidate) =>
          candidate.brand_match &&
          candidate.match_confidence_score >= 0.82 &&
          Math.abs(candidate.match_confidence_score - evaluation.match_confidence_score) <=
            0.04
      );

    if (!candidates.length || evaluation.match_level === "sku_match") {
      return evaluation;
    }

    const sameEntityVariants = candidates.every(
      (candidate) =>
        candidate.product.product_entity_id === evaluation.product.product_entity_id
    );

    if (sameEntityVariants) {
      return {
        ...evaluation,
        ambiguous_match: true,
        match_level: "canonical_product_match" as const,
        match_confidence_score: 0.82,
        counts_for_visibility: true,
        counts_for_sku_exact_match: false,
        match_reason:
          "Brand and core product name matched the canonical ProductEntity, but multiple same-entity SKU variants had similar confidence and the model omitted SKU/variant suffix terms.",
      };
    }

    return {
      ...evaluation,
      ambiguous_match: true,
      match_level: "product_family_match" as const,
      match_confidence_score: 0.7,
      counts_for_visibility: false,
      counts_for_sku_exact_match: false,
      match_reason:
        "Brand and core product name matched, but multiple same-brand products had similar confidence and the model omitted SKU/variant suffix terms.",
    };
  }

  match(parsed: ParsedRecommendation, store: MerchantStore, cluster: QueryCluster) {
    const product = findProduct(store, cluster.product_id);
    const evaluations = product
      ? parsed.mentioned_products
          .map((item) =>
            this.applyAmbiguityGuard(
              this.evaluateMention(item, product, store),
              item,
              store
            )
          )
          .sort((left, right) => right.match_confidence_score - left.match_confidence_score)
      : [];
    const bestEvaluation = evaluations[0];
    const fallbackProfile =
      product && this.normalizer.productProfile(product, store);
    const brandMentioned =
      bestEvaluation?.brand_match ||
      parsed.merchant_brand_mentioned ||
      Boolean(
        product?.brand &&
          parsed.mentioned_brands.some(
            (brand) =>
              this.normalizer.normalizeForCompare(brand) ===
              this.normalizer.normalizeForCompare(product.brand)
          )
      );
    const parserExactProductMention =
      parsed.merchant_product_mentioned || parsed.pivota_product_entity_mentioned;
    const parserSkuMention = parsed.merchant_sku_mentioned;
    const parserFallbackLevel: ProductMatchLevel = parserSkuMention
      ? "sku_match"
      : parserExactProductMention
        ? "canonical_product_match"
        : brandMentioned
          ? "brand_match"
          : "no_match";
    const matchLevel =
      bestEvaluation && numericMatchLevel(bestEvaluation.match_level) >= numericMatchLevel(parserFallbackLevel)
        ? bestEvaluation.match_level
        : parserFallbackLevel;
    const countsForVisibility = isVisibilityMatch({ match_level: matchLevel });
    const countsForSkuExactMatch = isSkuExactMatch({ match_level: matchLevel });
    const competitorMatches = parsed.mentioned_products
      .filter((item) =>
        store.competitor_brands?.some(
          (brand) => item.brand.toLowerCase() === brand.toLowerCase()
        )
      )
      .map((item) => ({
        competitor_name: item.brand,
        product_name: item.name,
        confidence: 0.91,
      }));
    let matchConfidenceScore =
      bestEvaluation?.match_confidence_score ||
      (matchLevel === "canonical_product_match"
        ? 0.9
        : matchLevel === "sku_match"
          ? 0.97
          : brandMentioned
            ? 0.58
            : 0.18);
    if (!countsForVisibility && competitorMatches.length) {
      matchConfidenceScore = Math.max(matchConfidenceScore, 0.88);
    }

    const now = nowIso();
    const result: ProductMatchResult = {
      id: nextId("match"),
      parsed_recommendation_id: parsed.id,
      merchant_id: store.merchant_id,
      store_id: store.id,
      product_entity_id: product?.product_entity_id,
      raw_model_product_name:
        bestEvaluation?.raw_model_product_name ||
        (parsed.mentioned_products[0]
          ? displayModelProductName(parsed.mentioned_products[0])
          : undefined),
      canonical_product_name: bestEvaluation?.canonical_product_name || product?.title,
      normalized_model_name: bestEvaluation?.normalized_model_name,
      normalized_canonical_name:
        bestEvaluation?.normalized_canonical_name ||
        fallbackProfile?.normalized_canonical_name,
      normalized_core_name:
        bestEvaluation?.normalized_core_name || fallbackProfile?.normalized_core_name,
      optional_suffix_terms:
        bestEvaluation?.optional_suffix_terms || fallbackProfile?.optional_suffix_terms,
      brand_aliases: bestEvaluation?.brand_aliases || fallbackProfile?.brand_aliases,
      product_aliases: bestEvaluation?.product_aliases || fallbackProfile?.product_aliases,
      brand_match: Boolean(brandMentioned),
      core_product_match:
        bestEvaluation?.core_product_match || parserExactProductMention || false,
      suffix_terms_missing: bestEvaluation?.suffix_terms_missing || [],
      match_level: matchLevel,
      match_confidence: confidenceLabel(matchConfidenceScore),
      match_confidence_score: Number(matchConfidenceScore.toFixed(2)),
      counts_for_visibility: countsForVisibility,
      counts_for_sku_exact_match: countsForSkuExactMatch,
      ambiguous_match: bestEvaluation?.ambiguous_match || false,
      match_reason:
        bestEvaluation?.match_reason ||
        (parserExactProductMention
          ? "Parser detected the canonical merchant product or Pivota product entity."
          : brandMentioned
            ? "Matched the merchant brand, but product-name evidence was insufficient."
            : "No reliable merchant product match was found."),
      matched_recommendation_rank:
        countsForVisibility && bestEvaluation
          ? bestEvaluation.matched_recommendation_rank
          : parsed.recommendation_rank,
      matched_level: numericMatchLevel(matchLevel),
      matched_brand: Boolean(brandMentioned),
      matched_product_family:
        matchLevel === "product_family_match" || numericMatchLevel(matchLevel) >= 3,
      matched_product_entity: countsForVisibility,
      matched_sku: countsForSkuExactMatch,
      matched_variant: matchLevel === "variant_match",
      competitor_matches: competitorMatches,
      created_at: now,
      updated_at: now,
    };

    getAgentCenterState().matches.push(result);
    return result;
  }
}

export class ScoringService {
  scoreCluster(input: {
    jobId?: string;
    scanTarget: ScanTarget;
    cluster: QueryCluster;
    parsed: ParsedRecommendation[];
    matches: ProductMatchResult[];
  }) {
    const state = getAgentCenterState();
    const store = findStore(input.scanTarget.store_id);
    const product = findProduct(store, input.cluster.product_id);
    const byProvider = new Map<ProviderName, ParsedRecommendation[]>();
    for (const parsed of input.parsed) {
      byProvider.set(parsed.provider, [...(byProvider.get(parsed.provider) || []), parsed]);
    }

    const providerScores: DemandVisibilityScore["provider_scores"] = {};
    for (const [provider, providerParsed] of byProvider.entries()) {
      const providerParsedIds = new Set(providerParsed.map((item) => item.id));
      const providerMatches = input.matches.filter((match) =>
        providerParsedIds.has(match.parsed_recommendation_id)
      );
      providerScores[provider] = this.calculateScores(
        providerParsed,
        product,
        input.cluster,
        providerMatches,
        input.scanTarget
      );
    }

    const aggregate = this.calculateScores(
      input.parsed,
      product,
      input.cluster,
      input.matches,
      input.scanTarget
    );
    const now = nowIso();
    const score: DemandVisibilityScore = {
      id: nextId("score"),
      job_id: input.jobId,
      merchant_id: input.scanTarget.merchant_id,
      store_id: input.scanTarget.store_id,
      scan_target_id: input.scanTarget.id,
      query_cluster_id: input.cluster.id,
      product_entity_id: product?.product_entity_id,
      provider_scores: providerScores,
      aggregate_scores: aggregate,
      score_explanations: this.explainScores(
        input.parsed,
        product,
        input.cluster,
        aggregate,
        input.matches,
        input.scanTarget
      ),
      created_at: now,
      updated_at: now,
    };

    state.scores.push(score);
    return score;
  }

  calculateScores(
    parsed: ParsedRecommendation[],
    product: ProductRecord | undefined,
    cluster: QueryCluster,
    matches: ProductMatchResult[] = [],
    scanTarget?: ScanTarget
  ) {
    const total = Math.max(1, parsed.length);
    const scanMode = scanTarget?.scan_mode || "open_product_visibility_test";
    const scoreMerchantAttribution = merchantAttributionTestEnabled(scanMode);
    const scorePivotaAttribution = pivotaAttributionTestEnabled(scanMode);
    const scoreExecutableOffer = executableOfferTestEnabled(scanMode);
    const scoreOrganicDiscovery = organicDiscoveryTestEnabled(scanMode);
    const scoreSearchGroundedDiscovery = searchGroundedDiscoveryTestEnabled(scanMode);
    const scoreBuyingPathDiscovery = buyingPathDiscoveryTestEnabled(scanMode);
    const scoreDiscovery = discoveryTestEnabled(scanMode);
    const searchGroundingConfigured = geminiSearchGroundingConfigured();
    const matchesByParsedId = new Map(
      matches.map((match) => [match.parsed_recommendation_id, match])
    );
    const productEntityMentions = parsed.filter((item) => {
      const match = matchesByParsedId.get(item.id);
      return match
        ? match.counts_for_visibility
        : item.product_entity_mentioned || item.merchant_product_mentioned;
    }).length;
    const merchantStoreMentions = scoreMerchantAttribution
      ? parsed.filter(
          (item) =>
            item.merchant_store_mentioned ||
            item.merchant_pdp_url_present ||
            item.merchant_offer_present ||
            item.channel_attribution === "merchant_store_attributed" ||
            item.channel_attribution === "executable_offer_attributed"
        ).length
      : 0;
    const pivotaPdpMentions = scorePivotaAttribution
      ? parsed.filter(
          (item) =>
            (item.pivota_pdp_url_present && item.pivota_pdp_url_verified) ||
            (item.pivota_product_object_id_present &&
              item.pivota_product_object_id_verified) ||
            item.channel_attribution === "pivota_pdp_attributed_verified" ||
            item.channel_attribution === "pivota_offer_attributed_verified" ||
            item.channel_attribution === "executable_offer_attributed"
        ).length
      : 0;
    const pivotaOfferMentions = scorePivotaAttribution
      ? parsed.filter(
          (item) =>
            (item.pivota_offer_ids_present && item.pivota_offer_ids_verified) ||
            item.channel_attribution === "pivota_offer_attributed_verified" ||
            item.channel_attribution === "executable_offer_attributed"
        ).length
      : 0;
    const pivotaAttributionEchoes = scorePivotaAttribution
      ? parsed.filter(
          (item) =>
            !item.pivota_attribution_verified &&
            (item.pivota_pdp_mentioned ||
              item.pivota_pdp_url_present ||
              item.pivota_product_object_id_present ||
              item.pivota_offer_present ||
              item.channel_attribution === "pivota_pdp_attributed_unverified" ||
              item.channel_attribution === "pivota_offer_attributed_unverified" ||
              item.channel_attribution === "unverified_pivota_echo")
        ).length
      : 0;
    const executableOfferMentions = scoreExecutableOffer
      ? parsed.filter(
          (item) =>
            item.purchase_path_type === "executable_offer" ||
            item.channel_attribution === "executable_offer_attributed"
        ).length
      : 0;
    const ranks = parsed
      .map((item) => {
        const match = matchesByParsedId.get(item.id);
        if (match?.counts_for_visibility) return match.matched_recommendation_rank;
        return item.product_entity_mentioned || item.merchant_product_mentioned
          ? item.recommendation_rank
          : null;
      })
      .filter((rank): rank is number => typeof rank === "number");
    const rankScore = ranks.length
      ? ranks.reduce((sum, rank) => sum + Math.max(0, 120 - rank * 20), 0) /
        ranks.length
      : 0;
    const substitutions = parsed.filter((item) => {
      const match = matchesByParsedId.get(item.id);
      const merchantVisible = match
        ? match.counts_for_visibility
        : item.merchant_product_mentioned;
      const competitorAppeared = match
        ? match.competitor_matches.length > 0
        : item.competitor_substitution_detected;
      return competitorAppeared && !merchantVisible;
    }).length;
    const organicBrandMentions = parsed.filter(
      (item) => item.merchant_brand_mentioned || item.merchant_product_mentioned
    ).length;
    const competitorDominanceRuns = parsed.filter((item) => {
      const match = matchesByParsedId.get(item.id);
      const merchantVisible = match
        ? match.counts_for_visibility
        : item.merchant_product_mentioned || item.product_entity_mentioned;
      return (
        !merchantVisible &&
        (item.competitor_products.length > 0 ||
          item.competitor_domains.length > 0 ||
          item.competitor_substitution_detected)
      );
    }).length;
    const merchantPdpDiscoveryRuns = parsed.filter(
      (item) => item.merchant_pdp_url_exact_match
    ).length;
    const pivotaPdpDiscoveryRuns = parsed.filter(
      (item) => item.pivota_pdp_url_exact_match
    ).length;
    const buyingPathRuns = parsed.filter(
      (item) => item.buying_path_present || item.purchase_path_present
    ).length;
    const offerSignalRuns = parsed.filter(
      (item) =>
        item.offer_signal_present ||
        item.price_signal_present ||
        item.availability_signal_present ||
        item.merchant_offer_present ||
        item.pivota_offer_present
    ).length;
    const urlMatchRuns = parsed.filter(
      (item) => item.merchant_pdp_url_exact_match || item.pivota_pdp_url_exact_match
    ).length;
    const urlAccuracyScore =
      parsed.some((item) => item.returned_urls.length > 0)
        ? clampScore((urlMatchRuns / total) * 100)
        : 0;
    const missingAttributes = unique(
      parsed
        .flatMap((item) => item.missing_attributes_identified)
        .concat(missingAttributesForLayer(product, cluster, "merchant"))
    );
    const required = cluster.required_attributes.length
      ? cluster.required_attributes
      : missingAttributes;
    const merchantMissingRequired = required.filter((attribute) =>
      missingAttributes.includes(attribute)
    );
    const attributeReadiness =
      required.length === 0
        ? 86
        : ((required.length - merchantMissingRequired.length) / required.length) *
          100;
    const productReadiness = product
      ? this.pivotaPdpReadiness(product, cluster)
      : cluster.intent_type === "category_recommendation"
        ? 50
        : 42;

    return {
      product_entity_visibility_score: clampScore(
        (productEntityMentions / total) * 100
      ),
      merchant_store_visibility_score: clampScore(
        (merchantStoreMentions / total) * 100
      ),
      pivota_pdp_visibility_score: clampScore((pivotaPdpMentions / total) * 100),
      pivota_offer_visibility_score: clampScore(
        (pivotaOfferMentions / total) * 100
      ),
      pivota_attribution_echo_rate: clampScore(
        (pivotaAttributionEchoes / total) * 100
      ),
      executable_offer_visibility_score: scoreExecutableOffer
        ? clampScore((executableOfferMentions / total) * 100)
        : ("not_tested" as const),
      organic_product_discovery_score: scoreOrganicDiscovery
        ? clampScore((productEntityMentions / total) * 100)
        : ("not_tested" as const),
      organic_brand_discovery_score: scoreOrganicDiscovery
        ? clampScore((organicBrandMentions / total) * 100)
        : ("not_tested" as const),
      competitor_dominance_score: scoreDiscovery
        ? clampScore((competitorDominanceRuns / total) * 100)
        : ("not_tested" as const),
      search_grounded_merchant_pdp_discovery_score: scoreSearchGroundedDiscovery
        ? searchGroundingConfigured
          ? clampScore((merchantPdpDiscoveryRuns / total) * 100)
          : ("not_configured" as const)
        : scoreBuyingPathDiscovery
          ? clampScore((merchantPdpDiscoveryRuns / total) * 100)
          : ("not_tested" as const),
      search_grounded_pivota_pdp_discovery_score: scoreSearchGroundedDiscovery
        ? searchGroundingConfigured
          ? clampScore((pivotaPdpDiscoveryRuns / total) * 100)
          : ("not_configured" as const)
        : scoreBuyingPathDiscovery
          ? clampScore((pivotaPdpDiscoveryRuns / total) * 100)
          : ("not_tested" as const),
      buying_path_discovery_score: scoreBuyingPathDiscovery
        ? clampScore((buyingPathRuns / total) * 100)
        : ("not_tested" as const),
      offer_discovery_score: scoreBuyingPathDiscovery
        ? clampScore((offerSignalRuns / total) * 100)
        : ("not_tested" as const),
      url_match_accuracy_score:
        scoreSearchGroundedDiscovery && !searchGroundingConfigured
          ? ("not_configured" as const)
          : scoreSearchGroundedDiscovery || scoreBuyingPathDiscovery
            ? urlAccuracyScore
            : ("not_tested" as const),
      visibility_score: clampScore((productEntityMentions / total) * 100),
      recommendation_rank_score: clampScore(rankScore),
      competitor_substitution_score: clampScore((substitutions / total) * 100),
      attribute_readiness_score: clampScore(attributeReadiness),
      pivota_pdp_readiness_score: clampScore(productReadiness),
    };
  }

  explainScores(
    parsed: ParsedRecommendation[],
    product: ProductRecord | undefined,
    cluster: QueryCluster,
    scores: DemandVisibilityScore["aggregate_scores"],
    matches: ProductMatchResult[] = [],
    scanTarget?: ScanTarget
  ): DemandVisibilityScore["score_explanations"] {
    const total = Math.max(1, parsed.length);
    const scanMode = scanTarget?.scan_mode || "open_product_visibility_test";
    const scoreMerchantAttribution = merchantAttributionTestEnabled(scanMode);
    const scorePivotaAttribution = pivotaAttributionTestEnabled(scanMode);
    const scoreExecutableOffer = executableOfferTestEnabled(scanMode);
    const scoreOrganicDiscovery = organicDiscoveryTestEnabled(scanMode);
    const scoreSearchGroundedDiscovery = searchGroundedDiscoveryTestEnabled(scanMode);
    const scoreBuyingPathDiscovery = buyingPathDiscoveryTestEnabled(scanMode);
    const scoreDiscovery = discoveryTestEnabled(scanMode);
    const searchGroundingConfigured = geminiSearchGroundingConfigured();
    const supportingRuns = parsed.map((item) => item.test_run_id).filter(Boolean);
    const matchesByParsedId = new Map(
      matches.map((match) => [match.parsed_recommendation_id, match])
    );
    const productEntityMentions = parsed.filter((item) => {
      const match = matchesByParsedId.get(item.id);
      return match
        ? match.counts_for_visibility
        : item.product_entity_mentioned || item.merchant_product_mentioned;
    }).length;
    const merchantStoreMentions = scoreMerchantAttribution
      ? parsed.filter(
          (item) =>
            item.merchant_store_mentioned ||
            item.merchant_pdp_url_present ||
            item.merchant_offer_present ||
            item.channel_attribution === "merchant_store_attributed" ||
            item.channel_attribution === "executable_offer_attributed"
        ).length
      : 0;
    const pivotaPdpMentions = scorePivotaAttribution
      ? parsed.filter(
          (item) =>
            (item.pivota_pdp_url_present && item.pivota_pdp_url_verified) ||
            (item.pivota_product_object_id_present &&
              item.pivota_product_object_id_verified) ||
            item.channel_attribution === "pivota_pdp_attributed_verified" ||
            item.channel_attribution === "pivota_offer_attributed_verified" ||
            item.channel_attribution === "executable_offer_attributed"
        ).length
      : 0;
    const pivotaOfferMentions = scorePivotaAttribution
      ? parsed.filter(
          (item) =>
            (item.pivota_offer_ids_present && item.pivota_offer_ids_verified) ||
            item.channel_attribution === "pivota_offer_attributed_verified" ||
            item.channel_attribution === "executable_offer_attributed"
        ).length
      : 0;
    const pivotaAttributionEchoes = scorePivotaAttribution
      ? parsed.filter(
          (item) =>
            !item.pivota_attribution_verified &&
            (item.pivota_pdp_mentioned ||
              item.pivota_pdp_url_present ||
              item.pivota_product_object_id_present ||
              item.pivota_offer_present ||
              item.channel_attribution === "pivota_pdp_attributed_unverified" ||
              item.channel_attribution === "pivota_offer_attributed_unverified" ||
              item.channel_attribution === "unverified_pivota_echo")
        ).length
      : 0;
    const executableOfferMentions = scoreExecutableOffer
      ? parsed.filter(
          (item) =>
            item.purchase_path_type === "executable_offer" ||
            item.channel_attribution === "executable_offer_attributed"
        ).length
      : 0;
    const substitutions = parsed.filter((item) => {
      const match = matchesByParsedId.get(item.id);
      const merchantVisible = match
        ? match.counts_for_visibility
        : item.merchant_product_mentioned;
      const competitorAppeared = match
        ? match.competitor_matches.length > 0
        : item.competitor_substitution_detected;
      return competitorAppeared && !merchantVisible;
    }).length;
    const organicBrandMentions = parsed.filter(
      (item) => item.merchant_brand_mentioned || item.merchant_product_mentioned
    ).length;
    const competitorDominanceRuns = parsed.filter((item) => {
      const match = matchesByParsedId.get(item.id);
      const merchantVisible = match
        ? match.counts_for_visibility
        : item.merchant_product_mentioned || item.product_entity_mentioned;
      return (
        !merchantVisible &&
        (item.competitor_products.length > 0 ||
          item.competitor_domains.length > 0 ||
          item.competitor_substitution_detected)
      );
    }).length;
    const merchantPdpDiscoveryRuns = parsed.filter(
      (item) => item.merchant_pdp_url_exact_match
    ).length;
    const pivotaPdpDiscoveryRuns = parsed.filter(
      (item) => item.pivota_pdp_url_exact_match
    ).length;
    const buyingPathRuns = parsed.filter(
      (item) => item.buying_path_present || item.purchase_path_present
    ).length;
    const offerSignalRuns = parsed.filter(
      (item) =>
        item.offer_signal_present ||
        item.price_signal_present ||
        item.availability_signal_present ||
        item.merchant_offer_present ||
        item.pivota_offer_present
    ).length;
    const urlMatchRuns = parsed.filter(
      (item) => item.merchant_pdp_url_exact_match || item.pivota_pdp_url_exact_match
    ).length;
    const ranks = parsed
      .map((item) => {
        const match = matchesByParsedId.get(item.id);
        if (match?.counts_for_visibility) return match.matched_recommendation_rank;
        return item.merchant_product_mentioned ? item.recommendation_rank : null;
      })
      .filter((rank): rank is number => typeof rank === "number");
    const required = cluster.required_attributes;
    const merchantMissing = missingAttributesForLayer(product, cluster, "merchant");
    const pivotaMissing = missingAttributesForLayer(product, cluster, "pivota");
    const normalizedCoreVisibilityMatches = matches.filter(
      (match) =>
        match.counts_for_visibility &&
        !match.counts_for_sku_exact_match &&
        match.match_level === "canonical_product_match" &&
        match.suffix_terms_missing.length > 0
    );
    const channelAttributionMissing =
      productEntityMentions > 0 &&
      merchantStoreMentions === 0 &&
      pivotaPdpMentions === 0;
    const normalizedCoreExplanation = normalizedCoreVisibilityMatches.length
      ? " Counted as visibility match because brand and core product name matched. SPF/PA/size suffixes were missing from the model output, so this was not counted as an exact SKU match."
      : "";
    const channelAttributionExplanation = channelAttributionMissing
      ? " Product entity was visible, but merchant store / Pivota channel attribution was not proven."
      : "";

    return {
      product_entity_visibility_score: scoreExplanation(
        scores.product_entity_visibility_score,
        "product_entity_visibility_matches / total_completed_runs * 100",
        `product_entity_visibility_score = ${scores.product_entity_visibility_score} because the product entity matched in ${productEntityMentions} of ${parsed.length} completed Gemini runs.${normalizedCoreExplanation}${channelAttributionExplanation}`,
        supportingRuns
      ),
      merchant_store_visibility_score: scoreExplanation(
        scores.merchant_store_visibility_score,
        "merchant_store_or_pdp_or_offer_attributed_runs / total_completed_runs * 100",
        scoreMerchantAttribution
          ? `merchant_store_visibility_score = ${scores.merchant_store_visibility_score} because merchant store, merchant PDP URL, or merchant offer attribution appeared in ${merchantStoreMentions} of ${parsed.length} completed Gemini runs.`
          : "merchant_store_visibility_score = 0 because this scan mode is open_product_visibility_test; open product recommendation does not prove merchant store attribution.",
        supportingRuns
      ),
      pivota_pdp_visibility_score: scoreExplanation(
        scores.pivota_pdp_visibility_score,
        "verified_pivota_pdp_attribution_runs / total_completed_runs * 100",
        scorePivotaAttribution
          ? `pivota_pdp_visibility_score = ${scores.pivota_pdp_visibility_score} because verified Pivota PDP URL or product object attribution appeared in ${pivotaPdpMentions} of ${parsed.length} completed Gemini runs. Model-only Pivota mentions do not count.`
          : "pivota_pdp_visibility_score = 0 because this scan mode is open_product_visibility_test; open product recommendation does not prove Pivota PDP attribution.",
        supportingRuns
      ),
      pivota_offer_visibility_score: scoreExplanation(
        scores.pivota_offer_visibility_score,
        "verified_pivota_offer_runs / total_completed_runs * 100",
        scorePivotaAttribution
          ? `pivota_offer_visibility_score = ${scores.pivota_offer_visibility_score} because verified Pivota offer IDs appeared in ${pivotaOfferMentions} of ${parsed.length} completed Gemini runs.`
          : "pivota_offer_visibility_score = 0 because this scan mode does not test Pivota-managed offers.",
        supportingRuns
      ),
      pivota_attribution_echo_rate: scoreExplanation(
        scores.pivota_attribution_echo_rate,
        "unverified_pivota_echo_runs / total_completed_runs * 100",
        scorePivotaAttribution
          ? `pivota_attribution_echo_rate = ${scores.pivota_attribution_echo_rate} because the model mentioned Pivota without a verified PDP URL, product object ID, or offer ID in ${pivotaAttributionEchoes} of ${parsed.length} completed Gemini runs. Echo rate is debug evidence, not a success score.`
          : "pivota_attribution_echo_rate = 0 because this scan mode does not test Pivota attribution.",
        supportingRuns
      ),
      executable_offer_visibility_score: scoreExplanation(
        scores.executable_offer_visibility_score,
        "executable_offer_or_checkout_path_runs / total_completed_runs * 100",
        scoreExecutableOffer
          ? `executable_offer_visibility_score = ${scores.executable_offer_visibility_score} because executable offers or checkout paths appeared in ${executableOfferMentions} of ${parsed.length} completed Gemini runs.`
          : "executable_offer_visibility_score = not_tested because V1 open product visibility scans do not include offer or checkout execution data.",
        supportingRuns
      ),
      organic_product_discovery_score: scoreExplanation(
        scores.organic_product_discovery_score,
        "organic_product_mentions / total_completed_runs * 100",
        scoreOrganicDiscovery
          ? `organic_product_discovery_score = ${scores.organic_product_discovery_score} because the target product/entity appeared in ${productEntityMentions} of ${parsed.length} organic no-context discovery runs.`
          : "organic_product_discovery_score = not_tested because this was not an organic discovery scan.",
        supportingRuns
      ),
      organic_brand_discovery_score: scoreExplanation(
        scores.organic_brand_discovery_score,
        "organic_brand_mentions / total_completed_runs * 100",
        scoreOrganicDiscovery
          ? `organic_brand_discovery_score = ${scores.organic_brand_discovery_score} because the target brand appeared in ${organicBrandMentions} of ${parsed.length} organic no-context discovery runs.`
          : "organic_brand_discovery_score = not_tested because this was not an organic discovery scan.",
        supportingRuns
      ),
      competitor_dominance_score: scoreExplanation(
        scores.competitor_dominance_score,
        "runs_where_competitors_appear_and_target_absent / total_completed_runs * 100",
        scoreDiscovery
          ? `competitor_dominance_score = ${scores.competitor_dominance_score} because competitors appeared while the merchant product was absent in ${competitorDominanceRuns} of ${parsed.length} discovery runs.`
          : "competitor_dominance_score = not_tested because contextual attribution scans do not populate discovery scores.",
        supportingRuns
      ),
      search_grounded_merchant_pdp_discovery_score: scoreExplanation(
        scores.search_grounded_merchant_pdp_discovery_score,
        "runs_where_expected_merchant_pdp_url_returned / total_completed_runs * 100",
        scoreSearchGroundedDiscovery && !searchGroundingConfigured
          ? "search_grounded_merchant_pdp_discovery_score = not_configured because Gemini search grounding is not configured; no contextual attribution fallback was used."
          : scoreSearchGroundedDiscovery || scoreBuyingPathDiscovery
            ? `search_grounded_merchant_pdp_discovery_score = ${scores.search_grounded_merchant_pdp_discovery_score} because the expected merchant PDP URL appeared in ${merchantPdpDiscoveryRuns} of ${parsed.length} discovery runs.`
            : "search_grounded_merchant_pdp_discovery_score = not_tested because this was not a search-grounded or buying-path discovery scan.",
        supportingRuns
      ),
      search_grounded_pivota_pdp_discovery_score: scoreExplanation(
        scores.search_grounded_pivota_pdp_discovery_score,
        "runs_where_canonical_product_entity_pdp_or_verified_alias_returned / total_completed_runs * 100",
        scoreSearchGroundedDiscovery && !searchGroundingConfigured
          ? "search_grounded_pivota_pdp_discovery_score = not_configured because Gemini search grounding is not configured; no contextual attribution fallback was used."
          : scoreSearchGroundedDiscovery || scoreBuyingPathDiscovery
            ? `search_grounded_pivota_pdp_discovery_score = ${scores.search_grounded_pivota_pdp_discovery_score} because the canonical ProductEntity PDP URL or a verified alias URL appeared in ${pivotaPdpDiscoveryRuns} of ${parsed.length} discovery runs. Unrelated ext_* URLs do not count.`
            : "search_grounded_pivota_pdp_discovery_score = not_tested because this was not a search-grounded or buying-path discovery scan.",
        supportingRuns
      ),
      buying_path_discovery_score: scoreExplanation(
        scores.buying_path_discovery_score,
        "runs_with_buying_path_or_url / total_completed_runs * 100",
        scoreBuyingPathDiscovery
          ? `buying_path_discovery_score = ${scores.buying_path_discovery_score} because a buying path or URL appeared in ${buyingPathRuns} of ${parsed.length} buying-path discovery runs.`
          : "buying_path_discovery_score = not_tested because this was not a buying-path discovery scan.",
        supportingRuns
      ),
      offer_discovery_score: scoreExplanation(
        scores.offer_discovery_score,
        "runs_with_offer_price_or_availability_signal / total_completed_runs * 100",
        scoreBuyingPathDiscovery
          ? `offer_discovery_score = ${scores.offer_discovery_score} because offer, price, or availability signals appeared in ${offerSignalRuns} of ${parsed.length} buying-path discovery runs.`
          : "offer_discovery_score = not_tested because this was not a buying-path discovery scan.",
        supportingRuns
      ),
      url_match_accuracy_score: scoreExplanation(
        scores.url_match_accuracy_score,
        "runs_with_exact_expected_merchant_or_pivota_url / total_completed_runs * 100",
        scoreSearchGroundedDiscovery && !searchGroundingConfigured
          ? "url_match_accuracy_score = not_configured because Gemini search grounding is not configured."
          : scoreSearchGroundedDiscovery || scoreBuyingPathDiscovery
            ? `url_match_accuracy_score = ${scores.url_match_accuracy_score} because exact expected merchant/Pivota URLs appeared in ${urlMatchRuns} of ${parsed.length} discovery runs.`
            : "url_match_accuracy_score = not_tested because contextual attribution scans do not populate discovery scores.",
        supportingRuns
      ),
      visibility_score: scoreExplanation(
        scores.visibility_score,
        "product_entity_visibility_matches / total_completed_runs * 100",
        `visibility_score is a deprecated alias for product_entity_visibility_score. Product entity matched in ${productEntityMentions} of ${parsed.length} completed Gemini runs.${normalizedCoreExplanation}${channelAttributionExplanation}`,
        supportingRuns
      ),
      recommendation_rank_score: scoreExplanation(
        scores.recommendation_rank_score,
        "average(max(0, 120 - recommendation_rank * 20)) for merchant-mentioned runs",
        ranks.length
          ? `recommendation_rank_score = ${scores.recommendation_rank_score} from merchant recommendation ranks: ${ranks.join(", ")}.`
          : "recommendation_rank_score = 0 because the merchant product was not ranked in completed Gemini runs.",
        supportingRuns
      ),
      competitor_substitution_score: scoreExplanation(
        scores.competitor_substitution_score,
        "runs_where_competitor_appears_and_merchant_absent / total_relevant_runs * 100",
        `competitor_substitution_score = ${scores.competitor_substitution_score} because competitors appeared while the merchant product was absent in ${substitutions} of ${total} relevant Gemini runs.`,
        supportingRuns
      ),
      attribute_readiness_score: scoreExplanation(
        scores.attribute_readiness_score,
        "required_attributes_present_on_merchant_pdp / required_attributes * 100",
        required.length
          ? `attribute_readiness_score = ${scores.attribute_readiness_score} because ${required.length - merchantMissing.length} of ${required.length} required merchant PDP attributes are present. Missing: ${merchantMissing.join(", ") || "none"}.`
          : "attribute_readiness_score defaults to 86 because no required attributes were inferred for this query cluster.",
        supportingRuns
      ),
      pivota_pdp_readiness_score: scoreExplanation(
        scores.pivota_pdp_readiness_score,
        "required_normalized_attributes + agent_summary + product_entity_id + graph_completeness",
        `pivota_pdp_readiness_score = ${scores.pivota_pdp_readiness_score}. Missing Pivota normalized attributes: ${pivotaMissing.join(", ") || "none"}.`,
        supportingRuns
      ),
    };
  }

  pivotaPdpReadiness(product: ProductRecord, cluster: QueryCluster) {
    const attrs = product.pivota_attributes || {};
    const normalizedAttributes = Object.keys(attrs).length;
    const requiredSatisfied = cluster.required_attributes.filter((attribute) =>
      Boolean(attrs[attribute])
    ).length;
    const requiredScore = cluster.required_attributes.length
      ? (requiredSatisfied / cluster.required_attributes.length) * 45
      : 35;
    const summaryScore = product.agent_summary ? 20 : 0;
    const entityScore = product.product_entity_id ? 15 : 0;
    const graphScore = normalizedAttributes >= 3 ? 20 : normalizedAttributes * 5;
    return requiredScore + summaryScore + entityScore + graphScore;
  }
}

export class FixTargetRouter {
  route(input: {
    issueType: AgenticGMVIssueType;
    score: DemandVisibilityScore;
    product?: ProductRecord;
    missingAttributes: string[];
    parserConfidence?: number;
    matchConfidence?: number;
  }): FixTarget[] {
    if (
      (input.parserConfidence !== undefined && input.parserConfidence < 0.7) ||
      (input.matchConfidence !== undefined && input.matchConfidence < 0.7)
    ) {
      return ["human_review"];
    }

    if (input.issueType === "pivota_pdp_readiness_gap") {
      return ["pivota_unified_pdp"];
    }

    if (
      input.issueType === "pivota_pdp_content_quality_gap" ||
      input.issueType === "pivota_product_intelligence_gap"
    ) {
      return ["pivota_unified_pdp", "pivota_product_graph"];
    }

    if (input.issueType === "merchant_store_attribution_gap") {
      return ["merchant_pdp", "merchant_catalog", "merchant_structured_data"];
    }

    if (input.issueType === "merchant_pdp_not_discovered") {
      return ["merchant_pdp", "merchant_structured_data"];
    }

    if (input.issueType === "pivota_pdp_attribution_gap") {
      return ["pivota_unified_pdp", "pivota_product_graph", "pivota_query_mapping"];
    }

    if (input.issueType === "pivota_pdp_not_discovered") {
      return ["pivota_unified_pdp", "pivota_product_graph"];
    }

    if (
      input.issueType === "wrong_buying_path_returned" ||
      input.issueType === "buying_path_missing"
    ) {
      return ["merchant_pdp", "pivota_product_graph"];
    }

    if (input.issueType === "offer_not_discovered") {
      return ["merchant_offer_source", "pivota_offer_layer"];
    }

    if (input.issueType === "search_grounding_not_configured") {
      return ["human_review"];
    }

    if (input.issueType === "pivota_offer_attribution_gap") {
      return ["pivota_unified_pdp", "pivota_product_graph"];
    }

    if (input.issueType === "unverified_pivota_attribution") {
      return ["pivota_unified_pdp", "pivota_product_graph", "pivota_query_mapping"];
    }

    if (input.issueType === "missing_attribute") {
      const merchantHasAttributes = input.missingAttributes.every((attribute) =>
        Boolean(input.product?.attributes?.[attribute])
      );
      const pivotaHasAttributes = input.missingAttributes.every((attribute) =>
        Boolean(input.product?.pivota_attributes?.[attribute])
      );
      if (merchantHasAttributes && !pivotaHasAttributes) return ["pivota_unified_pdp"];
      if (!merchantHasAttributes && !pivotaHasAttributes) {
        return ["both_merchant_and_pivota"];
      }
      return ["merchant_pdp"];
    }

    if (
      input.issueType === "competitor_substitution" ||
      input.issueType === "competitor_dominance"
    ) {
      if (input.missingAttributes.length > 0) {
        return ["merchant_pdp", "pivota_unified_pdp"];
      }
      return ["both_merchant_and_pivota"];
    }

    if (
      input.issueType === "ai_visibility_loss" ||
      input.issueType === "organic_product_not_discovered" ||
      input.issueType === "organic_brand_not_discovered"
    ) {
      if (input.missingAttributes.length > 0) {
        return ["merchant_pdp", "pivota_unified_pdp"];
      }
      return ["both_merchant_and_pivota"];
    }

    return ["human_review"];
  }
}

export class IssueEngine {
  generateForScore(input: {
    scanTarget: ScanTarget;
    score: DemandVisibilityScore;
    cluster: QueryCluster;
    parsed: ParsedRecommendation[];
    matches: ProductMatchResult[];
  }) {
    const state = getAgentCenterState();
    const store = findStore(input.scanTarget.store_id);
    const product = findProduct(store, input.cluster.product_id);
    const issues: AgenticGMVIssue[] = [];
    const aggregate = input.score.aggregate_scores;
    const missingAttributes = unique(
      input.parsed
        .flatMap((item) => item.missing_attributes_identified)
        .concat(missingAttributesForLayer(product, input.cluster, "merchant"))
    );
    const parserConfidence = Math.min(
      ...input.parsed.map((item) => item.parser_confidence),
      1
    );
    const matchConfidence = Math.min(
      ...input.matches.map((item) => item.match_confidence_score),
      1
    );
    const hasPivotaOffers = Boolean(
      product &&
        (Array.isArray(product.pivota_attributes?.offer_ids)
          ? product.pivota_attributes.offer_ids.length
          : Array.isArray(product.pivota_attributes?.merchant_offers)
            ? product.pivota_attributes.merchant_offers.length
            : false)
    );
    const scanMode = input.scanTarget.scan_mode;
    const isDiscoveryScan = discoveryTestEnabled(scanMode);
    const scoreValue = (value: VisibilityScoreValue | undefined) =>
      typeof value === "number" ? value : undefined;

    if (
      scanMode === "search_grounded_product_discovery_test" &&
      (aggregate.search_grounded_merchant_pdp_discovery_score === "not_configured" ||
        aggregate.search_grounded_pivota_pdp_discovery_score === "not_configured")
    ) {
      issues.push(
        this.createIssue({
          issueType: "search_grounding_not_configured",
          severity: "low",
          rootCause:
            "Gemini search grounding is not configured, so search-grounded product discovery was marked not configured instead of falling back to contextual attribution.",
          recommendedAction:
            "Configure Gemini search grounding before using Search-Grounded Product Discovery, or run Organic Product Discovery / Buying Path Discovery separately.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      scanMode === "organic_product_discovery_test" &&
      numericScore(aggregate.organic_product_discovery_score) < 40
    ) {
      issues.push(
        this.createIssue({
          issueType: "organic_product_not_discovered",
          severity: "high",
          rootCause:
            "Organic no-context discovery did not naturally surface the merchant product/entity for this query cluster.",
          recommendedAction: ORGANIC_DISCOVERY_NEXT_ACTION,
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      scanMode === "organic_product_discovery_test" &&
      numericScore(aggregate.organic_brand_discovery_score) < 40
    ) {
      issues.push(
        this.createIssue({
          issueType: "organic_brand_not_discovered",
          severity: "medium",
          rootCause:
            "Organic no-context discovery did not naturally surface the merchant brand for this query cluster.",
          recommendedAction:
            "Strengthen brand-level discoverability evidence and query-category associations before retesting organic discovery.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (isDiscoveryScan && numericScore(aggregate.competitor_dominance_score) >= 60) {
      issues.push(
        this.createIssue({
          issueType: "competitor_dominance",
          severity: "high",
          rootCause:
            "Discovery results are dominated by competitor products while the merchant product is absent.",
          recommendedAction: COMPETITOR_DOMINANCE_NEXT_ACTION,
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    const merchantDiscoveryScore = scoreValue(
      aggregate.search_grounded_merchant_pdp_discovery_score
    );
    const pivotaDiscoveryScore = scoreValue(
      aggregate.search_grounded_pivota_pdp_discovery_score
    );
    if (
      scanMode === "search_grounded_product_discovery_test" &&
      merchantDiscoveryScore !== undefined &&
      merchantDiscoveryScore < 40
    ) {
      issues.push(
        this.createIssue({
          issueType: "merchant_pdp_not_discovered",
          severity: "high",
          rootCause:
            "Search-grounded product discovery did not return the merchant domain or merchant PDP URL.",
          recommendedAction:
            "Improve merchant PDP indexability, structured data, and source-layer buying path signals, then rerun Search-Grounded Product Discovery.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      (scanMode === "search_grounded_product_discovery_test" ||
        scanMode === "buying_path_discovery_test") &&
      pivotaDiscoveryScore !== undefined &&
      pivotaDiscoveryScore < 40 &&
      product?.pivota_attributes?.pivota_pdp_url
    ) {
      issues.push(
        this.createIssue({
          issueType: "pivota_pdp_not_discovered",
          severity: "high",
          rootCause:
            "Discovery did not return the Pivota unified PDP URL or Pivota domain even though a Pivota PDP was expected for evaluation.",
          recommendedAction:
            "Improve Pivota PDP public availability, product graph bindings, and agent-facing metadata before rerunning discovery.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      (scanMode === "search_grounded_product_discovery_test" ||
        scanMode === "buying_path_discovery_test") &&
      scoreValue(aggregate.url_match_accuracy_score) !== undefined &&
      numericScore(aggregate.url_match_accuracy_score) < 50 &&
      input.parsed.some((item) => item.returned_urls.length > 0)
    ) {
      issues.push(
        this.createIssue({
          issueType: "wrong_buying_path_returned",
          severity: "medium",
          rootCause:
            "The model returned buying-path URLs, but they did not match the expected merchant PDP or Pivota PDP evaluation URLs.",
          recommendedAction:
            "Review returned URLs, source-layer canonical URLs, and Pivota PDP bindings before rerunning discovery.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      scanMode === "buying_path_discovery_test" &&
      numericScore(aggregate.buying_path_discovery_score) < 40
    ) {
      issues.push(
        this.createIssue({
          issueType: "buying_path_missing",
          severity: "high",
          rootCause:
            "Buying-path discovery did not return a merchant/Pivota URL, official page, or other buying path.",
          recommendedAction:
            "Improve official buying-path signals and rerun Buying Path Discovery.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      scanMode === "buying_path_discovery_test" &&
      numericScore(aggregate.offer_discovery_score) < 40
    ) {
      issues.push(
        this.createIssue({
          issueType: "offer_not_discovered",
          severity: "medium",
          rootCause:
            "Buying-path discovery did not return offer, price, or availability signals.",
          recommendedAction:
            "Expose current offer, price, promo, and availability signals on merchant/Pivota layers before rerunning buying-path discovery.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      !isDiscoveryScan &&
      aggregate.product_entity_visibility_score < 20 &&
      input.cluster.estimated_demand_value >= 8000
    ) {
      issues.push(
        this.createIssue({
          issueType: "ai_visibility_loss",
          severity: "high",
          rootCause:
            "The merchant product is rarely surfaced for high-value AI demand scenarios.",
          recommendedAction:
            "Strengthen the merchant PDP and Pivota unified PDP with demand-specific attributes and clearer agent summary copy.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      input.scanTarget.scan_mode === "merchant_store_attribution_test" &&
      aggregate.product_entity_visibility_score >= 60 &&
      aggregate.merchant_store_visibility_score < 40
    ) {
      issues.push(
        this.createIssue({
          issueType: "merchant_store_attribution_gap",
          severity: "high",
          rootCause:
            "The product is visible to the model, but the merchant store/PDP was not returned as the buying path.",
          recommendedAction:
            "Strengthen merchant PDP structured data, catalog source fields, and source attribution copy so the merchant store can be returned as the purchase source.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      input.scanTarget.scan_mode === "pivota_pdp_attribution_test" &&
      aggregate.product_entity_visibility_score >= 60 &&
      aggregate.pivota_pdp_visibility_score < 40
    ) {
      issues.push(
        this.createIssue({
          issueType: "pivota_pdp_attribution_gap",
          severity: "high",
          rootCause:
            "The product is visible to the model, but the Pivota unified PDP or product object was not returned as the agent-facing path.",
          recommendedAction:
            "Update the Pivota unified PDP, product object ID, and query mapping so the Pivota channel is returned for this demand scenario.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      input.scanTarget.scan_mode === "pivota_pdp_attribution_test" &&
      aggregate.pivota_attribution_echo_rate > 0
    ) {
      issues.push(
        this.createIssue({
          issueType: "unverified_pivota_attribution",
          severity: "medium",
          rootCause:
            "The model recognized the product and appeared to reference Pivota, but it did not return a verified public Pivota PDP URL, product object ID, or offer path. Pivota channel visibility has not been proven.",
          recommendedAction:
            "Publish or verify the Pivota PDP URL/product object and expose verified offer IDs before counting Pivota channel attribution as successful.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (
      input.scanTarget.scan_mode === "pivota_pdp_attribution_test" &&
      hasPivotaOffers &&
      aggregate.pivota_pdp_visibility_score >= 40 &&
      aggregate.pivota_offer_visibility_score < 40
    ) {
      issues.push(
        this.createIssue({
          issueType: "pivota_offer_attribution_gap",
          severity: "medium",
          rootCause:
            "The Pivota unified PDP is visible, but Pivota-managed merchant offers were not returned.",
          recommendedAction:
            "Attach or refresh offer IDs under the Pivota unified PDP and ensure the product object exposes merchant offer metadata.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (!isDiscoveryScan && aggregate.competitor_substitution_score >= 60) {
      issues.push(
        this.createIssue({
          issueType: "competitor_substitution",
          severity: "high",
          rootCause:
            "Competitors are recommended when the merchant product is missing from the answer.",
          recommendedAction:
            "Add comparison-ready evidence, improve attribute coverage, and update Pivota query/product mappings.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (aggregate.attribute_readiness_score < 60) {
      issues.push(
        this.createIssue({
          issueType: "missing_attribute",
          severity: "medium",
          rootCause:
            "Required query attributes are missing or unclear in the merchant or Pivota product layer.",
          recommendedAction:
            "Add the missing attributes to the merchant product source and sync the Pivota unified PDP.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    if (aggregate.pivota_pdp_readiness_score < 70) {
      issues.push(
        this.createIssue({
          issueType: "pivota_pdp_readiness_gap",
          severity: "medium",
          rootCause:
            "The Pivota unified PDP lacks enough normalized attributes or agent-facing summary clarity.",
          recommendedAction:
            "Update Pivota normalized attributes and agent summary for this query cluster.",
          input,
          product,
          missingAttributes,
          parserConfidence,
          matchConfidence,
        })
      );
    }

    for (const issue of issues) {
      const duplicate = state.issues.find(
        (existing) =>
          existing.scan_target_id === issue.scan_target_id &&
          existing.issue_type === issue.issue_type &&
          existing.affected_query_clusters[0] === issue.affected_query_clusters[0]
      );
      if (!duplicate) {
        state.issues.push(issue);
      }
    }

    return issues;
  }

  createIssue(input: {
    issueType: AgenticGMVIssueType;
    severity: AgenticGMVIssue["severity"];
    rootCause: string;
    recommendedAction: string;
    input: {
      scanTarget: ScanTarget;
      score: DemandVisibilityScore;
      cluster: QueryCluster;
      parsed: ParsedRecommendation[];
      matches: ProductMatchResult[];
    };
    product?: ProductRecord;
    missingAttributes: string[];
    parserConfidence: number;
    matchConfidence: number;
  }) {
    const now = nowIso();
    const store = findStore(input.input.scanTarget.store_id);
    const fixTargets = new FixTargetRouter().route({
      issueType: input.issueType,
      score: input.input.score,
      product: input.product,
      missingAttributes: input.missingAttributes,
      parserConfidence: input.parserConfidence,
      matchConfidence: input.matchConfidence,
    });
    const merchantMentions = input.input.matches.length
      ? input.input.matches.filter((match) => match.counts_for_visibility).length
      : input.input.parsed.filter((item) => item.merchant_product_mentioned).length;
    const competitorMentions = input.input.matches.reduce(
      (sum, match) => sum + match.competitor_matches.length,
      0
    );
    const missingAttributeMap = Object.fromEntries(
      input.missingAttributes.map((attribute) => [attribute, true])
    );
    const gmvConfidence: AgenticGMVIssue["estimated_gmv_at_risk_confidence"] =
      input.input.parsed.length >= 5
        ? "high"
        : input.input.parsed.length >= 3
          ? "medium"
          : "low";
    const queryLabel = input.input.cluster.cluster_name;
    const merchantSummary =
      `${titleCase(input.issueType)} detected for ${input.product?.title || "this product"} in "${queryLabel}". ` +
      `${merchantMentions} of ${input.input.parsed.length} completed Gemini runs mentioned the merchant product, while ${competitorMentions} competitor recommendations were detected.`;
    const competitorRecommendationList = topCompetitorRecommendations(
      input.input.matches
    );
    const discoveryEvidence = merchantSafeDiscoveryEvidence({
      scanTargetId: input.input.scanTarget.id,
      cluster: input.input.cluster,
      parsed: input.input.parsed,
      matches: input.input.matches,
      product: input.product,
      store,
    });
    const narrative = merchantNarrative({
      issueType: input.issueType,
      rootCause: input.rootCause,
      recommendedAction: input.recommendedAction,
      product: input.product,
      cluster: input.input.cluster,
      parsed: input.input.parsed,
      matches: input.input.matches,
      fixTargets,
      missingAttributes: input.missingAttributes,
      visibilityScore:
        input.input.score.aggregate_scores.product_entity_visibility_score,
      competitorSubstitutionScore:
        input.input.score.aggregate_scores.competitor_substitution_score,
    });

    return {
      id: nextId("issue"),
      merchant_id: input.input.scanTarget.merchant_id,
      store_id: input.input.scanTarget.store_id,
      scan_target_id: input.input.scanTarget.id,
      store_url: store.store_url,
      platform: store.platform,
      source_agent: "demand_test_agent" as const,
      issue_type: input.issueType,
      severity: input.severity,
      status: "recommendation_ready" as const,
      affected_product_entities: input.product?.product_entity_id
        ? [input.product.product_entity_id]
        : [],
      affected_skus: input.product?.sku ? [input.product.sku] : [],
      affected_query_clusters: [input.input.cluster.id],
      evidence: {
        source_job_id: input.input.score.job_id,
        query_cluster: input.input.cluster.cluster_name,
        query_cluster_id: input.input.cluster.id,
        product_entity_id: input.product?.product_entity_id,
        sku: input.product?.sku,
        total_test_runs: input.input.parsed.length,
        merchant_product_mentions: merchantMentions,
        product_entity_visibility_rate:
          input.input.score.aggregate_scores.product_entity_visibility_score / 100,
        visibility_rate: input.input.score.aggregate_scores.product_entity_visibility_score / 100,
        merchant_store_visibility_rate:
          input.input.score.aggregate_scores.merchant_store_visibility_score / 100,
        pivota_pdp_visibility_rate:
          input.input.score.aggregate_scores.pivota_pdp_visibility_score / 100,
        pivota_attribution_echo_rate:
          input.input.score.aggregate_scores.pivota_attribution_echo_rate / 100,
        pivota_pdp_preflight_status:
          input.input.parsed.find((item) => item.pivota_pdp_preflight_status)
            ?.pivota_pdp_preflight_status,
        pivota_pdp_preflight_status_code:
          input.input.parsed.find(
            (item) => item.pivota_pdp_preflight_status_code !== undefined
          )?.pivota_pdp_preflight_status_code,
        competitor_mentions: competitorMentions,
        top_competitors: unique(
          input.input.matches.flatMap((match) =>
            match.competitor_matches.map((competitor) => competitor.competitor_name)
          )
        ).slice(0, 3),
        top_competitor_recommendations: competitorRecommendationList,
        discovery_evidence: discoveryEvidence,
        tested_organic_queries: discoveryEvidence.tested_organic_queries,
        returned_products: discoveryEvidence.returned_products,
        returned_brands: discoveryEvidence.returned_brands,
        returned_competitors: discoveryEvidence.returned_competitors,
        competitor_rank_summary: discoveryEvidence.competitor_rank_summary,
        missing_merchant_product_summary:
          discoveryEvidence.missing_merchant_product_summary,
        likely_competitor_advantage_summary:
          discoveryEvidence.likely_competitor_advantage_summary,
        discovery_interpretation: discoveryEvidence.discovery_interpretation,
        competitor_dominance_evidence:
          discoveryEvidence.competitor_dominance_evidence,
        missing_attributes: input.missingAttributes,
        aggregate_scores: input.input.score.aggregate_scores,
        score_explanations: input.input.score.score_explanations,
      },
      root_cause: input.rootCause,
      fix_targets: fixTargets,
      recommended_action: input.recommendedAction,
      merchant_source_patch: {
        attributes: missingAttributeMap,
        pdp_copy_suggestion:
          input.missingAttributes.length > 0
            ? `Clarify ${input.missingAttributes.map(titleCase).join(", ")} on the PDP.`
            : "Clarify product suitability, proof points, and purchase path.",
      },
      pivota_unified_pdp_patch: {
        normalized_attributes: missingAttributeMap,
        agent_summary_update:
          input.product?.title
            ? `${input.product.title} should be represented with query-specific attributes and concise agent-facing summary copy.`
            : "Update Pivota product graph and agent-facing summary.",
      },
      estimated_gmv_at_risk: input.input.cluster.estimated_demand_value,
      gmv_estimation_method:
        "V1 estimate uses query_cluster.estimated_demand_value as directional GMV-at-risk, not transaction attribution.",
      estimated_gmv_at_risk_confidence: gmvConfidence,
      merchant_facing_summary: merchantSummary,
      merchant_facing_narrative: narrative,
      approval_required: true,
      verification_plan: {
        retest_query_clusters: [input.input.cluster.id],
        providers: ["gemini" as const],
        prompt_templates: activePromptTemplateIds(),
        success_metric: "visibility_rate" as const,
        target_improvement: `increase product entity visibility from ${input.input.score.aggregate_scores.product_entity_visibility_score}% to 20%+`,
      },
      created_at: now,
      updated_at: now,
    };
  }
}

export class DemandTestJobService {
  create(input: CreateJobInput) {
    const target = findScanTarget(input.scan_target_id);
    const estimate = new UsageMeteringService().estimate(input);
    const clusters = new QueryClusterService().generateForScanTarget(
      target.id,
      input.selected_product_ids
    );
    const scopedClusters = applyQueryClusterScope(clusters, input.query_cluster_ids);
    const now = nowIso();
    const job: DemandTestJob = {
      id: nextId("job"),
      merchant_id: target.merchant_id,
      store_id: target.store_id,
      scan_target_id: target.id,
      job_type: input.job_type || "manual_scan",
      scan_mode: target.scan_mode,
      execution_mode: "sync",
      scope: {
        query_cluster_ids: scopedClusters.map((cluster) => cluster.id),
        providers: input.providers?.length ? input.providers : ["gemini"],
        prompt_templates: input.prompt_template_ids?.length
          ? input.prompt_template_ids
          : activePromptTemplateIds(),
        repetitions: input.repetitions || 2,
      },
      estimated_credits: estimate.estimated_ai_test_credits,
      status: "ready_to_run",
      progress: [{ status: "ready_to_run", at: now }],
      parent_issue_id: input.parent_issue_id,
      created_at: now,
      updated_at: now,
    };
    getAgentCenterState().jobs.push(job);
    return job;
  }

  get(jobId: string) {
    const job = getAgentCenterState().jobs.find((item) => item.id === jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    return job;
  }

  async run(jobId: string, options?: { retestBoost?: boolean }) {
    const state = getAgentCenterState();
    const job = this.get(jobId);
    const target = findScanTarget(job.scan_target_id);
    const store = findStore(job.store_id);
    const adapter = new GeminiProviderAdapter();

    pushProgress(job, "queued");
    pushProgress(job, "generating_query_clusters");
    const clusters = new QueryClusterService().generateForScanTarget(target.id);
    const selectedClusters = clusters.filter((cluster) =>
      job.scope.query_cluster_ids.includes(cluster.id)
    );

    pushProgress(job, "running_provider_tests");
    for (const cluster of selectedClusters) {
      const product = findProduct(store, cluster.product_id);
      for (const provider of job.scope.providers) {
        if (provider !== "gemini") continue;
        const providerRecord = state.providers.find((item) => item.provider === provider);
        const model = providerRecord?.default_model || DEFAULT_GEMINI_MODEL;
        for (const promptTemplateId of job.scope.prompt_templates) {
          const template = state.promptTemplates.find(
            (item) => item.id === promptTemplateId
          );
          if (!template) continue;
          for (
            let repetitionIndex = 1;
            repetitionIndex <= job.scope.repetitions;
            repetitionIndex += 1
          ) {
            const query = queryForScanMode(
              cluster,
              product,
              target.scan_mode,
              repetitionIndex
            );
            const prompt = promptForScanMode({
              templatePrompt: template.prompt,
              query,
              scanMode: target.scan_mode,
              store,
              product,
            });
            const input: DemandTestInput = {
              merchantId: job.merchant_id,
              storeId: job.store_id,
              scanTargetId: job.scan_target_id,
              queryClusterId: cluster.id,
              scanMode: target.scan_mode,
              query,
              promptTemplateId,
              prompt,
              provider,
              model,
              language: target.language,
              market: target.market,
              currency: target.currency,
              merchantContext: { store, product },
              pivotaContext: product
                ? {
                    product_entity_id: product.product_entity_id,
                    attributes: product.pivota_attributes,
                    agent_summary: product.agent_summary,
                  }
                : {},
              competitorContext: {
                brands: store.competitor_brands || [],
                products: store.competitor_products || [],
              },
              outputSchema: PARSED_RECOMMENDATION_SCHEMA,
              repetitionIndex,
              retestBoost: options?.retestBoost,
            };
            input.pivotaAttributionPreflight = await buildPivotaAttributionPreflight(input);
            const run = this.createRun(job, cluster, query, provider, model, promptTemplateId, input);
            try {
              const raw = await adapter.runDemandTest(input);
              const result = this.createResult(run, raw);
              const parsed = parseProviderOutput(raw, input);
              parsed.test_run_id = run.id;
              parsed.query_cluster_id = cluster.id;
              state.parsedRecommendations.push(parsed);
              run.status = parsed.schema_valid ? "completed" : "parse_error";
              run.raw_output_id = result.id;
              touch(run);
              new UsageMeteringService().record({ job, run, result });
            } catch (error) {
              run.status = "provider_error";
              touch(run);
              console.error("[agent-center] provider run failed", error);
            }
          }
        }
      }
    }

    pushProgress(job, "parsing_outputs");
    pushProgress(job, "matching_products");
    for (const cluster of selectedClusters) {
      const parsedForCluster = state.parsedRecommendations.filter(
        (item) =>
          item.query_cluster_id === cluster.id &&
          state.testRuns.some(
            (run) => run.id === item.test_run_id && run.job_id === job.id
          )
      );
      for (const parsed of parsedForCluster) {
        new ProductMatchService().match(parsed, store, cluster);
      }
    }

    pushProgress(job, "scoring");
    const scores: DemandVisibilityScore[] = [];
    for (const cluster of selectedClusters) {
      const parsedForCluster = state.parsedRecommendations.filter(
        (item) =>
          item.query_cluster_id === cluster.id &&
          state.testRuns.some(
            (run) => run.id === item.test_run_id && run.job_id === job.id
          )
      );
      const matchesForCluster = state.matches.filter((match) =>
        parsedForCluster.some((parsed) => parsed.id === match.parsed_recommendation_id)
      );
      if (!parsedForCluster.length) continue;
      scores.push(
        new ScoringService().scoreCluster({
          jobId: job.id,
          scanTarget: target,
          cluster,
          parsed: parsedForCluster,
          matches: matchesForCluster,
        })
      );
    }

    pushProgress(job, "generating_issues");
    if (!options?.retestBoost) {
      for (const score of scores) {
        const cluster = selectedClusters.find(
          (item) => item.id === score.query_cluster_id
        );
        if (!cluster) continue;
        const parsedForCluster = state.parsedRecommendations.filter(
          (item) =>
            item.query_cluster_id === cluster.id &&
            state.testRuns.some(
              (run) => run.id === item.test_run_id && run.job_id === job.id
            )
        );
        const matchesForCluster = state.matches.filter((match) =>
          parsedForCluster.some(
            (parsed) => parsed.id === match.parsed_recommendation_id
          )
        );
        new IssueEngine().generateForScore({
          scanTarget: target,
          score,
          cluster,
          parsed: parsedForCluster,
          matches: matchesForCluster,
        });
      }
    }

    pushProgress(job, "completed");
    return this.results(job.id);
  }

  createRun(
    job: DemandTestJob,
    cluster: QueryCluster,
    query: string,
    provider: ProviderName,
    model: string,
    promptTemplateId: string,
    input: DemandTestInput
  ) {
    const now = nowIso();
    const run: LLMSurfaceTestRun = {
      id: nextId("run"),
      job_id: job.id,
      merchant_id: job.merchant_id,
      store_id: job.store_id,
      scan_target_id: job.scan_target_id,
      query_cluster_id: cluster.id,
      query,
      provider,
      model,
      prompt_template_id: promptTemplateId,
      temperature: 0.2,
      status: "running",
      input_payload_hash: hashJson(input),
      repetition_index: input.repetitionIndex,
      created_at: now,
      updated_at: now,
    };
    getAgentCenterState().testRuns.push(run);
    return run;
  }

  createResult(run: LLMSurfaceTestRun, raw: Awaited<ReturnType<GeminiProviderAdapter["runDemandTest"]>>) {
    const now = nowIso();
    const result: LLMSurfaceResult = {
      id: nextId("result"),
      test_run_id: run.id,
      provider: raw.provider,
      model: raw.model,
      raw_output: raw.raw_output,
      normalized_output: raw.normalized_output || {},
      input_tokens: raw.input_tokens,
      output_tokens: raw.output_tokens,
      tool_calls: raw.tool_calls,
      provider_request_id: raw.provider_request_id,
      created_at: now,
      updated_at: now,
    };
    getAgentCenterState().results.push(result);
    return result;
  }

  results(jobId: string) {
    const state = getAgentCenterState();
    const job = this.get(jobId);
    const target = findScanTarget(job.scan_target_id);
    const store = findStore(job.store_id);
    const runs = state.testRuns.filter((run) => run.job_id === jobId);
    const runIds = new Set(runs.map((run) => run.id));
    const parsed = state.parsedRecommendations.filter((item) =>
      runIds.has(item.test_run_id)
    );
    const clusters = state.queryClusters.filter((cluster) =>
      job.scope.query_cluster_ids.includes(cluster.id)
    );
    const scores = state.scores.filter(
      (score) =>
        score.job_id === jobId &&
        clusters.some((cluster) => cluster.id === score.query_cluster_id)
    );
    const issues = state.issues.filter((issue) => issue.scan_target_id === target.id);
    const aggregate = aggregateScores(scores);

    return {
      job,
      scan_target: target,
      store,
      query_clusters: clusters,
      test_runs: runs,
      parsed_recommendations: parsed,
      scores,
      aggregate_scores: aggregate,
      issues,
      usage_events: state.usageEvents.filter(
        (event) => event.scan_target_id === target.id
      ),
    };
  }
}

function aggregateScores(scores: DemandVisibilityScore[]) {
  if (!scores.length) {
    return {
      product_entity_visibility_score: 0,
      merchant_store_visibility_score: 0,
      pivota_pdp_visibility_score: 0,
      pivota_offer_visibility_score: 0,
      pivota_attribution_echo_rate: 0,
      executable_offer_visibility_score: "not_tested" as const,
      organic_product_discovery_score: "not_tested" as const,
      organic_brand_discovery_score: "not_tested" as const,
      competitor_dominance_score: "not_tested" as const,
      search_grounded_merchant_pdp_discovery_score: "not_tested" as const,
      search_grounded_pivota_pdp_discovery_score: "not_tested" as const,
      buying_path_discovery_score: "not_tested" as const,
      offer_discovery_score: "not_tested" as const,
      url_match_accuracy_score: "not_tested" as const,
      visibility_score: 0,
      recommendation_rank_score: 0,
      competitor_substitution_score: 0,
      attribute_readiness_score: 0,
      pivota_pdp_readiness_score: 0,
      estimated_gmv_at_risk: 0,
      gmv_estimation_method:
        "No completed score clusters; GMV-at-risk is unavailable.",
      estimated_gmv_at_risk_confidence: "low" as const,
    };
  }

  const sum = scores.reduce(
    (acc, score) => {
      acc.visibility_score += score.aggregate_scores.visibility_score;
      acc.product_entity_visibility_score +=
        score.aggregate_scores.product_entity_visibility_score ??
        score.aggregate_scores.visibility_score;
      acc.merchant_store_visibility_score +=
        score.aggregate_scores.merchant_store_visibility_score || 0;
      acc.pivota_pdp_visibility_score +=
        score.aggregate_scores.pivota_pdp_visibility_score || 0;
      acc.pivota_offer_visibility_score +=
        score.aggregate_scores.pivota_offer_visibility_score || 0;
      acc.pivota_attribution_echo_rate +=
        score.aggregate_scores.pivota_attribution_echo_rate || 0;
      const executable = score.aggregate_scores.executable_offer_visibility_score;
      if (typeof executable === "number") {
        acc.executable_offer_visibility_score += executable;
        acc.executable_offer_tested_count += 1;
      }
      acc.recommendation_rank_score += score.aggregate_scores.recommendation_rank_score;
      acc.competitor_substitution_score +=
        score.aggregate_scores.competitor_substitution_score;
      acc.attribute_readiness_score += score.aggregate_scores.attribute_readiness_score;
      acc.pivota_pdp_readiness_score += score.aggregate_scores.pivota_pdp_readiness_score;
      return acc;
    },
    {
      product_entity_visibility_score: 0,
      merchant_store_visibility_score: 0,
      pivota_pdp_visibility_score: 0,
      pivota_offer_visibility_score: 0,
      pivota_attribution_echo_rate: 0,
      executable_offer_visibility_score: 0,
      executable_offer_tested_count: 0,
      visibility_score: 0,
      recommendation_rank_score: 0,
      competitor_substitution_score: 0,
      attribute_readiness_score: 0,
      pivota_pdp_readiness_score: 0,
    }
  );
  const count = scores.length;
  const optionalAverage = (
    key: keyof DemandVisibilityScore["aggregate_scores"]
  ): VisibilityScoreValue => {
    const values = scores
      .map((score) => score.aggregate_scores[key])
      .filter((value): value is number => typeof value === "number");
    if (values.length) {
      return clampScore(values.reduce((sum, value) => sum + value, 0) / values.length);
    }
    if (scores.some((score) => score.aggregate_scores[key] === "not_configured")) {
      return "not_configured";
    }
    return "not_tested";
  };
  const productEntityVisibility = clampScore(
    sum.product_entity_visibility_score / count
  );
  return {
    product_entity_visibility_score: productEntityVisibility,
    merchant_store_visibility_score: clampScore(
      sum.merchant_store_visibility_score / count
    ),
    pivota_pdp_visibility_score: clampScore(sum.pivota_pdp_visibility_score / count),
    pivota_offer_visibility_score: clampScore(
      sum.pivota_offer_visibility_score / count
    ),
    pivota_attribution_echo_rate: clampScore(
      sum.pivota_attribution_echo_rate / count
    ),
    executable_offer_visibility_score: sum.executable_offer_tested_count
      ? clampScore(
          sum.executable_offer_visibility_score / sum.executable_offer_tested_count
        )
      : ("not_tested" as const),
    organic_product_discovery_score: optionalAverage("organic_product_discovery_score"),
    organic_brand_discovery_score: optionalAverage("organic_brand_discovery_score"),
    competitor_dominance_score: optionalAverage("competitor_dominance_score"),
    search_grounded_merchant_pdp_discovery_score: optionalAverage(
      "search_grounded_merchant_pdp_discovery_score"
    ),
    search_grounded_pivota_pdp_discovery_score: optionalAverage(
      "search_grounded_pivota_pdp_discovery_score"
    ),
    buying_path_discovery_score: optionalAverage("buying_path_discovery_score"),
    offer_discovery_score: optionalAverage("offer_discovery_score"),
    url_match_accuracy_score: optionalAverage("url_match_accuracy_score"),
    visibility_score: productEntityVisibility,
    recommendation_rank_score: clampScore(sum.recommendation_rank_score / count),
    competitor_substitution_score: clampScore(
      sum.competitor_substitution_score / count
    ),
    attribute_readiness_score: clampScore(sum.attribute_readiness_score / count),
    pivota_pdp_readiness_score: clampScore(sum.pivota_pdp_readiness_score / count),
    estimated_gmv_at_risk: scores.length * 3600,
    gmv_estimation_method:
      "V1 estimate multiplies scored query clusters by a directional demand value proxy; it is not transaction attribution.",
    estimated_gmv_at_risk_confidence:
      scores.length >= 5 ? "medium" : ("low" as const),
  };
}

function sourceJobForIssue(issue: AgenticGMVIssue) {
  const state = getAgentCenterState();
  const sourceJobId =
    typeof issue.evidence?.source_job_id === "string"
      ? issue.evidence.source_job_id
      : undefined;
  const directJob = sourceJobId
    ? state.jobs.find((job) => job.id === sourceJobId)
    : undefined;
  if (directJob) return directJob;

  const sourceRun = [...state.testRuns]
    .reverse()
    .find(
      (run) =>
        run.scan_target_id === issue.scan_target_id &&
        issue.affected_query_clusters.includes(run.query_cluster_id)
    );
  return sourceRun ? state.jobs.find((job) => job.id === sourceRun.job_id) : undefined;
}

function scoreSnapshot(input: {
  issue: AgenticGMVIssue;
  scores: DemandVisibilityScore[];
  estimatedGmvAtRisk: number;
}) {
  const aggregate = aggregateScores(input.scores);
  return {
    score_ids: input.scores.map((score) => score.id),
    aggregate_scores: {
      product_entity_visibility_score: aggregate.product_entity_visibility_score,
      merchant_store_visibility_score: aggregate.merchant_store_visibility_score,
      pivota_pdp_visibility_score: aggregate.pivota_pdp_visibility_score,
      pivota_offer_visibility_score: aggregate.pivota_offer_visibility_score,
      pivota_attribution_echo_rate: aggregate.pivota_attribution_echo_rate,
      executable_offer_visibility_score: aggregate.executable_offer_visibility_score,
      organic_product_discovery_score: aggregate.organic_product_discovery_score,
      organic_brand_discovery_score: aggregate.organic_brand_discovery_score,
      competitor_dominance_score: aggregate.competitor_dominance_score,
      search_grounded_merchant_pdp_discovery_score:
        aggregate.search_grounded_merchant_pdp_discovery_score,
      search_grounded_pivota_pdp_discovery_score:
        aggregate.search_grounded_pivota_pdp_discovery_score,
      buying_path_discovery_score: aggregate.buying_path_discovery_score,
      offer_discovery_score: aggregate.offer_discovery_score,
      url_match_accuracy_score: aggregate.url_match_accuracy_score,
      visibility_score: aggregate.visibility_score,
      recommendation_rank_score: aggregate.recommendation_rank_score,
      competitor_substitution_score: aggregate.competitor_substitution_score,
      attribute_readiness_score: aggregate.attribute_readiness_score,
      pivota_pdp_readiness_score: aggregate.pivota_pdp_readiness_score,
    },
    estimated_gmv_at_risk: input.estimatedGmvAtRisk,
    gmv_estimation_method: input.issue.gmv_estimation_method,
    estimated_gmv_at_risk_confidence:
      input.issue.estimated_gmv_at_risk_confidence,
  };
}

function dimensionScoreValue(
  dimension?: GMVAssuranceDimensionSummary
): VisibilityScoreValue {
  return dimension?.score ?? "not_tested";
}

function dimensionNumericScore(
  dimension?: GMVAssuranceDimensionSummary,
  fallback = 0
) {
  return typeof dimension?.score === "number" ? dimension.score : fallback;
}

function urlMatchScoreFromSnapshot(
  snapshot: GMVAssuranceSnapshot
): VisibilityScoreValue {
  const scores = [
    snapshot.discovery_readiness_summary?.merchant_pdp_discovery_status.score,
    snapshot.discovery_readiness_summary?.pivota_pdp_discovery_status.score,
  ].filter((value): value is number => typeof value === "number");
  if (!scores.length) return "not_tested";
  return clampScore(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

function scoreSnapshotFromAssuranceSnapshot(
  issue: AgenticGMVIssue,
  snapshot: GMVAssuranceSnapshot
): VerificationRun["before_scores"] {
  const discovery = snapshot.discovery_readiness_summary;
  const demand = snapshot.demand_test_summary;
  const product = snapshot.product_understanding_summary;
  const productVisibility = dimensionNumericScore(demand.product_visibility_status);
  return {
    score_ids: [snapshot.demand_test_summary.latest_score_id || snapshot.id],
    aggregate_scores: {
      product_entity_visibility_score: productVisibility,
      merchant_store_visibility_score: dimensionNumericScore(
        demand.merchant_attribution_status
      ),
      pivota_pdp_visibility_score: dimensionNumericScore(
        demand.pivota_attribution_status
      ),
      pivota_offer_visibility_score: 0,
      pivota_attribution_echo_rate: 0,
      executable_offer_visibility_score: "not_tested",
      organic_product_discovery_score: dimensionScoreValue(
        discovery?.organic_product_discovery_status
      ),
      organic_brand_discovery_score: "not_tested",
      competitor_dominance_score: dimensionScoreValue(
        discovery?.competitor_dominance_status
      ),
      search_grounded_merchant_pdp_discovery_score: dimensionScoreValue(
        discovery?.merchant_pdp_discovery_status
      ),
      search_grounded_pivota_pdp_discovery_score: dimensionScoreValue(
        discovery?.pivota_pdp_discovery_status
      ),
      buying_path_discovery_score: dimensionScoreValue(
        discovery?.buying_path_discovery_status
      ),
      offer_discovery_score: "not_tested",
      url_match_accuracy_score: urlMatchScoreFromSnapshot(snapshot),
      visibility_score: productVisibility,
      recommendation_rank_score: 0,
      competitor_substitution_score: 0,
      attribute_readiness_score: dimensionNumericScore(
        product.product_data_readiness_status
      ),
      pivota_pdp_readiness_score: dimensionNumericScore(
        product.product_data_readiness_status
      ),
    },
    estimated_gmv_at_risk: issue.estimated_gmv_at_risk,
    gmv_estimation_method: issue.gmv_estimation_method,
    estimated_gmv_at_risk_confidence:
      issue.estimated_gmv_at_risk_confidence,
  };
}

function scoreValueDelta(after: VisibilityScoreValue, before: VisibilityScoreValue) {
  return typeof after === "number" && typeof before === "number"
    ? after - before
    : 0;
}

function scoreDelta(
  before: VerificationRun["before_scores"],
  after: VerificationRun["after_scores"]
) {
  return {
    product_entity_visibility_score:
      after.aggregate_scores.product_entity_visibility_score -
      before.aggregate_scores.product_entity_visibility_score,
    merchant_store_visibility_score:
      after.aggregate_scores.merchant_store_visibility_score -
      before.aggregate_scores.merchant_store_visibility_score,
    pivota_pdp_visibility_score:
      after.aggregate_scores.pivota_pdp_visibility_score -
      before.aggregate_scores.pivota_pdp_visibility_score,
    pivota_offer_visibility_score:
      after.aggregate_scores.pivota_offer_visibility_score -
      before.aggregate_scores.pivota_offer_visibility_score,
    pivota_attribution_echo_rate:
      after.aggregate_scores.pivota_attribution_echo_rate -
      before.aggregate_scores.pivota_attribution_echo_rate,
    executable_offer_visibility_score:
      scoreValueDelta(
        after.aggregate_scores.executable_offer_visibility_score,
        before.aggregate_scores.executable_offer_visibility_score
      ),
    organic_product_discovery_score:
      scoreValueDelta(
        after.aggregate_scores.organic_product_discovery_score,
        before.aggregate_scores.organic_product_discovery_score
      ),
    organic_brand_discovery_score:
      scoreValueDelta(
        after.aggregate_scores.organic_brand_discovery_score,
        before.aggregate_scores.organic_brand_discovery_score
      ),
    competitor_dominance_score:
      scoreValueDelta(
        after.aggregate_scores.competitor_dominance_score,
        before.aggregate_scores.competitor_dominance_score
      ),
    search_grounded_merchant_pdp_discovery_score:
      scoreValueDelta(
        after.aggregate_scores.search_grounded_merchant_pdp_discovery_score,
        before.aggregate_scores.search_grounded_merchant_pdp_discovery_score
      ),
    search_grounded_pivota_pdp_discovery_score:
      scoreValueDelta(
        after.aggregate_scores.search_grounded_pivota_pdp_discovery_score,
        before.aggregate_scores.search_grounded_pivota_pdp_discovery_score
      ),
    buying_path_discovery_score:
      scoreValueDelta(
        after.aggregate_scores.buying_path_discovery_score,
        before.aggregate_scores.buying_path_discovery_score
      ),
    offer_discovery_score:
      scoreValueDelta(
        after.aggregate_scores.offer_discovery_score,
        before.aggregate_scores.offer_discovery_score
      ),
    url_match_accuracy_score:
      scoreValueDelta(
        after.aggregate_scores.url_match_accuracy_score,
        before.aggregate_scores.url_match_accuracy_score
      ),
    visibility_score:
      after.aggregate_scores.product_entity_visibility_score -
      before.aggregate_scores.product_entity_visibility_score,
    recommendation_rank_score:
      after.aggregate_scores.recommendation_rank_score -
      before.aggregate_scores.recommendation_rank_score,
    competitor_substitution_score:
      after.aggregate_scores.competitor_substitution_score -
      before.aggregate_scores.competitor_substitution_score,
    attribute_readiness_score:
      after.aggregate_scores.attribute_readiness_score -
      before.aggregate_scores.attribute_readiness_score,
    pivota_pdp_readiness_score:
      after.aggregate_scores.pivota_pdp_readiness_score -
      before.aggregate_scores.pivota_pdp_readiness_score,
    estimated_gmv_at_risk:
      after.estimated_gmv_at_risk - before.estimated_gmv_at_risk,
  };
}

function estimatedAfterGmvAtRisk(
  issue: AgenticGMVIssue,
  scores: DemandVisibilityScore["aggregate_scores"]
) {
  const resolvedByIssueType =
    (issue.issue_type === "ai_visibility_loss" &&
      scores.product_entity_visibility_score >= 20) ||
    (issue.issue_type === "competitor_substitution" &&
      scores.competitor_substitution_score < 60) ||
    (issue.issue_type === "missing_attribute" &&
      scores.attribute_readiness_score >= 60) ||
    ((issue.issue_type === "pivota_pdp_readiness_gap" ||
      issue.issue_type === "pivota_pdp_content_quality_gap" ||
      issue.issue_type === "pivota_product_intelligence_gap") &&
      scores.pivota_pdp_readiness_score >= 70);

  return resolvedByIssueType ? 0 : issue.estimated_gmv_at_risk;
}

function retestUsageEventIds(jobId: string) {
  return getAgentCenterState()
    .usageEvents.filter((event) => event.idempotency_key.startsWith(`${jobId}:`))
    .map((event) => event.id);
}

export class VerificationService {
  prepareRetestIssue(issueId: string): RetestPreparation {
    const state = getAgentCenterState();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) throw new Error(`Issue not found: ${issueId}`);

    const sourceJob = sourceJobForIssue(issue);
    const providers = sourceJob?.scope.providers || issue.verification_plan.providers;
    const promptTemplates =
      sourceJob?.scope.prompt_templates || issue.verification_plan.prompt_templates;
    const repetitions = sourceJob?.scope.repetitions || 2;
    const estimate = new UsageMeteringService().estimate({
      scan_target_id: issue.scan_target_id,
      providers,
      prompt_template_ids: promptTemplates,
      query_cluster_ids: issue.affected_query_clusters,
      repetitions,
    });
    const now = nowIso();
    const preparation: RetestPreparation = {
      id: nextId("retest_prep"),
      merchant_id: issue.merchant_id,
      store_id: issue.store_id,
      scan_target_id: issue.scan_target_id,
      issue_id: issue.id,
      status: "prepared",
      query_cluster_ids: issue.affected_query_clusters,
      providers,
      prompt_templates: promptTemplates,
      repetitions,
      source_job_id: sourceJob?.id,
      planned_job_type: "retest",
      estimated_credits: estimate.estimated_ai_test_credits,
      credits_remaining_before_retest: estimate.remaining_credits,
      estimated_overage_credits: estimate.estimated_overage_credits,
      billing_mode: "preview_only",
      billing_status: "not_invoiced",
      created_at: now,
      updated_at: now,
    };

    state.retestPreparations.push(preparation);
    return preparation;
  }

  async retestIssue(issueId: string) {
    const state = getAgentCenterState();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) throw new Error(`Issue not found: ${issueId}`);
    const beforeIssueSnapshot = cloneJson(issue);
    const preparation =
      [...state.retestPreparations]
        .reverse()
        .find((item) => item.issue_id === issueId && item.status === "prepared") ||
      this.prepareRetestIssue(issueId);
    issue.status = "verification_running";
    touch(issue);

    const target = findScanTarget(issue.scan_target_id);
    const beforeScores = state.scores.filter(
      (score) =>
        issue.affected_query_clusters.includes(score.query_cluster_id) &&
        (!preparation.source_job_id || score.job_id === preparation.source_job_id)
    );
    const beforeSnapshot = beforeScores.length
      ? scoreSnapshot({
          issue,
          scores: beforeScores,
          estimatedGmvAtRisk: issue.estimated_gmv_at_risk,
        })
      : (() => {
          const assuranceSnapshot = latestByCreatedAt(
            state.gmvAssuranceSnapshots.filter(
              (snapshot) =>
                snapshot.scan_target_id === issue.scan_target_id &&
                snapshot.issue_ids.includes(issue.id)
            )
          );
          if (!assuranceSnapshot) throw new Error("Before score not found");
          return scoreSnapshotFromAssuranceSnapshot(issue, assuranceSnapshot);
        })();

    const job = new DemandTestJobService().create({
      scan_target_id: target.id,
      providers: preparation.providers,
      prompt_template_ids: preparation.prompt_templates,
      query_cluster_ids: preparation.query_cluster_ids,
      repetitions: preparation.repetitions,
      job_type: "retest",
      parent_issue_id: issue.id,
    });
    job.estimated_credits = preparation.estimated_credits;
    preparation.status = "consumed";
    touch(preparation);

    const results = await new DemandTestJobService().run(job.id, { retestBoost: true });
    const afterScores = state.scores.filter(
      (score) =>
        score.job_id === job.id &&
        preparation.query_cluster_ids.includes(score.query_cluster_id)
    );
    if (!afterScores.length) throw new Error("After score not found");
    const afterAggregate = aggregateScores(afterScores);
    const afterSnapshot = scoreSnapshot({
      issue,
      scores: afterScores,
      estimatedGmvAtRisk: estimatedAfterGmvAtRisk(issue, afterAggregate),
    });

    const now = nowIso();
    const delta = scoreDelta(beforeSnapshot, afterSnapshot);
    const usageEventIds = retestUsageEventIds(job.id);
    const verification: VerificationRun = {
      id: nextId("verification"),
      merchant_id: issue.merchant_id,
      store_id: issue.store_id,
      scan_target_id: issue.scan_target_id,
      issue_id: issue.id,
      source_agent: "demand_test_agent",
      query_cluster_ids: preparation.query_cluster_ids,
      provider_set: preparation.providers,
      prompt_template_ids: preparation.prompt_templates,
      repetition_count: preparation.repetitions,
      before_scores: beforeSnapshot,
      after_scores: afterSnapshot,
      score_delta: delta,
      before_issue_snapshot: beforeIssueSnapshot,
      after_result_snapshot: {
        retest_job_id: job.id,
        completed_runs: results.test_runs.filter((run) => run.status === "completed")
          .length,
        parsed_recommendations: results.parsed_recommendations.length,
        score_ids: afterScores.map((score) => score.id),
        aggregate_scores: afterSnapshot.aggregate_scores,
        usage_event_ids: usageEventIds,
      },
      status: "completed",
      usage_event_ids: usageEventIds,
      completed_at: now,
      retest_job_id: job.id,
      before_score_id: beforeSnapshot.score_ids[0],
      after_score_id: afterSnapshot.score_ids[0],
      result: {
        before_visibility_score:
          beforeSnapshot.aggregate_scores.product_entity_visibility_score,
        after_visibility_score:
          afterSnapshot.aggregate_scores.product_entity_visibility_score,
        before_competitor_substitution_score:
          beforeSnapshot.aggregate_scores.competitor_substitution_score,
        after_competitor_substitution_score:
          afterSnapshot.aggregate_scores.competitor_substitution_score,
      },
      created_at: now,
      updated_at: now,
    };

    state.verificationRuns.push(verification);
    issue.status =
      verification.after_scores.aggregate_scores.product_entity_visibility_score >
        verification.before_scores.aggregate_scores.product_entity_visibility_score ||
      verification.after_scores.estimated_gmv_at_risk <
        verification.before_scores.estimated_gmv_at_risk
        ? "resolved"
        : "failed_verification";
    touch(issue);
    return verification;
  }
}

function presentAttributeKeys(attributes: Record<string, unknown>) {
  return Object.entries(attributes)
    .filter(([, value]) => isAttributePresent(value))
    .map(([key]) => key);
}

function expectedAttributeLabel(attribute: string) {
  return `Query cluster requires ${titleCase(attribute)} evidence.`;
}

function attributeGaps(input: {
  attributes: string[];
  layer: AttributeGap["layer"];
  fixTarget: FixTarget;
  severity?: AttributeGap["severity"];
}) {
  return input.attributes.map<AttributeGap>((attribute) => ({
    attribute,
    layer: input.layer,
    expected: expectedAttributeLabel(attribute),
    severity: input.severity || "medium",
    fix_target: input.fixTarget,
    recommendation:
      input.layer === "merchant_source"
        ? `Add ${titleCase(attribute)} to merchant PDP/catalog source data.`
        : input.layer === "pivota_unified_pdp"
          ? `Normalize ${titleCase(attribute)} on the Pivota unified PDP.`
          : `Add ${titleCase(attribute)} in merchant source data and sync it into Pivota.`,
  }));
}

function layerComparison(input: {
  layer: ProductLayerComparison["layer"];
  product?: ProductRecord;
  missingAttributes: string[];
  gaps: AttributeGap[];
}) {
  const attributes =
    input.layer === "merchant_source"
      ? input.product?.attributes || {}
      : input.product?.pivota_attributes || {};

  return {
    layer: input.layer,
    product_title: input.product?.title,
    product_entity_id: input.product?.product_entity_id,
    sku: input.product?.sku,
    present_attributes: presentAttributeKeys(attributes),
    missing_attributes: input.missingAttributes,
    pdp_url_present:
      input.layer === "merchant_source"
        ? Boolean(input.product?.pdp_url)
        : Boolean(input.product?.pivota_attributes?.pivota_pdp_url),
    agent_summary_present:
      input.layer === "merchant_source"
        ? Boolean(input.product?.agent_summary)
        : Boolean(input.product?.pivota_attributes?.agent_summary || input.product?.agent_summary),
    findings: input.gaps,
  } satisfies ProductLayerComparison;
}

function productUnderstandingRootCause(input: {
  merchantMissing: string[];
  pivotaMissing: string[];
  entityFindings: EntityMappingFinding[];
  variantFindings: VariantMappingFinding[];
  queryFindings: QueryMappingFinding[];
  competitorFindings: CompetitorMappingFinding[];
}) {
  if (
    input.entityFindings.some((finding) =>
      ["product_entity_mapping_issue", "wrong_product_family", "ambiguous_product_match"].includes(
        finding.finding_type
      )
    )
  ) {
    return "The Demand Test issue is likely driven by product/entity mapping ambiguity: model output matched the brand but did not reliably match the canonical product family or ProductEntity.";
  }

  if (input.merchantMissing.length && input.pivotaMissing.length) {
    return `Merchant PDP/catalog source data is missing ${input.merchantMissing.map(titleCase).join(", ")}, and Pivota does not have normalized values for the same demand attributes.`;
  }

  if (!input.merchantMissing.length && input.pivotaMissing.length) {
    return `Merchant source data is complete for the tested attributes, but the Pivota unified PDP is missing normalized ${input.pivotaMissing.map(titleCase).join(", ")} values.`;
  }

  if (input.merchantMissing.length) {
    return `Merchant PDP/catalog source data is missing ${input.merchantMissing.map(titleCase).join(", ")}, which weakens downstream product understanding.`;
  }

  if (
    input.variantFindings.some((finding) => finding.finding_type !== "no_issue")
  ) {
    return "The product entity is visible, but the model output does not resolve cleanly to an exact SKU or variant. The merchant variant map should be clarified before SKU-level verification.";
  }

  if (input.queryFindings.some((finding) => finding.finding_type !== "no_issue")) {
    return "The product appears eligible for the query, but the Pivota query mapping is missing or weak for this demand cluster.";
  }

  if (
    input.competitorFindings.some((finding) => finding.finding_type !== "no_issue")
  ) {
    return "Competitor/substitute evidence is present, but Pivota does not have enough substitute mapping context to explain or counter-position the merchant product.";
  }

  return "No deterministic product-layer root cause was isolated. Human review should inspect the product graph, parser evidence, and query mapping.";
}

function patchByType(
  recommendations: ProductPatchRecommendation[],
  patchType: ProductPatchRecommendation["patch_type"]
) {
  return recommendations.find((recommendation) => recommendation.patch_type === patchType);
}

function evidenceStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

export class ProductUnderstandingService {
  latest(issueId: string) {
    return [...getAgentCenterState().productUnderstandingDiagnoses]
      .reverse()
      .find((diagnosis) => diagnosis.issue_id === issueId) || null;
  }

  debugPayload(issueId: string) {
    const state = getAgentCenterState();
    const issue = findIssue(issueId);
    const diagnosis = this.latest(issueId);
    const store = findStore(issue.store_id);
    const clusters = state.queryClusters.filter((cluster) =>
      issue.affected_query_clusters.includes(cluster.id)
    );
    const product = findProductForIssue(store, issue, clusters);
    const usageEvents = diagnosis
      ? state.usageEvents.filter((event) =>
          diagnosis.usage_event_ids.includes(event.id)
        )
      : [];

    return {
      source_issue_summary: {
        issue_id: issue.id,
        issue_type: issue.issue_type,
        severity: issue.severity,
        status: issue.status,
        affected_product_entities: issue.affected_product_entities,
        affected_skus: issue.affected_skus,
        affected_query_clusters: issue.affected_query_clusters,
        root_cause: issue.root_cause,
        fix_targets: issue.fix_targets,
      },
      merchant_layer_inputs_used: {
        store_id: store.id,
        store_name: store.store_name,
        store_url: store.store_url,
        product_id: product?.id,
        product_title: product?.title,
        product_entity_id: product?.product_entity_id,
        sku: product?.sku,
        pdp_url: product?.pdp_url,
        attributes: product?.attributes || {},
      },
      pivota_layer_inputs_used: {
        product_entity_id: product?.product_entity_id,
        unified_pdp_attributes: product?.pivota_attributes || {},
        agent_summary: product?.agent_summary,
      },
      findings: diagnosis
        ? {
            merchant_layer_findings: diagnosis.merchant_layer_findings,
            pivota_layer_findings: diagnosis.pivota_layer_findings,
            sku_variant_findings: diagnosis.sku_variant_findings,
            entity_mapping_findings: diagnosis.entity_mapping_findings,
            query_mapping_findings: diagnosis.query_mapping_findings,
            competitor_mapping_findings: diagnosis.competitor_mapping_findings,
          }
        : null,
      refined_fix_targets: diagnosis?.refined_fix_targets || [],
      patch_recommendations: diagnosis?.patch_recommendations || [],
      confidence: diagnosis?.confidence || null,
      usage_event_ids: diagnosis?.usage_event_ids || [],
      usage_events: usageEvents,
    };
  }

  runDiagnosis(
    issueId: string,
    options?: { regeneratePatch?: boolean; attachToRetestPlan?: boolean }
  ) {
    const existing = this.latest(issueId);
    if (existing && !options?.regeneratePatch && !options?.attachToRetestPlan) {
      return existing;
    }

    const state = getAgentCenterState();
    const issue = findIssue(issueId);
    const target = findScanTarget(issue.scan_target_id);
    const store = findStore(issue.store_id);
    const clusters = state.queryClusters.filter((cluster) =>
      issue.affected_query_clusters.includes(cluster.id)
    );
    const product = findProductForIssue(store, issue, clusters);
    const runIds = new Set(
      state.testRuns
        .filter(
          (run) =>
            run.scan_target_id === issue.scan_target_id &&
            issue.affected_query_clusters.includes(run.query_cluster_id)
        )
        .map((run) => run.id)
    );
    const parsed = state.parsedRecommendations.filter((item) =>
      runIds.has(item.test_run_id)
    );
    const parsedIds = new Set(parsed.map((item) => item.id));
    const matches = state.matches.filter((match) =>
      parsedIds.has(match.parsed_recommendation_id)
    );

    const merchantMissing = unique(
      clusters.flatMap((cluster) => missingAttributesForLayer(product, cluster, "merchant"))
    );
    const pivotaMissing = unique(
      clusters.flatMap((cluster) => missingAttributesForLayer(product, cluster, "pivota"))
    );
    const sharedMissing = merchantMissing.filter((attribute) =>
      pivotaMissing.includes(attribute)
    );
    const merchantOnlyMissing = merchantMissing.filter(
      (attribute) => !sharedMissing.includes(attribute)
    );
    const pivotaOnlyMissing = pivotaMissing.filter(
      (attribute) => !sharedMissing.includes(attribute)
    );
    const merchantGaps = [
      ...attributeGaps({
        attributes: sharedMissing,
        layer: "both",
        fixTarget: "both_merchant_and_pivota",
      }),
      ...attributeGaps({
        attributes: merchantOnlyMissing,
        layer: "merchant_source",
        fixTarget: "merchant_pdp",
      }),
    ];
    const pivotaGaps = [
      ...attributeGaps({
        attributes: sharedMissing,
        layer: "both",
        fixTarget: "both_merchant_and_pivota",
      }),
      ...attributeGaps({
        attributes: pivotaOnlyMissing,
        layer: "pivota_unified_pdp",
        fixTarget: "pivota_unified_pdp",
      }),
    ];

    const entityFindings = this.entityMappingFindings(issue, product, matches);
    const variantFindings = this.variantMappingFindings(product, matches);
    const queryFindings = this.queryMappingFindings({
      issue,
      clusters,
      product,
      merchantMissing,
      pivotaMissing,
    });
    const competitorFindings = this.competitorMappingFindings(issue, matches);
    const refinedFixTargets = this.refinedFixTargets({
      issue,
      merchantGaps,
      pivotaGaps,
      entityFindings,
      variantFindings,
      queryFindings,
      competitorFindings,
    });
    const rootCauseSummary = productUnderstandingRootCause({
      merchantMissing,
      pivotaMissing,
      entityFindings,
      variantFindings,
      queryFindings,
      competitorFindings,
    });
    const patchRecommendations = this.patchRecommendations({
      issue,
      target,
      product,
      clusters,
      merchantMissing,
      pivotaMissing,
      entityFindings,
      variantFindings,
      queryFindings,
      competitorFindings,
    });
    const now = nowIso();
    const diagnosisId = nextId("product_diag");
    const usageEvent = new UsageMeteringService().recordProductUnderstanding({
      issue,
      diagnosisId,
    });
    const diagnosis: ProductUnderstandingDiagnosis = {
      id: diagnosisId,
      merchant_id: issue.merchant_id,
      store_id: issue.store_id,
      scan_target_id: issue.scan_target_id,
      issue_id: issue.id,
      source_agent: "product_understanding_agent",
      affected_product_entity_id:
        product?.product_entity_id || issue.affected_product_entities[0],
      affected_sku_ids: issue.affected_skus.length
        ? issue.affected_skus
        : product?.sku
          ? [product.sku]
          : [],
      affected_query_cluster_ids: issue.affected_query_clusters,
      merchant_layer_findings: [
        layerComparison({
          layer: "merchant_source",
          product,
          missingAttributes: merchantMissing,
          gaps: merchantGaps,
        }),
      ],
      pivota_layer_findings: [
        layerComparison({
          layer: "pivota_unified_pdp",
          product,
          missingAttributes: pivotaMissing,
          gaps: pivotaGaps,
        }),
      ],
      sku_variant_findings: variantFindings,
      query_mapping_findings: queryFindings,
      competitor_mapping_findings: competitorFindings,
      entity_mapping_findings: entityFindings,
      root_cause_summary: rootCauseSummary,
      refined_fix_targets: refinedFixTargets,
      patch_recommendations: patchRecommendations,
      confidence: this.confidence({
        product,
        clusters,
        entityFindings,
        variantFindings,
        queryFindings,
      }),
      usage_event_ids: [usageEvent.id],
      created_at: now,
      updated_at: now,
    };

    state.productUnderstandingDiagnoses.push(diagnosis);
    this.attachDiagnosisToIssue(issue, diagnosis);
    if (options?.attachToRetestPlan) {
      this.attachDiagnosisToRetestPlan(issue, diagnosis);
    }
    return diagnosis;
  }

  regeneratePatch(issueId: string) {
    return this.runDiagnosis(issueId, { regeneratePatch: true });
  }

  attachToRetestPlan(issueId: string) {
    const diagnosis = this.runDiagnosis(issueId, { attachToRetestPlan: true });
    return diagnosis;
  }

  private entityMappingFindings(
    issue: AgenticGMVIssue,
    product: ProductRecord | undefined,
    matches: ProductMatchResult[]
  ): EntityMappingFinding[] {
    const findings: EntityMappingFinding[] = [];
    for (const match of matches) {
      if (match.ambiguous_match) {
        findings.push({
          finding_type: "ambiguous_product_match",
          raw_model_product_name: match.raw_model_product_name,
          canonical_product_name: match.canonical_product_name,
          product_entity_id: match.product_entity_id,
          match_level: match.match_level,
          match_confidence: match.match_confidence,
          evidence: match.match_reason,
          fix_target: "human_review",
        });
      } else if (match.brand_match && !match.core_product_match) {
        findings.push({
          finding_type:
            match.match_level === "product_family_match"
              ? "product_entity_mapping_issue"
              : "wrong_product_family",
          raw_model_product_name: match.raw_model_product_name,
          canonical_product_name: match.canonical_product_name,
          product_entity_id: match.product_entity_id,
          match_level: match.match_level,
          match_confidence: match.match_confidence,
          evidence: match.match_reason,
          fix_target: "human_review",
        });
      }
    }

    if (
      !findings.length &&
      ["product_entity_mapping_issue", "wrong_product_family", "human_review_required"].includes(
        issue.issue_type
      )
    ) {
      findings.push({
        finding_type:
          issue.issue_type === "wrong_product_family"
            ? "wrong_product_family"
            : issue.issue_type === "product_entity_mapping_issue"
              ? "product_entity_mapping_issue"
              : "human_review_required",
        canonical_product_name: product?.title,
        product_entity_id: product?.product_entity_id,
        evidence: issue.root_cause,
        fix_target: "human_review",
      });
    }

    return findings;
  }

  private variantMappingFindings(
    product: ProductRecord | undefined,
    matches: ProductMatchResult[]
  ): VariantMappingFinding[] {
    return matches
      .filter(
        (match) =>
          match.ambiguous_match ||
          match.suffix_terms_missing.length > 0 ||
          (match.counts_for_visibility && !match.counts_for_sku_exact_match)
      )
      .map((match) => ({
        finding_type: match.ambiguous_match
          ? ("ambiguous_variant_match" as const)
          : match.suffix_terms_missing.length > 0
            ? ("sku_variant_suffix_gap" as const)
            : ("variant_size_mismatch" as const),
        sku: product?.sku,
        raw_model_product_name: match.raw_model_product_name,
        canonical_product_name: match.canonical_product_name,
        suffix_terms_missing: match.suffix_terms_missing,
        counts_for_visibility: match.counts_for_visibility,
        counts_for_sku_exact_match: match.counts_for_sku_exact_match,
        evidence: match.match_reason,
        fix_target: "merchant_variant_map" as const,
      }));
  }

  private queryMappingFindings(input: {
    issue: AgenticGMVIssue;
    clusters: QueryCluster[];
    product?: ProductRecord;
    merchantMissing: string[];
    pivotaMissing: string[];
  }): QueryMappingFinding[] {
    const queryMappingLikelyMissing =
      input.issue.fix_targets.includes("pivota_query_mapping") ||
      ["pivota_pdp_attribution_gap", "unverified_pivota_attribution"].includes(
        input.issue.issue_type
      ) ||
      (["competitor_substitution", "ai_visibility_loss"].includes(
        input.issue.issue_type
      ) &&
        input.merchantMissing.length === 0 &&
        input.pivotaMissing.length === 0);

    if (!queryMappingLikelyMissing) return [];

    return input.clusters.map((cluster) => ({
      finding_type: "missing_query_mapping" as const,
      query_cluster_id: cluster.id,
      cluster_name: cluster.cluster_name,
      product_entity_id: input.product?.product_entity_id || cluster.product_entity_id,
      evidence:
        "The product should be eligible for this query cluster, but Demand Test evidence points to missing or weak Pivota query/product mapping.",
      fix_target: "pivota_query_mapping" as const,
    }));
  }

  private competitorMappingFindings(
    issue: AgenticGMVIssue,
    matches: ProductMatchResult[]
  ): CompetitorMappingFinding[] {
    if (issue.issue_type !== "competitor_substitution") return [];
    const fromIssue = evidenceStringArray(issue.evidence.top_competitor_recommendations);
    const fromMatches = matches.flatMap((match) =>
      match.competitor_matches.map(
        (competitor) => `${competitor.competitor_name} ${competitor.product_name}`
      )
    );
    const competitorProducts = unique([...fromIssue, ...fromMatches]);
    return competitorProducts.map((competitorProduct) => ({
      finding_type: "missing_substitute_mapping" as const,
      competitor_product: competitorProduct,
      evidence:
        "A competitor/substitute appeared while the merchant product was absent, so Pivota should record substitute and comparison mappings for this demand cluster.",
      fix_target: "pivota_product_graph" as const,
    }));
  }

  private refinedFixTargets(input: {
    issue: AgenticGMVIssue;
    merchantGaps: AttributeGap[];
    pivotaGaps: AttributeGap[];
    entityFindings: EntityMappingFinding[];
    variantFindings: VariantMappingFinding[];
    queryFindings: QueryMappingFinding[];
    competitorFindings: CompetitorMappingFinding[];
  }) {
    const targets = new Set<FixTarget>();
    if (input.merchantGaps.some((gap) => gap.layer === "both")) {
      targets.add("both_merchant_and_pivota");
    }
    for (const gap of input.merchantGaps) {
      targets.add(gap.fix_target);
      if (gap.fix_target === "merchant_pdp") targets.add("merchant_catalog");
    }
    for (const gap of input.pivotaGaps) {
      targets.add(gap.fix_target);
    }
    for (const finding of input.variantFindings) {
      if (finding.finding_type !== "no_issue") targets.add(finding.fix_target);
    }
    for (const finding of input.entityFindings) {
      if (finding.finding_type !== "no_issue") {
        targets.add("pivota_product_graph");
        targets.add(finding.fix_target);
      }
    }
    for (const finding of input.queryFindings) {
      if (finding.finding_type !== "no_issue") targets.add(finding.fix_target);
    }
    for (const finding of input.competitorFindings) {
      if (finding.finding_type !== "no_issue") targets.add(finding.fix_target);
    }
    if (!targets.size) {
      for (const target of input.issue.fix_targets) targets.add(target);
    }
    return [...targets];
  }

  private patchRecommendations(input: {
    issue: AgenticGMVIssue;
    target: ScanTarget;
    product?: ProductRecord;
    clusters: QueryCluster[];
    merchantMissing: string[];
    pivotaMissing: string[];
    entityFindings: EntityMappingFinding[];
    variantFindings: VariantMappingFinding[];
    queryFindings: QueryMappingFinding[];
    competitorFindings: CompetitorMappingFinding[];
  }) {
    const recommendations: ProductPatchRecommendation[] = [];
    if (input.merchantMissing.length) {
      recommendations.push({
        patch_type: "merchant_source_patch",
        target: "merchant_pdp",
        patch: {
          product_id: input.product?.id,
          product_entity_id: input.product?.product_entity_id,
          attributes: Object.fromEntries(
            input.merchantMissing.map((attribute) => [
              attribute,
              {
                status: "missing",
                action: `Add ${titleCase(attribute)} to merchant PDP/catalog source data.`,
              },
            ])
          ),
          pdp_copy_suggestion: `Clarify ${input.merchantMissing
            .map(titleCase)
            .join(", ")} on the merchant PDP and structured catalog feed.`,
        },
        rationale:
          "Merchant source data is the source of truth for PDP/catalog attributes.",
      });
    }

    if (input.variantFindings.some((finding) => finding.finding_type !== "no_issue")) {
      recommendations.push({
        patch_type: "merchant_variant_map_patch",
        target: "merchant_variant_map",
        patch: {
          sku: input.product?.sku,
          canonical_product_name: input.product?.title,
          product_entity_id: input.product?.product_entity_id,
          aliases: unique(
            input.variantFindings
              .map((finding) => finding.raw_model_product_name)
              .filter((value): value is string => Boolean(value))
          ),
          suffix_terms_required: unique(
            input.variantFindings.flatMap((finding) => finding.suffix_terms_missing)
          ),
        },
        rationale:
          "The product can count for entity visibility while still failing exact SKU or variant attribution.",
      });
    }

    if (input.pivotaMissing.length) {
      recommendations.push({
        patch_type: "pivota_unified_pdp_patch",
        target: "pivota_unified_pdp",
        patch: {
          product_entity_id: input.product?.product_entity_id,
          normalized_attributes: Object.fromEntries(
            input.pivotaMissing.map((attribute) => [
              attribute,
              input.product?.attributes?.[attribute] || {
                status: "missing_from_pivota",
                source_required: input.merchantMissing.includes(attribute),
              },
            ])
          ),
          agent_summary_update: input.product?.title
            ? `${input.product.title} should expose ${input.pivotaMissing
                .map(titleCase)
                .join(", ")} as normalized agent-facing attributes.`
            : "Refresh normalized product attributes for the affected query clusters.",
        },
        rationale:
          "The Pivota unified PDP is the agent-facing product layer and needs normalized query attributes.",
      });
    }

    if (
      input.entityFindings.some((finding) => finding.finding_type !== "no_issue") ||
      input.competitorFindings.some((finding) => finding.finding_type !== "no_issue")
    ) {
      recommendations.push({
        patch_type: "pivota_product_graph_patch",
        target: "pivota_product_graph",
        patch: {
          product_entity_id: input.product?.product_entity_id,
          canonical_product_name: input.product?.title,
          entity_mapping_findings: input.entityFindings,
          substitute_edges: input.competitorFindings.map((finding) => ({
            competitor_product: finding.competitor_product,
            relation: "substitute_or_comparison_candidate",
          })),
        },
        rationale:
          "Product graph mappings should separate wrong-family mentions from true substitutes and canonical entity matches.",
      });
    }

    if (input.queryFindings.some((finding) => finding.finding_type !== "no_issue")) {
      recommendations.push({
        patch_type: "pivota_query_mapping_patch",
        target: "pivota_query_mapping",
        patch: {
          product_entity_id: input.product?.product_entity_id,
          scan_mode: input.target.scan_mode,
          query_cluster_ids: input.clusters.map((cluster) => cluster.id),
          query_intents: unique(input.clusters.map((cluster) => cluster.intent_type)),
          action: "Attach affected query clusters to the canonical ProductEntity and supported substitute/comparison edges.",
        },
        rationale:
          "The tested query cluster should resolve to the affected ProductEntity before attribution retests.",
      });
    }

    if (!recommendations.length) {
      recommendations.push({
        patch_type: "pivota_product_graph_patch",
        target: "human_review",
        patch: {
          issue_id: input.issue.id,
          action: "Review parser output, product graph, and query mappings manually.",
        },
        rationale:
          "No deterministic source-layer patch was isolated.",
      });
    }

    return recommendations;
  }

  private confidence(input: {
    product?: ProductRecord;
    clusters: QueryCluster[];
    entityFindings: EntityMappingFinding[];
    variantFindings: VariantMappingFinding[];
    queryFindings: QueryMappingFinding[];
  }): ProductUnderstandingDiagnosis["confidence"] {
    if (!input.product || !input.clusters.length) return "low";
    if (
      input.entityFindings.some(
        (finding) =>
          finding.finding_type === "ambiguous_product_match" ||
          finding.finding_type === "human_review_required"
      )
    ) {
      return "low";
    }
    if (
      input.variantFindings.length ||
      input.entityFindings.length ||
      input.queryFindings.length
    ) {
      return "medium";
    }
    return "high";
  }

  private attachDiagnosisToIssue(
    issue: AgenticGMVIssue,
    diagnosis: ProductUnderstandingDiagnosis
  ) {
    const merchantPatch = patchByType(
      diagnosis.patch_recommendations,
      "merchant_source_patch"
    );
    const variantPatch = patchByType(
      diagnosis.patch_recommendations,
      "merchant_variant_map_patch"
    );
    const pivotaPdpPatch = patchByType(
      diagnosis.patch_recommendations,
      "pivota_unified_pdp_patch"
    );
    const graphPatch = patchByType(
      diagnosis.patch_recommendations,
      "pivota_product_graph_patch"
    );
    const queryPatch = patchByType(
      diagnosis.patch_recommendations,
      "pivota_query_mapping_patch"
    );

    issue.merchant_source_patch = merchantPatch?.patch || {};
    issue.merchant_variant_map_patch = variantPatch?.patch;
    issue.pivota_unified_pdp_patch = pivotaPdpPatch?.patch || {};
    issue.pivota_product_graph_patch = graphPatch?.patch;
    issue.pivota_query_mapping_patch = queryPatch?.patch;

    issue.root_cause = diagnosis.root_cause_summary;
    issue.fix_targets = diagnosis.refined_fix_targets;
    issue.recommended_action =
      "Apply the Product Understanding diagnosis patches, then retest the same Demand Test query cluster.";
    issue.product_understanding_diagnosis_id = diagnosis.id;
    issue.product_understanding_diagnosis_ids = unique([
      ...(issue.product_understanding_diagnosis_ids || []),
      diagnosis.id,
    ]);
    issue.evidence = {
      ...issue.evidence,
      product_understanding_diagnosis_id: diagnosis.id,
      product_understanding_confidence: diagnosis.confidence,
      product_understanding_root_cause_summary: diagnosis.root_cause_summary,
    };
    issue.status = "diagnosed";
    touch(issue);
  }

  private attachDiagnosisToRetestPlan(
    issue: AgenticGMVIssue,
    diagnosis: ProductUnderstandingDiagnosis
  ) {
    issue.verification_plan = {
      ...issue.verification_plan,
      target_improvement: `${issue.verification_plan.target_improvement}; verify Product Understanding diagnosis ${diagnosis.id} patches before before/after comparison.`,
    };
    issue.evidence = {
      ...issue.evidence,
      product_understanding_attached_to_retest_plan: diagnosis.id,
    };
    touch(issue);
  }
}

function sameMoney(left?: number | null, right?: number | null) {
  if (left === undefined || left === null || right === undefined || right === null) {
    return left === right;
  }
  return Math.abs(Number(left) - Number(right)) < 0.01;
}

function isExpired(value?: string | null) {
  return Boolean(value && new Date(value).getTime() < Date.now());
}

function staleRelativeToMerchant(
  merchantOffer?: MerchantOffer | null,
  pivotaOffer?: PivotaOffer | null
) {
  if (!merchantOffer?.last_synced_at || !pivotaOffer?.last_verified_at) return false;
  return new Date(merchantOffer.last_synced_at).getTime() >
    new Date(pivotaOffer.last_verified_at).getTime();
}

function offerFinding(input: {
  findingType: OfferIssueType | "clean_offer";
  severity?: OfferMismatchFinding["severity"];
  field: OfferMismatchFinding["field"];
  merchantValue?: unknown;
  pivotaValue?: unknown;
  evidence: string;
  fixTarget: FixTarget;
}): OfferMismatchFinding {
  return {
    finding_type: input.findingType,
    severity: input.severity || "medium",
    field: input.field,
    merchant_value: input.merchantValue,
    pivota_value: input.pivotaValue,
    evidence: input.evidence,
    fix_target: input.fixTarget,
  };
}

function offerRootCause(findings: OfferMismatchFinding[]) {
  const actionable = findings.filter((finding) => finding.finding_type !== "clean_offer");
  if (!actionable.length) {
    return "Merchant offer source and Pivota offer state are consistent for V1 readiness checks.";
  }

  const first = actionable[0];
  const labels: Record<OfferIssueType, string> = {
    missing_offer:
      "Pivota does not have an executable offer state for a merchant offer that exists in source data.",
    stale_offer:
      "Pivota offer state appears stale compared with the merchant source timestamp.",
    price_mismatch:
      "Merchant source price and Pivota offer price do not match.",
    promo_mismatch:
      "Merchant promo/coupon state and Pivota promo state do not match.",
    expired_coupon:
      "Merchant coupon state is expired, but Pivota still exposes active promo state.",
    inventory_mismatch:
      "Merchant inventory state and Pivota inventory state do not match.",
    offer_not_attached_to_pivota_pdp:
      "Pivota offer exists but is not attached to the unified PDP.",
    offer_sku_variant_mismatch:
      "Offer SKU or variant mapping does not match the affected product SKU.",
    human_review_required:
      "Offer readiness evidence is incomplete or ambiguous and needs human review.",
  };
  return labels[first.finding_type as OfferIssueType] || first.evidence;
}

function offerReadinessScore(findings: OfferMismatchFinding[]) {
  const penalties: Record<OfferMismatchFinding["severity"], number> = {
    low: 10,
    medium: 20,
    high: 35,
    critical: 50,
  };
  const totalPenalty = findings
    .filter((finding) => finding.finding_type !== "clean_offer")
    .reduce((sum, finding) => sum + penalties[finding.severity], 0);
  return clampScore(100 - totalPenalty);
}

function offerConfidence(input: {
  merchantOffer?: MerchantOffer | null;
  pivotaOffer?: PivotaOffer | null;
  findings: OfferMismatchFinding[];
}): OfferExecutionDiagnosis["confidence"] {
  if (!input.merchantOffer && !input.pivotaOffer) return "low";
  if (
    input.findings.some((finding) =>
      ["human_review_required", "offer_sku_variant_mismatch"].includes(
        finding.finding_type
      )
    )
  ) {
    return "medium";
  }
  return input.merchantOffer && input.pivotaOffer ? "high" : "medium";
}

function cleanOfferComparison(
  merchantOffer?: MerchantOffer | null,
  pivotaOffer?: PivotaOffer | null
): OfferLayerComparison {
  return {
    merchant_offer: merchantOffer || null,
    pivota_offer: pivotaOffer || null,
    price_consistent: true,
    promo_consistent: true,
    coupon_consistent: true,
    inventory_consistent: true,
    expiration_valid: true,
    attached_to_pivota_pdp: Boolean(pivotaOffer?.attached_to_pivota_pdp),
    sku_variant_consistent: true,
    findings: [
      offerFinding({
        findingType: "clean_offer",
        severity: "low",
        field: "offer",
        evidence:
          "Merchant offer source and Pivota offer state are consistent for V1 checks.",
        fixTarget: "pivota_offer_layer",
      }),
    ],
  };
}

export class OfferExecutionService {
  latest(issueId: string) {
    return [...getAgentCenterState().offerExecutionDiagnoses]
      .reverse()
      .find((diagnosis) => diagnosis.issue_id === issueId) || null;
  }

  debugPayload(issueId: string) {
    const state = getAgentCenterState();
    const issue = findIssue(issueId);
    const store = findStore(issue.store_id);
    const clusters = state.queryClusters.filter((cluster) =>
      issue.affected_query_clusters.includes(cluster.id)
    );
    const product = findProductForIssue(store, issue, clusters);
    const diagnosis = this.latest(issueId);
    const merchantOffer = diagnosis?.merchant_offer_id
      ? state.merchantOffers.find((offer) => offer.id === diagnosis.merchant_offer_id)
      : this.findMerchantOffer(issue, product);
    const pivotaOffer = diagnosis?.pivota_offer_id
      ? state.pivotaOffers.find((offer) => offer.id === diagnosis.pivota_offer_id)
      : this.findPivotaOffer(issue, product, merchantOffer);
    const productDiagnosis =
      issue.product_understanding_diagnosis_id
        ? state.productUnderstandingDiagnoses.find(
            (item) => item.id === issue.product_understanding_diagnosis_id
          )
        : new ProductUnderstandingService().latest(issueId);
    const usageEvents = diagnosis
      ? state.usageEvents.filter((event) =>
          diagnosis.usage_event_ids.includes(event.id)
        )
      : [];

    return {
      source_issue_summary: {
        issue_id: issue.id,
        issue_type: issue.issue_type,
        severity: issue.severity,
        status: issue.status,
        affected_product_entities: issue.affected_product_entities,
        affected_skus: issue.affected_skus,
        fix_targets: issue.fix_targets,
      },
      product_understanding_diagnosis: productDiagnosis || null,
      merchant_offer_source: merchantOffer || null,
      pivota_offer_state: pivotaOffer || null,
      findings: diagnosis?.offer_layer_findings || [],
      refined_fix_targets: diagnosis?.refined_fix_targets || [],
      patch_recommendations: diagnosis?.patch_recommendations || [],
      offer_readiness_score: diagnosis?.offer_readiness_score ?? null,
      confidence: diagnosis?.confidence || null,
      usage_event_ids: diagnosis?.usage_event_ids || [],
      usage_events: usageEvents,
    };
  }

  runDiagnosis(
    issueId: string,
    options?: { regeneratePatch?: boolean; attachToRetestPlan?: boolean }
  ) {
    const existing = this.latest(issueId);
    if (existing && !options?.regeneratePatch && !options?.attachToRetestPlan) {
      return existing;
    }

    const state = getAgentCenterState();
    const issue = findIssue(issueId);
    const store = findStore(issue.store_id);
    const clusters = state.queryClusters.filter((cluster) =>
      issue.affected_query_clusters.includes(cluster.id)
    );
    const product = findProductForIssue(store, issue, clusters);
    const merchantOffer = this.findMerchantOffer(issue, product);
    const pivotaOffer = this.findPivotaOffer(issue, product, merchantOffer);
    const comparison = this.compareOffers({
      issue,
      product,
      merchantOffer,
      pivotaOffer,
    });
    const actionable = comparison.findings.filter(
      (finding) => finding.finding_type !== "clean_offer"
    );
    const refinedFixTargets = this.refinedFixTargets(actionable);
    const patchRecommendations = this.patchRecommendations({
      issue,
      product,
      merchantOffer,
      pivotaOffer,
      findings: actionable,
    });
    const now = nowIso();
    const diagnosisId = nextId("offer_diag");
    const usageEvent = new UsageMeteringService().recordOfferExecution({
      issue,
      diagnosisId,
    });
    const diagnosis: OfferExecutionDiagnosis = {
      id: diagnosisId,
      merchant_id: issue.merchant_id,
      store_id: issue.store_id,
      issue_id: issue.id,
      product_entity_id: product?.product_entity_id || issue.affected_product_entities[0],
      sku_id: product?.sku || issue.affected_skus[0],
      merchant_offer_id: merchantOffer?.id,
      pivota_offer_id: pivotaOffer?.id,
      source_agent: "offer_execution_agent",
      offer_layer_findings: [comparison],
      root_cause_summary: offerRootCause(comparison.findings),
      refined_fix_targets: refinedFixTargets.length
        ? refinedFixTargets
        : ["pivota_offer_layer"],
      patch_recommendations: patchRecommendations,
      offer_readiness_score: offerReadinessScore(comparison.findings),
      confidence: offerConfidence({
        merchantOffer,
        pivotaOffer,
        findings: comparison.findings,
      }),
      usage_event_ids: [usageEvent.id],
      created_at: now,
      updated_at: now,
    };

    state.offerExecutionDiagnoses.push(diagnosis);
    this.attachDiagnosisToIssue(issue, diagnosis);
    if (options?.attachToRetestPlan) {
      this.attachDiagnosisToRetestPlan(issue, diagnosis);
    }
    return diagnosis;
  }

  regeneratePatch(issueId: string) {
    return this.runDiagnosis(issueId, { regeneratePatch: true });
  }

  attachToRetestPlan(issueId: string) {
    return this.runDiagnosis(issueId, { attachToRetestPlan: true });
  }

  private findMerchantOffer(issue: AgenticGMVIssue, product?: ProductRecord) {
    return getAgentCenterState().merchantOffers.find(
      (offer) =>
        offer.merchant_id === issue.merchant_id &&
        offer.store_id === issue.store_id &&
        (offer.product_id === product?.id ||
          offer.sku_id === product?.sku ||
          issue.affected_skus.includes(offer.sku_id))
    );
  }

  private findPivotaOffer(
    issue: AgenticGMVIssue,
    product?: ProductRecord,
    merchantOffer?: MerchantOffer
  ) {
    const productEntityId = product?.product_entity_id || issue.affected_product_entities[0];
    return getAgentCenterState().pivotaOffers.find(
      (offer) =>
        offer.merchant_id === issue.merchant_id &&
        offer.store_id === issue.store_id &&
        offer.product_entity_id === productEntityId &&
        (!merchantOffer || offer.sku_id === merchantOffer.sku_id)
    ) ||
      getAgentCenterState().pivotaOffers.find(
        (offer) =>
          offer.merchant_id === issue.merchant_id &&
          offer.store_id === issue.store_id &&
          offer.product_entity_id === productEntityId
      );
  }

  private compareOffers(input: {
    issue: AgenticGMVIssue;
    product?: ProductRecord;
    merchantOffer?: MerchantOffer;
    pivotaOffer?: PivotaOffer;
  }): OfferLayerComparison {
    const { product, merchantOffer, pivotaOffer } = input;
    const findings: OfferMismatchFinding[] = [];

    if (!merchantOffer && !pivotaOffer) {
      findings.push(
        offerFinding({
          findingType: "human_review_required",
          severity: "medium",
          field: "offer",
          evidence:
            "No merchant offer source or Pivota offer state was found for the affected product.",
          fixTarget: "human_review",
        })
      );
    } else if (merchantOffer && !pivotaOffer) {
      findings.push(
        offerFinding({
          findingType: "missing_offer",
          severity: "high",
          field: "offer",
          merchantValue: merchantOffer.id,
          evidence:
            "Merchant offer exists, but no matching Pivota offer state is attached to the ProductEntity.",
          fixTarget: "pivota_offer_layer",
        })
      );
    }

    if (merchantOffer && pivotaOffer) {
      if (
        merchantOffer.currency !== pivotaOffer.currency ||
        !sameMoney(merchantOffer.price, pivotaOffer.price)
      ) {
        findings.push(
          offerFinding({
            findingType: "price_mismatch",
            severity: "high",
            field: "price",
            merchantValue: `${merchantOffer.currency} ${merchantOffer.price}`,
            pivotaValue: `${pivotaOffer.currency} ${pivotaOffer.price}`,
            evidence:
              "Merchant source price and Pivota offer price are inconsistent.",
            fixTarget: staleRelativeToMerchant(merchantOffer, pivotaOffer)
              ? "pivota_offer_layer"
              : "both_merchant_and_pivota",
          })
        );
      }

      const promoMismatch =
        !sameMoney(merchantOffer.promo_price, pivotaOffer.promo_price) ||
        (merchantOffer.coupon_code || "") !== (pivotaOffer.coupon_code || "");
      if (promoMismatch) {
        findings.push(
          offerFinding({
            findingType: "promo_mismatch",
            severity: "medium",
            field: "promo",
            merchantValue: {
              promo_price: merchantOffer.promo_price,
              coupon_code: merchantOffer.coupon_code,
            },
            pivotaValue: {
              promo_price: pivotaOffer.promo_price,
              coupon_code: pivotaOffer.coupon_code,
            },
            evidence:
              "Merchant promo price or coupon code does not match Pivota offer state.",
            fixTarget: "pivota_offer_layer",
          })
        );
      }

      const merchantCouponExpired =
        merchantOffer.coupon_status === "expired" || isExpired(merchantOffer.expires_at);
      if (
        merchantCouponExpired &&
        ["active", "unknown"].includes(pivotaOffer.coupon_status as CouponStatus)
      ) {
        findings.push(
          offerFinding({
            findingType: "expired_coupon",
            severity: "high",
            field: "coupon",
            merchantValue: merchantOffer.coupon_status,
            pivotaValue: pivotaOffer.coupon_status,
            evidence:
              "Merchant coupon is expired, but Pivota offer still exposes active or unknown coupon state.",
            fixTarget: "pivota_offer_layer",
          })
        );
      } else if (merchantOffer.coupon_status !== pivotaOffer.coupon_status) {
        findings.push(
          offerFinding({
            findingType: "promo_mismatch",
            severity: "medium",
            field: "coupon",
            merchantValue: merchantOffer.coupon_status,
            pivotaValue: pivotaOffer.coupon_status,
            evidence:
              "Merchant coupon status and Pivota coupon status are inconsistent.",
            fixTarget: "pivota_offer_layer",
          })
        );
      }

      if (merchantOffer.inventory_status !== pivotaOffer.inventory_status) {
        findings.push(
          offerFinding({
            findingType: "inventory_mismatch",
            severity: "high",
            field: "inventory",
            merchantValue: merchantOffer.inventory_status,
            pivotaValue: pivotaOffer.inventory_status,
            evidence:
              "Merchant inventory state and Pivota offer inventory state are inconsistent.",
            fixTarget: "pivota_offer_layer",
          })
        );
      }

      if (!pivotaOffer.attached_to_pivota_pdp) {
        findings.push(
          offerFinding({
            findingType: "offer_not_attached_to_pivota_pdp",
            severity: "high",
            field: "attachment",
            merchantValue: merchantOffer.id,
            pivotaValue: pivotaOffer.id,
            evidence:
              "Pivota offer exists, but it is not attached to the unified PDP.",
            fixTarget: "pivota_offer_layer",
          })
        );
      }

      if (
        merchantOffer.sku_id !== pivotaOffer.sku_id ||
        (product?.sku && merchantOffer.sku_id !== product.sku)
      ) {
        findings.push(
          offerFinding({
            findingType: "offer_sku_variant_mismatch",
            severity: "high",
            field: "sku_variant",
            merchantValue: merchantOffer.sku_id,
            pivotaValue: pivotaOffer.sku_id,
            evidence:
              "Offer SKU/variant mapping does not match the affected merchant product SKU.",
            fixTarget: "pivota_product_graph",
          })
        );
      }

      if (staleRelativeToMerchant(merchantOffer, pivotaOffer)) {
        findings.push(
          offerFinding({
            findingType: "stale_offer",
            severity: "medium",
            field: "freshness",
            merchantValue: merchantOffer.last_synced_at,
            pivotaValue: pivotaOffer.last_verified_at,
            evidence:
              "Merchant offer source was synced after the Pivota offer was last verified.",
            fixTarget: "pivota_offer_layer",
          })
        );
      }
    }

    if (!findings.length) return cleanOfferComparison(merchantOffer, pivotaOffer);

    return {
      merchant_offer: merchantOffer || null,
      pivota_offer: pivotaOffer || null,
      price_consistent: !findings.some((finding) => finding.field === "price"),
      promo_consistent: !findings.some((finding) => finding.field === "promo"),
      coupon_consistent: !findings.some((finding) => finding.field === "coupon"),
      inventory_consistent: !findings.some((finding) => finding.field === "inventory"),
      expiration_valid: !findings.some((finding) => finding.finding_type === "expired_coupon"),
      attached_to_pivota_pdp: Boolean(pivotaOffer?.attached_to_pivota_pdp),
      sku_variant_consistent: !findings.some(
        (finding) => finding.field === "sku_variant"
      ),
      findings,
    };
  }

  private refinedFixTargets(findings: OfferMismatchFinding[]) {
    const targets = new Set<FixTarget>();
    for (const finding of findings) {
      targets.add(finding.fix_target);
      if (finding.finding_type === "inventory_mismatch") {
        targets.add("merchant_inventory_source");
      }
      if (
        finding.finding_type === "promo_mismatch" ||
        finding.finding_type === "expired_coupon"
      ) {
        targets.add("merchant_promo_source");
      }
      if (finding.finding_type === "missing_offer") {
        targets.add("pivota_offer_layer");
      }
    }
    return [...targets];
  }

  private patchRecommendations(input: {
    issue: AgenticGMVIssue;
    product?: ProductRecord;
    merchantOffer?: MerchantOffer;
    pivotaOffer?: PivotaOffer;
    findings: OfferMismatchFinding[];
  }) {
    const recommendations: OfferPatchRecommendation[] = [];
    const has = (type: OfferIssueType) =>
      input.findings.some((finding) => finding.finding_type === type);
    const hasField = (field: OfferMismatchFinding["field"]) =>
      input.findings.some((finding) => finding.field === field);

    if (has("missing_offer") || has("price_mismatch") || has("stale_offer")) {
      recommendations.push({
        patch_type: "pivota_offer_patch",
        target: "pivota_offer_layer",
        patch: {
          product_entity_id: input.product?.product_entity_id || input.issue.affected_product_entities[0],
          merchant_offer_id: input.merchantOffer?.id,
          pivota_offer_id: input.pivotaOffer?.id,
          sku_id: input.merchantOffer?.sku_id || input.product?.sku,
          price: input.merchantOffer?.price,
          currency: input.merchantOffer?.currency,
          promo_price: input.merchantOffer?.promo_price,
          coupon_code: input.merchantOffer?.coupon_code,
          coupon_status: input.merchantOffer?.coupon_status,
          inventory_status: input.merchantOffer?.inventory_status,
          execution_status: "needs_sync",
        },
        rationale:
          "Pivota offer state should mirror the current merchant offer source before offer readiness is counted.",
      });
    }

    if (hasField("inventory")) {
      recommendations.push({
        patch_type: "inventory_sync_patch",
        target: "merchant_inventory_source",
        patch: {
          merchant_offer_id: input.merchantOffer?.id,
          pivota_offer_id: input.pivotaOffer?.id,
          sku_id: input.merchantOffer?.sku_id || input.product?.sku,
          source_inventory_status: input.merchantOffer?.inventory_status,
          source_inventory_quantity: input.merchantOffer?.inventory_quantity,
          action: "Sync Pivota offer inventory state from merchant inventory source.",
        },
        rationale:
          "Agent-facing offer readiness must not show an in-stock path when merchant source says unavailable.",
      });
    }

    if (hasField("promo") || hasField("coupon")) {
      recommendations.push({
        patch_type: "promo_state_patch",
        target: "merchant_promo_source",
        patch: {
          merchant_offer_id: input.merchantOffer?.id,
          pivota_offer_id: input.pivotaOffer?.id,
          coupon_code: input.merchantOffer?.coupon_code,
          coupon_status: input.merchantOffer?.coupon_status,
          promo_price: input.merchantOffer?.promo_price,
          expires_at: input.merchantOffer?.expires_at,
          action: "Refresh Pivota promo/coupon state from merchant promo source.",
        },
        rationale:
          "Expired or mismatched promo state should not appear as executable offer evidence.",
      });
    }

    if (has("offer_not_attached_to_pivota_pdp") || has("offer_sku_variant_mismatch")) {
      recommendations.push({
        patch_type: "offer_attachment_patch",
        target: has("offer_sku_variant_mismatch")
          ? "pivota_product_graph"
          : "pivota_offer_layer",
        patch: {
          product_entity_id: input.product?.product_entity_id || input.issue.affected_product_entities[0],
          pivota_unified_pdp_id: input.pivotaOffer?.pivota_unified_pdp_id,
          merchant_offer_id: input.merchantOffer?.id,
          pivota_offer_id: input.pivotaOffer?.id,
          expected_sku_id: input.product?.sku || input.merchantOffer?.sku_id,
          current_pivota_sku_id: input.pivotaOffer?.sku_id,
          attached_to_pivota_pdp: true,
        },
        rationale:
          "The offer must attach to the correct Pivota PDP and SKU/variant before it can be treated as executable.",
      });
    }

    if (!recommendations.length && input.findings.length) {
      recommendations.push({
        patch_type: "merchant_offer_patch",
        target: "human_review",
        patch: {
          issue_id: input.issue.id,
          action: "Review merchant offer source and Pivota offer state manually.",
        },
        rationale: "Offer readiness evidence was incomplete or ambiguous.",
      });
    }

    return recommendations;
  }

  private attachDiagnosisToIssue(
    issue: AgenticGMVIssue,
    diagnosis: OfferExecutionDiagnosis
  ) {
    const byType = (patchType: OfferPatchRecommendation["patch_type"]) =>
      diagnosis.patch_recommendations.find(
        (recommendation) => recommendation.patch_type === patchType
      )?.patch;

    issue.offer_execution_diagnosis_id = diagnosis.id;
    issue.offer_execution_diagnosis_ids = unique([
      ...(issue.offer_execution_diagnosis_ids || []),
      diagnosis.id,
    ]);
    issue.merchant_offer_patch = byType("merchant_offer_patch");
    issue.pivota_offer_patch = byType("pivota_offer_patch");
    issue.inventory_sync_patch = byType("inventory_sync_patch");
    issue.promo_state_patch = byType("promo_state_patch");
    issue.offer_attachment_patch = byType("offer_attachment_patch");
    issue.evidence = {
      ...issue.evidence,
      offer_execution_diagnosis_id: diagnosis.id,
      offer_readiness_score: diagnosis.offer_readiness_score,
      offer_execution_confidence: diagnosis.confidence,
      offer_execution_root_cause_summary: diagnosis.root_cause_summary,
    };
    if (
      diagnosis.offer_layer_findings.some((comparison) =>
        comparison.findings.some((finding) => finding.finding_type !== "clean_offer")
      )
    ) {
      issue.fix_targets = unique([...issue.fix_targets, ...diagnosis.refined_fix_targets]);
      issue.root_cause = `${issue.root_cause} Offer readiness: ${diagnosis.root_cause_summary}`;
      issue.recommended_action =
        "Apply Product Understanding and Offer Execution readiness patches, then retest the same Demand Test query cluster.";
      issue.status = "diagnosed";
    }
    touch(issue);
  }

  private attachDiagnosisToRetestPlan(
    issue: AgenticGMVIssue,
    diagnosis: OfferExecutionDiagnosis
  ) {
    issue.verification_plan = {
      ...issue.verification_plan,
      target_improvement: `${issue.verification_plan.target_improvement}; verify Offer Execution diagnosis ${diagnosis.id} before before/after comparison.`,
    };
    issue.evidence = {
      ...issue.evidence,
      offer_execution_attached_to_retest_plan: diagnosis.id,
    };
    touch(issue);
  }
}

function checkoutFinding(input: {
  findingType: CheckoutIssueType | "clean_checkout_path";
  severity?: CheckoutReadinessFinding["severity"];
  field: CheckoutReadinessFinding["field"];
  merchantValue?: unknown;
  pivotaValue?: unknown;
  evidence: string;
  fixTarget: FixTarget;
}): CheckoutReadinessFinding {
  return {
    finding_type: input.findingType,
    severity: input.severity || "medium",
    field: input.field,
    merchant_value: input.merchantValue,
    pivota_value: input.pivotaValue,
    evidence: input.evidence,
    fix_target: input.fixTarget,
  };
}

function checkoutRootCause(findings: CheckoutReadinessFinding[]) {
  const actionable = findings.filter(
    (finding) => finding.finding_type !== "clean_checkout_path"
  );
  if (!actionable.length) {
    return "Merchant checkout source and Pivota checkout path are ready for V1 pre-payment handoff checks.";
  }

  const first = actionable[0];
  const labels: Record<CheckoutIssueType, string> = {
    missing_checkout_path:
      "No usable checkout path is attached to the merchant offer or Pivota offer.",
    checkout_url_unreachable:
      "The agent-facing checkout URL failed deterministic preflight.",
    stale_checkout_session:
      "The checkout session or source checkout path appears expired or stale.",
    cart_handoff_missing_required_param:
      "The cart handoff payload is missing one or more required checkout parameters.",
    variant_param_missing:
      "The checkout handoff does not include the required SKU or variant parameter.",
    quantity_param_missing:
      "The checkout handoff does not include the required quantity parameter.",
    coupon_param_missing:
      "The checkout handoff does not pass through the expected coupon or promo parameter.",
    checkout_domain_mismatch:
      "The Pivota checkout path points to a different checkout domain than the merchant checkout source.",
    checkout_not_attached_to_pivota_offer:
      "The checkout path exists but is not attached to the Pivota offer.",
    checkout_offer_sku_mismatch:
      "The checkout path SKU or variant does not match the merchant offer SKU.",
    human_review_required:
      "Checkout readiness evidence is incomplete or ambiguous and needs human review.",
  };
  return labels[first.finding_type as CheckoutIssueType] || first.evidence;
}

function checkoutReadinessScore(findings: CheckoutReadinessFinding[]) {
  const penalties: Record<CheckoutReadinessFinding["severity"], number> = {
    low: 10,
    medium: 20,
    high: 35,
    critical: 50,
  };
  const totalPenalty = findings
    .filter((finding) => finding.finding_type !== "clean_checkout_path")
    .reduce((sum, finding) => sum + penalties[finding.severity], 0);
  return clampScore(100 - totalPenalty);
}

function checkoutConfidence(input: {
  merchantCheckoutPath?: MerchantCheckoutPath | null;
  pivotaCheckoutPath?: PivotaCheckoutPath | null;
  findings: CheckoutReadinessFinding[];
}): CheckoutVerificationDiagnosis["confidence"] {
  if (!input.merchantCheckoutPath && !input.pivotaCheckoutPath) return "low";
  if (
    input.findings.some((finding) =>
      ["human_review_required", "checkout_offer_sku_mismatch"].includes(
        finding.finding_type
      )
    )
  ) {
    return "medium";
  }
  return input.merchantCheckoutPath && input.pivotaCheckoutPath ? "high" : "medium";
}

function cleanCheckoutComparison(
  merchantCheckoutPath?: MerchantCheckoutPath | null,
  pivotaCheckoutPath?: PivotaCheckoutPath | null
): CheckoutPathComparison {
  return {
    merchant_checkout_path: merchantCheckoutPath || null,
    pivota_checkout_path: pivotaCheckoutPath || null,
    checkout_url_preflight_status: "passed",
    checkout_url_status_code: 200,
    cart_handoff_required_params: merchantCheckoutPath?.required_params || [],
    missing_params: [],
    coupon_passthrough_consistent: true,
    domain_consistent: true,
    session_fresh: true,
    attached_to_pivota_offer: Boolean(pivotaCheckoutPath?.attached_to_pivota_offer),
    sku_variant_consistent: true,
    findings: [
      checkoutFinding({
        findingType: "clean_checkout_path",
        severity: "low",
        field: "checkout_path",
        evidence:
          "Merchant checkout source and Pivota checkout path are ready for V1 pre-payment handoff checks.",
        fixTarget: "pivota_checkout_layer",
      }),
    ],
  };
}

function checkoutUrlHost(value?: string | null) {
  if (!value) return "";
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function checkoutPreflight(value?: string | null): {
  status: "not_tested" | "passed" | "failed";
  statusCode: number | null;
} {
  if (!value) return { status: "not_tested", statusCode: null };
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { status: "failed", statusCode: 0 };
    }
    if (url.href.includes("unreachable")) {
      return { status: "failed", statusCode: 404 };
    }
    return { status: "passed", statusCode: 200 };
  } catch {
    return { status: "failed", statusCode: 0 };
  }
}

function payloadHasParam(payload: Record<string, unknown> | undefined, param?: string | null) {
  if (!param) return false;
  const value = payload?.[param];
  return value !== undefined && value !== null && value !== "";
}

function activeIssue(issue: AgenticGMVIssue) {
  return !["resolved", "ignored"].includes(issue.status);
}

function latestByCreatedAt<T extends { created_at: string }>(items: T[]) {
  return [...items].sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  )[0];
}

function scoreStatus(score?: VisibilityScoreValue, passAt = 80, blockBelow = 50) {
  if (score === "not_configured") return "not_configured" as const;
  if (score === undefined || score === "not_tested") {
    return "not_tested" as const;
  }
  if (score < blockBelow) return "blocked" as const;
  return score >= passAt ? ("passed" as const) : ("needs_work" as const);
}

function actionableProductFindings(diagnosis?: ProductUnderstandingDiagnosis) {
  if (!diagnosis) return [];
  return [
    ...diagnosis.merchant_layer_findings.flatMap((item) => item.findings || []),
    ...diagnosis.pivota_layer_findings.flatMap((item) => item.findings || []),
    ...diagnosis.entity_mapping_findings.filter((item) => item.finding_type !== "no_issue"),
    ...diagnosis.query_mapping_findings.filter((item) => item.finding_type !== "no_issue"),
    ...diagnosis.competitor_mapping_findings.filter(
      (item) => item.finding_type !== "no_issue"
    ),
  ];
}

function actionableSkuFindings(diagnosis?: ProductUnderstandingDiagnosis) {
  if (!diagnosis) return [];
  return diagnosis.sku_variant_findings.filter(
    (finding) => finding.finding_type !== "no_issue"
  );
}

function actionableOfferFindings(diagnosis?: OfferExecutionDiagnosis) {
  if (!diagnosis) return [];
  return diagnosis.offer_layer_findings.flatMap((comparison) =>
    comparison.findings.filter((finding) => finding.finding_type !== "clean_offer")
  );
}

function actionableCheckoutFindings(diagnosis?: CheckoutVerificationDiagnosis) {
  if (!diagnosis) return [];
  return diagnosis.checkout_layer_findings.flatMap((comparison) =>
    comparison.findings.filter(
      (finding) => finding.finding_type !== "clean_checkout_path"
    )
  );
}

function usageSummaryForAssurance(events: UsageEvent[]): GMVAssuranceUsageSummary {
  const byEvent = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.event_type] = (acc[event.event_type] || 0) + event.quantity;
    return acc;
  }, {});
  const ai = byEvent.ai_test_credit || 0;
  const product = byEvent.product_understanding_credit || 0;
  const offer = byEvent.offer_verification_credit || 0;
  const checkout = byEvent.checkout_verification_credit || 0;
  const resolution = byEvent.resolution_plan_credit || 0;
  return {
    ai_test_credits: ai,
    product_understanding_credits: product,
    offer_verification_credits: offer,
    checkout_verification_credits: checkout,
    resolution_plan_credits: resolution,
    total_preview_credits: ai + product + offer + checkout + resolution,
    billing_mode: "preview_only",
    billing_status: "not_invoiced",
  };
}

export class CheckoutVerificationService {
  latest(issueId: string) {
    return [...getAgentCenterState().checkoutVerificationDiagnoses]
      .reverse()
      .find((diagnosis) => diagnosis.issue_id === issueId) || null;
  }

  debugPayload(issueId: string) {
    const state = getAgentCenterState();
    const issue = findIssue(issueId);
    const store = findStore(issue.store_id);
    const clusters = state.queryClusters.filter((cluster) =>
      issue.affected_query_clusters.includes(cluster.id)
    );
    const product = findProductForIssue(store, issue, clusters);
    const diagnosis = this.latest(issueId);
    const merchantOffer = this.findMerchantOffer(issue, product);
    const pivotaOffer = this.findPivotaOffer(issue, product, merchantOffer);
    const merchantCheckoutPath = diagnosis?.merchant_checkout_path_id
      ? state.merchantCheckoutPaths.find(
          (path) => path.id === diagnosis.merchant_checkout_path_id
        )
      : this.findMerchantCheckoutPath(issue, merchantOffer, product);
    const pivotaCheckoutPath = diagnosis?.pivota_checkout_path_id
      ? state.pivotaCheckoutPaths.find(
          (path) => path.id === diagnosis.pivota_checkout_path_id
        )
      : this.findPivotaCheckoutPath(issue, pivotaOffer, merchantCheckoutPath, product);
    const offerDiagnosis =
      issue.offer_execution_diagnosis_id
        ? state.offerExecutionDiagnoses.find(
            (item) => item.id === issue.offer_execution_diagnosis_id
          )
        : new OfferExecutionService().latest(issueId);
    const usageEvents = diagnosis
      ? state.usageEvents.filter((event) =>
          diagnosis.usage_event_ids.includes(event.id)
        )
      : [];

    return {
      source_issue_summary: {
        issue_id: issue.id,
        issue_type: issue.issue_type,
        severity: issue.severity,
        status: issue.status,
        affected_product_entities: issue.affected_product_entities,
        affected_skus: issue.affected_skus,
        fix_targets: issue.fix_targets,
      },
      offer_execution_diagnosis: offerDiagnosis || null,
      merchant_checkout_path: merchantCheckoutPath || null,
      pivota_checkout_path: pivotaCheckoutPath || null,
      findings: diagnosis?.checkout_layer_findings || [],
      refined_fix_targets: diagnosis?.refined_fix_targets || [],
      patch_recommendations: diagnosis?.patch_recommendations || [],
      checkout_readiness_score: diagnosis?.checkout_readiness_score ?? null,
      confidence: diagnosis?.confidence || null,
      usage_event_ids: diagnosis?.usage_event_ids || [],
      usage_events: usageEvents,
    };
  }

  runDiagnosis(
    issueId: string,
    options?: { regeneratePatch?: boolean; attachToRetestPlan?: boolean }
  ) {
    const existing = this.latest(issueId);
    if (existing && !options?.regeneratePatch && !options?.attachToRetestPlan) {
      return existing;
    }

    const state = getAgentCenterState();
    const issue = findIssue(issueId);
    const store = findStore(issue.store_id);
    const clusters = state.queryClusters.filter((cluster) =>
      issue.affected_query_clusters.includes(cluster.id)
    );
    const product = findProductForIssue(store, issue, clusters);
    const merchantOffer = this.findMerchantOffer(issue, product);
    const pivotaOffer = this.findPivotaOffer(issue, product, merchantOffer);
    const merchantCheckoutPath = this.findMerchantCheckoutPath(
      issue,
      merchantOffer,
      product
    );
    const pivotaCheckoutPath = this.findPivotaCheckoutPath(
      issue,
      pivotaOffer,
      merchantCheckoutPath,
      product
    );
    const comparison = this.compareCheckoutPaths({
      issue,
      product,
      merchantOffer,
      pivotaOffer,
      merchantCheckoutPath,
      pivotaCheckoutPath,
    });
    const actionable = comparison.findings.filter(
      (finding) => finding.finding_type !== "clean_checkout_path"
    );
    const refinedFixTargets = this.refinedFixTargets(actionable, {
      merchantCheckoutPath,
      pivotaCheckoutPath,
    });
    const patchRecommendations = this.patchRecommendations({
      issue,
      product,
      merchantOffer,
      pivotaOffer,
      merchantCheckoutPath,
      pivotaCheckoutPath,
      findings: actionable,
      missingParams: comparison.missing_params,
    });
    const now = nowIso();
    const diagnosisId = nextId("checkout_diag");
    const usageEvent = new UsageMeteringService().recordCheckoutVerification({
      issue,
      diagnosisId,
    });
    const diagnosis: CheckoutVerificationDiagnosis = {
      id: diagnosisId,
      merchant_id: issue.merchant_id,
      store_id: issue.store_id,
      issue_id: issue.id,
      product_entity_id: product?.product_entity_id || issue.affected_product_entities[0],
      sku_id: product?.sku || issue.affected_skus[0],
      merchant_offer_id: merchantOffer?.id,
      pivota_offer_id: pivotaOffer?.id,
      merchant_checkout_path_id: merchantCheckoutPath?.id,
      pivota_checkout_path_id: pivotaCheckoutPath?.id,
      source_agent: "checkout_verification_agent",
      checkout_layer_findings: [comparison],
      root_cause_summary: checkoutRootCause(comparison.findings),
      refined_fix_targets: refinedFixTargets.length
        ? refinedFixTargets
        : ["pivota_checkout_layer"],
      patch_recommendations: patchRecommendations,
      checkout_readiness_score: checkoutReadinessScore(comparison.findings),
      confidence: checkoutConfidence({
        merchantCheckoutPath,
        pivotaCheckoutPath,
        findings: comparison.findings,
      }),
      usage_event_ids: [usageEvent.id],
      created_at: now,
      updated_at: now,
    };

    state.checkoutVerificationDiagnoses.push(diagnosis);
    this.attachDiagnosisToIssue(issue, diagnosis);
    if (options?.attachToRetestPlan) {
      this.attachDiagnosisToRetestPlan(issue, diagnosis);
    }
    return diagnosis;
  }

  regeneratePatch(issueId: string) {
    return this.runDiagnosis(issueId, { regeneratePatch: true });
  }

  attachToRetestPlan(issueId: string) {
    return this.runDiagnosis(issueId, { attachToRetestPlan: true });
  }

  private findMerchantOffer(issue: AgenticGMVIssue, product?: ProductRecord) {
    return getAgentCenterState().merchantOffers.find(
      (offer) =>
        offer.merchant_id === issue.merchant_id &&
        offer.store_id === issue.store_id &&
        (offer.product_id === product?.id ||
          offer.sku_id === product?.sku ||
          issue.affected_skus.includes(offer.sku_id))
    );
  }

  private findPivotaOffer(
    issue: AgenticGMVIssue,
    product?: ProductRecord,
    merchantOffer?: MerchantOffer
  ) {
    const productEntityId = product?.product_entity_id || issue.affected_product_entities[0];
    return getAgentCenterState().pivotaOffers.find(
      (offer) =>
        offer.merchant_id === issue.merchant_id &&
        offer.store_id === issue.store_id &&
        offer.product_entity_id === productEntityId &&
        (!merchantOffer || offer.sku_id === merchantOffer.sku_id)
    ) ||
      getAgentCenterState().pivotaOffers.find(
        (offer) =>
          offer.merchant_id === issue.merchant_id &&
          offer.store_id === issue.store_id &&
          offer.product_entity_id === productEntityId
      );
  }

  private findMerchantCheckoutPath(
    issue: AgenticGMVIssue,
    merchantOffer?: MerchantOffer,
    product?: ProductRecord
  ) {
    return getAgentCenterState().merchantCheckoutPaths.find(
      (path) =>
        path.merchant_id === issue.merchant_id &&
        path.store_id === issue.store_id &&
        ((merchantOffer && path.merchant_offer_id === merchantOffer.id) ||
          path.sku_id === merchantOffer?.sku_id ||
          path.sku_id === product?.sku ||
          issue.affected_skus.includes(path.sku_id))
    );
  }

  private findPivotaCheckoutPath(
    issue: AgenticGMVIssue,
    pivotaOffer?: PivotaOffer,
    merchantCheckoutPath?: MerchantCheckoutPath,
    product?: ProductRecord
  ) {
    const productEntityId = product?.product_entity_id || issue.affected_product_entities[0];
    return getAgentCenterState().pivotaCheckoutPaths.find(
      (path) =>
        path.merchant_id === issue.merchant_id &&
        path.store_id === issue.store_id &&
        ((pivotaOffer && path.pivota_offer_id === pivotaOffer.id) ||
          path.product_entity_id === productEntityId) &&
        (!merchantCheckoutPath || path.sku_id === merchantCheckoutPath.sku_id)
    ) ||
      getAgentCenterState().pivotaCheckoutPaths.find(
        (path) =>
          path.merchant_id === issue.merchant_id &&
          path.store_id === issue.store_id &&
          path.product_entity_id === productEntityId
      );
  }

  private compareCheckoutPaths(input: {
    issue: AgenticGMVIssue;
    product?: ProductRecord;
    merchantOffer?: MerchantOffer;
    pivotaOffer?: PivotaOffer;
    merchantCheckoutPath?: MerchantCheckoutPath;
    pivotaCheckoutPath?: PivotaCheckoutPath;
  }): CheckoutPathComparison {
    const {
      product,
      merchantOffer,
      pivotaOffer,
      merchantCheckoutPath,
      pivotaCheckoutPath,
    } = input;
    const findings: CheckoutReadinessFinding[] = [];
    const preflight = checkoutPreflight(pivotaCheckoutPath?.checkout_url);
    const requiredParams = unique([
      ...(merchantCheckoutPath?.required_params || []),
      ...(pivotaCheckoutPath?.required_params || []),
    ]);
    const missingParams = requiredParams.filter(
      (param) => !payloadHasParam(pivotaCheckoutPath?.cart_handoff_payload, param)
    );

    if (!merchantCheckoutPath && !pivotaCheckoutPath) {
      findings.push(
        checkoutFinding({
          findingType: "missing_checkout_path",
          severity: "high",
          field: "checkout_path",
          evidence:
            "No merchant checkout source or Pivota checkout path was found for the affected offer.",
          fixTarget: "both_merchant_and_pivota",
        })
      );
    } else if (merchantCheckoutPath && !pivotaCheckoutPath) {
      findings.push(
        checkoutFinding({
          findingType: "missing_checkout_path",
          severity: "high",
          field: "checkout_path",
          merchantValue: merchantCheckoutPath.id,
          evidence:
            "Merchant checkout source exists, but no matching Pivota checkout path is attached to the offer.",
          fixTarget: "pivota_checkout_layer",
        })
      );
    }

    if (pivotaCheckoutPath) {
      if (preflight.status !== "passed") {
        findings.push(
          checkoutFinding({
            findingType: "checkout_url_unreachable",
            severity: "high",
            field: "checkout_url",
            pivotaValue: {
              checkout_url: pivotaCheckoutPath.checkout_url,
              status_code: preflight.statusCode,
            },
            evidence:
              "Pivota checkout URL did not pass deterministic preflight and cannot be treated as a ready checkout path.",
            fixTarget: "pivota_checkout_layer",
          })
        );
      }

      if (!pivotaCheckoutPath.attached_to_pivota_offer) {
        findings.push(
          checkoutFinding({
            findingType: "checkout_not_attached_to_pivota_offer",
            severity: "high",
            field: "attachment",
            pivotaValue: pivotaCheckoutPath.id,
            evidence:
              "Checkout path exists, but it is not attached to the Pivota offer.",
            fixTarget: "pivota_offer_layer",
          })
        );
      }

      if (pivotaOffer && pivotaCheckoutPath.pivota_offer_id !== pivotaOffer.id) {
        findings.push(
          checkoutFinding({
            findingType: "checkout_not_attached_to_pivota_offer",
            severity: "high",
            field: "attachment",
            merchantValue: pivotaOffer.id,
            pivotaValue: pivotaCheckoutPath.pivota_offer_id,
            evidence:
              "Checkout path points to a different Pivota offer than the affected offer.",
            fixTarget: "pivota_offer_layer",
          })
        );
      }
    }

    if (merchantCheckoutPath && pivotaCheckoutPath) {
      const payload = pivotaCheckoutPath.cart_handoff_payload;
      const variantParam = merchantCheckoutPath.variant_param_name;
      const quantityParam = merchantCheckoutPath.quantity_param_name;
      const couponParam = merchantCheckoutPath.coupon_param_name;

      if (merchantOffer && merchantCheckoutPath.merchant_offer_id !== merchantOffer.id) {
        findings.push(
          checkoutFinding({
            findingType: "human_review_required",
            severity: "medium",
            field: "attachment",
            merchantValue: merchantOffer.id,
            pivotaValue: merchantCheckoutPath.merchant_offer_id,
            evidence:
              "Merchant checkout source points to a different merchant offer than the affected offer.",
            fixTarget: "merchant_checkout_source",
          })
        );
      }

      if (
        variantParam &&
        !payloadHasParam(payload, variantParam) &&
        !pivotaCheckoutPath.variant_id
      ) {
        findings.push(
          checkoutFinding({
            findingType: "variant_param_missing",
            severity: "high",
            field: "variant",
            merchantValue: variantParam,
            pivotaValue: payload,
            evidence:
              "Pivota cart handoff is missing the required SKU or variant parameter.",
            fixTarget: "pivota_checkout_layer",
          })
        );
      }

      if (
        quantityParam &&
        !payloadHasParam(payload, quantityParam) &&
        !pivotaCheckoutPath.quantity
      ) {
        findings.push(
          checkoutFinding({
            findingType: "quantity_param_missing",
            severity: "medium",
            field: "quantity",
            merchantValue: quantityParam,
            pivotaValue: payload,
            evidence:
              "Pivota cart handoff is missing the required quantity parameter.",
            fixTarget: "pivota_checkout_layer",
          })
        );
      }

      const expectedCoupon = merchantOffer?.coupon_code || pivotaOffer?.coupon_code;
      if (
        expectedCoupon &&
        couponParam &&
        !payloadHasParam(payload, couponParam)
      ) {
        findings.push(
          checkoutFinding({
            findingType: "coupon_param_missing",
            severity: "medium",
            field: "coupon",
            merchantValue: {
              coupon_param_name: couponParam,
              coupon_code: expectedCoupon,
            },
            pivotaValue: payload,
            evidence:
              "Pivota cart handoff is missing the required coupon or promo passthrough parameter.",
            fixTarget: "pivota_checkout_layer",
          })
        );
      }

      const genericMissing = missingParams.filter(
        (param) => ![variantParam, quantityParam, couponParam].includes(param)
      );
      if (genericMissing.length) {
        findings.push(
          checkoutFinding({
            findingType: "cart_handoff_missing_required_param",
            severity: "medium",
            field: "cart_handoff",
            merchantValue: merchantCheckoutPath.required_params,
            pivotaValue: payload,
            evidence: `Pivota cart handoff is missing required parameter(s): ${genericMissing.join(", ")}.`,
            fixTarget: "pivota_checkout_layer",
          })
        );
      }

      const merchantDomain =
        merchantCheckoutPath.checkout_domain ||
        checkoutUrlHost(merchantCheckoutPath.checkout_url);
      const pivotaDomain =
        pivotaCheckoutPath.checkout_domain ||
        checkoutUrlHost(pivotaCheckoutPath.checkout_url);
      if (merchantDomain && pivotaDomain && merchantDomain !== pivotaDomain) {
        findings.push(
          checkoutFinding({
            findingType: "checkout_domain_mismatch",
            severity: "high",
            field: "domain",
            merchantValue: merchantDomain,
            pivotaValue: pivotaDomain,
            evidence:
              "Pivota checkout path points to a different checkout domain than the merchant checkout source.",
            fixTarget: "pivota_checkout_layer",
          })
        );
      }

      if (isExpired(merchantCheckoutPath.expires_at)) {
        findings.push(
          checkoutFinding({
            findingType: "stale_checkout_session",
            severity: "high",
            field: "session",
            merchantValue: merchantCheckoutPath.expires_at,
            evidence:
              "Merchant checkout path or session expiration is in the past.",
            fixTarget: "merchant_checkout_source",
          })
        );
      }

      if (
        merchantCheckoutPath.sku_id !== pivotaCheckoutPath.sku_id ||
        (product?.sku && merchantCheckoutPath.sku_id !== product.sku)
      ) {
        findings.push(
          checkoutFinding({
            findingType: "checkout_offer_sku_mismatch",
            severity: "high",
            field: "sku_variant",
            merchantValue: merchantCheckoutPath.sku_id,
            pivotaValue: pivotaCheckoutPath.sku_id,
            evidence:
              "Checkout path SKU or variant does not match the merchant offer SKU.",
            fixTarget: "pivota_product_graph",
          })
        );
      }
    }

    if (!findings.length) {
      return cleanCheckoutComparison(merchantCheckoutPath, pivotaCheckoutPath);
    }

    return {
      merchant_checkout_path: merchantCheckoutPath || null,
      pivota_checkout_path: pivotaCheckoutPath || null,
      checkout_url_preflight_status: preflight.status,
      checkout_url_status_code: preflight.statusCode,
      cart_handoff_required_params: requiredParams,
      missing_params: missingParams,
      coupon_passthrough_consistent: !findings.some(
        (finding) => finding.field === "coupon"
      ),
      domain_consistent: !findings.some((finding) => finding.field === "domain"),
      session_fresh: !findings.some((finding) => finding.field === "session"),
      attached_to_pivota_offer: Boolean(pivotaCheckoutPath?.attached_to_pivota_offer),
      sku_variant_consistent: !findings.some(
        (finding) => finding.field === "sku_variant"
      ),
      findings,
    };
  }

  private refinedFixTargets(
    findings: CheckoutReadinessFinding[],
    context: {
      merchantCheckoutPath?: MerchantCheckoutPath;
      pivotaCheckoutPath?: PivotaCheckoutPath;
    }
  ) {
    const targets = new Set<FixTarget>();
    for (const finding of findings) {
      targets.add(finding.fix_target);
      if (finding.finding_type === "missing_checkout_path") {
        if (!context.merchantCheckoutPath) targets.add("merchant_checkout_source");
        targets.add("pivota_checkout_layer");
      }
      if (
        finding.finding_type === "cart_handoff_missing_required_param" ||
        finding.finding_type === "variant_param_missing" ||
        finding.finding_type === "quantity_param_missing"
      ) {
        targets.add("merchant_cart_config");
      }
      if (finding.finding_type === "coupon_param_missing") {
        targets.add("merchant_promo_source");
      }
      if (finding.finding_type === "checkout_offer_sku_mismatch") {
        targets.add("pivota_product_graph");
      }
    }
    return [...targets];
  }

  private patchRecommendations(input: {
    issue: AgenticGMVIssue;
    product?: ProductRecord;
    merchantOffer?: MerchantOffer;
    pivotaOffer?: PivotaOffer;
    merchantCheckoutPath?: MerchantCheckoutPath;
    pivotaCheckoutPath?: PivotaCheckoutPath;
    findings: CheckoutReadinessFinding[];
    missingParams: string[];
  }) {
    const recommendations: CheckoutPatchRecommendation[] = [];
    const has = (type: CheckoutIssueType) =>
      input.findings.some((finding) => finding.finding_type === type);
    const hasField = (field: CheckoutReadinessFinding["field"]) =>
      input.findings.some((finding) => finding.field === field);

    if (
      has("missing_checkout_path") ||
      has("checkout_url_unreachable") ||
      has("stale_checkout_session")
    ) {
      recommendations.push({
        patch_type: input.merchantCheckoutPath
          ? "pivota_checkout_patch"
          : "merchant_checkout_patch",
        target: input.merchantCheckoutPath
          ? "pivota_checkout_layer"
          : "merchant_checkout_source",
        patch: {
          merchant_offer_id: input.merchantOffer?.id,
          pivota_offer_id: input.pivotaOffer?.id,
          merchant_checkout_path_id: input.merchantCheckoutPath?.id,
          pivota_checkout_path_id: input.pivotaCheckoutPath?.id,
          sku_id: input.merchantOffer?.sku_id || input.product?.sku,
          checkout_url: input.merchantCheckoutPath?.checkout_url,
          cart_url: input.merchantCheckoutPath?.cart_url,
          checkout_domain: input.merchantCheckoutPath?.checkout_domain,
          required_params: input.merchantCheckoutPath?.required_params || [],
          action: input.merchantCheckoutPath
            ? "Create or refresh the Pivota checkout path from merchant checkout source."
            : "Add merchant checkout source metadata before Pivota checkout readiness can be verified.",
        },
        rationale:
          "A reachable checkout path must exist before checkout readiness can be counted.",
      });
    }

    if (
      hasField("cart_handoff") ||
      has("variant_param_missing") ||
      has("quantity_param_missing")
    ) {
      recommendations.push({
        patch_type: "cart_handoff_payload_patch",
        target: "pivota_checkout_layer",
        patch: {
          pivota_checkout_path_id: input.pivotaCheckoutPath?.id,
          required_params: input.merchantCheckoutPath?.required_params || [],
          missing_params: input.missingParams,
          expected_variant_param: input.merchantCheckoutPath?.variant_param_name,
          expected_quantity_param: input.merchantCheckoutPath?.quantity_param_name,
          expected_variant_id: input.merchantOffer?.sku_id || input.product?.sku,
          expected_quantity: input.pivotaCheckoutPath?.quantity || 1,
          action:
            "Update Pivota cart handoff payload with required variant and quantity parameters.",
        },
        rationale:
          "Agent-routed cart handoff must include required SKU/variant and quantity parameters.",
      });
    }

    if (has("coupon_param_missing")) {
      recommendations.push({
        patch_type: "coupon_passthrough_patch",
        target: "merchant_promo_source",
        patch: {
          merchant_offer_id: input.merchantOffer?.id,
          pivota_checkout_path_id: input.pivotaCheckoutPath?.id,
          coupon_param_name: input.merchantCheckoutPath?.coupon_param_name,
          coupon_code: input.merchantOffer?.coupon_code || input.pivotaOffer?.coupon_code,
          action:
            "Add coupon passthrough to the Pivota cart handoff payload and align merchant promo source metadata.",
        },
        rationale:
          "Promo/coupon state must pass through checkout handoff before the offer is treated as checkout-ready.",
      });
    }

    if (has("checkout_not_attached_to_pivota_offer") || has("checkout_offer_sku_mismatch")) {
      recommendations.push({
        patch_type: "checkout_attachment_patch",
        target: has("checkout_offer_sku_mismatch")
          ? "pivota_product_graph"
          : "pivota_offer_layer",
        patch: {
          product_entity_id: input.product?.product_entity_id || input.issue.affected_product_entities[0],
          pivota_offer_id: input.pivotaOffer?.id,
          pivota_checkout_path_id: input.pivotaCheckoutPath?.id,
          expected_sku_id: input.merchantOffer?.sku_id || input.product?.sku,
          current_checkout_sku_id: input.pivotaCheckoutPath?.sku_id,
          attached_to_pivota_offer: true,
        },
        rationale:
          "The checkout path must attach to the correct Pivota offer and SKU/variant.",
      });
    }

    if (has("checkout_domain_mismatch")) {
      recommendations.push({
        patch_type: "checkout_domain_patch",
        target: "pivota_checkout_layer",
        patch: {
          merchant_checkout_path_id: input.merchantCheckoutPath?.id,
          pivota_checkout_path_id: input.pivotaCheckoutPath?.id,
          expected_checkout_domain: input.merchantCheckoutPath?.checkout_domain,
          current_checkout_domain: input.pivotaCheckoutPath?.checkout_domain,
          action:
            "Align Pivota checkout domain with the merchant checkout source domain.",
        },
        rationale:
          "Domain consistency is required before Pivota can assert the checkout path points to the merchant buying path.",
      });
    }

    if (!recommendations.length && input.findings.length) {
      recommendations.push({
        patch_type: "merchant_checkout_patch",
        target: "human_review",
        patch: {
          issue_id: input.issue.id,
          action: "Review merchant checkout source and Pivota checkout path manually.",
        },
        rationale: "Checkout readiness evidence was incomplete or ambiguous.",
      });
    }

    return recommendations;
  }

  private attachDiagnosisToIssue(
    issue: AgenticGMVIssue,
    diagnosis: CheckoutVerificationDiagnosis
  ) {
    const byType = (patchType: CheckoutPatchRecommendation["patch_type"]) =>
      diagnosis.patch_recommendations.find(
        (recommendation) => recommendation.patch_type === patchType
      )?.patch;

    issue.checkout_verification_diagnosis_id = diagnosis.id;
    issue.checkout_verification_diagnosis_ids = unique([
      ...(issue.checkout_verification_diagnosis_ids || []),
      diagnosis.id,
    ]);
    issue.merchant_checkout_patch = byType("merchant_checkout_patch");
    issue.pivota_checkout_patch = byType("pivota_checkout_patch");
    issue.cart_handoff_payload_patch = byType("cart_handoff_payload_patch");
    issue.coupon_passthrough_patch = byType("coupon_passthrough_patch");
    issue.checkout_attachment_patch = byType("checkout_attachment_patch");
    issue.checkout_domain_patch = byType("checkout_domain_patch");
    issue.evidence = {
      ...issue.evidence,
      checkout_verification_diagnosis_id: diagnosis.id,
      checkout_readiness_score: diagnosis.checkout_readiness_score,
      checkout_verification_confidence: diagnosis.confidence,
      checkout_verification_root_cause_summary: diagnosis.root_cause_summary,
    };
    if (
      diagnosis.checkout_layer_findings.some((comparison) =>
        comparison.findings.some(
          (finding) => finding.finding_type !== "clean_checkout_path"
        )
      )
    ) {
      issue.fix_targets = unique([...issue.fix_targets, ...diagnosis.refined_fix_targets]);
      issue.root_cause = `${issue.root_cause} Checkout readiness: ${diagnosis.root_cause_summary}`;
      issue.recommended_action =
        "Apply Product Understanding, Offer Execution, and Checkout Verification readiness patches before retesting the same Demand Test query cluster.";
      issue.status = "diagnosed";
    }
    touch(issue);
  }

  private attachDiagnosisToRetestPlan(
    issue: AgenticGMVIssue,
    diagnosis: CheckoutVerificationDiagnosis
  ) {
    issue.verification_plan = {
      ...issue.verification_plan,
      target_improvement: `${issue.verification_plan.target_improvement}; verify Checkout Verification diagnosis ${diagnosis.id} before before/after comparison.`,
    };
    issue.evidence = {
      ...issue.evidence,
      checkout_verification_attached_to_retest_plan: diagnosis.id,
    };
    touch(issue);
  }
}

const supportedResolutionBlockers = new Set([
  "organic_product_not_discovered",
  "competitor_dominance",
  "merchant_pdp_not_discovered",
  "pivota_pdp_not_discovered",
  "wrong_buying_path_returned",
  "merchant_store_attribution_gap",
  "pivota_pdp_attribution_gap",
  "unverified_pivota_attribution",
  "missing_attribute",
  "pivota_pdp_readiness_gap",
  "pivota_pdp_content_quality_gap",
  "pivota_product_intelligence_gap",
  "price_mismatch",
  "expired_coupon",
  "coupon_param_missing",
  "checkout_url_unreachable",
]);

function latestIssueResolutionPlan(issueId: string) {
  return (
    latestByCreatedAt(
      getAgentCenterState().issueResolutionPlans.filter(
        (plan) => plan.issue_id === issueId
      )
    ) || null
  );
}

function nextResolutionAction(plan?: IssueResolutionPlan | null) {
  return plan?.recommended_actions.find(
    (action) =>
      !["applied", "rejected", "skipped"].includes(action.status)
  );
}

function discoveryResolutionNextAction(blockerType: string) {
  if (blockerType === "organic_product_not_discovered") {
    return ORGANIC_DISCOVERY_NEXT_ACTION;
  }
  if (blockerType === "competitor_dominance") {
    return COMPETITOR_DOMINANCE_NEXT_ACTION;
  }
  if (blockerType === "merchant_pdp_not_discovered") {
    return "Fix merchant PDP indexability, structured data, canonical URL, and PDP copy, then rerun Search-Grounded Product Discovery Test.";
  }
  if (blockerType === "pivota_pdp_not_discovered") {
    return "Fix Pivota PDP indexability, source references, structured data, and product intelligence, then rerun Search-Grounded Product Discovery Test.";
  }
  if (blockerType === "wrong_buying_path_returned") {
    return "Analyze wrong returned URLs, strengthen canonical buying-path signals, then rerun Search-Grounded Product Discovery Test.";
  }
  return "";
}

function actionStatusAfterApply(action: RecommendedAction) {
  return action.requires_merchant_approval && action.status !== "approved"
    ? action.status
    : "applied";
}

const PIVOTA_OPTIMIZATION_ACTION_TYPES = new Set([
  "pivota_discovery_signal_patch",
  "pivota_source_reference_patch",
  "pivota_product_intelligence_patch",
  "pivota_product_schema_patch",
  "pivota_offer_schema_patch",
  "pivota_sitemap_submission",
  "query_cluster_mapping_patch",
  "competitor_substitute_graph_patch",
]);

const PIVOTA_OPTIMIZATION_ACTION_ALIASES: Record<string, PivotaOptimizationPatchType> = {
  pivota_pdp_identity_and_overview_patch: "pivota_discovery_signal_patch",
  pivota_product_intelligence_module_patch: "pivota_product_intelligence_patch",
  pivota_unified_pdp_patch: "pivota_product_intelligence_patch",
  pivota_product_graph_patch: "query_cluster_mapping_patch",
  pivota_unified_pdp_source_reference_patch: "pivota_source_reference_patch",
  publish_or_verify_pivota_pdp_url: "pivota_source_reference_patch",
  bind_product_object_id: "query_cluster_mapping_patch",
  update_pivota_product_graph_object_reference: "query_cluster_mapping_patch",
  require_verified_pivota_url_or_object_id: "pivota_source_reference_patch",
  competitor_or_retailer_confusion_patch: "competitor_substitute_graph_patch",
  pivota_product_graph_buying_path_binding: "query_cluster_mapping_patch",
};

function pivotaOptimizationPatchTypeForAction(
  action: RecommendedAction
): PivotaOptimizationPatchType | null {
  if (PIVOTA_OPTIMIZATION_ACTION_TYPES.has(action.action_type)) {
    return action.action_type as PivotaOptimizationPatchType;
  }
  return PIVOTA_OPTIMIZATION_ACTION_ALIASES[action.action_type] || null;
}

function isPivotaOwnedOptimizationAction(action: RecommendedAction) {
  const patchType = pivotaOptimizationPatchTypeForAction(action);
  if (!patchType) return false;
  if (action.requires_merchant_approval) return false;
  return (
    action.owner_type === "pivota_ops" ||
    action.owner_type === "pivota_eng" ||
    /pivota/i.test(String(action.target_layer))
  );
}

function pivotaOptimizationTargetLayer(
  patchType: PivotaOptimizationPatchType
): PivotaOptimizationTargetLayer {
  const map: Record<PivotaOptimizationPatchType, PivotaOptimizationTargetLayer> = {
    pivota_discovery_signal_patch: "pivota_unified_pdp",
    pivota_source_reference_patch: "pivota_unified_pdp",
    pivota_product_intelligence_patch: "pivota_product_graph",
    pivota_product_schema_patch: "pivota_schema_markup",
    pivota_offer_schema_patch: "pivota_schema_markup",
    pivota_sitemap_submission: "pivota_sitemap",
    query_cluster_mapping_patch: "pivota_query_mapping",
    competitor_substitute_graph_patch: "pivota_competitor_graph",
  };
  return map[patchType];
}

function pivotaOptimizationPatchesForIssue(issueId: string) {
  const state = getAgentCenterState();
  const fromCollection = state.pivotaOptimizationPatches.filter((patch) =>
    patch.source_issue_ids.includes(issueId)
  );
  const fromPlans = state.issueResolutionPlans
    .filter((plan) => plan.issue_id === issueId)
    .flatMap((plan) => plan.pivota_optimization_patches || []);
  const byId = new Map<string, PivotaOptimizationPatch>();
  for (const patch of [...fromCollection, ...fromPlans]) byId.set(patch.id, patch);
  return [...byId.values()].sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  );
}

function storePivotaOptimizationPatch(
  plan: IssueResolutionPlan,
  patch: PivotaOptimizationPatch
) {
  const repository = getAgentCenterRepository();
  const state = repository.getState();
  const existingIndex = state.pivotaOptimizationPatches.findIndex(
    (item) => item.id === patch.id
  );
  if (existingIndex >= 0) {
    state.pivotaOptimizationPatches[existingIndex] = patch;
  } else {
    state.pivotaOptimizationPatches.push(patch);
  }
  plan.pivota_optimization_patch_ids = unique([
    ...(plan.pivota_optimization_patch_ids || []),
    patch.id,
  ]);
  const embedded = plan.pivota_optimization_patches || [];
  const embeddedIndex = embedded.findIndex((item) => item.id === patch.id);
  if (embeddedIndex >= 0) embedded[embeddedIndex] = patch;
  else embedded.push(patch);
  plan.pivota_optimization_patches = embedded;
  touch(plan);
  repository.upsert("issueResolutionPlans", plan);
}

const PIVOTA_DISCOVERY_INDEXING_TASKS: PivotaIndexingTaskType[] = [
  "submit_sitemap",
  "request_indexing",
  "validate_search_console",
  "add_internal_link",
  "wait_for_indexing_window",
  "scheduled_search_grounded_rerun",
];

const PIVOTA_DISCOVERY_RERUN_WINDOWS = [
  { label: "T+24h", hours: 24 },
  { label: "T+72h", hours: 72 },
  { label: "T+7d", hours: 168 },
];

const INDEXING_REQUEST_ALLOWED_INSPECTION_STATUSES = new Set([
  "inspectable",
  "indexed",
  "indexing_requested",
]);

const PRODUCT_ENTITY_INDEX_PUBLIC_BASE_URL = "https://agent.pivota.cc";
const PRODUCT_ENTITY_INDEX_GATEWAY_DEFAULT_URL =
  "https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke";

type ProductEntityIndexCandidate = {
  product_entity_id: string;
  external_seed_id?: string;
  source_product_id?: string;
  product_name?: string;
  brand?: string;
  category?: string;
  source_updated_at?: string;
};

type ProductEntityIndexSyncSource =
  | "gateway_discovery_feed"
  | "gateway_product_entity_index_feed"
  | "backend_external_seeds";

function productEntityIndexRecordId(productEntityId: string) {
  return `product_entity_index_${productEntityId}`;
}

function isCanonicalProductEntityId(value: unknown) {
  return /^sig_[a-z0-9]+$/i.test(stringInput(value));
}

function canonicalAgentProductEntityUrl(productEntityId: string) {
  return `${PRODUCT_ENTITY_INDEX_PUBLIC_BASE_URL}/products/${productEntityId}`;
}

function normalizeProductEntityIndexCanonicalUrl(value: unknown, productEntityId: string) {
  const candidate = stringInput(value);
  const expected = canonicalAgentProductEntityUrl(productEntityId);
  if (!candidate) return expected;
  try {
    const url = new URL(candidate);
    if (
      url.protocol === "https:" &&
      url.hostname === "agent.pivota.cc" &&
      url.pathname === `/products/${productEntityId}` &&
      !url.search
    ) {
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    // Invalid canonical candidates are ignored and rebuilt from ProductEntity ID.
  }
  return expected;
}

function productEntityGatewayInvokeUrl() {
  const configured =
    process.env.AGENT_CENTER_PRODUCT_ENTITY_GATEWAY_URL ||
    process.env.PIVOTA_AGENT_SEO_GATEWAY_URL ||
    process.env.SHOP_UPSTREAM_API_URL ||
    process.env.SHOP_GATEWAY_UPSTREAM_BASE_URL ||
    process.env.SHOP_GATEWAY_AGENT_BASE_URL ||
    process.env.NEXT_PUBLIC_AGENT_DIRECT_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_API_URL ||
    PRODUCT_ENTITY_INDEX_GATEWAY_DEFAULT_URL;
  const base = String(configured || PRODUCT_ENTITY_INDEX_GATEWAY_DEFAULT_URL).replace(/\/+$/, "");
  if (/\/agent\/shop\/v1\/invoke$/i.test(base) || /\/api\/gateway$/i.test(base)) {
    return base;
  }
  return `${base}/agent/shop/v1/invoke`;
}

function productEntityGatewayApiKey() {
  return (
    process.env.AGENT_API_KEY ||
    process.env.SHOP_GATEWAY_AGENT_API_KEY ||
    process.env.PIVOTA_API_KEY ||
    process.env.NEXT_PUBLIC_AGENT_API_KEY ||
    ""
  ).trim();
}

async function productEntityGatewayRequest(operation: string, payload: Record<string, unknown>) {
  const apiKey = productEntityGatewayApiKey();
  const response = await fetch(productEntityGatewayInvokeUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey
        ? {
            "X-API-Key": apiKey,
            Authorization: `Bearer ${apiKey}`,
          }
        : {}),
    },
    body: JSON.stringify({
      operation,
      payload,
      metadata: {
        entry: "agent_center_product_entity_index",
        source: "agent_center_product_entity_index",
        scope: { catalog: "global" },
      },
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`${operation} failed with HTTP ${response.status}`);
  }
  return response.json();
}

function readNestedRecord(...values: unknown[]) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {};
}

function readNestedArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function productEntityCandidateFromGatewayItem(item: unknown): ProductEntityIndexCandidate | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const productEntityId = stringInput(
    record.product_entity_id,
    record.productEntityId,
    record.product_group_id,
    record.productGroupId,
    record.sellable_item_group_id,
    record.sellableItemGroupId
  );
  if (!isCanonicalProductEntityId(productEntityId)) return null;
  const sourceProductId = stringInput(record.product_id, record.productId, record.id);
  const externalSeedId = /^ext_[a-z0-9_]+$/i.test(sourceProductId)
    ? sourceProductId
    : stringInput(record.external_seed_id, record.externalSeedId);
  const brandRecord = readNestedRecord(record.brand);
  const categoryPath = Array.isArray(record.category_path)
    ? record.category_path.join(" > ")
    : Array.isArray(record.categoryPath)
      ? record.categoryPath.join(" > ")
      : "";
  return {
    product_entity_id: productEntityId,
    external_seed_id: externalSeedId || undefined,
    source_product_id: sourceProductId || externalSeedId || undefined,
    product_name: stringInput(record.title, record.name, record.product_name),
    brand: stringInput(brandRecord.name, record.brand_name, record.brand),
    category: stringInput(categoryPath, record.category, record.department),
    source_updated_at: stringInput(
      record.updated_at,
      record.updatedAt,
      record.last_modified,
      record.lastModified
    ),
  };
}

function extractGatewayDiscoveryProducts(json: Record<string, unknown>) {
  const data = readNestedRecord(json.data, json.payload);
  return readNestedArray(
    json.products,
    json.items,
    json.results,
    data.products,
    data.items,
    data.results
  );
}

function extractGatewayDiscoveryCursor(json: Record<string, unknown>) {
  const data = readNestedRecord(json.data, json.payload);
  const pagination = readNestedRecord(
    json.pagination,
    data.pagination,
    json.page_info,
    data.page_info,
    json.cursor_info,
    data.cursor_info
  );
  return stringInput(
    json.next_cursor,
    json.nextCursor,
    data.next_cursor,
    data.nextCursor,
    pagination.next_cursor,
    pagination.nextCursor,
    pagination.cursor
  );
}

function candidateHasMore(json: Record<string, unknown>, productCount: number, pageSize: number) {
  const data = readNestedRecord(json.data, json.payload);
  const pagination = readNestedRecord(
    json.pagination,
    data.pagination,
    json.page_info,
    data.page_info,
    json.cursor_info,
    data.cursor_info
  );
  if (typeof json.has_more === "boolean") return json.has_more;
  if (typeof data.has_more === "boolean") return data.has_more;
  if (typeof pagination.has_more === "boolean") return pagination.has_more;
  if (typeof pagination.hasMore === "boolean") return pagination.hasMore;
  if (typeof pagination.has_next_page === "boolean") return pagination.has_next_page;
  if (typeof pagination.hasNextPage === "boolean") return pagination.hasNextPage;
  if (stringInput(pagination.next_cursor, pagination.nextCursor)) return true;
  return productCount >= pageSize;
}

let productEntitySourceDbPoolPromise:
  | Promise<{ query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }>
  | null = null;

function configuredProductEntitySourceDatabaseUrl() {
  return (
    process.env.AGENT_CENTER_PRODUCT_ENTITY_SOURCE_DATABASE_URL ||
    process.env.AGENT_CENTER_EXTERNAL_SEED_DATABASE_URL ||
    process.env.PIVOTA_EXTERNAL_SEED_DATABASE_URL ||
    process.env.PIVOTA_BACKEND_DATABASE_URL ||
    ""
  ).trim();
}

async function getProductEntitySourceDbPool() {
  if (!productEntitySourceDbPoolPromise) {
    productEntitySourceDbPoolPromise = (async () => {
      const connectionString = configuredProductEntitySourceDatabaseUrl();
      if (!connectionString) {
        throw new Error(
          "backend_external_seeds sync requires AGENT_CENTER_PRODUCT_ENTITY_SOURCE_DATABASE_URL"
        );
      }
      const { Pool } = await import("pg");
      const sslEnabled =
        process.env.AGENT_CENTER_PRODUCT_ENTITY_SOURCE_DB_SSL === "true" ||
        (process.env.AGENT_CENTER_PRODUCT_ENTITY_SOURCE_DB_SSL !== "false" &&
          /sslmode=require/i.test(connectionString));
      return new Pool({
        connectionString,
        ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
        max: Number(process.env.AGENT_CENTER_PRODUCT_ENTITY_SOURCE_DB_POOL_MAX || 2),
      });
    })();
  }
  return productEntitySourceDbPoolPromise;
}

function productEntitySyncSource(input?: unknown): ProductEntityIndexSyncSource {
  const configured = stringInput(
    input,
    process.env.AGENT_CENTER_PRODUCT_ENTITY_INDEX_SYNC_SOURCE
  ).toLowerCase();
  if (configured === "backend_external_seeds" || configured === "external_seeds") {
    return "backend_external_seeds";
  }
  if (
    configured === "gateway_product_entity_index_feed" ||
    configured === "product_entity_index_feed" ||
    configured === "gateway_index_feed"
  ) {
    return "gateway_product_entity_index_feed";
  }
  return "gateway_discovery_feed";
}

function productEntityCandidateFromSourceDbRow(
  row: Record<string, unknown>
): ProductEntityIndexCandidate | null {
  const productEntityId = stringInput(
    row.product_entity_id,
    row.sellable_item_group_id,
    row.product_group_id
  );
  if (!isCanonicalProductEntityId(productEntityId)) return null;
  const seedData = readNestedRecord(row.seed_data);
  const snapshot = readNestedRecord(seedData.snapshot);
  const sourceProductId = stringInput(
    row.external_product_id,
    seedData.external_product_id,
    seedData.product_id,
    snapshot.product_id,
    row.external_seed_id
  );
  const externalSeedId = /^ext_[a-z0-9_]+$/i.test(sourceProductId)
    ? sourceProductId
    : stringInput(row.external_seed_id);
  return {
    product_entity_id: productEntityId,
    external_seed_id: externalSeedId || undefined,
    source_product_id: sourceProductId || externalSeedId || undefined,
    product_name: stringInput(row.product_name, row.title, seedData.title, snapshot.title),
    brand: stringInput(
      row.brand,
      seedData.brand,
      seedData.brand_name,
      seedData.vendor,
      snapshot.brand,
      snapshot.brand_name,
      snapshot.vendor
    ),
    category: stringInput(
      row.category,
      seedData.category,
      seedData.product_type,
      snapshot.category,
      snapshot.product_type
    ),
    source_updated_at: stringInput(row.source_updated_at, row.updated_at),
  };
}

function gatewayModules(raw: unknown) {
  const root = readNestedRecord(raw);
  const data = readNestedRecord(root.data, root.payload);
  return readNestedArray(root.modules, data.modules);
}

function gatewayModuleData(raw: unknown, moduleType: string) {
  const module = gatewayModules(raw).find((item) => {
    const record = readNestedRecord(item);
    return stringInput(record.type) === moduleType;
  });
  const record = readNestedRecord(module);
  return readNestedRecord(record.data);
}

function gatewayPdpPayload(raw: unknown) {
  const root = readNestedRecord(raw);
  const data = readNestedRecord(root.data, root.payload);
  const rootPdp = readNestedRecord(root.pdp);
  const dataPdp = readNestedRecord(data.pdp);
  const canonicalData = gatewayModuleData(raw, "canonical");
  return readNestedRecord(
    canonicalData.pdp_payload,
    canonicalData.pdpPayload,
    root.pdp_payload,
    root.pdpPayload,
    data.pdp_payload,
    data.pdpPayload,
    rootPdp.payload,
    dataPdp.payload
  );
}

function extractPdpProductRecord(raw: unknown): Record<string, unknown> {
  const root = readNestedRecord(raw);
  const data = readNestedRecord(root.data, root.payload);
  const rootPdp = readNestedRecord(root.pdp);
  const dataPdp = readNestedRecord(data.pdp);
  const pdpPayload = gatewayPdpPayload(raw);
  return readNestedRecord(
    root.product,
    data.product,
    rootPdp.product,
    dataPdp.product,
    pdpPayload.product
  );
}

function collectPlainTextFromUnknown(value: unknown, maxParts = 24) {
  const parts: string[] = [];
  const visit = (item: unknown) => {
    if (parts.length >= maxParts || item == null) return;
    if (typeof item === "string" || typeof item === "number") {
      const text = stripHtmlText(String(item));
      if (text && text.length > 2) parts.push(text);
      return;
    }
    if (Array.isArray(item)) {
      item.slice(0, 20).forEach(visit);
      return;
    }
    if (typeof item === "object") {
      const record = item as Record<string, unknown>;
      for (const key of [
        "title",
        "name",
        "headline",
        "description",
        "summary",
        "overview",
        "body",
        "text",
        "label",
        "value",
      ]) {
        visit(record[key]);
      }
    }
  };
  visit(value);
  return unique(parts).join(" ");
}

function extractPdpContentSignals(raw: unknown, candidate: ProductEntityIndexCandidate) {
  const root = readNestedRecord(raw);
  const data = readNestedRecord(root.data, root.payload);
  const pdpPayload = gatewayPdpPayload(raw);
  const product = extractPdpProductRecord(raw);
  const brandRecord = readNestedRecord(product.brand);
  const productName = stringInput(
    product.title,
    product.name,
    data.title,
    data.name,
    candidate.product_name
  );
  const brand = stringInput(brandRecord.name, product.brand_name, product.brand, candidate.brand);
  const description = collectPlainTextFromUnknown([
    product.description,
    product.long_description,
    product.longDescription,
    product.overview,
    pdpPayload.modules,
    data.description,
    root.modules,
    data.modules,
  ]);
  const categoryPath = Array.isArray(product.category_path)
    ? product.category_path.join(" > ")
    : "";
  const category = stringInput(
    categoryPath,
    product.category,
    product.department,
    candidate.category
  );
  const sourceUpdatedAt = stringInput(
    product.updated_at,
    product.updatedAt,
    root.generated_at,
    root.generatedAt,
    data.updated_at,
    data.updatedAt,
    candidate.source_updated_at
  );
  const contentReady = Boolean(productName && brand && description.length >= 80);
  const weakContent = Boolean(productName && (brand || description));
  return {
    product_name: productName,
    brand,
    category,
    source_updated_at: sourceUpdatedAt,
    description_length: description.length,
    contentReady,
    weakContent,
  };
}

async function fetchMainPathPdpForIndex(candidate: ProductEntityIndexCandidate) {
  const lookupIds = unique([
    candidate.product_entity_id,
    candidate.external_seed_id || "",
    candidate.source_product_id || "",
  ].filter(Boolean));
  const failures: string[] = [];
  for (const productId of lookupIds) {
    try {
      const raw = await productEntityGatewayRequest("get_pdp_v2", {
        product_ref: { product_id: productId },
        include: [
          "offers",
          "variant_selector",
          "product_intel",
          "active_ingredients",
          "ingredients_inci",
          "product_overview",
          "supplemental_details",
          "similar",
        ],
        capabilities: {
          client: "agent_center_product_entity_index",
        },
      });
      const signals = extractPdpContentSignals(raw, candidate);
      if (signals.contentReady) {
        return {
          lookup_product_id: productId,
          status: "ready" as ProductEntityPdpContentStatus,
          signals,
          failure_reasons: failures,
        };
      }
      if (signals.weakContent) {
        failures.push(`${productId}: weak_content`);
      } else {
        failures.push(`${productId}: no_content`);
      }
    } catch (error) {
      failures.push(
        `${productId}: ${error instanceof Error ? error.message : "get_pdp_v2 failed"}`
      );
    }
  }
  const weak = failures.some((reason) => reason.includes("weak_content"));
  return {
    lookup_product_id: lookupIds[0],
    status: weak ? "weak_content" as const : "no_content" as const,
    signals: undefined,
    failure_reasons: failures.length ? failures : ["get_pdp_v2 returned no real PDP content"],
  };
}

function stripHtmlText(value: string) {
  return value
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function productEntityRecordPublicPayload(record: ProductEntityIndexRecord) {
  return {
    product_entity_id: record.product_entity_id,
    canonical_url: record.canonical_url,
    product_name: record.product_name,
    brand: record.brand,
    category: record.category,
    source_updated_at: record.source_updated_at,
    updated_at: record.updated_at || record.created_at,
    external_seed_id: record.external_seed_id,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    })
  );
  return results;
}

export class ProductEntityIndexRegistryService {
  list(input: { sitemap_eligible?: boolean; limit?: number } = {}) {
    const records = [...getAgentCenterState().productEntityIndexRecords]
      .sort((left, right) => {
        const leftTime = new Date(left.updated_at || left.created_at).getTime();
        const rightTime = new Date(right.updated_at || right.created_at).getTime();
        return rightTime - leftTime;
      })
      .filter((record) =>
        typeof input.sitemap_eligible === "boolean"
          ? record.sitemap_eligible === input.sitemap_eligible
          : true
      );
    return typeof input.limit === "number" ? records.slice(0, input.limit) : records;
  }

  publicSitemapEntries(input: { limit?: number } = {}) {
    return this.list({ sitemap_eligible: true, limit: input.limit }).map(
      productEntityRecordPublicPayload
    );
  }

  summary() {
    const records = getAgentCenterState().productEntityIndexRecords;
    const byReason = new Map<string, number>();
    for (const record of records) {
      for (const reason of record.failure_reasons || []) {
        const key = String(reason).split(":")[0] || "unknown";
        byReason.set(key, (byReason.get(key) || 0) + 1);
      }
    }
    return {
      total_candidates: records.length,
      pdp_content_ready: records.filter((record) => record.pdp_content_status === "ready").length,
      content_verification_pending: records.filter(
        (record) =>
          record.pdp_content_status !== "ready" &&
          !record.last_content_verified_at
      ).length,
      sitemap_eligible: records.filter((record) => record.sitemap_eligible).length,
      indexability_ready: records.filter((record) => record.indexability_status === "ready").length,
      indexability_audit_pending: records.filter(
        (record) =>
          record.pdp_content_status === "ready" &&
          !record.last_indexability_audit_at
      ).length,
      google_indexed: records.filter((record) => record.google_index_status === "indexed").length,
      gemini_found: records.filter((record) => record.gemini_search_grounded_status === "found").length,
      search_grounded_pending: records.filter(
        (record) =>
          record.sitemap_eligible &&
          record.gemini_search_grounded_status === "not_tested"
      ).length,
      failures_by_reason: Object.fromEntries(byReason),
    };
  }

  listBatchRuns(input: { limit?: number } = {}) {
    const runs = [...getAgentCenterState().productEntityIndexBatchRuns].sort(
      (left, right) =>
        new Date(right.updated_at || right.created_at).getTime() -
        new Date(left.updated_at || left.created_at).getTime()
    );
    return typeof input.limit === "number" ? runs.slice(0, input.limit) : runs;
  }

  getBatchRun(runId: string) {
    const run = getAgentCenterState().productEntityIndexBatchRuns.find(
      (item) => item.id === runId
    );
    if (!run) throw new Error(`ProductEntity index batch run not found: ${runId}`);
    return run;
  }

  async runBatch(input: {
    run_id?: string;
    stage?: ProductEntityIndexBatchStage | "auto";
    sync_source?: string;
    source_market?: string;
    source_tool?: string;
    sync_limit?: number;
    page_size?: number;
    max_pages?: number;
    verify_limit?: number;
    audit_limit?: number;
    gemini_limit?: number;
    start_page?: number;
    cursor?: string;
    include_gemini?: boolean;
  } = {}) {
    const now = nowIso();
    const existing = input.run_id ? this.getBatchRun(input.run_id) : undefined;
    const run: ProductEntityIndexBatchRun = existing || {
      id: nextId("product_entity_index_batch"),
      status: "created",
      stage: "sync",
      stages_completed: [],
      next_page: input.start_page || 1,
      next_cursor: stringInput(input.cursor) || undefined,
      has_more: true,
      records_processed: 0,
      limits: {},
      created_at: now,
      updated_at: now,
    };
    const limits = {
      ...run.limits,
      sync_limit: Number(input.sync_limit || run.limits.sync_limit || 50),
      page_size: Number(input.page_size || run.limits.page_size || 50),
      max_pages: Number(input.max_pages || run.limits.max_pages || 1),
      sync_source: stringInput(input.sync_source, run.limits.sync_source),
      source_market: stringInput(input.source_market, run.limits.source_market),
      source_tool: stringInput(input.source_tool, run.limits.source_tool),
      verify_limit: Number(input.verify_limit || run.limits.verify_limit || 5),
      audit_limit: Number(input.audit_limit || run.limits.audit_limit || 5),
      gemini_limit: Number(input.gemini_limit || run.limits.gemini_limit || 5),
    };
    const stage =
      input.stage && input.stage !== "auto"
        ? input.stage
        : this.nextBatchStage(run, Boolean(input.include_gemini));
    run.status = "running";
    run.stage = stage;
    run.limits = limits;
    run.error = undefined;
    run.updated_at = nowIso();
    getAgentCenterRepository().upsert("productEntityIndexBatchRuns", run);

    try {
      let result: Record<string, unknown>;
      if (stage === "sync") {
        const syncResult = await this.sync({
          limit: limits.sync_limit,
          page_size: limits.page_size,
          max_pages: limits.max_pages,
          start_page: run.next_page || input.start_page || 1,
          cursor: run.next_cursor || stringInput(input.cursor) || undefined,
          source: limits.sync_source,
          market: limits.source_market,
          tool: limits.source_tool,
          verify_content: false,
        });
        run.next_page = syncResult.next_page;
        run.next_cursor = syncResult.next_cursor;
        run.has_more = syncResult.has_more;
        run.records_processed += syncResult.records_upserted;
        result = syncResult as unknown as Record<string, unknown>;
      } else if (stage === "verify_content") {
        const verifyResult = await this.verifyContent({
          limit: limits.verify_limit,
        });
        run.records_processed += verifyResult.records_verified;
        result = verifyResult as unknown as Record<string, unknown>;
      } else if (stage === "audit") {
        const auditResult = await this.audit({
          limit: limits.audit_limit,
        });
        run.records_processed += auditResult.records_audited;
        result = auditResult as unknown as Record<string, unknown>;
      } else {
        const rerunResult = await this.runSearchGroundedBatch({
          limit: limits.gemini_limit,
        });
        run.records_processed += Number(rerunResult.records_tested || 0);
        result = rerunResult as unknown as Record<string, unknown>;
      }
      run.status = "completed";
      run.completed_at = nowIso();
      run.updated_at = run.completed_at;
      run.stages_completed = unique([...run.stages_completed, stage]) as ProductEntityIndexBatchStage[];
      run.last_result = this.compactBatchResult(result);
      run.result_summary = {
        ...this.summary(),
        next_recommended_stage: this.nextBatchStage(run, Boolean(input.include_gemini)),
      };
      getAgentCenterRepository().upsert("productEntityIndexBatchRuns", run);
      return run;
    } catch (error) {
      run.status = "failed";
      run.error = error instanceof Error ? error.message : "ProductEntity index batch failed";
      run.updated_at = nowIso();
      getAgentCenterRepository().upsert("productEntityIndexBatchRuns", run);
      return run;
    }
  }

  private nextBatchStage(
    run: Pick<ProductEntityIndexBatchRun, "has_more" | "stages_completed">,
    includeGemini: boolean
  ): ProductEntityIndexBatchStage {
    const summary = this.summary();
    if (
      run.has_more !== false ||
      !run.stages_completed.includes("sync")
    ) {
      return "sync";
    }
    if (summary.content_verification_pending > 0) return "verify_content";
    if (summary.indexability_audit_pending > 0) return "audit";
    if (includeGemini && summary.search_grounded_pending > 0) {
      return "gemini_rerun";
    }
    return "audit";
  }

  private compactBatchResult(result: Record<string, unknown>) {
    const output = { ...result };
    delete output.records;
    delete output.results;
    return output;
  }

  async sync(input: {
    limit?: number;
    page_size?: number;
    max_pages?: number;
    start_page?: number;
    cursor?: string;
    source?: string;
    market?: string;
    tool?: string;
    verify_content?: boolean;
  } = {}) {
    const source = productEntitySyncSource(input.source);
    if (source === "backend_external_seeds") {
      return this.syncFromBackendExternalSeeds(input);
    }
    if (source === "gateway_product_entity_index_feed") {
      return this.syncFromGatewayProductEntityIndexFeed(input);
    }
    const limit = Math.max(1, Math.min(Number(input.limit || 250), 5000));
    const pageSize = Math.max(1, Math.min(Number(input.page_size || 100), 250));
    const maxPages = Math.max(1, Math.min(Number(input.max_pages || 50), 200));
    const verifyContent = input.verify_content !== false;
    const candidates = new Map<string, ProductEntityIndexCandidate>();
    let cursor = stringInput(input.cursor);
    let page = Math.max(1, Number(input.start_page || 1));
    let pagesFetched = 0;
    const syncErrors: string[] = [];
    let hasMore = false;

    while (candidates.size < limit && pagesFetched < maxPages) {
      try {
        const json = (await productEntityGatewayRequest("get_discovery_feed", {
          surface: "browse_products",
          page,
          limit: pageSize,
          context: {
            auth_state: "anonymous",
            locale: "en-US",
            recent_views: [],
            recent_queries: [],
          },
          ...(cursor ? { cursor } : {}),
        })) as Record<string, unknown>;
        const products = extractGatewayDiscoveryProducts(json);
        for (const item of products) {
          const candidate = productEntityCandidateFromGatewayItem(item);
          if (!candidate) continue;
          const existing = candidates.get(candidate.product_entity_id);
          candidates.set(candidate.product_entity_id, {
            ...existing,
            ...candidate,
            external_seed_id: existing?.external_seed_id || candidate.external_seed_id,
            source_product_id: existing?.source_product_id || candidate.source_product_id,
          });
          if (candidates.size >= limit) break;
        }
        pagesFetched += 1;
        const nextCursor = extractGatewayDiscoveryCursor(json);
        hasMore = candidateHasMore(json, products.length, pageSize);
        if (!hasMore) break;
        cursor = nextCursor;
        page += 1;
        if (!cursor && products.length < pageSize) break;
      } catch (error) {
        syncErrors.push(error instanceof Error ? error.message : "get_discovery_feed failed");
        break;
      }
    }

    const upserted: ProductEntityIndexRecord[] = [];
    for (const candidate of candidates.values()) {
      upserted.push(await this.upsertCandidate(candidate, verifyContent));
    }

    return {
      source,
      pages_fetched: pagesFetched,
      candidates_seen: candidates.size,
      records_upserted: upserted.length,
      sitemap_eligible: upserted.filter((record) => record.sitemap_eligible).length,
      next_page: page,
      next_cursor: cursor || undefined,
      has_more: hasMore,
      sync_errors: syncErrors,
      records: upserted,
      summary: this.summary(),
    };
  }

  private async syncFromGatewayProductEntityIndexFeed(input: {
    limit?: number;
    page_size?: number;
    max_pages?: number;
    start_page?: number;
    cursor?: string;
    market?: string;
    tool?: string;
    verify_content?: boolean;
  } = {}) {
    const limit = Math.max(1, Math.min(Number(input.limit || 250), 5000));
    const pageSize = Math.max(1, Math.min(Number(input.page_size || 100), 500));
    const maxPages = Math.max(1, Math.min(Number(input.max_pages || 50), 200));
    const verifyContent = input.verify_content !== false;
    const market = stringInput(
      input.market,
      process.env.AGENT_CENTER_PRODUCT_ENTITY_SOURCE_MARKET,
      "US"
    );
    const tool = stringInput(
      input.tool,
      process.env.AGENT_CENTER_PRODUCT_ENTITY_SOURCE_TOOL,
      "creator_agents"
    );
    const candidates = new Map<string, ProductEntityIndexCandidate>();
    let cursor = stringInput(input.cursor);
    let page = Math.max(1, Number(input.start_page || 1));
    let pagesFetched = 0;
    const syncErrors: string[] = [];
    let hasMore = false;

    while (candidates.size < limit && pagesFetched < maxPages) {
      try {
        const json = (await productEntityGatewayRequest("get_product_entity_index_feed", {
          page,
          limit: pageSize,
          market,
          tool,
          ...(cursor ? { cursor } : {}),
        })) as Record<string, unknown>;
        const products = extractGatewayDiscoveryProducts(json);
        for (const item of products) {
          const candidate = productEntityCandidateFromGatewayItem(item);
          if (!candidate) continue;
          const existing = candidates.get(candidate.product_entity_id);
          candidates.set(candidate.product_entity_id, {
            ...existing,
            ...candidate,
            external_seed_id: existing?.external_seed_id || candidate.external_seed_id,
            source_product_id: existing?.source_product_id || candidate.source_product_id,
          });
          if (candidates.size >= limit) break;
        }
        pagesFetched += 1;
        const nextCursor = extractGatewayDiscoveryCursor(json);
        hasMore = candidateHasMore(json, products.length, pageSize);
        if (!hasMore) break;
        cursor = nextCursor;
        page += 1;
        if (!cursor && products.length < pageSize) break;
      } catch (error) {
        syncErrors.push(
          error instanceof Error
            ? error.message
            : "get_product_entity_index_feed failed"
        );
        break;
      }
    }

    const upserted: ProductEntityIndexRecord[] = [];
    for (const candidate of candidates.values()) {
      upserted.push(await this.upsertCandidate(candidate, verifyContent));
    }

    return {
      source: "gateway_product_entity_index_feed",
      pages_fetched: pagesFetched,
      candidates_seen: candidates.size,
      records_upserted: upserted.length,
      sitemap_eligible: upserted.filter((record) => record.sitemap_eligible).length,
      next_page: page,
      next_cursor: cursor || undefined,
      has_more: hasMore,
      sync_errors: syncErrors,
      records: upserted,
      summary: this.summary(),
    };
  }

  private async syncFromBackendExternalSeeds(input: {
    limit?: number;
    page_size?: number;
    max_pages?: number;
    start_page?: number;
    market?: string;
    tool?: string;
    verify_content?: boolean;
  } = {}) {
    const limit = Math.max(1, Math.min(Number(input.limit || 250), 5000));
    const pageSize = Math.max(1, Math.min(Number(input.page_size || 100), 500));
    const maxPages = Math.max(1, Math.min(Number(input.max_pages || 50), 200));
    const verifyContent = input.verify_content !== false;
    const market = stringInput(
      input.market,
      process.env.AGENT_CENTER_PRODUCT_ENTITY_SOURCE_MARKET,
      "US"
    );
    const tool = stringInput(
      input.tool,
      process.env.AGENT_CENTER_PRODUCT_ENTITY_SOURCE_TOOL,
      "creator_agents"
    );
    const pool = await getProductEntitySourceDbPool();
    const candidates = new Map<string, ProductEntityIndexCandidate>();
    let page = Math.max(1, Number(input.start_page || 1));
    let pagesFetched = 0;
    let hasMore = false;
    const syncErrors: string[] = [];

    while (candidates.size < limit && pagesFetched < maxPages) {
      const offset = Math.max(0, (page - 1) * pageSize);
      try {
        const result = await pool.query(
          `
            WITH source_rows AS (
              SELECT
                eps.id::text AS external_seed_row_id,
                eps.external_product_id,
                eps.destination_url,
                eps.canonical_url,
                eps.domain,
                eps.title,
                eps.seed_data,
                eps.updated_at,
                coalesce(
                  nullif(eps.external_product_id, ''),
                  nullif(eps.seed_data->>'external_product_id', ''),
                  nullif(eps.seed_data->>'product_id', ''),
                  nullif(eps.seed_data->'snapshot'->>'product_id', ''),
                  nullif(eps.canonical_url, ''),
                  nullif(eps.destination_url, ''),
                  concat('row:', eps.id::text)
                ) AS source_product_id
              FROM external_product_seeds eps
              WHERE eps.status = 'active'
                AND eps.market = $1
                AND ($2 = '*' OR eps.tool = $2 OR eps.tool = '*' OR eps.tool IS NULL OR eps.tool = '')
                AND coalesce(lower(eps.seed_data#>>'{suppression_flags,exclude_from_recall}'), 'false') <> 'true'
                AND coalesce(lower(eps.seed_data#>>'{derived,recall,suppression_flags,exclude_from_recall}'), 'false') <> 'true'
            ),
            mapped AS (
              SELECT DISTINCT ON (pil.sellable_item_group_id, source_rows.source_product_id)
                pil.sellable_item_group_id AS product_entity_id,
                source_rows.source_product_id,
                source_rows.external_seed_row_id,
                source_rows.external_product_id,
                source_rows.title AS product_name,
                coalesce(
                  source_rows.seed_data->>'brand',
                  source_rows.seed_data->'snapshot'->>'brand',
                  source_rows.seed_data->>'vendor',
                  source_rows.seed_data->'snapshot'->>'vendor',
                  ''
                ) AS brand,
                coalesce(
                  source_rows.seed_data->>'category',
                  source_rows.seed_data->'snapshot'->>'category',
                  source_rows.seed_data->>'product_type',
                  source_rows.seed_data->'snapshot'->>'product_type',
                  ''
                ) AS category,
                source_rows.seed_data,
                source_rows.updated_at AS source_updated_at,
                pil.updated_at AS identity_updated_at
              FROM source_rows
              JOIN pdp_identity_listing pil
                ON pil.source_listing_ref = 'external_seed:' || source_rows.source_product_id
               AND pil.identity_status = 'approved'
               AND pil.live_read_enabled = true
              WHERE pil.sellable_item_group_id LIKE 'sig\\_%' ESCAPE '\\'
              ORDER BY
                pil.sellable_item_group_id,
                source_rows.source_product_id,
                pil.identity_confidence DESC NULLS LAST,
                pil.updated_at DESC NULLS LAST,
                source_rows.updated_at DESC NULLS LAST
            )
            SELECT *
            FROM mapped
            ORDER BY
              coalesce(identity_updated_at, source_updated_at) DESC NULLS LAST,
              product_entity_id ASC
            LIMIT $3
            OFFSET $4
          `,
          [market, tool, pageSize, offset]
        );
        const rows = Array.isArray(result.rows) ? result.rows : [];
        for (const row of rows) {
          const candidate = productEntityCandidateFromSourceDbRow(row);
          if (!candidate) continue;
          const existing = candidates.get(candidate.product_entity_id);
          candidates.set(candidate.product_entity_id, {
            ...existing,
            ...candidate,
            external_seed_id: existing?.external_seed_id || candidate.external_seed_id,
            source_product_id: existing?.source_product_id || candidate.source_product_id,
          });
          if (candidates.size >= limit) break;
        }
        pagesFetched += 1;
        hasMore = rows.length >= pageSize;
        page += 1;
        if (!hasMore) break;
      } catch (error) {
        syncErrors.push(
          error instanceof Error ? error.message : "backend external seed sync failed"
        );
        break;
      }
    }

    const upserted: ProductEntityIndexRecord[] = [];
    for (const candidate of candidates.values()) {
      upserted.push(await this.upsertCandidate(candidate, verifyContent));
    }

    return {
      source: "backend_external_seeds",
      pages_fetched: pagesFetched,
      candidates_seen: candidates.size,
      records_upserted: upserted.length,
      sitemap_eligible: upserted.filter((record) => record.sitemap_eligible).length,
      next_page: page,
      has_more: hasMore,
      sync_errors: syncErrors,
      records: upserted,
      summary: this.summary(),
    };
  }

  async verifyContent(input: {
    product_entity_ids?: string[];
    limit?: number;
    concurrency?: number;
    include_previously_verified?: boolean;
  } = {}) {
    const requestedIds = new Set(arrayOfStringInput(input.product_entity_ids));
    const limit = Math.max(1, Math.min(Number(input.limit || 10), 100));
    const concurrency = Math.max(
      1,
      Math.min(
        Number(
          input.concurrency ||
            process.env.AGENT_CENTER_PRODUCT_ENTITY_VERIFY_CONCURRENCY ||
            5
        ),
        10
      )
    );
    const records = this.list()
      .filter((record) =>
        requestedIds.size ? requestedIds.has(record.product_entity_id) : true
      )
      .filter((record) =>
        requestedIds.size
          ? true
          : record.pdp_content_status !== "ready" &&
            (input.include_previously_verified || !record.last_content_verified_at)
      )
      .sort((left, right) =>
        String(left.last_content_verified_at || "").localeCompare(
          String(right.last_content_verified_at || "")
        )
      )
      .slice(0, limit);
    const verified = await mapWithConcurrency(records, concurrency, (record) =>
      this.upsertCandidate(
        {
          product_entity_id: record.product_entity_id,
          external_seed_id: record.external_seed_id,
          source_product_id: record.source_product_id || record.external_seed_id,
          product_name: record.product_name,
          brand: record.brand,
          category: record.category,
          source_updated_at: record.source_updated_at,
        },
        true
      )
    );
    return {
      records_verified: verified.length,
      pdp_content_ready: verified.filter((record) => record.pdp_content_status === "ready").length,
      records: verified,
      summary: this.summary(),
    };
  }

  async audit(input: {
    product_entity_ids?: string[];
    limit?: number;
    include_previously_audited?: boolean;
  } = {}) {
    const requestedIds = new Set(arrayOfStringInput(input.product_entity_ids));
    const limit = Math.max(1, Math.min(Number(input.limit || 50), 250));
    const records = this.list()
      .filter((record) =>
        requestedIds.size ? requestedIds.has(record.product_entity_id) : true
      )
      .filter((record) =>
        requestedIds.size
          ? true
          : record.pdp_content_status === "ready" &&
            (input.include_previously_audited || !record.last_indexability_audit_at)
      )
      .sort((left, right) =>
        String(left.last_indexability_audit_at || "").localeCompare(
          String(right.last_indexability_audit_at || "")
        )
      )
      .slice(0, limit);
    const auditService = new PivotaPDPIndexabilityAuditService();
    const audited: ProductEntityIndexRecord[] = [];
    for (const record of records) {
      const audit = await auditService.audit({
        url: record.canonical_url,
        product_name: record.product_name || "",
        brand: record.brand || "",
        product_entity_id: record.product_entity_id,
        canonical_pivota_pdp_url: record.canonical_url,
        external_seed_id: record.external_seed_id,
        merchant_pdp_url: "",
        offers_exist: true,
      });
      const findingTypes = audit.findings.map((finding) => finding.finding_type);
      const blockingFindings = findingTypes.filter(
        (finding) => finding !== "missing_sitemap_entry"
      );
      const indexabilityStatus: ProductEntityIndexabilityStatus =
        audit.audit_status === "passed" || blockingFindings.length === 0
          ? "ready"
          : audit.audit_status === "failed"
            ? "failed"
            : "needs_work";
      const nextRecord: ProductEntityIndexRecord = {
        ...record,
        indexability_status: indexabilityStatus,
        sitemap_eligible:
          record.pdp_content_status === "ready" && indexabilityStatus === "ready",
        failure_reasons: unique([
          ...record.failure_reasons.filter((reason) => !reason.startsWith("audit:")),
          ...findingTypes.map((finding) => `audit:${finding}`),
        ]),
        audit_evidence: audit.raw_safe_evidence,
        last_indexability_audit_at: nowIso(),
        updated_at: nowIso(),
      };
      getAgentCenterRepository().upsert("productEntityIndexRecords", nextRecord);
      audited.push(nextRecord);
    }
    return {
      records_audited: audited.length,
      sitemap_eligible: audited.filter((record) => record.sitemap_eligible).length,
      records: audited,
      summary: this.summary(),
    };
  }

  updateGeminiMeasurement(input: {
    product_entity_id: string;
    score: VisibilityScoreValue;
    returned_urls?: string[];
    error?: string;
  }) {
    const record = this.get(input.product_entity_id);
    const nextRecord: ProductEntityIndexRecord = {
      ...record,
      gemini_search_grounded_status:
        typeof input.score === "number" && input.score > 0
          ? "found"
          : input.error
            ? "error"
            : "not_found",
      last_search_grounded_score: input.score,
      last_search_grounded_at: nowIso(),
      last_returned_urls: input.returned_urls || [],
      failure_reasons: input.error
        ? unique([...(record.failure_reasons || []), `gemini:${input.error}`])
        : record.failure_reasons,
      updated_at: nowIso(),
    };
    getAgentCenterRepository().upsert("productEntityIndexRecords", nextRecord);
    return nextRecord;
  }

  async runSearchGroundedBatch(input: {
    product_entity_ids?: string[];
    limit?: number;
    include_previously_tested?: boolean;
  } = {}) {
    if (!geminiSearchGroundingConfigured()) {
      return {
        status: "not_configured",
        records_tested: 0,
        results: [],
      };
    }
    const requestedIds = new Set(arrayOfStringInput(input.product_entity_ids));
    const limit = Math.max(1, Math.min(Number(input.limit || 25), 100));
    const records = this.list({ sitemap_eligible: true })
      .filter((record) =>
        requestedIds.size ? requestedIds.has(record.product_entity_id) : true
      )
      .filter((record) =>
        requestedIds.size || input.include_previously_tested
          ? true
          : record.gemini_search_grounded_status === "not_tested"
      )
      .slice(0, limit);
    const adapter = new GeminiProviderAdapter();
    const results: Array<Record<string, unknown>> = [];
    for (const record of records) {
      const product: ProductRecord = {
        id: record.product_entity_id,
        product_entity_id: record.product_entity_id,
        external_seed_id: record.external_seed_id,
        external_seed_ids: record.external_seed_ids,
        canonical_url: record.canonical_url,
        canonical_product_name: record.product_name,
        sku: record.product_entity_id,
        title: record.product_name || record.product_entity_id,
        brand: record.brand || "Pivota",
        category: record.category || "Product",
        currency: "USD",
        pdp_url: "",
        attributes: {},
        pivota_attributes: {
          pivota_pdp_url: record.canonical_url,
          pivota_product_object_id: record.product_entity_id,
        },
      };
      const inputPayload: DemandTestInput = {
        merchantId: "pivota_internal",
        storeId: "pivota_product_entity_index",
        scanTargetId: `product_entity_index_${record.product_entity_id}`,
        queryClusterId: `product_entity_index_${record.product_entity_id}`,
        scanMode: "search_grounded_product_discovery_test",
        query: `Find the Pivota product page for ${record.brand || ""} ${record.product_name || record.product_entity_id}.`.replace(/\s+/g, " ").trim(),
        promptTemplateId: "product_entity_index_search_grounded_v1",
        prompt:
          "Use Google Search grounding to find public product pages for the named product. Return JSON with returned_urls, returned_domains, grounding_sources, grounding_search_queries, mentioned_products, mentioned_brands, and reasoning_summary. Do not assume or fabricate Pivota URLs.",
        provider: "gemini",
        model: DEFAULT_GEMINI_MODEL,
        language: "en",
        market: "US",
        currency: "USD",
        merchantContext: {
          store: {
            id: "pivota_product_entity_index",
            merchant_id: "pivota_internal",
            store_name: "Pivota ProductEntity Index",
            store_url: "https://agent.pivota.cc",
            platform: "custom",
            market: "US",
            language: "en",
            currency: "USD",
            integration_status: "connected",
            primary_category: record.category,
            products: [product],
            created_at: nowIso(),
          },
          product,
        },
        competitorContext: { brands: [], products: [] },
        outputSchema: PARSED_RECOMMENDATION_SCHEMA,
        repetitionIndex: 1,
      };
      try {
        const raw = await adapter.runDemandTest(inputPayload);
        const parsed = parseProviderOutput(raw, inputPayload);
        const returnedUrls = unique([
          ...(parsed.returned_urls || []),
          ...(parsed.grounding_sources || []),
        ]);
        const score = this.returnedUrlsIncludeExpected(record, returnedUrls) ? 100 : 0;
        const updated = this.updateGeminiMeasurement({
          product_entity_id: record.product_entity_id,
          score,
          returned_urls: returnedUrls,
        });
        results.push({
          product_entity_id: record.product_entity_id,
          search_grounded_pivota_pdp_discovery_score: score,
          returned_urls: returnedUrls,
          grounding_search_queries: parsed.grounding_search_queries || [],
          found: score > 0,
          updated_record: updated.id,
        });
      } catch (error) {
        this.updateGeminiMeasurement({
          product_entity_id: record.product_entity_id,
          score: "not_tested",
          returned_urls: [],
          error: error instanceof Error ? error.message : "Gemini rerun failed",
        });
        results.push({
          product_entity_id: record.product_entity_id,
          error: error instanceof Error ? error.message : "Gemini rerun failed",
        });
      }
    }
    return {
      status: "completed",
      records_tested: results.length,
      results,
      summary: this.summary(),
    };
  }

  get(productEntityId: string) {
    const record = getAgentCenterState().productEntityIndexRecords.find(
      (item) => item.product_entity_id === productEntityId || item.id === productEntityId
    );
    if (!record) throw new Error(`ProductEntity index record not found: ${productEntityId}`);
    return record;
  }

  private async upsertCandidate(
    candidate: ProductEntityIndexCandidate,
    verifyContent: boolean
  ) {
    const now = nowIso();
    const existing = getAgentCenterState().productEntityIndexRecords.find(
      (record) => record.product_entity_id === candidate.product_entity_id
    );
    let contentStatus: ProductEntityPdpContentStatus =
      existing?.pdp_content_status || "no_content";
    let failureReasons = existing?.failure_reasons || [];
    let productName = candidate.product_name || existing?.product_name;
    let brand = candidate.brand || existing?.brand;
    let category = candidate.category || existing?.category;
    let sourceUpdatedAt = candidate.source_updated_at || existing?.source_updated_at;
    let lastContentVerifiedAt = existing?.last_content_verified_at;

    if (verifyContent) {
      const content = await fetchMainPathPdpForIndex(candidate);
      contentStatus = content.status;
      failureReasons = content.failure_reasons;
      if (content.signals) {
        productName = content.signals.product_name || productName;
        brand = content.signals.brand || brand;
        category = content.signals.category || category;
        sourceUpdatedAt = content.signals.source_updated_at || sourceUpdatedAt;
      }
      lastContentVerifiedAt = now;
    }

    const canonicalUrl = normalizeProductEntityIndexCanonicalUrl(
      existing?.canonical_url,
      candidate.product_entity_id
    );
    const indexabilityStatus =
      contentStatus === "ready"
        ? existing?.indexability_status || "not_audited"
        : "not_audited";
    const sitemapEligible =
      contentStatus === "ready" && existing?.indexability_status === "ready";
    const record: ProductEntityIndexRecord = {
      id: productEntityIndexRecordId(candidate.product_entity_id),
      product_entity_id: candidate.product_entity_id,
      canonical_url: canonicalUrl,
      external_seed_id: candidate.external_seed_id || existing?.external_seed_id,
      external_seed_ids: unique([
        ...(existing?.external_seed_ids || []),
        candidate.external_seed_id || "",
      ].filter(Boolean)),
      source_product_id: candidate.source_product_id || existing?.source_product_id,
      product_name: productName,
      brand,
      category,
      source_updated_at: sourceUpdatedAt,
      last_content_verified_at: lastContentVerifiedAt,
      pdp_content_status: contentStatus,
      indexability_status: indexabilityStatus,
      sitemap_eligible: sitemapEligible,
      google_index_status: existing?.google_index_status || "unknown",
      gemini_search_grounded_status:
        existing?.gemini_search_grounded_status || "not_tested",
      last_search_grounded_score: existing?.last_search_grounded_score,
      last_search_grounded_at: existing?.last_search_grounded_at,
      last_returned_urls: existing?.last_returned_urls || [],
      last_indexability_audit_at: existing?.last_indexability_audit_at,
      failure_reasons: failureReasons,
      audit_evidence: existing?.audit_evidence,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    getAgentCenterRepository().upsert("productEntityIndexRecords", record);
    return record;
  }

  private returnedUrlsIncludeExpected(
    record: ProductEntityIndexRecord,
    returnedUrls: string[]
  ) {
    const canonical = normalizeUrlForCompare(record.canonical_url);
    const aliasIds = new Set([
      record.external_seed_id,
      ...(record.external_seed_ids || []),
    ].filter(Boolean).map((item) => String(item).toLowerCase()));
    return returnedUrls.some((url) => {
      if (normalizeUrlForCompare(url) === canonical) return true;
      const returnedId = extractPivotaProductObjectId(url);
      return Boolean(
        returnedId &&
          /^ext_/i.test(returnedId) &&
          aliasIds.has(returnedId.toLowerCase())
      );
    });
  }
}

function canonicalPivotaPdpUrlForIssue(issue: AgenticGMVIssue) {
  const evidence = issue.evidence || {};
  const candidates = [
    evidence.canonical_pivota_pdp_url,
    evidence.expected_pivota_pdp_url,
    evidence.pivota_pdp_url,
    evidence.verified_url,
  ]
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean);
  const canonical = candidates.find((value) => !/\/products\/ext_/i.test(value));
  if (canonical) return canonical;
  const productEntityId = issue.affected_product_entities[0];
  return productEntityId
    ? `https://agent.pivota.cc/products/${productEntityId}`
    : "";
}

function addHoursIso(baseIso: string, hours: number) {
  return new Date(new Date(baseIso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

export class PivotaIndexingTaskService {
  create(input: {
    product_entity_id?: string;
    canonical_pivota_pdp_url?: string;
    task_type?: PivotaIndexingTaskType;
    status?: PivotaIndexingTaskStatus;
    evidence?: PivotaIndexingTaskEvidence;
  }) {
    if (!input.product_entity_id) {
      throw new Error("product_entity_id is required");
    }
    if (!input.canonical_pivota_pdp_url) {
      throw new Error("canonical_pivota_pdp_url is required");
    }
    if (!input.task_type) {
      throw new Error("task_type is required");
    }
    const now = nowIso();
    const task: PivotaIndexingTask = {
      id: nextId("pivota_indexing_task"),
      product_entity_id: input.product_entity_id,
      canonical_pivota_pdp_url: input.canonical_pivota_pdp_url,
      task_type: input.task_type,
      status: input.status || "proposed",
      evidence: this.normalizeEvidence(input.evidence || {}),
      created_at: now,
      updated_at: now,
      completed_at: input.status === "completed" ? now : undefined,
    };
    this.validateCompletion(task);
    getAgentCenterRepository().upsert("pivotaIndexingTasks", task);
    this.ensureTimedRerunTasks(task);
    return task;
  }

  get(taskId: string) {
    const task = getAgentCenterState().pivotaIndexingTasks.find(
      (item) => item.id === taskId
    );
    if (!task) throw new Error(`Pivota indexing task not found: ${taskId}`);
    return task;
  }

  update(
    taskId: string,
    patch: {
      status?: PivotaIndexingTaskStatus;
      evidence?: PivotaIndexingTaskEvidence;
    }
  ) {
    const task = this.get(taskId);
    const nextTask: PivotaIndexingTask = {
      ...task,
      status: patch.status || task.status,
      evidence: patch.evidence
        ? {
            ...(task.evidence || {}),
            ...this.normalizeEvidence(patch.evidence),
          }
        : task.evidence,
      completed_at:
        patch.status === "completed" && !task.completed_at
          ? nowIso()
          : task.completed_at,
    };
    this.validateCompletion(nextTask);
    task.status = nextTask.status;
    task.completed_at = nextTask.completed_at;
    task.evidence = nextTask.evidence;
    touch(task);
    getAgentCenterRepository().upsert("pivotaIndexingTasks", task);
    this.ensureTimedRerunTasks(task);
    return task;
  }

  list(input: { product_entity_id?: string } = {}) {
    const tasks = getAgentCenterState().pivotaIndexingTasks;
    return input.product_entity_id
      ? tasks.filter((task) => task.product_entity_id === input.product_entity_id)
      : [...tasks];
  }

  summaries(input: { product_entity_id?: string } = {}) {
    const productEntityIds = unique(
      this.list(input).map((task) => task.product_entity_id)
    );
    return productEntityIds.map((productEntityId) => this.summary(productEntityId));
  }

  summary(productEntityId: string) {
    const tasks = this.list({ product_entity_id: productEntityId }).sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    );
    const latestDiscovery = this.latestSearchGroundedDiscovery(productEntityId);
    const nextRerunTime = tasks
      .filter(
        (task) =>
          ["proposed", "in_progress"].includes(task.status) &&
          typeof task.evidence?.next_rerun_at === "string"
      )
      .map((task) => task.evidence?.next_rerun_at as string)
      .sort()[0];
    const currentStatus = this.currentStatus(tasks);
    const indexingEvidenceStatus = this.indexingEvidenceStatus(
      tasks,
      latestDiscovery.uplift_claim_allowed,
      latestDiscovery.last_search_grounded_discovery_score,
      nextRerunTime
    );
    return {
      product_entity_id: productEntityId,
      canonical_pivota_pdp_url:
        tasks[0]?.canonical_pivota_pdp_url ||
        latestDiscovery.canonical_pivota_pdp_url ||
        "",
      current_status: currentStatus,
      indexing_evidence_status: indexingEvidenceStatus,
      next_recommended_operator_action:
        this.nextRecommendedOperatorAction(indexingEvidenceStatus),
      task_count: tasks.length,
      tasks,
      next_rerun_time: nextRerunTime,
      next_rerun_at: nextRerunTime,
      last_search_grounded_discovery_score:
        latestDiscovery.last_search_grounded_discovery_score,
      last_returned_urls: latestDiscovery.last_returned_urls,
      uplift_claim_allowed: latestDiscovery.uplift_claim_allowed,
    };
  }

  generateForIssue(issueId: string) {
    const issue = findIssue(issueId);
    if (issue.issue_type !== "pivota_pdp_not_discovered") return [];
    const productEntityId = issue.affected_product_entities[0];
    const canonicalUrl = canonicalPivotaPdpUrlForIssue(issue);
    if (!productEntityId || !canonicalUrl) return [];

    const state = getAgentCenterState();
    const createdAt = nowIso();
    const taskSpecs: Array<{
      taskType: PivotaIndexingTaskType;
      rerunWindow?: (typeof PIVOTA_DISCOVERY_RERUN_WINDOWS)[number];
    }> = [];
    for (const taskType of PIVOTA_DISCOVERY_INDEXING_TASKS) {
      if (taskType === "wait_for_indexing_window") {
        taskSpecs.push(...PIVOTA_DISCOVERY_RERUN_WINDOWS.map((window) => ({
          taskType,
          rerunWindow: window,
        })));
        continue;
      }
      if (taskType === "scheduled_search_grounded_rerun") {
        taskSpecs.push(...PIVOTA_DISCOVERY_RERUN_WINDOWS.map((window) => ({
          taskType,
          rerunWindow: window,
        })));
        continue;
      }
      taskSpecs.push({ taskType });
    }

    return taskSpecs.map(({ taskType, rerunWindow }) => {
      const existing = state.pivotaIndexingTasks.find(
        (task) =>
          task.product_entity_id === productEntityId &&
          task.task_type === taskType &&
          task.evidence?.issue_id === issue.id &&
          (task.evidence?.rerun_window || "") === (rerunWindow?.label || "")
      );
      if (existing) return existing;
      return this.create({
        product_entity_id: productEntityId,
        canonical_pivota_pdp_url: canonicalUrl,
        task_type: taskType,
        evidence: {
          issue_id: issue.id,
          issue_type: issue.issue_type,
          scan_target_id: issue.scan_target_id,
          no_uplift_claim_allowed: true,
          uplift_claim_allowed: false,
          search_grounded_score: issue.evidence?.search_grounded_pivota_pdp_discovery_score,
          rerun_window: rerunWindow?.label,
          delay_hours: rerunWindow?.hours,
          next_rerun_at: rerunWindow
            ? addHoursIso(createdAt, rerunWindow.hours)
            : undefined,
          operator_note:
            "Complete public indexing/discoverability work before rerunning search-grounded discovery.",
        },
      });
    });
  }

  private normalizeEvidence(evidence: PivotaIndexingTaskEvidence) {
    const normalized = { ...evidence };
    if (normalized.indexing_requested && !normalized.indexing_requested_at) {
      normalized.indexing_requested_at = nowIso();
    }
    if (
      normalized.search_console_property_verified &&
      !normalized.search_console_verified_at
    ) {
      normalized.search_console_verified_at = nowIso();
    }
    return normalized;
  }

  private validateCompletion(task: PivotaIndexingTask) {
    if (task.status !== "completed") return;
    const evidence = task.evidence || {};
    if (
      task.task_type === "validate_search_console" &&
      evidence.search_console_property_verified !== true
    ) {
      throw new Error(
        "validate_search_console cannot be completed until Search Console property verification is recorded"
      );
    }
    if (
      task.task_type === "submit_sitemap" &&
      evidence.sitemap_submitted !== true
    ) {
      throw new Error(
        "submit_sitemap cannot be completed until sitemap_submitted is true"
      );
    }
    if (task.task_type === "request_indexing") {
      const inspectionStatus = evidence.url_inspection_status || "not_checked";
      if (!INDEXING_REQUEST_ALLOWED_INSPECTION_STATUSES.has(inspectionStatus)) {
        throw new Error(
          "request_indexing cannot be completed until URL inspection is inspectable, indexed, or indexing_requested"
        );
      }
      if (evidence.indexing_requested !== true) {
        throw new Error(
          "request_indexing cannot be completed until indexing_requested is true"
        );
      }
    }
  }

  private currentStatus(tasks: PivotaIndexingTask[]) {
    if (!tasks.length) return "not_started";
    if (tasks.some((task) => task.status === "blocked")) return "blocked";
    if (tasks.some((task) => task.status === "in_progress")) return "in_progress";
    if (tasks.some((task) => task.status === "proposed")) return "proposed";
    if (tasks.every((task) => task.status === "skipped")) return "skipped";
    if (tasks.every((task) => task.status === "completed")) return "completed";
    return "in_progress";
  }

  private indexingEvidenceStatus(
    tasks: PivotaIndexingTask[],
    upliftClaimAllowed: boolean,
    lastScore: VisibilityScoreValue,
    nextRerunTime?: string
  ): PivotaIndexingEvidenceStatus {
    if (upliftClaimAllowed) return "uplift_verified";
    if (!tasks.length) return "not_started";
    const evidence = tasks.map((task) => task.evidence || {});
    const searchConsoleVerified = evidence.some(
      (item) => item.search_console_property_verified === true
    );
    if (!searchConsoleVerified) return "search_console_needed";
    const sitemapSubmitted = evidence.some(
      (item) => item.sitemap_submitted === true
    );
    if (!sitemapSubmitted) return "search_console_needed";
    const indexingRequested = evidence.some(
      (item) =>
        item.indexing_requested === true ||
        item.url_inspection_status === "indexing_requested"
    );
    if (!indexingRequested) return "sitemap_submitted";
    const now = Date.now();
    const rerunDue = tasks.some((task) => {
      if (task.task_type !== "scheduled_search_grounded_rerun") return false;
      if (!["proposed", "in_progress"].includes(task.status)) return false;
      const next = task.evidence?.next_rerun_at;
      return typeof next === "string" && new Date(next).getTime() <= now;
    });
    if (rerunDue) return "rerun_due";
    if (typeof lastScore === "number" && lastScore === 0) return "no_uplift_yet";
    if (nextRerunTime) return "waiting_for_indexing";
    return "indexing_requested";
  }

  private nextRecommendedOperatorAction(status: PivotaIndexingEvidenceStatus) {
    if (status === "not_started" || status === "search_console_needed") {
      return "Verify Search Console property for agent.pivota.cc.";
    }
    if (status === "sitemap_submitted") {
      return "Inspect the canonical Pivota PDP URL and request indexing when eligible.";
    }
    if (status === "indexing_requested" || status === "waiting_for_indexing") {
      return "Wait for the indexing window, then rerun search-grounded discovery.";
    }
    if (status === "rerun_due") {
      return "Rerun search_grounded_product_discovery_test only.";
    }
    if (status === "no_uplift_yet") {
      return "No uplift yet; continue public discoverability work and rerun after the next indexing window.";
    }
    if (status === "uplift_verified") {
      return "Uplift is verified in the tested validation scope; do not claim consumer Gemini UI ranking.";
    }
    return "Review indexing evidence and rerun search-grounded discovery.";
  }

  private indexingEvidenceReady(productEntityId: string) {
    const evidence = this.list({ product_entity_id: productEntityId }).map(
      (task) => task.evidence || {}
    );
    return (
      evidence.some((item) => item.search_console_property_verified === true) &&
      evidence.some((item) => item.sitemap_submitted === true) &&
      evidence.some(
        (item) =>
          item.indexing_requested === true ||
          item.url_inspection_status === "indexing_requested"
      )
    );
  }

  private ensureTimedRerunTasks(task: PivotaIndexingTask) {
    if (
      task.task_type === "wait_for_indexing_window" ||
      task.task_type === "scheduled_search_grounded_rerun"
    ) {
      return;
    }
    if (!this.indexingEvidenceReady(task.product_entity_id)) return;
    const existing = this.list({ product_entity_id: task.product_entity_id });
    const now = nowIso();
    for (const window of PIVOTA_DISCOVERY_RERUN_WINDOWS) {
      for (const taskType of [
        "wait_for_indexing_window",
        "scheduled_search_grounded_rerun",
      ] as PivotaIndexingTaskType[]) {
        const alreadyExists = existing.some(
          (item) =>
            item.task_type === taskType &&
            item.evidence?.rerun_window === window.label
        );
        if (alreadyExists) continue;
        this.create({
          product_entity_id: task.product_entity_id,
          canonical_pivota_pdp_url: task.canonical_pivota_pdp_url,
          task_type: taskType,
          evidence: {
            rerun_window: window.label,
            delay_hours: window.hours,
            next_rerun_at: addHoursIso(now, window.hours),
            source_task_id: task.id,
            no_uplift_claim_allowed: true,
            uplift_claim_allowed: false,
            evidence_note:
              "Scheduled after Search Console, sitemap, and indexing request evidence was recorded.",
          },
        });
      }
    }
  }

  private latestSearchGroundedDiscovery(productEntityId: string) {
    const state = getAgentCenterState();
    const latestScore = latestByCreatedAt(
      state.scores.filter((score) => {
        if (score.product_entity_id !== productEntityId) return false;
        const job = score.job_id
          ? state.jobs.find((item) => item.id === score.job_id)
          : undefined;
        const target = state.scanTargets.find(
          (item) => item.id === score.scan_target_id
        );
        return (
          job?.scan_mode === "search_grounded_product_discovery_test" ||
          target?.scan_mode === "search_grounded_product_discovery_test"
        );
      })
    );
    const score =
      latestScore?.aggregate_scores.search_grounded_pivota_pdp_discovery_score ??
      "not_tested";
    const relatedJobIds = new Set(
      state.jobs
        .filter(
          (job) =>
            job.scan_mode === "search_grounded_product_discovery_test" &&
            (!latestScore || job.id === latestScore.job_id)
        )
        .map((job) => job.id)
    );
    const relatedRunIds = new Set(
      state.testRuns
        .filter((run) => relatedJobIds.has(run.job_id))
        .map((run) => run.id)
    );
    const returnedUrls = unique(
      state.parsedRecommendations
        .filter((parsed) => relatedRunIds.has(parsed.test_run_id))
        .flatMap((parsed) => parsed.returned_urls || [])
    );
    return {
      canonical_pivota_pdp_url: "",
      last_search_grounded_discovery_score: score,
      last_returned_urls: returnedUrls,
      uplift_claim_allowed: typeof score === "number" && score > 0,
    };
  }
}

function progressStatusFromAuditCheck(
  value?: "passed" | "needs_work" | "unknown" | "not_applicable"
) {
  if (value === "passed") return "completed";
  if (value === "needs_work") return "blocked";
  if (value === "not_applicable") return "not_applicable";
  return "not_yet_verified";
}

function evidenceFlag(
  tasks: PivotaIndexingTask[],
  predicate: (evidence: PivotaIndexingTaskEvidence) => boolean
) {
  return tasks.some((task) => predicate(task.evidence || {}));
}

function pivotaDiscoveryProgressFor(input: {
  product_entity_id?: string;
  canonical_pivota_pdp_url?: string;
  pivota_preflight_status?: ProductionValidationUrlPreflight["status"];
  contextual_pivota_attribution_status?: GMVAssuranceDimensionStatus;
  pivota_audit?: PivotaPDPDiscoverabilityAudit;
  has_offer?: boolean;
}): PivotaDiscoveryProgress {
  const service = new PivotaIndexingTaskService();
  const summary = input.product_entity_id
    ? service.summary(input.product_entity_id)
    : undefined;
  const tasks = (summary?.tasks || []) as PivotaIndexingTask[];
  const status =
    (summary?.indexing_evidence_status as PivotaIndexingEvidenceStatus | undefined) ||
    "not_started";
  const score =
    summary?.last_search_grounded_discovery_score ?? "not_tested";
  const upliftClaimAllowed = Boolean(summary?.uplift_claim_allowed);
  const sitemapSubmitted = evidenceFlag(
    tasks,
    (evidence) => evidence.sitemap_submitted === true
  );
  const indexingRequested = evidenceFlag(
    tasks,
    (evidence) =>
      evidence.indexing_requested === true ||
      evidence.url_inspection_status === "indexing_requested"
  );
  const waitingForIndexing = [
    "indexing_requested",
    "waiting_for_indexing",
    "rerun_due",
    "no_uplift_yet",
  ].includes(status);
  const auditChecks = input.pivota_audit?.checks || {};
  const pivotaPublished =
    input.pivota_preflight_status === "passed" ||
    Boolean(input.canonical_pivota_pdp_url);
  const bindingVerified = Boolean(
    input.product_entity_id && input.canonical_pivota_pdp_url
  );
  const contextualPassed =
    input.contextual_pivota_attribution_status === "passed";
  const searchGroundedFound = typeof score === "number" && score > 0;
  const summaryText = upliftClaimAllowed
    ? "Search-grounded discovery improved in the tested validation scope. This does not prove consumer Gemini UI or AI Mode ranking."
    : typeof score === "number" && score === 0 && status !== "not_started"
      ? "Indexing work was recorded, but search-grounded Gemini has not yet returned the Pivota PDP. Public indexing and search ingestion may require more time or additional signals."
      : contextualPassed
        ? "Pivota PDP is ready when surfaced, but search-grounded Gemini has not yet returned the canonical Pivota PDP. No discovery uplift is claimed yet."
        : "Pivota discovery progress tracks public indexability, Search Console evidence, and measured search-grounded reruns without claiming uplift prematurely.";

  return {
    status,
    summary: summaryText,
    next_recommended_operator_action:
      summary?.next_recommended_operator_action ||
      "Verify Search Console property for agent.pivota.cc.",
    next_rerun_at: summary?.next_rerun_at || summary?.next_rerun_time,
    last_search_grounded_discovery_score: score,
    last_returned_urls: summary?.last_returned_urls || [],
    uplift_claim_allowed: upliftClaimAllowed,
    steps: [
      {
        step_key: "pivota_pdp_published",
        label: "Pivota PDP published",
        status: pivotaPublished ? "completed" : "not_started",
        summary: pivotaPublished
          ? "Canonical Pivota PDP is available for the ProductEntity."
          : "Canonical Pivota PDP has not been confirmed.",
      },
      {
        step_key: "product_entity_binding_verified",
        label: "ProductEntity binding verified",
        status: bindingVerified ? "completed" : "not_yet_verified",
        summary: bindingVerified
          ? "Pivota PDP uses a ProductEntity-first canonical URL."
          : "ProductEntity binding has not been confirmed.",
      },
      {
        step_key: "product_schema_added",
        label: "Product schema added",
        status: progressStatusFromAuditCheck(auditChecks.product_jsonld),
        summary: "Product JSON-LD should expose canonical ProductEntity identity.",
      },
      {
        step_key: "offer_schema_added",
        label: "Offer schema added",
        status: input.has_offer
          ? progressStatusFromAuditCheck(auditChecks.offer_jsonld)
          : "not_applicable",
        summary: input.has_offer
          ? "Offer or AggregateOffer JSON-LD should expose verified merchant offers."
          : "No offer metadata was included in this validation scope.",
      },
      {
        step_key: "merchant_source_reference_added",
        label: "Merchant source reference added",
        status: progressStatusFromAuditCheck(auditChecks.source_reference),
        summary: "Pivota PDP should visibly reference the verified merchant PDP source.",
      },
      {
        step_key: "sitemap_includes_canonical_pdp",
        label: "Sitemap includes canonical PDP",
        status: progressStatusFromAuditCheck(auditChecks.sitemap_inclusion),
        summary: "Sitemap should list canonical ProductEntity PDP URLs, not ext_* aliases.",
      },
      {
        step_key: "search_console_sitemap_submitted",
        label: "Search Console sitemap submitted",
        status: sitemapSubmitted ? "completed" : "not_started",
        summary: "Sitemap submission is evidence only; it does not guarantee indexing.",
      },
      {
        step_key: "url_inspection_indexing_requested",
        label: "URL inspection / indexing requested",
        status: indexingRequested ? "completed" : "not_started",
        summary: "URL Inspection and request indexing are operator-recorded evidence, not uplift proof.",
      },
      {
        step_key: "waiting_for_indexing_window",
        label: "Waiting for indexing window",
        status: waitingForIndexing ? "in_progress" : "not_started",
        summary: "Manual rerun windows are tracked at T+24h, T+72h, and T+7d.",
      },
      {
        step_key: "search_grounded_gemini_returned_pivota_pdp",
        label: "Search-grounded Gemini returned Pivota PDP",
        status: searchGroundedFound ? "completed" : "not_yet_verified",
        summary: searchGroundedFound
          ? "Canonical Pivota PDP or verified alias appeared in the tested search-grounded result."
          : "Search-grounded Gemini has not yet returned the canonical Pivota PDP in measured validation.",
      },
      {
        step_key: "uplift_verified",
        label: "Uplift verified",
        status: upliftClaimAllowed ? "completed" : "not_yet_verified",
        summary: upliftClaimAllowed
          ? "Measured search-grounded Pivota PDP discovery improved in the validation scope."
          : "No uplift claim is allowed until a rerun score improves.",
      },
    ],
  };
}

export class IssueResolutionService {
  latest(issueId: string) {
    findIssue(issueId);
    return latestIssueResolutionPlan(issueId);
  }

  generate(issueId: string, options: { regenerate?: boolean } = {}) {
    const issue = findIssue(issueId);
    const existing = latestIssueResolutionPlan(issueId);
    if (existing && !options.regenerate) return existing;

    const blockerType = this.blockerType(issue);
    const planId = nextId("resolution_plan");
    const actions = this.actionsForIssue(issue, blockerType, planId);
    const approvalRequired = actions.some(
      (action) => action.requires_merchant_approval
    );
    const usageEvent = new UsageMeteringService().recordIssueResolutionPlan({
      issue,
      planId,
    });
    const now = nowIso();
    const plan: IssueResolutionPlan = {
      id: planId,
      issue_id: issue.id,
      merchant_id: issue.merchant_id,
      store_id: issue.store_id,
      scan_target_id: issue.scan_target_id,
      blocker_type: blockerType,
      source_agent: "resolution_workflow",
      status: approvalRequired ? "waiting_merchant_approval" : "draft",
      severity: issue.severity,
      owner_type: this.ownerForBlocker(blockerType),
      owner_team: this.ownerTeamForBlocker(blockerType),
      fix_targets: this.fixTargetsForBlocker(issue, blockerType),
      root_cause_hypothesis: this.rootCauseForBlocker(issue, blockerType),
      recommended_actions: actions,
      approval_required: approvalRequired,
      merchant_approval_status: approvalRequired ? "pending" : "not_required",
      pivota_internal_status: "not_started",
      verification_plan: this.verificationPlanFor(issue, blockerType),
      usage_event_ids: [usageEvent.id],
      created_at: now,
      updated_at: now,
    };
    getAgentCenterRepository().upsert("issueResolutionPlans", plan);
    if (blockerType === "pivota_pdp_not_discovered") {
      new PivotaIndexingTaskService().generateForIssue(issue.id);
    }
    return plan;
  }

  update(issueId: string, patch: Partial<IssueResolutionPlan>) {
    const plan = this.generate(issueId);
    const allowed: Array<keyof IssueResolutionPlan> = [
      "status",
      "owner_type",
      "owner_team",
      "fix_targets",
      "root_cause_hypothesis",
      "approval_required",
      "merchant_approval_status",
      "pivota_internal_status",
      "verification_plan",
      "retest_result",
    ];
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        (plan as Record<string, unknown>)[key] = patch[key];
      }
    }
    touch(plan);
    return plan;
  }

  approveAction(issueId: string, actionId: string) {
    const plan = this.generate(issueId);
    const action = this.findAction(plan, actionId);
    action.status = "approved";
    const merchantActions = plan.recommended_actions.filter(
      (item) => item.requires_merchant_approval
    );
    if (merchantActions.every((item) => item.status === "approved")) {
      plan.merchant_approval_status = "approved";
      plan.status = "in_progress";
    }
    touch(plan);
    return plan;
  }

  applyAction(issueId: string, actionId: string) {
    const plan = this.generate(issueId);
    const action = this.findAction(plan, actionId);
    action.status = actionStatusAfterApply(action) as RecommendedActionStatus;
    if (action.status !== "applied") {
      throw new Error(
        `Action ${action.id} requires approval before it can be applied`
      );
    }
    const remainingPatchActions = plan.recommended_actions.filter(
      (item) =>
        !item.action_type.startsWith("rerun_") &&
        !["applied", "skipped"].includes(item.status)
    );
    plan.pivota_internal_status = "applied";
    plan.status = remainingPatchActions.length ? "in_progress" : "ready_for_retest";
    touch(plan);
    return plan;
  }

  async retest(issueId: string) {
    const issue = findIssue(issueId);
    const plan = this.generate(issueId);
    plan.status = "retesting";
    touch(plan);

    const blockerType = plan.blocker_type;
    let result: Record<string, unknown>;
    if (
      blockerType === "merchant_store_attribution_gap" ||
      blockerType === "merchant_pdp_not_discovered" ||
      blockerType === "pivota_pdp_not_discovered" ||
      blockerType === "wrong_buying_path_returned" ||
      blockerType === "pivota_pdp_attribution_gap" ||
      blockerType === "unverified_pivota_attribution" ||
      blockerType === "pivota_pdp_content_quality_gap" ||
      blockerType === "pivota_product_intelligence_gap"
    ) {
      const verification = await new VerificationService().retestIssue(issue.id);
      result = {
        status: "completed",
        source_agent: "demand_test_agent",
        scan_mode:
          blockerType === "merchant_store_attribution_gap"
            ? "merchant_store_attribution_test"
            : blockerType === "merchant_pdp_not_discovered" ||
                blockerType === "pivota_pdp_not_discovered" ||
                blockerType === "wrong_buying_path_returned"
              ? "search_grounded_product_discovery_test"
            : "pivota_pdp_attribution_test",
        verification_run_id: verification.id,
      };
    } else if (
      blockerType === "missing_attribute" ||
      blockerType === "pivota_pdp_readiness_gap"
    ) {
      const diagnosis = new ProductUnderstandingService().attachToRetestPlan(issue.id);
      result = {
        status: "completed",
        source_agent: "product_understanding_agent",
        diagnosis_id: diagnosis.id,
      };
    } else if (
      blockerType === "price_mismatch" ||
      blockerType === "expired_coupon"
    ) {
      const diagnosis = new OfferExecutionService().attachToRetestPlan(issue.id);
      result = {
        status: "completed",
        source_agent: "offer_execution_agent",
        diagnosis_id: diagnosis.id,
      };
    } else if (
      blockerType === "coupon_param_missing" ||
      blockerType === "checkout_url_unreachable"
    ) {
      const diagnosis = new CheckoutVerificationService().attachToRetestPlan(issue.id);
      result = {
        status: "completed",
        source_agent: "checkout_verification_agent",
        diagnosis_id: diagnosis.id,
      };
    } else {
      result = {
        status: "human_review_required",
        source_agent: "resolution_workflow",
      };
    }

    plan.retest_result = result;
    plan.status = "ready_for_retest";
    touch(plan);
    return plan;
  }

  private findAction(plan: IssueResolutionPlan, actionId: string) {
    const action = plan.recommended_actions.find((item) => item.id === actionId);
    if (!action) throw new Error(`Resolution action not found: ${actionId}`);
    return action;
  }

  private blockerType(issue: AgenticGMVIssue) {
    const evidenceBlocker = String(issue.evidence?.blocker_type || "");
    if (supportedResolutionBlockers.has(evidenceBlocker)) return evidenceBlocker;
    if (supportedResolutionBlockers.has(issue.issue_type)) return issue.issue_type;

    const offerDiagnosis = latestByCreatedAt(
      getAgentCenterState().offerExecutionDiagnoses.filter(
        (diagnosis) => diagnosis.issue_id === issue.id
      )
    );
    const offerFinding = actionableOfferFindings(offerDiagnosis).find((finding) =>
      supportedResolutionBlockers.has(finding.finding_type)
    );
    if (offerFinding) return offerFinding.finding_type;

    const checkoutDiagnosis = latestByCreatedAt(
      getAgentCenterState().checkoutVerificationDiagnoses.filter(
        (diagnosis) => diagnosis.issue_id === issue.id
      )
    );
    const checkoutFinding = actionableCheckoutFindings(checkoutDiagnosis).find(
      (finding) => supportedResolutionBlockers.has(finding.finding_type)
    );
    if (checkoutFinding) return checkoutFinding.finding_type;

    return issue.issue_type;
  }

  private ownerForBlocker(blockerType: string): IssueResolutionOwnerType {
    if (
      blockerType === "organic_product_not_discovered" ||
      blockerType === "competitor_dominance" ||
      blockerType === "merchant_pdp_not_discovered" ||
      blockerType === "wrong_buying_path_returned"
    ) {
      return "shared";
    }
    if (blockerType === "missing_attribute") return "shared";
    if (blockerType === "merchant_store_attribution_gap") return "shared";
    if (blockerType === "coupon_param_missing") return "shared";
    if (blockerType === "price_mismatch") return "shared";
    if (blockerType === "checkout_url_unreachable") return "pivota_eng";
    if (
      blockerType === "pivota_pdp_attribution_gap" ||
      blockerType === "unverified_pivota_attribution" ||
      blockerType === "pivota_pdp_not_discovered" ||
      blockerType === "pivota_pdp_content_quality_gap" ||
      blockerType === "pivota_product_intelligence_gap" ||
      blockerType === "pivota_pdp_readiness_gap" ||
      blockerType === "expired_coupon"
    ) {
      return "pivota_ops";
    }
    return "human_review";
  }

  private ownerTeamForBlocker(blockerType: string) {
    const map: Record<string, string> = {
      organic_product_not_discovered: "Merchant Growth + Pivota Discovery Ops",
      competitor_dominance: "Merchant Growth + Pivota Discovery Ops",
      merchant_pdp_not_discovered: "Merchant Growth + Pivota Discovery Ops",
      pivota_pdp_not_discovered: "Pivota Discovery Ops",
      wrong_buying_path_returned: "Merchant Growth + Pivota Discovery Ops",
      merchant_store_attribution_gap: "Merchant PDP + Pivota Product Ops",
      pivota_pdp_attribution_gap: "Pivota Product Ops",
      unverified_pivota_attribution: "Pivota Product Ops",
      missing_attribute: "Merchant Catalog + Pivota Product Ops",
      pivota_pdp_readiness_gap: "Pivota Product Ops",
      pivota_pdp_content_quality_gap: "Pivota Product Ops",
      pivota_product_intelligence_gap: "Pivota Product Ops",
      price_mismatch: "Merchant Offer Ops + Pivota Offer Ops",
      expired_coupon: "Pivota Offer Ops",
      coupon_param_missing: "Merchant Promo Ops + Pivota Checkout Ops",
      checkout_url_unreachable: "Pivota Checkout Engineering",
    };
    return map[blockerType] || "Human Review";
  }

  private fixTargetsForBlocker(issue: AgenticGMVIssue, blockerType: string) {
    const map: Record<string, FixTarget[]> = {
      organic_product_not_discovered: [
        "merchant_structured_data",
        "pivota_unified_pdp",
        "pivota_product_graph",
        "pivota_query_mapping",
      ],
      competitor_dominance: [
        "merchant_pdp",
        "pivota_unified_pdp",
        "pivota_product_graph",
        "pivota_query_mapping",
      ],
      merchant_pdp_not_discovered: [
        "merchant_pdp",
        "merchant_structured_data",
        "pivota_product_graph",
      ],
      pivota_pdp_not_discovered: [
        "pivota_unified_pdp",
        "pivota_product_graph",
      ],
      wrong_buying_path_returned: [
        "merchant_pdp",
        "merchant_structured_data",
        "pivota_unified_pdp",
        "pivota_product_graph",
      ],
      merchant_store_attribution_gap: [
        "merchant_structured_data",
        "pivota_product_graph",
        "pivota_unified_pdp",
      ],
      pivota_pdp_attribution_gap: ["pivota_unified_pdp", "pivota_product_graph"],
      unverified_pivota_attribution: ["pivota_unified_pdp", "pivota_product_graph"],
      missing_attribute: ["both_merchant_and_pivota"],
      pivota_pdp_readiness_gap: ["pivota_unified_pdp", "pivota_product_graph"],
      pivota_pdp_content_quality_gap: [
        "pivota_unified_pdp",
        "pivota_product_graph",
      ],
      pivota_product_intelligence_gap: [
        "pivota_unified_pdp",
        "pivota_product_graph",
      ],
      price_mismatch: ["pivota_offer_layer"],
      expired_coupon: ["pivota_offer_layer", "merchant_promo_source"],
      coupon_param_missing: ["pivota_checkout_layer", "merchant_promo_source"],
      checkout_url_unreachable: ["pivota_checkout_layer"],
    };
    return unique([...(map[blockerType] || []), ...issue.fix_targets]);
  }

  private rootCauseForBlocker(issue: AgenticGMVIssue, blockerType: string) {
    const map: Record<string, string> = {
      organic_product_not_discovered:
        "Organic no-context prompts did not naturally surface the product. Merchant-owned and Pivota buying paths can be ready when context is provided, but the product needs stronger public discovery signals and query-cluster mapping before AI users can naturally reach it.",
      competitor_dominance:
        "Organic discovery prompts were dominated by competitor brands/products while the target product was absent. The likely gap is weak differentiation evidence, substitute mapping, and category/query coverage for natural AI discovery.",
      merchant_pdp_not_discovered:
        "Search-grounded Gemini did not return the expected merchant PDP. The likely causes are weak indexability, canonical URL, structured data, sitemap, or PDP copy signals on the merchant-owned buying page.",
      pivota_pdp_not_discovered:
        "Search-grounded Gemini did not return the expected Pivota PDP. The likely causes are weak Pivota PDP indexability, source references, product identity, structured data, or product intelligence signals.",
      wrong_buying_path_returned:
        "Search-grounded Gemini returned a different buying path than expected. The likely causes are canonical ambiguity, stronger third-party retailer pages, or missing source/buying-path bindings for the expected merchant/Pivota PDP.",
      merchant_store_attribution_gap:
        "The product can be visible to the model, but the merchant store/PDP was not returned as the buying path. The likely cause is weak merchant buying-path structured data or a missing Pivota binding from product entity to merchant PDP.",
      pivota_pdp_attribution_gap:
        "The model did not return a verified public Pivota PDP URL or verified product object ID, so Pivota channel attribution has not been proven.",
      unverified_pivota_attribution:
        "The model appeared to mention Pivota, but the returned evidence did not verify against a public Pivota PDP URL, product object ID, or offer path.",
      missing_attribute:
        "The issue is likely caused by missing or weak product attributes in the merchant source and/or Pivota unified PDP.",
      pivota_pdp_readiness_gap:
        "Merchant source data can be sufficient while the Pivota unified PDP or product graph is missing normalized agent-facing attributes.",
      pivota_pdp_content_quality_gap:
        "Merchant-owned PDP attribution passed. The main readiness gap is on the Pivota agent-facing PDP layer: identity, overview, product intelligence, or similar-product content is incomplete.",
      pivota_product_intelligence_gap:
        "The Pivota agent-facing product intelligence layer is incomplete or blocked even though the product path is reachable.",
      price_mismatch:
        "Merchant source price and Pivota offer state disagree, so the agent-facing offer should not be treated as ready until pricing is reconciled.",
      expired_coupon:
        "Promo/coupon state is stale or expired in one layer and needs to be reconciled before the offer can be agent-ready.",
      coupon_param_missing:
        "Checkout handoff does not include the required coupon passthrough parameter, so promo execution readiness is not proven.",
      checkout_url_unreachable:
        "The Pivota checkout path failed preflight or is missing a reachable checkout URL before payment.",
    };
    return map[blockerType] || issue.root_cause;
  }

  private verificationPlanFor(issue: AgenticGMVIssue, blockerType: string) {
    const base = {
      issue_id: issue.id,
      blocker_type: blockerType,
      scan_target_id: issue.scan_target_id,
      query_cluster_ids: issue.affected_query_clusters,
      provider_set: issue.verification_plan.providers,
      prompt_template_ids: issue.verification_plan.prompt_templates,
      repetition_count: 2,
    };
    if (blockerType === "merchant_store_attribution_gap") {
      return {
        ...base,
        source_agent: "demand_test_agent",
        scan_mode: "merchant_store_attribution_test",
        success_metric: "merchant_store_visibility_score",
      };
    }
    if (
      blockerType === "organic_product_not_discovered" ||
      blockerType === "competitor_dominance"
    ) {
      return {
        ...base,
        source_agent: "demand_test_agent",
        scan_mode: "organic_product_discovery_test",
        success_metric:
          blockerType === "competitor_dominance"
            ? "competitor_dominance_score"
            : "organic_product_discovery_score",
      };
    }
    if (
      blockerType === "merchant_pdp_not_discovered" ||
      blockerType === "pivota_pdp_not_discovered" ||
      blockerType === "wrong_buying_path_returned"
    ) {
      return {
        ...base,
        source_agent: "demand_test_agent",
        scan_mode: "search_grounded_product_discovery_test",
        success_metric:
          blockerType === "pivota_pdp_not_discovered"
            ? "search_grounded_pivota_pdp_discovery_score"
            : blockerType === "wrong_buying_path_returned"
              ? "url_match_accuracy_score"
              : "search_grounded_merchant_pdp_discovery_score",
      };
    }
    if (
      blockerType === "pivota_pdp_attribution_gap" ||
      blockerType === "unverified_pivota_attribution" ||
      blockerType === "pivota_pdp_content_quality_gap" ||
      blockerType === "pivota_product_intelligence_gap"
    ) {
      return {
        ...base,
        source_agent: "demand_test_agent",
        scan_mode: "pivota_pdp_attribution_test",
        success_metric: "pivota_pdp_visibility_score",
      };
    }
    if (blockerType === "missing_attribute" || blockerType === "pivota_pdp_readiness_gap") {
      return {
        ...base,
        source_agent: "product_understanding_agent",
        workflow_type: "product_diagnosis",
        success_metric: "attribute_readiness_score",
      };
    }
    if (blockerType === "price_mismatch" || blockerType === "expired_coupon") {
      return {
        ...base,
        source_agent: "offer_execution_agent",
        workflow_type: "offer_readiness",
        success_metric: "offer_readiness_score",
      };
    }
    if (
      blockerType === "coupon_param_missing" ||
      blockerType === "checkout_url_unreachable"
    ) {
      return {
        ...base,
        source_agent: "checkout_verification_agent",
        workflow_type: "checkout_readiness",
        success_metric: "checkout_readiness_score",
      };
    }
    return {
      ...base,
      source_agent: "resolution_workflow",
      workflow_type: "human_review",
    };
  }

  private actionsForIssue(
    issue: AgenticGMVIssue,
    blockerType: string,
    planId: string
  ) {
    const action = (input: {
      index: number;
      action_type: string;
      title: string;
      description: string;
      target_layer: FixTarget | string;
      owner_type?: IssueResolutionOwnerType;
      owner_team?: string;
      patch_payload?: Record<string, unknown>;
      requires_merchant_approval?: boolean;
      can_apply_automatically?: boolean;
      expected_impact: string;
    }): RecommendedAction => ({
      id: `${planId}_action_${input.index}`,
      action_type: input.action_type,
      title: input.title,
      description: input.description,
      target_layer: input.target_layer,
      owner_type: input.owner_type,
      owner_team: input.owner_team,
      requires_merchant_approval: Boolean(input.requires_merchant_approval),
      can_apply_automatically: input.can_apply_automatically ?? true,
      patch_payload: input.patch_payload || {},
      status: "proposed",
      evidence: {
        issue_id: issue.id,
        issue_type: issue.issue_type,
        blocker_type: blockerType,
        severity: issue.severity,
      },
      expected_impact: input.expected_impact,
    });

    const rerunPayload = {
      scan_target_id: issue.scan_target_id,
      query_cluster_ids: issue.affected_query_clusters,
      provider_set: issue.verification_plan.providers,
      prompt_template_ids: issue.verification_plan.prompt_templates,
    };

    if (blockerType === "organic_product_not_discovered") {
      return [
        action({
          index: 1,
          action_type: "merchant_discovery_signal_patch",
          title: "Strengthen merchant PDP discovery signals",
          description:
            "Strengthen merchant PDP discovery signals, including product title, canonical URL, structured Product schema, Offer schema, brand/seller info, availability, price, and product description.",
          target_layer: "merchant_owned_path",
          owner_type: "shared",
          owner_team: "Merchant Growth + Pivota Discovery Ops",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: {
            canonical_url: issue.store_url,
            product_entity_ids: issue.affected_product_entities,
            structured_data: ["Product", "Offer", "Brand", "Seller"],
            content_signals: [
              "full searchable product name in PDP title",
              "category/use-case language",
              "Product structured data",
              "Offer structured data where applicable",
              "clear canonical PDP URL",
              "machine-readable price",
              "machine-readable availability",
              "brand and seller identity",
              "product description",
              "ingredient/claim/review evidence if available",
            ],
            example_use_case_terms: [
              "tone brightening cleansing gel foam",
              "centella cleanser",
              "daily brightening cleanser",
            ],
            source_issue: issue.id,
          },
          expected_impact:
            "Improves the source-layer evidence available for no-context organic discovery.",
        }),
        action({
          index: 2,
          action_type: "pivota_discovery_signal_patch",
          title: "Strengthen Pivota PDP discovery signals",
          description:
            "Strengthen Pivota PDP identity, product overview, product intelligence module, canonical product object ID, source references to merchant PDP, and query cluster mapping.",
          target_layer: "pivota_agent_facing_path",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            product_entity_ids: issue.affected_product_entities,
            source_references: [issue.store_url],
            pivota_sections: [
              "identity",
              "overview",
              "product_intelligence_module",
              "canonical_product_object_id",
              "verified_source_references",
              "organic_query_cluster_mappings",
              "competitor_substitute_relationships",
            ],
          },
          expected_impact:
            "Gives the Pivota agent-facing path stronger public identity and source evidence.",
        }),
        action({
          index: 3,
          action_type: "query_cluster_mapping_patch",
          title: "Map product to organic discovery query clusters",
          description:
            "Map product to organic category/intention queries, such as tone brightening cleanser, centella cleanser, k-beauty brightening cleanser.",
          target_layer: "pivota_product_graph",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            query_cluster_ids: issue.affected_query_clusters,
            product_entity_ids: issue.affected_product_entities,
            example_query_mappings: [
              "tone brightening cleanser",
              "centella cleanser",
              "k-beauty brightening cleanser",
            ],
          },
          expected_impact:
            "Expands the organic query surface where the product can be matched and retested.",
        }),
        action({
          index: 4,
          action_type: "rerun_organic_product_discovery_test",
          title: "Rerun Organic Product Discovery Test",
          description:
            "Rerun organic no-context discovery after merchant/Pivota discovery signal updates.",
          target_layer: "validation",
          owner_type: "pivota_ops",
          owner_team: "Pivota Validation Ops",
          patch_payload: {
            ...rerunPayload,
            scan_mode: "organic_product_discovery_test",
          },
          expected_impact:
            "Verifies whether no-context Gemini discovery starts surfacing the product.",
        }),
      ];
    }

    if (blockerType === "competitor_dominance") {
      return [
        action({
          index: 1,
          action_type: "competitor_dominance_analysis",
          title: "Analyze dominant competitor matches",
          description:
            "Identify which competitor brands/products dominated organic prompts and why.",
          target_layer: "discovery_analysis",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            top_competitors: issue.evidence?.top_competitors || [],
            top_competitor_recommendations:
              issue.evidence?.top_competitor_recommendations || [],
            query_cluster_ids: issue.affected_query_clusters,
          },
          expected_impact:
            "Identifies the competitor evidence patterns the product must compete against.",
        }),
        action({
          index: 2,
          action_type: "differentiation_evidence_patch",
          title: "Add product differentiation evidence",
          description:
            "Add stronger merchant/Pivota evidence for product differentiation, use cases, ingredients, texture, target skin type, and proof points.",
          target_layer: "merchant_pdp_and_pivota_pdp",
          owner_type: "shared",
          owner_team: "Merchant Growth + Pivota Product Ops",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: {
            product_entity_ids: issue.affected_product_entities,
            evidence_fields: [
              "differentiation",
              "use cases",
              "ingredients",
              "texture",
              "target skin type",
              "proof points",
              "review proof",
              "comparison/substitute mapping",
            ],
            merchant_patch_required: true,
          },
          expected_impact:
            "Gives AI discovery prompts stronger reasons to choose the target product over substitutes.",
        }),
        action({
          index: 3,
          action_type: "competitor_substitute_graph_patch",
          title: "Update competitor and substitute graph mapping",
          description:
            "Update Pivota product graph with competitor/substitute relationships and query cluster links.",
          target_layer: "pivota_product_graph",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            product_entity_ids: issue.affected_product_entities,
            query_cluster_ids: issue.affected_query_clusters,
            competitor_relationships: issue.evidence?.top_competitors || [],
          },
          expected_impact:
            "Improves substitute-aware matching and query cluster coverage for discovery retests.",
        }),
        action({
          index: 4,
          action_type: "rerun_organic_product_discovery_test",
          title: "Rerun Organic Product Discovery Test",
          description:
            "Rerun organic discovery to measure competitor dominance reduction.",
          target_layer: "validation",
          owner_type: "pivota_ops",
          owner_team: "Pivota Validation Ops",
          patch_payload: {
            ...rerunPayload,
            scan_mode: "organic_product_discovery_test",
          },
          expected_impact:
            "Verifies whether competitor dominance decreases after differentiation and graph updates.",
        }),
      ];
    }

    if (blockerType === "merchant_pdp_not_discovered") {
      return [
        action({
          index: 1,
          action_type: "merchant_indexability_patch",
          title: "Verify merchant PDP indexability",
          description:
            "Make sure the PDP is indexable, canonical, and accessible to search-grounded AI.",
          target_layer: "merchant_owned_path",
          owner_type: "merchant",
          owner_team: "Merchant Growth",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: {
            merchant_pdp_url: issue.store_url,
            checks: ["HTTP 200", "robots/meta robots indexability", "canonical URL"],
          },
          expected_impact:
            "Allows search-grounded Gemini to access and treat the official PDP as eligible evidence.",
        }),
        action({
          index: 2,
          action_type: "merchant_product_schema_patch",
          title: "Add or fix merchant Product schema",
          description:
            "Add or fix Product structured data with name, brand, SKU, canonical URL, description, and image.",
          target_layer: "merchant_structured_data",
          owner_type: "merchant",
          owner_team: "Merchant Growth",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: {
            schema_type: "Product",
            required_fields: ["name", "brand", "sku", "url", "description", "image"],
            product_entity_ids: issue.affected_product_entities,
          },
          expected_impact:
            "Makes the product identity machine-readable for search-grounded discovery.",
        }),
        action({
          index: 3,
          action_type: "merchant_offer_schema_patch",
          title: "Add or fix merchant Offer schema",
          description:
            "Add or fix Offer structured data with price, currency, availability, seller, and URL where applicable.",
          target_layer: "merchant_structured_data",
          owner_type: "merchant",
          owner_team: "Merchant Growth",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: {
            schema_type: "Offer",
            required_fields: ["price", "priceCurrency", "availability", "seller", "url"],
          },
          expected_impact:
            "Clarifies the official buying path and offer evidence on the merchant PDP.",
        }),
        action({
          index: 4,
          action_type: "merchant_canonical_url_patch",
          title: "Confirm merchant canonical URL",
          description:
            "Ensure the canonical URL points to the official merchant PDP.",
          target_layer: "merchant_pdp",
          owner_type: "merchant",
          owner_team: "Merchant Growth",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: {
            canonical_url: issue.store_url,
          },
          expected_impact:
            "Reduces ambiguity between official PDP, third-party retailer pages, and duplicate URLs.",
        }),
        action({
          index: 5,
          action_type: "merchant_pdp_copy_patch",
          title: "Strengthen merchant PDP copy",
          description:
            "Strengthen page title, H1, product description, and use-case language so the PDP clearly matches relevant search queries.",
          target_layer: "merchant_pdp",
          owner_type: "merchant",
          owner_team: "Merchant Growth",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: {
            content_fields: ["title", "h1", "description", "use_case_language"],
            product_entity_ids: issue.affected_product_entities,
          },
          expected_impact:
            "Improves product-name and category association for search-grounded discovery.",
        }),
        action({
          index: 6,
          action_type: "merchant_sitemap_submission",
          title: "Confirm merchant sitemap inclusion",
          description:
            "Ensure the PDP is included in sitemap and eligible for indexing.",
          target_layer: "merchant_owned_path",
          owner_type: "merchant",
          owner_team: "Merchant Growth",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: {
            merchant_pdp_url: issue.store_url,
            sitemap_required: true,
          },
          expected_impact:
            "Improves the chance that public search-grounded systems can discover the official PDP.",
        }),
        action({
          index: 7,
          action_type: "rerun_search_grounded_product_discovery_test",
          title: "Rerun Search-Grounded Product Discovery Test",
          description:
            "Rerun search-grounded discovery after indexability and structured data fixes.",
          target_layer: "validation",
          owner_type: "pivota_ops",
          owner_team: "Pivota Validation Ops",
          patch_payload: {
            ...rerunPayload,
            scan_mode: "search_grounded_product_discovery_test",
          },
          expected_impact:
            "Verifies whether Gemini with search grounding returns the expected merchant PDP.",
        }),
      ];
    }

    if (blockerType === "pivota_pdp_not_discovered") {
      return [
        action({
          index: 1,
          action_type: "pivota_indexability_patch",
          title: "Verify Pivota PDP indexability",
          description:
            "Make sure the Pivota PDP is public, indexable, canonical, and accessible.",
          target_layer: "pivota_unified_pdp",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            checks: ["HTTP 200", "robots/meta robots indexability", "canonical URL"],
            product_entity_ids: issue.affected_product_entities,
          },
          expected_impact:
            "Allows search-grounded Gemini to access the Pivota agent-facing PDP as public evidence.",
        }),
        action({
          index: 2,
          action_type: "pivota_product_schema_patch",
          title: "Add or fix Pivota Product schema",
          description: "Add or fix Product structured data for the Pivota PDP.",
          target_layer: "pivota_unified_pdp",
          owner_type: "pivota_eng",
          owner_team: "Pivota Product Engineering",
          patch_payload: {
            schema_type: "Product",
            product_entity_ids: issue.affected_product_entities,
          },
          expected_impact:
            "Makes Pivota product identity machine-readable for search-grounded discovery.",
        }),
        action({
          index: 3,
          action_type: "pivota_offer_schema_patch",
          title: "Add or fix Pivota Offer schema",
          description:
            "Add or fix Offer/AggregateOffer structured data for merchant offers.",
          target_layer: "pivota_offer_layer",
          owner_type: "pivota_eng",
          owner_team: "Pivota Product Engineering",
          patch_payload: {
            schema_types: ["Offer", "AggregateOffer"],
            product_entity_ids: issue.affected_product_entities,
          },
          expected_impact:
            "Clarifies Pivota-managed merchant offer evidence on the agent-facing PDP.",
        }),
        action({
          index: 4,
          action_type: "pivota_source_reference_patch",
          title: "Add merchant source reference",
          description:
            "Add merchant PDP as a verified source reference on the Pivota PDP.",
          target_layer: "pivota_unified_pdp",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            source_references: [issue.store_url],
            product_entity_ids: issue.affected_product_entities,
          },
          expected_impact:
            "Connects the Pivota PDP to the merchant-owned source path for discoverability.",
        }),
        action({
          index: 5,
          action_type: "pivota_sitemap_submission",
          title: "Confirm Pivota sitemap inclusion",
          description:
            "Ensure the Pivota PDP appears in the agent.pivota.cc sitemap and is submitted for indexing.",
          target_layer: "pivota_unified_pdp",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            product_entity_ids: issue.affected_product_entities,
            sitemap_required: true,
          },
          expected_impact:
            "Improves public discoverability of the Pivota agent-facing PDP.",
        }),
        action({
          index: 6,
          action_type: "pivota_search_console_indexing_request",
          title: "Request indexing for canonical Pivota PDP",
          description:
            "Validate the canonical ProductEntity PDP in Google Search Console and request indexing after sitemap submission.",
          target_layer: "pivota_sitemap",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            product_entity_ids: issue.affected_product_entities,
            canonical_pivota_pdp_url: canonicalPivotaPdpUrlForIssue(issue),
            search_console_required: true,
          },
          expected_impact:
            "Starts external search ingestion for the canonical Pivota ProductEntity PDP; no uplift should be claimed until a rerun improves.",
        }),
        action({
          index: 7,
          action_type: "pivota_internal_link_patch",
          title: "Add internal links to canonical Pivota PDP",
          description:
            "Add crawlable internal links from public Pivota product index/category surfaces to the canonical ProductEntity PDP.",
          target_layer: "pivota_product_graph",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            product_entity_ids: issue.affected_product_entities,
            canonical_pivota_pdp_url: canonicalPivotaPdpUrlForIssue(issue),
          },
          expected_impact:
            "Gives crawlers a public internal path to the canonical Pivota PDP.",
        }),
        action({
          index: 8,
          action_type: "pivota_search_console_url_inspection",
          title: "Validate Search Console URL inspection",
          description:
            "Confirm the canonical Pivota PDP is inspectable in Google Search Console and record indexing status.",
          target_layer: "pivota_sitemap",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            product_entity_ids: issue.affected_product_entities,
            canonical_pivota_pdp_url: canonicalPivotaPdpUrlForIssue(issue),
          },
          expected_impact:
            "Creates operator evidence that the canonical Pivota PDP can be inspected and submitted.",
        }),
        action({
          index: 9,
          action_type: "pivota_product_intelligence_patch",
          title: "Complete Pivota product intelligence",
          description:
            "Complete product identity, overview, product intelligence module, and similar/substitute highlights.",
          target_layer: "pivota_product_graph",
          owner_type: "pivota_ops",
          owner_team: "Pivota Product Ops",
          patch_payload: {
            product_entity_ids: issue.affected_product_entities,
            sections: [
              "identity",
              "overview",
              "product_intelligence_module",
              "similar_substitute_highlights",
            ],
          },
          expected_impact:
            "Makes the Pivota PDP more clearly associated with the product and merchant offer.",
        }),
        action({
          index: 10,
          action_type: "rerun_search_grounded_product_discovery_test",
          title: "Rerun Search-Grounded Product Discovery Test",
          description:
            "Rerun search-grounded discovery after Pivota PDP discoverability fixes and indexing window.",
          target_layer: "validation",
          owner_type: "pivota_ops",
          owner_team: "Pivota Validation Ops",
          patch_payload: {
            ...rerunPayload,
            scan_mode: "search_grounded_product_discovery_test",
          },
          expected_impact:
            "Verifies whether Gemini with search grounding returns the expected Pivota PDP.",
        }),
      ];
    }

    if (blockerType === "wrong_buying_path_returned") {
      return [
        action({
          index: 1,
          action_type: "wrong_url_analysis",
          title: "Analyze wrong returned URLs",
          description:
            "Identify which wrong URLs/domains were returned and why they may be outranking the expected PDP.",
          target_layer: "discovery_analysis",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            returned_urls: issue.evidence?.returned_urls || [],
            returned_domains: issue.evidence?.returned_domains || [],
          },
          expected_impact:
            "Identifies whether third-party retailers, duplicate URLs, or unrelated pages are confusing search-grounded discovery.",
        }),
        action({
          index: 2,
          action_type: "canonical_buying_path_patch",
          title: "Strengthen canonical buying-path signals",
          description:
            "Strengthen canonical source references and buying path metadata for the expected merchant/Pivota PDP.",
          target_layer: "merchant_pdp_and_pivota_pdp",
          owner_type: "shared",
          owner_team: "Merchant Growth + Pivota Discovery Ops",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: {
            merchant_pdp_url: issue.store_url,
            product_entity_ids: issue.affected_product_entities,
            metadata: ["canonical URL", "source references", "buying path schema"],
          },
          expected_impact:
            "Clarifies which PDP should be treated as the official or agent-facing buying path.",
        }),
        action({
          index: 3,
          action_type: "competitor_or_retailer_confusion_patch",
          title: "Reduce competitor or retailer URL confusion",
          description:
            "Update Pivota product graph and source references to reduce confusion with third-party retailers or competitor pages.",
          target_layer: "pivota_product_graph",
          owner_type: "pivota_ops",
          owner_team: "Pivota Discovery Ops",
          patch_payload: {
            product_entity_ids: issue.affected_product_entities,
            graph_updates: [
              "verified source references",
              "retailer disambiguation",
              "competitor/substitute relationships",
            ],
          },
          expected_impact:
            "Reduces the chance that search-grounded Gemini selects the wrong buying path.",
        }),
        action({
          index: 4,
          action_type: "rerun_search_grounded_product_discovery_test",
          title: "Rerun Search-Grounded Product Discovery Test",
          description:
            "Rerun search-grounded discovery after canonical buying-path fixes.",
          target_layer: "validation",
          owner_type: "pivota_ops",
          owner_team: "Pivota Validation Ops",
          patch_payload: {
            ...rerunPayload,
            scan_mode: "search_grounded_product_discovery_test",
          },
          expected_impact:
            "Verifies whether Gemini with search grounding returns the expected merchant or Pivota PDP.",
        }),
      ];
    }

    if (blockerType === "merchant_store_attribution_gap") {
      return [
        action({
          index: 1,
          action_type: "merchant_pdp_structured_data_patch",
          title: "Add merchant PDP structured data",
          description:
            "Patch merchant PDP/catalog metadata so the store and PDP URL are explicit buying-path evidence.",
          target_layer: "merchant_structured_data",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: issue.merchant_source_patch || {
            store_url: issue.store_url,
            product_entity_ids: issue.affected_product_entities,
          },
          expected_impact:
            "Improves the chance that the model returns the merchant store/PDP as purchase source.",
        }),
        action({
          index: 2,
          action_type: "pivota_product_graph_buying_path_binding",
          title: "Bind Pivota product graph to merchant buying path",
          description:
            "Add a Pivota product graph binding from the ProductEntity to the merchant PDP/store path.",
          target_layer: "pivota_product_graph",
          patch_payload: issue.pivota_product_graph_patch || {
            product_entity_ids: issue.affected_product_entities,
            store_id: issue.store_id,
            merchant_pdp_url: issue.store_url,
          },
          expected_impact:
            "Gives Pivota a deterministic merchant buying-path reference for attribution retests.",
        }),
        action({
          index: 3,
          action_type: "pivota_unified_pdp_source_reference_patch",
          title: "Add merchant source reference to Pivota PDP",
          description:
            "Patch Pivota unified PDP source references so merchant PDP evidence is visible to agent-facing context.",
          target_layer: "pivota_unified_pdp",
          patch_payload: issue.pivota_unified_pdp_patch || {
            source_references: [issue.store_url],
          },
          expected_impact:
            "Connects the unified PDP to the merchant source used for attribution proof.",
        }),
        action({
          index: 4,
          action_type: "rerun_merchant_store_attribution_test",
          title: "Rerun Merchant Store Attribution Test",
          description:
            "Retest the same query cluster/provider/prompt setup after buying-path patches are applied.",
          target_layer: "demand_test_agent",
          patch_payload: {
            ...rerunPayload,
            scan_mode: "merchant_store_attribution_test",
          },
          expected_impact:
            "Verifies whether merchant store visibility improves after the fix.",
        }),
      ];
    }

    if (blockerType === "pivota_pdp_attribution_gap") {
      return [
        action({
          index: 1,
          action_type: "publish_or_verify_pivota_pdp_url",
          title: "Publish or verify Pivota PDP URL",
          description:
            "Ensure a public Pivota PDP URL exists, returns 200, and maps to the expected product entity.",
          target_layer: "pivota_unified_pdp",
          patch_payload: issue.pivota_unified_pdp_patch || {},
          expected_impact:
            "Creates verifiable channel evidence for Pivota PDP attribution.",
        }),
        action({
          index: 2,
          action_type: "bind_product_object_id",
          title: "Bind verified product object ID",
          description:
            "Bind the ProductEntity to the verified Pivota product object ID used in agent-facing context.",
          target_layer: "pivota_product_graph",
          patch_payload: issue.pivota_product_graph_patch || {
            product_entity_ids: issue.affected_product_entities,
          },
          expected_impact:
            "Allows Pivota attribution scoring to count verified object-level evidence.",
        }),
        action({
          index: 3,
          action_type: "rerun_pivota_pdp_attribution_test",
          title: "Rerun Pivota PDP Attribution Test",
          description:
            "Retest the same query cluster/provider/prompt setup after Pivota URL/object fixes.",
          target_layer: "demand_test_agent",
          patch_payload: {
            ...rerunPayload,
            scan_mode: "pivota_pdp_attribution_test",
          },
          expected_impact:
            "Verifies whether Pivota channel attribution is now proven.",
        }),
      ];
    }

    if (blockerType === "unverified_pivota_attribution") {
      return [
        action({
          index: 1,
          action_type: "require_verified_pivota_url_or_object_id",
          title: "Require verified Pivota URL or object ID",
          description:
            "Replace unverified Pivota mentions with a public PDP URL or product object ID that can pass verification.",
          target_layer: "pivota_unified_pdp",
          patch_payload: issue.pivota_unified_pdp_patch || {},
          expected_impact:
            "Prevents context echo from being counted as Pivota channel success.",
        }),
        action({
          index: 2,
          action_type: "update_pivota_product_graph_object_reference",
          title: "Update Pivota product graph object reference",
          description:
            "Bind the ProductEntity to the verified Pivota object and expected offer references.",
          target_layer: "pivota_product_graph",
          patch_payload: issue.pivota_product_graph_patch || {},
          expected_impact:
            "Gives the attribution verifier deterministic object evidence.",
        }),
        action({
          index: 3,
          action_type: "rerun_pivota_pdp_attribution_test",
          title: "Rerun Pivota PDP Attribution Test",
          description:
            "Retest after verified Pivota channel references are available.",
          target_layer: "demand_test_agent",
          patch_payload: {
            ...rerunPayload,
            scan_mode: "pivota_pdp_attribution_test",
          },
          expected_impact:
            "Separates verified Pivota attribution from unverified Pivota echo.",
        }),
      ];
    }

    if (
      blockerType === "pivota_pdp_content_quality_gap" ||
      blockerType === "pivota_product_intelligence_gap"
    ) {
      return [
        action({
          index: 1,
          action_type: "pivota_pdp_identity_and_overview_patch",
          title: "Complete Pivota PDP identity and overview",
          description:
            "Patch the agent-facing PDP identity and overview from the available merchant product description.",
          target_layer: "pivota_unified_pdp",
          patch_payload: issue.pivota_unified_pdp_patch || {},
          expected_impact:
            "Makes the Pivota PDP understandable as a verified agent-facing product path.",
        }),
        action({
          index: 2,
          action_type: "pivota_product_intelligence_module_patch",
          title: "Fill Pivota product intelligence module",
          description:
            "Populate product intelligence and similar-card highlight content used by agent-facing PDP quality checks.",
          target_layer: "pivota_product_graph",
          patch_payload: issue.pivota_product_graph_patch || {},
          expected_impact:
            "Closes Pivota product intelligence quality gaps without changing merchant-owned PDP content.",
        }),
        action({
          index: 3,
          action_type: "rerun_pivota_pdp_attribution_test",
          title: "Rerun Pivota PDP Attribution Test",
          description:
            "Retest the same query cluster/provider/prompt setup after Pivota PDP quality fixes.",
          target_layer: "demand_test_agent",
          patch_payload: {
            ...rerunPayload,
            scan_mode: "pivota_pdp_attribution_test",
          },
          expected_impact:
            "Verifies Pivota channel attribution after the agent-facing PDP quality gap is closed.",
        }),
      ];
    }

    if (blockerType === "missing_attribute") {
      return [
        action({
          index: 1,
          action_type: "merchant_source_patch",
          title: "Patch merchant source attributes",
          description:
            "Add missing merchant PDP/catalog attributes required for the affected query cluster.",
          target_layer: "merchant_pdp",
          requires_merchant_approval: true,
          can_apply_automatically: false,
          patch_payload: issue.merchant_source_patch || {},
          expected_impact:
            "Improves source completeness before Product Understanding diagnosis is rerun.",
        }),
        action({
          index: 2,
          action_type: "pivota_unified_pdp_patch",
          title: "Patch Pivota unified PDP attributes",
          description:
            "Normalize the missing agent-facing attributes into the Pivota unified PDP.",
          target_layer: "pivota_unified_pdp",
          patch_payload: issue.pivota_unified_pdp_patch || {},
          expected_impact:
            "Aligns Pivota PDP readiness with the merchant source layer.",
        }),
        action({
          index: 3,
          action_type: "rerun_product_understanding_diagnosis",
          title: "Rerun Product Understanding Diagnosis",
          description:
            "Verify merchant/Pivota layer gaps after product patches are applied.",
          target_layer: "product_understanding_agent",
          patch_payload: rerunPayload,
          expected_impact:
            "Confirms whether attribute readiness and fix targets improved.",
        }),
      ];
    }

    if (blockerType === "pivota_pdp_readiness_gap") {
      return [
        action({
          index: 1,
          action_type: "pivota_unified_pdp_patch",
          title: "Patch Pivota unified PDP",
          description:
            "Add missing normalized attributes and source references to the Pivota unified PDP.",
          target_layer: "pivota_unified_pdp",
          patch_payload: issue.pivota_unified_pdp_patch || {},
          expected_impact:
            "Improves Pivota agent-facing PDP readiness without requiring merchant source changes.",
        }),
        action({
          index: 2,
          action_type: "pivota_product_graph_patch",
          title: "Patch Pivota product graph",
          description:
            "Update product graph mappings that support the unified PDP and query/entity routing.",
          target_layer: "pivota_product_graph",
          patch_payload: issue.pivota_product_graph_patch || {},
          expected_impact:
            "Improves ProductEntity mapping and Pivota PDP readiness.",
        }),
        action({
          index: 3,
          action_type: "rerun_product_understanding_diagnosis",
          title: "Rerun Product Understanding Diagnosis",
          description: "Verify Pivota PDP readiness after patches are applied.",
          target_layer: "product_understanding_agent",
          patch_payload: rerunPayload,
          expected_impact:
            "Confirms whether Pivota layer gaps were closed.",
        }),
      ];
    }

    if (blockerType === "price_mismatch") {
      return [
        action({
          index: 1,
          action_type: "pivota_offer_patch",
          title: "Patch Pivota offer price",
          description:
            "Align Pivota offer price/currency with the current merchant offer source.",
          target_layer: "pivota_offer_layer",
          patch_payload: issue.pivota_offer_patch || {},
          expected_impact:
            "Removes price inconsistency as an agentic checkout blocker.",
        }),
        action({
          index: 2,
          action_type: "rerun_offer_diagnosis",
          title: "Rerun Offer Diagnosis",
          description:
            "Verify offer price consistency after the Pivota offer patch.",
          target_layer: "offer_execution_agent",
          patch_payload: rerunPayload,
          expected_impact:
            "Confirms the offer readiness score after price reconciliation.",
        }),
      ];
    }

    if (blockerType === "expired_coupon") {
      return [
        action({
          index: 1,
          action_type: "promo_state_patch",
          title: "Patch stale promo/coupon state",
          description:
            "Expire or update Pivota promo state to match the merchant source coupon status.",
          target_layer: "pivota_offer_layer",
          patch_payload: issue.promo_state_patch || {},
          expected_impact:
            "Prevents stale promo state from being presented as an executable offer.",
        }),
        action({
          index: 2,
          action_type: "rerun_offer_diagnosis",
          title: "Rerun Offer Diagnosis",
          description:
            "Verify promo/coupon consistency after the state patch.",
          target_layer: "offer_execution_agent",
          patch_payload: rerunPayload,
          expected_impact:
            "Confirms offer readiness after coupon reconciliation.",
        }),
      ];
    }

    if (blockerType === "coupon_param_missing") {
      return [
        action({
          index: 1,
          action_type: "coupon_passthrough_patch",
          title: "Patch coupon passthrough",
          description:
            "Add required coupon parameter and coupon code to the Pivota cart handoff payload.",
          target_layer: "pivota_checkout_layer",
          patch_payload: issue.coupon_passthrough_patch || {},
          expected_impact:
            "Allows checkout verification to prove promo passthrough before payment.",
        }),
        action({
          index: 2,
          action_type: "rerun_checkout_diagnosis",
          title: "Rerun Checkout Diagnosis",
          description:
            "Verify checkout handoff metadata after coupon passthrough patch.",
          target_layer: "checkout_verification_agent",
          patch_payload: rerunPayload,
          expected_impact:
            "Confirms coupon passthrough is ready in checkout handoff.",
        }),
      ];
    }

    if (blockerType === "checkout_url_unreachable") {
      return [
        action({
          index: 1,
          action_type: "pivota_checkout_patch",
          title: "Patch Pivota checkout URL",
          description:
            "Refresh or replace the Pivota checkout URL/session so preflight returns a reachable path.",
          target_layer: "pivota_checkout_layer",
          patch_payload: issue.pivota_checkout_patch || {},
          expected_impact:
            "Restores checkout path availability before payment is attempted.",
        }),
        action({
          index: 2,
          action_type: "rerun_checkout_diagnosis",
          title: "Rerun Checkout Diagnosis",
          description:
            "Verify checkout URL preflight after the Pivota checkout patch.",
          target_layer: "checkout_verification_agent",
          patch_payload: rerunPayload,
          expected_impact:
            "Confirms checkout readiness after URL/session refresh.",
        }),
      ];
    }

    return [
      action({
        index: 1,
        action_type: "human_review_required",
        title: "Route to human review",
        description:
          "This issue type is not yet covered by deterministic Issue Resolution Workflow V1.",
        target_layer: "human_review",
        requires_merchant_approval: true,
        can_apply_automatically: false,
        patch_payload: {
          issue_type: issue.issue_type,
          blocker_type: blockerType,
        },
        expected_impact:
          "Creates an explicit owner and review path for unsupported blockers.",
      }),
    ];
  }
}

type PivotaOptimizationContext = {
  issue: AgenticGMVIssue;
  plan: IssueResolutionPlan;
  action: RecommendedAction;
  patchType: PivotaOptimizationPatchType;
  store: MerchantStore;
  target: ScanTarget;
  product?: ProductRecord;
  run?: ProductionValidationRun;
};

function fallbackPivotaOptimizationActions(
  issue: AgenticGMVIssue,
  plan: IssueResolutionPlan
): RecommendedAction[] {
  const action = (
    index: number,
    actionType: PivotaOptimizationPatchType,
    title: string,
    description: string,
    targetLayer: string
  ): RecommendedAction => ({
    id: `${plan.id}_pivota_fallback_${index}`,
    action_type: actionType,
    title,
    description,
    target_layer: targetLayer,
    owner_type: "pivota_ops",
    owner_team: "Pivota Discovery Ops",
    requires_merchant_approval: false,
    can_apply_automatically: true,
    patch_payload: {
      source_issue_id: issue.id,
      product_entity_ids: issue.affected_product_entities,
    },
    status: "proposed",
    evidence: {
      issue_id: issue.id,
      issue_type: issue.issue_type,
      blocker_type: plan.blocker_type,
      generated_as_fallback: true,
    },
    expected_impact:
      "Improves Pivota-owned discoverability/readiness signals before validation rerun.",
  });

  if (plan.blocker_type === "pivota_pdp_not_discovered") {
    return [
      action(
        1,
        "pivota_source_reference_patch",
        "Add Pivota source reference",
        "Add the merchant PDP as a verified source reference on the Pivota PDP.",
        "pivota_unified_pdp"
      ),
      action(
        2,
        "pivota_product_intelligence_patch",
        "Complete Pivota product intelligence",
        "Populate Pivota PDP identity, overview, product intelligence, and similar/substitute highlights.",
        "pivota_product_graph"
      ),
      action(
        3,
        "pivota_product_schema_patch",
        "Add Pivota Product schema",
        "Generate machine-readable Product schema for the Pivota PDP.",
        "pivota_schema_markup"
      ),
      action(
        4,
        "pivota_sitemap_submission",
        "Prepare Pivota sitemap submission",
        "Generate a sitemap entry and operator indexing instructions for the Pivota PDP.",
        "pivota_sitemap"
      ),
    ];
  }

  if (
    plan.blocker_type === "pivota_pdp_readiness_gap" ||
    plan.blocker_type === "pivota_pdp_content_quality_gap" ||
    plan.blocker_type === "pivota_product_intelligence_gap"
  ) {
    return [
      action(
        1,
        "pivota_discovery_signal_patch",
        "Strengthen Pivota discovery signals",
        "Improve Pivota PDP identity, title, summary, buying-path summary, and query phrases.",
        "pivota_unified_pdp"
      ),
      action(
        2,
        "pivota_product_intelligence_patch",
        "Complete Pivota product intelligence",
        "Populate Pivota product intelligence fields required for the quality gate.",
        "pivota_product_graph"
      ),
    ];
  }

  if (plan.blocker_type === "competitor_dominance") {
    return [
      action(
        1,
        "competitor_substitute_graph_patch",
        "Update competitor/substitute graph",
        "Add competitor relationships, differentiation notes, and query clusters where competitors dominated.",
        "pivota_competitor_graph"
      ),
    ];
  }

  if (plan.blocker_type === "organic_product_not_discovered") {
    return [
      action(
        1,
        "pivota_discovery_signal_patch",
        "Strengthen Pivota discovery signals",
        "Improve Pivota PDP discovery fields and source-backed product identity.",
        "pivota_unified_pdp"
      ),
      action(
        2,
        "query_cluster_mapping_patch",
        "Add organic query mappings",
        "Map the product to organic, product-name, buying-path, and category/use-case queries.",
        "pivota_query_mapping"
      ),
    ];
  }

  return [];
}

function latestProductionValidationRunForIssue(issueId: string) {
  return (
    latestByCreatedAt(
      getAgentCenterState().productionValidationRuns.filter((run) =>
        run.issue_ids.includes(issueId)
      )
    ) || undefined
  );
}

function pivotaPdpUrlForContext(input: {
  issue: AgenticGMVIssue;
  product?: ProductRecord;
  run?: ProductionValidationRun;
}) {
  return (
    input.run?.pivota_pdp_url ||
    String(input.product?.pivota_attributes?.pivota_pdp_url || "") ||
    String(input.issue.evidence?.pivota_pdp_url || "")
  );
}

function productObjectIdForContext(input: {
  issue: AgenticGMVIssue;
  product?: ProductRecord;
  run?: ProductionValidationRun;
}) {
  return (
    input.run?.pivota_product_entity_id ||
    String(input.product?.pivota_attributes?.pivota_product_object_id || "") ||
    input.issue.affected_product_entities[0] ||
    ""
  );
}

function productNameForContext(input: {
  product?: ProductRecord;
  run?: ProductionValidationRun;
  issue: AgenticGMVIssue;
}) {
  return input.run?.product_name || input.product?.title || input.issue.affected_product_entities[0] || "Product";
}

function patchContextSummary(context: PivotaOptimizationContext) {
  const productEntityId =
    context.product?.product_entity_id ||
    context.issue.affected_product_entities[0] ||
    productObjectIdForContext(context);
  return {
    product_entity_id: productEntityId,
    product_name: productNameForContext(context),
    brand: context.product?.brand || context.run?.brand || context.store.store_name,
    sku: context.product?.sku || context.run?.sku_name,
    category: context.product?.category || context.run?.category || context.store.primary_category,
    pivota_pdp_url: pivotaPdpUrlForContext(context),
    merchant_pdp_url: context.product?.pdp_url || context.run?.merchant_pdp_url || context.issue.store_url,
    merchant_name: context.run?.merchant_name || context.store.store_name,
    query_cluster_ids: context.issue.affected_query_clusters,
  };
}

function pivotaOptimizationBeforeState(context: PivotaOptimizationContext) {
  const state = getAgentCenterState();
  const productEntityId =
    context.product?.product_entity_id || context.issue.affected_product_entities[0];
  return {
    product: context.product
      ? {
          id: context.product.id,
          product_entity_id: context.product.product_entity_id,
          title: context.product.title,
          pivota_attributes: cloneJson(context.product.pivota_attributes || {}),
        }
      : null,
    query_clusters: state.queryClusters
      .filter(
        (cluster) =>
          cluster.scan_target_id === context.issue.scan_target_id &&
          (!productEntityId || cluster.product_entity_id === productEntityId)
      )
      .map((cluster) => ({
        id: cluster.id,
        intent_type: cluster.intent_type,
        queries: cluster.queries,
        required_attributes: cluster.required_attributes,
      })),
    pivota_offers: state.pivotaOffers
      .filter(
        (offer) =>
          offer.merchant_id === context.issue.merchant_id &&
          offer.store_id === context.issue.store_id &&
          (!productEntityId || offer.product_entity_id === productEntityId)
      )
      .map((offer) => ({
        id: offer.id,
        product_entity_id: offer.product_entity_id,
        sku_id: offer.sku_id,
        price: offer.price,
        currency: offer.currency,
        inventory_status: offer.inventory_status,
        attached_to_pivota_pdp: offer.attached_to_pivota_pdp,
        structured_data: (offer as unknown as Record<string, unknown>).structured_data,
      })),
  };
}

function patchPayloadForPivotaOptimization(
  context: PivotaOptimizationContext
): Record<string, unknown> {
  const summary = patchContextSummary(context);
  const sourceUrl = String(summary.merchant_pdp_url || "");
  const pivotaUrl = String(summary.pivota_pdp_url || "");
  const queryPhrases = unique([
    ...((context.action.patch_payload?.example_query_mappings as
      | string[]
      | undefined) || []),
    `${summary.brand || ""} ${summary.product_name}`.trim(),
    `${summary.product_name} official page`,
    `${summary.category || "skincare"} ${summary.product_name}`,
    `where to buy ${summary.product_name}`,
  ].filter(Boolean));
  const beautySignals = {
    skin_type:
      context.product?.attributes.skin_type ||
      context.product?.pivota_attributes.skin_type ||
      "not specified",
    finish:
      context.product?.attributes.finish ||
      context.product?.pivota_attributes.finish ||
      "not specified",
    active_ingredients:
      context.product?.attributes.active_ingredients ||
      context.product?.pivota_attributes.active_ingredients ||
      context.product?.attributes.ingredients ||
      "not specified",
    product_family:
      context.product?.attributes.product_family ||
      context.product?.category ||
      context.run?.category ||
      "skincare",
    claim_evidence:
      context.product?.attributes.claim_evidence ||
      "Use merchant source description, ingredient evidence, and public PDP copy as proof points.",
    use_case:
      context.product?.attributes.use_case ||
      `Help shoppers evaluate ${summary.product_name} for ${summary.category || "its target use case"}.`,
    texture:
      context.product?.attributes.texture ||
      context.product?.pivota_attributes.texture ||
      context.product?.attributes.finish ||
      "not specified",
    key_benefits:
      context.product?.attributes.key_benefits ||
      context.product?.attributes.benefits ||
      [
        "clear product identity",
        "source-backed buying path",
        "agent-readable product attributes",
      ],
  };

  if (context.patchType === "pivota_discovery_signal_patch") {
    return {
      title: `${summary.brand ? `${summary.brand} ` : ""}${summary.product_name}`.trim(),
      canonical_product_name: summary.product_name,
      brand: summary.brand,
      category: summary.category,
      concise_product_description:
        context.product?.agent_summary ||
        `${summary.product_name} is a ${summary.category || "product"} from ${summary.brand || summary.merchant_name}.`,
      agent_facing_summary:
        `Agent-facing PDP for ${summary.product_name}, linked to the official merchant source and optimized for product-name, category, and buying-path discovery.`,
      relevant_query_phrases: queryPhrases,
      buying_path_summary: pivotaUrl
        ? `Use ${pivotaUrl} as the Pivota agent-facing PDP and ${sourceUrl} as the official merchant source path.`
        : `Use ${sourceUrl} as the verified merchant source path until a Pivota PDP URL is available.`,
      source_issue_id: context.issue.id,
    };
  }

  if (context.patchType === "pivota_source_reference_patch") {
    return {
      verified_merchant_pdp_url: sourceUrl,
      source_merchant_name: summary.merchant_name,
      source_url: sourceUrl,
      source_type: "official_merchant_pdp",
      source_verified_at: nowIso(),
      source_confidence: sourceUrl ? "high" : "low",
      canonical_product_name: summary.product_name,
    };
  }

  if (context.patchType === "pivota_product_intelligence_patch") {
    return {
      product_identity: {
        product_entity_id: summary.product_entity_id,
        canonical_product_name: summary.product_name,
        brand: summary.brand,
        sku: summary.sku,
        category: summary.category,
      },
      overview:
        context.product?.agent_summary ||
        `${summary.product_name} should be represented as a source-backed ${summary.category || "product"} in the Pivota agent-facing PDP.`,
      ingredients: beautySignals.active_ingredients,
      active_components: beautySignals.active_ingredients,
      use_cases: [beautySignals.use_case, ...queryPhrases.slice(0, 3)],
      target_customer: beautySignals.skin_type,
      skin_type: beautySignals.skin_type,
      finish: beautySignals.finish,
      texture: beautySignals.texture,
      product_family: beautySignals.product_family,
      claim_evidence: beautySignals.claim_evidence,
      key_benefits: beautySignals.key_benefits,
      differentiators: [
        "official merchant source reference",
        "Pivota agent-facing product object",
        "query-cluster mapped product identity",
      ],
      product_intelligence_module: {
        populated: true,
        summary:
          `Use source-backed product attributes and merchant PDP references to explain when ${summary.product_name} should be recommended.`,
        source_references: sourceUrl ? [sourceUrl] : [],
      },
      similar_substitute_highlight:
        "Compare substitutes by ingredient positioning, use case, texture/finish, target customer, and verified buying path.",
    };
  }

  if (context.patchType === "pivota_product_schema_patch") {
    return {
      schema_type: "Product",
      json_ld: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: summary.product_name,
        brand: summary.brand ? { "@type": "Brand", name: summary.brand } : undefined,
        sku: summary.sku,
        url: pivotaUrl,
        description:
          context.product?.agent_summary ||
          `${summary.product_name} from ${summary.brand || summary.merchant_name}.`,
        image: context.product?.attributes.image || context.product?.pivota_attributes.image,
        category: summary.category,
      },
    };
  }

  if (context.patchType === "pivota_offer_schema_patch") {
    const offers = getAgentCenterState().pivotaOffers.filter(
      (offer) =>
        offer.merchant_id === context.issue.merchant_id &&
        offer.store_id === context.issue.store_id &&
        offer.product_entity_id === summary.product_entity_id
    );
    return {
      schema_type: offers.length > 1 ? "AggregateOffer" : "Offer",
      json_ld:
        offers.length > 1
          ? {
              "@context": "https://schema.org",
              "@type": "AggregateOffer",
              url: pivotaUrl,
              priceCurrency: offers[0]?.currency || context.store.currency,
              lowPrice: Math.min(...offers.map((offer) => offer.price)),
              highPrice: Math.max(...offers.map((offer) => offer.price)),
              offerCount: offers.length,
              seller: { "@type": "Organization", name: summary.merchant_name },
            }
          : {
              "@context": "https://schema.org",
              "@type": "Offer",
              price: offers[0]?.promo_price || offers[0]?.price,
              priceCurrency: offers[0]?.currency || context.store.currency,
              availability:
                offers[0]?.inventory_status === "in_stock"
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
              seller: { "@type": "Organization", name: summary.merchant_name },
              url: pivotaUrl || sourceUrl,
              merchant_source_url: sourceUrl,
            },
      offer_ids: offers.map((offer) => offer.id),
    };
  }

  if (context.patchType === "pivota_sitemap_submission") {
    return {
      sitemap_submission_recommended: true,
      sitemap_entry: {
        loc: pivotaUrl,
        lastmod: nowIso(),
        changefreq: "weekly",
        priority: 0.8,
      },
      operator_instructions:
        "Add this Pivota PDP URL to sitemap and request indexing.",
    };
  }

  if (context.patchType === "query_cluster_mapping_patch") {
    return {
      product_entity_id: summary.product_entity_id,
      organic_query_clusters: queryPhrases.slice(0, 4),
      product_name_discovery_queries: [
        `${summary.product_name}`,
        `${summary.brand || ""} ${summary.product_name}`.trim(),
        `${summary.product_name} official`,
      ],
      buying_path_discovery_queries: [
        `where to buy ${summary.product_name}`,
        `${summary.product_name} official store`,
        `${summary.product_name} Pivota`,
      ],
      category_use_case_queries: queryPhrases,
      source_issue_id: context.issue.id,
    };
  }

  return {
    product_entity_id: summary.product_entity_id,
    competitor_brands:
      context.issue.evidence?.top_competitors ||
      context.store.competitor_brands ||
      [],
    competitor_products:
      context.issue.evidence?.top_competitor_recommendations ||
      context.store.competitor_products ||
      [],
    substitute_relationships: "compare_by_use_case_ingredient_texture_and_buying_path",
    differentiation_notes: [
      "Clarify product use cases where the target should win.",
      "Attach competitor/substitute relationships to affected query clusters.",
      "Use verified source references to distinguish official Pivota/merchant paths from third-party URLs.",
    ],
    query_clusters_where_competitors_dominated: context.issue.affected_query_clusters,
  };
}

export class PivotaOptimizationService {
  list(issueId: string) {
    findIssue(issueId);
    return pivotaOptimizationPatchesForIssue(issueId);
  }

  generate(
    issueId: string,
    options: { action_id?: string; regenerate?: boolean } = {}
  ) {
    const issue = findIssue(issueId);
    const plan = new IssueResolutionService().generate(issueId);
    const contexts = this.optimizationContexts(issue, plan, options.action_id);
    if (!contexts.length) {
      throw new Error(
        "No Pivota-owned optimization action is available for this issue"
      );
    }

    const patches = contexts.map((context) => {
      const existing = pivotaOptimizationPatchesForIssue(issueId).find(
        (patch) =>
          !options.regenerate &&
          patch.patch_type === context.patchType &&
          patch.action_ids.includes(context.action.id)
      );
      if (existing) return existing;

      const now = nowIso();
      const patch: PivotaOptimizationPatch = {
        id: nextId("pivota_optimization"),
        merchant_id: issue.merchant_id,
        store_id: issue.store_id,
        product_entity_id:
          context.product?.product_entity_id ||
          issue.affected_product_entities[0] ||
          productObjectIdForContext(context),
        pivota_pdp_url: pivotaPdpUrlForContext(context) || undefined,
        source_issue_ids: [issue.id],
        resolution_plan_id: plan.id,
        action_ids: [context.action.id],
        patch_type: context.patchType,
        target_layer: pivotaOptimizationTargetLayer(context.patchType),
        status: "proposed",
        before_state: pivotaOptimizationBeforeState(context),
        patch_payload: patchPayloadForPivotaOptimization(context),
        evidence: {
          issue_id: issue.id,
          issue_type: issue.issue_type,
          blocker_type: plan.blocker_type,
          action_type: context.action.action_type,
          target_layer: context.action.target_layer,
          safe_for_v1: true,
          merchant_writeback: false,
        },
        notes:
          "Pivota-owned optimization patch only updates Pivota Agent Center/PDP/product-graph state. It does not write to merchant production systems.",
        created_at: now,
        updated_at: now,
      };
      storePivotaOptimizationPatch(plan, patch);
      return patch;
    });

    return patches;
  }

  apply(
    issueId: string,
    options: { patch_id?: string; applied_by?: string } = {}
  ) {
    const issue = findIssue(issueId);
    const plan = new IssueResolutionService().generate(issueId);
    let patches = pivotaOptimizationPatchesForIssue(issueId);
    if (!patches.length) patches = this.generate(issueId);
    const scoped = options.patch_id
      ? patches.filter((patch) => patch.id === options.patch_id)
      : patches.filter((patch) => patch.status === "proposed");
    if (!scoped.length) {
      throw new Error("No proposed Pivota optimization patch found to apply");
    }

    return scoped.map((patch) => this.applyPatch(issue, plan, patch, options.applied_by));
  }

  async rerunAfterOptimization(issueId: string) {
    const issue = findIssue(issueId);
    const target = findScanTarget(issue.scan_target_id);
    const plan = new IssueResolutionService().generate(issueId);
    const beforeMode = target.scan_mode;
    const nextMode = this.rerunModeForPlan(plan);
    if (nextMode) {
      target.scan_mode = nextMode;
      touch(target);
    }

    const beforeSnapshot = latestByCreatedAt(
      getAgentCenterState().gmvAssuranceSnapshots.filter(
        (snapshot) =>
          snapshot.scan_target_id === issue.scan_target_id &&
          snapshot.issue_ids.includes(issue.id)
      )
    );
    let verification: VerificationRun | undefined;
    let productDiagnosis: ProductUnderstandingDiagnosis | undefined;
    try {
      if (
        plan.blocker_type === "pivota_pdp_readiness_gap" ||
        plan.blocker_type === "pivota_pdp_content_quality_gap" ||
        plan.blocker_type === "pivota_product_intelligence_gap"
      ) {
        productDiagnosis = new ProductUnderstandingService().runDiagnosis(issue.id);
      }
      verification = await new VerificationService().retestIssue(issue.id);
    } finally {
      target.scan_mode = beforeMode;
      touch(target);
    }

    const snapshot = new GMVAssuranceService().createSnapshot({
      merchant_id: issue.merchant_id,
      store_id: issue.store_id,
      scan_target_id: issue.scan_target_id,
      product_entity_id: issue.affected_product_entities[0],
    });
    const result = this.rerunResult({
      issue,
      verification,
      productDiagnosis,
      beforeSnapshot,
      afterSnapshot: snapshot,
    });
    plan.retest_result = result;
    touch(plan);
    for (const patch of pivotaOptimizationPatchesForIssue(issueId).filter(
      (item) => item.status === "applied"
    )) {
      patch.rerun_result = result;
      touch(patch);
      storePivotaOptimizationPatch(plan, patch);
    }
    return result;
  }

  private optimizationContexts(
    issue: AgenticGMVIssue,
    plan: IssueResolutionPlan,
    actionId?: string
  ): PivotaOptimizationContext[] {
    const store = findStore(issue.store_id);
    const target = findScanTarget(issue.scan_target_id);
    const clusters = getAgentCenterState().queryClusters.filter(
      (cluster) => cluster.scan_target_id === issue.scan_target_id
    );
    const product = findProductForIssue(store, issue, clusters);
    const run = latestProductionValidationRunForIssue(issue.id);
    const candidateActions = [
      ...plan.recommended_actions,
      ...fallbackPivotaOptimizationActions(issue, plan),
    ];
    const seenPatchTypes = new Set<PivotaOptimizationPatchType>();
    return candidateActions
      .filter((action) => !actionId || action.id === actionId)
      .filter(isPivotaOwnedOptimizationAction)
      .map((action) => ({
        issue,
        plan,
        action,
        patchType: pivotaOptimizationPatchTypeForAction(action)!,
        store,
        target,
        product,
        run,
      }))
      .filter((context) => {
        if (actionId) return true;
        if (seenPatchTypes.has(context.patchType)) return false;
        seenPatchTypes.add(context.patchType);
        return true;
      });
  }

  private applyPatch(
    issue: AgenticGMVIssue,
    plan: IssueResolutionPlan,
    patch: PivotaOptimizationPatch,
    appliedBy = "pivota_internal"
  ) {
    if (patch.status === "applied") return patch;
    const action = plan.recommended_actions.find((item) =>
      patch.action_ids.includes(item.id)
    );
    if (action && !isPivotaOwnedOptimizationAction(action)) {
      throw new Error("Merchant-owned actions cannot be applied by Pivota optimization");
    }

    const store = findStore(issue.store_id);
    const product = findProductForIssue(
      store,
      issue,
      getAgentCenterState().queryClusters.filter(
        (cluster) => cluster.scan_target_id === issue.scan_target_id
      )
    );
    if (product) {
      this.applyPatchToProduct(product, patch);
      getAgentCenterRepository().upsert("stores", store);
    }
    this.applyPatchToQueryClusters(issue, patch);
    this.applyPatchToPivotaOffers(issue, patch);

    const context: PivotaOptimizationContext = {
      issue,
      plan,
      action:
        action ||
        fallbackPivotaOptimizationActions(issue, plan).find((item) =>
          patch.action_ids.includes(item.id)
        ) ||
        ({
          id: patch.action_ids[0] || patch.id,
          action_type: patch.patch_type,
          title: patch.patch_type,
          description: patch.patch_type,
          target_layer: patch.target_layer,
          requires_merchant_approval: false,
          can_apply_automatically: true,
          patch_payload: patch.patch_payload,
          status: "proposed",
          evidence: {},
          expected_impact: "",
        } as RecommendedAction),
      patchType: patch.patch_type,
      store,
      target: findScanTarget(issue.scan_target_id),
      product,
      run: latestProductionValidationRunForIssue(issue.id),
    };
    patch.after_state = pivotaOptimizationBeforeState(context);
    patch.status = "applied";
    patch.applied_at = nowIso();
    patch.applied_by = appliedBy;
    const usageEvent = new UsageMeteringService().recordPivotaOptimization({
      issue,
      patch,
    });
    patch.usage_event_ids = unique([...(patch.usage_event_ids || []), usageEvent.id]);
    touch(patch);

    if (action) {
      action.status = "applied";
      touch(plan);
    }
    plan.pivota_internal_status = "applied";
    plan.status = "ready_for_retest";
    storePivotaOptimizationPatch(plan, patch);
    return patch;
  }

  private applyPatchToProduct(product: ProductRecord, patch: PivotaOptimizationPatch) {
    const attrs = product.pivota_attributes || {};
    if (
      patch.patch_type === "pivota_discovery_signal_patch" ||
      patch.patch_type === "pivota_source_reference_patch" ||
      patch.patch_type === "pivota_product_intelligence_patch" ||
      patch.patch_type === "pivota_sitemap_submission" ||
      patch.patch_type === "query_cluster_mapping_patch" ||
      patch.patch_type === "competitor_substitute_graph_patch"
    ) {
      product.pivota_attributes = {
        ...attrs,
        [patch.patch_type]: patch.patch_payload,
        ...(patch.patch_type === "pivota_discovery_signal_patch"
          ? {
              title: patch.patch_payload.title,
              canonical_product_name: patch.patch_payload.canonical_product_name,
              brand: patch.patch_payload.brand,
              category: patch.patch_payload.category,
              agent_summary: patch.patch_payload.agent_facing_summary,
              relevant_query_phrases: patch.patch_payload.relevant_query_phrases,
              buying_path_summary: patch.patch_payload.buying_path_summary,
            }
          : {}),
        ...(patch.patch_type === "pivota_source_reference_patch"
          ? {
              source_references: [
                ...(Array.isArray(attrs.source_references)
                  ? attrs.source_references
                  : []),
                patch.patch_payload,
              ],
              verified_merchant_pdp_url:
                patch.patch_payload.verified_merchant_pdp_url,
            }
          : {}),
        ...(patch.patch_type === "pivota_product_intelligence_patch"
          ? {
              product_identity: patch.patch_payload.product_identity,
              overview: patch.patch_payload.overview,
              product_intelligence_module:
                patch.patch_payload.product_intelligence_module,
              similar_substitute_highlight:
                patch.patch_payload.similar_substitute_highlight,
              skin_type: patch.patch_payload.skin_type,
              finish: patch.patch_payload.finish,
              active_ingredients: patch.patch_payload.active_ingredients,
              product_family: patch.patch_payload.product_family,
              claim_evidence: patch.patch_payload.claim_evidence,
              use_case: patch.patch_payload.use_case,
              texture: patch.patch_payload.texture,
              key_benefits: patch.patch_payload.key_benefits,
            }
          : {}),
      };
    }

    if (
      patch.patch_type === "pivota_product_schema_patch" ||
      patch.patch_type === "pivota_offer_schema_patch"
    ) {
      product.pivota_attributes = {
        ...attrs,
        structured_data: {
          ...((attrs.structured_data as Record<string, unknown> | undefined) || {}),
          [patch.patch_type === "pivota_product_schema_patch"
            ? "product_schema"
            : "offer_schema"]: patch.patch_payload,
        },
      };
    }
  }

  private applyPatchToQueryClusters(issue: AgenticGMVIssue, patch: PivotaOptimizationPatch) {
    if (
      patch.patch_type !== "query_cluster_mapping_patch" &&
      patch.patch_type !== "competitor_substitute_graph_patch"
    ) {
      return;
    }
    const state = getAgentCenterState();
    const clusters = state.queryClusters.filter(
      (cluster) =>
        cluster.scan_target_id === issue.scan_target_id &&
        issue.affected_query_clusters.includes(cluster.id)
    );
    const queryPayload =
      patch.patch_type === "query_cluster_mapping_patch"
        ? [
            ...((patch.patch_payload.organic_query_clusters as
              | string[]
              | undefined) || []),
            ...((patch.patch_payload.product_name_discovery_queries as
              | string[]
              | undefined) || []),
            ...((patch.patch_payload.buying_path_discovery_queries as
              | string[]
              | undefined) || []),
            ...((patch.patch_payload.category_use_case_queries as
              | string[]
              | undefined) || []),
          ]
        : ((patch.patch_payload.query_clusters_where_competitors_dominated as
            | string[]
            | undefined) || []);
    for (const cluster of clusters) {
      cluster.product_entity_id =
        patch.product_entity_id || issue.affected_product_entities[0];
      cluster.queries = unique([...cluster.queries, ...queryPayload]);
      cluster.required_attributes = unique([
        ...cluster.required_attributes,
        "source_reference",
        "product_identity",
      ]);
      touch(cluster);
    }
  }

  private applyPatchToPivotaOffers(issue: AgenticGMVIssue, patch: PivotaOptimizationPatch) {
    if (patch.patch_type !== "pivota_offer_schema_patch") return;
    const state = getAgentCenterState();
    for (const offer of state.pivotaOffers.filter(
      (item) =>
        item.merchant_id === issue.merchant_id &&
        item.store_id === issue.store_id &&
        item.product_entity_id === patch.product_entity_id
    )) {
      (offer as unknown as Record<string, unknown>).structured_data = {
        ...(((offer as unknown as Record<string, unknown>).structured_data as
          | Record<string, unknown>
          | undefined) || {}),
        offer_schema: patch.patch_payload,
      };
      touch(offer);
    }
  }

  private rerunModeForPlan(plan: IssueResolutionPlan): ScanMode | undefined {
    if (plan.blocker_type === "competitor_dominance") {
      return "organic_product_discovery_test";
    }
    if (
      plan.blocker_type === "pivota_pdp_not_discovered" ||
      plan.blocker_type === "wrong_buying_path_returned"
    ) {
      return "search_grounded_product_discovery_test";
    }
    if (
      plan.blocker_type === "pivota_pdp_readiness_gap" ||
      plan.blocker_type === "pivota_pdp_content_quality_gap" ||
      plan.blocker_type === "pivota_product_intelligence_gap" ||
      plan.blocker_type === "pivota_pdp_attribution_gap" ||
      plan.blocker_type === "unverified_pivota_attribution"
    ) {
      return "pivota_pdp_attribution_test";
    }
    return plan.verification_plan.scan_mode as ScanMode | undefined;
  }

  private rerunResult(input: {
    issue: AgenticGMVIssue;
    verification?: VerificationRun;
    productDiagnosis?: ProductUnderstandingDiagnosis;
    beforeSnapshot?: GMVAssuranceSnapshot;
    afterSnapshot: GMVAssuranceSnapshot;
  }) {
    const beforeScores =
      input.verification?.before_scores.aggregate_scores ||
      input.beforeSnapshot?.discovery_readiness_summary;
    const afterScores = input.verification?.after_scores.aggregate_scores;
    const pivotaBefore =
      typeof beforeScores === "object" && beforeScores
        ? (beforeScores as Record<string, unknown>).search_grounded_pivota_pdp_discovery_score ||
          (beforeScores as Record<string, unknown>).pivota_pdp_visibility_score
        : undefined;
    const pivotaAfter =
      afterScores?.search_grounded_pivota_pdp_discovery_score ??
      afterScores?.pivota_pdp_visibility_score;
    const numericDelta =
      typeof pivotaBefore === "number" && typeof pivotaAfter === "number"
        ? pivotaAfter - pivotaBefore
        : undefined;
    return {
      status: "completed",
      source_agent: "pivota_optimization_workflow",
      verification_run_id: input.verification?.id,
      product_diagnosis_id: input.productDiagnosis?.id,
      gmv_assurance_snapshot_id: input.afterSnapshot.id,
      before_scores: input.verification?.before_scores,
      after_scores: input.verification?.after_scores,
      score_delta: input.verification?.score_delta,
      comparable_score_delta: numericDelta,
      uplift_claim_allowed: typeof numericDelta === "number" && numericDelta > 0,
      merchant_copy:
        typeof numericDelta === "number" && numericDelta > 0
          ? "Pivota-owned optimization improved the comparable validation score in the rerun."
          : "Pivota-owned readiness improved, but search-grounded discovery has not yet returned the Pivota PDP. Indexing may require more time or external search engine ingestion.",
    };
  }
}

type CreateAssuranceSnapshotInput = {
  merchant_id?: string;
  store_id?: string;
  scan_target_id?: string;
  product_entity_id?: string;
  assurance_scope?: "full_assurance" | "readiness_only";
};

const PIVOTA_PDP_QUALITY_FINDING_TYPES = [
  "missing_pdp_identity",
  "product_intel_module_empty_or_blocked",
  "missing_overview_from_available_description",
  "similar_card_missing_highlight",
] as const;

const PIVOTA_PDP_QUALITY_NEXT_ACTION =
  "Complete Pivota PDP identity, overview, product intelligence module, and similar-card highlight, then rerun Pivota PDP Attribution Test and GMV Assurance Snapshot.";

const PIVOTA_PDP_QUALITY_MERCHANT_SUMMARY =
  "Merchant-owned PDP attribution passed. The main readiness gap is on the Pivota agent-facing PDP layer.";

const ORGANIC_DISCOVERY_NEXT_ACTION =
  "Strengthen merchant and Pivota discovery signals, update query cluster mapping, then rerun Organic Product Discovery Test.";

const COMPETITOR_DOMINANCE_NEXT_ACTION =
  "Analyze dominant competitor matches, add differentiation evidence, update substitute/query mappings, then rerun Organic Product Discovery Test.";

const DISCOVERY_VS_READINESS_CONTEXTUAL_PASSED =
  "Your merchant-owned and Pivota paths were returned correctly when product/PDP context was provided. However, the product did not appear in no-context organic discovery prompts, and competitors dominated those prompts. This means the buying paths appear ready when surfaced, but discovery signals need to improve before AI users can naturally reach this product. Contextual attribution passed does not mean organic discovery passed. Search-grounded discovery is separate from both organic discovery and contextual attribution.";

function isPivotaPdpQualityFinding(value: string) {
  return (PIVOTA_PDP_QUALITY_FINDING_TYPES as readonly string[]).includes(value);
}

function collectPivotaPdpQualityFindings(value: unknown): string[] {
  if (typeof value === "string") {
    return isPivotaPdpQualityFinding(value) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return unique(value.flatMap((item) => collectPivotaPdpQualityFindings(item)));
  }
  if (value && typeof value === "object") {
    return unique(
      Object.values(value as Record<string, unknown>).flatMap((item) =>
        collectPivotaPdpQualityFindings(item)
      )
    );
  }
  return [];
}

function pivotaPdpQualityFindingsFromIssue(issue?: AgenticGMVIssue) {
  return issue ? collectPivotaPdpQualityFindings(issue.evidence) : [];
}

function scoreFromDimension(summary: GMVAssuranceDimensionSummary) {
  return typeof summary.score === "number" ? summary.score : undefined;
}

function issueForTypes(
  issues: AgenticGMVIssue[],
  types: AgenticGMVIssueType[]
) {
  return issues.find((issue) => types.includes(issue.issue_type));
}

function preferredAssuranceScore(scores: DemandVisibilityScore[]) {
  return (
    latestByCreatedAt(
      scores.filter((score) => Boolean(score.provider_scores.production_validation))
    ) || latestByCreatedAt(scores)
  );
}

function dimensionNeedsWork(summary: GMVAssuranceDimensionSummary) {
  return summary.status === "needs_work" || summary.status === "blocked";
}

function severityValue(severity: Severity) {
  const rank: Record<Severity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return rank[severity];
}

function isValidationAnchorIssue(issue?: AgenticGMVIssue) {
  return Boolean(issue?.evidence?.validation_anchor);
}

function isLowSeverityHumanReviewPlaceholder(issue?: AgenticGMVIssue) {
  return (
    issue?.severity === "low" &&
    (issue.issue_type === "human_review_required" ||
      issue.fix_targets.every((target) => target === "human_review"))
  );
}

function issueEligibleForTopBlocker(input: {
  issue?: AgenticGMVIssue;
  dimension: GMVAssuranceDimensionSummary;
  blockerType: string;
}) {
  const { issue, dimension, blockerType } = input;
  if (!dimensionNeedsWork(dimension)) return false;
  if (!issue) return true;
  if (issue.blocker_eligible || issue.evidence?.blocker_eligible === true) {
    return true;
  }
  if (isValidationAnchorIssue(issue)) {
    return blockerType !== issue.issue_type && blockerType !== "human_review_required";
  }
  if (isLowSeverityHumanReviewPlaceholder(issue)) return false;
  return severityValue(issue.severity) >= severityValue("medium") || dimensionNeedsWork(dimension);
}

function inverseScoreStatus(score?: VisibilityScoreValue, passAtOrBelow = 20, blockAt = 60) {
  if (score === "not_configured") return "not_configured" as const;
  if (score === undefined || score === "not_tested") {
    return "not_tested" as const;
  }
  if (score >= blockAt) return "blocked" as const;
  return score <= passAtOrBelow ? ("passed" as const) : ("needs_work" as const);
}

function applyResolutionPlansToSnapshot(snapshot: GMVAssuranceSnapshot) {
  for (const blocker of snapshot.top_blockers) {
    if (!blocker.issue_id) continue;
    const plan = latestIssueResolutionPlan(blocker.issue_id);
    const action = nextResolutionAction(plan);
    if (!plan || !action) continue;
    blocker.resolution_plan_id = plan.id;
    blocker.recommended_action =
      discoveryResolutionNextAction(blocker.blocker_type) || action.title;
  }
  snapshot.recommended_next_actions = unique(
    [
      ...snapshot.top_blockers.map((blocker) => blocker.recommended_action),
      ...snapshot.recommended_next_actions,
    ].filter(Boolean)
  );
  return snapshot;
}

export class GMVAssuranceService {
  list(merchantId = DEMO_MERCHANT_ID) {
    return getAgentCenterState().gmvAssuranceSnapshots.filter(
      (snapshot) => snapshot.merchant_id === merchantId
    );
  }

  get(snapshotId: string) {
    const snapshot = getAgentCenterState().gmvAssuranceSnapshots.find(
      (item) => item.id === snapshotId
    );
    if (!snapshot) throw new Error(`GMV assurance snapshot not found: ${snapshotId}`);
    return snapshot;
  }

  latest(merchantId = DEMO_MERCHANT_ID) {
    const snapshot = latestByCreatedAt(this.list(merchantId)) || null;
    if (!snapshot) return null;
    const applied = applyResolutionPlansToSnapshot(snapshot);
    if (applied.product_entity_id) {
      applied.pivota_discovery_progress = pivotaDiscoveryProgressFor({
        product_entity_id: applied.product_entity_id,
      });
    }
    return applied;
  }

  overview(merchantId = DEMO_MERCHANT_ID) {
    const latest = this.latest(merchantId);
    const snapshots = this.list(merchantId).slice(-10).reverse().map((snapshot) => {
      const applied = applyResolutionPlansToSnapshot(snapshot);
      if (applied.product_entity_id) {
        applied.pivota_discovery_progress = pivotaDiscoveryProgressFor({
          product_entity_id: applied.product_entity_id,
        });
      }
      return applied;
    });
    return {
      latest_snapshot: latest,
      snapshots,
    };
  }

  createSnapshot(input: CreateAssuranceSnapshotInput = {}) {
    const state = getAgentCenterState();
    const merchantId = getMerchantId(input.merchant_id);
    const target =
      input.scan_target_id
        ? findScanTarget(input.scan_target_id)
        : latestByCreatedAt(
            state.scanTargets.filter(
              (item) =>
                item.merchant_id === merchantId &&
                (!input.store_id || item.store_id === input.store_id)
            )
          );
    if (!target) throw new Error("No scan target found for GMV assurance snapshot");
    const store = findStore(target.store_id);
    const productEntityId =
      input.product_entity_id ||
      latestByCreatedAt(
        state.scores.filter((score) => score.scan_target_id === target.id)
      )?.product_entity_id ||
      store.products?.find((product) =>
        target.selected_product_ids.includes(product.id)
      )?.product_entity_id;

    const scores = state.scores.filter(
      (score) =>
        score.scan_target_id === target.id &&
        (!productEntityId || score.product_entity_id === productEntityId)
    );
    const latestScore = preferredAssuranceScore(scores);
    const issues = state.issues.filter(
      (issue) =>
        issue.merchant_id === merchantId &&
        issue.store_id === target.store_id &&
        issue.scan_target_id === target.id &&
        (!productEntityId ||
          issue.affected_product_entities.includes(productEntityId)) &&
        activeIssue(issue)
    );
    const issueIds = issues.map((issue) => issue.id);
    const productDiagnosis = latestByCreatedAt(
      state.productUnderstandingDiagnoses.filter((diagnosis) =>
        issueIds.includes(diagnosis.issue_id)
      )
    );
    const offerDiagnosis = latestByCreatedAt(
      state.offerExecutionDiagnoses.filter((diagnosis) =>
        issueIds.includes(diagnosis.issue_id)
      )
    );
    const checkoutDiagnosis = latestByCreatedAt(
      state.checkoutVerificationDiagnoses.filter((diagnosis) =>
        issueIds.includes(diagnosis.issue_id)
      )
    );

    const productVisibilityScore =
      latestScore?.aggregate_scores.product_entity_visibility_score;
    const merchantAttributionScore =
      latestScore?.aggregate_scores.merchant_store_visibility_score;
    const pivotaAttributionScore =
      latestScore?.aggregate_scores.pivota_pdp_visibility_score;
    const assuranceScope = input.assurance_scope || "full_assurance";
    const organicProductDiscoveryScore =
      latestScore?.aggregate_scores.organic_product_discovery_score;
    const merchantPdpDiscoveryScore =
      latestScore?.aggregate_scores.search_grounded_merchant_pdp_discovery_score;
    const pivotaPdpDiscoveryScore =
      latestScore?.aggregate_scores.search_grounded_pivota_pdp_discovery_score;
    const buyingPathDiscoveryScore =
      latestScore?.aggregate_scores.buying_path_discovery_score;
    const competitorDominanceScore =
      latestScore?.aggregate_scores.competitor_dominance_score;
    const organicDiscoveryIssue = issueForTypes(issues, [
      "organic_product_not_discovered",
      "organic_brand_not_discovered",
      "competitor_dominance",
    ]);
    const merchantPdpDiscoveryIssue = issueForTypes(issues, [
      "merchant_pdp_not_discovered",
      "wrong_buying_path_returned",
      "search_grounding_not_configured",
    ]);
    const pivotaPdpDiscoveryIssue = issueForTypes(issues, [
      "pivota_pdp_not_discovered",
      "wrong_buying_path_returned",
      "search_grounding_not_configured",
    ]);
    const buyingPathDiscoveryIssue = issueForTypes(issues, [
      "buying_path_missing",
      "wrong_buying_path_returned",
      "offer_not_discovered",
    ]);
    const competitorDominanceIssue = issueForTypes(issues, ["competitor_dominance"]);
    const organicDiscoveryStatusValue = scoreStatus(
      organicProductDiscoveryScore,
      80,
      40
    );
    const organicDiscoveryStatus: GMVAssuranceDimensionSummary = {
      status: organicDiscoveryStatusValue,
      score: organicProductDiscoveryScore ?? "not_tested",
      issue_id:
        organicDiscoveryStatusValue === "passed" ? undefined : organicDiscoveryIssue?.id,
      recommended_next_action:
        organicProductDiscoveryScore === undefined ||
        organicProductDiscoveryScore === "not_tested"
          ? "Run Organic Product Discovery Test."
          : organicProductDiscoveryScore === "not_configured"
            ? "Configure discovery provider before organic discovery."
            : organicProductDiscoveryScore < 40
              ? ORGANIC_DISCOVERY_NEXT_ACTION
              : "Monitor organic product discovery.",
      evidence:
        organicProductDiscoveryScore === undefined ||
        organicProductDiscoveryScore === "not_tested"
          ? "Organic no-context product discovery has not been tested."
          : organicProductDiscoveryScore === "not_configured"
            ? "Organic discovery provider is not configured."
            : `Organic product discovery score is ${organicProductDiscoveryScore}.`,
    };
    const merchantPdpDiscoveryStatusValue = scoreStatus(
      merchantPdpDiscoveryScore,
      80,
      40
    );
    const merchantPdpDiscoveryStatus: GMVAssuranceDimensionSummary = {
      status: merchantPdpDiscoveryStatusValue,
      score: merchantPdpDiscoveryScore ?? "not_tested",
      issue_id:
        merchantPdpDiscoveryStatusValue === "passed"
          ? undefined
          : merchantPdpDiscoveryIssue?.id,
      recommended_next_action:
        merchantPdpDiscoveryScore === "not_configured"
          ? "Configure Gemini search grounding before Search-Grounded Product Discovery."
          : merchantPdpDiscoveryScore === undefined ||
              merchantPdpDiscoveryScore === "not_tested"
            ? "Run Search-Grounded Product Discovery Test."
            : merchantPdpDiscoveryScore < 40
              ? "Improve merchant PDP discovery signals and rerun search-grounded discovery."
              : "Monitor merchant PDP discovery.",
      evidence:
        merchantPdpDiscoveryScore === "not_configured"
          ? "Gemini search grounding is not configured; contextual attribution was not used as a fallback."
          : merchantPdpDiscoveryScore === undefined ||
              merchantPdpDiscoveryScore === "not_tested"
            ? "Merchant PDP search-grounded discovery has not been tested."
            : `Merchant PDP discovery score is ${merchantPdpDiscoveryScore}.`,
    };
    const pivotaPdpDiscoveryStatusValue = scoreStatus(
      pivotaPdpDiscoveryScore,
      80,
      40
    );
    const pivotaPdpDiscoveryStatus: GMVAssuranceDimensionSummary = {
      status: pivotaPdpDiscoveryStatusValue,
      score: pivotaPdpDiscoveryScore ?? "not_tested",
      issue_id:
        pivotaPdpDiscoveryStatusValue === "passed"
          ? undefined
          : pivotaPdpDiscoveryIssue?.id,
      recommended_next_action:
        pivotaPdpDiscoveryScore === "not_configured"
          ? "Configure Gemini search grounding before Pivota PDP discovery."
          : pivotaPdpDiscoveryScore === undefined ||
              pivotaPdpDiscoveryScore === "not_tested"
            ? "Run Search-Grounded Product Discovery or Buying Path Discovery for the Pivota PDP."
            : pivotaPdpDiscoveryScore < 40
              ? "Improve Pivota PDP discovery signals and rerun discovery."
              : "Monitor Pivota PDP discovery.",
      evidence:
        pivotaPdpDiscoveryScore === "not_configured"
          ? "Gemini search grounding is not configured; contextual attribution was not used as a fallback."
          : pivotaPdpDiscoveryScore === undefined ||
              pivotaPdpDiscoveryScore === "not_tested"
            ? "Pivota PDP discovery has not been tested."
            : `Pivota PDP discovery score is ${pivotaPdpDiscoveryScore}.`,
    };
    const buyingPathDiscoveryStatusValue = scoreStatus(
      buyingPathDiscoveryScore,
      80,
      40
    );
    const buyingPathDiscoveryStatus: GMVAssuranceDimensionSummary = {
      status: buyingPathDiscoveryStatusValue,
      score: buyingPathDiscoveryScore ?? "not_tested",
      issue_id:
        buyingPathDiscoveryStatusValue === "passed"
          ? undefined
          : buyingPathDiscoveryIssue?.id,
      recommended_next_action:
        buyingPathDiscoveryScore === undefined ||
        buyingPathDiscoveryScore === "not_tested"
          ? "Run Buying Path Discovery Test."
          : buyingPathDiscoveryScore === "not_configured"
            ? "Configure discovery provider before buying-path discovery."
            : buyingPathDiscoveryScore < 40
              ? "Improve official buying-path signals and rerun Buying Path Discovery."
              : "Monitor buying-path discovery.",
      evidence:
        buyingPathDiscoveryScore === undefined ||
        buyingPathDiscoveryScore === "not_tested"
          ? "Buying-path discovery has not been tested."
          : buyingPathDiscoveryScore === "not_configured"
            ? "Buying-path discovery provider is not configured."
            : `Buying path discovery score is ${buyingPathDiscoveryScore}.`,
    };
    const competitorDominanceStatusValue = inverseScoreStatus(
      competitorDominanceScore,
      20,
      60
    );
    const competitorDominanceStatus: GMVAssuranceDimensionSummary = {
      status: competitorDominanceStatusValue,
      score: competitorDominanceScore ?? "not_tested",
      issue_id:
        competitorDominanceStatusValue === "passed"
          ? undefined
          : competitorDominanceIssue?.id,
      recommended_next_action:
        competitorDominanceScore === undefined ||
        competitorDominanceScore === "not_tested"
          ? "Run discovery tests to measure competitor dominance."
          : competitorDominanceScore === "not_configured"
            ? "Configure discovery provider before measuring competitor dominance."
            : competitorDominanceScore >= 60
              ? COMPETITOR_DOMINANCE_NEXT_ACTION
              : "Monitor competitor dominance.",
      evidence:
        competitorDominanceScore === undefined ||
        competitorDominanceScore === "not_tested"
          ? "Competitor dominance has not been tested in discovery mode."
          : competitorDominanceScore === "not_configured"
            ? "Competitor dominance provider is not configured."
            : `Competitor dominance score is ${competitorDominanceScore}; lower is better.`,
    };
    const productVisibilityIssue = issueForTypes(issues, [
      "ai_visibility_loss",
      "competitor_substitution",
    ]);
    const productVisibilityStatus: GMVAssuranceDimensionSummary = {
      status: scoreStatus(productVisibilityScore, 80, 50),
      score: productVisibilityScore ?? "not_tested",
      issue_id: productVisibilityIssue?.id,
      recommended_next_action:
        productVisibilityScore === undefined
          ? "Run an Open Product Visibility Test."
          : productVisibilityScore < 50
            ? "Improve product discoverability and rerun Demand Test."
            : "Monitor product/entity visibility.",
      evidence:
        productVisibilityScore === undefined
          ? "No Demand Test score is available for this scan target."
          : `Product entity visibility score is ${productVisibilityScore}.`,
    };

    const merchantRequired = [
      "merchant_store_attribution_test",
      "agentic_execution_test",
      "checkout_aware_gmv_scan",
    ].includes(target.scan_mode);
    const merchantAttributionIssue = issueForTypes(issues, [
      "merchant_store_attribution_gap",
    ]);
    const merchantAttributionDimensionStatus = merchantRequired
      ? scoreStatus(merchantAttributionScore, 80, -1)
      : "not_tested";
    const merchantAttributionStatus: GMVAssuranceDimensionSummary = merchantRequired
      ? {
          status: merchantAttributionDimensionStatus,
          score: merchantAttributionScore ?? "not_tested",
          issue_id:
            merchantAttributionDimensionStatus === "passed"
              ? undefined
              : merchantAttributionIssue?.id,
          recommended_next_action:
            (merchantAttributionScore || 0) > 0
              ? "Monitor merchant store attribution."
              : "Run or fix Merchant Store Attribution Test evidence.",
          evidence:
            merchantAttributionScore === undefined
              ? "Merchant attribution has not been scored."
              : `Merchant store attribution score is ${merchantAttributionScore}.`,
        }
      : {
          status: "not_tested",
          score: "not_tested",
          recommended_next_action:
            "Run Merchant Store Attribution Test when merchant buying-path proof is required.",
          evidence: `${target.scan_mode} does not prove merchant store attribution.`,
        };

    const pivotaRequired = [
      "pivota_pdp_attribution_test",
      "agentic_execution_test",
      "checkout_aware_gmv_scan",
    ].includes(target.scan_mode);
    const pivotaAttributionIssue = issueForTypes(issues, [
      "pivota_pdp_attribution_gap",
      "pivota_offer_attribution_gap",
      "unverified_pivota_attribution",
    ]);
    const pivotaAttributionDimensionStatus = pivotaRequired
      ? scoreStatus(pivotaAttributionScore, 80, -1)
      : "not_tested";
    const pivotaAttributionStatus: GMVAssuranceDimensionSummary = pivotaRequired
      ? {
          status: pivotaAttributionDimensionStatus,
          score: pivotaAttributionScore ?? "not_tested",
          issue_id:
            pivotaAttributionDimensionStatus === "passed"
              ? undefined
              : pivotaAttributionIssue?.id,
          recommended_next_action:
            (pivotaAttributionScore || 0) > 0
              ? "Monitor verified Pivota channel attribution."
              : "Publish or verify Pivota PDP / product object attribution.",
          evidence:
            pivotaAttributionScore === undefined
              ? "Pivota attribution has not been scored."
              : `Verified Pivota PDP attribution score is ${pivotaAttributionScore}.`,
        }
      : {
          status: "not_tested",
          score: "not_tested",
          recommended_next_action:
            "Run Pivota PDP Attribution Test when Pivota channel proof is required.",
          evidence: `${target.scan_mode} does not prove Pivota channel attribution.`,
        };

    const productFindings = actionableProductFindings(productDiagnosis);
    const skuFindings = actionableSkuFindings(productDiagnosis);
    const explicitPivotaPdpQualityIssue = issueForTypes(issues, [
      "pivota_pdp_content_quality_gap",
      "pivota_product_intelligence_gap",
    ]);
    const blockerEligiblePivotaReadinessIssue = issueForTypes(issues, [
      "pivota_pdp_readiness_gap",
    ]);
    const pivotaPdpQualityIssue =
      explicitPivotaPdpQualityIssue ||
      (blockerEligiblePivotaReadinessIssue?.blocker_eligible
        ? blockerEligiblePivotaReadinessIssue
        : undefined);
    const pivotaPdpQualityFindings =
      pivotaPdpQualityFindingsFromIssue(pivotaPdpQualityIssue);
    const productDataStatus: GMVAssuranceDimensionSummary = pivotaPdpQualityIssue
      ? {
          status: "needs_work",
          score: 70,
          diagnosis_id: productDiagnosis?.id,
          issue_id: pivotaPdpQualityIssue.id,
          recommended_next_action: PIVOTA_PDP_QUALITY_NEXT_ACTION,
          evidence: pivotaPdpQualityFindings.length
            ? `Pivota PDP quality gate found ${pivotaPdpQualityFindings.length} gap(s): ${pivotaPdpQualityFindings.join(", ")}.`
            : "Pivota PDP quality gate found an agent-facing PDP readiness gap.",
        }
      : productDiagnosis
        ? {
            status: productFindings.length ? "needs_work" : "passed",
            score: productFindings.length ? 70 : 100,
          diagnosis_id: productDiagnosis.id,
          issue_id: productDiagnosis.issue_id,
          recommended_next_action: productFindings.length
            ? "Apply Product Understanding patches."
            : "Product data is ready; monitor for new query clusters.",
          evidence: productFindings.length
            ? `${productFindings.length} product data finding(s) require attention.`
            : "No merchant/Pivota product data findings were detected.",
        }
      : {
          status: "not_tested",
          score: "not_tested",
          recommended_next_action: "Run Product Diagnosis.",
          evidence: "No Product Understanding diagnosis has been run.",
        };

    const skuStatus: GMVAssuranceDimensionSummary = productDiagnosis
      ? {
          status: skuFindings.length ? "needs_work" : "passed",
          score: skuFindings.length ? 65 : 100,
          diagnosis_id: productDiagnosis.id,
          issue_id: productDiagnosis.issue_id,
          recommended_next_action: skuFindings.length
            ? "Clarify SKU / variant mapping."
            : "SKU / variant mapping is ready.",
          evidence: skuFindings.length
            ? `${skuFindings.length} SKU / variant finding(s) require attention.`
            : "No SKU / variant finding was detected.",
        }
      : {
          status: "not_tested",
          score: "not_tested",
          recommended_next_action: "Run Product Diagnosis.",
          evidence: "No Product Understanding diagnosis has been run.",
        };

    const offerFindings = actionableOfferFindings(offerDiagnosis);
    const offerStatus: GMVAssuranceDimensionSummary = offerDiagnosis
      ? {
          status: offerFindings.length ? "needs_work" : "passed",
          score: offerDiagnosis.offer_readiness_score,
          diagnosis_id: offerDiagnosis.id,
          issue_id: offerDiagnosis.issue_id,
          recommended_next_action: offerFindings.length
            ? "Apply Offer Execution patches and rerun offer diagnosis."
            : "Offer readiness is ready.",
          evidence: offerFindings.length
            ? `${offerFindings.length} offer readiness finding(s) require attention.`
            : "Offer source and Pivota offer state are consistent.",
        }
      : {
          status: "not_tested",
          score: "not_tested",
          recommended_next_action: "Run Offer Diagnosis.",
          evidence: "No Offer Execution diagnosis has been run.",
        };

    const checkoutFindings = actionableCheckoutFindings(checkoutDiagnosis);
    const checkoutStatus: GMVAssuranceDimensionSummary = checkoutDiagnosis
      ? {
          status: checkoutFindings.length ? "needs_work" : "passed",
          score: checkoutDiagnosis.checkout_readiness_score,
          diagnosis_id: checkoutDiagnosis.id,
          issue_id: checkoutDiagnosis.issue_id,
          recommended_next_action: checkoutFindings.length
            ? "Apply Checkout Verification patches and rerun checkout diagnosis."
            : "Checkout readiness is ready for pre-payment handoff.",
          evidence: checkoutFindings.length
            ? `${checkoutFindings.length} checkout readiness finding(s) require attention.`
            : "Checkout path preflight and handoff metadata are ready.",
        }
      : {
          status: "not_tested",
          score: "not_tested",
          recommended_next_action: "Run Checkout Diagnosis.",
          evidence: "No Checkout Verification diagnosis has been run.",
        };

    const topBlockers: GMVAssuranceBlocker[] = [];
    const addTopBlocker = (
      blocker: GMVAssuranceBlocker,
      dimension: GMVAssuranceDimensionSummary,
      issue?: AgenticGMVIssue
    ) => {
      if (
        issueEligibleForTopBlocker({
          issue,
          dimension,
          blockerType: blocker.blocker_type,
        })
      ) {
        topBlockers.push(blocker);
      }
    };

    addTopBlocker({
      blocker_type: organicDiscoveryIssue?.issue_type || "organic_product_discovery_gap",
      severity: organicDiscoveryIssue?.severity || "high",
      affected_layer: "discovery",
      fix_target: organicDiscoveryIssue?.fix_targets[0],
      issue_id: organicDiscoveryIssue?.id,
      recommended_action: organicDiscoveryStatus.recommended_next_action,
    }, organicDiscoveryStatus, organicDiscoveryIssue);
    addTopBlocker({
      blocker_type: merchantPdpDiscoveryIssue?.issue_type || "merchant_pdp_discovery_gap",
      severity: merchantPdpDiscoveryIssue?.severity || "high",
      affected_layer: "merchant_discovery",
      fix_target: merchantPdpDiscoveryIssue?.fix_targets[0],
      issue_id: merchantPdpDiscoveryIssue?.id,
      recommended_action: merchantPdpDiscoveryStatus.recommended_next_action,
    }, merchantPdpDiscoveryStatus, merchantPdpDiscoveryIssue);
    addTopBlocker({
      blocker_type: pivotaPdpDiscoveryIssue?.issue_type || "pivota_pdp_discovery_gap",
      severity: pivotaPdpDiscoveryIssue?.severity || "high",
      affected_layer: "pivota_discovery",
      fix_target: pivotaPdpDiscoveryIssue?.fix_targets[0],
      issue_id: pivotaPdpDiscoveryIssue?.id,
      recommended_action: pivotaPdpDiscoveryStatus.recommended_next_action,
    }, pivotaPdpDiscoveryStatus, pivotaPdpDiscoveryIssue);
    addTopBlocker({
      blocker_type: buyingPathDiscoveryIssue?.issue_type || "buying_path_discovery_gap",
      severity: buyingPathDiscoveryIssue?.severity || "high",
      affected_layer: "buying_path_discovery",
      fix_target: buyingPathDiscoveryIssue?.fix_targets[0],
      issue_id: buyingPathDiscoveryIssue?.id,
      recommended_action: buyingPathDiscoveryStatus.recommended_next_action,
    }, buyingPathDiscoveryStatus, buyingPathDiscoveryIssue);
    addTopBlocker({
      blocker_type: competitorDominanceIssue?.issue_type || "competitor_dominance",
      severity: competitorDominanceIssue?.severity || "high",
      affected_layer: "discovery_competition",
      fix_target: competitorDominanceIssue?.fix_targets[0],
      issue_id: competitorDominanceIssue?.id,
      recommended_action: competitorDominanceStatus.recommended_next_action,
    }, competitorDominanceStatus, competitorDominanceIssue);

    if (productVisibilityStatus.status === "blocked") {
      addTopBlocker({
        blocker_type: "low_product_visibility",
        severity: "critical",
        affected_layer: "demand_test",
        fix_target: productVisibilityIssue?.fix_targets[0],
        issue_id: productVisibilityIssue?.id,
        recommended_action: "Improve product visibility and rerun Demand Test.",
      }, productVisibilityStatus, productVisibilityIssue);
    }
    if (merchantRequired) {
      addTopBlocker({
        blocker_type: "merchant_store_attribution_gap",
        severity: "high",
        affected_layer: "merchant_attribution",
        fix_target: "merchant_pdp",
        issue_id: merchantAttributionIssue?.id,
        recommended_action: "Return a verified merchant store/PDP buying path.",
      }, merchantAttributionStatus, merchantAttributionIssue);
    }
    if (pivotaRequired) {
      addTopBlocker({
        blocker_type: "pivota_attribution_gap",
        severity: "high",
        affected_layer: "pivota_channel",
        fix_target: "pivota_unified_pdp",
        issue_id: pivotaAttributionIssue?.id,
        recommended_action: "Publish or verify Pivota PDP / offer attribution.",
      }, pivotaAttributionStatus, pivotaAttributionIssue);
    }
    if (pivotaPdpQualityIssue) {
      addTopBlocker({
        blocker_type: pivotaPdpQualityIssue.issue_type,
        severity: pivotaPdpQualityIssue.severity,
        affected_layer: "pivota_agent_facing_path",
        fix_target: "pivota_unified_pdp",
        issue_id: pivotaPdpQualityIssue.id,
        diagnosis_id: productDiagnosis?.id,
        recommended_action: PIVOTA_PDP_QUALITY_NEXT_ACTION,
      }, productDataStatus, pivotaPdpQualityIssue);
    }
    for (const finding of productFindings.slice(0, 1)) {
      addTopBlocker({
        blocker_type:
          "attribute" in finding
            ? `missing_${finding.attribute}`
            : finding.finding_type,
        severity: "severity" in finding ? finding.severity : "medium",
        affected_layer: "product_understanding",
        fix_target: finding.fix_target,
        issue_id: productDiagnosis?.issue_id,
        diagnosis_id: productDiagnosis?.id,
        recommended_action: productDataStatus.recommended_next_action,
      }, productDataStatus, issues.find((issue) => issue.id === productDiagnosis?.issue_id));
    }
    for (const finding of offerFindings.filter((item) => item.severity === "high" || item.severity === "critical").slice(0, 2)) {
      addTopBlocker({
        blocker_type: finding.finding_type,
        severity: finding.severity,
        affected_layer: "offer_execution",
        fix_target: finding.fix_target,
        issue_id: offerDiagnosis?.issue_id,
        diagnosis_id: offerDiagnosis?.id,
        recommended_action: offerStatus.recommended_next_action,
      }, offerStatus, issues.find((issue) => issue.id === offerDiagnosis?.issue_id));
    }
    for (const finding of checkoutFindings.filter((item) => item.severity === "high" || item.severity === "critical").slice(0, 2)) {
      addTopBlocker({
        blocker_type: finding.finding_type,
        severity: finding.severity,
        affected_layer: "checkout_verification",
        fix_target: finding.fix_target,
        issue_id: checkoutDiagnosis?.issue_id,
        diagnosis_id: checkoutDiagnosis?.id,
        recommended_action: checkoutStatus.recommended_next_action,
      }, checkoutStatus, issues.find((issue) => issue.id === checkoutDiagnosis?.issue_id));
    }

    const discoveryDimensions = [
      organicDiscoveryStatus,
      merchantPdpDiscoveryStatus,
      pivotaPdpDiscoveryStatus,
      buyingPathDiscoveryStatus,
      competitorDominanceStatus,
    ];
    const readinessDimensions = [
      productVisibilityStatus,
      merchantAttributionStatus,
      pivotaAttributionStatus,
      productDataStatus,
      skuStatus,
      offerStatus,
      checkoutStatus,
    ];
    const dimensions =
      assuranceScope === "readiness_only"
        ? readinessDimensions
        : [...discoveryDimensions, ...readinessDimensions];
    let readinessLevel: GMVAssuranceSnapshot["readiness_level"] = "monitoring";
    if (productVisibilityStatus.status === "blocked") {
      readinessLevel = "blocked";
    } else if (
      topBlockers.length ||
      dimensions.some((dimension) => dimension.status === "needs_work")
    ) {
      readinessLevel = "needs_work";
    } else if (dimensions.every((dimension) => dimension.status === "passed")) {
      readinessLevel = "ready_for_agentic_checkout";
    }

    const numericScores = dimensions
      .map(scoreFromDimension)
      .filter((score): score is number => score !== undefined);
    const averageScore = numericScores.length
      ? Math.round(numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length)
      : 0;
    const cap =
      readinessLevel === "blocked"
        ? 35
        : readinessLevel === "needs_work"
          ? 79
          : readinessLevel === "monitoring"
            ? 89
            : 100;
    const overallScore =
      readinessLevel === "ready_for_agentic_checkout"
        ? Math.max(90, averageScore)
        : Math.min(cap, averageScore);

    const recommendedNextActions = unique(
      [
        ...topBlockers.map((blocker) => blocker.recommended_action),
        ...dimensions
          .filter((dimension) => dimension.status === "not_tested")
          .map((dimension) => dimension.recommended_next_action),
        readinessLevel === "ready_for_agentic_checkout" ? "Monitor only." : "",
      ].filter(Boolean)
    );

    const usageEvents = state.usageEvents.filter(
      (event) =>
        event.merchant_id === merchantId &&
        event.store_id === target.store_id &&
        (event.scan_target_id === target.id ||
          issueIds.some((issueId) => event.idempotency_key.includes(issueId)))
    );
    const now = nowIso();
    const snapshot: GMVAssuranceSnapshot = {
      id: nextId("gmv_assurance"),
      merchant_id: merchantId,
      store_id: target.store_id,
      scan_target_id: target.id,
      product_entity_id: productEntityId,
      issue_ids: issueIds,
      assurance_scope: assuranceScope,
      discovery_readiness_summary: {
        organic_product_discovery_status: organicDiscoveryStatus,
        merchant_pdp_discovery_status: merchantPdpDiscoveryStatus,
        pivota_pdp_discovery_status: pivotaPdpDiscoveryStatus,
        buying_path_discovery_status: buyingPathDiscoveryStatus,
        competitor_dominance_status: competitorDominanceStatus,
      },
      demand_test_summary: {
        scan_mode: target.scan_mode,
        product_visibility_status: productVisibilityStatus,
        merchant_attribution_status: merchantAttributionStatus,
        pivota_attribution_status: pivotaAttributionStatus,
        latest_score_id: latestScore?.id,
      },
      product_understanding_summary: {
        product_data_readiness_status: productDataStatus,
        sku_variant_readiness_status: skuStatus,
        latest_diagnosis_id: productDiagnosis?.id,
      },
      offer_execution_summary: {
        offer_readiness_status: offerStatus,
        latest_diagnosis_id: offerDiagnosis?.id,
      },
      checkout_verification_summary: {
        checkout_readiness_status: checkoutStatus,
        latest_diagnosis_id: checkoutDiagnosis?.id,
      },
      overall_readiness_score: overallScore,
      readiness_level: readinessLevel,
      top_blockers: topBlockers,
      recommended_next_actions: recommendedNextActions.length
        ? recommendedNextActions
        : ["Monitor only."],
      usage_summary: usageSummaryForAssurance(usageEvents),
      pivota_discovery_progress: pivotaDiscoveryProgressFor({
        product_entity_id: productEntityId,
      }),
      created_at: now,
      updated_at: now,
    };
    applyResolutionPlansToSnapshot(snapshot);
    state.gmvAssuranceSnapshots.push(snapshot);
    return snapshot;
  }
}

type CreateProductionValidationRunInput = Partial<
  Pick<
    ProductionValidationRun,
    | "environment"
    | "merchant_name"
    | "store_url"
    | "merchant_pdp_url"
    | "product_name"
    | "brand"
    | "sku_name"
    | "category"
    | "market"
    | "language"
    | "currency"
    | "pivota_product_entity_id"
    | "canonical_product_slug"
    | "canonical_pivota_pdp_url"
    | "external_seed_id"
    | "merchant_product_id"
    | "merchant_sku_id"
    | "merchant_offer_id"
    | "pivota_pdp_url"
    | "pivota_offer_id"
    | "merchant_offer_input"
    | "pivota_offer_input"
    | "merchant_checkout_input"
    | "pivota_checkout_input"
  >
> & {
  product_attributes?: Record<string, unknown>;
  merchant_product_attributes?: Record<string, unknown>;
  pivota_product_attributes?: Record<string, unknown>;
  competitor_brands?: string[];
  competitor_products?: string[];
  pivota_pdp_quality_findings?: string[];
  pivota_live_pdp_quality_findings?: string[];
  pivota_pdp_quality_gate?: Record<string, unknown>;
  demand_scan_modes?: ScanMode[];
  repetitions?: number;
};

function stringInput(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberInput(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function booleanInput(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function recordInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasRecordInput(value: unknown) {
  return Object.keys(recordInput(value)).length > 0;
}

function arrayOfStringInput(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : [];
}

function originFromUrl(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "https://internal-validation.pivota.cc";
  }
}

function slugFrom(value: string) {
  return compactWhitespace(value.toLowerCase().replace(/[^a-z0-9]+/g, " "))
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "product";
}

function extractPivotaProductObjectId(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/products\/([^/?#]+)/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function isExternalSeedId(value?: string) {
  return /^ext_[a-z0-9_]+$/i.test(String(value || "").trim());
}

function canonicalPivotaProductEntityUrl(input: {
  product_entity_id?: string;
  canonical_product_slug?: string;
  canonical_pivota_pdp_url?: string;
}) {
  if (input.canonical_pivota_pdp_url) return input.canonical_pivota_pdp_url;
  const pathId = input.canonical_product_slug || input.product_entity_id;
  return pathId ? `https://agent.pivota.cc/products/${encodeURIComponent(pathId)}` : "";
}

async function preflightPublicUrl(
  url?: string
): Promise<ProductionValidationUrlPreflight> {
  const checkedAt = nowIso();
  if (!url) {
    return {
      status: "not_provided",
      status_code: null,
      checked_at: checkedAt,
    };
  }

  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (response.status === 403 || response.status === 405) {
      response = await fetch(url, { method: "GET", redirect: "follow" });
    }
    const passed = response.status >= 200 && response.status < 400;
    return {
      url,
      status: passed ? "passed" : "failed",
      status_code: response.status,
      final_url: response.url || url,
      checked_at: checkedAt,
    };
  } catch (error) {
    return {
      url,
      status: "failed",
      status_code: null,
      error:
        error instanceof Error
          ? error.message
          : "URL preflight request failed",
      checked_at: checkedAt,
    };
  }
}

function htmlDecode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value: string) {
  return compactWhitespace(
    htmlDecode(
      value
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function firstHtmlMatch(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return compactWhitespace(htmlDecode(match?.[1] || ""));
}

function htmlAttributeValue(tag: string, attribute: string) {
  const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i");
  return htmlDecode(tag.match(pattern)?.[1] || "");
}

function extractMetaContent(html: string, name: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const target = name.toLowerCase();
  for (const tag of tags) {
    const tagName = htmlAttributeValue(tag, "name").toLowerCase();
    const property = htmlAttributeValue(tag, "property").toLowerCase();
    if (tagName === target || property === target) {
      return htmlAttributeValue(tag, "content");
    }
  }
  return "";
}

function extractCanonicalUrl(html: string) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (htmlAttributeValue(tag, "rel").toLowerCase() === "canonical") {
      return htmlAttributeValue(tag, "href");
    }
  }
  return "";
}

function extractHrefs(html: string) {
  return (html.match(/<a\b[^>]*>/gi) || [])
    .map((tag) => htmlAttributeValue(tag, "href"))
    .filter(Boolean);
}

function flattenJsonLdTypes(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return unique(value.flatMap(flattenJsonLdTypes));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const ownType = record["@type"];
    const ownTypes = Array.isArray(ownType)
      ? ownType.filter((item): item is string => typeof item === "string")
      : typeof ownType === "string"
        ? [ownType]
        : [];
    return unique([
      ...ownTypes,
      ...flattenJsonLdTypes(record["@graph"]),
      ...Object.values(record).flatMap((item) =>
        typeof item === "object" ? flattenJsonLdTypes(item) : []
      ),
    ]);
  }
  return [];
}

function jsonLdNodes(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(jsonLdNodes);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      record,
      ...jsonLdNodes(record["@graph"]),
      ...Object.values(record).flatMap((item) =>
        typeof item === "object" ? jsonLdNodes(item) : []
      ),
    ];
  }
  return [];
}

function nodeHasJsonLdType(node: Record<string, unknown>, expected: string) {
  const type = node["@type"];
  if (Array.isArray(type)) {
    return type.some((item) => String(item).toLowerCase() === expected.toLowerCase());
  }
  return String(type || "").toLowerCase() === expected.toLowerCase();
}

function extractJsonLd(html: string) {
  const blocks = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ]
    .map((match) => htmlDecode(match[1] || "").trim())
    .filter(Boolean);
  const parsed: unknown[] = [];
  for (const block of blocks) {
    try {
      parsed.push(JSON.parse(block));
    } catch {
      // Invalid JSON-LD is handled as missing/incomplete structured data.
    }
  }
  const nodes = parsed.flatMap(jsonLdNodes);
  return {
    blocks,
    nodes,
    types: unique(parsed.flatMap(flattenJsonLdTypes)),
    products: nodes.filter((node) => nodeHasJsonLdType(node, "Product")),
    offers: nodes.filter(
      (node) =>
        nodeHasJsonLdType(node, "Offer") ||
        nodeHasJsonLdType(node, "AggregateOffer")
    ),
  };
}

function fieldPresent(record: Record<string, unknown> | undefined, field: string) {
  if (!record) return false;
  const value = record[field];
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function stringField(record: Record<string, unknown> | undefined, field: string) {
  if (!record) return "";
  const value = record[field];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return stringInput((value as Record<string, unknown>).name);
  }
  return "";
}

function htmlContainsUrl(html: string, url?: string) {
  if (!url) return false;
  const variants = unique(
    [
      url,
      normalizeUrlForCompare(url),
      url.replace(/&/g, "&amp;"),
      (() => {
        try {
          const parsed = new URL(url);
          parsed.search = "";
          parsed.hash = "";
          return parsed.toString().replace(/\/$/, "");
        } catch {
          return "";
        }
      })(),
    ].filter(Boolean)
  );
  const haystack = html.toLowerCase();
  return variants.some((variant) =>
    haystack.includes(String(variant).toLowerCase())
  );
}

function urlWithoutQueryForCompare(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function canonicalMatchesAuditedUrl(
  canonicalUrl: string,
  ...auditedUrls: Array<string | undefined>
) {
  const canonical = normalizeUrlForCompare(canonicalUrl);
  const canonicalWithoutQuery = urlWithoutQueryForCompare(canonicalUrl);
  return auditedUrls.some((url) => {
    const normalized = normalizeUrlForCompare(url);
    const withoutQuery = urlWithoutQueryForCompare(url);
    return (
      canonical === normalized ||
      canonical === withoutQuery ||
      canonicalWithoutQuery === normalized ||
      canonicalWithoutQuery === withoutQuery
    );
  });
}

function robotsPathBlocked(robotsText: string, path: string) {
  const lines = robotsText
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
  let applies = false;
  const disallows: string[] = [];
  const allows: string[] = [];
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      applies = value === "*" || value.toLowerCase().includes("googlebot");
    }
    if (!applies) continue;
    if (key === "disallow" && value) disallows.push(value);
    if (key === "allow" && value) allows.push(value);
  }
  const allowed = allows.some((rule) => path.startsWith(rule));
  const blocked = disallows.some((rule) => rule === "/" || path.startsWith(rule));
  return blocked && !allowed;
}

function indexabilityFinding(
  findingType: PivotaPDPIndexabilityFindingType,
  summary: string,
  recommendedFix: PivotaPDPIndexabilityFinding["recommended_fix"],
  severity: Severity = "medium"
): PivotaPDPIndexabilityFinding {
  return {
    finding_type: findingType,
    severity,
    summary,
    recommended_fix: recommendedFix,
  };
}

function addIndexabilityFinding(
  findings: PivotaPDPIndexabilityFinding[],
  finding: PivotaPDPIndexabilityFinding
) {
  if (!findings.some((item) => item.finding_type === finding.finding_type)) {
    findings.push(finding);
  }
}

function auditStatusForIndexability(
  findings: PivotaPDPIndexabilityFinding[]
): PivotaPDPIndexabilityAudit["audit_status"] {
  if (
    findings.some((finding) =>
      ["http_status_failed", "robots_blocked", "noindex", "auth_wall_detected"].includes(
        finding.finding_type
      )
    )
  ) {
    return "failed";
  }
  return findings.length ? "needs_work" : "passed";
}

function safeEvidenceText(value: string, max = 220) {
  return compactWhitespace(value).slice(0, max);
}

export class PivotaPDPIndexabilityAuditService {
  async audit(input: {
    url: string;
    product_name?: string;
    brand?: string;
    merchant_pdp_url?: string;
    offers_exist?: boolean;
    product_entity_id?: string;
    canonical_product_slug?: string;
    canonical_pivota_pdp_url?: string;
    external_seed_id?: string;
    merchant_offer_id?: string;
    pivota_offer_id?: string;
    promoted_external_seed_ids?: string[];
  }): Promise<PivotaPDPIndexabilityAudit> {
    if (!input.url) throw new Error("Pivota PDP URL is required");
    const requestedUrl = input.url;
    const productName = input.product_name || "";
    const brand = input.brand || "";
    const objectId = extractPivotaProductObjectId(requestedUrl);
    const expectedEntityId = stringInput(input.product_entity_id);
    const expectedExternalSeedId = stringInput(input.external_seed_id);
    const promotedExternalSeedIds = new Set(
      arrayOfStringInput(input.promoted_external_seed_ids).map((item) =>
        item.toLowerCase()
      )
    );
    const requestedPathIsExternalSeed = isExternalSeedId(objectId);
    const requestedExternalSeedPromoted =
      requestedPathIsExternalSeed && promotedExternalSeedIds.has(objectId.toLowerCase());
    const expectedCanonicalUrl = canonicalPivotaProductEntityUrl({
      product_entity_id: expectedEntityId,
      canonical_product_slug: input.canonical_product_slug,
      canonical_pivota_pdp_url: input.canonical_pivota_pdp_url,
    });
    const baseUrl = new URL(requestedUrl);
    const origin = baseUrl.origin;
    const robotsUrl = `${origin}/robots.txt`;
    const sitemapUrl = `${origin}/sitemap.xml`;
    const findings: PivotaPDPIndexabilityFinding[] = [];

    let html = "";
    let httpStatus: number | null = null;
    let finalUrl = requestedUrl;
    try {
      const response = await fetch(requestedUrl, { method: "GET", redirect: "follow" });
      httpStatus = response.status;
      finalUrl = response.url || requestedUrl;
      html = await response.text();
    } catch (error) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "http_status_failed",
          `Pivota PDP could not be fetched: ${error instanceof Error ? error.message : "request failed"}.`,
          "pivota_indexability_patch",
          "critical"
        )
      );
    }

    if (httpStatus === null || httpStatus < 200 || httpStatus >= 400) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "http_status_failed",
          `Pivota PDP HTTP status was ${httpStatus ?? "unavailable"}, not a public 2xx/3xx response.`,
          "pivota_indexability_patch",
          "critical"
        )
      );
    }

    let robotsStatus: number | null = null;
    let robotsText = "";
    try {
      const robotsResponse = await fetch(robotsUrl, {
        method: "GET",
        redirect: "follow",
      });
      robotsStatus = robotsResponse.status;
      robotsText = await robotsResponse.text();
    } catch {
      robotsStatus = null;
    }
    const robotsBlocked = robotsText
      ? robotsPathBlocked(robotsText, new URL(finalUrl || requestedUrl).pathname)
      : false;
    if (robotsBlocked) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "robots_blocked",
          "robots.txt appears to block crawling of this Pivota product path.",
          "pivota_indexability_patch",
          "critical"
        )
      );
    }

    let sitemapStatus: number | null = null;
    let productSitemapStatus: number | null = null;
    let sitemapText = "";
    try {
      const sitemapResponse = await fetch(sitemapUrl, {
        method: "GET",
        redirect: "follow",
      });
      sitemapStatus = sitemapResponse.status;
      sitemapText = await sitemapResponse.text();
      const productSitemapUrl = `${origin}/sitemap-products.xml`;
      const productSitemapResponse = await fetch(productSitemapUrl, {
        method: "GET",
        redirect: "follow",
      });
      productSitemapStatus = productSitemapResponse.status;
      if (productSitemapResponse.ok) {
        sitemapText = `${sitemapText}\n${await productSitemapResponse.text()}`;
      }
    } catch {
      sitemapStatus = null;
    }

    const title = firstHtmlMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1 = firstHtmlMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const metaRobots = extractMetaContent(html, "robots");
    const canonicalUrl = extractCanonicalUrl(html);
    const visibleText = stripHtml(html);
    const lowerVisible = visibleText.toLowerCase();
    const jsonLd = extractJsonLd(html);
    const productJsonLd = jsonLd.products[0];
    const offerJsonLd = jsonLd.offers[0];
    const productJsonLdUrl = stringField(productJsonLd, "url");
    const productJsonLdName = stringField(productJsonLd, "name");
    const productJsonLdBrand = stringField(productJsonLd, "brand");
    const renderedEntityId =
      extractPivotaProductObjectId(canonicalUrl) ||
      extractPivotaProductObjectId(productJsonLdUrl) ||
      "";
    const canonicalPathId = extractPivotaProductObjectId(canonicalUrl);
    const canonicalUsesExternalSeed =
      isExternalSeedId(canonicalPathId) && !promotedExternalSeedIds.has(canonicalPathId.toLowerCase());
    const externalSeedAliasCanonicalized =
      requestedPathIsExternalSeed && Boolean(canonicalPathId) && !isExternalSeedId(canonicalPathId);
    const productFields = {
      name: fieldPresent(productJsonLd, "name"),
      brand: fieldPresent(productJsonLd, "brand"),
      sku: fieldPresent(productJsonLd, "sku"),
      url: fieldPresent(productJsonLd, "url"),
      description: fieldPresent(productJsonLd, "description"),
    };
    const offerFields = {
      price: fieldPresent(offerJsonLd, "price") || fieldPresent(offerJsonLd, "lowPrice"),
      currency:
        fieldPresent(offerJsonLd, "priceCurrency") ||
        fieldPresent(offerJsonLd, "currency"),
      availability: fieldPresent(offerJsonLd, "availability"),
      seller: fieldPresent(offerJsonLd, "seller"),
      url: fieldPresent(offerJsonLd, "url"),
    };
    const productNameVisible = productName
      ? textContainsCoreProduct([title, h1, visibleText].join(" "), productName)
      : Boolean(title || h1);
    const brandVisible = brand
      ? lowerVisible.includes(brand.toLowerCase()) ||
        title.toLowerCase().includes(brand.toLowerCase()) ||
        h1.toLowerCase().includes(brand.toLowerCase())
      : true;
    const machineReadableDescriptionVisible =
      fieldPresent(productJsonLd, "description") ||
      (/data-pivota-product-seo-signals/i.test(html) &&
        /"(overview|product_intelligence_summary|description)"\s*:\s*"[^"]{40,}"/i.test(html));
    const descriptionVisible = visibleText.length > 500 || machineReadableDescriptionVisible;
    const sourceReferenceVisible =
      lowerVisible.includes("source") ||
      lowerVisible.includes("official merchant") ||
      /data-pivota-product-seo-signals/i.test(html) ||
      /official_merchant_pdp|source_references|source_url/i.test(html) ||
      htmlContainsUrl(html, input.merchant_pdp_url);
    const merchantUrlVisible = input.merchant_pdp_url
      ? htmlContainsUrl(html, input.merchant_pdp_url)
      : sourceReferenceVisible;
    const externalSeedSourcePresent = Boolean(
      expectedExternalSeedId &&
        (html.includes(expectedExternalSeedId) ||
          jsonLd.nodes.some((node) =>
            JSON.stringify(node).toLowerCase().includes(expectedExternalSeedId.toLowerCase())
          ))
    );
    const objectIdVisible = Boolean(objectId && html.includes(objectId));
    const expectedOfferIds = unique([
      stringInput(input.merchant_offer_id),
      stringInput(input.pivota_offer_id),
    ].filter(Boolean));
    const renderedOfferIds = unique(
      jsonLd.offers
        .flatMap((offer) => [
          stringField(offer, "identifier"),
          stringField(offer, "sku"),
          stringField(offer, "url"),
        ])
        .filter(Boolean)
    );
    const merchantOfferAttached =
      !expectedOfferIds.length ||
      expectedOfferIds.some((offerId) =>
        html.toLowerCase().includes(offerId.toLowerCase()) ||
        renderedOfferIds.some((rendered) =>
          rendered.toLowerCase().includes(offerId.toLowerCase())
        )
      );
    const sitemapIncludes = Boolean(
      sitemapText &&
        [requestedUrl, finalUrl, canonicalUrl, expectedCanonicalUrl]
          .filter(Boolean)
          .some((url) => htmlContainsUrl(sitemapText, url))
    );
    const internalProductLinks = extractHrefs(html).filter((href) => {
      try {
        const linked = new URL(href, origin);
        return linked.origin === origin && linked.pathname.startsWith("/products/");
      } catch {
        return false;
      }
    });
    const authGateDetected =
      /sign in|log in|login|required authentication|password|preview access|not authorized/i.test(
        [title, h1, visibleText.slice(0, 2000)].join(" ")
      );

    if (metaRobots && /noindex|none/i.test(metaRobots)) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "noindex",
          "Pivota PDP has a meta robots directive that prevents indexing.",
          "pivota_indexability_patch",
          "critical"
        )
      );
    }
    if (expectedEntityId && !expectedCanonicalUrl) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "canonical_product_url_missing",
          "Expected canonical ProductEntity URL was not provided or derivable.",
          "pivota_indexability_patch",
          "high"
        )
      );
    }
    if (!canonicalUrl) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "missing_canonical",
          "Pivota PDP does not expose a canonical URL in server-rendered HTML.",
          "pivota_indexability_patch",
          "high"
        )
      );
    } else if (
      expectedCanonicalUrl
        ? !canonicalMatchesAuditedUrl(canonicalUrl, expectedCanonicalUrl)
        : !canonicalMatchesAuditedUrl(canonicalUrl, finalUrl, requestedUrl) &&
          !externalSeedAliasCanonicalized
    ) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "canonical_mismatch",
          "Pivota PDP canonical URL does not point to the expected canonical ProductEntity PDP URL.",
          "pivota_indexability_patch",
          "high"
        )
      );
    }
    if (
      requestedPathIsExternalSeed &&
      !requestedExternalSeedPromoted &&
      normalizeUrlForCompare(canonicalUrl) === normalizeUrlForCompare(requestedUrl)
    ) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "external_seed_used_as_canonical",
          "The audited /products/ext_* URL is being used as the canonical PDP identity instead of a ProductEntity URL.",
          "pivota_indexability_patch",
          "high"
        )
      );
    }
    if (canonicalUsesExternalSeed) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "canonical_url_points_to_external_seed",
          "The canonical URL points to an external seed alias rather than a canonical ProductEntity PDP.",
          "pivota_indexability_patch",
          "high"
        )
      );
    }
    if (
      expectedEntityId &&
      renderedEntityId &&
      renderedEntityId !== expectedEntityId &&
      !(
        isExternalSeedId(renderedEntityId) &&
        expectedExternalSeedId &&
        renderedEntityId === expectedExternalSeedId
      )
    ) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "product_entity_binding_mismatch",
          `Pivota PDP resolved to ${renderedEntityId}, not expected ProductEntity ${expectedEntityId}.`,
          "pivota_product_intelligence_patch",
          "critical"
        )
      );
    }
    if (!productNameVisible || !brandVisible) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          expectedEntityId ? "rendered_identity_mismatch" : "missing_server_rendered_identity",
          "Product name and brand are not clearly visible in server-rendered HTML.",
          "pivota_discovery_signal_patch",
          "high"
        )
      );
    }
    if (!descriptionVisible) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "thin_content",
          "Pivota PDP overview or product description is missing or too thin in server-rendered HTML.",
          "pivota_product_intelligence_patch",
          "medium"
        )
      );
    }
    if (!jsonLd.products.length) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "missing_product_jsonld",
          "Product JSON-LD is missing from the Pivota PDP.",
          "pivota_product_schema_patch",
          "high"
        )
      );
    } else if (!Object.values(productFields).every(Boolean)) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "incomplete_product_jsonld",
          "Product JSON-LD is present but is missing name, brand, SKU, URL, or description.",
          "pivota_product_schema_patch",
          "medium"
        )
      );
    }
    if (input.offers_exist && !jsonLd.offers.length) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "missing_offer_jsonld",
          "Offer or AggregateOffer JSON-LD is missing even though offers exist.",
          "pivota_offer_schema_patch",
          "medium"
        )
      );
    } else if (jsonLd.offers.length && !Object.values(offerFields).every(Boolean)) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "incomplete_offer_jsonld",
          "Offer/AggregateOffer JSON-LD is present but missing price, currency, availability, seller, or URL.",
          "pivota_offer_schema_patch",
          "medium"
        )
      );
    }
    if (!sourceReferenceVisible || !merchantUrlVisible) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          expectedEntityId ? "product_entity_missing_merchant_source" : "missing_source_reference",
          "Verified merchant PDP source reference is not visible or machine-readable.",
          "pivota_source_reference_patch",
          "high"
        )
      );
    }
    if (expectedExternalSeedId && !externalSeedSourcePresent) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "product_entity_missing_source_seed",
          "Expected external seed ID was not listed as a source alias/reference for the ProductEntity PDP.",
          "pivota_source_reference_patch",
          "medium"
        )
      );
    }
    if (!merchantOfferAttached) {
      if (renderedOfferIds.length) {
        addIndexabilityFinding(
          findings,
          indexabilityFinding(
            "offer_attached_to_wrong_product_entity",
            "Rendered offer identifiers did not match the expected merchant/Pivota offer for this ProductEntity.",
            "pivota_offer_schema_patch",
            "high"
          )
        );
      }
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "product_entity_missing_merchant_offer",
          "Expected merchant/Pivota offer ID was not attached to the rendered ProductEntity PDP.",
          "pivota_offer_schema_patch",
          "medium"
        )
      );
    }
    if (!objectIdVisible) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "missing_product_object_id",
          "Pivota product object ID is not visible or machine-readable on the PDP.",
          "pivota_discovery_signal_patch",
          "medium"
        )
      );
    }
    if (!sitemapIncludes) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "missing_sitemap_entry",
          "Pivota sitemap does not include the audited public PDP URL.",
          "pivota_sitemap_submission",
          "medium"
        )
      );
    }
    if (authGateDetected) {
      addIndexabilityFinding(
        findings,
        indexabilityFinding(
          "auth_wall_detected",
          "The PDP appears to show an auth, login, password, or preview gate.",
          "pivota_indexability_patch",
          "critical"
        )
      );
    }

    const rawSafeEvidence: PivotaPDPIndexabilityAudit["raw_safe_evidence"] = {
      requested_url: requestedUrl,
      final_url: finalUrl,
      http_status: httpStatus,
      robots_url: robotsUrl,
      robots_status: robotsStatus,
      robots_summary: robotsText
        ? safeEvidenceText(
            robotsText
              .split(/\r?\n/)
              .filter((line) => /user-agent|allow|disallow|sitemap/i.test(line))
              .slice(0, 12)
              .join("; ")
          )
        : "robots.txt was not available or empty.",
      robots_blocked: robotsBlocked,
      meta_robots: metaRobots || undefined,
      canonical_url: canonicalUrl || undefined,
      title: title || undefined,
      h1: h1 || undefined,
      product_name_visible: productNameVisible,
      brand_visible: brandVisible,
      description_visible: descriptionVisible,
      jsonld_types: jsonLd.types,
      product_jsonld_present: jsonLd.products.length > 0,
      product_jsonld_fields: productFields,
      offer_jsonld_present: jsonLd.offers.length > 0,
      offer_jsonld_fields: offerFields,
      merchant_source_reference_visible: sourceReferenceVisible,
      source_merchant_pdp_url_visible: merchantUrlVisible,
      product_object_id_visible: objectIdVisible,
      sitemap_url: sitemapUrl,
      sitemap_status: sitemapStatus,
      product_sitemap_status: productSitemapStatus,
      sitemap_includes_pdp_url: sitemapIncludes,
      internal_product_links_count: unique(internalProductLinks).length,
      auth_gate_detected: authGateDetected,
      html_size: html.length,
      requested_product_path_id: objectId || undefined,
      expected_product_entity_id: expectedEntityId || undefined,
      canonical_product_slug: input.canonical_product_slug || undefined,
      expected_canonical_url: expectedCanonicalUrl || undefined,
      rendered_product_entity_id: renderedEntityId || undefined,
      rendered_product_jsonld_url: productJsonLdUrl || undefined,
      rendered_product_jsonld_name: productJsonLdName || undefined,
      rendered_product_jsonld_brand: productJsonLdBrand || undefined,
      rendered_offer_ids: renderedOfferIds,
      expected_external_seed_id: expectedExternalSeedId || undefined,
      expected_merchant_offer_id: input.merchant_offer_id || undefined,
      expected_pivota_offer_id: input.pivota_offer_id || undefined,
      external_seed_alias_detected: requestedPathIsExternalSeed,
      external_seed_used_as_canonical:
        requestedPathIsExternalSeed &&
        !requestedExternalSeedPromoted &&
        normalizeUrlForCompare(canonicalUrl) === normalizeUrlForCompare(requestedUrl),
      canonical_url_points_to_external_seed: canonicalUsesExternalSeed,
      source_reference_external_seed_present: externalSeedSourcePresent,
      source_reference_merchant_pdp_present: merchantUrlVisible,
      merchant_offer_attached: merchantOfferAttached,
    };

    return {
      audit_type: "pivota_pdp_indexability",
      url: requestedUrl,
      audit_status: auditStatusForIndexability(findings),
      findings,
      recommended_fixes: unique(findings.map((finding) => finding.recommended_fix)),
      raw_safe_evidence: rawSafeEvidence,
    };
  }
}

type PilotProductEntityProvisioningInput = Partial<
  Omit<
    PilotProductEntityProvisioningRun,
    | "id"
    | "status"
    | "source_references"
    | "external_seed_ids"
    | "merchant_offer_ids"
    | "pivota_offer_ids"
    | "created_at"
    | "updated_at"
  >
> & {
  merchant_id: string;
  merchant_name: string;
  store_url: string;
  merchant_pdp_url: string;
  product_name: string;
  brand: string;
  category?: string;
  market?: string;
  language?: string;
  currency?: string;
  source_external_seed_id?: string;
  existing_product_entity_id?: string;
};

function pilotCanonicalLabel(productName: string, brand: string) {
  const normalizedProduct = compactWhitespace(productName).toLowerCase();
  const normalizedBrand = compactWhitespace(brand).toLowerCase();
  return normalizedBrand && normalizedProduct.startsWith(normalizedBrand)
    ? productName
    : `${brand} ${productName}`;
}

function pilotCanonicalSlug(productName: string, brand: string) {
  return slugFrom(pilotCanonicalLabel(productName, brand)).replace(/_/g, "-");
}

function pilotProductEntityId(productName: string, brand: string) {
  return `pe_${slugFrom(pilotCanonicalLabel(productName, brand))}`;
}

function productRecordMatchesPilot(product: ProductRecord, input: {
  product_name: string;
  brand: string;
  merchant_pdp_url?: string;
}) {
  const brandMatches =
    !input.brand ||
    compactWhitespace(product.brand || "").toLowerCase() ===
      compactWhitespace(input.brand).toLowerCase();
  const productMatches = textContainsCoreProduct(
    product.canonical_product_name || product.title,
    input.product_name
  );
  const sourceMatches =
    !input.merchant_pdp_url ||
    product.pdp_url === input.merchant_pdp_url ||
    (product.source_references || []).some(
      (source) =>
        source.source_type === "official_merchant_pdp" &&
        normalizeUrlForCompare(source.source_url) ===
          normalizeUrlForCompare(input.merchant_pdp_url)
    );
  return brandMatches && productMatches && sourceMatches;
}

function allProductRecords() {
  return getAgentCenterState().stores.flatMap((store) => store.products || []);
}

export class PilotProductEntityProvisioningService {
  async create(input: PilotProductEntityProvisioningInput) {
    const merchantPdpUrl = stringInput(input.merchant_pdp_url);
    const productName = stringInput(input.product_name);
    const brand = stringInput(input.brand);
    const merchantId = stringInput(input.merchant_id);
    const merchantName = stringInput(input.merchant_name);
    const storeUrl = stringInput(input.store_url);
    if (!merchantId) throw new Error("merchant_id is required");
    if (!merchantName) throw new Error("merchant_name is required");
    if (!storeUrl) throw new Error("store_url is required");
    if (!merchantPdpUrl) throw new Error("merchant_pdp_url is required");
    if (!productName) throw new Error("product_name is required");
    if (!brand) throw new Error("brand is required");

    const now = nowIso();
    const run: PilotProductEntityProvisioningRun = {
      id: nextId("pilot_product_entity"),
      status: "draft",
      environment: currentFixtureEnvironment(input.environment),
      merchant_id: merchantId,
      merchant_name: merchantName,
      store_url: storeUrl,
      merchant_pdp_url: merchantPdpUrl,
      product_name: productName,
      brand,
      sku_name: stringInput(input.sku_name) || undefined,
      category: stringInput(input.category) || "skincare",
      market: stringInput(input.market) || "US",
      language: stringInput(input.language) || "en",
      currency: stringInput(input.currency) || "USD",
      merchant_product_attributes: hasRecordInput(input.merchant_product_attributes)
        ? recordInput(input.merchant_product_attributes)
        : undefined,
      merchant_offer_input: hasRecordInput(input.merchant_offer_input)
        ? recordInput(input.merchant_offer_input)
        : undefined,
      source_references: [],
      external_seed_ids: [],
      merchant_offer_ids: [],
      pivota_offer_ids: [],
      created_at: now,
      updated_at: now,
    };

    getAgentCenterRepository().upsert("pilotProductEntityProvisioningRuns", run);
    const merchantPreflight = await preflightPublicUrl(merchantPdpUrl);
    if (merchantPreflight.status !== "passed") {
      return this.fail(
        run,
        `Merchant PDP preflight failed with status ${merchantPreflight.status_code ?? "unavailable"}.`
      );
    }
    run.status = "source_validated";
    touch(run);
    return this.validateAndBind(run.id, input);
  }

  get(runId: string) {
    const run = getAgentCenterRepository().getById(
      "pilotProductEntityProvisioningRuns",
      runId
    );
    if (!run) {
      throw new Error(`Pilot ProductEntity provisioning run not found: ${runId}`);
    }
    return run;
  }

  async publish(runId: string) {
    const run = this.get(runId);
    if (!run.canonical_pivota_pdp_url) {
      return this.fail(run, "Canonical Pivota PDP URL has not been created.");
    }
    const audit = await this.runAudit(run);
    if (audit.audit_status !== "passed") {
      return this.fail(
        run,
        "Public Pivota PDP cannot render the expected ProductEntity without binding/indexability findings."
      );
    }
    run.status = "published";
    run.binding_audit_id = run.binding_audit_id || nextId("pivota_binding_audit");
    run.binding_audit = audit;
    run.indexability_audit = audit;
    touch(run);
    return run;
  }

  async audit(runId: string) {
    const run = this.get(runId);
    const audit = await this.runAudit(run);
    run.binding_audit_id = run.binding_audit_id || nextId("pivota_binding_audit");
    run.binding_audit = audit;
    run.indexability_audit = audit;
    if (audit.audit_status === "passed") {
      run.status = "audit_passed";
      run.completed_at = nowIso();
      run.failure_reason = undefined;
    } else {
      run.status = "failed";
      run.failure_reason =
        "Pivota PDP binding/indexability audit did not pass; do not use this PDP for pilot validation.";
    }
    touch(run);
    return run;
  }

  private validateAndBind(
    runId: string,
    input: PilotProductEntityProvisioningInput
  ) {
    const run = this.get(runId);
    const sourceExternalSeedId = stringInput(input.source_external_seed_id);
    const existingProductEntityId = stringInput(input.existing_product_entity_id);
    const products = allProductRecords();
    const conflictingSeedProduct = sourceExternalSeedId
      ? products.find(
          (product) =>
            (product.external_seed_id === sourceExternalSeedId ||
              (product.external_seed_ids || []).includes(sourceExternalSeedId)) &&
            !productRecordMatchesPilot(product, {
              product_name: run.product_name,
              brand: run.brand,
              merchant_pdp_url: run.merchant_pdp_url,
            })
        )
      : undefined;
    if (conflictingSeedProduct) {
      return this.fail(
        run,
        `External seed ${sourceExternalSeedId} maps to a different product and was rejected.`
      );
    }

    const existingEntity = existingProductEntityId
      ? products.find((product) => product.product_entity_id === existingProductEntityId)
      : products.find((product) =>
          productRecordMatchesPilot(product, {
            product_name: run.product_name,
            brand: run.brand,
            merchant_pdp_url: run.merchant_pdp_url,
          })
        );

    if (
      existingProductEntityId &&
      existingEntity &&
      !productRecordMatchesPilot(existingEntity, {
        product_name: run.product_name,
        brand: run.brand,
        merchant_pdp_url: run.merchant_pdp_url,
      })
    ) {
      return this.fail(
        run,
        `Existing ProductEntity ${existingProductEntityId} renders a different product or brand.`
      );
    }
    if (existingProductEntityId && !existingEntity) {
      return this.fail(
        run,
        `Existing ProductEntity ${existingProductEntityId} was not found in Agent Center state.`
      );
    }

    const productEntityId =
      existingEntity?.product_entity_id || pilotProductEntityId(run.product_name, run.brand);
    const canonicalSlug =
      existingEntity?.canonical_slug || pilotCanonicalSlug(run.product_name, run.brand);
    const canonicalUrl = canonicalPivotaProductEntityUrl({
      product_entity_id: productEntityId,
      canonical_product_slug: canonicalSlug,
    });
    const merchantOfferInput = recordInput(run.merchant_offer_input);
    const merchantOfferId =
      stringInput(merchantOfferInput.id) ||
      stringInput(merchantOfferInput.offer_id) ||
      stringInput((input as Record<string, unknown>).merchant_offer_id);
    const pivotaOfferId =
      stringInput((input as Record<string, unknown>).pivota_offer_id) ||
      stringInput(merchantOfferInput.pivota_offer_id);

    run.status = existingEntity ? "product_entity_bound" : "product_entity_created";
    run.product_entity_id = productEntityId;
    run.canonical_product_slug = canonicalSlug;
    run.canonical_pivota_pdp_url = canonicalUrl;
    run.external_seed_ids = sourceExternalSeedId ? [sourceExternalSeedId] : [];
    run.merchant_offer_ids = merchantOfferId ? [merchantOfferId] : [];
    run.pivota_offer_ids = pivotaOfferId ? [pivotaOfferId] : [];
    run.source_references = [
      {
        source_type: "official_merchant_pdp",
        source_url: run.merchant_pdp_url,
        merchant_id: run.merchant_id,
        merchant_name: run.merchant_name,
        verified_at: nowIso(),
        confidence: "merchant_approved",
        maps_to_product_entity_id: productEntityId,
      },
      ...(sourceExternalSeedId
        ? [
            {
              source_type: "external_seed" as const,
              source_id: sourceExternalSeedId,
              confidence: "pilot_verified_source_alias",
              maps_to_product_entity_id: productEntityId,
            },
          ]
        : [
            {
              source_type: "manual_pilot_mapping" as const,
              source_id: run.id,
              confidence: "pilot_only",
              maps_to_product_entity_id: productEntityId,
            },
          ]),
    ];
    this.upsertPilotStoreProduct(run);
    touch(run);
    return run;
  }

  private upsertPilotStoreProduct(run: PilotProductEntityProvisioningRun) {
    const state = getAgentCenterState();
    let store = state.stores.find(
      (item) =>
        item.merchant_id === run.merchant_id &&
        normalizeUrlForCompare(item.store_url) === normalizeUrlForCompare(run.store_url)
    );
    if (!store) {
      store = new MerchantStoreService().create(
        {
          store_name: run.merchant_name,
          store_url: run.store_url,
          platform: "custom",
          integration_status: "url_only",
          market: run.market,
          language: run.language,
          currency: run.currency,
          primary_category: run.category,
          optional_pdp_urls: [run.merchant_pdp_url],
          products: [],
        },
        run.merchant_id
      );
    }
    const existing = (store.products || []).find(
      (product) => product.product_entity_id === run.product_entity_id
    );
    const merchantOfferInput = recordInput(run.merchant_offer_input);
    const product: ProductRecord = {
      ...(existing || {}),
      id: existing?.id || nextId("pilot_product"),
      product_entity_id: run.product_entity_id || "",
      canonical_slug: run.canonical_product_slug,
      canonical_url: run.canonical_pivota_pdp_url,
      canonical_product_name: run.product_name,
      external_seed_id: run.external_seed_ids[0],
      external_seed_ids: run.external_seed_ids,
      source_references: run.source_references,
      merchant_product_mappings: [
        {
          merchant_id: run.merchant_id,
          merchant_sku_id: run.sku_name,
          source_product_id: run.external_seed_ids[0],
        },
      ],
      merchant_offers: run.merchant_offer_ids.map((offerId) => ({
        merchant_id: run.merchant_id,
        merchant_sku_id: run.sku_name,
        source_product_id: run.external_seed_ids[0],
        offer_id: offerId,
      })),
      pivota_offers: run.pivota_offer_ids.map((pivotaOfferId) => ({
        pivota_offer_id: pivotaOfferId,
        merchant_id: run.merchant_id,
        merchant_sku_id: run.sku_name,
      })),
      sku: run.sku_name || "pilot_sku",
      title: run.product_name,
      brand: run.brand,
      category: run.category,
      price:
        merchantOfferInput.price === undefined
          ? existing?.price
          : numberInput(merchantOfferInput.price),
      currency: run.currency,
      pdp_url: run.merchant_pdp_url,
      attributes: {
        ...(run.merchant_product_attributes || {}),
        purchase_path: run.merchant_pdp_url,
      },
      pivota_attributes: {
        canonical_pivota_pdp_url: run.canonical_pivota_pdp_url,
        canonical_product_slug: run.canonical_product_slug,
        source_references: run.source_references,
      },
      agent_summary: existing?.agent_summary,
      priority: existing?.priority || "high",
    };
    if (existing) Object.assign(existing, product);
    else {
      store.products = [...(store.products || []), product];
    }
    touch(store);
  }

  private async runAudit(run: PilotProductEntityProvisioningRun) {
    if (!run.canonical_pivota_pdp_url) {
      throw new Error("canonical_pivota_pdp_url is required before audit");
    }
    return new PivotaPDPIndexabilityAuditService().audit({
      url: run.canonical_pivota_pdp_url,
      product_name: run.product_name,
      brand: run.brand,
      merchant_pdp_url: run.merchant_pdp_url,
      offers_exist: Boolean(run.merchant_offer_ids.length || run.pivota_offer_ids.length),
      product_entity_id: run.product_entity_id,
      canonical_product_slug: run.canonical_product_slug,
      canonical_pivota_pdp_url: run.canonical_pivota_pdp_url,
      external_seed_id: run.external_seed_ids[0],
      merchant_offer_id: run.merchant_offer_ids[0],
      pivota_offer_id: run.pivota_offer_ids[0],
    });
  }

  private fail(run: PilotProductEntityProvisioningRun, reason: string) {
    run.status = "failed";
    run.failure_reason = reason;
    touch(run);
    return run;
  }
}

function checkoutUrlFromRun(run: ProductionValidationRun) {
  const pivotaCheckout = recordInput(run.pivota_checkout_input);
  const merchantCheckout = recordInput(run.merchant_checkout_input);
  return (
    stringInput(pivotaCheckout.checkout_url) ||
    stringInput(merchantCheckout.checkout_url) ||
    stringInput(merchantCheckout.cart_url)
  );
}

function productionValidationMerchantId(runId: string) {
  return `internal_validation_${runId}`;
}

function scoreExplanationForProductionValidation(
  score: VisibilityScoreValue,
  formula: string,
  supportingRuns: string[]
) {
  return scoreExplanation(
    score,
    formula,
    "Internal production validation consolidated this score from real-input Demand Test runs.",
    supportingRuns
  );
}

export class ProductionValidationRunService {
  create(input: CreateProductionValidationRunInput = {}) {
    const merchantPdpUrl = stringInput(input.merchant_pdp_url);
    const productName = stringInput(input.product_name);
    if (!merchantPdpUrl) {
      throw new Error("merchant_pdp_url is required");
    }
    if (!productName) {
      throw new Error("product_name is required");
    }

    const now = nowIso();
    const run: ProductionValidationRun = {
      id: nextId("prod_validation"),
      status: "created",
      environment: currentFixtureEnvironment(input.environment),
      merchant_name: stringInput(input.merchant_name) || "Internal Validation Merchant",
      store_url: stringInput(input.store_url) || originFromUrl(merchantPdpUrl),
      merchant_pdp_url: merchantPdpUrl,
      product_name: productName,
      brand: stringInput(input.brand) || undefined,
      sku_name: stringInput(input.sku_name) || undefined,
      category: stringInput(input.category) || "skincare",
      market: stringInput(input.market) || "US",
      language: stringInput(input.language) || "en",
      currency: stringInput(input.currency) || "USD",
      pivota_product_entity_id:
        stringInput(input.pivota_product_entity_id) || undefined,
      canonical_product_slug:
        stringInput(input.canonical_product_slug) || undefined,
      canonical_pivota_pdp_url:
        stringInput(input.canonical_pivota_pdp_url) || undefined,
      external_seed_id: stringInput(input.external_seed_id) || undefined,
      merchant_product_id: stringInput(input.merchant_product_id) || undefined,
      merchant_sku_id: stringInput(input.merchant_sku_id) || undefined,
      merchant_offer_id: stringInput(input.merchant_offer_id) || undefined,
      pivota_pdp_url: stringInput(input.pivota_pdp_url) || undefined,
      pivota_offer_id: stringInput(input.pivota_offer_id) || undefined,
      merchant_offer_input: hasRecordInput(input.merchant_offer_input)
        ? recordInput(input.merchant_offer_input)
        : undefined,
      pivota_offer_input: hasRecordInput(input.pivota_offer_input)
        ? recordInput(input.pivota_offer_input)
        : undefined,
      merchant_checkout_input: hasRecordInput(input.merchant_checkout_input)
        ? recordInput(input.merchant_checkout_input)
        : undefined,
      pivota_checkout_input: hasRecordInput(input.pivota_checkout_input)
        ? recordInput(input.pivota_checkout_input)
        : undefined,
      issue_ids: [],
      demand_test_job_ids: [],
      product_diagnosis_ids: [],
      offer_diagnosis_ids: [],
      checkout_diagnosis_ids: [],
      usage_event_ids: [],
      created_at: now,
      updated_at: now,
    };

    const extendedRun = run as ProductionValidationRun & {
      product_attributes?: Record<string, unknown>;
      merchant_product_attributes?: Record<string, unknown>;
      pivota_product_attributes?: Record<string, unknown>;
      competitor_brands?: string[];
      competitor_products?: string[];
      pivota_pdp_quality_findings?: string[];
      pivota_live_pdp_quality_findings?: string[];
      pivota_pdp_quality_gate?: Record<string, unknown>;
      demand_scan_modes?: ScanMode[];
      repetitions?: number;
    };
    extendedRun.product_attributes = input.product_attributes;
    extendedRun.merchant_product_attributes = input.merchant_product_attributes;
    extendedRun.pivota_product_attributes = input.pivota_product_attributes;
    extendedRun.competitor_brands = input.competitor_brands;
    extendedRun.competitor_products = input.competitor_products;
    extendedRun.pivota_pdp_quality_findings = input.pivota_pdp_quality_findings;
    extendedRun.pivota_live_pdp_quality_findings =
      input.pivota_live_pdp_quality_findings;
    extendedRun.pivota_pdp_quality_gate = input.pivota_pdp_quality_gate;
    extendedRun.demand_scan_modes = this.allowedDemandScanModes(
      input.demand_scan_modes
    );
    extendedRun.repetitions = input.repetitions;

    getAgentCenterRepository().upsert("productionValidationRuns", run);
    return run;
  }

  get(runId: string) {
    const run = getAgentCenterRepository().getById(
      "productionValidationRuns",
      runId
    );
    if (!run) throw new Error(`Production validation run not found: ${runId}`);
    return run;
  }

  async run(runId: string) {
    const run = this.get(runId);
    if (run.status === "deleted") {
      throw new Error(`Production validation run is deleted: ${runId}`);
    }

    run.status = "running";
    touch(run);
    try {
      const report = await this.execute(run);
      run.validation_report = report;
      run.gmv_assurance_snapshot_id = report.gmv_assurance_snapshot?.id;
      run.status = "completed";
      run.completed_at = nowIso();
      touch(run);
      return run;
    } catch (error) {
      run.status = "failed";
      touch(run);
      throw error;
    }
  }

  delete(runId: string) {
    const run = this.get(runId);
    if (run.status !== "deleted") {
      this.cleanupRunState(run);
      run.status = "deleted";
      run.deleted_at = nowIso();
      touch(run);
    }
    return run;
  }

  private async execute(run: ProductionValidationRun): Promise<ProductionValidationReport> {
    const state = getAgentCenterState();
    const merchantPdpPreflight = await preflightPublicUrl(run.merchant_pdp_url);
    const pivotaPdpPreflight = await preflightPublicUrl(run.pivota_pdp_url);
    const checkoutPreflightResult = await preflightPublicUrl(checkoutUrlFromRun(run));
    const merchantId = productionValidationMerchantId(run.id);
    const product = this.createProduct(run);
    const store = new MerchantStoreService().create(
      {
        store_name: run.merchant_name,
        store_url: run.store_url,
        platform: "custom",
        integration_status: "url_only",
        market: run.market,
        language: run.language,
        currency: run.currency,
        primary_category: run.category,
        optional_pdp_urls: [run.merchant_pdp_url],
        competitor_brands: this.competitorBrands(run),
        competitor_products: this.competitorProducts(run),
        products: [product],
      },
      merchantId
    );
    const connection = state.connections.find((item) => item.store_id === store.id);
    if (connection) {
      Object.assign(connection, {
        status: "connected",
        last_catalog_sync_at: nowIso(),
        last_offer_sync_at:
          run.merchant_offer_input || run.pivota_offer_input ? nowIso() : null,
        last_checkout_sync_at:
          run.merchant_checkout_input || run.pivota_checkout_input ? nowIso() : null,
        capabilities: {
          ...connection.capabilities,
          catalog: true,
          pdp_urls: true,
          sku_variant_map: true,
          structured_attributes: true,
          offers: Boolean(run.merchant_offer_input || run.pivota_offer_input),
          checkout: Boolean(
            run.merchant_checkout_input || run.pivota_checkout_input
          ),
          orders: false,
        },
      });
      touch(connection);
    }

    const target = new ScanTargetService().create({
      merchant_id: merchantId,
      store_id: store.id,
      selected_product_ids: [product.id],
      scan_mode: "open_product_visibility_test",
    });
    run.scan_target_id = target.id;
    touch(run);

    const clusters = new QueryClusterService().generateForScanTarget(target.id, [
      product.id,
    ]);
    const cluster =
      clusters.find((item) => item.intent_type === "purchase_ready") ||
      clusters[0];
    if (!cluster) throw new Error("Production validation query cluster not found");
    const discoveryCluster =
      clusters.find((item) => item.intent_type === "category_recommendation") ||
      cluster;

    const createdOffers = this.createOfferState(run, store, product);
    this.createCheckoutState(run, store, product, createdOffers);

    const configuredDemandModes = this.allowedDemandScanModes(
      (run as ProductionValidationRun & { demand_scan_modes?: ScanMode[] })
        .demand_scan_modes
    );
    const demandModes: ScanMode[] = configuredDemandModes.length
      ? configuredDemandModes
      : [
          "organic_product_discovery_test",
          "search_grounded_product_discovery_test",
          "buying_path_discovery_test",
          "open_product_visibility_test",
          "merchant_store_attribution_test",
          ...(run.pivota_pdp_url
            ? (["pivota_pdp_attribution_test"] as ScanMode[])
            : []),
        ];
    const demandSummaries: ProductionValidationReport["demand_test_summary"]["modes_run"] =
      [];
    for (const scanMode of demandModes) {
      target.scan_mode = scanMode;
      touch(target);
      const clusterForMode = discoveryTestEnabled(scanMode)
        ? discoveryCluster
        : cluster;
      const job = new DemandTestJobService().create({
        scan_target_id: target.id,
        query_cluster_ids: [clusterForMode.id],
        prompt_template_ids: ["purchase_ready_v1"],
        providers: ["gemini"],
        repetitions: this.repetitions(run),
      });
      run.demand_test_job_ids = unique([...run.demand_test_job_ids, job.id]);
      touch(run);
      const results = await new DemandTestJobService().run(job.id);
      demandSummaries.push({
        scan_mode: scanMode,
        job_id: job.id,
        aggregate_scores:
          results.aggregate_scores as ProductionValidationReport["demand_test_summary"]["modes_run"][number]["aggregate_scores"],
        issue_ids: results.issues.map((issue) => issue.id),
      });
    }

    target.scan_mode = run.pivota_pdp_url
      ? "agentic_execution_test"
      : "merchant_store_attribution_test";
    touch(target);
    this.createConsolidatedDemandScore({
      target,
      cluster,
      product,
      demandSummaries,
    });
    const pivotaQualityIssue = this.createPivotaPdpQualityIssue({
      run,
      store,
      target,
      cluster,
      product,
      pivotaPdpPreflight,
      demandSummaries,
    });

    let issues = state.issues.filter((issue) => issue.scan_target_id === target.id);
    if (pivotaQualityIssue && !issues.some((issue) => issue.id === pivotaQualityIssue.id)) {
      issues = [...issues, pivotaQualityIssue];
    }
    if (
      !issues.length &&
      (run.merchant_offer_input ||
        run.pivota_offer_input ||
        run.merchant_checkout_input ||
        run.pivota_checkout_input)
    ) {
      issues = [this.createValidationAnchorIssue({ run, store, target, cluster, product })];
    }
    run.issue_ids = unique(issues.map((issue) => issue.id));

    for (const issue of issues) {
      const diagnosis = new ProductUnderstandingService().runDiagnosis(issue.id);
      run.product_diagnosis_ids = unique([
        ...run.product_diagnosis_ids,
        diagnosis.id,
      ]);
    }

    const downstreamIssue = issues[0];
    if (downstreamIssue && (run.merchant_offer_input || run.pivota_offer_input)) {
      const diagnosis = new OfferExecutionService().runDiagnosis(downstreamIssue.id);
      run.offer_diagnosis_ids = unique([...run.offer_diagnosis_ids, diagnosis.id]);
    }
    if (
      downstreamIssue &&
      (run.merchant_checkout_input || run.pivota_checkout_input)
    ) {
      const diagnosis = new CheckoutVerificationService().runDiagnosis(
        downstreamIssue.id
      );
      run.checkout_diagnosis_ids = unique([
        ...run.checkout_diagnosis_ids,
        diagnosis.id,
      ]);
    }

    const snapshot = new GMVAssuranceService().createSnapshot({
      merchant_id: merchantId,
      store_id: store.id,
      scan_target_id: target.id,
      product_entity_id: product.product_entity_id,
    });
    run.gmv_assurance_snapshot_id = snapshot.id;
    run.usage_event_ids = this.usageEventIdsForRun(run, target.id);
    touch(run);

    const productDiagnoses = state.productUnderstandingDiagnoses.filter((item) =>
      run.product_diagnosis_ids.includes(item.id)
    );
    const offerDiagnoses = state.offerExecutionDiagnoses.filter((item) =>
      run.offer_diagnosis_ids.includes(item.id)
    );
    const checkoutDiagnoses = state.checkoutVerificationDiagnoses.filter((item) =>
      run.checkout_diagnosis_ids.includes(item.id)
    );

    return {
      target_summary: {
        production_validation_run_id: run.id,
        merchant_name: run.merchant_name,
        store_url: run.store_url,
        merchant_pdp_url: run.merchant_pdp_url,
        pivota_pdp_url: run.pivota_pdp_url,
        product_name: run.product_name,
        brand: run.brand,
        sku_name: run.sku_name,
        category: run.category,
        market: run.market,
        language: run.language,
        currency: run.currency,
        product_entity_id: product.product_entity_id,
        canonical_product_slug: product.canonical_slug,
        canonical_pivota_pdp_url: product.canonical_url,
        external_seed_id: product.external_seed_id,
        merchant_product_id: run.merchant_product_id,
        merchant_sku_id: run.merchant_sku_id,
        merchant_offer_id: run.merchant_offer_id,
        pivota_offer_id: run.pivota_offer_id,
        scan_target_id: target.id,
      },
      url_preflight_results: {
        merchant_pdp: merchantPdpPreflight,
        pivota_pdp: pivotaPdpPreflight,
        checkout: checkoutPreflightResult,
      },
      demand_test_summary: {
        modes_run: demandSummaries,
        skipped_modes: run.pivota_pdp_url ? [] : ["pivota_pdp_attribution_test"],
      },
      product_understanding_summary: {
        diagnosis_ids: run.product_diagnosis_ids,
        root_causes: productDiagnoses.map((item) => item.root_cause_summary),
      },
      pivota_pdp_quality_summary: {
        status: this.pivotaPdpQualityFindings(run).length
          ? "needs_work"
          : "not_provided",
        findings: this.pivotaPdpQualityFindings(run),
        issue_id: pivotaQualityIssue?.id,
      },
      offer_execution_summary: {
        diagnosis_ids: run.offer_diagnosis_ids,
        findings: offerDiagnoses.flatMap((diagnosis) =>
          diagnosis.offer_layer_findings.flatMap((comparison) =>
            comparison.findings.map((finding) => finding.finding_type)
          )
        ),
        readiness_scores: offerDiagnoses.map(
          (diagnosis) => diagnosis.offer_readiness_score
        ),
      },
      checkout_verification_summary: {
        diagnosis_ids: run.checkout_diagnosis_ids,
        findings: checkoutDiagnoses.flatMap((diagnosis) =>
          diagnosis.checkout_layer_findings.flatMap((comparison) =>
            comparison.findings.map((finding) => finding.finding_type)
          )
        ),
        readiness_scores: checkoutDiagnoses.map(
          (diagnosis) => diagnosis.checkout_readiness_score
        ),
      },
      gmv_assurance_snapshot: snapshot,
      top_blockers: snapshot.top_blockers,
      next_best_action: snapshot.recommended_next_actions[0] || "Monitor only.",
      usage_summary: snapshot.usage_summary,
      billing_mode: "preview_only",
      billing_status: "not_invoiced",
    };
  }

  private allowedDemandScanModes(value?: ScanMode[]) {
    const allowed = new Set<ScanMode>([
      "organic_product_discovery_test",
      "search_grounded_product_discovery_test",
      "buying_path_discovery_test",
      "open_product_visibility_test",
      "merchant_store_attribution_test",
      "pivota_pdp_attribution_test",
    ]);
    return unique((value || []).filter((mode): mode is ScanMode => allowed.has(mode)));
  }

  private createProduct(run: ProductionValidationRun): ProductRecord {
    const extended = run as ProductionValidationRun & {
      product_attributes?: Record<string, unknown>;
      merchant_product_attributes?: Record<string, unknown>;
      pivota_product_attributes?: Record<string, unknown>;
    };
    const productSlug = slugFrom(run.product_name);
    const productEntityId =
      run.pivota_product_entity_id || `pe_${productSlug}_${run.id}`;
    const externalSeedId =
      run.external_seed_id ||
      (isExternalSeedId(extractPivotaProductObjectId(run.pivota_pdp_url))
        ? extractPivotaProductObjectId(run.pivota_pdp_url)
        : undefined);
    const canonicalUrl = canonicalPivotaProductEntityUrl({
      product_entity_id: productEntityId,
      canonical_product_slug: run.canonical_product_slug,
      canonical_pivota_pdp_url: run.canonical_pivota_pdp_url,
    });
    const pivotaProductObjectId =
      run.canonical_product_slug || productEntityId;
    const pivotaOfferInput = recordInput(run.pivota_offer_input);
    const expectedPivotaOfferId =
      run.pivota_offer_id || stringInput(pivotaOfferInput.id);
    const merchantAttributes = {
      purchase_path: run.merchant_pdp_url,
      ...(extended.product_attributes || {}),
      ...(extended.merchant_product_attributes || {}),
    };
    const pivotaAttributes = {
      ...(extended.pivota_product_attributes || {}),
      ...(run.pivota_pdp_url
        ? {
            pivota_pdp_url: run.pivota_pdp_url,
            canonical_pivota_pdp_url: canonicalUrl,
            canonical_product_slug: run.canonical_product_slug,
            pivota_product_object_id: pivotaProductObjectId,
            external_seed_id: externalSeedId,
            external_seed_ids: externalSeedId ? [externalSeedId] : [],
            pivota_pdp_alias_urls:
              run.pivota_pdp_url && run.pivota_pdp_url !== canonicalUrl
                ? [run.pivota_pdp_url]
                : [],
          }
        : {}),
      ...(expectedPivotaOfferId
        ? {
            offer_ids: [expectedPivotaOfferId],
            pivota_offer_ids: [expectedPivotaOfferId],
          }
        : {}),
    };
    const merchantOfferInput = recordInput(run.merchant_offer_input);
    const price =
      merchantOfferInput.price === undefined
        ? undefined
        : numberInput(merchantOfferInput.price);

    return {
      id: nextId("prod_validation_product"),
      product_entity_id: productEntityId,
      canonical_slug: run.canonical_product_slug,
      canonical_url: canonicalUrl || undefined,
      canonical_product_name: run.product_name,
      external_seed_id: externalSeedId,
      external_seed_ids: externalSeedId ? [externalSeedId] : [],
      source_references: [
        ...(externalSeedId
          ? [
              {
                source_type: "external_seed" as const,
                source_id: externalSeedId,
                maps_to_product_entity_id: productEntityId,
                confidence: "production_validation_input",
              },
            ]
          : []),
        {
          source_type: "official_merchant_pdp" as const,
          source_id: run.merchant_product_id,
          source_url: run.merchant_pdp_url,
          merchant_id: productionValidationMerchantId(run.id),
          merchant_name: run.merchant_name,
          maps_to_product_entity_id: productEntityId,
          confidence: "production_validation_input",
        },
      ],
      merchant_product_mappings: [
        {
          merchant_id: productionValidationMerchantId(run.id),
          merchant_product_id: run.merchant_product_id,
          merchant_sku_id: run.merchant_sku_id || run.sku_name,
          source_product_id: externalSeedId,
        },
      ],
      merchant_offers: run.merchant_offer_id
        ? [
            {
              merchant_id: productionValidationMerchantId(run.id),
              merchant_sku_id: run.merchant_sku_id || run.sku_name,
              source_product_id: externalSeedId,
              offer_id: run.merchant_offer_id,
            },
          ]
        : [],
      pivota_offers: expectedPivotaOfferId
        ? [
            {
              pivota_offer_id: expectedPivotaOfferId,
              merchant_id: productionValidationMerchantId(run.id),
              merchant_sku_id: run.merchant_sku_id || run.sku_name,
            },
          ]
        : [],
      sku: run.sku_name || `${productSlug}_default_sku`,
      title: run.product_name,
      brand: run.brand || run.merchant_name,
      category: run.category || "skincare",
      ...(price === undefined ? {} : { price }),
      currency: run.currency,
      pdp_url: run.merchant_pdp_url,
      attributes: merchantAttributes,
      pivota_attributes: pivotaAttributes,
      agent_summary: `${run.product_name} production validation target.`,
      priority: "high",
    };
  }

  private competitorBrands(run: ProductionValidationRun) {
    const extended = run as ProductionValidationRun & { competitor_brands?: string[] };
    return extended.competitor_brands?.length
      ? extended.competitor_brands
      : SUNSCREEN_COMPETITOR_BRANDS;
  }

  private competitorProducts(run: ProductionValidationRun) {
    const extended = run as ProductionValidationRun & { competitor_products?: string[] };
    return extended.competitor_products?.length
      ? extended.competitor_products
      : SUNSCREEN_COMPETITOR_PRODUCTS;
  }

  private repetitions(run: ProductionValidationRun) {
    const extended = run as ProductionValidationRun & { repetitions?: number };
    return Math.max(1, Math.min(3, Number(extended.repetitions || 1)));
  }

  private createOfferState(
    run: ProductionValidationRun,
    store: MerchantStore,
    product: ProductRecord
  ) {
    const state = getAgentCenterState();
    const merchantInput = recordInput(run.merchant_offer_input);
    const pivotaInput = recordInput(run.pivota_offer_input);
    const checkoutNeedsOffer = Boolean(
      run.merchant_checkout_input || run.pivota_checkout_input
    );
    const merchantOfferNeeded = hasRecordInput(merchantInput) || checkoutNeedsOffer;
    const pivotaOfferNeeded =
      hasRecordInput(pivotaInput) || Boolean(run.pivota_offer_id) || checkoutNeedsOffer;
    const now = nowIso();
    let merchantOffer: MerchantOffer | undefined;
    let pivotaOffer: PivotaOffer | undefined;

    if (merchantOfferNeeded) {
      merchantOffer = {
        id: stringInput(merchantInput.id) || nextId("merchant_offer"),
        merchant_id: store.merchant_id,
        store_id: store.id,
        product_entity_id: product.product_entity_id,
        product_id: product.id,
        sku_id: stringInput(merchantInput.sku_id) || product.sku,
        merchant_sku_id:
          stringInput(merchantInput.merchant_sku_id) || product.sku,
        source_product_id:
          stringInput(merchantInput.source_product_id) || product.external_seed_id,
        offer_id:
          stringInput(merchantInput.offer_id) ||
          stringInput(merchantInput.id) ||
          run.merchant_offer_id,
        checkout_path_id: stringInput(merchantInput.checkout_path_id) || undefined,
        price: numberInput(merchantInput.price, product.price || 0),
        currency: stringInput(merchantInput.currency) || run.currency,
        promo_price:
          merchantInput.promo_price === undefined || merchantInput.promo_price === null
            ? null
            : numberInput(merchantInput.promo_price),
        coupon_code: stringInput(merchantInput.coupon_code) || null,
        coupon_status:
          (stringInput(merchantInput.coupon_status) as CouponStatus) || "none",
        inventory_status:
          (stringInput(merchantInput.inventory_status) as InventoryStatus) ||
          "in_stock",
        inventory_quantity:
          merchantInput.inventory_quantity === undefined
            ? null
            : numberInput(merchantInput.inventory_quantity),
        expires_at: stringInput(merchantInput.expires_at) || null,
        source_url: stringInput(merchantInput.source_url) || run.merchant_pdp_url,
        last_synced_at: stringInput(merchantInput.last_synced_at) || now,
        created_at: now,
        updated_at: now,
      };
      state.merchantOffers.push(merchantOffer);
    }

    if (pivotaOfferNeeded) {
      pivotaOffer = {
        id:
          stringInput(run.pivota_offer_id) ||
          stringInput(pivotaInput.id) ||
          `pivota_offer_${run.id}`,
        product_entity_id:
          stringInput(pivotaInput.product_entity_id) || product.product_entity_id,
        pivota_unified_pdp_id:
          stringInput(pivotaInput.pivota_unified_pdp_id) ||
          `pdp_${product.product_entity_id}`,
        merchant_id: store.merchant_id,
        store_id: store.id,
        sku_id:
          stringInput(pivotaInput.sku_id) || merchantOffer?.sku_id || product.sku,
        price: numberInput(pivotaInput.price, merchantOffer?.price || product.price || 0),
        currency: stringInput(pivotaInput.currency) || run.currency,
        promo_price:
          pivotaInput.promo_price === undefined || pivotaInput.promo_price === null
            ? null
            : numberInput(pivotaInput.promo_price),
        coupon_code: stringInput(pivotaInput.coupon_code) || null,
        coupon_status:
          (stringInput(pivotaInput.coupon_status) as CouponStatus) ||
          merchantOffer?.coupon_status ||
          "none",
        inventory_status:
          (stringInput(pivotaInput.inventory_status) as InventoryStatus) ||
          merchantOffer?.inventory_status ||
          "in_stock",
        execution_status:
          (stringInput(pivotaInput.execution_status) as OfferExecutionStatus) ||
          "ready",
        attached_to_pivota_pdp: booleanInput(
          pivotaInput.attached_to_pivota_pdp,
          true
        ),
        last_verified_at: stringInput(pivotaInput.last_verified_at) || now,
        created_at: now,
        updated_at: now,
      };
      state.pivotaOffers.push(pivotaOffer);
    }

    return { merchantOffer, pivotaOffer };
  }

  private createCheckoutState(
    run: ProductionValidationRun,
    store: MerchantStore,
    product: ProductRecord,
    offers: { merchantOffer?: MerchantOffer; pivotaOffer?: PivotaOffer }
  ) {
    const state = getAgentCenterState();
    const merchantInput = recordInput(run.merchant_checkout_input);
    const pivotaInput = recordInput(run.pivota_checkout_input);
    const now = nowIso();

    if (hasRecordInput(merchantInput) && offers.merchantOffer) {
      const checkoutUrl = stringInput(merchantInput.checkout_url);
      const checkoutDomain =
        stringInput(merchantInput.checkout_domain) || checkoutUrlHost(checkoutUrl);
      const requiredParams = arrayOfStringInput(merchantInput.required_params);
      state.merchantCheckoutPaths.push({
        id: stringInput(merchantInput.id) || nextId("merchant_checkout"),
        merchant_id: store.merchant_id,
        store_id: store.id,
        merchant_offer_id:
          stringInput(merchantInput.merchant_offer_id) || offers.merchantOffer.id,
        sku_id: stringInput(merchantInput.sku_id) || product.sku,
        checkout_url: checkoutUrl || null,
        cart_url: stringInput(merchantInput.cart_url) || null,
        checkout_domain: checkoutDomain,
        required_params: requiredParams.length
          ? requiredParams
          : ["variant", "quantity"],
        supported_params: arrayOfStringInput(merchantInput.supported_params).length
          ? arrayOfStringInput(merchantInput.supported_params)
          : requiredParams.length
            ? requiredParams
            : ["variant", "quantity"],
        coupon_param_name: stringInput(merchantInput.coupon_param_name) || null,
        quantity_param_name: stringInput(merchantInput.quantity_param_name) || "quantity",
        variant_param_name: stringInput(merchantInput.variant_param_name) || "variant",
        expires_at: stringInput(merchantInput.expires_at) || null,
        last_verified_at: stringInput(merchantInput.last_verified_at) || now,
        source: stringInput(merchantInput.source) || "production_validation_input",
        created_at: now,
        updated_at: now,
      });
    }

    if (hasRecordInput(pivotaInput) && offers.pivotaOffer) {
      const checkoutUrl = stringInput(pivotaInput.checkout_url);
      state.pivotaCheckoutPaths.push({
        id: stringInput(pivotaInput.id) || nextId("pivota_checkout"),
        pivota_offer_id:
          stringInput(pivotaInput.pivota_offer_id) || offers.pivotaOffer.id,
        product_entity_id:
          stringInput(pivotaInput.product_entity_id) || product.product_entity_id,
        merchant_id: store.merchant_id,
        store_id: store.id,
        sku_id: stringInput(pivotaInput.sku_id) || product.sku,
        checkout_url: checkoutUrl || null,
        cart_handoff_payload: recordInput(pivotaInput.cart_handoff_payload),
        checkout_domain:
          stringInput(pivotaInput.checkout_domain) || checkoutUrlHost(checkoutUrl),
        required_params: arrayOfStringInput(pivotaInput.required_params).length
          ? arrayOfStringInput(pivotaInput.required_params)
          : ["variant", "quantity"],
        coupon_code: stringInput(pivotaInput.coupon_code) || null,
        quantity:
          pivotaInput.quantity === undefined || pivotaInput.quantity === null
            ? null
            : numberInput(pivotaInput.quantity),
        variant_id: stringInput(pivotaInput.variant_id) || null,
        execution_status:
          (stringInput(pivotaInput.execution_status) as OfferExecutionStatus) ||
          "ready",
        attached_to_pivota_offer: booleanInput(
          pivotaInput.attached_to_pivota_offer,
          true
        ),
        last_verified_at: stringInput(pivotaInput.last_verified_at) || now,
        created_at: now,
        updated_at: now,
      });
    }
  }

  private createConsolidatedDemandScore(input: {
    target: ScanTarget;
    cluster: QueryCluster;
    product: ProductRecord;
    demandSummaries: ProductionValidationReport["demand_test_summary"]["modes_run"];
  }) {
    const summaryForMode = (scanMode: ScanMode) =>
      input.demandSummaries.find((summary) => summary.scan_mode === scanMode);
    const open = summaryForMode("open_product_visibility_test")?.aggregate_scores;
    const organic =
      summaryForMode("organic_product_discovery_test")?.aggregate_scores;
    const searchGrounded =
      summaryForMode("search_grounded_product_discovery_test")?.aggregate_scores;
    const buyingPath =
      summaryForMode("buying_path_discovery_test")?.aggregate_scores;
    const merchant =
      summaryForMode("merchant_store_attribution_test")?.aggregate_scores;
    const pivota =
      summaryForMode("pivota_pdp_attribution_test")?.aggregate_scores;
    const aggregate: DemandVisibilityScore["aggregate_scores"] = {
      product_entity_visibility_score:
        open?.product_entity_visibility_score ??
        merchant?.product_entity_visibility_score ??
        pivota?.product_entity_visibility_score ??
        0,
      merchant_store_visibility_score:
        merchant?.merchant_store_visibility_score || 0,
      pivota_pdp_visibility_score: pivota?.pivota_pdp_visibility_score || 0,
      pivota_offer_visibility_score: pivota?.pivota_offer_visibility_score || 0,
      pivota_attribution_echo_rate: pivota?.pivota_attribution_echo_rate || 0,
      executable_offer_visibility_score: "not_tested",
      organic_product_discovery_score:
        organic?.organic_product_discovery_score ?? "not_tested",
      organic_brand_discovery_score:
        organic?.organic_brand_discovery_score ?? "not_tested",
      competitor_dominance_score:
        organic?.competitor_dominance_score ??
        searchGrounded?.competitor_dominance_score ??
        buyingPath?.competitor_dominance_score ??
        "not_tested",
      search_grounded_merchant_pdp_discovery_score:
        searchGrounded?.search_grounded_merchant_pdp_discovery_score ??
        buyingPath?.search_grounded_merchant_pdp_discovery_score ??
        "not_tested",
      search_grounded_pivota_pdp_discovery_score:
        searchGrounded?.search_grounded_pivota_pdp_discovery_score ??
        buyingPath?.search_grounded_pivota_pdp_discovery_score ??
        "not_tested",
      buying_path_discovery_score:
        buyingPath?.buying_path_discovery_score ?? "not_tested",
      offer_discovery_score: buyingPath?.offer_discovery_score ?? "not_tested",
      url_match_accuracy_score:
        searchGrounded?.url_match_accuracy_score ??
        buyingPath?.url_match_accuracy_score ??
        "not_tested",
      visibility_score:
        open?.product_entity_visibility_score ??
        merchant?.product_entity_visibility_score ??
        pivota?.product_entity_visibility_score ??
        0,
      recommendation_rank_score:
        open?.recommendation_rank_score ??
        merchant?.recommendation_rank_score ??
        pivota?.recommendation_rank_score ??
        0,
      competitor_substitution_score:
        open?.competitor_substitution_score ??
        merchant?.competitor_substitution_score ??
        pivota?.competitor_substitution_score ??
        0,
      attribute_readiness_score:
        open?.attribute_readiness_score ??
        merchant?.attribute_readiness_score ??
        pivota?.attribute_readiness_score ??
        0,
      pivota_pdp_readiness_score:
        pivota?.pivota_pdp_readiness_score ??
        open?.pivota_pdp_readiness_score ??
        0,
    };
    const supportingRuns = input.demandSummaries.map((summary) => summary.job_id);
    const explanation = (key: keyof DemandVisibilityScore["aggregate_scores"]) =>
      scoreExplanationForProductionValidation(
        aggregate[key],
        "production_validation_consolidated_mode_score",
        supportingRuns
      );
    const now = nowIso();
    const score: DemandVisibilityScore = {
      id: nextId("score"),
      merchant_id: input.target.merchant_id,
      store_id: input.target.store_id,
      scan_target_id: input.target.id,
      query_cluster_id: input.cluster.id,
      product_entity_id: input.product.product_entity_id,
      provider_scores: {
        production_validation: aggregate,
      },
      aggregate_scores: aggregate,
      score_explanations: {
        product_entity_visibility_score: explanation("product_entity_visibility_score"),
        merchant_store_visibility_score: explanation("merchant_store_visibility_score"),
        pivota_pdp_visibility_score: explanation("pivota_pdp_visibility_score"),
        pivota_offer_visibility_score: explanation("pivota_offer_visibility_score"),
        pivota_attribution_echo_rate: explanation("pivota_attribution_echo_rate"),
        executable_offer_visibility_score: explanation(
          "executable_offer_visibility_score"
        ),
        organic_product_discovery_score: explanation("organic_product_discovery_score"),
        organic_brand_discovery_score: explanation("organic_brand_discovery_score"),
        competitor_dominance_score: explanation("competitor_dominance_score"),
        search_grounded_merchant_pdp_discovery_score: explanation(
          "search_grounded_merchant_pdp_discovery_score"
        ),
        search_grounded_pivota_pdp_discovery_score: explanation(
          "search_grounded_pivota_pdp_discovery_score"
        ),
        buying_path_discovery_score: explanation("buying_path_discovery_score"),
        offer_discovery_score: explanation("offer_discovery_score"),
        url_match_accuracy_score: explanation("url_match_accuracy_score"),
        visibility_score: explanation("visibility_score"),
        recommendation_rank_score: explanation("recommendation_rank_score"),
        competitor_substitution_score: explanation("competitor_substitution_score"),
        attribute_readiness_score: explanation("attribute_readiness_score"),
        pivota_pdp_readiness_score: explanation("pivota_pdp_readiness_score"),
      },
      created_at: now,
      updated_at: now,
    };
    getAgentCenterState().scores.push(score);
    return score;
  }

  private pivotaPdpQualityFindings(run: ProductionValidationRun) {
    return unique([
      ...arrayOfStringInput(run.pivota_pdp_quality_findings),
      ...arrayOfStringInput(run.pivota_live_pdp_quality_findings),
      ...collectPivotaPdpQualityFindings(run.pivota_pdp_quality_gate),
    ]).filter(isPivotaPdpQualityFinding);
  }

  private pivotaPdpQualitySeverity(findings: string[]): Severity {
    const criticalContentGap =
      findings.includes("missing_pdp_identity") ||
      findings.includes("product_intel_module_empty_or_blocked");
    return criticalContentGap || findings.length >= 3 ? "high" : "medium";
  }

  private createPivotaPdpQualityIssue(input: {
    run: ProductionValidationRun;
    store: MerchantStore;
    target: ScanTarget;
    cluster: QueryCluster;
    product: ProductRecord;
    pivotaPdpPreflight: ProductionValidationUrlPreflight;
    demandSummaries: ProductionValidationReport["demand_test_summary"]["modes_run"];
  }) {
    const findings = this.pivotaPdpQualityFindings(input.run);
    if (!findings.length || input.pivotaPdpPreflight.status !== "passed") {
      return undefined;
    }

    const state = getAgentCenterState();
    const existing = state.issues.find(
      (issue) =>
        issue.scan_target_id === input.target.id &&
        issue.issue_type === "pivota_pdp_content_quality_gap" &&
        issue.evidence?.production_validation_run_id === input.run.id
    );
    if (existing) return existing;

    const merchantMode = input.demandSummaries.find(
      (summary) => summary.scan_mode === "merchant_store_attribution_test"
    );
    const pivotaMode = input.demandSummaries.find(
      (summary) => summary.scan_mode === "pivota_pdp_attribution_test"
    );
    const now = nowIso();
    const issue: AgenticGMVIssue = {
      id: nextId("issue"),
      merchant_id: input.store.merchant_id,
      store_id: input.store.id,
      scan_target_id: input.target.id,
      store_url: input.store.store_url,
      platform: input.store.platform,
      source_agent: "demand_test_agent",
      issue_type: "pivota_pdp_content_quality_gap",
      severity: this.pivotaPdpQualitySeverity(findings),
      status: "recommendation_ready",
      affected_product_entities: [input.product.product_entity_id],
      affected_skus: [input.product.sku],
      affected_query_clusters: [input.cluster.id],
      evidence: {
        production_validation_run_id: input.run.id,
        blocker_eligible: true,
        affected_readiness_dimension: "product_data_readiness_status",
        target_layer: "pivota_agent_facing_path",
        merchant_owned_path_status:
          merchantMode?.aggregate_scores.merchant_store_visibility_score === 100
            ? "passed"
            : "not_proven",
        pivota_path_status:
          pivotaMode?.aggregate_scores.pivota_pdp_visibility_score === 100
            ? "passed"
            : "not_proven",
        pivota_pdp_preflight_status: input.pivotaPdpPreflight.status,
        pivota_pdp_preflight_status_code: input.pivotaPdpPreflight.status_code,
        pivota_pdp_url: input.run.pivota_pdp_url,
        pivota_pdp_quality_findings: findings,
      },
      blocker_eligible: true,
      root_cause: PIVOTA_PDP_QUALITY_MERCHANT_SUMMARY,
      fix_targets: ["pivota_unified_pdp", "pivota_product_graph"],
      recommended_action: PIVOTA_PDP_QUALITY_NEXT_ACTION,
      merchant_source_patch: {},
      pivota_unified_pdp_patch: {
        complete_pdp_identity: findings.includes("missing_pdp_identity"),
        add_overview_from_available_description: findings.includes(
          "missing_overview_from_available_description"
        ),
        source_product_description_available: true,
      },
      pivota_product_graph_patch: {
        populate_product_intelligence_module: findings.includes(
          "product_intel_module_empty_or_blocked"
        ),
        add_similar_card_highlight: findings.includes(
          "similar_card_missing_highlight"
        ),
        product_entity_id: input.product.product_entity_id,
      },
      estimated_gmv_at_risk: input.cluster.estimated_demand_value,
      gmv_estimation_method:
        "Internal production validation estimate from reachable Pivota PDP quality gate failures; not transaction attribution.",
      estimated_gmv_at_risk_confidence: "medium",
      merchant_facing_summary: PIVOTA_PDP_QUALITY_MERCHANT_SUMMARY,
      merchant_facing_narrative: {
        what_happened:
          "The merchant-owned PDP path and Pivota attribution path were reachable, but Pivota live PDP quality checks found missing agent-facing content.",
        what_ai_recommended_instead:
          "No competitor substitution is implied by this quality gate finding.",
        why_this_likely_happened:
          "The Pivota PDP exists, but identity, overview, product intelligence, or similar-card content is incomplete or blocked.",
        where_to_fix: "Pivota unified PDP and Pivota product graph.",
        recommended_merchant_pdp_changes: [],
        recommended_pivota_pdp_changes: [
          "Complete PDP identity.",
          "Add overview from the available merchant description.",
          "Populate the product intelligence module.",
          "Add similar-card highlight content.",
        ],
        how_pivota_will_verify_the_fix:
          "Rerun Pivota PDP Attribution Test and regenerate the GMV Assurance Snapshot after the Pivota PDP quality fixes are applied.",
      },
      approval_required: false,
      verification_plan: {
        retest_query_clusters: [input.cluster.id],
        providers: ["gemini"],
        prompt_templates: ["purchase_ready_v1"],
        success_metric: "attribute_readiness_score",
        target_improvement:
          "Pivota PDP quality gate passes and GMV Assurance top blocker clears.",
      },
      created_at: now,
      updated_at: now,
    };
    state.issues.push(issue);
    return issue;
  }

  private createValidationAnchorIssue(input: {
    run: ProductionValidationRun;
    store: MerchantStore;
    target: ScanTarget;
    cluster: QueryCluster;
    product: ProductRecord;
  }) {
    const now = nowIso();
    const issueType: AgenticGMVIssueType = input.run.merchant_checkout_input ||
      input.run.pivota_checkout_input
      ? "checkout_verification_issue"
      : input.run.merchant_offer_input || input.run.pivota_offer_input
        ? "offer_execution_issue"
        : "human_review_required";
    const issue: AgenticGMVIssue = {
      id: nextId("issue"),
      merchant_id: input.store.merchant_id,
      store_id: input.store.id,
      scan_target_id: input.target.id,
      store_url: input.store.store_url,
      platform: input.store.platform,
      source_agent: "demand_test_agent",
      issue_type: issueType,
      severity: "low",
      status: "recommendation_ready",
      affected_product_entities: [input.product.product_entity_id],
      affected_skus: [input.product.sku],
      affected_query_clusters: [input.cluster.id],
      evidence: {
        production_validation_run_id: input.run.id,
        validation_anchor: true,
        blocker_eligible: false,
        product_name: input.run.product_name,
        merchant_pdp_url: input.run.merchant_pdp_url,
        pivota_pdp_url: input.run.pivota_pdp_url,
      },
      blocker_eligible: false,
      root_cause:
        "Internal production validation anchor issue for downstream pre-payment readiness checks.",
      fix_targets: ["human_review"],
      recommended_action:
        "Review Product Understanding, Offer Execution, and Checkout Verification outputs for this production validation run.",
      merchant_source_patch: {},
      pivota_unified_pdp_patch: {},
      estimated_gmv_at_risk: input.cluster.estimated_demand_value,
      gmv_estimation_method:
        "Internal production validation estimate only; not transaction attribution.",
      estimated_gmv_at_risk_confidence: "low",
      merchant_facing_summary:
        "Internal production validation anchor. This is not exposed as a merchant-facing workflow.",
      merchant_facing_narrative: {
        what_happened:
          "Internal production validation created an anchor issue so downstream readiness agents can run on real inputs.",
        what_ai_recommended_instead:
          "No replacement recommendation is implied by this anchor issue.",
        why_this_likely_happened:
          "The validation run needs an issue-scoped record for downstream deterministic agents.",
        where_to_fix: "Internal validation only.",
        recommended_merchant_pdp_changes: [
          "Use downstream diagnosis patches if findings are generated.",
        ],
        recommended_pivota_pdp_changes: [
          "Use downstream diagnosis patches if findings are generated.",
        ],
        how_pivota_will_verify_the_fix:
          "Rerun the production validation run or rerun the relevant diagnosis after patches.",
      },
      approval_required: false,
      verification_plan: {
        retest_query_clusters: [input.cluster.id],
        providers: ["gemini"],
        prompt_templates: ["purchase_ready_v1"],
        success_metric: "visibility_rate",
        target_improvement: "verify production validation downstream readiness",
      },
      created_at: now,
      updated_at: now,
    };
    getAgentCenterState().issues.push(issue);
    return issue;
  }

  private usageEventIdsForRun(run: ProductionValidationRun, scanTargetId: string) {
    const issueIds = new Set(run.issue_ids);
    return getAgentCenterState()
      .usageEvents.filter(
        (event) =>
          event.scan_target_id === scanTargetId ||
          [...issueIds].some((issueId) => event.idempotency_key.includes(issueId))
      )
      .map((event) => event.id);
  }

  private cleanupRunState(run: ProductionValidationRun) {
    const state = getAgentCenterState();
    const targetIds = run.scan_target_id ? [run.scan_target_id] : [];
    const storeIds = state.scanTargets
      .filter((target) => targetIds.includes(target.id))
      .map((target) => target.store_id);
    const jobIds = new Set(run.demand_test_job_ids);
    const clusterIds = state.queryClusters
      .filter((cluster) => targetIds.includes(cluster.scan_target_id))
      .map((cluster) => cluster.id);
    const testRunIds = state.testRuns
      .filter(
        (testRun) =>
          targetIds.includes(testRun.scan_target_id) || jobIds.has(testRun.job_id)
      )
      .map((testRun) => testRun.id);
    const resultIds = state.results
      .filter((result) => testRunIds.includes(result.test_run_id))
      .map((result) => result.id);
    const parsedIds = state.parsedRecommendations
      .filter(
        (parsed) =>
          testRunIds.includes(parsed.test_run_id) ||
          clusterIds.includes(parsed.query_cluster_id)
      )
      .map((parsed) => parsed.id);
    const issueIds = new Set(run.issue_ids);

    state.usageEvents = state.usageEvents.filter(
      (event) =>
        !run.usage_event_ids.includes(event.id) &&
        !targetIds.includes(event.scan_target_id) &&
        ![...issueIds].some((issueId) => event.idempotency_key.includes(issueId))
    );
    state.checkoutVerificationDiagnoses = state.checkoutVerificationDiagnoses.filter(
      (diagnosis) =>
        !run.checkout_diagnosis_ids.includes(diagnosis.id) &&
        !issueIds.has(diagnosis.issue_id)
    );
    state.offerExecutionDiagnoses = state.offerExecutionDiagnoses.filter(
      (diagnosis) =>
        !run.offer_diagnosis_ids.includes(diagnosis.id) &&
        !issueIds.has(diagnosis.issue_id)
    );
    state.productUnderstandingDiagnoses = state.productUnderstandingDiagnoses.filter(
      (diagnosis) =>
        !run.product_diagnosis_ids.includes(diagnosis.id) &&
        !issueIds.has(diagnosis.issue_id)
    );
    state.issueResolutionPlans = state.issueResolutionPlans.filter(
      (plan) => !issueIds.has(plan.issue_id)
    );
    state.gmvAssuranceSnapshots = state.gmvAssuranceSnapshots.filter(
      (snapshot) =>
        snapshot.id !== run.gmv_assurance_snapshot_id &&
        !targetIds.includes(snapshot.scan_target_id)
    );
    state.issues = state.issues.filter((issue) => !issueIds.has(issue.id));
    state.scores = state.scores.filter(
      (score) =>
        !targetIds.includes(score.scan_target_id) &&
        !clusterIds.includes(score.query_cluster_id)
    );
    state.matches = state.matches.filter(
      (match) => !parsedIds.includes(match.parsed_recommendation_id)
    );
    state.parsedRecommendations = state.parsedRecommendations.filter(
      (parsed) => !parsedIds.includes(parsed.id)
    );
    state.results = state.results.filter((result) => !resultIds.includes(result.id));
    state.testRuns = state.testRuns.filter((testRun) => !testRunIds.includes(testRun.id));
    state.jobs = state.jobs.filter((job) => !jobIds.has(job.id));
    state.queryClusters = state.queryClusters.filter(
      (cluster) => !clusterIds.includes(cluster.id)
    );
    state.scanTargets = state.scanTargets.filter(
      (target) => !targetIds.includes(target.id)
    );
    state.readinessSnapshots = state.readinessSnapshots.filter(
      (snapshot) => !targetIds.includes(snapshot.scan_target_id)
    );
    state.merchantOffers = state.merchantOffers.filter(
      (offer) => !storeIds.includes(offer.store_id)
    );
    state.pivotaOffers = state.pivotaOffers.filter(
      (offer) => !storeIds.includes(offer.store_id)
    );
    state.merchantCheckoutPaths = state.merchantCheckoutPaths.filter(
      (path) => !storeIds.includes(path.store_id)
    );
    state.pivotaCheckoutPaths = state.pivotaCheckoutPaths.filter(
      (path) => !storeIds.includes(path.store_id)
    );
    state.connections = state.connections.filter(
      (connection) => !storeIds.includes(connection.store_id)
    );
    state.stores = state.stores.filter((store) => !storeIds.includes(store.id));
  }
}

function combineReportStatuses(
  statuses: Array<GMVAssuranceDimensionStatus | undefined>
): GMVAssuranceDimensionStatus {
  const present = statuses.filter(Boolean) as GMVAssuranceDimensionStatus[];
  if (!present.length) return "not_tested";
  if (present.includes("blocked")) return "blocked";
  if (present.includes("needs_work")) return "needs_work";
  if (present.includes("not_configured")) return "not_configured";
  if (present.includes("passed")) return "passed";
  return "not_tested";
}

function reportScoreLabel(score?: VisibilityScoreValue) {
  if (score === undefined) return "not tested";
  return typeof score === "number" ? `${score}%` : score.replace(/_/g, " ");
}

function reportStatusLabel(status?: string) {
  return (status || "not_tested").replace(/_/g, " ");
}

function reportPreflightLabel(status?: ProductionValidationUrlPreflight["status"]) {
  return (status || "not_provided").replace(/_/g, " ");
}

type DiscoveryScoreValue = VisibilityScoreValue | null | undefined;

export function mapDiscoveryScoreToReportStatus(
  score: DiscoveryScoreValue
): MerchantFacingDiscoveryReportStatus {
  if (score === "not_configured") return "not_configured";
  if (score === "not_tested" || score === null || score === undefined) {
    return "not_tested";
  }
  return score > 0 ? "found" : "not_found";
}

function safeUrlHost(value?: string) {
  if (!value) return "";
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeUrlForCompare(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    const normalized = url.toString().replace(/\/$/, "");
    return normalized.toLowerCase();
  } catch {
    return value.toLowerCase().replace(/\/$/, "");
  }
}

function textContainsCoreProduct(text: string | undefined, productName: string) {
  if (!text) return false;
  const normalizer = new ProductNameNormalizer();
  const normalizedText = normalizer.normalizeForCompare(text);
  const normalizedProduct = normalizer.normalizeForCompare(productName);
  const coreProduct = normalizer.normalizedCoreName(productName);
  return (
    normalizedText.includes(normalizedProduct) ||
    Boolean(coreProduct && normalizedText.includes(coreProduct))
  );
}

function hasJsonLdType(input: DiscoverabilityAuditInput, type: string) {
  return (input.signals?.json_ld_types || []).some(
    (item) => item.toLowerCase() === type.toLowerCase()
  );
}

function auditFinding(
  findingType: DiscoverabilityAuditFindingType,
  summary: string,
  recommendedActionTypes: string[],
  severity: Severity = "medium"
): DiscoverabilityAuditFinding {
  return {
    finding_type: findingType,
    severity,
    summary,
    recommended_action_types: recommendedActionTypes,
  };
}

function addFindingOnce(
  findings: DiscoverabilityAuditFinding[],
  finding: DiscoverabilityAuditFinding
) {
  if (!findings.some((item) => item.finding_type === finding.finding_type)) {
    findings.push(finding);
  }
}

function auditStatus(findings: DiscoverabilityAuditFinding[], url?: string) {
  if (!url) return "not_tested" as const;
  return findings.length ? ("needs_work" as const) : ("passed" as const);
}

function recommendedActionTypes(findings: DiscoverabilityAuditFinding[]) {
  return unique(findings.flatMap((finding) => finding.recommended_action_types));
}

function expectedUrlReturned(expectedUrl: string | undefined, returnedUrls: string[]) {
  if (!expectedUrl) return false;
  const expected = normalizeUrlForCompare(expectedUrl);
  return returnedUrls.some((url) => normalizeUrlForCompare(url) === expected);
}

export function auditMerchantPDPDiscoverability(
  input: DiscoverabilityAuditInput
): MerchantPDPDiscoverabilityAudit {
  const url = input.merchant_pdp_url || input.expected_merchant_pdp_url;
  const expectedUrl = input.expected_merchant_pdp_url || url;
  const issueTypes = new Set(input.issue_types || []);
  const returnedUrls = input.returned_urls || [];
  const signals = input.signals || {};
  const findings: DiscoverabilityAuditFinding[] = [];
  const checks: MerchantPDPDiscoverabilityAudit["checks"] = {};
  const statusCode = signals.http_status ?? input.preflight_status_code;
  const notDiscovered = issueTypes.has("merchant_pdp_not_discovered");
  const wrongUrl = issueTypes.has("wrong_buying_path_returned");

  checks.http_status =
    statusCode === undefined || statusCode === null
      ? input.preflight_status === "passed"
        ? "passed"
        : input.preflight_status === "failed"
          ? "needs_work"
          : "unknown"
      : statusCode >= 200 && statusCode < 400
        ? "passed"
        : "needs_work";
  if (checks.http_status === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "indexability_gap",
        "Merchant PDP did not have a confirmed successful public preflight.",
        ["merchant_indexability_patch"],
        "high"
      )
    );
  }

  const robotsMeta = String(signals.robots_meta || "").toLowerCase();
  checks.indexability = robotsMeta
    ? robotsMeta.includes("noindex") || robotsMeta.includes("none")
      ? "needs_work"
      : "passed"
    : notDiscovered
      ? "unknown"
      : "unknown";
  if (checks.indexability === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "indexability_gap",
        "Merchant PDP appears to include robots directives that may prevent indexing.",
        ["merchant_indexability_patch"],
        "high"
      )
    );
  }

  checks.canonical_url = signals.canonical_url
    ? normalizeUrlForCompare(signals.canonical_url) === normalizeUrlForCompare(expectedUrl)
      ? "passed"
      : "needs_work"
    : notDiscovered
      ? "needs_work"
      : "unknown";
  if (checks.canonical_url === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "canonical_gap",
        "Merchant PDP canonical URL was missing, unavailable, or did not match the expected official PDP.",
        ["merchant_canonical_url_patch"],
        "medium"
      )
    );
  }

  const titleAndH1 = [signals.title, signals.h1, signals.visible_product_name]
    .filter(Boolean)
    .join(" ");
  checks.product_identity =
    titleAndH1 || signals.visible_description
      ? textContainsCoreProduct(
          [titleAndH1, signals.visible_description].join(" "),
          input.product_name
        )
        ? "passed"
        : "needs_work"
      : notDiscovered
        ? "needs_work"
        : "unknown";
  if (checks.product_identity === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "thin_content_gap",
        "Merchant PDP title, H1, visible product name, or description did not clearly confirm the core product identity.",
        ["merchant_pdp_copy_patch"],
        "medium"
      )
    );
  }

  checks.brand_identity =
    signals.visible_brand || titleAndH1
      ? asLower([signals.visible_brand, titleAndH1].join(" ")).includes(
          asLower(input.brand || "")
        )
        ? "passed"
        : input.brand
          ? "needs_work"
          : "not_applicable"
      : notDiscovered
        ? "needs_work"
        : "unknown";

  const productSchemaPresent =
    signals.product_jsonld_present === true || hasJsonLdType(input, "Product");
  checks.product_jsonld = productSchemaPresent
    ? "passed"
    : signals.product_jsonld_present === false || notDiscovered
      ? "needs_work"
      : "unknown";
  if (checks.product_jsonld === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "missing_product_schema",
        "Product JSON-LD was missing or not confirmed for the merchant PDP.",
        ["merchant_product_schema_patch"],
        "high"
      )
    );
  }

  const offerSchemaPresent =
    signals.offer_jsonld_present === true || hasJsonLdType(input, "Offer");
  checks.offer_jsonld = offerSchemaPresent
    ? "passed"
    : signals.offer_jsonld_present === false || notDiscovered
      ? "needs_work"
      : "unknown";
  if (checks.offer_jsonld === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "missing_offer_schema",
        "Offer JSON-LD was missing or not confirmed for the merchant PDP.",
        ["merchant_offer_schema_patch"],
        "medium"
      )
    );
  }

  checks.price_availability =
    signals.price_present === false ||
    signals.currency_present === false ||
    signals.availability_present === false ||
    notDiscovered
      ? "needs_work"
      : signals.price_present || signals.currency_present || signals.availability_present
        ? "passed"
        : "unknown";
  if (checks.price_availability === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "missing_price_or_availability_signal",
        "Price, currency, or availability signals were missing or not confirmed on the merchant PDP.",
        ["merchant_offer_schema_patch"],
        "medium"
      )
    );
  }

  checks.seller_signal =
    signals.seller_present === true
      ? "passed"
      : signals.seller_present === false || notDiscovered
        ? "needs_work"
        : "unknown";
  if (checks.seller_signal === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "missing_seller_signal",
        "Seller or official store identity was missing or not confirmed on the merchant PDP.",
        ["merchant_offer_schema_patch"],
        "medium"
      )
    );
  }

  checks.sitemap_inclusion =
    signals.sitemap_included === true
      ? "passed"
      : signals.sitemap_included === false || notDiscovered
        ? "needs_work"
        : "unknown";
  if (checks.sitemap_inclusion === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "sitemap_gap",
        "Merchant PDP sitemap inclusion was missing or not confirmed.",
        ["merchant_sitemap_submission"],
        "medium"
      )
    );
  }

  checks.expected_url_returned = expectedUrlReturned(expectedUrl, returnedUrls)
    ? "passed"
    : notDiscovered
      ? "needs_work"
      : "unknown";
  if (wrongUrl) {
    addFindingOnce(
      findings,
      auditFinding(
        "wrong_url_returned",
        "Search-grounded Gemini returned a different buying path than the expected merchant/Pivota PDP.",
        [
          "wrong_url_analysis",
          "canonical_buying_path_patch",
          "competitor_or_retailer_confusion_patch",
        ],
        "medium"
      )
    );
  }

  return {
    audit_type: "merchant_pdp",
    url,
    expected_url: expectedUrl,
    status: auditStatus(findings, url),
    summary: notDiscovered
      ? "Search-grounded Gemini did not return the official merchant PDP. Recommended fixes focus on making the official PDP easier for search-grounded AI to identify as the canonical buying page."
      : "Merchant PDP discoverability audit checks source-layer indexability, canonical, structured data, and buying-path signals.",
    checks,
    findings,
    recommended_action_types: recommendedActionTypes(findings),
  };
}

export function auditPivotaPDPDiscoverability(
  input: DiscoverabilityAuditInput
): PivotaPDPDiscoverabilityAudit {
  const url = input.pivota_pdp_url || input.expected_pivota_pdp_url;
  const expectedUrl = input.expected_pivota_pdp_url || url;
  const issueTypes = new Set(input.issue_types || []);
  const returnedUrls = input.returned_urls || [];
  const signals = input.signals || {};
  const findings: DiscoverabilityAuditFinding[] = [];
  const checks: PivotaPDPDiscoverabilityAudit["checks"] = {};
  const statusCode = signals.http_status ?? input.preflight_status_code;
  const notDiscovered = issueTypes.has("pivota_pdp_not_discovered");
  const wrongUrl = issueTypes.has("wrong_buying_path_returned");
  const productObjectId = extractPivotaProductObjectId(url);

  checks.http_status =
    !url
      ? "not_applicable"
      : statusCode === undefined || statusCode === null
        ? input.preflight_status === "passed"
          ? "passed"
          : input.preflight_status === "failed"
            ? "needs_work"
            : "unknown"
        : statusCode >= 200 && statusCode < 400
          ? "passed"
          : "needs_work";
  if (checks.http_status === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "indexability_gap",
        "Pivota PDP did not have a confirmed successful public preflight.",
        ["pivota_indexability_patch"],
        "high"
      )
    );
  }

  const robotsMeta = String(signals.robots_meta || "").toLowerCase();
  checks.indexability = robotsMeta
    ? robotsMeta.includes("noindex") || robotsMeta.includes("none")
      ? "needs_work"
      : "passed"
    : notDiscovered
      ? "unknown"
      : "unknown";
  if (checks.indexability === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "indexability_gap",
        "Pivota PDP appears to include robots directives that may prevent indexing.",
        ["pivota_indexability_patch"],
        "high"
      )
    );
  }

  checks.public_agent_url =
    url && safeUrlHost(url) === "agent.pivota.cc" && productObjectId
      ? "passed"
      : url
        ? "needs_work"
        : "not_applicable";
  if (checks.public_agent_url === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "pivota_product_identity_gap",
        "Pivota PDP URL does not match the public agent.pivota.cc/products/{canonical_product_slug_or_product_entity_id} pattern.",
        ["pivota_indexability_patch", "pivota_product_intelligence_patch"],
        "high"
      )
    );
  }

  checks.canonical_url = signals.canonical_url
    ? normalizeUrlForCompare(signals.canonical_url) === normalizeUrlForCompare(expectedUrl)
      ? "passed"
      : "needs_work"
    : notDiscovered
      ? "needs_work"
      : "unknown";
  if (checks.canonical_url === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "canonical_gap",
        "Pivota PDP canonical URL was missing, unavailable, or did not match the expected agent-facing PDP.",
        ["pivota_indexability_patch"],
        "medium"
      )
    );
  }

  const identityText = [
    signals.title,
    signals.h1,
    signals.visible_product_name,
    signals.visible_description,
  ]
    .filter(Boolean)
    .join(" ");
  checks.product_identity =
    identityText || signals.visible_brand
      ? textContainsCoreProduct(identityText, input.product_name)
        ? "passed"
        : "needs_work"
      : notDiscovered
        ? "needs_work"
        : "unknown";
  if (checks.product_identity === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "pivota_product_identity_gap",
        "Pivota PDP did not clearly expose the product identity, brand, title, H1, or overview.",
        ["pivota_product_intelligence_patch"],
        "high"
      )
    );
  }

  const productSchemaPresent =
    signals.product_jsonld_present === true || hasJsonLdType(input, "Product");
  checks.product_jsonld = productSchemaPresent
    ? "passed"
    : signals.product_jsonld_present === false || notDiscovered
      ? "needs_work"
      : "unknown";
  if (checks.product_jsonld === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "missing_product_schema",
        "Product JSON-LD was missing or not confirmed for the Pivota PDP.",
        ["pivota_product_schema_patch"],
        "high"
      )
    );
  }

  const offerSchemaPresent =
    signals.offer_jsonld_present === true ||
    signals.aggregate_offer_jsonld_present === true ||
    hasJsonLdType(input, "Offer") ||
    hasJsonLdType(input, "AggregateOffer");
  checks.offer_jsonld = offerSchemaPresent
    ? "passed"
    : signals.offer_jsonld_present === false ||
        signals.aggregate_offer_jsonld_present === false ||
        notDiscovered
      ? "needs_work"
      : "unknown";
  if (checks.offer_jsonld === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "missing_offer_schema",
        "Offer or AggregateOffer JSON-LD was missing or not confirmed for the Pivota PDP.",
        ["pivota_offer_schema_patch"],
        "medium"
      )
    );
  }

  checks.source_reference =
    signals.source_reference_present === true
      ? "passed"
      : signals.source_reference_present === false || notDiscovered
        ? "needs_work"
        : "unknown";
  if (checks.source_reference === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "missing_source_reference",
        "Merchant PDP source reference was missing or not confirmed on the Pivota PDP.",
        ["pivota_source_reference_patch"],
        "high"
      )
    );
  }

  checks.offer_source_url =
    signals.offer_source_url_present === true
      ? "passed"
      : signals.offer_source_url_present === false || notDiscovered
        ? "needs_work"
        : "unknown";
  if (checks.offer_source_url === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "pivota_offer_reference_gap",
        "Pivota PDP did not confirm an offer source URL for the merchant offer.",
        ["pivota_offer_schema_patch", "pivota_source_reference_patch"],
        "medium"
      )
    );
  }

  checks.product_intelligence =
    signals.product_intelligence_populated === true
      ? "passed"
      : signals.product_intelligence_populated === false || notDiscovered
        ? "needs_work"
        : "unknown";
  if (checks.product_intelligence === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "pivota_product_intelligence_gap",
        "Pivota product intelligence module, overview, or normalized product content was missing or thin.",
        ["pivota_product_intelligence_patch"],
        "high"
      )
    );
  }

  checks.similar_card_highlight =
    signals.similar_card_highlight_present === true
      ? "passed"
      : signals.similar_card_highlight_present === false || notDiscovered
        ? "needs_work"
        : "unknown";
  if (checks.similar_card_highlight === "needs_work") {
    addFindingOnce(
      findings,
      auditFinding(
        "similar_card_missing_highlight",
        "Similar/substitute/related product module did not have a meaningful highlight.",
        ["pivota_product_intelligence_patch"],
        "medium"
      )
    );
  }

  checks.product_object_id =
    signals.product_object_id_present === true || Boolean(productObjectId)
      ? "passed"
      : signals.product_object_id_present === false || notDiscovered
        ? "needs_work"
        : "unknown";

  checks.expected_url_returned = expectedUrlReturned(expectedUrl, returnedUrls)
    ? "passed"
    : notDiscovered
      ? "needs_work"
      : "unknown";
  if (wrongUrl) {
    addFindingOnce(
      findings,
      auditFinding(
        "wrong_url_returned",
        "Search-grounded Gemini returned a different buying path than the expected merchant/Pivota PDP.",
        [
          "wrong_url_analysis",
          "canonical_buying_path_patch",
          "competitor_or_retailer_confusion_patch",
        ],
        "medium"
      )
    );
  }

  return {
    audit_type: "pivota_pdp",
    url,
    expected_url: expectedUrl,
    status: auditStatus(findings, url),
    summary: notDiscovered
      ? "Search-grounded Gemini did not return the Pivota PDP. Recommended fixes focus on making the Pivota agent-facing PDP indexable, source-backed, and clearly associated with the product and merchant offer."
      : "Pivota PDP discoverability audit checks canonical ProductEntity PDP indexability, source references, merchant offers, structured data, product identity, and product intelligence signals.",
    checks,
    findings,
    recommended_action_types: recommendedActionTypes(findings),
  };
}

const merchantDiscoverabilityFixCopy: Record<string, string> = {
  merchant_indexability_patch:
    "Make sure the PDP is indexable, canonical, and accessible to search-grounded AI.",
  merchant_product_schema_patch:
    "Add or fix Product structured data with name, brand, SKU, canonical URL, description, and image.",
  merchant_offer_schema_patch:
    "Add or fix Offer structured data with price, currency, availability, seller, and URL where applicable.",
  merchant_canonical_url_patch:
    "Ensure the canonical URL points to the official merchant PDP.",
  merchant_pdp_copy_patch:
    "Strengthen page title, H1, product description, and use-case language so the PDP clearly matches relevant search queries.",
  merchant_sitemap_submission:
    "Ensure the PDP is included in sitemap and eligible for indexing.",
};

const pivotaDiscoverabilityFixCopy: Record<string, string> = {
  pivota_indexability_patch:
    "Make sure the Pivota PDP is public, indexable, canonical, and accessible.",
  pivota_product_schema_patch:
    "Add or fix Product structured data for the Pivota PDP.",
  pivota_offer_schema_patch:
    "Add or fix Offer/AggregateOffer structured data for merchant offers.",
  pivota_source_reference_patch:
    "Add merchant PDP as a verified source reference on the Pivota PDP.",
  pivota_sitemap_submission:
    "Ensure the Pivota PDP appears in the agent.pivota.cc sitemap and is submitted for indexing.",
  pivota_search_console_indexing_request:
    "Request indexing for the canonical Pivota ProductEntity PDP in Google Search Console after sitemap submission.",
  pivota_internal_link_patch:
    "Add crawlable internal links from public Pivota index/category surfaces to the canonical ProductEntity PDP.",
  pivota_search_console_url_inspection:
    "Validate the canonical Pivota PDP with Search Console URL Inspection and record indexing status.",
  pivota_product_intelligence_patch:
    "Complete product identity, overview, product intelligence module, and similar/substitute highlights.",
};

const sharedDiscoverabilityFixCopy: Record<string, string> = {
  wrong_url_analysis:
    "Identify which wrong URLs/domains were returned and why they may be outranking the expected PDP.",
  canonical_buying_path_patch:
    "Strengthen canonical source references and buying path metadata for the expected merchant/Pivota PDP.",
  competitor_or_retailer_confusion_patch:
    "Update Pivota product graph and source references to reduce confusion with third-party retailers or competitor pages.",
};

function fixesForActionTypes(
  actionTypes: string[],
  copyByActionType: Record<string, string>
) {
  return unique(actionTypes).flatMap((actionType) =>
    copyByActionType[actionType] ? [copyByActionType[actionType]] : []
  );
}

function returnedUrlEvidenceSummary(returnedUrls: string[], returnedDomains: string[]) {
  if (!returnedUrls.length && !returnedDomains.length) {
    return "No returned URLs were captured from model output or grounding metadata.";
  }
  const urlText = returnedUrls.slice(0, 5).join("; ") || "No full URLs captured";
  const domainText = returnedDomains.slice(0, 5).join(", ") || "No domains captured";
  return `Returned URLs: ${urlText}. Returned domains: ${domainText}.`;
}

export class MerchantFacingReportService {
  latestForRun(runId: string) {
    const report =
      new ProductionValidationRunService().get(runId).merchant_facing_report_draft ||
      null;
    return report ? this.ensurePivotaDiscoveryProgress(report) : null;
  }

  get(reportId: string) {
    const run = getAgentCenterState().productionValidationRuns.find(
      (item) => item.merchant_facing_report_draft?.id === reportId
    );
    return run?.merchant_facing_report_draft
      ? this.ensurePivotaDiscoveryProgress(run.merchant_facing_report_draft)
      : null;
  }

  private ensurePivotaDiscoveryProgress(report: MerchantFacingValidationReport) {
    if (report.pivota_discovery_progress) return report;
    report.pivota_discovery_progress = pivotaDiscoveryProgressFor({
      product_entity_id:
        report.path_readiness?.pivota_agent_facing_path?.product_entity_id,
      canonical_pivota_pdp_url:
        report.path_readiness?.pivota_agent_facing_path
          ?.canonical_pivota_pdp_url ||
        report.path_readiness?.pivota_agent_facing_path?.pivota_pdp_url,
      pivota_preflight_status:
        report.path_readiness?.pivota_agent_facing_path?.preflight_status,
      contextual_pivota_attribution_status:
        report.readiness_result?.contextual_pivota_attribution?.status,
      pivota_audit: report.discoverability_fix_plan?.pivota_pdp_audit,
      has_offer: Boolean(
        report.path_readiness?.pivota_agent_facing_path?.pivota_offer_id ||
          report.path_readiness?.pivota_agent_facing_path?.merchant_offer_id ||
          report.path_readiness?.offer_readiness?.readiness_scores?.length
      ),
    });
    return report;
  }

  updateStatus(
    runId: string,
    input: {
      report_status?: MerchantFacingValidationReport["report_status"];
      status?: MerchantFacingValidationReport["report_status"];
      reviewed_by?: string;
      approved_by?: string;
    }
  ) {
    const run = new ProductionValidationRunService().get(runId);
    const report = run.merchant_facing_report_draft;
    if (!report) {
      throw new Error(`Merchant-facing report draft not found for run: ${runId}`);
    }

    const nextStatus = input.report_status || input.status;
    if (!nextStatus || !["draft", "reviewed", "approved_to_share"].includes(nextStatus)) {
      throw new Error("Unsupported merchant-facing report status update");
    }

    const now = nowIso();
    report.report_status = nextStatus;
    report.status = nextStatus;
    if (nextStatus === "reviewed") {
      report.reviewed_at = report.reviewed_at || now;
      report.reviewed_by = input.reviewed_by || report.reviewed_by || "internal";
    }
    if (nextStatus === "approved_to_share") {
      report.reviewed_at = report.reviewed_at || now;
      report.reviewed_by = input.reviewed_by || report.reviewed_by || "internal";
      report.approved_to_share_at = report.approved_to_share_at || now;
      report.approved_by = input.approved_by || report.approved_by || "internal";
    }
    touch(report);
    touch(run);
    return report;
  }

  private modeRan(report: ProductionValidationReport, scanMode: ScanMode) {
    return report.demand_test_summary.modes_run.some(
      (summary) => summary.scan_mode === scanMode
    );
  }

  private demandScoreForMode(
    report: ProductionValidationReport,
    scanMode: ScanMode,
    key: keyof DemandVisibilityScore["aggregate_scores"]
  ): VisibilityScoreValue | undefined {
    const value = report.demand_test_summary.modes_run.find(
      (summary) => summary.scan_mode === scanMode
    )?.aggregate_scores[key];
    return value as VisibilityScoreValue | undefined;
  }

  private reportIssues(report: ProductionValidationReport) {
    const issueIds = new Set(
      report.demand_test_summary.modes_run.flatMap((summary) => summary.issue_ids)
    );
    for (const blocker of report.top_blockers) {
      if (blocker.issue_id) issueIds.add(blocker.issue_id);
    }
    return getAgentCenterState().issues.filter((issue) => issueIds.has(issue.id));
  }

  private reportIssueForTypes(
    report: ProductionValidationReport,
    issueTypes: AgenticGMVIssueType[]
  ) {
    return issueForTypes(this.reportIssues(report), issueTypes);
  }

  private reportIssueEvidence(issue?: AgenticGMVIssue) {
    if (!issue) return undefined;
    return (
      stringInput(issue.evidence?.summary) ||
      stringInput(issue.evidence?.discovery_interpretation) ||
      issue.merchant_facing_summary
    );
  }

  private contextualMerchantAttributionStatus(report: ProductionValidationReport) {
    if (!this.modeRan(report, "merchant_store_attribution_test")) {
      return "not_tested" as GMVAssuranceDimensionStatus;
    }
    return (
      report.gmv_assurance_snapshot?.demand_test_summary
        .merchant_attribution_status.status || "not_tested"
    );
  }

  private contextualPivotaAttributionStatus(report: ProductionValidationReport) {
    if (!this.modeRan(report, "pivota_pdp_attribution_test")) {
      return "not_tested" as GMVAssuranceDimensionStatus;
    }
    return (
      report.gmv_assurance_snapshot?.demand_test_summary
        .pivota_attribution_status.status || "not_tested"
    );
  }

  markdownForRun(runId: string) {
    const report = this.latestForRun(runId);
    if (!report) return "";
    return this.toMarkdown(report);
  }

  toMarkdown(report: MerchantFacingValidationReport) {
    report = this.ensurePivotaDiscoveryProgress(report);
    const lines: string[] = [
      `# ${report.title}`,
      "",
      `Status: ${report.report_status.replace(/_/g, " ")}`,
      `Validation run: ${report.production_validation_run_id}`,
      "",
      "## Executive Summary",
      report.executive_summary,
      "",
      "## Discovery vs Readiness",
      report.discovery_vs_readiness,
      "",
      "## Discoverability",
      `Status: ${report.path_readiness.discoverability.status.replace(/_/g, " ")}`,
      report.path_readiness.discoverability.summary,
      "",
      "## Discovery Result",
      `Organic product discovery: ${reportScoreLabel(report.discovery_result.organic_product_discovery.score)} (${reportStatusLabel(report.discovery_result.organic_product_discovery.status)})`,
      `Organic brand discovery: ${reportScoreLabel(report.discovery_result.organic_brand_discovery.score)} (${reportStatusLabel(report.discovery_result.organic_brand_discovery.status)})`,
      `Competitor dominance: ${reportScoreLabel(report.discovery_result.competitor_dominance.score)} (${reportStatusLabel(report.discovery_result.competitor_dominance.status)})`,
      `Search-grounded merchant PDP discovery: ${reportScoreLabel(report.discovery_result.search_grounded_merchant_pdp_discovery.score)} (${reportStatusLabel(report.discovery_result.search_grounded_merchant_pdp_discovery.status)})`,
      report.discovery_result.search_grounded_merchant_pdp_discovery.summary,
      `Search-grounded Pivota PDP discovery: ${reportScoreLabel(report.discovery_result.search_grounded_pivota_pdp_discovery.score)} (${reportStatusLabel(report.discovery_result.search_grounded_pivota_pdp_discovery.status)})`,
      report.discovery_result.search_grounded_pivota_pdp_discovery.summary,
      `Buying-path discovery: ${reportScoreLabel(report.discovery_result.buying_path_discovery.score)} (${reportStatusLabel(report.discovery_result.buying_path_discovery.status)})`,
      `URL match accuracy: ${reportScoreLabel(report.discovery_result.url_match_accuracy.score)} (${reportStatusLabel(report.discovery_result.url_match_accuracy.status)})`,
      report.discovery_result.url_match_accuracy.summary,
      report.discovery_result.interpretation,
      "",
      "## Discovery Evidence",
      report.discovery_evidence.missing_merchant_product_summary,
      report.discovery_evidence.competitor_rank_summary,
      report.discovery_evidence.likely_competitor_advantage_summary,
      ...report.discovery_evidence.tested_organic_queries.map(
        (item) =>
          `- Query: "${item.query}" | merchant product appeared: ${item.merchant_product_appeared ? "yes" : "no"} | merchant brand appeared: ${item.merchant_brand_appeared ? "yes" : "no"} | competitors: ${item.returned_competitors.join(", ") || "none"}`
      ),
      "",
      "## Discoverability Fix Plan",
      report.discoverability_fix_plan.summary,
      "",
      "Merchant PDP audit findings:",
      ...report.discoverability_fix_plan.merchant_pdp_audit.findings.map(
        (finding) => `- ${titleCase(finding.finding_type)}: ${finding.summary}`
      ),
      `Indexability Audit: ${report.discoverability_fix_plan.pivota_pdp_audit.status.replace(/_/g, " ")}`,
      "Pivota PDP / Indexability audit findings:",
      ...report.discoverability_fix_plan.pivota_pdp_audit.findings.map(
        (finding) => `- ${titleCase(finding.finding_type)}: ${finding.summary}`
      ),
      "Returned/wrong URL evidence:",
      report.discoverability_fix_plan.returned_url_evidence_summary,
      "Merchant-owned fixes:",
      ...report.discoverability_fix_plan.merchant_owned_fixes.map((fix) => `- ${fix}`),
      "Pivota-owned fixes:",
      ...report.discoverability_fix_plan.pivota_owned_fixes.map((fix) => `- ${fix}`),
      "Shared fixes:",
      ...report.discoverability_fix_plan.shared_fixes.map((fix) => `- ${fix}`),
      "Retest plan:",
      ...report.discoverability_fix_plan.retest_plan.map((step) => `- ${step}`),
      "",
      "## Merchant-Owned Path",
      `Merchant PDP URL: ${report.path_readiness.merchant_owned_path.merchant_pdp_url}`,
      `PDP preflight: ${report.path_readiness.merchant_owned_path.preflight_status.replace(/_/g, " ")}`,
      `Merchant attribution: ${report.path_readiness.merchant_owned_path.attribution_status.replace(/_/g, " ")}`,
      `Merchant offer source: ${report.path_readiness.merchant_owned_path.offer_source_status.replace(/_/g, " ")}`,
      `Merchant checkout path: ${report.path_readiness.merchant_owned_path.checkout_path_status.replace(/_/g, " ")}`,
      report.path_readiness.merchant_owned_path.summary,
      "",
      "## Pivota Agent-Facing Path",
      "Pivota PDP represents a canonical product entity with merchant offers; it does not replace the merchant-owned PDP.",
      `Canonical Pivota PDP URL: ${report.path_readiness.pivota_agent_facing_path.canonical_pivota_pdp_url || report.path_readiness.pivota_agent_facing_path.pivota_pdp_url || "Not provided"}`,
      `ProductEntity ID: ${report.path_readiness.pivota_agent_facing_path.product_entity_id || "Not provided"}`,
      `Source alias / external seed ID: ${report.path_readiness.pivota_agent_facing_path.external_seed_id || "Not provided"}`,
      `Tested merchant offer ID: ${report.path_readiness.pivota_agent_facing_path.merchant_offer_id || "Not provided"}`,
      `Tested Pivota offer ID: ${report.path_readiness.pivota_agent_facing_path.pivota_offer_id || "Not provided"}`,
      `Pivota preflight: ${report.path_readiness.pivota_agent_facing_path.preflight_status.replace(/_/g, " ")}`,
      `Pivota attribution: ${report.path_readiness.pivota_agent_facing_path.attribution_status.replace(/_/g, " ")}`,
      `Pivota offer state: ${report.path_readiness.pivota_agent_facing_path.offer_state_status.replace(/_/g, " ")}`,
      `Pivota checkout handoff: ${report.path_readiness.pivota_agent_facing_path.checkout_handoff_status.replace(/_/g, " ")}`,
      report.path_readiness.pivota_agent_facing_path.summary,
      "",
      "## Readiness",
      `Contextual merchant attribution: ${reportStatusLabel(report.readiness_result.contextual_merchant_attribution.status)}. ${report.readiness_result.contextual_merchant_attribution.summary}`,
      `Contextual Pivota attribution: ${reportStatusLabel(report.readiness_result.contextual_pivota_attribution.status)}. ${report.readiness_result.contextual_pivota_attribution.summary}`,
      `Product/SKU readiness: ${report.path_readiness.product_sku_readiness.status.replace(/_/g, " ")}`,
      `Offer readiness: ${report.path_readiness.offer_readiness.status.replace(/_/g, " ")}`,
      `Checkout readiness: ${report.path_readiness.checkout_readiness.status.replace(/_/g, " ")}`,
      "",
      "## Blockers and Recommended Fixes",
      ...report.blockers.map(
        (blocker) =>
          `- ${titleCase(blocker.blocker_type)} (${blocker.severity}) on ${blocker.affected_layer}: ${blocker.recommended_action}`
      ),
      ...(report.blockers.length ? [] : ["- No high-severity blocker was generated."]),
      "",
      "## Recommended Fixes",
      "Merchant-owned fixes:",
      ...report.recommended_fix_sections.merchant_owned_fixes.map((item) => `- ${item}`),
      "Pivota-owned fixes:",
      ...report.recommended_fix_sections.pivota_owned_fixes.map((item) => `- ${item}`),
      "Shared fixes:",
      ...report.recommended_fix_sections.shared_fixes.map((item) => `- ${item}`),
      "",
      "## Pivota-Owned Optimization Applied",
      report.pivota_owned_optimization_applied.summary,
      ...report.pivota_owned_optimization_applied.actions_applied.map(
        (action) =>
          `- ${titleCase(action.patch_type)} on ${titleCase(action.target_layer)}${action.applied_at ? ` (applied ${action.applied_at})` : ""}`
      ),
      ...(report.pivota_owned_optimization_applied.score_deltas.length
        ? report.pivota_owned_optimization_applied.score_deltas.map(
            (delta) =>
              `- ${titleCase(delta.score_name)}: ${reportScoreLabel(delta.before)} to ${reportScoreLabel(delta.after)}${typeof delta.delta === "number" ? ` (${delta.delta >= 0 ? "+" : ""}${delta.delta})` : ""}`
          )
        : ["- No comparable rerun score delta is available yet."]),
      ...(report.pivota_owned_optimization_applied.blockers_remaining.length
        ? [
            `Remaining blockers: ${report.pivota_owned_optimization_applied.blockers_remaining.map(titleCase).join(", ")}`,
          ]
        : ["Remaining blockers: none"]),
      "",
      "## Pivota Discovery Progress",
      report.pivota_discovery_progress.summary,
      `Current status: ${titleCase(report.pivota_discovery_progress.status)}`,
      `Next operator action: ${report.pivota_discovery_progress.next_recommended_operator_action}`,
      `Next rerun: ${report.pivota_discovery_progress.next_rerun_at || "Not scheduled"}`,
      `Last search-grounded Pivota PDP discovery score: ${reportScoreLabel(report.pivota_discovery_progress.last_search_grounded_discovery_score)}`,
      `Uplift claim allowed: ${report.pivota_discovery_progress.uplift_claim_allowed ? "yes" : "no"}`,
      ...report.pivota_discovery_progress.steps.map(
        (step) => `- ${step.label}: ${titleCase(step.status)}. ${step.summary}`
      ),
      "",
      "## Retest Plan",
      ...report.retest_plan.map((item) => `- ${item}`),
      "",
      "## Usage Preview",
      report.usage_statement.merchant_copy,
      `Total preview credits: ${report.usage_statement.total_preview_credits}`,
      `Billing status: ${report.usage_statement.billing_status}`,
      "",
      "## What V1 Does Not Prove",
      ...report.v1_does_not_prove.map((item) => `- ${item}`),
      "",
      "## Safety Notes",
      ...report.safety_warnings.map((warning) => `- ${warning.message}`),
    ];

    return `${lines.join("\n")}\n`;
  }

  generate(
    runId: string,
    options: {
      regenerate?: boolean;
      audience?: MerchantFacingValidationReport["audience"];
    } = {}
  ) {
    const run = new ProductionValidationRunService().get(runId);
    if (run.merchant_facing_report_draft && !options.regenerate) {
      return run.merchant_facing_report_draft;
    }
    if (!run.validation_report) {
      throw new Error(
        `Production validation run must be completed before report generation: ${runId}`
      );
    }

    const report = run.validation_report;
    const snapshot = report.gmv_assurance_snapshot;
    const discovery = snapshot?.discovery_readiness_summary;
    const demand = snapshot?.demand_test_summary;
    const offer = snapshot?.offer_execution_summary;
    const checkout = snapshot?.checkout_verification_summary;
    const merchantAttribution = this.contextualMerchantAttributionStatus(report);
    const pivotaAttribution = this.contextualPivotaAttributionStatus(report);
    const offerStatus = offer?.offer_readiness_status.status || "not_tested";
    const checkoutStatus = checkout?.checkout_readiness_status.status || "not_tested";
    const productDataStatus =
      snapshot?.product_understanding_summary.product_data_readiness_status.status ||
      "not_tested";
    const skuVariantStatus =
      snapshot?.product_understanding_summary.sku_variant_readiness_status.status ||
      "not_tested";
    const productSkuStatus = combineReportStatuses([
      productDataStatus,
      skuVariantStatus,
    ]);
    const discoveryStatus = combineReportStatuses([
      discovery?.organic_product_discovery_status.status,
      discovery?.merchant_pdp_discovery_status.status,
      discovery?.pivota_pdp_discovery_status.status,
      discovery?.buying_path_discovery_status.status,
      discovery?.competitor_dominance_status.status,
    ]);
    const blockers = this.blockers(report);
    const recommendedFixes = this.recommendedFixes(blockers);
    const discoveryEvidence = this.discoveryEvidence(run, report);
    const discoveryResult = this.discoveryResult(report, discoveryEvidence);
    const discoverabilityFixPlan = this.discoverabilityFixPlan(
      report,
      discoveryResult
    );
    const readinessResult = this.readinessResult({
      report,
      productSkuStatus,
      productDataStatus,
      skuVariantStatus,
      merchantAttribution,
      pivotaAttribution,
      offerStatus,
      checkoutStatus,
    });
    const now = nowIso();

    const draft: MerchantFacingValidationReport = {
      id: run.merchant_facing_report_draft?.id || nextId("merchant_report"),
      production_validation_run_id: run.id,
      merchant_id: snapshot?.merchant_id,
      store_id: snapshot?.store_id,
      scan_target_id: report.target_summary.scan_target_id || run.scan_target_id,
      report_type: "agent_center_production_validation",
      audience: options.audience || "merchant",
      status: "draft",
      report_status: "draft",
      title: `${report.target_summary.brand || report.target_summary.merchant_name} Agent Center validation report`,
      executive_summary: this.executiveSummary(report, discoveryStatus),
      discovery_vs_readiness: this.discoveryVsReadinessSummary(report),
      discovery_result: discoveryResult,
      readiness_result: readinessResult,
      discovery_evidence: discoveryEvidence,
      discoverability_fix_plan: discoverabilityFixPlan,
      pivota_owned_optimization_applied: this.pivotaOwnedOptimizationApplied(
        run,
        report
      ),
      pivota_discovery_progress: pivotaDiscoveryProgressFor({
        product_entity_id: report.target_summary.product_entity_id,
        canonical_pivota_pdp_url:
          report.target_summary.canonical_pivota_pdp_url ||
          report.target_summary.pivota_pdp_url,
        pivota_preflight_status: report.url_preflight_results.pivota_pdp.status,
        contextual_pivota_attribution_status: pivotaAttribution,
        pivota_audit: discoverabilityFixPlan.pivota_pdp_audit,
        has_offer: Boolean(
          report.target_summary.pivota_offer_id ||
            report.target_summary.merchant_offer_id ||
            report.offer_execution_summary.diagnosis_ids.length
        ),
      }),
      tested_product: {
        merchant_name: report.target_summary.merchant_name,
        store_url: report.target_summary.store_url,
        product_name: report.target_summary.product_name,
        brand: report.target_summary.brand,
        sku_name: report.target_summary.sku_name,
        category: report.target_summary.category,
        market: report.target_summary.market,
        language: report.target_summary.language,
        currency: report.target_summary.currency,
      },
      path_readiness: {
        discoverability: {
          status: discoveryStatus,
          summary: this.discoverySummary(report, discoveryStatus),
          organic_product_discovery:
            discovery?.organic_product_discovery_status.score,
          merchant_pdp_discovery: discovery?.merchant_pdp_discovery_status.score,
          pivota_pdp_discovery: discovery?.pivota_pdp_discovery_status.score,
          buying_path_discovery: discovery?.buying_path_discovery_status.score,
          competitor_dominance: discovery?.competitor_dominance_status.score,
        },
        product_sku_readiness: {
          status: productSkuStatus,
          product_data_status: productDataStatus,
          sku_variant_status: skuVariantStatus,
          summary: this.productSkuSummary(productDataStatus, skuVariantStatus),
        },
        merchant_owned_path: {
          merchant_pdp_url: report.target_summary.merchant_pdp_url,
          preflight_status: report.url_preflight_results.merchant_pdp.status,
          attribution_status: merchantAttribution,
          offer_source_status: offerStatus,
          checkout_path_status: checkoutStatus,
          summary: this.merchantPathSummary(report, merchantAttribution),
        },
        pivota_agent_facing_path: {
          pivota_pdp_url: report.target_summary.pivota_pdp_url,
          canonical_pivota_pdp_url:
            report.target_summary.canonical_pivota_pdp_url,
          product_entity_id: report.target_summary.product_entity_id,
          canonical_product_slug: report.target_summary.canonical_product_slug,
          external_seed_id: report.target_summary.external_seed_id,
          merchant_offer_id: report.target_summary.merchant_offer_id,
          pivota_offer_id: report.target_summary.pivota_offer_id,
          preflight_status: report.url_preflight_results.pivota_pdp.status,
          attribution_status: pivotaAttribution,
          offer_state_status: offerStatus,
          checkout_handoff_status: checkoutStatus,
          summary: this.pivotaPathSummary(report, pivotaAttribution),
        },
        offer_readiness: {
          status: offerStatus,
          readiness_scores: report.offer_execution_summary.readiness_scores,
          findings: report.offer_execution_summary.findings,
          summary: this.offerSummary(report, offerStatus),
        },
        checkout_readiness: {
          status: checkoutStatus,
          readiness_scores: report.checkout_verification_summary.readiness_scores,
          findings: report.checkout_verification_summary.findings,
          summary: this.checkoutSummary(report, checkoutStatus),
        },
      },
      blockers,
      recommended_fixes: recommendedFixes,
      recommended_fix_sections: this.recommendedFixSections(
        blockers,
        recommendedFixes
      ),
      retest_plan: this.retestPlan(report, blockers),
      usage_statement: {
        ...report.usage_summary,
        merchant_copy:
          "This report uses AI Test Credits in preview mode only. Usage is not invoiced, and merchant-facing reporting shows credits only.",
      },
      v1_does_not_prove: [
        "Real payment authorization",
        "PSP success",
        "Order placement",
        "Order write-back",
        "Refunds",
        "Settlement",
        "Final GMV attribution",
        "Real billing or invoicing",
        "Consumer Gemini UI or AI Mode ranking",
      ],
      safety_warnings: this.safetyWarnings(run, report),
      sharing_notes: [
        "This is a merchant-facing draft generated from validated Agent Center outputs.",
        "Provider response details, generation traces, provider cost details, and internal diagnostics are intentionally excluded.",
        "Contextual attribution is reported separately from natural or search-grounded discovery.",
      ],
      source_summary: {
        issue_ids: run.issue_ids,
        product_diagnosis_ids: run.product_diagnosis_ids,
        offer_diagnosis_ids: run.offer_diagnosis_ids,
        checkout_diagnosis_ids: run.checkout_diagnosis_ids,
        gmv_assurance_snapshot_id: run.gmv_assurance_snapshot_id,
      },
      created_at: run.merchant_facing_report_draft?.created_at || now,
      updated_at: now,
    };

    // Keep the deterministic report draft on the existing validation run payload
    // so DB-backed deployments do not need a separate report table for V1.
    run.merchant_facing_report_draft = draft;
    touch(run);
    return draft;
  }

  private executiveSummary(
    report: ProductionValidationReport,
    discoveryStatus: GMVAssuranceDimensionStatus
  ) {
    const readiness = report.gmv_assurance_snapshot?.readiness_level || "monitoring";
    const blocker = report.top_blockers[0];
    if (blocker) {
      return `Agent Center validated ${report.target_summary.product_name}. Overall readiness is ${readiness.replace(/_/g, " ")}. The primary blocker is ${titleCase(blocker.blocker_type)} on ${blocker.affected_layer}; the recommended next action is: ${report.next_best_action}`;
    }
    return `Agent Center validated ${report.target_summary.product_name}. Overall readiness is ${readiness.replace(/_/g, " ")} and discovery readiness is ${reportStatusLabel(discoveryStatus)}. No high-severity blocker was generated in this run.`;
  }

  private discoveryVsReadinessSummary(report: ProductionValidationReport) {
    const snapshot = report.gmv_assurance_snapshot;
    const discovery = snapshot?.discovery_readiness_summary;
    const demand = snapshot?.demand_test_summary;
    const offer = snapshot?.offer_execution_summary;
    const organicFailed =
      discovery?.organic_product_discovery_status.status === "blocked" ||
      discovery?.organic_product_discovery_status.status === "needs_work";
    const competitorDominated =
      discovery?.competitor_dominance_status.status === "blocked" ||
      discovery?.competitor_dominance_status.status === "needs_work";
    const merchantAttribution = this.contextualMerchantAttributionStatus(report);
    const pivotaAttribution = this.contextualPivotaAttributionStatus(report);
    const contextualPathsPassed =
      merchantAttribution === "passed" && pivotaAttribution === "passed";
    const searchGroundedPivotaScore = this.demandScoreForMode(
      report,
      "search_grounded_product_discovery_test",
      "search_grounded_pivota_pdp_discovery_score"
    );
    const searchGroundedPivotaFailed =
      typeof searchGroundedPivotaScore === "number" &&
      searchGroundedPivotaScore === 0;
    const readinessPassed =
      demand?.product_visibility_status.status === "passed" &&
      offer?.offer_readiness_status.status === "passed";
    const checkoutNotTested =
      snapshot?.checkout_verification_summary.checkout_readiness_status.status ===
      "not_tested";
    const safetyTail = [
      checkoutNotTested
        ? "Checkout readiness was not tested because checkout metadata was missing."
        : "",
      "V1 does not prove payment authorization, PSP success, order placement, settlement, final GMV attribution, or real billing.",
    ]
      .filter(Boolean)
      .join(" ");

    if (organicFailed && competitorDominated && contextualPathsPassed && readinessPassed) {
      return `${DISCOVERY_VS_READINESS_CONTEXTUAL_PASSED} ${safetyTail}`;
    }

    if (pivotaAttribution === "passed" && searchGroundedPivotaFailed) {
      return [
        "Pivota PDP is ready when surfaced, but search-grounded Gemini has not yet returned the canonical Pivota PDP.",
        "No discovery uplift is claimed.",
        "Next step: complete indexing/public discoverability tasks and rerun search-grounded discovery.",
        safetyTail,
      ].join(" ");
    }

    return [
      "Discoverability answers whether AI users can naturally find the product without injected merchant/Pivota URL context.",
      "Readiness answers whether the merchant-owned and Pivota agent-facing paths work once surfaced.",
      `Organic discovery is ${reportStatusLabel(discovery?.organic_product_discovery_status.status)}; merchant attribution is ${reportStatusLabel(merchantAttribution)}; Pivota attribution is ${reportStatusLabel(pivotaAttribution)}; offer readiness is ${reportStatusLabel(offer?.offer_readiness_status.status)}.`,
      "Contextual attribution passed does not mean organic discovery passed.",
      "Search-grounded discovery is separate from both organic discovery and contextual attribution.",
      safetyTail,
    ].join(" ");
  }

  private discoverySummary(
    report: ProductionValidationReport,
    status: GMVAssuranceDimensionStatus
  ) {
    const discovery = report.gmv_assurance_snapshot?.discovery_readiness_summary;
    if (!discovery) {
      return "Discovery was not included in this validation run.";
    }
    return [
      `Discovery readiness is ${reportStatusLabel(status)}.`,
      `Organic product discovery: ${reportScoreLabel(discovery.organic_product_discovery_status.score)}.`,
      `Merchant PDP discovery: ${reportScoreLabel(discovery.merchant_pdp_discovery_status.score)}.`,
      `Pivota PDP discovery: ${reportScoreLabel(discovery.pivota_pdp_discovery_status.score)}.`,
      "Search-grounded discovery is distinct from contextual attribution and only counts URLs returned by Gemini or grounding metadata.",
    ].join(" ");
  }

  private parsedForMode(run: ProductionValidationRun, scanMode: ScanMode) {
    const state = getAgentCenterState();
    const jobIds = new Set(
      state.jobs
        .filter(
          (job) =>
            job.scan_target_id === run.scan_target_id &&
            job.scan_mode === scanMode
        )
        .map((job) => job.id)
    );
    const runIds = new Set(
      state.testRuns.filter((testRun) => jobIds.has(testRun.job_id)).map((testRun) => testRun.id)
    );
    return state.parsedRecommendations.filter((item) =>
      runIds.has(item.test_run_id)
    );
  }

  private reportTargetContext(run: ProductionValidationRun) {
    const state = getAgentCenterState();
    const target = run.scan_target_id
      ? state.scanTargets.find((item) => item.id === run.scan_target_id)
      : undefined;
    const store = target
      ? state.stores.find((item) => item.id === target.store_id)
      : state.stores.find((item) => item.merchant_id === productionValidationMerchantId(run.id));
    const products = store?.products || [];
    const product =
      products.find((item) => item.title === run.product_name) ||
      products[0];
    const cluster =
      (target
        ? state.queryClusters.find(
            (item) =>
              item.scan_target_id === target.id &&
              item.intent_type === "category_recommendation"
          )
        : undefined) ||
      (target
        ? state.queryClusters.find((item) => item.scan_target_id === target.id)
        : undefined) || {
        id: run.scan_target_id || run.id,
        merchant_id: productionValidationMerchantId(run.id),
        store_id: store?.id || "",
        scan_target_id: run.scan_target_id || "",
        product_entity_id: run.pivota_product_entity_id,
        target_skus: run.sku_name ? [run.sku_name] : [],
        cluster_name: `${run.product_name} organic discovery`,
        intent_type: "category_recommendation" as const,
        category: run.category || "skincare",
        queries: [
          `${run.category || "skincare"} recommendations`,
          `${run.brand || run.merchant_name} product alternatives`,
        ],
        priority: "high" as const,
        estimated_demand_value: 0,
        created_by: "demand_test_agent" as const,
        required_attributes: [],
        created_at: nowIso(),
        updated_at: nowIso(),
      };

    return { target, store, product, cluster };
  }

  private discoveryEvidence(
    run: ProductionValidationRun,
    report: ProductionValidationReport
  ): MerchantFacingValidationReport["discovery_evidence"] {
    const context = this.reportTargetContext(run);
    const organicParsed = this.parsedForMode(run, "organic_product_discovery_test");
    const organicEvidence = merchantSafeDiscoveryEvidence({
      scanTargetId: run.scan_target_id,
      cluster: context.cluster,
      parsed: organicParsed,
      product: context.product,
      store: context.store,
    });
    const discovery = report.gmv_assurance_snapshot?.discovery_readiness_summary;
    const searchMerchant =
      discovery?.merchant_pdp_discovery_status.score;
    const searchPivota =
      discovery?.pivota_pdp_discovery_status.score;

    return {
      ...organicEvidence,
      discovery_interpretation: this.discoveryInterpretation({
        organicScore: discovery?.organic_product_discovery_status.score,
        searchMerchantScore: searchMerchant,
        searchPivotaScore: searchPivota,
        searchMerchantStatus: discovery?.merchant_pdp_discovery_status.status,
        searchPivotaStatus: discovery?.pivota_pdp_discovery_status.status,
      }),
    };
  }

  private discoveryInterpretation(input: {
    organicScore?: VisibilityScoreValue;
    searchMerchantScore?: VisibilityScoreValue;
    searchPivotaScore?: VisibilityScoreValue;
    searchMerchantStatus?: GMVAssuranceDimensionStatus;
    searchPivotaStatus?: GMVAssuranceDimensionStatus;
  }) {
    const organicFailed =
      typeof input.organicScore === "number" && input.organicScore < 50;
    const merchantFound =
      typeof input.searchMerchantScore === "number" &&
      input.searchMerchantScore >= 80;
    const pivotaFound =
      typeof input.searchPivotaScore === "number" &&
      input.searchPivotaScore >= 80;
    const searchNotConfigured =
      input.searchMerchantScore === "not_configured" ||
      input.searchPivotaScore === "not_configured" ||
      input.searchMerchantStatus === "not_configured" ||
      input.searchPivotaStatus === "not_configured";

    if (searchNotConfigured) {
      return "Search-grounded discovery was not configured in this run.";
    }
    if (organicFailed && merchantFound && !pivotaFound) {
      return "The product does not yet appear in no-context organic category prompts, but the official merchant PDP can be found when the product name is specified. The merchant-owned PDP is discoverable, but the Pivota agent-facing path is not yet discoverable. Pivota should improve public discoverability and source references for the Pivota PDP.";
    }
    if (organicFailed && merchantFound) {
      return "The product does not yet appear in no-context organic category prompts, but the official merchant PDP can be found when the product name is specified.";
    }
    if (organicFailed && !merchantFound && input.searchMerchantScore !== "not_tested") {
      return "Neither organic discovery nor search-grounded product discovery returned the official merchant PDP. This indicates a stronger discoverability gap.";
    }
    if (merchantFound) {
      return "Search-grounded Gemini found the official merchant PDP when the product name was specified.";
    }
    return "Discovery and readiness should be interpreted separately: contextual attribution can pass even when natural discovery still needs work.";
  }

  private discoveryResult(
    report: ProductionValidationReport,
    evidence: MerchantFacingValidationReport["discovery_evidence"]
  ): MerchantFacingValidationReport["discovery_result"] {
    const discovery = report.gmv_assurance_snapshot?.discovery_readiness_summary;
    const organicProductScore =
      this.demandScoreForMode(
        report,
        "organic_product_discovery_test",
        "organic_product_discovery_score"
      ) ??
      discovery?.organic_product_discovery_status.score ??
      "not_tested";
    const organicBrandScore =
      this.demandScoreForMode(
        report,
        "organic_product_discovery_test",
        "organic_brand_discovery_score"
      ) ?? "not_tested";
    const merchantScore =
      this.demandScoreForMode(
        report,
        "search_grounded_product_discovery_test",
        "search_grounded_merchant_pdp_discovery_score"
      ) ?? "not_tested";
    const pivotaScore =
      this.demandScoreForMode(
        report,
        "search_grounded_product_discovery_test",
        "search_grounded_pivota_pdp_discovery_score"
      ) ?? "not_tested";
    const buyingPathScore =
      this.demandScoreForMode(
        report,
        "buying_path_discovery_test",
        "buying_path_discovery_score"
      ) ??
      discovery?.buying_path_discovery_status.score ??
      "not_tested";
    const urlMatchScore =
      this.demandScoreForMode(
        report,
        "search_grounded_product_discovery_test",
        "url_match_accuracy_score"
      ) ??
      this.demandScoreForMode(
        report,
        "buying_path_discovery_test",
        "url_match_accuracy_score"
      ) ??
      "not_tested";
    const searchParsed = report.target_summary.scan_target_id
      ? this.parsedForMode(
          {
            ...({} as ProductionValidationRun),
            id: report.target_summary.production_validation_run_id,
            scan_target_id: report.target_summary.scan_target_id,
          },
          "search_grounded_product_discovery_test"
        )
      : [];
    const returnedUrls = unique(searchParsed.flatMap((item) => item.returned_urls));
    const groundingSources = unique(
      searchParsed.flatMap((item) => item.grounding_sources || [])
    );
    const merchantIssue = this.reportIssueForTypes(report, [
      "merchant_pdp_not_discovered",
      "wrong_buying_path_returned",
      "search_grounding_not_configured",
    ]);
    const pivotaIssue = this.reportIssueForTypes(report, [
      "pivota_pdp_not_discovered",
      "wrong_buying_path_returned",
      "search_grounding_not_configured",
    ]);
    const buyingPathIssue = this.reportIssueForTypes(report, [
      "buying_path_missing",
      "wrong_buying_path_returned",
      "offer_not_discovered",
    ]);
    const organicIssue = this.reportIssueForTypes(report, [
      "organic_product_not_discovered",
      "organic_brand_not_discovered",
      "competitor_dominance",
    ]);

    return {
      organic_product_discovery: {
        status: mapDiscoveryScoreToReportStatus(organicProductScore),
        score: organicProductScore,
        summary: this.discoveryScoreSummary(
          organicProductScore,
          "Organic no-context product discovery"
        ),
        issue_id: organicIssue?.id,
        evidence: this.reportIssueEvidence(organicIssue),
      },
      organic_brand_discovery: {
        status: mapDiscoveryScoreToReportStatus(organicBrandScore),
        score: organicBrandScore,
        summary: this.discoveryScoreSummary(
          organicBrandScore,
          "Organic brand discovery"
        ),
        issue_id: organicIssue?.id,
        evidence: this.reportIssueEvidence(organicIssue),
      },
      competitor_dominance: {
        status: discovery?.competitor_dominance_status.status || "not_tested",
        score: discovery?.competitor_dominance_status.score,
        summary: evidence.competitor_rank_summary,
      },
      search_grounded_merchant_pdp_discovery: {
        status: mapDiscoveryScoreToReportStatus(merchantScore),
        score: merchantScore,
        summary: this.searchGroundedMerchantSummary(merchantScore),
        returned_urls: returnedUrls,
        grounding_sources_count: groundingSources.length,
        issue_id: merchantIssue?.id,
        evidence: this.reportIssueEvidence(merchantIssue),
      },
      search_grounded_pivota_pdp_discovery: {
        status: mapDiscoveryScoreToReportStatus(pivotaScore),
        score: pivotaScore,
        summary: this.searchGroundedPivotaSummary(report, merchantScore, pivotaScore),
        returned_urls: returnedUrls,
        grounding_sources_count: groundingSources.length,
        issue_id: pivotaIssue?.id,
        evidence: this.reportIssueEvidence(pivotaIssue),
      },
      buying_path_discovery: {
        status: mapDiscoveryScoreToReportStatus(buyingPathScore),
        score: buyingPathScore,
        summary: this.buyingPathDiscoverySummary(buyingPathScore),
        issue_id: buyingPathIssue?.id,
        evidence: this.reportIssueEvidence(buyingPathIssue),
      },
      url_match_accuracy: {
        status: mapDiscoveryScoreToReportStatus(urlMatchScore),
        score: urlMatchScore,
        summary: this.urlMatchAccuracySummary(urlMatchScore, returnedUrls),
        issue_id: buyingPathIssue?.id || merchantIssue?.id || pivotaIssue?.id,
        evidence:
          this.reportIssueEvidence(buyingPathIssue) ||
          this.reportIssueEvidence(merchantIssue) ||
          this.reportIssueEvidence(pivotaIssue),
      },
      interpretation: evidence.discovery_interpretation,
    };
  }

  private discoveryScoreSummary(score: VisibilityScoreValue, label: string) {
    if (score === "not_configured") {
      return `${label} was not configured in this run.`;
    }
    if (score === "not_tested") {
      return `${label} was not tested in this run.`;
    }
    return `${label} score was ${score}%.`;
  }

  private searchGroundedMerchantSummary(score?: VisibilityScoreValue) {
    if (score === "not_configured") {
      return "Search-grounded discovery was not configured in this run.";
    }
    if (typeof score === "number" && score >= 80) {
      return "Search-grounded Gemini found the official merchant PDP when the product name was specified.";
    }
    if (typeof score === "number") {
      return "Search-grounded Gemini did not return the expected merchant PDP.";
    }
    return "Search-grounded discovery was not tested in this run.";
  }

  private searchGroundedPivotaSummary(
    report: ProductionValidationReport,
    merchantScore?: VisibilityScoreValue,
    pivotaScore?: VisibilityScoreValue
  ) {
    if (pivotaScore === "not_configured") {
      return "Search-grounded discovery was not configured in this run.";
    }
    if (typeof pivotaScore === "number" && pivotaScore >= 80) {
      return "Search-grounded Gemini found the Pivota agent-facing PDP when the product name was specified.";
    }
    if (typeof merchantScore === "number" && merchantScore >= 80) {
      return "The merchant-owned PDP is discoverable, but the Pivota agent-facing path is not yet discoverable. Pivota should improve public discoverability and source references for the Pivota PDP.";
    }
    if (typeof pivotaScore === "number") {
      if (pivotaScore === 0 && this.hasCompletedPivotaIndexingWork(report)) {
        return "Indexing work was recorded, but search-grounded Gemini has not yet returned the Pivota PDP. No discovery uplift is claimed yet.";
      }
      if (this.contextualPivotaAttributionStatus(report) === "passed") {
        return "Pivota PDP is ready when surfaced, but search-grounded Gemini has not yet returned the canonical Pivota PDP. No discovery uplift is claimed. Next step: complete indexing/public discoverability tasks and rerun search-grounded discovery.";
      }
      return "Search-grounded Gemini did not return the expected Pivota PDP.";
    }
    return "Search-grounded discovery was not tested in this run.";
  }

  private hasCompletedPivotaIndexingWork(report: ProductionValidationReport) {
    const productEntityId = report.target_summary.product_entity_id;
    if (!productEntityId) return false;
    return getAgentCenterState().pivotaIndexingTasks.some(
      (task) =>
        task.product_entity_id === productEntityId &&
        task.status === "completed" &&
        (task.evidence?.indexing_requested ||
          task.evidence?.sitemap_submitted ||
          task.evidence?.search_console_property_verified ||
          task.task_type === "request_indexing" ||
          task.task_type === "submit_sitemap")
    );
  }

  private buyingPathDiscoverySummary(score: VisibilityScoreValue) {
    if (score === "not_configured") {
      return "Buying-path discovery was not configured in this run.";
    }
    if (score === "not_tested") {
      return "Buying-path discovery was not tested in this run.";
    }
    if (score > 0) {
      return "Buying-path discovery returned a buying option or URL.";
    }
    return "Buying-path discovery did not return a buying option or URL.";
  }

  private urlMatchAccuracySummary(score: VisibilityScoreValue, returnedUrls: string[]) {
    if (score === "not_configured") {
      return "URL match accuracy was not configured in this run.";
    }
    if (score === "not_tested") {
      return "URL match accuracy was not tested in this run.";
    }
    if (score > 0) {
      return `URL match accuracy was ${score}% based on exact expected merchant/Pivota PDP URL matches.`;
    }
    const suffix = returnedUrls.length
      ? ` Returned URLs were captured, but none exactly matched the expected merchant or Pivota PDP.`
      : "";
    return `URL match accuracy was 0%; no expected merchant or Pivota PDP URL was returned.${suffix}`;
  }

  private searchGroundedEvidence(report: ProductionValidationReport) {
    const parsed = report.target_summary.scan_target_id
      ? this.parsedForMode(
          {
            ...({} as ProductionValidationRun),
            id: report.target_summary.production_validation_run_id,
            scan_target_id: report.target_summary.scan_target_id,
          },
          "search_grounded_product_discovery_test"
        )
      : [];
    const returnedUrls = unique(parsed.flatMap((item) => item.returned_urls));
    const returnedDomains = unique([
      ...parsed.flatMap((item) => item.returned_domains || []),
      ...returnedUrls.map(safeUrlHost).filter(Boolean),
    ]);
    const groundingSources = unique(
      parsed.flatMap((item) => item.grounding_sources || [])
    );
    return { parsed, returnedUrls, returnedDomains, groundingSources };
  }

  private discoverabilityFixPlan(
    report: ProductionValidationReport,
    discoveryResult: MerchantFacingValidationReport["discovery_result"]
  ): MerchantFacingValidationReport["discoverability_fix_plan"] {
    const { returnedUrls, returnedDomains, groundingSources } =
      this.searchGroundedEvidence(report);
    const issues = this.reportIssues(report);
    const issueTypes = unique(issues.map((issue) => issue.issue_type));
    const merchantAudit = auditMerchantPDPDiscoverability({
      merchant_pdp_url: report.target_summary.merchant_pdp_url,
      expected_merchant_pdp_url: report.target_summary.merchant_pdp_url,
      product_name: report.target_summary.product_name,
      brand: report.target_summary.brand,
      sku: report.target_summary.sku_name,
      category: report.target_summary.category,
      merchant_domain: safeUrlHost(report.target_summary.merchant_pdp_url),
      returned_urls: returnedUrls,
      returned_domains: returnedDomains,
      grounding_sources: groundingSources,
      issue_types: issueTypes,
      preflight_status: report.url_preflight_results.merchant_pdp.status,
      preflight_status_code: report.url_preflight_results.merchant_pdp.status_code,
    });
    const pivotaAudit = auditPivotaPDPDiscoverability({
      pivota_pdp_url: report.target_summary.pivota_pdp_url,
      expected_pivota_pdp_url:
        report.target_summary.canonical_pivota_pdp_url ||
        report.target_summary.pivota_pdp_url,
      product_name: report.target_summary.product_name,
      brand: report.target_summary.brand,
      sku: report.target_summary.sku_name,
      category: report.target_summary.category,
      merchant_domain: safeUrlHost(report.target_summary.merchant_pdp_url),
      returned_urls: returnedUrls,
      returned_domains: returnedDomains,
      grounding_sources: groundingSources,
      issue_types: issueTypes,
      preflight_status: report.url_preflight_results.pivota_pdp.status,
      preflight_status_code: report.url_preflight_results.pivota_pdp.status_code,
      signals: {
        canonical_url: report.target_summary.canonical_pivota_pdp_url,
      },
    });
    const wrongPathIssue = issues.find(
      (issue) => issue.issue_type === "wrong_buying_path_returned"
    );
    const merchantOwnedFixes = fixesForActionTypes(
      merchantAudit.recommended_action_types,
      merchantDiscoverabilityFixCopy
    );
    const pivotaActionTypes = unique([
      ...pivotaAudit.recommended_action_types,
      ...(issueTypes.includes("pivota_pdp_not_discovered")
        ? [
            "pivota_sitemap_submission",
            "pivota_search_console_indexing_request",
            "pivota_internal_link_patch",
            "pivota_search_console_url_inspection",
          ]
        : []),
    ]);
    const pivotaOwnedFixes = fixesForActionTypes(
      pivotaActionTypes,
      pivotaDiscoverabilityFixCopy
    );
    const sharedActionTypes = unique([
      ...(wrongPathIssue
        ? [
            "wrong_url_analysis",
            "canonical_buying_path_patch",
            "competitor_or_retailer_confusion_patch",
          ]
        : []),
      ...merchantAudit.findings
        .filter((finding) => finding.finding_type === "wrong_url_returned")
        .flatMap((finding) => finding.recommended_action_types),
      ...pivotaAudit.findings
        .filter((finding) => finding.finding_type === "wrong_url_returned")
        .flatMap((finding) => finding.recommended_action_types),
    ]);
    const sharedFixes = fixesForActionTypes(
      sharedActionTypes,
      sharedDiscoverabilityFixCopy
    );
    const merchantNotFound =
      discoveryResult.search_grounded_merchant_pdp_discovery.status === "not_found";
    const pivotaNotFound =
      discoveryResult.search_grounded_pivota_pdp_discovery.status === "not_found";
    const summaryParts = [
      merchantNotFound
        ? "Search-grounded Gemini did not return the official merchant PDP. Recommended fixes focus on making the official PDP easier for search-grounded AI to identify as the canonical buying page."
        : "",
      pivotaNotFound
        ? "Search-grounded Gemini did not return the Pivota PDP. Recommended fixes focus on making the Pivota agent-facing PDP indexable, source-backed, and clearly associated with the product and merchant offer."
        : "",
      wrongPathIssue
        ? "Search-grounded Gemini returned a different buying path than expected. Recommended fixes focus on clarifying canonical buying-path signals and reducing confusion with third-party or unrelated URLs."
        : "",
    ].filter(Boolean);

    return {
      summary:
        summaryParts.join(" ") ||
        "Discoverability fix plan checks merchant-owned and Pivota agent-facing PDP signals before retesting search-grounded discovery.",
      merchant_pdp_audit: merchantAudit,
      pivota_pdp_audit: pivotaAudit,
      returned_url_evidence_summary: returnedUrlEvidenceSummary(returnedUrls, returnedDomains),
      merchant_owned_fixes: merchantOwnedFixes,
      pivota_owned_fixes: pivotaOwnedFixes,
      shared_fixes: sharedFixes,
      retest_plan: [
        "Apply applicable merchant-owned and Pivota-owned discoverability fixes.",
        "Submit or verify the canonical Pivota PDP in sitemap and request indexing when Search Console access is available.",
        "Wait for an indexing window before interpreting search-grounded discovery deltas.",
        "Rerun Search-Grounded Product Discovery Test.",
        "Regenerate the GMV Assurance Snapshot and merchant-facing report draft.",
      ],
    };
  }

  private pivotaOwnedOptimizationApplied(
    run: ProductionValidationRun,
    report: ProductionValidationReport
  ): MerchantFacingValidationReport["pivota_owned_optimization_applied"] {
    const patches = run.issue_ids
      .flatMap((issueId) => pivotaOptimizationPatchesForIssue(issueId))
      .filter((patch) => patch.status === "applied");
    if (!patches.length) {
      return {
        status: "not_applied",
        summary:
          "No Pivota-owned optimization has been applied yet. This report is diagnostic.",
        actions_applied: [],
        before_state: {},
        after_state: {},
        score_deltas: [],
        blockers_cleared: [],
        blockers_remaining: report.top_blockers.map((blocker) => blocker.blocker_type),
      };
    }

    const latestRerun = latestByCreatedAt(
      patches
        .filter((patch) => patch.rerun_result)
        .map((patch) => ({
          id: patch.id,
          created_at: patch.updated_at || patch.applied_at || patch.created_at,
          result: patch.rerun_result!,
        }))
    )?.result;
    const scoreDeltas = this.optimizationScoreDeltas(latestRerun);
    const improved = scoreDeltas.some(
      (delta) => typeof delta.delta === "number" && delta.delta > 0
    );
    const remaining = report.top_blockers.map((blocker) => blocker.blocker_type);
    const cleared = unique(
      patches
        .flatMap((patch) => patch.source_issue_ids)
        .map((issueId) =>
          getAgentCenterState().issues.find((issue) => issue.id === issueId)
        )
        .filter((issue): issue is AgenticGMVIssue => Boolean(issue))
        .filter((issue) => issue.status === "resolved")
        .map((issue) => issue.issue_type)
    );

    return {
      status: latestRerun ? (improved ? "applied_with_uplift" : "applied_no_uplift") : "applied",
      summary: latestRerun
        ? improved
          ? "Pivota-owned optimization was applied and the comparable validation rerun improved. Report only the measured score deltas shown below."
          : "Pivota-owned PDP readiness was updated, but search-grounded discovery has not yet returned the Pivota PDP. This may require indexing time or additional public discoverability work."
        : "Pivota-owned optimization was applied. Rerun the relevant validation before claiming discovery uplift.",
      actions_applied: patches.map((patch) => ({
        patch_id: patch.id,
        patch_type: patch.patch_type,
        target_layer: patch.target_layer,
        applied_at: patch.applied_at,
        evidence: String(patch.evidence?.action_type || patch.patch_type),
      })),
      before_state: patches[0]?.before_state || {},
      after_state: patches[patches.length - 1]?.after_state || {},
      validation_rerun_result: latestRerun,
      score_deltas: scoreDeltas,
      blockers_cleared: cleared,
      blockers_remaining: remaining,
    };
  }

  private optimizationScoreDeltas(result?: Record<string, unknown>) {
    if (!result) return [];
    const before = (result.before_scores as Record<string, unknown> | undefined)
      ?.aggregate_scores as Record<string, VisibilityScoreValue> | undefined;
    const after = (result.after_scores as Record<string, unknown> | undefined)
      ?.aggregate_scores as Record<string, VisibilityScoreValue> | undefined;
    if (!before || !after) return [];
    const keys = [
      "search_grounded_pivota_pdp_discovery_score",
      "pivota_pdp_visibility_score",
      "organic_product_discovery_score",
      "competitor_dominance_score",
    ];
    return keys
      .filter((key) => before[key] !== undefined || after[key] !== undefined)
      .map((key) => ({
        score_name: key,
        before: before[key] ?? "not_tested",
        after: after[key] ?? "not_tested",
        delta:
          typeof before[key] === "number" && typeof after[key] === "number"
            ? (after[key] as number) - (before[key] as number)
            : undefined,
      }));
  }

  private readinessResult(input: {
    report: ProductionValidationReport;
    productSkuStatus: GMVAssuranceDimensionStatus;
    productDataStatus: GMVAssuranceDimensionStatus;
    skuVariantStatus: GMVAssuranceDimensionStatus;
    merchantAttribution: GMVAssuranceDimensionStatus;
    pivotaAttribution: GMVAssuranceDimensionStatus;
    offerStatus: GMVAssuranceDimensionStatus;
    checkoutStatus: GMVAssuranceDimensionStatus;
  }): MerchantFacingValidationReport["readiness_result"] {
    const demand = input.report.gmv_assurance_snapshot?.demand_test_summary;
    return {
      contextual_merchant_attribution: {
        status: input.merchantAttribution,
        score:
          input.merchantAttribution === "not_tested"
            ? "not_tested"
            : demand?.merchant_attribution_status.score,
        summary:
          input.merchantAttribution === "passed"
            ? "Merchant contextual attribution passed: the merchant-owned path was returned when product/PDP context was provided."
            : `Merchant contextual attribution is ${reportStatusLabel(input.merchantAttribution)}.`,
      },
      contextual_pivota_attribution: {
        status: input.pivotaAttribution,
        score:
          input.pivotaAttribution === "not_tested"
            ? "not_tested"
            : demand?.pivota_attribution_status.score,
        summary:
          input.pivotaAttribution === "passed"
            ? "Pivota contextual attribution passed: the Pivota agent-facing path was returned when Pivota context was provided."
            : `Pivota contextual attribution is ${reportStatusLabel(input.pivotaAttribution)}.`,
      },
      product_sku_readiness: {
        status: input.productSkuStatus,
        summary: this.productSkuSummary(input.productDataStatus, input.skuVariantStatus),
      },
      offer_readiness: {
        status: input.offerStatus,
        summary: this.offerSummary(input.report, input.offerStatus),
      },
      checkout_readiness: {
        status: input.checkoutStatus,
        summary: this.checkoutSummary(input.report, input.checkoutStatus),
      },
    };
  }

  private merchantPathSummary(
    report: ProductionValidationReport,
    attributionStatus: GMVAssuranceDimensionStatus
  ) {
    const preflight = report.url_preflight_results.merchant_pdp.status;
    if (preflight !== "passed") {
      return `Merchant-owned PDP preflight is ${reportPreflightLabel(preflight)}. Merchant attribution cannot be treated as ready until the source-layer PDP is reachable.`;
    }
    if (attributionStatus === "passed") {
      return "Merchant-owned PDP is reachable and merchant attribution passed in the relevant attribution test.";
    }
    return `Merchant-owned PDP is reachable, but merchant attribution is ${reportStatusLabel(attributionStatus)} in this validation.`;
  }

  private pivotaPathSummary(
    report: ProductionValidationReport,
    attributionStatus: GMVAssuranceDimensionStatus
  ) {
    const preflight = report.url_preflight_results.pivota_pdp.status;
    if (!report.target_summary.pivota_pdp_url || preflight === "not_provided") {
      return "Pivota PDP URL was not provided. Pivota agent-facing path attribution is not tested, not a merchant PDP failure.";
    }
    if (preflight !== "passed") {
      return `Pivota agent-facing PDP preflight is ${reportPreflightLabel(preflight)}. Pivota path attribution cannot be proven until the public PDP is reachable.`;
    }
    if (attributionStatus === "passed") {
      return "Pivota agent-facing PDP is reachable and Pivota attribution passed in the relevant attribution test. Pivota PDP represents a canonical product entity with merchant offers and source references; it does not replace the merchant-owned PDP.";
    }
    return `Pivota agent-facing PDP is reachable, but Pivota attribution is ${reportStatusLabel(attributionStatus)}. Pivota PDP represents a canonical product entity with merchant offers and source references; it provides an additional agent-facing execution layer on top of the merchant-owned source layer.`;
  }

  private productSkuSummary(
    productDataStatus: GMVAssuranceDimensionStatus,
    skuVariantStatus: GMVAssuranceDimensionStatus
  ) {
    if (productDataStatus === "passed" && skuVariantStatus === "passed") {
      return "Product data and SKU / variant readiness passed for the tested product.";
    }
    if (productDataStatus === "not_tested" && skuVariantStatus === "not_tested") {
      return "Product Understanding and SKU / variant readiness were not tested in this run.";
    }
    return `Product data readiness is ${reportStatusLabel(productDataStatus)} and SKU / variant readiness is ${reportStatusLabel(skuVariantStatus)}.`;
  }

  private offerSummary(
    report: ProductionValidationReport,
    status: GMVAssuranceDimensionStatus
  ) {
    if (!report.offer_execution_summary.diagnosis_ids.length) {
      return "Offer readiness was not tested because offer metadata was not provided.";
    }
    if (status === "passed") return "Offer readiness passed for the tested offer metadata.";
    return `Offer readiness is ${reportStatusLabel(status)} with findings: ${report.offer_execution_summary.findings.map(titleCase).join(", ") || "none"}.`;
  }

  private checkoutSummary(
    report: ProductionValidationReport,
    status: GMVAssuranceDimensionStatus
  ) {
    if (!report.checkout_verification_summary.diagnosis_ids.length) {
      return "Checkout readiness was not tested because checkout path metadata was not provided. V1 does not execute payment or place orders.";
    }
    if (status === "passed") {
      return "Checkout path readiness passed through pre-payment URL and parameter validation.";
    }
    return `Checkout readiness is ${reportStatusLabel(status)} with findings: ${report.checkout_verification_summary.findings.map(titleCase).join(", ") || "none"}.`;
  }

  private blockers(report: ProductionValidationReport) {
    return report.top_blockers.filter((blocker) =>
      this.blockerMatchesReportScope(report, blocker.blocker_type)
    ).map((blocker) => {
      const plan = blocker.issue_id ? latestIssueResolutionPlan(blocker.issue_id) : null;
      const issue = blocker.issue_id
        ? getAgentCenterState().issues.find((item) => item.id === blocker.issue_id)
        : null;
      return {
        blocker_type: blocker.blocker_type,
        severity: blocker.severity,
        affected_layer: blocker.affected_layer,
        issue_id: blocker.issue_id,
        resolution_plan_id: plan?.id || blocker.resolution_plan_id,
        root_cause: plan?.root_cause_hypothesis || issue?.root_cause,
        recommended_action:
          nextResolutionAction(plan)?.title || blocker.recommended_action,
      };
    });
  }

  private blockerMatchesReportScope(
    report: ProductionValidationReport,
    blockerType: string
  ) {
    if (
      blockerType === "merchant_store_attribution_gap" ||
      blockerType === "merchant_attribution_gap"
    ) {
      return this.modeRan(report, "merchant_store_attribution_test");
    }
    if (
      blockerType === "pivota_attribution_gap" ||
      blockerType === "pivota_pdp_attribution_gap" ||
      blockerType === "pivota_offer_attribution_gap" ||
      blockerType === "unverified_pivota_attribution"
    ) {
      return this.modeRan(report, "pivota_pdp_attribution_test");
    }
    if (
      blockerType === "low_product_visibility" ||
      blockerType === "ai_visibility_loss"
    ) {
      return (
        this.modeRan(report, "open_product_visibility_test") ||
        this.modeRan(report, "organic_product_discovery_test")
      );
    }
    if (
      blockerType === "buying_path_missing" ||
      blockerType === "offer_not_discovered"
    ) {
      return this.modeRan(report, "buying_path_discovery_test");
    }
    return true;
  }

  private recommendedFixes(
    blockers: MerchantFacingValidationReport["blockers"]
  ): MerchantFacingValidationReport["recommended_fixes"] {
    const fixes: MerchantFacingValidationReport["recommended_fixes"] = [];
    for (const blocker of blockers) {
      const plan = blocker.issue_id ? latestIssueResolutionPlan(blocker.issue_id) : null;
      if (!plan) {
        fixes.push({
          title: blocker.recommended_action,
          approval_required: false,
          target_layer: blocker.affected_layer,
        });
        continue;
      }
      for (const action of plan.recommended_actions) {
        fixes.push({
          title: action.title,
          owner_type: action.owner_type || plan.owner_type,
          owner_team: action.owner_team || plan.owner_team,
          approval_required: action.requires_merchant_approval,
          target_layer: String(action.target_layer || blocker.affected_layer),
          action_status: action.status,
          expected_impact: action.expected_impact,
        });
      }
    }
    return fixes.length
      ? fixes
      : [
          {
            title: "Monitor only",
            approval_required: false,
            target_layer: "monitoring",
          },
        ];
  }

  private recommendedFixSections(
    blockers: MerchantFacingValidationReport["blockers"],
    fixes: MerchantFacingValidationReport["recommended_fixes"]
  ): MerchantFacingValidationReport["recommended_fix_sections"] {
    const blockerTypes = new Set(blockers.map((blocker) => blocker.blocker_type));
    if (
      blockerTypes.has("organic_product_not_discovered") ||
      blockerTypes.has("competitor_dominance")
    ) {
      return {
        merchant_owned_fixes: [
          "Strengthen PDP title with full searchable product name.",
          "Add category/use-case language, e.g. tone brightening cleansing gel foam, centella cleanser, daily brightening cleanser.",
          "Add or verify Product structured data.",
          "Add or verify Offer structured data where applicable.",
          "Ensure canonical PDP URL is clear.",
          "Make price, availability, brand, seller identity, and product description machine-readable.",
          "Add stronger ingredient/claim/review evidence if available.",
        ],
        pivota_owned_fixes: [
          "Strengthen Pivota PDP identity.",
          "Generate stronger product overview from merchant description.",
          "Populate product intelligence module.",
          "Add organic query-cluster mappings.",
          "Add competitor/substitute graph relationships.",
          "Add merchant PDP as verified source reference.",
          "Rerun Organic Product Discovery Test.",
        ],
        shared_fixes: [
          "Identify which competitors dominated which queries.",
          "Add product differentiation evidence.",
          "Clarify use cases where the product should win.",
          "Add comparison/substitute graph relationships.",
          "Update query-cluster mapping.",
          "Rerun Organic Product Discovery Test.",
        ],
      };
    }

    return {
      merchant_owned_fixes: fixes
        .filter((fix) => /merchant/i.test(fix.target_layer))
        .map((fix) => fix.title),
      pivota_owned_fixes: fixes
        .filter((fix) => /pivota/i.test(fix.target_layer))
        .map((fix) => fix.title),
      shared_fixes: fixes
        .filter((fix) => !/merchant|pivota/i.test(fix.target_layer))
        .map((fix) => fix.title),
    };
  }

  private retestPlan(
    report: ProductionValidationReport,
    blockers: MerchantFacingValidationReport["blockers"]
  ) {
    const planSteps = blockers.map((blocker) => {
      const plan = blocker.issue_id ? latestIssueResolutionPlan(blocker.issue_id) : null;
      if (plan?.verification_plan?.scan_mode) {
        return `After approved fixes, rerun ${plan.verification_plan.scan_mode} for ${titleCase(blocker.blocker_type)}.`;
      }
      if (plan?.verification_plan?.workflow_type) {
        return `After approved fixes, rerun ${String(plan.verification_plan.workflow_type).replace(/_/g, " ")} for ${titleCase(blocker.blocker_type)}.`;
      }
      return `After approved fixes, rerun the relevant Agent Center validation for ${titleCase(blocker.blocker_type)}.`;
    });
    if (planSteps.length) return unique(planSteps);
    return [
      report.next_best_action && report.next_best_action !== "Monitor only."
        ? report.next_best_action
        : "No blocker retest is required; continue monitoring the product.",
    ];
  }

  private safetyWarnings(
    run: ProductionValidationRun,
    report: ProductionValidationReport
  ): MerchantFacingValidationReport["safety_warnings"] {
    const snapshot = report.gmv_assurance_snapshot;
    const discovery = snapshot?.discovery_readiness_summary;
    const warnings: MerchantFacingValidationReport["safety_warnings"] = [];

    if (
      discovery?.merchant_pdp_discovery_status.status === "not_configured" ||
      discovery?.pivota_pdp_discovery_status.status === "not_configured" ||
      report.top_blockers.some(
        (blocker) => blocker.blocker_type === "search_grounding_not_configured"
      )
    ) {
      warnings.push({
        warning_type: "search_grounded_not_configured",
        severity: "warning",
        message:
          "Search-grounded discovery was not configured for at least one discovery dimension.",
      });
    }

    if (!run.checkout_diagnosis_ids.length) {
      warnings.push({
        warning_type: "checkout_not_tested",
        severity: "warning",
        message:
          "Checkout readiness was not tested because checkout path metadata was not provided.",
      });
    }

    if (!report.target_summary.pivota_pdp_url) {
      warnings.push({
        warning_type: "pivota_pdp_not_provided",
        severity: "warning",
        message:
          "Pivota PDP URL was not provided, so Pivota path attribution should be treated as not tested.",
      });
    }

    if (!run.offer_diagnosis_ids.length) {
      warnings.push({
        warning_type: "offer_metadata_not_provided",
        severity: "warning",
        message:
          "Offer readiness was not tested because merchant and Pivota offer metadata was not provided.",
      });
    }

    if (!run.merchant_offer_input?.merchant_approval_scope) {
      warnings.push({
        warning_type: "merchant_approval_scope_missing",
        severity: "info",
        message:
          "Merchant approval scope was not provided; any recommended changes should be reviewed before sharing.",
      });
    }

    warnings.push({
      warning_type: "raw_debug_payload_excluded",
      severity: "info",
      message:
        "Provider response details and internal diagnostics are excluded from this merchant-facing draft.",
    });

    return warnings;
  }
}

function demoFixtureMetadata(input: {
  fixtureId: string;
  createdAt: string;
  expiresAt: string;
  ttlMinutes: number;
  environment: string;
}): Required<DemoFixtureMetadata> {
  return {
    demo_fixture: true,
    fixture_id: input.fixtureId,
    created_by: "internal",
    created_at: input.createdAt,
    expires_at: input.expiresAt,
    ttl_minutes: input.ttlMinutes,
    environment: input.environment,
    cleanup_status: "active",
  };
}

function expiresAtFromTtl(createdAt: string, ttlMinutes: number) {
  return new Date(new Date(createdAt).getTime() + ttlMinutes * 60_000).toISOString();
}

function currentFixtureEnvironment(input?: string) {
  return input || process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

function fixtureRecord(
  fixtureType: DemoFixtureType,
  recordId: string,
  parentRecordId?: string
): DemoFixture["records"][number] {
  return {
    fixture_type: fixtureType,
    record_id: recordId,
    ...(parentRecordId ? { parent_record_id: parentRecordId } : {}),
  };
}

function isCheckoutFixturePreset(preset: DemoFixturePreset) {
  return [
    "clean_checkout_path",
    "missing_checkout_path",
    "checkout_url_unreachable",
    "missing_variant_param",
    "missing_coupon_param",
    "stale_checkout_session",
    "checkout_domain_mismatch",
    "checkout_not_attached_to_offer",
  ].includes(preset);
}

function isAssuranceChainFixturePreset(preset: DemoFixturePreset) {
  return ["full_ready_pre_payment_chain", "offer_price_blocker_chain"].includes(
    preset
  );
}

function hasFixtureId(record: unknown, fixtureId: string) {
  return Boolean(
    record &&
      typeof record === "object" &&
      "fixture_id" in record &&
      (record as { fixture_id?: string }).fixture_id === fixtureId
  );
}

function offerSmokeFixtureProduct(
  metadata: Required<DemoFixtureMetadata>
): ProductRecord {
  return {
    ...metadata,
    id: nextId("fixture_product"),
    product_entity_id: `pe_${metadata.fixture_id}_watery_sun_gel`,
    sku: `SKU-${metadata.fixture_id.toUpperCase()}-50ML`,
    title: "Internal Demo Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml",
    brand: "Internal Demo Skincare",
    category: "skincare sunscreen",
    price: 18.99,
    currency: "USD",
    pdp_url: `https://internal-demo.pivota.cc/products/${metadata.fixture_id}-watery-sun-gel`,
    attributes: {
      spf_level: "SPF50+",
      pa_rating: "PA++++",
      skin_type: "normal and combination",
      finish: "lightweight watery gel",
      active_ingredients: "UV filters plus hyaluronic acid",
    },
    pivota_attributes: {
      spf_level: "SPF50+",
      pa_rating: "PA++++",
      skin_type: "normal and combination",
      finish: "lightweight watery gel",
      active_ingredients: "UV filters plus hyaluronic acid",
      pivota_pdp_url: `https://agent.pivota.cc/products/${metadata.fixture_id}`,
      pivota_product_object_id: metadata.fixture_id,
      offer_ids: [`pivota_offer_${metadata.fixture_id}`],
    },
    agent_summary:
      "Internal demo sunscreen fixture for production smoke testing offer readiness.",
    priority: "high",
  };
}

function offerIssueForFixture(input: {
  metadata: Required<DemoFixtureMetadata>;
  store: MerchantStore;
  target: ScanTarget;
  cluster: QueryCluster;
  product: ProductRecord;
  preset: DemoFixturePreset;
}) {
  const { metadata, store, target, cluster, product, preset } = input;
  const isCheckoutFixture = isCheckoutFixturePreset(preset);
  const isClean = preset === "clean_offer" || preset === "clean_checkout_path";
  const now = metadata.created_at;
  const issue: AgenticGMVIssue = {
    ...metadata,
    id: nextId("issue"),
    merchant_id: store.merchant_id,
    store_id: store.id,
    scan_target_id: target.id,
    store_url: store.store_url,
    platform: store.platform,
    source_agent: "demand_test_agent",
    issue_type: isCheckoutFixture
      ? "checkout_verification_issue"
      : "offer_execution_issue",
    severity: isClean ? "low" : "medium",
    status: "recommendation_ready",
    affected_product_entities: [product.product_entity_id],
    affected_skus: [product.sku],
    affected_query_clusters: [cluster.id],
    evidence: {
      demo_fixture: true,
      fixture_id: metadata.fixture_id,
      preset,
      query_cluster: cluster.cluster_name,
      query_cluster_id: cluster.id,
      product_entity_id: product.product_entity_id,
      sku: product.sku,
    },
    root_cause: isClean
      ? `Internal clean ${isCheckoutFixture ? "checkout" : "offer"} fixture for Agent Center smoke validation.`
      : `Internal ${isCheckoutFixture ? "checkout" : "offer"} mismatch fixture for Agent Center smoke validation.`,
    fix_targets: isCheckoutFixture ? ["pivota_checkout_layer"] : ["pivota_offer_layer"],
    recommended_action:
      isCheckoutFixture
        ? "Run Checkout Verification diagnosis and verify the generated patch recommendation."
        : "Run Offer Execution diagnosis and verify the generated patch recommendation.",
    merchant_source_patch: {},
    pivota_unified_pdp_patch: {},
    estimated_gmv_at_risk: cluster.estimated_demand_value,
    gmv_estimation_method:
      "Internal demo fixture estimate for smoke testing only; not transaction attribution.",
    estimated_gmv_at_risk_confidence: "low",
    merchant_facing_summary:
      "Internal demo fixture issue for Offer Execution production smoke testing.",
    merchant_facing_narrative: {
      what_happened:
        "Internal demo fixture was created to validate offer readiness diagnostics.",
      what_ai_recommended_instead:
        "No consumer-facing recommendation evidence is part of this fixture.",
      why_this_likely_happened:
        isCheckoutFixture
          ? "The fixture intentionally controls merchant checkout source and Pivota checkout path state."
          : "The fixture intentionally controls merchant offer and Pivota offer state.",
      where_to_fix: "Internal fixture only.",
      recommended_merchant_pdp_changes: [
        "No merchant PDP change is required for this fixture.",
      ],
      recommended_pivota_pdp_changes: [
        `Review ${isCheckoutFixture ? "Checkout Verification" : "Offer Execution"} patch recommendations generated by the agent.`,
      ],
      how_pivota_will_verify_the_fix:
        `Pivota will rerun the same internal ${isCheckoutFixture ? "checkout" : "offer"} diagnosis after fixture changes.`,
    },
    approval_required: false,
    verification_plan: {
      retest_query_clusters: [cluster.id],
      providers: ["gemini"],
      prompt_templates: activePromptTemplateIds(),
      success_metric: "visibility_rate",
      target_improvement:
        `verify ${isCheckoutFixture ? "Checkout Verification" : "Offer Execution"} fixture diagnosis and patch recommendation`,
    },
    created_at: now,
    updated_at: now,
  };
  return issue;
}

function assuranceFixtureScore(input: {
  metadata: Required<DemoFixtureMetadata>;
  target: ScanTarget;
  cluster: QueryCluster;
  product: ProductRecord;
}) {
  const aggregate: DemandVisibilityScore["aggregate_scores"] = {
    product_entity_visibility_score: 100,
    merchant_store_visibility_score: 100,
    pivota_pdp_visibility_score: 100,
    pivota_offer_visibility_score: 100,
    pivota_attribution_echo_rate: 0,
    executable_offer_visibility_score: "not_tested",
    organic_product_discovery_score: "not_tested",
    organic_brand_discovery_score: "not_tested",
    competitor_dominance_score: "not_tested",
    search_grounded_merchant_pdp_discovery_score: "not_tested",
    search_grounded_pivota_pdp_discovery_score: "not_tested",
    buying_path_discovery_score: "not_tested",
    offer_discovery_score: "not_tested",
    url_match_accuracy_score: "not_tested",
    visibility_score: 100,
    recommendation_rank_score: 100,
    competitor_substitution_score: 0,
    attribute_readiness_score: 100,
    pivota_pdp_readiness_score: 100,
  };
  const explanation = (
    key: keyof DemandVisibilityScore["aggregate_scores"]
  ) => ({
    score: aggregate[key],
    formula:
      key === "executable_offer_visibility_score"
        ? "not_tested in V1 assurance fixture"
        : "controlled internal fixture score",
    explanation:
      key === "executable_offer_visibility_score"
        ? "Offer execution and checkout readiness are verified by deterministic downstream agents, not Demand Test executable-offer scoring."
        : "Controlled internal fixture marks this dimension as passing for the full pre-payment chain.",
    supporting_runs: [],
  });
  const score: DemandVisibilityScore = {
    ...input.metadata,
    id: nextId("score"),
    merchant_id: input.target.merchant_id,
    store_id: input.target.store_id,
    scan_target_id: input.target.id,
    query_cluster_id: input.cluster.id,
    product_entity_id: input.product.product_entity_id,
    provider_scores: {
      internal: {
        ...aggregate,
        executable_offer_visibility_score: "not_tested",
      },
    },
    aggregate_scores: aggregate,
    score_explanations: {
      product_entity_visibility_score: explanation("product_entity_visibility_score"),
      merchant_store_visibility_score: explanation("merchant_store_visibility_score"),
      pivota_pdp_visibility_score: explanation("pivota_pdp_visibility_score"),
      pivota_offer_visibility_score: explanation("pivota_offer_visibility_score"),
      pivota_attribution_echo_rate: explanation("pivota_attribution_echo_rate"),
      executable_offer_visibility_score: explanation(
        "executable_offer_visibility_score"
      ),
      organic_product_discovery_score: explanation("organic_product_discovery_score"),
      organic_brand_discovery_score: explanation("organic_brand_discovery_score"),
      competitor_dominance_score: explanation("competitor_dominance_score"),
      search_grounded_merchant_pdp_discovery_score: explanation(
        "search_grounded_merchant_pdp_discovery_score"
      ),
      search_grounded_pivota_pdp_discovery_score: explanation(
        "search_grounded_pivota_pdp_discovery_score"
      ),
      buying_path_discovery_score: explanation("buying_path_discovery_score"),
      offer_discovery_score: explanation("offer_discovery_score"),
      url_match_accuracy_score: explanation("url_match_accuracy_score"),
      visibility_score: explanation("visibility_score"),
      recommendation_rank_score: explanation("recommendation_rank_score"),
      competitor_substitution_score: explanation("competitor_substitution_score"),
      attribute_readiness_score: explanation("attribute_readiness_score"),
      pivota_pdp_readiness_score: explanation("pivota_pdp_readiness_score"),
    },
    created_at: input.metadata.created_at,
    updated_at: input.metadata.created_at,
  };
  getAgentCenterState().scores.push(score);
  return score;
}

export class DemoFixtureService {
  create(input?: {
    preset?: DemoFixturePreset;
    ttl_minutes?: number;
    environment?: string;
  }) {
    this.cleanupExpiredDemoFixtures();
    const state = getAgentCenterState();
    const preset = input?.preset || "clean_offer";
    const ttlMinutes = input?.ttl_minutes || 60;
    const createdAt = nowIso();
    const fixtureId = nextId("fixture");
    const environment = currentFixtureEnvironment(input?.environment);
    const expiresAt = expiresAtFromTtl(createdAt, ttlMinutes);
    const metadata = demoFixtureMetadata({
      fixtureId,
      createdAt,
      expiresAt,
      ttlMinutes,
      environment,
    });
    const assuranceChainPreset = isAssuranceChainFixturePreset(preset);
    const checkoutPreset = isCheckoutFixturePreset(preset) || assuranceChainPreset;
    const product = offerSmokeFixtureProduct(metadata);

    const store = new MerchantStoreService().create(
      {
        ...metadata,
        store_name: `Internal Offer Fixture ${preset}`,
        store_url: `https://internal-demo.pivota.cc/${fixtureId}`,
        platform: "shopify",
        integration_status: "connected",
        primary_category: "skincare sunscreen",
        competitor_brands: SUNSCREEN_COMPETITOR_BRANDS,
        competitor_products: SUNSCREEN_COMPETITOR_PRODUCTS,
        products: [product],
      },
      DEMO_MERCHANT_ID
    );
    Object.assign(store, metadata);
    const connection = state.connections.find((item) => item.store_id === store.id);
    if (connection) {
      Object.assign(connection, metadata, {
        status: "connected",
        last_catalog_sync_at: createdAt,
        last_offer_sync_at: createdAt,
        capabilities: {
          ...connection.capabilities,
          catalog: true,
          pdp_urls: true,
          sku_variant_map: true,
          structured_attributes: true,
          offers: true,
          checkout: checkoutPreset,
          orders: false,
        },
      });
      touch(connection);
    }

    const target = new ScanTargetService().create({
      merchant_id: DEMO_MERCHANT_ID,
      store_id: store.id,
      selected_product_ids: [product.id],
      scan_mode: assuranceChainPreset
        ? "agentic_execution_test"
        : "pivota_pdp_attribution_test",
    });
    Object.assign(target, metadata);

    const clusters = new QueryClusterService().generateForScanTarget(target.id, [
      product.id,
    ]);
    for (const cluster of clusters) {
      Object.assign(cluster, metadata);
      touch(cluster);
    }
    const cluster =
      clusters.find((item) => item.intent_type === "category_recommendation") ||
      clusters[0];
    if (!cluster) throw new Error("Demo fixture query cluster could not be created");

    const merchantOffer: MerchantOffer = {
      ...metadata,
      id: nextId("merchant_offer"),
      merchant_id: store.merchant_id,
      store_id: store.id,
      product_id: product.id,
      sku_id: product.sku,
      price: 18.99,
      currency: "USD",
      promo_price:
        preset === "expired_coupon" || preset === "missing_coupon_param" ? 16.99 : null,
      coupon_code:
        preset === "expired_coupon" || preset === "missing_coupon_param"
          ? "SUN10"
          : null,
      coupon_status:
        preset === "expired_coupon"
          ? "expired"
          : preset === "missing_coupon_param"
            ? "active"
            : "none",
      inventory_status: preset === "inventory_mismatch" ? "out_of_stock" : "in_stock",
      inventory_quantity: preset === "inventory_mismatch" ? 0 : 24,
      expires_at:
        preset === "expired_coupon"
          ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          : null,
      source_url: product.pdp_url,
      last_synced_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    };
    state.merchantOffers.push(merchantOffer);

    let pivotaOffer: PivotaOffer | null = null;
    if (preset !== "missing_pivota_offer") {
      pivotaOffer = {
        ...metadata,
        id: `pivota_offer_${fixtureId}`,
        product_entity_id: product.product_entity_id,
        pivota_unified_pdp_id: `pdp_${product.product_entity_id}`,
        merchant_id: store.merchant_id,
        store_id: store.id,
        sku_id: product.sku,
        price:
          preset === "price_mismatch" || preset === "offer_price_blocker_chain"
            ? 21.99
            : 18.99,
        currency: "USD",
        promo_price: preset === "expired_coupon" ? 16.99 : null,
        coupon_code: preset === "expired_coupon" ? "SUN10" : null,
        coupon_status: preset === "expired_coupon" ? "active" : "none",
        inventory_status:
          preset === "inventory_mismatch" ? "in_stock" : merchantOffer.inventory_status,
        execution_status:
          preset === "clean_offer" || preset === "full_ready_pre_payment_chain"
            ? "ready"
            : "needs_sync",
        attached_to_pivota_pdp: true,
        last_verified_at: createdAt,
        created_at: createdAt,
        updated_at: createdAt,
      };
      state.pivotaOffers.push(pivotaOffer);
    }

    let merchantCheckoutPath: MerchantCheckoutPath | null = null;
    let pivotaCheckoutPath: PivotaCheckoutPath | null = null;
    if (checkoutPreset && preset !== "missing_checkout_path" && pivotaOffer) {
      const couponExpected = preset === "missing_coupon_param";
      const checkoutDomain = "checkout.internal-demo.pivota.cc";
      const requiredParams = couponExpected
        ? ["variant", "quantity", "discount"]
        : ["variant", "quantity"];
      merchantCheckoutPath = {
        ...metadata,
        id: nextId("merchant_checkout"),
        merchant_id: store.merchant_id,
        store_id: store.id,
        merchant_offer_id: merchantOffer.id,
        sku_id: product.sku,
        checkout_url: `https://${checkoutDomain}/${fixtureId}/checkout`,
        cart_url: `https://${checkoutDomain}/${fixtureId}/cart`,
        checkout_domain: checkoutDomain,
        required_params: requiredParams,
        supported_params: requiredParams,
        coupon_param_name: couponExpected ? "discount" : null,
        quantity_param_name: "quantity",
        variant_param_name: "variant",
        expires_at:
          preset === "stale_checkout_session"
            ? new Date(Date.now() - 60 * 60 * 1000).toISOString()
            : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        last_verified_at: createdAt,
        source: "internal_demo_fixture",
        created_at: createdAt,
        updated_at: createdAt,
      };
      state.merchantCheckoutPaths.push(merchantCheckoutPath);

      const payload: Record<string, unknown> = {
        variant: product.sku,
        quantity: 1,
      };
      if (couponExpected) payload.discount = merchantOffer.coupon_code;
      if (preset === "missing_variant_param") delete payload.variant;
      if (preset === "missing_coupon_param") delete payload.discount;

      pivotaCheckoutPath = {
        ...metadata,
        id: `pivota_checkout_${fixtureId}`,
        pivota_offer_id: pivotaOffer.id,
        product_entity_id: product.product_entity_id,
        merchant_id: store.merchant_id,
        store_id: store.id,
        sku_id: product.sku,
        checkout_url:
          preset === "checkout_url_unreachable"
            ? `https://${checkoutDomain}/unreachable/${fixtureId}/checkout`
            : preset === "checkout_domain_mismatch"
              ? `https://checkout.other-demo.test/${fixtureId}/checkout`
              : `https://${checkoutDomain}/${fixtureId}/checkout`,
        cart_handoff_payload: payload,
        checkout_domain:
          preset === "checkout_domain_mismatch"
            ? "checkout.other-demo.test"
            : checkoutDomain,
        required_params: requiredParams,
        coupon_code: couponExpected ? null : merchantOffer.coupon_code,
        quantity: 1,
        variant_id: preset === "missing_variant_param" ? null : product.sku,
        execution_status:
          preset === "clean_checkout_path" ||
          preset === "full_ready_pre_payment_chain" ||
          preset === "offer_price_blocker_chain"
            ? "ready"
            : "needs_sync",
        attached_to_pivota_offer: preset !== "checkout_not_attached_to_offer",
        last_verified_at: createdAt,
        created_at: createdAt,
        updated_at: createdAt,
      };
      state.pivotaCheckoutPaths.push(pivotaCheckoutPath);
    }

    const issue = offerIssueForFixture({
      metadata,
      store,
      target,
      cluster,
      product,
      preset,
    });
    state.issues.push(issue);

    const assuranceScore = assuranceChainPreset
      ? assuranceFixtureScore({ metadata, target, cluster, product })
      : null;
    const productDiagnosis = assuranceChainPreset
      ? new ProductUnderstandingService().runDiagnosis(issue.id)
      : null;
    const offerDiagnosis = assuranceChainPreset
      ? new OfferExecutionService().runDiagnosis(issue.id)
      : null;
    const checkoutDiagnosis = assuranceChainPreset
      ? new CheckoutVerificationService().runDiagnosis(issue.id)
      : null;
    const assuranceSnapshot = assuranceChainPreset
      ? new GMVAssuranceService().createSnapshot({
          merchant_id: store.merchant_id,
          store_id: store.id,
          scan_target_id: target.id,
          product_entity_id: product.product_entity_id,
          assurance_scope: "readiness_only",
        })
      : null;

    const records: DemoFixture["records"] = [
      fixtureRecord("merchant_store", store.id),
      fixtureRecord("scan_target", target.id, store.id),
      fixtureRecord("product_entity", product.product_entity_id, product.id),
      fixtureRecord("pivota_unified_pdp", `pdp_${product.product_entity_id}`, product.id),
      fixtureRecord("merchant_product", product.id, store.id),
      fixtureRecord("merchant_sku", product.sku, product.id),
      fixtureRecord("merchant_offer", merchantOffer.id, product.id),
      fixtureRecord("agentic_gmv_issue", issue.id, target.id),
    ];
    if (pivotaOffer) {
      records.push(fixtureRecord("pivota_offer", pivotaOffer.id, product.id));
    }
    if (merchantCheckoutPath) {
      records.push(
        fixtureRecord("merchant_checkout_path", merchantCheckoutPath.id, merchantOffer.id)
      );
    }
    if (pivotaCheckoutPath) {
      records.push(
        fixtureRecord("pivota_checkout_path", pivotaCheckoutPath.id, pivotaOffer?.id)
      );
    }

    const fixture: DemoFixture = {
      id: fixtureId,
      fixture_id: fixtureId,
      preset,
      demo_fixture: true,
      created_by: "internal",
      expires_at: expiresAt,
      ttl_minutes: ttlMinutes,
      environment,
      cleanup_status: "active",
      records,
      created_at: createdAt,
      updated_at: createdAt,
    };
    getAgentCenterRepository().upsert("demoFixtures", fixture);

    return {
      fixture,
      store,
      scan_target: target,
      query_cluster: cluster,
      product,
      merchant_offer: merchantOffer,
      pivota_offer: pivotaOffer,
      merchant_checkout_path: merchantCheckoutPath,
      pivota_checkout_path: pivotaCheckoutPath,
      demand_visibility_score: assuranceScore,
      product_understanding_diagnosis: productDiagnosis,
      offer_execution_diagnosis: offerDiagnosis,
      checkout_verification_diagnosis: checkoutDiagnosis,
      gmv_assurance_snapshot: assuranceSnapshot,
      issue,
    };
  }

  get(fixtureId: string) {
    this.cleanupExpiredDemoFixtures();
    const fixture = getAgentCenterRepository().getById("demoFixtures", fixtureId);
    if (!fixture) throw new Error(`Demo fixture not found: ${fixtureId}`);
    return {
      fixture,
      records: this.recordsForFixture(fixtureId),
    };
  }

  delete(fixtureId: string) {
    return this.cleanupFixture(fixtureId, "deleted");
  }

  cleanupExpiredDemoFixtures(now = nowIso()) {
    const expired = getAgentCenterState().demoFixtures.filter(
      (fixture) =>
        fixture.cleanup_status === "active" &&
        new Date(fixture.expires_at).getTime() <= new Date(now).getTime()
    );
    return expired.map((fixture) => this.cleanupFixture(fixture.fixture_id, "expired"));
  }

  private recordsForFixture(fixtureId: string) {
    const state = getAgentCenterState();
    return {
      stores: state.stores.filter((item) => hasFixtureId(item, fixtureId)),
      connections: state.connections.filter((item) => hasFixtureId(item, fixtureId)),
      scan_targets: state.scanTargets.filter((item) => hasFixtureId(item, fixtureId)),
      query_clusters: state.queryClusters.filter((item) => hasFixtureId(item, fixtureId)),
      merchant_offers: state.merchantOffers.filter((item) =>
        hasFixtureId(item, fixtureId)
      ),
      pivota_offers: state.pivotaOffers.filter((item) => hasFixtureId(item, fixtureId)),
      merchant_checkout_paths: state.merchantCheckoutPaths.filter((item) =>
        hasFixtureId(item, fixtureId)
      ),
      pivota_checkout_paths: state.pivotaCheckoutPaths.filter((item) =>
        hasFixtureId(item, fixtureId)
      ),
      issues: state.issues.filter((item) => hasFixtureId(item, fixtureId)),
      offer_diagnoses: state.offerExecutionDiagnoses.filter((item) =>
        this.fixtureIssueIds(fixtureId).includes(item.issue_id)
      ),
      checkout_diagnoses: state.checkoutVerificationDiagnoses.filter((item) =>
        this.fixtureIssueIds(fixtureId).includes(item.issue_id)
      ),
      gmv_assurance_snapshots: state.gmvAssuranceSnapshots.filter(
        (item) =>
          item.issue_ids.some((issueId) => this.fixtureIssueIds(fixtureId).includes(issueId)) ||
          state.scanTargets
            .filter((target) => hasFixtureId(target, fixtureId))
            .some((target) => target.id === item.scan_target_id)
      ),
      usage_events: state.usageEvents.filter((item) =>
        this.fixtureUsageEvent(item, fixtureId)
      ),
    };
  }

  private fixtureIssueIds(fixtureId: string) {
    return getAgentCenterState()
      .issues.filter((item) => hasFixtureId(item, fixtureId))
      .map((item) => item.id);
  }

  private fixtureUsageEvent(event: UsageEvent, fixtureId: string) {
    const state = getAgentCenterState();
    const targetIds = state.scanTargets
      .filter((item) => hasFixtureId(item, fixtureId))
      .map((item) => item.id);
    const clusterIds = state.queryClusters
      .filter((item) => hasFixtureId(item, fixtureId))
      .map((item) => item.id);
    const issueIds = this.fixtureIssueIds(fixtureId);
    return (
      targetIds.includes(event.scan_target_id) ||
      clusterIds.includes(event.query_cluster_id) ||
      issueIds.some((issueId) => event.idempotency_key.includes(issueId))
    );
  }

  private cleanupFixture(
    fixtureId: string,
    cleanupStatus: "deleted" | "expired"
  ) {
    const state = getAgentCenterState();
    const fixture = getAgentCenterRepository().getById("demoFixtures", fixtureId);
    if (!fixture) throw new Error(`Demo fixture not found: ${fixtureId}`);

    const targetIds = state.scanTargets
      .filter((item) => hasFixtureId(item, fixtureId))
      .map((item) => item.id);
    const clusterIds = state.queryClusters
      .filter((item) => hasFixtureId(item, fixtureId))
      .map((item) => item.id);
    const jobIds = state.jobs
      .filter((item) => targetIds.includes(item.scan_target_id))
      .map((item) => item.id);
    const runIds = state.testRuns
      .filter((item) => targetIds.includes(item.scan_target_id) || jobIds.includes(item.job_id))
      .map((item) => item.id);
    const resultIds = state.results
      .filter((item) => runIds.includes(item.test_run_id))
      .map((item) => item.id);
    const parsedIds = state.parsedRecommendations
      .filter(
        (item) =>
          runIds.includes(item.test_run_id) || clusterIds.includes(item.query_cluster_id)
      )
      .map((item) => item.id);
    const issueIds = state.issues
      .filter((item) => hasFixtureId(item, fixtureId))
      .map((item) => item.id);

    state.usageEvents = state.usageEvents.filter(
      (item) => !this.fixtureUsageEvent(item, fixtureId)
    );
    state.offerExecutionDiagnoses = state.offerExecutionDiagnoses.filter(
      (item) => !issueIds.includes(item.issue_id)
    );
    state.checkoutVerificationDiagnoses = state.checkoutVerificationDiagnoses.filter(
      (item) => !issueIds.includes(item.issue_id)
    );
    state.gmvAssuranceSnapshots = state.gmvAssuranceSnapshots.filter(
      (item) =>
        !item.issue_ids.some((issueId) => issueIds.includes(issueId)) &&
        !targetIds.includes(item.scan_target_id)
    );
    state.productUnderstandingDiagnoses = state.productUnderstandingDiagnoses.filter(
      (item) => !issueIds.includes(item.issue_id)
    );
    state.verificationRuns = state.verificationRuns.filter(
      (item) => !issueIds.includes(item.issue_id) && !targetIds.includes(item.scan_target_id)
    );
    state.retestPreparations = state.retestPreparations.filter(
      (item) => !issueIds.includes(item.issue_id) && !targetIds.includes(item.scan_target_id)
    );
    state.issueResolutionPlans = state.issueResolutionPlans.filter(
      (item) => !issueIds.includes(item.issue_id)
    );
    state.issues = state.issues.filter((item) => !issueIds.includes(item.id));
    state.scores = state.scores.filter(
      (item) =>
        !targetIds.includes(item.scan_target_id) &&
        !clusterIds.includes(item.query_cluster_id)
    );
    state.matches = state.matches.filter(
      (item) => !parsedIds.includes(item.parsed_recommendation_id)
    );
    state.parsedRecommendations = state.parsedRecommendations.filter(
      (item) => !parsedIds.includes(item.id)
    );
    state.results = state.results.filter((item) => !resultIds.includes(item.id));
    state.testRuns = state.testRuns.filter((item) => !runIds.includes(item.id));
    state.jobs = state.jobs.filter((item) => !jobIds.includes(item.id));
    state.queryClusters = state.queryClusters.filter(
      (item) => !hasFixtureId(item, fixtureId)
    );
    state.scanTargets = state.scanTargets.filter(
      (item) => !hasFixtureId(item, fixtureId)
    );
    state.readinessSnapshots = state.readinessSnapshots.filter(
      (item) => !targetIds.includes(item.scan_target_id)
    );
    state.merchantOffers = state.merchantOffers.filter(
      (item) => !hasFixtureId(item, fixtureId)
    );
    state.pivotaOffers = state.pivotaOffers.filter(
      (item) => !hasFixtureId(item, fixtureId)
    );
    state.merchantCheckoutPaths = state.merchantCheckoutPaths.filter(
      (item) => !hasFixtureId(item, fixtureId)
    );
    state.pivotaCheckoutPaths = state.pivotaCheckoutPaths.filter(
      (item) => !hasFixtureId(item, fixtureId)
    );
    state.connections = state.connections.filter(
      (item) => !hasFixtureId(item, fixtureId)
    );
    state.stores = state.stores.filter((item) => !hasFixtureId(item, fixtureId));

    fixture.cleanup_status = cleanupStatus;
    touch(fixture);
    getAgentCenterRepository().upsert("demoFixtures", fixture);
    return { fixture };
  }
}

export function cleanupExpiredDemoFixtures() {
  return new DemoFixtureService().cleanupExpiredDemoFixtures();
}

const SUNSCREEN_REQUIRED_ATTRIBUTES = [
  "spf_level",
  "pa_rating",
  "skin_type",
  "finish",
  "active_ingredients",
];

const SUNSCREEN_COMPETITOR_BRANDS = [
  "Beauty of Joseon",
  "COSRX",
  "Laneige",
  "Anua",
];

const SUNSCREEN_COMPETITOR_PRODUCTS = [
  "Relief Sun: Rice + Probiotics",
  "Aloe Soothing Sun Cream",
  "Hydro UV Defense Sunscreen",
  "Heartleaf Silky Moisture Sunscreen",
];

type DemoScenarioKey =
  | "competitor_substitution"
  | "missing_merchant_pdp_attributes"
  | "pivota_pdp_readiness_gap";

function controlledSunscreenProduct(input: {
  scenario: DemoScenarioKey;
  attributes: Record<string, unknown>;
  pivotaAttributes: Record<string, unknown>;
}) {
  return {
    id: `prod_seoul_shield_daily_rice_sun_${input.scenario}`,
    product_entity_id: `pe_seoul_shield_daily_rice_sun_${input.scenario}`,
    sku: `SS-RICE-SUN-${input.scenario.toUpperCase().replace(/[^A-Z0-9]/g, "-")}`,
    title: "Seoul Shield Daily Rice Sun SPF 50",
    brand: "Seoul Shield",
    category: "skincare sunscreen",
    price: 28,
    currency: "USD",
    pdp_url: "https://seoul-shield.example/products/daily-rice-sun-spf-50",
    attributes: input.attributes,
    pivota_attributes: input.pivotaAttributes,
    agent_summary: "A lightweight daily Korean sunscreen with rice extract.",
    priority: "high" as const,
  };
}

function competitorOnlyDemoOutput() {
  return {
    mentioned_brands: SUNSCREEN_COMPETITOR_BRANDS,
    mentioned_products: [
      {
        name: "Relief Sun: Rice + Probiotics",
        brand: "Beauty of Joseon",
        rank: 1,
        reason: "Clear SPF, PA, texture, and sensitive-skin sunscreen evidence.",
        purchase_path_present: false,
      },
      {
        name: "Aloe Soothing Sun Cream",
        brand: "COSRX",
        rank: 2,
        reason: "Known soothing sunscreen alternative with stronger public claims.",
        purchase_path_present: false,
      },
    ],
    missing_attributes_identified: SUNSCREEN_REQUIRED_ATTRIBUTES,
    reasoning_summary:
      "Competitor sunscreens have clearer normalized sunscreen proof points than the merchant product.",
  };
}

function merchantDemoOutput(missingAttributes: string[] = []) {
  return {
    mentioned_brands: ["Seoul Shield"],
    mentioned_products: [
      {
        name: "Seoul Shield Daily Rice Sun SPF 50",
        brand: "Seoul Shield",
        rank: 1,
        reason: "Directly matches a daily Korean sunscreen query.",
        purchase_path_present: true,
      },
    ],
    missing_attributes_identified: missingAttributes,
    reasoning_summary: "The merchant product is relevant when PDP evidence is available.",
  };
}

function demoScenarioConfig(scenario: DemoScenarioKey) {
  const completeMerchantAttributes = {
    spf_level: "SPF 50",
    pa_rating: "PA++++",
    skin_type: "sensitive and combination",
    finish: "dewy",
    active_ingredients: "chemical UV filters",
  };

  if (scenario === "competitor_substitution") {
    return {
      label: "Case A: competitor substitution",
      attributes: {},
      pivotaAttributes: {},
      outputs: [
        competitorOnlyDemoOutput(),
        competitorOnlyDemoOutput(),
        competitorOnlyDemoOutput(),
      ],
    };
  }

  if (scenario === "missing_merchant_pdp_attributes") {
    return {
      label: "Case B: missing merchant PDP attributes",
      attributes: {},
      pivotaAttributes: {},
      outputs: [merchantDemoOutput(), merchantDemoOutput(), merchantDemoOutput()],
    };
  }

  return {
    label: "Case C: Pivota unified PDP readiness gap",
    attributes: completeMerchantAttributes,
    pivotaAttributes: {},
    outputs: [merchantDemoOutput(), merchantDemoOutput(), merchantDemoOutput()],
  };
}

export class DemoScenarioService {
  seed(input?: { scenario?: DemoScenarioKey | "all"; merchantId?: string }) {
    const requested = input?.scenario || "all";
    const scenarios: DemoScenarioKey[] =
      requested === "all"
        ? [
            "competitor_substitution",
            "missing_merchant_pdp_attributes",
            "pivota_pdp_readiness_gap",
          ]
        : [requested];

    return {
      scenarios: scenarios.map((scenario) =>
        this.seedScenario(scenario, input?.merchantId || DEMO_MERCHANT_ID)
      ),
    };
  }

  private seedScenario(scenario: DemoScenarioKey, merchantId: string) {
    const config = demoScenarioConfig(scenario);
    const product = controlledSunscreenProduct({
      scenario,
      attributes: config.attributes,
      pivotaAttributes: config.pivotaAttributes,
    });
    const store = new MerchantStoreService().create(
      {
        store_name: `Seoul Shield ${config.label}`,
        store_url: `https://${scenario}.seoul-shield.example`,
        platform: "shopify",
        integration_status: "connected",
        primary_category: "skincare sunscreen",
        competitor_brands: SUNSCREEN_COMPETITOR_BRANDS,
        competitor_products: SUNSCREEN_COMPETITOR_PRODUCTS,
        products: [product],
      },
      merchantId
    );
    const connection = getAgentCenterState().connections.find(
      (item) => item.store_id === store.id
    );
    if (connection) {
      connection.status = "connected";
      connection.capabilities.catalog = true;
      connection.capabilities.pdp_urls = true;
      connection.capabilities.sku_variant_map = true;
      connection.capabilities.structured_attributes = true;
      touch(connection);
    }

    const target = new ScanTargetService().create({
      merchant_id: merchantId,
      store_id: store.id,
      selected_product_ids: [product.id],
    });
    const cluster = new QueryClusterService()
      .generateForScanTarget(target.id, [product.id])
      .find((item) => item.intent_type === "category_recommendation");
    if (!cluster) throw new Error("Controlled sunscreen query cluster not found");

    const jobService = new DemandTestJobService();
    const job = jobService.create({
      scan_target_id: target.id,
      query_cluster_ids: [cluster.id],
      providers: ["gemini"],
      prompt_template_ids: ["general_recommendation_v1"],
      repetitions: config.outputs.length,
    });

    config.outputs.forEach((output, index) => {
      const query = cluster.queries[index % cluster.queries.length];
      const input: DemandTestInput = {
        merchantId: store.merchant_id,
        storeId: store.id,
        scanTargetId: target.id,
        queryClusterId: cluster.id,
        scanMode: target.scan_mode,
        query,
        promptTemplateId: "general_recommendation_v1",
        prompt: `User query: ${query}`,
        provider: "gemini",
        model: DEFAULT_GEMINI_MODEL,
        language: target.language,
        market: target.market,
        currency: target.currency,
        merchantContext: { store, product },
        pivotaContext: {
          product_entity_id: product.product_entity_id,
          attributes: product.pivota_attributes,
          agent_summary: product.agent_summary,
        },
        competitorContext: {
          brands: store.competitor_brands || [],
          products: store.competitor_products || [],
        },
        outputSchema: PARSED_RECOMMENDATION_SCHEMA,
        repetitionIndex: index + 1,
      };
      const run = jobService.createRun(
        job,
        cluster,
        query,
        "gemini",
        DEFAULT_GEMINI_MODEL,
        "general_recommendation_v1",
        input
      );
      const raw = {
        provider: "gemini" as const,
        model: DEFAULT_GEMINI_MODEL,
        raw_output: output,
        normalized_output: output,
        input_tokens: 120,
        output_tokens: 180,
        tool_calls: 0,
        provider_request_id: `controlled_${scenario}_${index + 1}`,
      };
      const result = jobService.createResult(run, raw);
      const parsed = parseProviderOutput(raw, input);
      parsed.test_run_id = run.id;
      parsed.query_cluster_id = cluster.id;
      getAgentCenterState().parsedRecommendations.push(parsed);
      run.status = "completed";
      run.raw_output_id = result.id;
      touch(run);
      new UsageMeteringService().record({ job, run, result });
    });

    const parsed = getAgentCenterState().parsedRecommendations.filter(
      (item) =>
        item.query_cluster_id === cluster.id &&
        getAgentCenterState().testRuns.some(
          (run) => run.id === item.test_run_id && run.job_id === job.id
        )
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
    pushProgress(job, "completed");

    return {
      scenario,
      label: config.label,
      store_id: store.id,
      scan_target_id: target.id,
      job_id: job.id,
      query_cluster_ids: [cluster.id],
      issue_ids: issues.map((issue) => issue.id),
      issue_types: issues.map((issue) => issue.issue_type),
      usage_event_ids: getAgentCenterState()
        .usageEvents.filter((event) => event.idempotency_key.startsWith(`${job.id}:`))
        .map((event) => event.id),
    };
  }
}

function searchGroundedDiscoveryEvidence(scanTargetId?: string) {
  const empty = {
    status: "not_tested" as GMVAssuranceDimensionStatus,
    grounding_sources_count: 0,
    returned_urls: [] as string[],
    grounding_sources: [] as string[],
    grounding_search_queries: [] as string[],
    matched_merchant_pdp: false,
    matched_pivota_pdp: false,
    merchant_domain_found: false,
    pivota_domain_found: false,
  };
  if (!scanTargetId) return empty;

  const state = getAgentCenterState();
  const jobIds = new Set(
    state.jobs
      .filter(
        (job) =>
          job.scan_target_id === scanTargetId &&
          job.scan_mode === "search_grounded_product_discovery_test"
      )
      .map((job) => job.id)
  );
  if (!jobIds.size) return empty;

  const runIds = new Set(
    state.testRuns.filter((run) => jobIds.has(run.job_id)).map((run) => run.id)
  );
  const parsed = state.parsedRecommendations.filter((item) =>
    runIds.has(item.test_run_id)
  );
  const scores = state.scores.filter(
    (score) => score.job_id && jobIds.has(score.job_id)
  );
  const aggregate = aggregateScores(scores);
  const merchantScore =
    aggregate.search_grounded_merchant_pdp_discovery_score;
  const pivotaScore = aggregate.search_grounded_pivota_pdp_discovery_score;
  const matchedMerchant = parsed.some((item) => item.merchant_pdp_url_exact_match);
  const matchedPivota = parsed.some((item) => item.pivota_pdp_url_exact_match);
  const status: GMVAssuranceDimensionStatus =
    merchantScore === "not_configured" || pivotaScore === "not_configured"
      ? "not_configured"
      : matchedMerchant || matchedPivota
        ? "passed"
        : parsed.length
          ? "needs_work"
          : "not_tested";

  return {
    status,
    grounding_sources_count: unique(
      parsed.flatMap((item) => item.grounding_sources || [])
    ).length,
    returned_urls: unique(parsed.flatMap((item) => item.returned_urls || [])),
    grounding_sources: unique(
      parsed.flatMap((item) => item.grounding_sources || [])
    ),
    grounding_search_queries: unique(
      parsed.flatMap((item) => item.grounding_search_queries || [])
    ),
    matched_merchant_pdp: matchedMerchant,
    matched_pivota_pdp: matchedPivota,
    merchant_domain_found: parsed.some((item) => item.merchant_domain_found),
    pivota_domain_found: parsed.some((item) => item.pivota_domain_found),
  };
}

export function getAgentCenterOverview(merchantId = DEMO_MERCHANT_ID) {
  const state = getAgentCenterState();
  const jobs = state.jobs.filter((job) => job.merchant_id === merchantId);
  const latestJob = jobs[jobs.length - 1] || null;
  const latestResults = latestJob ? new DemandTestJobService().results(latestJob.id) : null;
  const openIssues = state.issues.filter(
    (issue) =>
      issue.merchant_id === merchantId &&
      !["resolved", "ignored"].includes(issue.status)
  );
  const usage = getUsageSummary(merchantId);
  const latestAssuranceSnapshot = new GMVAssuranceService().latest(merchantId);
  const discoveryEvidence = searchGroundedDiscoveryEvidence(
    latestAssuranceSnapshot?.scan_target_id || latestJob?.scan_target_id
  );

  return {
    latest_job: latestJob,
    latest_result: latestResults,
    latest_assurance_snapshot: latestAssuranceSnapshot,
    pivota_discovery_progress:
      latestAssuranceSnapshot?.product_entity_id
        ? pivotaDiscoveryProgressFor({
            product_entity_id: latestAssuranceSnapshot.product_entity_id,
          })
        : latestAssuranceSnapshot?.pivota_discovery_progress,
    discovery_evidence: {
      search_grounded: discoveryEvidence,
    },
    ai_visibility_score:
      latestResults?.aggregate_scores.product_entity_visibility_score || 0,
    product_entity_visibility_score:
      latestResults?.aggregate_scores.product_entity_visibility_score || 0,
    merchant_store_visibility_score:
      latestResults?.aggregate_scores.merchant_store_visibility_score || 0,
    pivota_pdp_visibility_score:
      latestResults?.aggregate_scores.pivota_pdp_visibility_score || 0,
    pivota_attribution_echo_rate:
      latestResults?.aggregate_scores.pivota_attribution_echo_rate || 0,
    executable_offer_visibility_score:
      latestResults?.aggregate_scores.executable_offer_visibility_score ??
      "not_tested",
    organic_product_discovery_score:
      latestResults?.aggregate_scores.organic_product_discovery_score ?? "not_tested",
    search_grounded_merchant_pdp_discovery_score:
      latestResults?.aggregate_scores.search_grounded_merchant_pdp_discovery_score ??
      "not_tested",
    search_grounded_pivota_pdp_discovery_score:
      latestResults?.aggregate_scores.search_grounded_pivota_pdp_discovery_score ??
      "not_tested",
    buying_path_discovery_score:
      latestResults?.aggregate_scores.buying_path_discovery_score ?? "not_tested",
    competitor_dominance_score:
      latestResults?.aggregate_scores.competitor_dominance_score ?? "not_tested",
    competitor_substitution_rate:
      latestResults?.aggregate_scores.competitor_substitution_score || 0,
    pivota_pdp_readiness_score:
      latestResults?.aggregate_scores.pivota_pdp_readiness_score || 0,
    estimated_gmv_at_risk: openIssues.reduce(
      (sum, issue) => sum + issue.estimated_gmv_at_risk,
      0
    ),
    open_issues: openIssues.length,
    usage,
  };
}

export function getIssueDebugView(issueId: string) {
  const state = getAgentCenterState();
  const issue = state.issues.find((item) => item.id === issueId);
  if (!issue) throw new Error(`Issue not found: ${issueId}`);

  const queryClusters = state.queryClusters.filter((cluster) =>
    issue.affected_query_clusters.includes(cluster.id)
  );
  const runs = state.testRuns.filter(
    (run) =>
      run.scan_target_id === issue.scan_target_id &&
      issue.affected_query_clusters.includes(run.query_cluster_id)
  );
  const runIds = new Set(runs.map((run) => run.id));
  const results = state.results.filter((result) => runIds.has(result.test_run_id));
  const parsed = state.parsedRecommendations.filter((item) =>
    runIds.has(item.test_run_id)
  );
  const parsedIds = new Set(parsed.map((item) => item.id));
  const matches = state.matches.filter((match) =>
    parsedIds.has(match.parsed_recommendation_id)
  );
  const scores = state.scores.filter(
    (score) =>
      score.scan_target_id === issue.scan_target_id &&
      issue.affected_query_clusters.includes(score.query_cluster_id)
  );
  const usageEvents = state.usageEvents.filter(
    (event) =>
      event.scan_target_id === issue.scan_target_id &&
      issue.affected_query_clusters.includes(event.query_cluster_id)
  );

  return {
    issue_id: issue.id,
    query_clusters: queryClusters,
    test_runs: runs,
    raw_gemini_recommendation_list: results.map((result) => ({
      result_id: result.id,
      test_run_id: result.test_run_id,
      provider: result.provider,
      model: result.model,
      raw_output: result.raw_output,
      normalized_output: result.normalized_output,
    })),
    parsed_recommendations: parsed,
    match_results: matches,
    generated_scores: scores,
    generated_issue_json: issue,
    usage_event_ids: usageEvents.map((event) => event.id),
    usage_events: usageEvents,
  };
}

export function getUsageSummary(merchantId = DEMO_MERCHANT_ID) {
  const state = getAgentCenterState();
  const events = state.usageEvents.filter((event) => event.merchant_id === merchantId);
  const used = events.reduce((sum, event) => sum + event.quantity, 0);
  const group = (key: keyof UsageEvent) =>
    events.reduce<Record<string, number>>((acc, event) => {
      const value = String(event[key] || "unknown");
      acc[value] = (acc[value] || 0) + event.quantity;
      return acc;
    }, {});

  return {
    current_plan: "AI Test Credits Preview",
    included_ai_test_credits: state.usagePlan.included_credits,
    used_credits: used,
    remaining_credits: Math.max(0, state.usagePlan.included_credits - used),
    estimated_overage_credits: Math.max(
      0,
      used - state.usagePlan.included_credits
    ),
    budget_cap_credits: state.usagePlan.budget_cap_credits,
    billing_mode: "preview_only",
    billing_status: "not_invoiced",
    usage_by_agent: group("source_agent"),
    usage_by_provider: group("provider"),
    usage_by_store: group("store_id"),
    usage_by_scan_mode: group("scan_mode"),
    usage_by_job: events.reduce<Record<string, number>>((acc, event) => {
      const jobId = event.idempotency_key.split(":")[0] || "unknown";
      acc[jobId] = (acc[jobId] || 0) + event.quantity;
      return acc;
    }, {}),
    events,
  };
}

export function getPublicState() {
  const state = getAgentCenterState();
  return {
    stores: state.stores,
    connections: state.connections,
    providers: state.providers,
    prompt_templates: state.promptTemplates,
  };
}
