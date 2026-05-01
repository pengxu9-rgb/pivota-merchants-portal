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
  getAgentCenterState,
  nextId,
  nowIso,
  touch,
} from "./repository.ts";
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
  EntityMappingFinding,
  FixTarget,
  GMVAssuranceBlocker,
  GMVAssuranceDimensionSummary,
  GMVAssuranceSnapshot,
  GMVAssuranceUsageSummary,
  InputReadinessSnapshot,
  LLMSurfaceResult,
  LLMSurfaceTestRun,
  MerchantStore,
  MerchantCheckoutPath,
  MatchConfidence,
  MerchantOffer,
  ParsedRecommendation,
  OfferExecutionDiagnosis,
  OfferIssueType,
  OfferLayerComparison,
  OfferMismatchFinding,
  OfferPatchRecommendation,
  PivotaOffer,
  PivotaCheckoutPath,
  ProductLayerComparison,
  ProductMatchLevel,
  ProductMatchResult,
  ProductPatchRecommendation,
  ProductRecord,
  ProductUnderstandingDiagnosis,
  ProviderName,
  QueryCluster,
  QueryMappingFinding,
  QueryIntentType,
  RetestPreparation,
  ScanMode,
  ScanTarget,
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

function topCompetitorRecommendations(matches: ProductMatchResult[]) {
  return unique(
    matches.flatMap((match) =>
      match.competitor_matches.map(
        (competitor) => `${competitor.competitor_name} ${competitor.product_name}`
      )
    )
  ).slice(0, 5);
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
    const modes: ScanMode[] = ["open_product_visibility_test"];

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
    const state = getAgentCenterState();
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
    state.usageEvents.push(event);
    return event;
  }

  recordProductUnderstanding(input: {
    issue: AgenticGMVIssue;
    diagnosisId?: string;
    quantity?: number;
  }) {
    const key = `product_understanding:${input.issue.id}:product_diagnosis:v1`;
    const state = getAgentCenterState();
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
    state.usageEvents.push(event);
    return event;
  }

  recordOfferExecution(input: {
    issue: AgenticGMVIssue;
    diagnosisId?: string;
    quantity?: number;
  }) {
    const key = `offer_execution:${input.issue.id}:offer_readiness:v1`;
    const state = getAgentCenterState();
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
    state.usageEvents.push(event);
    return event;
  }

  recordCheckoutVerification(input: {
    issue: AgenticGMVIssue;
    diagnosisId?: string;
    quantity?: number;
  }) {
    const key = `checkout_verification:${input.issue.id}:checkout_readiness:v1`;
    const state = getAgentCenterState();
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
    state.usageEvents.push(event);
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

    if (input.issueType === "merchant_store_attribution_gap") {
      return ["merchant_pdp", "merchant_catalog", "merchant_structured_data"];
    }

    if (input.issueType === "pivota_pdp_attribution_gap") {
      return ["pivota_unified_pdp", "pivota_product_graph", "pivota_query_mapping"];
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

    if (input.issueType === "competitor_substitution") {
      if (input.missingAttributes.length > 0) {
        return ["merchant_pdp", "pivota_unified_pdp"];
      }
      return ["both_merchant_and_pivota"];
    }

    if (input.issueType === "ai_visibility_loss") {
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

    if (
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

    if (aggregate.competitor_substitution_score >= 60) {
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
            const query = cluster.queries[(repetitionIndex - 1) % cluster.queries.length];
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

function scoreDelta(
  before: ReturnType<typeof scoreSnapshot>,
  after: ReturnType<typeof scoreSnapshot>
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
      typeof after.aggregate_scores.executable_offer_visibility_score === "number" &&
      typeof before.aggregate_scores.executable_offer_visibility_score === "number"
        ? after.aggregate_scores.executable_offer_visibility_score -
          before.aggregate_scores.executable_offer_visibility_score
        : 0,
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
    (issue.issue_type === "pivota_pdp_readiness_gap" &&
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
    if (!beforeScores.length) throw new Error("Before score not found");
    const beforeSnapshot = scoreSnapshot({
      issue,
      scores: beforeScores,
      estimatedGmvAtRisk: issue.estimated_gmv_at_risk,
    });

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

function scoreStatus(score?: number | "not_tested", passAt = 80, blockBelow = 50) {
  if (score === undefined || score === "not_tested") return "not_tested" as const;
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
  return {
    ai_test_credits: ai,
    product_understanding_credits: product,
    offer_verification_credits: offer,
    checkout_verification_credits: checkout,
    total_preview_credits: ai + product + offer + checkout,
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

type CreateAssuranceSnapshotInput = {
  merchant_id?: string;
  store_id?: string;
  scan_target_id?: string;
  product_entity_id?: string;
};

function scoreFromDimension(summary: GMVAssuranceDimensionSummary) {
  return typeof summary.score === "number" ? summary.score : undefined;
}

function issueForTypes(
  issues: AgenticGMVIssue[],
  types: AgenticGMVIssueType[]
) {
  return issues.find((issue) => types.includes(issue.issue_type));
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
    return latestByCreatedAt(this.list(merchantId)) || null;
  }

  overview(merchantId = DEMO_MERCHANT_ID) {
    const latest = this.latest(merchantId);
    return {
      latest_snapshot: latest,
      snapshots: this.list(merchantId).slice(-10).reverse(),
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
    const latestScore = latestByCreatedAt(scores);
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
    const merchantAttributionStatus: GMVAssuranceDimensionSummary = merchantRequired
      ? {
          status: scoreStatus(merchantAttributionScore, 80, -1),
          score: merchantAttributionScore ?? "not_tested",
          issue_id: merchantAttributionIssue?.id,
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
    const pivotaAttributionStatus: GMVAssuranceDimensionSummary = pivotaRequired
      ? {
          status: scoreStatus(pivotaAttributionScore, 80, -1),
          score: pivotaAttributionScore ?? "not_tested",
          issue_id: pivotaAttributionIssue?.id,
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
    const productDataStatus: GMVAssuranceDimensionSummary = productDiagnosis
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
    if (productVisibilityStatus.status === "blocked") {
      topBlockers.push({
        blocker_type: "low_product_visibility",
        severity: "critical",
        affected_layer: "demand_test",
        fix_target: productVisibilityIssue?.fix_targets[0],
        issue_id: productVisibilityIssue?.id,
        recommended_action: "Improve product visibility and rerun Demand Test.",
      });
    }
    if (merchantRequired && merchantAttributionStatus.status !== "passed") {
      topBlockers.push({
        blocker_type: "merchant_store_attribution_gap",
        severity: "high",
        affected_layer: "merchant_attribution",
        fix_target: "merchant_pdp",
        issue_id: merchantAttributionIssue?.id,
        recommended_action: "Return a verified merchant store/PDP buying path.",
      });
    }
    if (pivotaRequired && pivotaAttributionStatus.status !== "passed") {
      topBlockers.push({
        blocker_type: "pivota_attribution_gap",
        severity: "high",
        affected_layer: "pivota_channel",
        fix_target: "pivota_unified_pdp",
        issue_id: pivotaAttributionIssue?.id,
        recommended_action: "Publish or verify Pivota PDP / offer attribution.",
      });
    }
    for (const finding of productFindings.slice(0, 1)) {
      topBlockers.push({
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
      });
    }
    for (const finding of offerFindings.filter((item) => item.severity === "high" || item.severity === "critical").slice(0, 2)) {
      topBlockers.push({
        blocker_type: finding.finding_type,
        severity: finding.severity,
        affected_layer: "offer_execution",
        fix_target: finding.fix_target,
        issue_id: offerDiagnosis?.issue_id,
        diagnosis_id: offerDiagnosis?.id,
        recommended_action: offerStatus.recommended_next_action,
      });
    }
    for (const finding of checkoutFindings.filter((item) => item.severity === "high" || item.severity === "critical").slice(0, 2)) {
      topBlockers.push({
        blocker_type: finding.finding_type,
        severity: finding.severity,
        affected_layer: "checkout_verification",
        fix_target: finding.fix_target,
        issue_id: checkoutDiagnosis?.issue_id,
        diagnosis_id: checkoutDiagnosis?.id,
        recommended_action: checkoutStatus.recommended_next_action,
      });
    }

    const dimensions = [
      productVisibilityStatus,
      merchantAttributionStatus,
      pivotaAttributionStatus,
      productDataStatus,
      skuStatus,
      offerStatus,
      checkoutStatus,
    ];
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
      created_at: now,
      updated_at: now,
    };
    state.gmvAssuranceSnapshots.push(snapshot);
    return snapshot;
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
    state.demoFixtures.push(fixture);

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
    const fixture = getAgentCenterState().demoFixtures.find(
      (item) => item.fixture_id === fixtureId
    );
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
    const fixture = state.demoFixtures.find((item) => item.fixture_id === fixtureId);
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
    fixture.updated_at = nowIso();
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

  return {
    latest_job: latestJob,
    latest_result: latestResults,
    latest_assurance_snapshot: latestAssuranceSnapshot,
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
      latestResults?.aggregate_scores.executable_offer_visibility_score ||
      "not_tested",
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
