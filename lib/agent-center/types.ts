export type StorePlatform =
  | "shopify"
  | "wix"
  | "woocommerce"
  | "amazon"
  | "tiktok_shop"
  | "custom"
  | "unknown";

export type IntegrationStatus = "connected" | "url_only" | "disconnected";

export type ScanMode =
  | "organic_product_discovery_test"
  | "search_grounded_product_discovery_test"
  | "buying_path_discovery_test"
  | "open_product_visibility_test"
  | "merchant_store_attribution_test"
  | "pivota_pdp_attribution_test"
  | "agentic_execution_test"
  | "url_only_demand_scan"
  | "catalog_integrated_demand_scan"
  | "offer_aware_demand_scan"
  | "checkout_aware_gmv_scan";

export type ProviderName =
  | "gemini"
  | "openai"
  | "claude"
  | "perplexity"
  | "copilot";

export type UsageProviderName = ProviderName | "internal";

export type PromptTemplateType =
  | "general_recommendation"
  | "purchase_ready"
  | "attribute_specific"
  | "comparison"
  | "merchant_aware_evaluation"
  | "pivota_pdp_readiness";

export type QueryIntentType =
  | "category_recommendation"
  | "problem_solution"
  | "attribute_specific"
  | "budget_constrained"
  | "competitor_comparison"
  | "dupe_or_substitute"
  | "purchase_ready"
  | "occasion_or_use_case";

export type DemandTestJobStatus =
  | "draft"
  | "estimating_usage"
  | "ready_to_run"
  | "queued"
  | "generating_query_clusters"
  | "running_provider_tests"
  | "parsing_outputs"
  | "matching_products"
  | "scoring"
  | "generating_issues"
  | "completed"
  | "failed"
  | "cancelled";

export type LLMSurfaceTestRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "provider_error"
  | "parse_error"
  | "non_billable_retry"
  | "failed";

export type AgenticGMVIssueStatus =
  | "detected"
  | "diagnosed"
  | "recommendation_ready"
  | "approval_required"
  | "approved"
  | "fix_applied"
  | "verification_running"
  | "resolved"
  | "failed_verification"
  | "ignored";

export type AgenticGMVIssueType =
  | "ai_visibility_loss"
  | "competitor_substitution"
  | "merchant_store_attribution_gap"
  | "pivota_pdp_attribution_gap"
  | "pivota_offer_attribution_gap"
  | "unverified_pivota_attribution"
  | "missing_attribute"
  | "weak_recommendation_evidence"
  | "pivota_pdp_readiness_gap"
  | "pivota_pdp_content_quality_gap"
  | "pivota_product_intelligence_gap"
  | "organic_product_not_discovered"
  | "organic_brand_not_discovered"
  | "competitor_dominance"
  | "merchant_pdp_not_discovered"
  | "pivota_pdp_not_discovered"
  | "wrong_buying_path_returned"
  | "buying_path_missing"
  | "offer_not_discovered"
  | "search_grounding_not_configured"
  | "product_entity_mapping_issue"
  | "wrong_product_family"
  | "no_purchase_path"
  | "offer_execution_issue"
  | "checkout_verification_issue"
  | "human_review_required";

export type FixTarget =
  | "merchant_pdp"
  | "merchant_catalog"
  | "merchant_structured_data"
  | "merchant_variant_map"
  | "pivota_unified_pdp"
  | "pivota_product_graph"
  | "pivota_query_mapping"
  | "merchant_offer_source"
  | "pivota_offer_layer"
  | "merchant_inventory_source"
  | "merchant_promo_source"
  | "merchant_checkout_source"
  | "pivota_checkout_layer"
  | "merchant_cart_config"
  | "both_merchant_and_pivota"
  | "human_review";

export type Severity = "low" | "medium" | "high" | "critical";

export type Timestamped = {
  created_at: string;
  updated_at?: string;
};

export type DemoFixtureType =
  | "merchant_store"
  | "scan_target"
  | "product_entity"
  | "pivota_unified_pdp"
  | "merchant_product"
  | "merchant_sku"
  | "merchant_offer"
  | "pivota_offer"
  | "merchant_checkout_path"
  | "pivota_checkout_path"
  | "agentic_gmv_issue";

export type DemoFixturePreset =
  | "clean_offer"
  | "price_mismatch"
  | "expired_coupon"
  | "inventory_mismatch"
  | "missing_pivota_offer"
  | "clean_checkout_path"
  | "missing_checkout_path"
  | "checkout_url_unreachable"
  | "missing_variant_param"
  | "missing_coupon_param"
  | "stale_checkout_session"
  | "checkout_domain_mismatch"
  | "checkout_not_attached_to_offer"
  | "full_ready_pre_payment_chain"
  | "offer_price_blocker_chain";

export type DemoFixtureCleanupStatus = "active" | "deleted" | "expired";

export type DemoFixtureMetadata = {
  demo_fixture?: boolean;
  fixture_id?: string;
  created_by?: "internal" | "demand_test_agent" | "merchant";
  created_at?: string;
  expires_at?: string | null;
  ttl_minutes?: number;
  environment?: string;
  cleanup_status?: DemoFixtureCleanupStatus;
};

export type ChannelAttribution =
  | "unattributed_product_recommendation"
  | "merchant_store_attributed"
  | "pivota_pdp_attributed"
  | "pivota_pdp_attributed_unverified"
  | "pivota_pdp_attributed_verified"
  | "pivota_offer_attributed"
  | "pivota_offer_attributed_unverified"
  | "pivota_offer_attributed_verified"
  | "unverified_pivota_echo"
  | "executable_offer_attributed"
  | "unknown";

export type PurchasePathType =
  | "none"
  | "merchant_pdp"
  | "merchant_offer"
  | "pivota_pdp"
  | "pivota_offer"
  | "executable_offer"
  | "unknown";

export type VisibilityScoreValue = number | "not_tested" | "not_configured";

export type SourceReference = {
  source_type:
    | "external_seed"
    | "official_merchant_pdp"
    | "merchant_catalog"
    | "manual_mapping"
    | "manual_pilot_mapping";
  source_id?: string;
  source_url?: string;
  merchant_id?: string;
  merchant_name?: string;
  verified_at?: string;
  confidence?: string;
  maps_to_product_entity_id?: string;
};

export type ProductEntity = {
  product_entity_id: string;
  canonical_slug?: string;
  canonical_url?: string;
  canonical_product_name: string;
  brand: string;
  category?: string;
  normalized_attributes?: Record<string, unknown>;
  source_references: SourceReference[];
  external_seed_ids: string[];
  merchant_product_mappings: Array<{
    merchant_id?: string;
    merchant_product_id?: string;
    merchant_sku_id?: string;
    source_product_id?: string;
  }>;
  merchant_offers: Array<{
    merchant_id?: string;
    merchant_sku_id?: string;
    source_product_id?: string;
    offer_id?: string;
    checkout_path_id?: string;
  }>;
  pivota_offers: Array<{
    pivota_offer_id?: string;
    merchant_id?: string;
    merchant_sku_id?: string;
  }>;
};

export type ProductRecord = DemoFixtureMetadata & {
  id: string;
  product_entity_id: string;
  canonical_slug?: string;
  canonical_url?: string;
  canonical_product_name?: string;
  external_seed_id?: string;
  external_seed_ids?: string[];
  source_references?: SourceReference[];
  merchant_product_mappings?: ProductEntity["merchant_product_mappings"];
  merchant_offers?: ProductEntity["merchant_offers"];
  pivota_offers?: ProductEntity["pivota_offers"];
  sku: string;
  title: string;
  brand: string;
  category: string;
  price?: number;
  currency: string;
  pdp_url?: string;
  attributes: Record<string, unknown>;
  pivota_attributes: Record<string, unknown>;
  agent_summary?: string;
  priority?: "low" | "medium" | "high";
};

export type MerchantStore = Timestamped & DemoFixtureMetadata & {
  id: string;
  merchant_id: string;
  store_name: string;
  store_url: string;
  platform: StorePlatform;
  market: string;
  language: string;
  currency: string;
  integration_status: IntegrationStatus;
  primary_category?: string;
  optional_pdp_urls?: string[];
  optional_sitemap_url?: string;
  competitor_brands?: string[];
  competitor_products?: string[];
  products?: ProductRecord[];
};

export type StorePlatformConnection = Timestamped & DemoFixtureMetadata & {
  id: string;
  merchant_id: string;
  store_id: string;
  platform: StorePlatform;
  status: "connected" | "url_only" | "disabled";
  last_catalog_sync_at?: string | null;
  last_offer_sync_at?: string | null;
  last_checkout_sync_at?: string | null;
  capabilities: {
    catalog: boolean;
    pdp_urls: boolean;
    sku_variant_map: boolean;
    structured_attributes: boolean;
    offers: boolean;
    checkout: boolean;
    orders: boolean;
  };
};

export type ScanTarget = Timestamped & DemoFixtureMetadata & {
  id: string;
  merchant_id: string;
  store_id: string;
  target_type: "store" | "store_url" | "multi_store";
  store_name: string;
  store_url: string;
  platform: StorePlatform;
  integration_status: IntegrationStatus;
  market: string;
  language: string;
  currency: string;
  scan_mode: ScanMode;
  selected_product_ids: string[];
  store_ids?: string[];
  primary_category?: string;
};

