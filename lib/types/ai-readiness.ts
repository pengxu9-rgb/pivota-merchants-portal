/**
 * Type definitions for the merchant self-service AI Commerce Readiness
 * audit. Mirrors the shape returned by the merchant audit endpoint:
 *
 *   POST /api/merchant-center/audit/ai-commerce-readiness
 *   →  { brand_report: AgentCenterBdBrandReport, rate_limit_remaining: number }
 *
 * The brand_report shape is identical to what the employee-portal BD
 * brand-level report returns — same engine (services.agent_center_bd_
 * report_service.run_brand_report) on the backend. We keep the
 * `AgentCenterBd*` naming so the types are recognizable to anyone who
 * has worked on the employee portal, and so future shape changes only
 * have to be made in one mental model. If shapes ever diverge the file
 * is independent and can fork.
 */

export type AgentCenterBdVerdictLabel =
  | 'INVISIBLE'
  | 'VISIBLE BUT MISATTRIBUTED'
  | 'VISIBLE VIA RETAILERS'
  | 'STRONG'
  | 'PARTIAL';

export interface AgentCenterBdQueryRow {
  query: string;
  self_report_yes: boolean;
  top_cited_url: string | null;
  cited_urls_count: number;
}

export type AgentCenterBdActionSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AgentCenterBdPitchDraft {
  subject: string;
  body: string;
  recipient_email: string;
  recipient_note: string;
}

/**
 * Phase B: result of fetching the cited article and checking
 * Gemini's `competitors_appearing` claim against the actual text.
 * Stamped on action.evidence.co_occurrence_verification.
 */
export interface AgentCenterBdCoOccurrenceVerification {
  verified_brands: string[];
  contradicted_brands: string[];
  merchant_present: boolean;
  merchant_absent: boolean;
  fetch_status: 'ok' | 'cached' | 'blocked' | 'error' | 'no_url';
  article_url: string;
}

/**
 * Phase E: a candidate creator returned by services.creator_matcher.
 * Surfaced via action.evidence.matched_creators when the audit emits
 * a creator_partnership action.
 */
export interface AgentCenterBdMatchedCreator {
  creator_id: string;
  display_name: string | null;
  platform: string | null;
  platform_url: string | null;
  audience_size_band: string | null;
  recent_coverage: string[];
  contact_method: string | null;
  contact_url: string | null;
  sample_brief_template: string | null;
  score: number;
}

export interface AgentCenterBdActionItem {
  severity: AgentCenterBdActionSeverity;
  title: string;
  body: string;
  evidence?: Record<string, unknown>;
  // Phase C-4 PR-G + #346 — present on per-host playbook actions:
  playbook_step_id?: string;
  target_host?: string;
  lever?: string;
  expected_timeline_weeks?: [number, number];
  concrete_next_step?: string | null;
  // Stamped on every action (strategic + playbook) so frontend
  // renders "Step 1, Step 2..." without re-deriving the order.
  priority_order?: number;
  // Execution-layer Phase A: pre-filled email draft for editorial
  // pitch actions. Null on actions whose playbook has no pitch_template
  // (wholesale, GSC, etc.) or whose target host has no pitch_recipient.
  pitch_draft?: AgentCenterBdPitchDraft | null;
  // Execution-layer Phase 0: Pivota integration CTA. When the action's
  // lever is "pivota_integration", these fields drive the green CTA
  // panel that opens the onboarding wizard.
  cta_url?: string | null;
  cta_label?: string | null;
}

export interface AgentCenterBdHostClassification {
  type: 'editorial' | 'retailer' | 'marketplace' | 'video' | 'brand' | 'unclassified';
  subtype: string | null;
  categories: string[];
  coverage_note: string | null;
  outreach_hint: string | null;
  applies_to_merchant_category: boolean | null;
}

export interface AgentCenterBdCitedHostDetailed extends AgentCenterBdHostClassification {
  host: string;
  times_cited: number;
}

export interface AgentCenterBdFailedQueryDetailed {
  query: string;
  top_cited_url: string | null;
  top_cited_host: string | null;
  host_classification: Omit<AgentCenterBdHostClassification, 'host'>;
  competitors_named: string[];
}

export interface AgentCenterBdCompetitiveTableRow {
  brand: string;
  times_mentioned: number;
  first_party_visible: boolean;
  first_party_host: string | null;
  host_citations: number;
}

export interface AgentCenterBdIndexingArcState {
  phase: 'fresh' | 'indexing' | 'expected_steady' | 'unknown' | 'indexing-up';
  days_since_mint: number | null;
  minted_at: string | null;
  expected_first_citation_at: string | null;
  caveat: string;
}

