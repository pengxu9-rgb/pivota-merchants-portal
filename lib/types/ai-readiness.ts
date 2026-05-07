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

export interface AgentCenterBdActionItem {
  severity: AgentCenterBdActionSeverity;
  title: string;
  body: string;
  evidence?: Record<string, unknown>;
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

export interface AiReadinessSkippedProduct {
  platform: string;
  source_product_id: string;
  title: string;
  reason: string;
}

/** Wrapper returned by the merchant audit endpoint. */
export interface AiReadinessAuditResponse {
  brand_report: AgentCenterBdBrandReport;
  rate_limit_remaining: number;
  /** Pre-flight skipped products (URL-less catalog rows). The audit
   * ran on the remainder. May be undefined / empty when all selected
   * products were auditable. */
  skipped_products?: AiReadinessSkippedProduct[];
}