export type InputReadinessSnapshot = Timestamped & {
  id: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  input_completeness_score: number;
  available_scan_modes: ScanMode[];
  missing_inputs: Array<{
    input: string;
    impact: "low" | "medium" | "high";
    reason: string;
  }>;
  scan_limitations: string[];
  recommended_run_window: {
    recommendation: "run_now" | "improve_inputs_first" | "blocked";
    reason: string;
    risk_level: "low" | "medium" | "high";
  };
};

export type ProviderRegistry = {
  provider: ProviderName;
  status: "active" | "planned" | "research_required" | "disabled";
  role: string;
  supports_structured_output?: boolean;
  supports_web_grounding?: boolean;
  supports_batch?: boolean;
  supports_openai_compatible_client?: boolean;
  default_model?: string;
  enabled_for_v1: boolean;
  credit_multiplier: number | null;
};

export type QueryCluster = Timestamped & DemoFixtureMetadata & {
  id: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  product_entity_id?: string;
  target_skus: string[];
  cluster_name: string;
  intent_type: QueryIntentType;
  category: string;
  queries: string[];
  priority: "low" | "medium" | "high";
  estimated_demand_value: number;
  created_by: "demand_test_agent" | "merchant";
  required_attributes: string[];
  product_id?: string;
};

export type PromptTemplate = {
  id: string;
  template_type: PromptTemplateType;
  version: number;
  language: string;
  prompt: string;
  required_output_schema_id: "parsed_recommendation_v1";
  status: "active" | "disabled";
};

export type DemandTestJob = Timestamped & {
  id: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  job_type: "manual_scan" | "scheduled_scan" | "retest";
  scan_mode: ScanMode;
  execution_mode: "sync" | "async_batch" | "manual_surface_sampling";
  scope: {
    query_cluster_ids: string[];
    providers: ProviderName[];
    prompt_templates: string[];
    repetitions: number;
  };
  estimated_credits: number;
  status: DemandTestJobStatus;
  progress: Array<{ status: DemandTestJobStatus; at: string }>;
  parent_issue_id?: string;
};

export type DemandTestInput = {
  merchantId: string;
  storeId: string;
  scanTargetId: string;
  queryClusterId: string;
  scanMode: ScanMode;
  query: string;
  promptTemplateId: string;
  prompt: string;
  provider: ProviderName;
  model: string;
  language: string;
  market: string;
  currency: string;
  merchantContext?: {
    store: MerchantStore;
    product?: ProductRecord;
  };
  pivotaContext?: Record<string, unknown>;
  competitorContext?: {
    brands: string[];
    products: string[];
  };
  outputSchema: Record<string, unknown>;
  repetitionIndex: number;
  retestBoost?: boolean;
  pivotaAttributionPreflight?: PivotaAttributionPreflight;
};

export type PivotaAttributionPreflight = {
  status: "not_applicable" | "verified" | "failed" | "negative_control";
  candidate_url?: string;
  status_code?: number | null;
  final_url?: string;
  verified_url?: string;
  expected_product_entity_id?: string;
  expected_product_object_id?: string;
  verified_product_object_ids: string[];
  expected_offer_ids: string[];
  verified_offer_ids: string[];
  failure_reason?: string;
};

export type LLMRawResult = {
  provider: ProviderName;
  model: string;
  raw_output: string | Record<string, unknown>;
  normalized_output?: Record<string, unknown>;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  provider_request_id: string;
};

export type LLMSurfaceTestRun = Timestamped & {
  id: string;
  job_id: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  query_cluster_id: string;
  query: string;
  provider: ProviderName;
  model: string;
  prompt_template_id: string;
  temperature: number;
  status: LLMSurfaceTestRunStatus;
  raw_output_id?: string;
  input_payload_hash: string;
  repetition_index: number;
};

export type LLMSurfaceResult = Timestamped & {
  id: string;
  test_run_id: string;
  provider: ProviderName;
  model: string;
  raw_output: string | Record<string, unknown>;
  normalized_output: Record<string, unknown>;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  provider_request_id: string;
};

export type MentionedProduct = {
  name: string;
  brand: string;
  rank: number;
  reason: string;
  likely_price_range?: string;
  purchase_path_present?: boolean;
  purchase_path_type?: PurchasePathType;
  product_url?: string;
};

export type ParsedRecommendation = Timestamped & {
  id: string;
  test_run_id: string;
  query_cluster_id: string;
  provider: ProviderName;
  model: string;
  mentioned_brands: string[];
  mentioned_products: MentionedProduct[];
  product_entity_mentioned: boolean;
  merchant_brand_mentioned: boolean;
  merchant_product_mentioned: boolean;
  merchant_sku_mentioned: boolean;
  pivota_product_entity_mentioned: boolean;
  merchant_store_mentioned: boolean;
  merchant_pdp_url_present: boolean;
  merchant_pdp_url?: string;
  merchant_store_attribution_confidence: number;
  merchant_offer_present: boolean;
  pivota_pdp_mentioned: boolean;
  pivota_pdp_url_present: boolean;
  pivota_pdp_url?: string;
  pivota_pdp_url_verified: boolean;
  pivota_product_object_id?: string;
  pivota_product_object_id_present: boolean;
  pivota_product_object_id_verified: boolean;
  pivota_offer_present: boolean;
  pivota_offer_ids: string[];
  pivota_offer_ids_present: boolean;
  pivota_offer_ids_verified: boolean;
  pivota_attribution_verified: boolean;
  pivota_attribution_failure_reason?: string;
  pivota_pdp_preflight_status?: PivotaAttributionPreflight["status"];
  pivota_pdp_preflight_status_code?: number | null;
  returned_urls: string[];
  returned_domains: string[];
  merchant_domain_found: boolean;
  merchant_pdp_url_found: boolean;
  merchant_pdp_url_exact_match: boolean;
  pivota_domain_found: boolean;
  pivota_pdp_url_found: boolean;
  pivota_pdp_url_exact_match: boolean;
  competitor_products: string[];
  competitor_domains: string[];
  buying_path_present: boolean;
  offer_signal_present: boolean;
  price_signal_present: boolean;
  availability_signal_present: boolean;
  discovery_type?: ScanMode | "organic" | "search_grounded" | "buying_path";
  grounding_sources?: string[];
  grounding_source_titles?: string[];
  grounding_search_queries?: string[];
  grounding_supports?: Array<Record<string, unknown>>;
  competitor_substitution_detected: boolean;
  purchase_path_present: boolean;
  purchase_path_type: PurchasePathType;
  channel_attribution: ChannelAttribution;
  missing_attributes_identified: string[];
  recommendation_rank: number | null;
  reasoning_summary: string;
  parser_confidence: number;
  schema_valid: boolean;
  validation_errors: string[];
};

export type ProductMatchLevel =
  | "no_match"
  | "brand_match"
  | "product_family_match"
  | "canonical_product_match"
  | "sku_match"
  | "variant_match";

export type MatchConfidence = "low" | "medium" | "high";

export type ProductMatchResult = Timestamped & {
  id: string;
  parsed_recommendation_id: string;
  merchant_id: string;
  store_id: string;
  product_entity_id?: string;
  raw_model_product_name?: string;
  canonical_product_name?: string;
  normalized_model_name?: string;
  normalized_canonical_name?: string;
  normalized_core_name?: string;
  optional_suffix_terms?: string[];
  brand_aliases?: string[];
  product_aliases?: string[];
  brand_match: boolean;
  core_product_match: boolean;
  suffix_terms_missing: string[];
  match_level: ProductMatchLevel;
  match_confidence: MatchConfidence;
  match_confidence_score: number;
  counts_for_visibility: boolean;
  counts_for_sku_exact_match: boolean;
  ambiguous_match: boolean;
  match_reason: string;
  matched_recommendation_rank?: number | null;
  matched_level: 0 | 1 | 2 | 3 | 4 | 5;
  matched_brand: boolean;
  matched_product_family: boolean;
  matched_product_entity: boolean;
  matched_sku: boolean;
  matched_variant: boolean;
  competitor_matches: Array<{
    competitor_name: string;
    product_name: string;
    confidence: number;
  }>;
};