export interface AgentCenterBdBrandDisambiguation {
  brand_audited_against: string | null;
  storefront_name: string | null;
  note: string;
}

export interface AgentCenterBdMerchantView {
  headline: {
    verdict_label: AgentCenterBdVerdictLabel;
    one_liner: string | null;
    /** Merchant-language answer to "am I visible?" — yes/no/partly/mixed. */
    plain_summary: string | null;
    scores: {
      visibility: number;
      attribution: number;
      category_visibility: number | null;
    };
    what_is_at_stake: string | null;
    audited_via_pivota_canonical: boolean;
    url_source: string | null;
    /**
     * Surfaced when the product's `vendor` field differs from the
     * storefront name (1688 / wholesale drop-shippers). Tells the
     * merchant "we audited 'guiruo', not 'YourStoreName'" so they
     * read prose about "your brand" with the right entity in mind.
     */
    brand_disambiguation: AgentCenterBdBrandDisambiguation | null;
  };
  receipts: {
    queries_tested: number;
    merchant_cited_in: number;
    top_cited_urls: string[];
    /** PR-F: per-failed-query winner + classification + competitors named. */
    failed_queries_detailed: AgentCenterBdFailedQueryDetailed[];
    top_cited_hosts: string[];
    /** PR-E: each cited host with type / coverage_note / outreach_hint. */
    cited_hosts_detailed: AgentCenterBdCitedHostDetailed[];
    top_competitor_brands: string[];
    /** #344: flat per-brand rows joining peers_named with first-party-visibility. */
    competitive_table: AgentCenterBdCompetitiveTableRow[];
  };
  diagnosis: {
    primary: string | null;
    /** PR-D: real arc phase computed from pivota_signature_minted_at. */
    indexing_arc_state: AgentCenterBdIndexingArcState | null;
  };
  actions: AgentCenterBdActionItem[];
  tracking: {
    next_audit_eligible_at: string | null;
    history_link: string | null;
    history?: {
      audits_in_history: number;
      most_recent_audit?: {
        run_id?: string | null;
        requested_at?: string | null;
        visibility?: number | null;
        attribution?: number | null;
        category_visibility?: number | null;
        verdict_labels?: string[];
      } | null;
      series?: {
        requested_at?: string | null;
        visibility?: number | null;
        attribution?: number | null;
        category_visibility?: number | null;
      }[];
    } | null;
    pivota_baseline_reference: {
      visibility: number | null;
      attribution: number | null;
      as_of: string | null;
      indexing_phase: string | null;
    };
    your_gap_to_baseline: { visibility: number; attribution: number };
    /**
     * Phase D: Pivota canonical PDP submission state to Google
     * Search Console (via Indexing API). Populated only when the
     * merchant has granted Pivota GSC access AND has products
     * audited via Pivota canonical PDPs.
     */
    gsc_submission_status?: {
      submitted: number;
      indexed: number;
      pending: number;
      errors: number;
      last_submission_at: string | null;
      last_indexed_at: string | null;
    } | null;
  };
  pivota_value_prop: AgentCenterBdReport['what_pivota_changes'];
}

export interface AgentCenterBdIndustryContext {
  category: string;
  ai_search_share_pct: number | null;
  ai_search_growth_yoy_pct: number | null;
  forward_projection?: string | null;
  blurb: string;
}

export interface AgentCenterBdDiscoveryMechanic {
  label: string;
  evidence: string;
  shipped: boolean;
}

export interface AgentCenterBdDiscoveryLayer {
  name: string;
  subtitle: string;
  what_it_is: string;
  pivota_status: string;
  merchant_metric: string | null;
  mechanics: AgentCenterBdDiscoveryMechanic[];
}

export interface AgentCenterBdDiscoveryLift {
  title: string;
  current_state: string;
  layers: AgentCenterBdDiscoveryLayer[];
  prediction: string;
  methodology_note: string;
}

export interface AgentCenterBdCheckoutChainStep {
  step: number;
  label: string;
  evidence: string;
  shipped: boolean;
}

export interface AgentCenterBdPlatformCoverage {
  shipped: string[];
  roadmap: string[];
  note: string;
}

export interface AgentCenterBdCheckoutLoop {
  title: string;
  chain: AgentCenterBdCheckoutChainStep[];
  platform_coverage: AgentCenterBdPlatformCoverage;
  outcome: string;
}

