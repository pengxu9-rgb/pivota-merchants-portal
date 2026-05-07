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
  // Phase C-4 PR-G + #346 — present on per-host playbook actions:
  playbook_step_id?: string;
  target_host?: string;
  lever?: string;
  expected_timeline_weeks?: [number, number];
  concrete_next_step?: string | null;
  // Stamped on every action (strategic + playbook) so frontend
  // renders "Step 1, Step 2..." without re-deriving the order.
  priority_order?: number;
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
}