export type DemandVisibilityScore = Timestamped & {
  id: string;
  job_id?: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  query_cluster_id: string;
  product_entity_id?: string;
  provider_scores: Record<
    string,
    {
      product_entity_visibility_score: number;
      merchant_store_visibility_score: number;
      pivota_pdp_visibility_score: number;
      pivota_offer_visibility_score: number;
      pivota_attribution_echo_rate: number;
      executable_offer_visibility_score: VisibilityScoreValue;
      organic_product_discovery_score: VisibilityScoreValue;
      organic_brand_discovery_score: VisibilityScoreValue;
      competitor_dominance_score: VisibilityScoreValue;
      search_grounded_merchant_pdp_discovery_score: VisibilityScoreValue;
      search_grounded_pivota_pdp_discovery_score: VisibilityScoreValue;
      buying_path_discovery_score: VisibilityScoreValue;
      offer_discovery_score: VisibilityScoreValue;
      url_match_accuracy_score: VisibilityScoreValue;
      visibility_score: number;
      recommendation_rank_score: number;
      competitor_substitution_score: number;
      attribute_readiness_score: number;
      pivota_pdp_readiness_score: number;
    }
  >;
  aggregate_scores: {
    product_entity_visibility_score: number;
    merchant_store_visibility_score: number;
    pivota_pdp_visibility_score: number;
    pivota_offer_visibility_score: number;
    pivota_attribution_echo_rate: number;
    executable_offer_visibility_score: VisibilityScoreValue;
    organic_product_discovery_score: VisibilityScoreValue;
    organic_brand_discovery_score: VisibilityScoreValue;
    competitor_dominance_score: VisibilityScoreValue;
    search_grounded_merchant_pdp_discovery_score: VisibilityScoreValue;
    search_grounded_pivota_pdp_discovery_score: VisibilityScoreValue;
    buying_path_discovery_score: VisibilityScoreValue;
    offer_discovery_score: VisibilityScoreValue;
    url_match_accuracy_score: VisibilityScoreValue;
    visibility_score: number;
    recommendation_rank_score: number;
    competitor_substitution_score: number;
    attribute_readiness_score: number;
    pivota_pdp_readiness_score: number;
  };
  score_explanations: Record<
    keyof DemandVisibilityScore["aggregate_scores"],
    {
      score: VisibilityScoreValue;
      formula: string;
      explanation: string;
      supporting_runs: string[];
    }
  >;
};

export type MerchantFacingIssueNarrative = {
  what_happened: string;
  what_ai_recommended_instead: string;
  why_this_likely_happened: string;
  where_to_fix: string;
  recommended_merchant_pdp_changes: string[];
  recommended_pivota_pdp_changes: string[];
  how_pivota_will_verify_the_fix: string;
};

export type AgenticGMVIssue = Timestamped & DemoFixtureMetadata & {
  id: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  store_url: string;
  platform: StorePlatform;
  source_agent: "demand_test_agent";
  issue_type: AgenticGMVIssueType;
  severity: Severity;
  status: AgenticGMVIssueStatus;
  affected_product_entities: string[];
  affected_skus: string[];
  affected_query_clusters: string[];
  evidence: Record<string, unknown>;
  blocker_eligible?: boolean;
  root_cause: string;
  fix_targets: FixTarget[];
  recommended_action: string;
  merchant_source_patch: Record<string, unknown>;
  merchant_variant_map_patch?: Record<string, unknown>;
  pivota_unified_pdp_patch: Record<string, unknown>;
  pivota_product_graph_patch?: Record<string, unknown>;
  pivota_query_mapping_patch?: Record<string, unknown>;
  product_understanding_diagnosis_id?: string;
  product_understanding_diagnosis_ids?: string[];
  offer_execution_diagnosis_id?: string;
  offer_execution_diagnosis_ids?: string[];
  checkout_verification_diagnosis_id?: string;
  checkout_verification_diagnosis_ids?: string[];
  merchant_offer_patch?: Record<string, unknown>;
  pivota_offer_patch?: Record<string, unknown>;
  inventory_sync_patch?: Record<string, unknown>;
  promo_state_patch?: Record<string, unknown>;
  offer_attachment_patch?: Record<string, unknown>;
  merchant_checkout_patch?: Record<string, unknown>;
  pivota_checkout_patch?: Record<string, unknown>;
  cart_handoff_payload_patch?: Record<string, unknown>;
  coupon_passthrough_patch?: Record<string, unknown>;
  checkout_attachment_patch?: Record<string, unknown>;
  checkout_domain_patch?: Record<string, unknown>;
  estimated_gmv_at_risk: number;
  gmv_estimation_method: string;
  estimated_gmv_at_risk_confidence: "low" | "medium" | "high";
  merchant_facing_summary: string;
  merchant_facing_narrative: MerchantFacingIssueNarrative;
  approval_required: boolean;
  verification_plan: {
    retest_query_clusters: string[];
    providers: ProviderName[];
    prompt_templates: string[];
    success_metric: "visibility_rate" | "attribute_readiness_score";
    target_improvement: string;
  };
};

export type IssueResolutionPlanStatus =
  | "draft"
  | "assigned"
  | "waiting_merchant_approval"
  | "in_progress"
  | "ready_for_retest"
  | "retesting"
  | "resolved"
  | "rejected"
  | "ignored";

export type IssueResolutionOwnerType =
  | "merchant"
  | "pivota_ops"
  | "pivota_eng"
  | "shared"
  | "human_review";

export type MerchantApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

export type PivotaInternalStatus =
  | "not_started"
  | "queued"
  | "in_progress"
  | "applied"
  | "blocked"
  | "completed";

export type RecommendedActionStatus =
  | "proposed"
  | "approved"
  | "applied"
  | "rejected"
  | "skipped";

export type RecommendedAction = {
  id: string;
  action_type: string;
  title: string;
  description: string;
  target_layer: FixTarget | string;
  owner_type?: IssueResolutionOwnerType;
  owner_team?: string;
  requires_merchant_approval: boolean;
  can_apply_automatically: boolean;
  patch_payload: Record<string, unknown>;
  status: RecommendedActionStatus;
  evidence: Record<string, unknown>;
  expected_impact: string;
};

export type PivotaOptimizationPatchType =
  | "pivota_discovery_signal_patch"
  | "pivota_source_reference_patch"
  | "pivota_product_intelligence_patch"
  | "pivota_product_schema_patch"
  | "pivota_offer_schema_patch"
  | "pivota_sitemap_submission"
  | "query_cluster_mapping_patch"
  | "competitor_substitute_graph_patch";

export type PivotaOptimizationTargetLayer =
  | "pivota_unified_pdp"
  | "pivota_product_graph"
  | "pivota_schema_markup"
  | "pivota_sitemap"
  | "pivota_query_mapping"
  | "pivota_competitor_graph";

export type PivotaOptimizationPatchStatus =
  | "proposed"
  | "applied"
  | "failed"
  | "skipped";

export type PivotaOptimizationPatch = Timestamped & {
  id: string;
  merchant_id: string;
  store_id: string;
  product_entity_id: string;
  pivota_pdp_url?: string;
  source_issue_ids: string[];
  resolution_plan_id: string;
  action_ids: string[];
  patch_type: PivotaOptimizationPatchType;
  target_layer: PivotaOptimizationTargetLayer;
  status: PivotaOptimizationPatchStatus;
  before_state: Record<string, unknown>;
  patch_payload: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  applied_at?: string;
  applied_by?: string;
  evidence: Record<string, unknown>;
  notes?: string;
  usage_event_ids?: string[];
  rerun_result?: Record<string, unknown>;
};

export type IssueResolutionPlan = Timestamped & {
  id: string;
  issue_id: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  blocker_type: string;
  source_agent: "resolution_workflow";
  status: IssueResolutionPlanStatus;
  severity: Severity;
  owner_type: IssueResolutionOwnerType;
  owner_team: string;
  fix_targets: FixTarget[];
  root_cause_hypothesis: string;
  recommended_actions: RecommendedAction[];
  approval_required: boolean;
  merchant_approval_status: MerchantApprovalStatus;
  pivota_internal_status: PivotaInternalStatus;
  verification_plan: Record<string, unknown>;
  retest_result?: Record<string, unknown>;
  usage_event_ids: string[];
  pivota_optimization_patch_ids?: string[];
  pivota_optimization_patches?: PivotaOptimizationPatch[];
};

export type ProductLayerComparison = {
  layer: "merchant_source" | "pivota_unified_pdp";
  product_title?: string;
  product_entity_id?: string;
  sku?: string;
  present_attributes: string[];
  missing_attributes: string[];
  pdp_url_present: boolean;
  agent_summary_present: boolean;
  findings: AttributeGap[];
};

export type AttributeGap = {
  attribute: string;
  layer: "merchant_source" | "pivota_unified_pdp" | "both";
  expected: string;
  observed?: unknown;
  severity: Severity;
  fix_target: FixTarget;
  recommendation: string;
};

export type EntityMappingFinding = {
  finding_type:
    | "no_issue"
    | "product_entity_mapping_issue"
    | "wrong_product_family"
    | "ambiguous_product_match"
    | "human_review_required";
  raw_model_product_name?: string;
  canonical_product_name?: string;
  product_entity_id?: string;
  match_level?: ProductMatchLevel;
  match_confidence?: MatchConfidence;
  evidence: string;
  fix_target: FixTarget;
};

export type VariantMappingFinding = {
  finding_type:
    | "no_issue"
    | "sku_variant_suffix_gap"
    | "variant_size_mismatch"
    | "ambiguous_variant_match";
  sku?: string;
  raw_model_product_name?: string;
  canonical_product_name?: string;
  suffix_terms_missing: string[];
  counts_for_visibility: boolean;
  counts_for_sku_exact_match: boolean;
  evidence: string;
  fix_target: FixTarget;
};

export type QueryMappingFinding = {
  finding_type: "no_issue" | "missing_query_mapping" | "weak_query_mapping";
  query_cluster_id: string;
  cluster_name: string;
  product_entity_id?: string;
  evidence: string;
  fix_target: FixTarget;
};