export interface AgentCenterBdOnboardingStep {
  step: number;
  name: string;
  status: string;
  manual_today?: boolean;
  operates: string;
  what: string;
  addresses: string;
  test_merchant_validation: string;
}

export interface AgentCenterBdTestMerchantReference {
  merchant_id: string;
  shop_domain: string;
  audit_artifact_path?: string;
  discovery_baseline_path?: string;
}

export interface AgentCenterBdOnboardingSequence {
  title: string;
  intro: string;
  test_merchant: AgentCenterBdTestMerchantReference;
  steps: AgentCenterBdOnboardingStep[];
  roadmap_note: string;
}

export interface AgentCenterBdVisibilityMechanism {
  label: string;
  what: string;
  status: 'shipped' | 'manual_today' | 'roadmap' | string;
  evidence: string;
}

export interface AgentCenterBdVisibilityBooster {
  title: string;
  intro: string;
  mechanisms_that_work: AgentCenterBdVisibilityMechanism[];
  what_doesnt_work: string[];
  honest_position: string;
}

export interface AgentCenterBdPeerNamed {
  name: string;
  times_cited: number;
}

export interface AgentCenterBdPeerFirstParty {
  brand: string;
  first_party_host: string;
  category_query_mentions: number;
  host_citations: number;
}

export interface AgentCenterBdCompetitivePressure {
  title: string;
  intro: string;
  peers_named: AgentCenterBdPeerNamed[];
  peers_with_first_party_visibility: AgentCenterBdPeerFirstParty[];
  merchant_first_party_visible: boolean;
  merchant_attribution_score: number;
  framing: string;
}

export interface AgentCenterBdReport {
  merchant_name: string;
  merchant_pdp_url: string;
  merchant_host: string | null;
  product: {
    title: string;
    vendor: string | null;
    product_type: string | null;
  };
  provider: string;
  upstream_status: {
    is_real: boolean;
    reason: string | null;
    requested_provider: string;
    visibility_provider: string;
    attribution_provider: string;
  };
  timestamp: string;
  verdict: {
    label: AgentCenterBdVerdictLabel;
    explanation: string;
    visibility_score: number;
    attribution_score: number;
    category_visibility_score: number | null;
  };
  industry_context: AgentCenterBdIndustryContext;
  action_items: AgentCenterBdActionItem[];
  competitive_pressure: AgentCenterBdCompetitivePressure;
  visibility: {
    score: number;
    runs: number;
    queries: AgentCenterBdQueryRow[];
  };
  attribution: {
    score: number;
    runs: number;
    merchant_cited_runs: number;
    runs_with_any_citation: number;
    queries: AgentCenterBdQueryRow[];
    competitor_hosts: { host: string; times_cited: number }[];
  };
  category_visibility: {
    score: number;
    upstream_score: number | null;
    runs: number;
    queries: AgentCenterBdQueryRow[];
    match_details: {
      query: string;
      in_grounding: boolean;
      title_match: boolean;
      excerpt_match: boolean;
      matched: boolean;
    }[];
    competitor_brands: { name: string; times_cited: number }[];
    retailer_hosts: { host: string; times_cited: number }[];
  } | null;
  what_pivota_changes: {
    today_summary: string;
    discovery_lift: AgentCenterBdDiscoveryLift;
    checkout_loop: AgentCenterBdCheckoutLoop;
    onboarding_sequence: AgentCenterBdOnboardingSequence;
    visibility_booster: AgentCenterBdVisibilityBooster;
  };
  /** Phase C-4 PR-B onwards — additive 6-layer block the merchant
   * portal renders directly. Optional because legacy reports (or
   * mocks) may not include it. */
  merchant_view?: AgentCenterBdMerchantView;
  raw?: {
    visibility?: Record<string, unknown>;
    attribution?: Record<string, unknown>;
    category_visibility?: Record<string, unknown> | null;
  };
}

export interface AgentCenterBdBrandAggregate {
  avg_visibility: number | null;
  avg_attribution: number | null;
  avg_category_visibility: number | null;
  brand_verdict_label: AgentCenterBdVerdictLabel | null;
  brand_verdict_explanation: string;
  products_count: number;
  products_succeeded: number;
  products_failed: number;
}

export interface AgentCenterBdBrandReport {
  merchant_name: string;
  merchant_domain: string | null;
  timestamp: string;
  provider: string;
  per_product: AgentCenterBdReport[];
  aggregate: AgentCenterBdBrandAggregate;
  cross_product_competitors: { host: string; times_cited: number }[];
  failed: { pdp_url: string; title: string; error: string }[];
}

