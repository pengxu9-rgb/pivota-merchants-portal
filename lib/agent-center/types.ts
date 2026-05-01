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
  | "product_entity_mapping_issue"
  | "wrong_product_family"
  | "no_purchase_path"
  | "human_review_required";

export type FixTarget =
  | "merchant_pdp"
  | "merchant_catalog"
  | "merchant_structured_data"
  | "merchant_variant_map"
  | "pivota_unified_pdp"
  | "pivota_product_graph"
  | "pivota_query_mapping"
  | "both_merchant_and_pivota"
  | "human_review";

export type Severity = "low" | "medium" | "high" | "critical";

export type Timestamped = {
  created_at: string;
  updated_at?: string;
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

export type VisibilityScoreValue = number | "not_tested";

export type ProductRecord = {
  id: string;
  product_entity_id: string;
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

export type MerchantStore = Timestamped & {
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

export type StorePlatformConnection = Timestamped & {
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

export type ScanTarget = Timestamped & {
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

export type QueryCluster = Timestamped & {
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

export type AgenticGMVIssue = Timestamped & {
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
  event_type: "ai_test_credit" | "product_understanding_credit";
  quantity: number;
  source_agent: "demand_test_agent" | "product_understanding_agent";
  agent_type: "demand_test_agent" | "product_understanding_agent";
  workflow_type: "demand_scan" | "retest" | "product_diagnosis";
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
  retestPreparations: RetestPreparation[];
  verificationRuns: VerificationRun[];
  productUnderstandingDiagnoses: ProductUnderstandingDiagnosis[];
  usageEvents: UsageEvent[];
  usagePlan: {
    included_credits: number;
    budget_cap_credits: number;
  };
  counters: Record<string, number>;
};