export type CompetitorMappingFinding = {
  finding_type:
    | "no_issue"
    | "missing_competitor_mapping"
    | "missing_substitute_mapping";
  competitor_name?: string;
  competitor_product?: string;
  evidence: string;
  fix_target: FixTarget;
};

export type ProductPatchRecommendation = {
  patch_type:
    | "merchant_source_patch"
    | "merchant_variant_map_patch"
    | "pivota_unified_pdp_patch"
    | "pivota_product_graph_patch"
    | "pivota_query_mapping_patch";
  target: FixTarget;
  patch: Record<string, unknown>;
  rationale: string;
};

export type ProductUnderstandingDiagnosis = Timestamped & {
  id: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  issue_id: string;
  source_agent: "product_understanding_agent";
  affected_product_entity_id?: string;
  affected_sku_ids: string[];
  affected_query_cluster_ids: string[];
  merchant_layer_findings: ProductLayerComparison[];
  pivota_layer_findings: ProductLayerComparison[];
  sku_variant_findings: VariantMappingFinding[];
  query_mapping_findings: QueryMappingFinding[];
  competitor_mapping_findings: CompetitorMappingFinding[];
  entity_mapping_findings: EntityMappingFinding[];
  root_cause_summary: string;
  refined_fix_targets: FixTarget[];
  patch_recommendations: ProductPatchRecommendation[];
  confidence: "low" | "medium" | "high";
  usage_event_ids: string[];
};

export type CouponStatus = "none" | "active" | "expired" | "disabled" | "unknown";
export type InventoryStatus = "in_stock" | "out_of_stock" | "low_stock" | "unknown";
export type OfferExecutionStatus =
  | "not_tested"
  | "ready"
  | "blocked"
  | "needs_sync"
  | "human_review";

export type MerchantOffer = Timestamped & DemoFixtureMetadata & {
  id: string;
  merchant_id: string;
  store_id: string;
  product_entity_id?: string;
  product_id: string;
  sku_id: string;
  merchant_sku_id?: string;
  source_product_id?: string;
  offer_id?: string;
  checkout_path_id?: string;
  price: number;
  currency: string;
  promo_price?: number | null;
  coupon_code?: string | null;
  coupon_status: CouponStatus;
  inventory_status: InventoryStatus;
  inventory_quantity?: number | null;
  expires_at?: string | null;
  source_url?: string;
  last_synced_at?: string | null;
};

export type PivotaOffer = Timestamped & DemoFixtureMetadata & {
  id: string;
  product_entity_id: string;
  pivota_unified_pdp_id: string;
  merchant_id: string;
  store_id: string;
  sku_id: string;
  price: number;
  currency: string;
  promo_price?: number | null;
  coupon_code?: string | null;
  coupon_status: CouponStatus;
  inventory_status: InventoryStatus;
  execution_status: OfferExecutionStatus;
  attached_to_pivota_pdp: boolean;
  last_verified_at?: string | null;
};

export type OfferIssueType =
  | "missing_offer"
  | "stale_offer"
  | "price_mismatch"
  | "promo_mismatch"
  | "expired_coupon"
  | "inventory_mismatch"
  | "offer_not_attached_to_pivota_pdp"
  | "offer_sku_variant_mismatch"
  | "human_review_required";

export type OfferMismatchFinding = {
  finding_type: OfferIssueType | "clean_offer";
  severity: Severity;
  field:
    | "offer"
    | "price"
    | "promo"
    | "coupon"
    | "inventory"
    | "expiration"
    | "attachment"
    | "sku_variant"
    | "freshness";
  merchant_value?: unknown;
  pivota_value?: unknown;
  evidence: string;
  fix_target: FixTarget;
};

export type OfferLayerComparison = {
  merchant_offer?: MerchantOffer | null;
  pivota_offer?: PivotaOffer | null;
  price_consistent: boolean;
  promo_consistent: boolean;
  coupon_consistent: boolean;
  inventory_consistent: boolean;
  expiration_valid: boolean;
  attached_to_pivota_pdp: boolean;
  sku_variant_consistent: boolean;
  findings: OfferMismatchFinding[];
};

export type OfferPatchRecommendation = {
  patch_type:
    | "merchant_offer_patch"
    | "pivota_offer_patch"
    | "inventory_sync_patch"
    | "promo_state_patch"
    | "offer_attachment_patch";
  target: FixTarget;
  patch: Record<string, unknown>;
  rationale: string;
};

export type OfferExecutionDiagnosis = Timestamped & {
  id: string;
  merchant_id: string;
  store_id: string;
  issue_id: string;
  product_entity_id?: string;
  sku_id?: string;
  merchant_offer_id?: string;
  pivota_offer_id?: string;
  source_agent: "offer_execution_agent";
  offer_layer_findings: OfferLayerComparison[];
  root_cause_summary: string;
  refined_fix_targets: FixTarget[];
  patch_recommendations: OfferPatchRecommendation[];
  offer_readiness_score: number;
  confidence: "low" | "medium" | "high";
  usage_event_ids: string[];
};

export type MerchantCheckoutPath = Timestamped & DemoFixtureMetadata & {
  id: string;
  merchant_id: string;
  store_id: string;
  merchant_offer_id: string;
  sku_id: string;
  checkout_url?: string | null;
  cart_url?: string | null;
  checkout_domain: string;
  required_params: string[];
  supported_params: string[];
  coupon_param_name?: string | null;
  quantity_param_name?: string | null;
  variant_param_name?: string | null;
  expires_at?: string | null;
  last_verified_at?: string | null;
  source: string;
};

export type PivotaCheckoutPath = Timestamped & DemoFixtureMetadata & {
  id: string;
  pivota_offer_id: string;
  product_entity_id: string;
  merchant_id: string;
  store_id: string;
  sku_id: string;
  checkout_url?: string | null;
  cart_handoff_payload: Record<string, unknown>;
  checkout_domain: string;
  required_params: string[];
  coupon_code?: string | null;
  quantity?: number | null;
  variant_id?: string | null;
  execution_status: OfferExecutionStatus;
  attached_to_pivota_offer: boolean;
  last_verified_at?: string | null;
};

export type CheckoutIssueType =
  | "missing_checkout_path"
  | "checkout_url_unreachable"
  | "stale_checkout_session"
  | "cart_handoff_missing_required_param"
  | "variant_param_missing"
  | "quantity_param_missing"
  | "coupon_param_missing"
  | "checkout_domain_mismatch"
  | "checkout_not_attached_to_pivota_offer"
  | "checkout_offer_sku_mismatch"
  | "human_review_required";

export type CheckoutPreflightStatus = "not_tested" | "passed" | "failed";

export type CheckoutReadinessFinding = {
  finding_type: CheckoutIssueType | "clean_checkout_path";
  severity: Severity;
  field:
    | "checkout_path"
    | "checkout_url"
    | "cart_handoff"
    | "variant"
    | "quantity"
    | "coupon"
    | "domain"
    | "session"
    | "attachment"
    | "sku_variant";
  merchant_value?: unknown;
  pivota_value?: unknown;
  evidence: string;
  fix_target: FixTarget;
};

export type CheckoutPathComparison = {
  merchant_checkout_path?: MerchantCheckoutPath | null;
  pivota_checkout_path?: PivotaCheckoutPath | null;
  checkout_url_preflight_status: CheckoutPreflightStatus;
  checkout_url_status_code?: number | null;
  cart_handoff_required_params: string[];
  missing_params: string[];
  coupon_passthrough_consistent: boolean;
  domain_consistent: boolean;
  session_fresh: boolean;
  attached_to_pivota_offer: boolean;
  sku_variant_consistent: boolean;
  findings: CheckoutReadinessFinding[];
};

export type CheckoutPatchRecommendation = {
  patch_type:
    | "merchant_checkout_patch"
    | "pivota_checkout_patch"
    | "cart_handoff_payload_patch"
    | "coupon_passthrough_patch"
    | "checkout_attachment_patch"
    | "checkout_domain_patch";
  target: FixTarget;
  patch: Record<string, unknown>;
  rationale: string;
};

export type CheckoutVerificationDiagnosis = Timestamped & {
  id: string;
  merchant_id: string;
  store_id: string;
  issue_id: string;
  product_entity_id?: string;
  sku_id?: string;
  merchant_offer_id?: string;
  pivota_offer_id?: string;
  merchant_checkout_path_id?: string;
  pivota_checkout_path_id?: string;
  source_agent: "checkout_verification_agent";
  checkout_layer_findings: CheckoutPathComparison[];
  root_cause_summary: string;
  refined_fix_targets: FixTarget[];
  patch_recommendations: CheckoutPatchRecommendation[];
  checkout_readiness_score: number;
  confidence: "low" | "medium" | "high";
  usage_event_ids: string[];
};

export type GMVAssuranceDimensionStatus =
  | "passed"
  | "needs_work"
  | "blocked"
  | "not_configured"
  | "not_tested";

export type GMVAssuranceReadinessLevel =
  | "blocked"
  | "needs_work"
  | "ready_for_agentic_checkout"
  | "monitoring";