/** Tier-1 URL-audit wedge response — POST /api/merchant-center/audit/url-readiness.
 * Audits a storefront by crawling it (no catalog sync); the first N per
 * merchant are free, then the endpoint returns HTTP 402. */
export interface UrlReadinessAuditResponse {
  brand_report: AgentCenterBdBrandReport;
  audit_run_id: string | null;
  audited_url: string;
  tier: string;
  discovery: {
    method: string | null;
    products_audited: number;
    products_discovered_total: number | null;
    coverage: unknown;
  };
  free_audits_allowed: number;
  free_audits_used: number;
  free_audits_remaining: number;
}

/** Wrapper returned by the merchant audit endpoint. */
export interface AiReadinessAuditResponse {
  brand_report: AgentCenterBdBrandReport;
  rate_limit_remaining: number;
  /** product_keys whose audit URL was the Pivota canonical PDP
   * (agent.pivota.cc/products/sig_*) rather than the merchant's
   * own URL — typically because the catalog row had no merchant
   * canonical_url and no Shopify handle. The score reflects
   * Pivota's hosted surface (which is in the 30-90 day Google
   * indexing arc post-creation). Empty when the merchant's own
   * URLs covered every selected SKU. */
  audited_via_pivota_canonical?: string[];
  /** P1.3: backend-already-emitted fields the merchant portal
   * was ignoring. Wired into the page so merchants see the same
   * task queue + executor activity their employee BD does.
   * The audit_run_id lets the polling-based async lifecycle
   * (Phase 2) fall back to legacy mode when the run completes
   * within the 30s window. */
  audit_run_id?: string | null;
  tasks?: {
    materialized?: number;
    skipped_pitch_only?: number;
    skipped_duplicate?: number;
    reason?: string;
  } | null;
  executors?: {
    queued?: boolean;
    poll_via_executor_runs_table?: boolean;
  } | null;
}

// P1.3: minimal task / executor row types for the merchant portal
// to render the same panels as the employee portal. Mirror the
// backend dual-key shim (P1.1) so reads work against pre/post
// shim windows.
export type MerchantTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'dismissed'
  | 'failed';

export type MerchantTaskSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface MerchantTask {
  task_id: string;
  merchant_id: string;
  parent_audit_run_id: string | null;
  source_executor_run_id: string | null;
  lever: string | null;
  severity: MerchantTaskSeverity;
  title: string;
  body: string | null;
  status: MerchantTaskStatus;
  assigned_to_agent: string | null;
  assigned_to_human: string | null;
  evidence_jsonb: Record<string, unknown> | null;
  evidence?: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  dismissed_reason: string | null;
}

export interface MerchantExecutorRun {
  run_id: string;
  agent_name: string;
  merchant_id: string | null;
  parent_audit_run_id: string | null;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  evidence_jsonb: Record<string, unknown> | null;
  evidence?: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  requested_at?: string | null;
  completed_at: string | null;
  result_type?: 'direct_action_completed' | 'human_task_recommended'
                | 'verification_needed' | 'no_op';
  materialized_task_id?: string | null;
}

// ===========================================================================
// v3 per-SKU audit types (spec §A-E + §I).
//
// The v3 audit replaces the single brand verdict with a per-SKU scorecard
// view. The legacy AgentCenterBd* types above are preserved for callers on
// the audit_mode='legacy' path; the types below describe the new
// audit_mode='per_sku' path. Backend contract lives in
// pivota-backend-discovery-feed/services/agent_center_bd_report_service.py
// (build_per_sku_report / build_brand_rollup / build_authority_map).
// ===========================================================================

export type SkuScoreBand = 'blocked' | 'partial' | 'ready' | 'agent_ready';

export interface SkuScoreBucket {
  points: number;
  max: number;
  reason: string;
}

export interface SkuScoreBreakdown {
  total: number;
  buckets: Record<string, SkuScoreBucket>;
  missing_inputs?: string[];
}

export interface SkuDimensionScore {
  score: number;
  breakdown: SkuScoreBreakdown;
}

export interface SkuGroundingSource {
  uri: string;
  title: string;
  host: string | null;
}

export interface SkuGroundingEvidence {
  prompt: string;
  grounded_sources: SkuGroundingSource[];
  evidence_excerpt: string;
}

