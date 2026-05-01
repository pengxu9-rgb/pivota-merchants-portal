import crypto from "node:crypto";
import { GeminiProviderAdapter, PARSED_RECOMMENDATION_SCHEMA, parseProviderOutput } from "./provider.ts";
import {
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
    const attributes = new Set<string>();
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
      parsed.flatMap((item) => item.missing_attributes_identified)
    );
    const required = cluster.required_attributes.length
      ? cluster.required_attributes
      : missingAttributes;
    const attributeReadiness =
      required.length === 0
        ? 86
        : ((required.length -
            required.filter((attribute) => missingAttributes.includes(attribute)).length) /
            required.length) *
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
      return ["both_merchant_and_pivota"];
    }

    if (input.issueType === "ai_visibility_loss") {
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
      input.parsed.flatMap((item) => item.missing_attributes_identified)
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
        query_cluster: input.input.cluster.cluster_name,
        total_test_runs: input.input.parsed.length,
        merchant_product_mentions: merchantMentions,
        visibility_rate: input.input.score.aggregate_scores.visibility_score / 100,
        competitor_mentions: competitorMentions,
        top_competitors: unique(
          input.input.matches.flatMap((match) =>
            match.competitor_matches.map((competitor) => competitor.competitor_name)
          )
        ).slice(0, 3),
        missing_attributes: input.missingAttributes,
        aggregate_scores: input.input.score.aggregate_scores,
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
        const model = providerRecord?.default_model || "gemini-2.0-flash";
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
  };
}

export class VerificationService {
  async retestIssue(issueId: string) {
    const state = getAgentCenterState();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) throw new Error(`Issue not found: ${issueId}`);
    issue.status = "verification_running";
    touch(issue);

    const target = findScanTarget(issue.scan_target_id);
    const beforeScore = state.scores.find((score) =>
      issue.affected_query_clusters.includes(score.query_cluster_id)
    );
    if (!beforeScore) throw new Error("Before score not found");

    const job = new DemandTestJobService().create({
      scan_target_id: target.id,
      providers: issue.verification_plan.providers,
      prompt_template_ids: issue.verification_plan.prompt_templates,
      query_cluster_ids: issue.affected_query_clusters,
      repetitions: 2,
      job_type: "retest",
      parent_issue_id: issue.id,
    });
    job.estimated_credits = new UsageMeteringService().estimate({
      scan_target_id: target.id,
      providers: job.scope.providers,
      prompt_template_ids: job.scope.prompt_templates,
      query_cluster_ids: job.scope.query_cluster_ids,
      repetitions: job.scope.repetitions,
    }).estimated_ai_test_credits;

    await new DemandTestJobService().run(job.id, { retestBoost: true });
    const afterScore = [...state.scores]
      .reverse()
      .find(
        (score) =>
          score.job_id === job.id &&
          issue.affected_query_clusters.includes(score.query_cluster_id)
      );
    if (!afterScore) throw new Error("After score not found");

    const now = nowIso();
    const verification: VerificationRun = {
      id: nextId("verification"),
      merchant_id: issue.merchant_id,
      store_id: issue.store_id,
      scan_target_id: issue.scan_target_id,
      issue_id: issue.id,
      before_score_id: beforeScore.id,
      after_score_id: afterScore.id,
      status: "completed",
      result: {
        before_visibility_score: beforeScore.aggregate_scores.visibility_score,
        after_visibility_score: afterScore.aggregate_scores.visibility_score,
        before_competitor_substitution_score:
          beforeScore.aggregate_scores.competitor_substitution_score,
        after_competitor_substitution_score:
          afterScore.aggregate_scores.competitor_substitution_score,
      },
      retest_job_id: job.id,
      created_at: now,
      updated_at: now,
    };

    state.verificationRuns.push(verification);
    issue.status =
      verification.result.after_visibility_score >
      verification.result.before_visibility_score
        ? "resolved"
        : "failed_verification";
    touch(issue);
    return verification;
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