export type GMVAssuranceDimensionSummary = {
  status: GMVAssuranceDimensionStatus;
  score?: VisibilityScoreValue;
  issue_id?: string;
  diagnosis_id?: string;
  recommended_next_action: string;
  evidence: string;
};

export type GMVAssuranceBlocker = {
  blocker_type: string;
  severity: Severity;
  affected_layer: string;
  fix_target?: FixTarget;
  issue_id?: string;
  diagnosis_id?: string;
  resolution_plan_id?: string;
  recommended_action: string;
};

export type GMVAssuranceUsageSummary = {
  ai_test_credits: number;
  product_understanding_credits: number;
  offer_verification_credits: number;
  checkout_verification_credits: number;
  resolution_plan_credits?: number;
  total_preview_credits: number;
  billing_mode: "preview_only";
  billing_status: "not_invoiced";
};

export type GMVAssuranceSnapshot = Timestamped & {
  id: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  product_entity_id?: string;
  issue_ids: string[];
  assurance_scope?: "full_assurance" | "readiness_only";
  discovery_readiness_summary?: {
    organic_product_discovery_status: GMVAssuranceDimensionSummary;
    merchant_pdp_discovery_status: GMVAssuranceDimensionSummary;
    pivota_pdp_discovery_status: GMVAssuranceDimensionSummary;
    buying_path_discovery_status: GMVAssuranceDimensionSummary;
    competitor_dominance_status: GMVAssuranceDimensionSummary;
  };
  demand_test_summary: {
    scan_mode: ScanMode;
    product_visibility_status: GMVAssuranceDimensionSummary;
    merchant_attribution_status: GMVAssuranceDimensionSummary;
    pivota_attribution_status: GMVAssuranceDimensionSummary;
    latest_score_id?: string;
  };
  product_understanding_summary: {
    product_data_readiness_status: GMVAssuranceDimensionSummary;
    sku_variant_readiness_status: GMVAssuranceDimensionSummary;
    latest_diagnosis_id?: string;
  };
  offer_execution_summary: {
    offer_readiness_status: GMVAssuranceDimensionSummary;
    latest_diagnosis_id?: string;
  };
  checkout_verification_summary: {
    checkout_readiness_status: GMVAssuranceDimensionSummary;
    latest_diagnosis_id?: string;
  };
  overall_readiness_score: number;
  readiness_level: GMVAssuranceReadinessLevel;
  top_blockers: GMVAssuranceBlocker[];
  recommended_next_actions: string[];
  usage_summary: GMVAssuranceUsageSummary;
  pivota_discovery_progress?: PivotaDiscoveryProgress;
};

export type RetestPreparation = Timestamped & {
  id: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  issue_id: string;
  status: "prepared" | "consumed";
  query_cluster_ids: string[];
  providers: ProviderName[];
  prompt_templates: string[];
  repetitions: number;
  source_job_id?: string;
  planned_job_type: "retest";
  estimated_credits: number;
  credits_remaining_before_retest: number;
  estimated_overage_credits: number;
  billing_mode: "preview_only";
  billing_status: "not_invoiced";
};

export type VerificationScoreSnapshot = {
  score_ids: string[];
  aggregate_scores: DemandVisibilityScore["aggregate_scores"];
  estimated_gmv_at_risk: number;
  gmv_estimation_method: string;
  estimated_gmv_at_risk_confidence: "low" | "medium" | "high";
};

export type VerificationScoreDelta = Partial<
  Record<keyof DemandVisibilityScore["aggregate_scores"] | "estimated_gmv_at_risk", number>
>;

export type VerificationRun = Timestamped & {
  id: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  issue_id: string;
  source_agent: "demand_test_agent";
  query_cluster_ids: string[];
  provider_set: ProviderName[];
  prompt_template_ids: string[];
  repetition_count: number;
  before_scores: VerificationScoreSnapshot;
  after_scores: VerificationScoreSnapshot;
  score_delta: VerificationScoreDelta;
  before_issue_snapshot: AgenticGMVIssue;
  after_result_snapshot: Record<string, unknown>;
  status: "queued" | "running" | "completed" | "failed";
  usage_event_ids: string[];
  completed_at?: string;
  retest_job_id?: string;
  before_score_id?: string;
  after_score_id?: string;
  result?: {
    before_visibility_score: number;
    after_visibility_score: number;
    before_competitor_substitution_score: number;
    after_competitor_substitution_score: number;
  };
};

export type UsageEvent = Timestamped & {
  id: string;
  idempotency_key: string;
  merchant_id: string;
  store_id: string;
  scan_target_id: string;
  event_type:
    | "ai_test_credit"
    | "product_understanding_credit"
    | "offer_verification_credit"
    | "checkout_verification_credit"
    | "resolution_plan_credit"
    | "pivota_optimization_credit";
  quantity: number;
  source_agent:
    | "demand_test_agent"
    | "product_understanding_agent"
    | "offer_execution_agent"
    | "checkout_verification_agent"
    | "resolution_workflow"
    | "pivota_optimization_workflow";
  agent_type:
    | "demand_test_agent"
    | "product_understanding_agent"
    | "offer_execution_agent"
    | "checkout_verification_agent"
    | "resolution_workflow"
    | "pivota_optimization_workflow";
  workflow_type:
    | "demand_scan"
    | "retest"
    | "product_diagnosis"
    | "offer_readiness"
    | "checkout_readiness"
    | "issue_resolution"
    | "pivota_discoverability_optimization";
  scan_mode: ScanMode;
  provider: UsageProviderName;
  model: string;
  query_cluster_id: string;
  prompt_template_id: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd?: number;
  billable_amount_usd?: number;
  billable: boolean;
  billing_mode: "preview_only" | "metered";
  billing_status: "not_invoiced" | "pending_invoice" | "invoiced" | "void";
};

export type DemoFixture = Timestamped & {
  id: string;
  fixture_id: string;
  preset: DemoFixturePreset;
  demo_fixture: true;
  created_by: "internal";
  expires_at: string;
  ttl_minutes: number;
  environment: string;
  cleanup_status: DemoFixtureCleanupStatus;
  records: Array<{
    fixture_type: DemoFixtureType;
    record_id: string;
    parent_record_id?: string;
  }>;
};

export type ProductionValidationRunStatus =
  | "created"
  | "running"
  | "completed"
  | "failed"
  | "deleted";

export type PilotProductEntityProvisioningRunStatus =
  | "draft"
  | "source_validated"
  | "product_entity_created"
  | "product_entity_bound"
  | "published"
  | "audit_passed"
  | "failed";

export type PilotProductEntityProvisioningRun = Timestamped & {
  id: string;
  status: PilotProductEntityProvisioningRunStatus;
  environment: string;
  merchant_id: string;
  merchant_name: string;
  store_url: string;
  merchant_pdp_url: string;
  product_name: string;
  brand: string;
  sku_name?: string;
  category: string;
  market: string;
  language: string;
  currency: string;
  merchant_product_attributes?: Record<string, unknown>;
  merchant_offer_input?: Record<string, unknown>;
  source_references: SourceReference[];
  external_seed_ids: string[];
  product_entity_id?: string;
  canonical_product_slug?: string;
  canonical_pivota_pdp_url?: string;
  merchant_offer_ids: string[];
  pivota_offer_ids: string[];
  binding_audit_id?: string;
  binding_audit?: PivotaPDPIndexabilityAudit;
  indexability_audit?: PivotaPDPIndexabilityAudit;
  completed_at?: string;
  failure_reason?: string;
};

export type ProductEntityPdpContentStatus =
  | "ready"
  | "no_content"
  | "weak_content"
  | "failed";

export type ProductEntityIndexabilityStatus =
  | "ready"
  | "needs_work"
  | "failed"
  | "not_audited";

export type ProductEntityGoogleIndexStatus =
  | "unknown"
  | "not_on_google"
  | "indexed"
  | "excluded"
  | "inspection_error";

export type ProductEntityGeminiSearchGroundedStatus =
  | "not_tested"
  | "not_found"
  | "found"
  | "error";

export type ProductEntityIndexRecord = Timestamped & {
  id: string;
  product_entity_id: string;
  canonical_url: string;
  external_seed_id?: string;
  external_seed_ids?: string[];
  source_product_id?: string;
  product_name?: string;
  brand?: string;
  category?: string;
  source_updated_at?: string;
  last_content_verified_at?: string;
  pdp_content_status: ProductEntityPdpContentStatus;
  indexability_status: ProductEntityIndexabilityStatus;
  sitemap_eligible: boolean;
  google_index_status: ProductEntityGoogleIndexStatus;
  gemini_search_grounded_status: ProductEntityGeminiSearchGroundedStatus;
  last_search_grounded_score?: VisibilityScoreValue;
  last_search_grounded_at?: string;
  last_returned_urls?: string[];
  last_indexability_audit_at?: string;
  failure_reasons: string[];
  audit_evidence?: Record<string, unknown>;
};

export type ProductEntityIndexBatchStage =
  | "sync"
  | "verify_content"
  | "audit"
  | "gemini_rerun";

export type ProductEntityIndexBatchRunStatus =
  | "created"
  | "running"
  | "completed"
  | "failed";