export interface AgentCenterPerSkuReport {
  sku_key: string;
  product_key: string;
  content_key: string | null;
  title?: string;
  scores: {
    identity: SkuDimensionScore;
    content_richness: SkuDimensionScore;
    routability: SkuDimensionScore;
    citation: SkuDimensionScore;
  };
  band: SkuScoreBand;
  primary_gaps: string[];
  verbatim_grounding_evidence: SkuGroundingEvidence[];
  axis_coverage: Record<string, number>;
}

export interface BrandDimensionStats {
  identity: number;
  content_richness: number;
  routability: number;
  citation: number;
}

export interface BrandPriorityQueueEntry {
  sku_key: string;
  impact: number;
  gap: number;
  fixability: number;
  score: number;
}

export interface AgentCenterBrandRollup {
  median: BrandDimensionStats;
  p25: BrandDimensionStats;
  p75: BrandDimensionStats;
  winning_skus_by_citation: string[];
  winning_skus_by_band: string[];
  blocked_skus: string[];
  priority_queue: BrandPriorityQueueEntry[];
}

export type AuthorityHostType =
  | 'editorial'
  | 'reddit'
  | 'retailer'
  | 'creator'
  | 'trade'
  | 'unclassified';

export interface AuthorityHostEntry {
  host: string;
  host_type: AuthorityHostType;
  cites_exact_sku: boolean;
  cites_near_variant: boolean;
  cites_category_not_sku: boolean;
  prompts_cited_count: number;
  evidence_urls: string[];
  evidence_excerpt: string;
  competitors_named: string[];
}

export interface AuthorityRedditThread {
  url: string;
  title: string;
  sentiment: 'positive' | 'mixed' | 'negative' | null;
  matched_sku: boolean;
}

export interface AuthorityRedditSubreddit {
  name: string;
  threads: AuthorityRedditThread[];
  sentiment_proxy: number | null;
  recurring_objections: string[];
}

export interface AuthorityPerSkuEntry {
  hosts: AuthorityHostEntry[];
  reddit: {
    subreddits: AuthorityRedditSubreddit[];
  };
}

export interface AgentCenterAuthorityMap {
  per_sku: Record<string, AuthorityPerSkuEntry>;
}

export interface AgentCenterCostSummary {
  prompts: number;
  providers: string[];
  audit_credits_debited: number;
  prompt_credits_debited: number;
  cache_hits: number;
  estimated_cost_usd: number;
}

export interface AgentCenterPerSkuAuditResponse {
  audit_run_id: string;
  merchant_id: string;
  audit_mode: 'per_sku';
  per_sku_reports: AgentCenterPerSkuReport[];
  brand_rollup: AgentCenterBrandRollup;
  authority_map: AgentCenterAuthorityMap;
  legacy_verdict: string;
  cost_summary: AgentCenterCostSummary;
}

// Spec §I — pre-flight cost preview before launching an audit. Returns
// projected probe count + estimated credits + current balance + a
// `sufficient` flag. The merchant decides; we never auto-shrink scope.

export type CreditPlanTier = 'free' | 'starter' | 'growth' | 'enterprise' | 'custom';

export interface MerchantCreditBalance {
  audit_credits: number;
  prompt_credits: number;
  execution_credits: number;
  plan_tier: CreditPlanTier;
}

export interface AuditPreviewGap {
  kind: 'audit' | 'prompt' | 'execution';
  required: number;
  available: number;
  short: number;
}

export type AuditPreviewProvider = 'gemini' | 'deepseek' | 'claude' | 'openai';

export type AuditPreviewScope =
  | { sku_keys: string[] }
  | { select_top_n_by_revenue: number };

export interface AgentCenterAuditPreviewRequest {
  merchant_id: string;
  scope: AuditPreviewScope;
  prompts_per_sku?: number;
  custom_prompts?: string[];
  providers?: AuditPreviewProvider[];
}

export interface AgentCenterAuditPreviewResponse {
  audit_run_id_preview: string;
  merchant_id: string;
  sku_count: number;
  prompts_per_sku: number;
  total_prompts: number;
  custom_prompt_slots_used: number;
  estimated_cache_savings: {
    prompts_cached: number;
    cache_hit_rate: number;
  };
  providers: string[];
  estimated_audit_credits: number;
  estimated_prompt_credits: number;
  estimated_execution_credits: number;
  current_balance: MerchantCreditBalance;
  sufficient: boolean;
  gaps: AuditPreviewGap[];
}

// Discriminated union so render-time exhaustiveness checks compile.
export type AgentCenterAuditResponse =
  | (AiReadinessAuditResponse & { audit_mode?: 'legacy' })
  | AgentCenterPerSkuAuditResponse;
