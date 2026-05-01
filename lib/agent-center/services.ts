import crypto from "node:crypto";
import { GeminiProviderAdapter, PARSED_RECOMMENDATION_SCHEMA, parseProviderOutput } from "./provider.ts";
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
  DemandTestInput,
  DemandTestJob,
  DemandTestJobStatus,
  DemandVisibilityScore,
  FixTarget,
  InputReadinessSnapshot,
  LLMSurfaceResult,
  LLMSurfaceTestRun,
  MerchantStore,
  ParsedRecommendation,
  ProductMatchResult,
  ProductRecord,
  ProviderName,
  QueryCluster,
  QueryIntentType,
  RetestPreparation,
  ScanMode,
  ScanTarget,
  UsageEstimate,
  UsageEvent,
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
  score: number,
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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function formatFixTarget(target: FixTarget) {
  const labels: Record<FixTarget, string> = {
    merchant_pdp: "merchant PDP",
    merchant_catalog: "merchant catalog",
    merchant_variant_map: "merchant variant map",
    pivota_unified_pdp: "Pivota unified PDP",
    pivota_product_graph: "Pivota product graph",
    pivota_query_mapping: "Pivota query mapping",
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
  const merchantMentions = input.parsed.filter(
    (item) => item.merchant_product_mentioned
  ).length;
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

function findProduct(store: MerchantStore, productId?: string) {
  if (!productId) return store.products?.[0];
  return store.products?.find((product) => product.id === productId);
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
      input.scan_mode ||
      (store.integration_status === "connected"
        ? "catalog_integrated_demand_scan"
        : "url_only_demand_scan");
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
    const modes: ScanMode[] = ["url_only_demand_scan"];

    let score = 24;
    if (store.store_url) score += 10;
    if (store.primary_category) score += 8;
    if (store.optional_pdp_urls?.length || connection?.capabilities.pdp_urls) score += 8;
    if (store.competitor_brands?.length) score += 10;

    if (connection?.capabilities.catalog || store.products?.length) {
      modes.push("catalog_integrated_demand_scan");
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
}

export class ProductMatchService {
  match(parsed: ParsedRecommendation, store: MerchantStore, cluster: QueryCluster) {
    const product = findProduct(store, cluster.product_id);
    const joined = parsed.mentioned_products
      .map((item) => `${item.brand} ${item.name}`)
      .join(" | ")
      .toLowerCase();
    const brandMentioned =
      parsed.merchant_brand_mentioned ||
      Boolean(product?.brand && joined.includes(product.brand.toLowerCase()));
    const productMentioned =
      parsed.merchant_product_mentioned ||
      Boolean(product?.title && joined.includes(product.title.toLowerCase()));
    const skuMentioned =
      parsed.merchant_sku_mentioned ||
      Boolean(product?.sku && joined.includes(product.sku.toLowerCase()));
    const entityMentioned =
      parsed.pivota_product_entity_mentioned ||
      Boolean(
        product?.product_entity_id &&
          joined.includes(product.product_entity_id.toLowerCase())
      );

    let matchedLevel: ProductMatchResult["matched_level"] = 0;
    if (brandMentioned) matchedLevel = 1;
    if (productMentioned) matchedLevel = 2;
    if (productMentioned || entityMentioned) matchedLevel = 3;
    if (skuMentioned) matchedLevel = 4;

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

    const matchConfidence =
      matchedLevel >= 3 ? 0.92 : competitorMatches.length ? 0.88 : 0.64;
    const now = nowIso();
    const result: ProductMatchResult = {
      id: nextId("match"),
      parsed_recommendation_id: parsed.id,
      merchant_id: store.merchant_id,
      store_id: store.id,
      product_entity_id: product?.product_entity_id,
      matched_level: matchedLevel,
      matched_brand: brandMentioned,
      matched_product_family: productMentioned,
      matched_product_entity: matchedLevel >= 3,
      matched_sku: skuMentioned,
      matched_variant: false,
      competitor_matches: competitorMatches,
      match_confidence: Number(matchConfidence.toFixed(2)),
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
      providerScores[provider] = this.calculateScores(providerParsed, product, input.cluster);
    }

    const aggregate = this.calculateScores(input.parsed, product, input.cluster);
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
      score_explanations: this.explainScores(input.parsed, product, input.cluster, aggregate),
      created_at: now,
      updated_at: now,
    };

    state.scores.push(score);
    return score;
  }

  calculateScores(
    parsed: ParsedRecommendation[],
    product: ProductRecord | undefined,
    cluster: QueryCluster
  ) {
    const total = Math.max(1, parsed.length);
    const merchantMentions = parsed.filter(
      (item) => item.merchant_product_mentioned
    ).length;
    const ranks = parsed
      .map((item) => item.recommendation_rank)
      .filter((rank): rank is number => typeof rank === "number");
    const rankScore = ranks.length
      ? ranks.reduce((sum, rank) => sum + Math.max(0, 120 - rank * 20), 0) /
        ranks.length
      : 0;
    const substitutions = parsed.filter(
      (item) =>
        item.competitor_substitution_detected && !item.merchant_product_mentioned
    ).length;
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
      visibility_score: clampScore((merchantMentions / total) * 100),
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
    scores: DemandVisibilityScore["aggregate_scores"]
  ): DemandVisibilityScore["score_explanations"] {
    const total = Math.max(1, parsed.length);
    const supportingRuns = parsed.map((item) => item.test_run_id).filter(Boolean);
    const merchantMentions = parsed.filter(
      (item) => item.merchant_product_mentioned
    ).length;
    const substitutions = parsed.filter(
      (item) =>
        item.competitor_substitution_detected && !item.merchant_product_mentioned
    ).length;
    const ranks = parsed
      .map((item) => item.recommendation_rank)
      .filter((rank): rank is number => typeof rank === "number");
    const required = cluster.required_attributes;
    const merchantMissing = missingAttributesForLayer(product, cluster, "merchant");
    const pivotaMissing = missingAttributesForLayer(product, cluster, "pivota");

    return {
      visibility_score: scoreExplanation(
        scores.visibility_score,
        "merchant_product_mentions / total_completed_runs * 100",
        `visibility_score = ${scores.visibility_score} because merchant product was mentioned in ${merchantMentions} of ${parsed.length} completed Gemini runs.`,
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
      ...input.matches.map((item) => item.match_confidence),
      1
    );

    if (
      aggregate.visibility_score < 20 &&
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
    const merchantMentions = input.input.parsed.filter(
      (item) => item.merchant_product_mentioned
    ).length;
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
      visibilityScore: input.input.score.aggregate_scores.visibility_score,
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
        visibility_rate: input.input.score.aggregate_scores.visibility_score / 100,
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
        target_improvement: `increase from ${input.input.score.aggregate_scores.visibility_score}% to 20%+`,
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
            const prompt = template.prompt.replace("{{query}}", query);
            const input: DemandTestInput = {
              merchantId: job.merchant_id,
              storeId: job.store_id,
              scanTargetId: job.scan_target_id,
              queryClusterId: cluster.id,
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
      acc.recommendation_rank_score += score.aggregate_scores.recommendation_rank_score;
      acc.competitor_substitution_score +=
        score.aggregate_scores.competitor_substitution_score;
      acc.attribute_readiness_score += score.aggregate_scores.attribute_readiness_score;
      acc.pivota_pdp_readiness_score += score.aggregate_scores.pivota_pdp_readiness_score;
      return acc;
    },
    {
      visibility_score: 0,
      recommendation_rank_score: 0,
      competitor_substitution_score: 0,
      attribute_readiness_score: 0,
      pivota_pdp_readiness_score: 0,
    }
  );
  const count = scores.length;
  return {
    visibility_score: clampScore(sum.visibility_score / count),
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
    visibility_score:
      after.aggregate_scores.visibility_score -
      before.aggregate_scores.visibility_score,
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
    (issue.issue_type === "ai_visibility_loss" && scores.visibility_score >= 20) ||
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
      estimatedGmvAtRisk: estimatedAfterGmvAtRisk(issue, {
        visibility_score: afterAggregate.visibility_score,
        recommendation_rank_score: afterAggregate.recommendation_rank_score,
        competitor_substitution_score:
          afterAggregate.competitor_substitution_score,
        attribute_readiness_score: afterAggregate.attribute_readiness_score,
        pivota_pdp_readiness_score: afterAggregate.pivota_pdp_readiness_score,
      }),
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
        before_visibility_score: beforeSnapshot.aggregate_scores.visibility_score,
        after_visibility_score: afterSnapshot.aggregate_scores.visibility_score,
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
      verification.after_scores.aggregate_scores.visibility_score >
        verification.before_scores.aggregate_scores.visibility_score ||
      verification.after_scores.estimated_gmv_at_risk <
        verification.before_scores.estimated_gmv_at_risk
        ? "resolved"
        : "failed_verification";
    touch(issue);
    return verification;
  }
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

  return {
    latest_job: latestJob,
    latest_result: latestResults,
    ai_visibility_score: latestResults?.aggregate_scores.visibility_score || 0,
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