export type ProductEntityIndexBatchRun = Timestamped & {
  id: string;
  status: ProductEntityIndexBatchRunStatus;
  stage: ProductEntityIndexBatchStage;
  stages_completed: ProductEntityIndexBatchStage[];
  next_page?: number;
  next_cursor?: string;
  has_more?: boolean;
  records_processed: number;
  limits: {
    sync_limit?: number;
    page_size?: number;
    max_pages?: number;
    sync_source?: string;
    source_market?: string;
    source_tool?: string;
    verify_limit?: number;
    verify_concurrency?: number;
    audit_limit?: number;
    audit_concurrency?: number;
    gemini_limit?: number;
    gemini_strategy?: "default" | "priority";
    include_not_found?: boolean;
  };
  last_result?: Record<string, unknown>;
  result_summary?: Record<string, unknown>;
  error?: string;
  completed_at?: string;
};

export type ProductEntityVariantReviewPlanStatus =
  | "proposed"
  | "in_review"
  | "approved_for_mapping"
  | "blocked"
  | "completed"
  | "skipped";

export type ProductEntityVariantReviewPlan = Timestamped & {
  id: string;
  plan_type: "product_entity_variant_family_review";
  status: ProductEntityVariantReviewPlanStatus;
  group_id: string;
  brand: string;
  normalized_product_family: string;
  canonical_family_slug: string;
  family_product_name: string;
  product_entity_count: number;
  external_seed_count: number;
  source_product_entity_ids: string[];
  source_external_seed_ids: string[];
  risk_flags: string[];
  review_checklist: string[];
  sku_variant_map_review_plan: Record<string, unknown>;
  offer_merge_policy: Record<string, unknown>;
  recommended_action: string;
  merge_allowed_without_review: false;
  auto_apply_allowed: false;
  mutation_performed: false;
  reviewer?: string;
  review_notes?: string;
  review_decision?: {
    decision_type: "canonical_family_with_sku_variant_map";
    decision_status: "approved_for_mapping" | "blocked";
    decided_by?: string;
    decided_at: string;
    audit_summary: Record<string, unknown>;
    canonical_family: Record<string, unknown>;
    sku_variant_map_rules: Record<string, unknown>;
    merchant_offer_attachment_rules: Record<string, unknown>;
    source_alias_rules: Record<string, unknown>;
    approval_conditions: string[];
    blocked_reasons: string[];
    mutation_performed: false;
  };
};

export type PivotaIndexingTaskType =
  | "submit_sitemap"
  | "request_indexing"
  | "validate_search_console"
  | "add_internal_link"
  | "wait_for_indexing_window"
  | "scheduled_search_grounded_rerun"
  | "rerun_search_grounded_discovery";

export type PivotaIndexingTaskStatus =
  | "proposed"
  | "in_progress"
  | "completed"
  | "blocked"
  | "skipped";

export type PivotaUrlInspectionStatus =
  | "not_checked"
  | "inspectable"
  | "indexed"
  | "not_indexed"
  | "indexing_requested"
  | "blocked"
  | "unknown";

export type PivotaIndexingEvidenceStatus =
  | "not_started"
  | "search_console_needed"
  | "sitemap_submitted"
  | "indexing_requested"
  | "waiting_for_indexing"
  | "rerun_due"
  | "uplift_verified"
  | "no_uplift_yet";

export type PivotaIndexingTaskEvidence = {
  search_console_property_verified?: boolean;
  sitemap_submitted?: boolean;
  sitemap_url?: string;
  url_inspection_status?: PivotaUrlInspectionStatus;
  google_selected_canonical?: string;
  user_declared_canonical?: string;
  indexing_requested?: boolean;
  indexing_requested_at?: string;
  operator?: string;
  evidence_note?: string;
  screenshot_or_reference_url?: string;
  search_console_verified_at?: string;
  next_rerun_at?: string;
  rerun_window?: "T+24h" | "T+72h" | "T+7d" | string;
  delay_hours?: number;
  issue_id?: string;
  issue_type?: string;
  scan_target_id?: string;
  production_validation_run_id?: string;
  last_search_grounded_discovery_score?: VisibilityScoreValue;
  last_returned_urls?: string[];
  uplift_claim_allowed?: boolean;
  no_uplift_claim_allowed?: boolean;
  [key: string]: unknown;
};

export type PivotaIndexingTask = Timestamped & {
  id: string;
  product_entity_id: string;
  canonical_pivota_pdp_url: string;
  task_type: PivotaIndexingTaskType;
  status: PivotaIndexingTaskStatus;
  evidence?: PivotaIndexingTaskEvidence;
  created_at: string;
  completed_at?: string;
};

export type PivotaDiscoveryProgressStepStatus =
  | "completed"
  | "in_progress"
  | "not_started"
  | "blocked"
  | "not_applicable"
  | "not_yet_verified";

export type PivotaDiscoveryProgressStep = {
  step_key:
    | "pivota_pdp_published"
    | "product_entity_binding_verified"
    | "product_schema_added"
    | "offer_schema_added"
    | "merchant_source_reference_added"
    | "sitemap_includes_canonical_pdp"
    | "search_console_sitemap_submitted"
    | "url_inspection_indexing_requested"
    | "waiting_for_indexing_window"
    | "search_grounded_gemini_returned_pivota_pdp"
    | "uplift_verified";
  label: string;
  status: PivotaDiscoveryProgressStepStatus;
  summary: string;
};

export type PivotaDiscoveryProgress = {
  status: PivotaIndexingEvidenceStatus;
  summary: string;
  next_recommended_operator_action: string;
  next_rerun_at?: string;
  last_search_grounded_discovery_score: VisibilityScoreValue;
  last_returned_urls: string[];
  uplift_claim_allowed: boolean;
  steps: PivotaDiscoveryProgressStep[];
};

export type ProductionValidationUrlPreflight = {
  url?: string;
  status: "not_provided" | "passed" | "failed";
  status_code?: number | null;
  final_url?: string;
  error?: string;
  checked_at: string;
};

export type ProductionValidationReport = {
  target_summary: {
    production_validation_run_id: string;
    merchant_name: string;
    store_url: string;
    merchant_pdp_url: string;
    pivota_pdp_url?: string;
    product_name: string;
    brand?: string;
    sku_name?: string;
    category?: string;
    market: string;
    language: string;
    currency: string;
    product_entity_id?: string;
    canonical_product_slug?: string;
    canonical_pivota_pdp_url?: string;
    external_seed_id?: string;
    merchant_product_id?: string;
    merchant_sku_id?: string;
    merchant_offer_id?: string;
    pivota_offer_id?: string;
    scan_target_id?: string;
  };
  url_preflight_results: {
    merchant_pdp: ProductionValidationUrlPreflight;
    pivota_pdp: ProductionValidationUrlPreflight;
    checkout: ProductionValidationUrlPreflight;
  };
  demand_test_summary: {
    modes_run: Array<{
      scan_mode: ScanMode;
      job_id: string;
      aggregate_scores: ReturnTypePlaceholderDemandAggregate;
      issue_ids: string[];
    }>;
    skipped_modes: ScanMode[];
  };
  product_understanding_summary: {
    diagnosis_ids: string[];
    root_causes: string[];
  };
  offer_execution_summary: {
    diagnosis_ids: string[];
    findings: string[];
    readiness_scores: number[];
  };
  checkout_verification_summary: {
    diagnosis_ids: string[];
    findings: string[];
    readiness_scores: number[];
  };
  pivota_pdp_quality_summary?: {
    status: "not_provided" | "passed" | "needs_work";
    findings: string[];
    issue_id?: string;
  };
  gmv_assurance_snapshot?: GMVAssuranceSnapshot;
  top_blockers: GMVAssuranceBlocker[];
  next_best_action: string;
  usage_summary: GMVAssuranceUsageSummary;
  billing_mode: "preview_only";
  billing_status: "not_invoiced";
};

export type MerchantFacingReportStatus =
  | "draft"
  | "reviewed"
  | "approved_to_share"
  | "shared"
  | "archived";

export type MerchantFacingDiscoveryReportStatus =
  | "found"
  | "not_found"
  | "not_configured"
  | "not_tested";

export type DiscoverabilityAuditFindingType =
  | "indexability_gap"
  | "structured_data_gap"
  | "canonical_gap"
  | "thin_content_gap"
  | "missing_product_schema"
  | "missing_offer_schema"
  | "missing_seller_signal"
  | "missing_price_or_availability_signal"
  | "missing_source_reference"
  | "sitemap_gap"
  | "wrong_url_returned"
  | "pivota_product_identity_gap"
  | "pivota_product_intelligence_gap"
  | "pivota_offer_reference_gap"
  | "similar_card_missing_highlight";

export type DiscoverabilityAuditFinding = {
  finding_type: DiscoverabilityAuditFindingType;
  severity: Severity;
  summary: string;
  recommended_action_types: string[];
};

export type DiscoverabilityAuditSignals = {
  http_status?: number;
  robots_meta?: string;
  canonical_url?: string;
  title?: string;
  h1?: string;
  visible_product_name?: string;
  visible_brand?: string;
  visible_description?: string;
  json_ld_types?: string[];
  product_jsonld_present?: boolean;
  offer_jsonld_present?: boolean;
  aggregate_offer_jsonld_present?: boolean;
  price_present?: boolean;
  currency_present?: boolean;
  availability_present?: boolean;
  seller_present?: boolean;
  sitemap_included?: boolean;
  source_reference_present?: boolean;
  offer_source_url_present?: boolean;
  product_intelligence_populated?: boolean;
  similar_card_highlight_present?: boolean;
  product_object_id_present?: boolean;
};

export type DiscoverabilityAuditInput = {
  merchant_pdp_url?: string;
  pivota_pdp_url?: string;
  product_name: string;
  brand?: string;
  sku?: string;
  category?: string;
  merchant_domain?: string;
  expected_merchant_pdp_url?: string;
  expected_pivota_pdp_url?: string;
  returned_urls?: string[];
  returned_domains?: string[];
  grounding_sources?: string[];
  issue_types?: AgenticGMVIssueType[];
  preflight_status?: ProductionValidationUrlPreflight["status"];
  preflight_status_code?: number | null;
  signals?: DiscoverabilityAuditSignals;
};

export type MerchantPDPDiscoverabilityAudit = {
  audit_type: "merchant_pdp";
  url?: string;
  expected_url?: string;
  status: "passed" | "needs_work" | "not_tested";
  summary: string;
  checks: Record<string, "passed" | "needs_work" | "unknown" | "not_applicable">;
  findings: DiscoverabilityAuditFinding[];
  recommended_action_types: string[];
};

export type PivotaPDPDiscoverabilityAudit = {
  audit_type: "pivota_pdp";
  url?: string;
  expected_url?: string;
  status: "passed" | "needs_work" | "not_tested";
  summary: string;
  checks: Record<string, "passed" | "needs_work" | "unknown" | "not_applicable">;
  findings: DiscoverabilityAuditFinding[];
  recommended_action_types: string[];
};

export type PivotaPDPIndexabilityFindingType =
  | "http_status_failed"
  | "robots_blocked"
  | "noindex"
  | "missing_canonical"
  | "canonical_mismatch"
  | "missing_server_rendered_identity"
  | "thin_content"
  | "missing_product_jsonld"
  | "incomplete_product_jsonld"
  | "missing_offer_jsonld"
  | "incomplete_offer_jsonld"
  | "missing_source_reference"
  | "missing_product_object_id"
  | "missing_sitemap_entry"
  | "auth_wall_detected"
  | "product_entity_missing_source_seed"
  | "product_entity_missing_merchant_source"
  | "product_entity_missing_merchant_offer"
  | "external_seed_used_as_canonical"
  | "canonical_product_url_missing"
  | "canonical_url_points_to_external_seed"
  | "product_entity_binding_mismatch"
  | "rendered_identity_mismatch"
  | "offer_attached_to_wrong_product_entity";

export type PivotaPDPIndexabilityFinding = {
  finding_type: PivotaPDPIndexabilityFindingType;
  severity: Severity;
  summary: string;
  recommended_fix: PivotaOptimizationPatchType | "pivota_indexability_patch";
};

export type PivotaPDPIndexabilityAudit = {
  audit_type: "pivota_pdp_indexability";
  url: string;
  audit_status: "passed" | "needs_work" | "failed";
  findings: PivotaPDPIndexabilityFinding[];
  recommended_fixes: Array<PivotaOptimizationPatchType | "pivota_indexability_patch">;
  raw_safe_evidence: {
    requested_url: string;
    final_url?: string;
    http_status?: number | null;
    robots_url?: string;
    robots_status?: number | null;
    robots_summary: string;
    robots_blocked: boolean;
    meta_robots?: string;
    canonical_url?: string;
    title?: string;
    h1?: string;
    product_name_visible: boolean;
    brand_visible: boolean;
    description_visible: boolean;
    jsonld_types: string[];
    product_jsonld_present: boolean;
    product_jsonld_fields: Record<string, boolean>;
    offer_jsonld_present: boolean;
    offer_jsonld_fields: Record<string, boolean>;
    merchant_source_reference_visible: boolean;
    source_merchant_pdp_url_visible: boolean;
    product_object_id_visible: boolean;
    sitemap_url?: string;
    sitemap_status?: number | null;
    product_sitemap_status?: number | null;
    sitemap_includes_pdp_url: boolean;
    internal_product_links_count: number;
    auth_gate_detected: boolean;
    html_size: number;
    requested_product_path_id?: string;
    expected_product_entity_id?: string;
    canonical_product_slug?: string;
    expected_canonical_url?: string;
    rendered_product_entity_id?: string;
    rendered_product_jsonld_url?: string;
    rendered_product_jsonld_name?: string;
    rendered_product_jsonld_brand?: string;
    rendered_offer_ids: string[];
    expected_external_seed_id?: string;
    expected_merchant_offer_id?: string;
    expected_pivota_offer_id?: string;
    external_seed_alias_detected: boolean;
    external_seed_used_as_canonical: boolean;
    canonical_url_points_to_external_seed: boolean;
    source_reference_external_seed_present: boolean;
    source_reference_merchant_pdp_present: boolean;
    merchant_offer_attached: boolean;
  };
};

export type MerchantFacingValidationReport = Timestamped & {
  id: string;
  production_validation_run_id: string;
  merchant_id?: string;
  store_id?: string;
  scan_target_id?: string;
  report_type: "agent_center_production_validation";
  audience: "merchant" | "investor" | "internal_review";
  status: MerchantFacingReportStatus;
  report_status: MerchantFacingReportStatus;
  reviewed_at?: string;
  approved_to_share_at?: string;
  reviewed_by?: string;
  approved_by?: string;
  title: string;
  executive_summary: string;
  discovery_vs_readiness: string;
  discovery_result: {
    organic_product_discovery: {
      status: MerchantFacingDiscoveryReportStatus;
      score?: VisibilityScoreValue;
      summary: string;
      issue_id?: string;
      evidence?: string;
    };
    organic_brand_discovery: {
      status: MerchantFacingDiscoveryReportStatus;
      score?: VisibilityScoreValue;
      summary: string;
      issue_id?: string;
      evidence?: string;
    };
    competitor_dominance: {
      status: GMVAssuranceDimensionStatus;
      score?: VisibilityScoreValue;
      summary: string;
    };
    search_grounded_merchant_pdp_discovery: {
      status: MerchantFacingDiscoveryReportStatus;
      score?: VisibilityScoreValue;
      summary: string;
      returned_urls: string[];
      grounding_sources_count: number;
      issue_id?: string;
      evidence?: string;
    };
    search_grounded_pivota_pdp_discovery: {
      status: MerchantFacingDiscoveryReportStatus;
      score?: VisibilityScoreValue;
      summary: string;
      returned_urls: string[];
      grounding_sources_count: number;
      issue_id?: string;
      evidence?: string;
    };
    buying_path_discovery: {
      status: MerchantFacingDiscoveryReportStatus;
      score?: VisibilityScoreValue;
      summary: string;
      issue_id?: string;
      evidence?: string;
    };
    url_match_accuracy: {
      status: MerchantFacingDiscoveryReportStatus;
      score?: VisibilityScoreValue;
      summary: string;
      issue_id?: string;
      evidence?: string;
    };
    interpretation: string;
  };
  readiness_result: {
    contextual_merchant_attribution: {
      status: GMVAssuranceDimensionStatus;
      score?: VisibilityScoreValue;
      summary: string;
    };
    contextual_pivota_attribution: {
      status: GMVAssuranceDimensionStatus;
      score?: VisibilityScoreValue;
      summary: string;
    };
    product_sku_readiness: {
      status: GMVAssuranceDimensionStatus;
      summary: string;
    };
    offer_readiness: {
      status: GMVAssuranceDimensionStatus;
      summary: string;
    };
    checkout_readiness: {
      status: GMVAssuranceDimensionStatus;
      summary: string;
    };
  };
  discovery_evidence: {
    tested_organic_queries: Array<{
      query: string;
      query_cluster_id: string;
      returned_products: Array<{
        brand: string;
        name: string;
        rank: number;
        reason?: string;
      }>;
      returned_brands: string[];
      returned_competitors: string[];
      merchant_product_appeared: boolean;
      merchant_brand_appeared: boolean;
    }>;
    returned_products: string[];
    returned_brands: string[];
    returned_competitors: string[];
    competitor_rank_summary: string;
    missing_merchant_product_summary: string;
    likely_competitor_advantage_summary: string;
    discovery_interpretation: string;
    competitor_dominance_evidence: {
      dominant_competitors: string[];
      competitor_products: string[];
      query_clusters_where_competitors_won: string[];
      likely_reasons: string[];
      recommended_differentiation_angles: string[];
    };
  };
  discoverability_fix_plan: {
    summary: string;
    merchant_pdp_audit: MerchantPDPDiscoverabilityAudit;
    pivota_pdp_audit: PivotaPDPDiscoverabilityAudit;
    returned_url_evidence_summary: string;
    merchant_owned_fixes: string[];
    pivota_owned_fixes: string[];
    shared_fixes: string[];
    retest_plan: string[];
  };
  pivota_owned_optimization_applied: {
    status: "not_applied" | "applied" | "applied_no_uplift" | "applied_with_uplift";
    summary: string;
    actions_applied: Array<{
      patch_id: string;
      patch_type: PivotaOptimizationPatchType;
      target_layer: PivotaOptimizationTargetLayer;
      applied_at?: string;
      evidence?: string;
    }>;
    before_state: Record<string, unknown>;
    after_state: Record<string, unknown>;
    validation_rerun_result?: Record<string, unknown>;
    score_deltas: Array<{
      score_name: string;
      before: VisibilityScoreValue;
      after: VisibilityScoreValue;
      delta?: number;
    }>;
    blockers_cleared: string[];
    blockers_remaining: string[];
  };
  pivota_discovery_progress: PivotaDiscoveryProgress;
  tested_product: {
    merchant_name: string;
    store_url: string;
    product_name: string;
    brand?: string;
    sku_name?: string;
    category?: string;
    market: string;
    language: string;
    currency: string;
  };
  path_readiness: {
    discoverability: {
      status: GMVAssuranceDimensionStatus;
      summary: string;
      organic_product_discovery?: VisibilityScoreValue;
      merchant_pdp_discovery?: VisibilityScoreValue;
      pivota_pdp_discovery?: VisibilityScoreValue;
      buying_path_discovery?: VisibilityScoreValue;
      competitor_dominance?: VisibilityScoreValue;
    };
    product_sku_readiness: {
      status: GMVAssuranceDimensionStatus;
      product_data_status: GMVAssuranceDimensionStatus;
      sku_variant_status: GMVAssuranceDimensionStatus;
      summary: string;
    };
    merchant_owned_path: {
      merchant_pdp_url: string;
      preflight_status: ProductionValidationUrlPreflight["status"];
      attribution_status: GMVAssuranceDimensionStatus;
      offer_source_status: GMVAssuranceDimensionStatus;
      checkout_path_status: GMVAssuranceDimensionStatus;
      summary: string;
    };
    pivota_agent_facing_path: {
      pivota_pdp_url?: string;
      canonical_pivota_pdp_url?: string;
      product_entity_id?: string;
      canonical_product_slug?: string;
      external_seed_id?: string;
      merchant_offer_id?: string;
      pivota_offer_id?: string;
      preflight_status: ProductionValidationUrlPreflight["status"];
      attribution_status: GMVAssuranceDimensionStatus;
      offer_state_status: GMVAssuranceDimensionStatus;
      checkout_handoff_status: GMVAssuranceDimensionStatus;
      summary: string;
    };
    offer_readiness: {
      status: GMVAssuranceDimensionStatus;
      readiness_scores: number[];
      findings: string[];
      summary: string;
    };
    checkout_readiness: {
      status: GMVAssuranceDimensionStatus;
      readiness_scores: number[];
      findings: string[];
      summary: string;
    };
  };
  blockers: Array<{
    blocker_type: string;
    severity: Severity;
    affected_layer: string;
    issue_id?: string;
    resolution_plan_id?: string;
    root_cause?: string;
    recommended_action: string;
  }>;
  recommended_fixes: Array<{
    title: string;
    owner_type?: IssueResolutionOwnerType;
    owner_team?: string;
    approval_required: boolean;
    target_layer: string;
    action_status?: RecommendedActionStatus;
    expected_impact?: string;
  }>;
  recommended_fix_sections: {
    merchant_owned_fixes: string[];
    pivota_owned_fixes: string[];
    shared_fixes: string[];
  };
  retest_plan: string[];
  usage_statement: {
    ai_test_credits: number;
    product_understanding_credits: number;
    offer_verification_credits: number;
    checkout_verification_credits: number;
    resolution_plan_credits?: number;
    total_preview_credits: number;
    billing_mode: "preview_only";
    billing_status: "not_invoiced";
    merchant_copy: string;
  };
  v1_does_not_prove: string[];
  safety_warnings: Array<{
    warning_type: string;
    severity: "info" | "warning";
    message: string;
  }>;
  sharing_notes: string[];
  source_summary: {
    issue_ids: string[];
    product_diagnosis_ids: string[];
    offer_diagnosis_ids: string[];
    checkout_diagnosis_ids: string[];
    gmv_assurance_snapshot_id?: string;
  };
};

type ReturnTypePlaceholderDemandAggregate = {
  product_entity_visibility_score: number;
  merchant_store_visibility_score: number;
  pivota_pdp_visibility_score: number;
  pivota_offer_visibility_score: number;
  pivota_attribution_echo_rate: number;
  executable_offer_visibility_score: VisibilityScoreValue;
  organic_product_discovery_score: VisibilityScoreValue;
  organic_brand_discovery_score: VisibilityScoreValue;
  competitor_dominance_score: VisibilityScoreValue;
  search_grounded_merchant_pdp_discovery_score: VisibilityScoreValue;
  search_grounded_pivota_pdp_discovery_score: VisibilityScoreValue;
  buying_path_discovery_score: VisibilityScoreValue;
  offer_discovery_score: VisibilityScoreValue;
  url_match_accuracy_score: VisibilityScoreValue;
  visibility_score: number;
  recommendation_rank_score: number;
  competitor_substitution_score: number;
  attribute_readiness_score: number;
  pivota_pdp_readiness_score: number;
  estimated_gmv_at_risk?: number;
  gmv_estimation_method?: string;
  estimated_gmv_at_risk_confidence?: "low" | "medium" | "high";
};

export type ProductionValidationRun = Timestamped & {
  id: string;
  status: ProductionValidationRunStatus;
  environment: string;
  merchant_name: string;
  store_url: string;
  merchant_pdp_url: string;
  product_name: string;
  brand?: string;
  sku_name?: string;
  category?: string;
  market: string;
  language: string;
  currency: string;
  pivota_product_entity_id?: string;
  canonical_product_slug?: string;
  canonical_pivota_pdp_url?: string;
  external_seed_id?: string;
  merchant_product_id?: string;
  merchant_sku_id?: string;
  merchant_offer_id?: string;
  pivota_pdp_url?: string;
  pivota_offer_id?: string;
  merchant_offer_input?: Record<string, unknown>;
  pivota_offer_input?: Record<string, unknown>;
  merchant_checkout_input?: Record<string, unknown>;
  pivota_checkout_input?: Record<string, unknown>;
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
  scan_target_id?: string;
  issue_ids: string[];
  demand_test_job_ids: string[];
  product_diagnosis_ids: string[];
  offer_diagnosis_ids: string[];
  checkout_diagnosis_ids: string[];
  gmv_assurance_snapshot_id?: string;
  usage_event_ids: string[];
  validation_report?: ProductionValidationReport;
  merchant_facing_report_draft?: MerchantFacingValidationReport;
  completed_at?: string;
  deleted_at?: string;
};

export type UsageEstimate = {
  products_selected: number;
  estimated_query_clusters: number;
  providers: ProviderName[];
  prompt_templates: string[];
  repetitions: number;
  estimated_ai_test_credits: number;
  plan_included_credits: number;
  credits_used_this_month: number;
  remaining_credits: number;
  estimated_overage_credits: number;
  recommended_run_window: InputReadinessSnapshot["recommended_run_window"];
  billing_mode: "preview_only";
  billing_status: "not_invoiced";
};

export type AgentCenterState = {
  stores: MerchantStore[];
  connections: StorePlatformConnection[];
  scanTargets: ScanTarget[];
  readinessSnapshots: InputReadinessSnapshot[];
  providers: ProviderRegistry[];
  queryClusters: QueryCluster[];
  promptTemplates: PromptTemplate[];
  jobs: DemandTestJob[];
  testRuns: LLMSurfaceTestRun[];
  results: LLMSurfaceResult[];
  parsedRecommendations: ParsedRecommendation[];
  matches: ProductMatchResult[];
  scores: DemandVisibilityScore[];
  issues: AgenticGMVIssue[];
  merchantOffers: MerchantOffer[];
  pivotaOffers: PivotaOffer[];
  merchantCheckoutPaths: MerchantCheckoutPath[];
  pivotaCheckoutPaths: PivotaCheckoutPath[];
  retestPreparations: RetestPreparation[];
  verificationRuns: VerificationRun[];
  productUnderstandingDiagnoses: ProductUnderstandingDiagnosis[];
  offerExecutionDiagnoses: OfferExecutionDiagnosis[];
  checkoutVerificationDiagnoses: CheckoutVerificationDiagnosis[];
  issueResolutionPlans: IssueResolutionPlan[];
  pivotaOptimizationPatches: PivotaOptimizationPatch[];
  gmvAssuranceSnapshots: GMVAssuranceSnapshot[];
  demoFixtures: DemoFixture[];
  productionValidationRuns: ProductionValidationRun[];
  pilotProductEntityProvisioningRuns: PilotProductEntityProvisioningRun[];
  productEntityIndexRecords: ProductEntityIndexRecord[];
  productEntityIndexBatchRuns: ProductEntityIndexBatchRun[];
  productEntityVariantReviewPlans: ProductEntityVariantReviewPlan[];
  pivotaIndexingTasks: PivotaIndexingTask[];
  usageEvents: UsageEvent[];
  usagePlan: {
    included_credits: number;
    budget_cap_credits: number;
  };
  counters: Record<string, number>;
};
