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
  /** Audit→action→outcome loop (legacy per-product location; per-SKU reports
   * carry it top-level as `AgentCenterPerSkuAuditResponse.outreach_outcomes`). */
  outreach_outcomes?: AgentCenterOutreachOutcomes | null;
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
/** One product the merchant asked us to audit, after we fetched it. */
export interface UrlReadinessAuditedProduct {
  title: string;
  pdp_url: string;
  raw_title?: string | null;
  vendor?: string | null;
  /** Synthetic per-product key, used to match the product to its per_sku report. */
  sku_key?: string;
}

/** Upfront, honest disclosure of what the free wedge measured and what it
 * did NOT — so a low score reads as "not found in this sample", not a
 * definitive "invisible". The verification limitation lives here (once),
 * not buried inside every verdict line. */
export interface UrlReadinessMethodology {
  model: 'merchant_curated' | 'merchant_curated_per_sku' | string;
  products_audited: number;
  products_requested: number;
  // MEASURED per-product buyer-intent query count once the run completes
  // (the fullest single-model coverage). Falls back to the planned budget on
  // older/empty payloads.
  queries_per_product: number;
  // The planned per-product query budget (`_WEDGE_PROMPTS_PER_SKU`), preserved
  // for reference. Present only after the honest reshape ran.
  queries_per_product_target?: number;
  // Provider ids that actually produced ≥1 scored run, e.g. ['chatgpt','gemini'].
  // Structured data; the header renders the display strings below, not this.
  providers_ran?: string[];
  // Real per-model run counts across audited SKUs, e.g. {gemini: 7, chatgpt: 10}.
  prompts_by_provider?: Record<string, number>;
  // Display-ready header strings owned by the backend (single source of truth
  // for model naming) — rendered verbatim; absent on legacy/unavailable payloads.
  grounded_search_label?: string; // e.g. "Gemini + ChatGPT grounded search"
  provider_run_summary?: string; // e.g. "Gemini 7 · ChatGPT 10"
  // True when a run "succeeded" but every provider failed / was rate-limited,
  // so no query coverage was measured — header shows a re-run prompt, not a 0.
  coverage_unavailable?: boolean;
  what_we_checked: string;
  limitations: string[];
  unresolved_urls: Array<{ url: string; reason: string }>;
}

// ── Per-SKU "AI-visibility intelligence" (the hero-SKU sidewalk money-shot).
// Mirrors the backend `_display_sku_intelligence` payload (agent_center_bd_
// report_service.run_wedge_hero_sku_intelligence). The prompt is the unit:
// which buyer prompts win, which lose, and which sidewalk lanes are open.
export type SkuOwnershipState =
  | 'merchant-owned'
  | 'merchant-mentioned'
  | 'competitor-owned'
  | 'retailer-owned'
  | 'publisher-owned'
  | 'forum-owned'
  | 'open-lane'
  | 'no-demand';

export type SkuProviderVerdict = 'win' | 'partial' | 'loss' | 'absent';

export interface SkuIntelligenceLane {
  query: string;
  /** Substantiated attributes the lane is built from (PDP evidence). */
  why_fit?: string[];
  current_ownership?: SkuOwnershipState | string;
  density_band?: 'low' | 'medium' | 'high';
  intent?: { label?: string; weight?: number } | null;
  source_route?: string;
  demand_state?: string;
  opportunity_score?: number;
  /** Short next-move hint derived from ownership/source route. */
  first_move?: string;
}

export interface SkuIntelligencePromptRow {
  query: string;
  intent_ladder_layer?: string | null;
  gemini?: SkuProviderVerdict | string;
  deepseek?: SkuProviderVerdict | string;
  /** Present only when ChatGPT ran (hero-SKU tri-prober, OPENAI_API_KEY live). */
  chatgpt?: SkuProviderVerdict | string;
  ownership_state?: SkuOwnershipState | string;
  who_owns?: string | null;
  sources?: Array<{ host?: string } | string>;
  /** Coarse demand strength for the lane (null = no signal). */
  demand_label?: 'high' | 'moderate' | 'low' | null;
  /** Verbatim AI answer excerpt + who it named, so the merchant sees what the
   * AI actually said on a lane (esp. lanes it loses to a competitor/retailer). */
  cited_evidence?: {
    provider?: string | null;
    excerpt?: string;
    cited_hosts?: string[];
    competitors_named?: string[];
  } | null;
  opportunity_score?: number;
}

/** A move inside a strategic brief: a plain sentence (LLM path) or a structured
 * step (deterministic fallback). The UI normalizes both to one line. */
export type BriefMove =
  | string
  | {
      how?: string | null;
      move?: string | null;
      step?: string | null;
      action?: string | null;
      where?: string | null;
      who_controls?: string | null;
      [k: string]: unknown;
    };

/** Per-SKU CTA action the merchant button executes (request a tracked Pivota
 * job). Maps to the backend _SKU_CTA_ACTION descriptor. */
export type SkuCtaAction = 'request_enrichment' | 'request_indexing' | 'none';

/** Per-SKU "what to do next" — the operational playbook for the hero SKU. */
export interface SkuNextBestAction {
  headline?: string | null;
  why_this_first?: string | null;
  first_move?: string | null;
  // The numbered "do this yourself" checklist (the backend already emits this;
  // the old UI dropped it). `self_serve` and `self_serve_actions` are aliases.
  self_serve?: string[];
  self_serve_actions?: string[];
  pivota_assisted?: string[];
  pivota_path?: string | null;
  tracking_metrics?: string[];
  evidence_summary?: string | null;
  // Brief provenance. We only show strategic_brief when it's the real LLM brief;
  // the deterministic fallback is safe-but-generic and is suppressed (we fall
  // back to the operational next-step). Prefer brief_source ('llm'|'deterministic')
  // — the explicit signal — over the older brief_debug.outcome.
  brief_status?: string | null;
  brief_source?: 'llm' | 'deterministic' | string | null;
  brief_debug?: { outcome?: string | null; [k: string]: unknown } | null;
  // "What the category winner does right" — the verbatim known_for is the gold.
  competitor_intel?: CompetitorIntel | null;
  // Consultant-grade brief: root cause + the decision + concrete moves. The
  // backend computes this (attach_sku_strategic_brief) but the UI dropped it,
  // leaving only the shallow headline + a dead-end "Pivota handles this". This
  // is the depth a merchant operator needs to act.
  strategic_brief?: {
    position?: string | null;
    your_angle?: string | null;
    why_you_lose?: string | null;
    core_decision?: string | null;
    // The LLM brief emits plain strings; the deterministic fallback emits
    // structured {how, where, who_controls} objects — handle both.
    first_moves?: BriefMove[];
    traffic_strategy?: BriefMove[];
    substitution_play?: string | null;
    diy_vs_pivota?: { pivota?: string | null; self_serve?: BriefMove[] } | null;
  } | null;
  // Backend now stamps {action, target_sku_key} so the CTA can POST a real
  // tracked request instead of rendering a dead label.
  cta?: {
    label?: string;
    trust_note?: string;
    action?: SkuCtaAction;
    target_sku_key?: string;
  } | null;
}

// Result of the per-SKU request_indexing trigger / status read-back
// (backend: services/pivota_indexing_request.py, routes POST
// /api/merchant-center/audit/sku/request-indexing + GET .../indexing-status).
// The `status` is the single source of truth the portal renders — it reflects
// the real flag + minted-signature state, so the "Pivota handles this" lane
// stops over-promising:
//   - "submitted" | "pending" | "indexed": Pivota is/has submitted the canonical page
//   - "no_canonical_url": SKU has no minted Pivota page yet → nothing to submit
//   - "not_enabled": gsc_pivota_submit_enabled is off → no-op, use the checklist
//   - "not_submitted": status read-back only, no submission row yet
//   - "error": submit failed
export type SkuIndexingStatus =
  | 'submitted'
  | 'pending'
  | 'indexed'
  | 'no_canonical_url'
  | 'not_enabled'
  | 'not_submitted'
  | 'error'
  | 'unknown';

export interface SkuIndexingResult {
  status: SkuIndexingStatus;
  last_status?: string | null;
  url?: string | null;
  message?: string | null;
  deduped?: boolean;
  submitted_at?: string | null;
  indexed_at?: string | null;
}

// next_best_action.competitor_intel — grounded read of what AI says the
// category winner is known for. known_for is the verbatim AI text (the gold).
export interface CompetitorIntel {
  status?: string | null; // "assessed" when populated
  competitor?: string | null;
  known_for?: string | null;
  attributes_present?: string[];
  evidence?: { provider?: string; attribute?: string; verbatim?: string }[];
  note?: string | null;
}

export interface SkuIntelligenceLadderLayer {
  score: number;
  prompts?: number;
  open_lanes?: number;
  [k: string]: unknown;
}

export interface SkuSubstitutionAlert {
  present: boolean;
  prompt?: string;
  substituted_by?: string;
  engines?: string[];
}

export interface SkuIntelligence {
  hero_sku: { title: string | null; pdp_url: string | null; vendor: string | null };
  /** The money-shot lead sentence (or honest empty-state line). */
  headline: string;
  intent_ladder: Record<string, SkuIntelligenceLadderLayer>;
  top_open_lanes: SkuIntelligenceLane[];
  substitution_alert: SkuSubstitutionAlert;
  prompt_matrix: SkuIntelligencePromptRow[];
  demand_state_summary: string | null;
  coverage?: Record<string, unknown>;
  /** The per-SKU operational playbook (what to do next). */
  next_best_action?: SkuNextBestAction | null;
  /** True when no open lane stood out (lexicon gap, no demand, or mock upstream). */
  is_empty: boolean;
  /** Set when the per-SKU upstream couldn't be verified (don't fabricate lanes). */
  note?: string;
}

// Off-platform outreach move derived from a host AI cites instead of you.
export interface OutreachMove {
  host: string;
  host_type: string;
  host_subtype?: string | null;
  action_verb: string;
  lever: string;
  recommendation_class?: string | null;
  prompts_cited_count?: number;
  cited_on_category_query?: boolean;
  headline: string;
  why: string;
  /** Measured reason to work this host: the losing category queries whose
   *  grounded answers cited it (win-plan join, ≤3). [] when the win plan
   *  grounded no losing query here — never an inferred list. */
  losing_queries?: string[] | null;
  first_move?: string | null;
  pitch_recipient?: string | null;
  // How achievable this move is for an emerging brand — drives sort/grouping.
  // Lead with reachable/diy; de-emphasize 'hard' (major-publisher) moves.
  realism?: 'reachable' | 'diy' | 'onboarding' | 'hard' | 'investigate' | string | null;
  // Evidence weight behind this move. 'single_sighting' = one grounded answer
  // cited the host in this run's sample (a lead to verify, not a proven
  // channel — empirically these often don't recur on re-audit); 'repeated' =
  // multiple citations or a standing endorsement. signal_note carries the
  // honest caveat copy for single sightings.
  signal_strength?: 'single_sighting' | 'repeated' | string | null;
  signal_note?: string | null;
}

/**
 * Phase-4 T5 — a standing authority host for the merchant's vertical (from the
 * VerticalProfile pitch list), status-stamped against what this audit observed.
 * Unlike outreach_moves (hosts the engines happened to cite this run), these
 * render even when the sample missed them — they're the category's pitch list.
 */
export interface PitchTarget {
  host: string;
  status: 'already_endorses_you' | 'cited_in_your_category' | 'not_yet_observed' | string;
  why?: string | null;
  realism?: OutreachMove['realism'];
  tier?: number | null;
  ai_grounding_weight?: string | null;
  expected_outreach_cycle_weeks?: [number, number] | number[] | null;
  pitch_recipient?: string | null;
  first_move?: string | null;
}

/** A cited host that looks like an outreach target but can never cite you: a
 * competitor owns it, and its editorial-shaped "best of" roundups only feature
 * the owner's own brands (hair.com is L'Oreal's house media for Redken /
 * Kerastase / Matrix). Deliberately excluded from outreach_moves — shown so the
 * merchant knows the door is closed rather than assuming a weak pitch. */
export interface ClosedChannel {
  host: string;
  prompts_cited_count?: number;
  cited_on_category_query?: boolean;
  why_closed: string;
  what_it_means: string;
  detail?: string | null;
}

export interface WhereYoureLosing {
  summary?: string;
  outreach_moves?: OutreachMove[];
  /** Vertical authority pitch list (empty for verticals without one). */
  pitch_targets?: PitchTarget[];
  /** Cited hosts a rival owns — unpitchable by construction. */
  closed_channels?: ClosedChannel[];
  closed_channels_note?: string | null;
  who_ai_cites_instead?: {
    available?: boolean;
    competitors?: Array<{ name: string; times_named: number }>;
    note?: string | null;
  };
}

// Audit→action→outcome loop: what changed at the hosts your last audit told you
// to target. Attached by the backend at TOP-LEVEL `outreach_outcomes` on per-SKU
// (production) reports and at `merchant_view.outreach_outcomes` on legacy
// per-product reports. The backend authors every merchant-facing string
// (`what_changed`, `note`, `basis_note`, `merchant_action.note`) under strict
// honesty rules — NO causation is ever claimed — so the panel renders them
// verbatim rather than re-deriving copy.
export type OutreachOutcomeClass =
  | 'won'
  | 'progress'
  | 'no_change'
  | 'no_longer_grounded'
  | 'not_comparable';

export interface OutreachOutcomeSignalsSide {
  endorsed: boolean;
  names_you: boolean;
  citation_role: string | null;
  prompts_cited_count: number | null;
  /** Present on the `current` side only, and only for query-keyed targets. */
  grounds_this_query?: boolean | null;
  query_still_losing?: boolean | null;
}

// A neutral FACT (never causation) about the merchant's own task queue: the
// prior target host had a task the merchant marked done. Fair to surface
// ("you marked this done N days before this run") but it does not prove the
// outreach caused the change.
export interface OutreachOutcomeMerchantAction {
  title: string;
  marked_done_at: string | null;
  days_before_current_run: number | null;
  note: string;
}

export interface OutreachOutcomeTarget {
  host: string;
  /** null for host-only (outreach-move) targets that carry no query context. */
  query: string | null;
  axis: string | null;
  target_source: 'win_plan' | 'outreach_move' | 'win_plan+outreach_move';
  outcome: OutreachOutcomeClass;
  /** Machine key, e.g. "query_now_cited" / "host_now_endorses" /
   * "still_grounds_without_naming" / "absent_from_query_grounding" /
   * "query_not_probed" / "basis_changed". Copy lives in `what_changed`. */
  reason: string;
  what_changed: string;
  signals: {
    prior: OutreachOutcomeSignalsSide;
    current: OutreachOutcomeSignalsSide;
  };
  merchant_action: OutreachOutcomeMerchantAction | null;
}

export interface OutreachOutcomeSummary {
  won: number;
  progress: number;
  no_change: number;
  no_longer_grounded: number;
  not_comparable: number;
}

export interface AgentCenterOutreachOutcomes {
  /** True → no prior audit, so there are no targets to compare yet. */
  is_first_audit: boolean;
  /** False when either side lacked the data — render nothing / a soft note. */
  available: boolean;
  /** The no-causation framing (when available) or why it's unavailable. */
  note: string | null;
  /** Echo of measurement_basis.same — when false, only basis-independent
   * (endorsement) transitions are claimed; per-query targets are not_comparable. */
  comparable: boolean | null;
  basis_note: string | null;
  targets: OutreachOutcomeTarget[];
  summary: OutreachOutcomeSummary;
  /** Prior "closed doors" (a competitor owns them) — never targets, surfaced
   * so their absence from the target list is an honest stated fact. */
  closed_channels_excluded: string[];
}

export interface UrlReadinessAuditResponse {
  status?: string;
  run_id?: string | null;
  /** Competitive landscape + off-platform outreach moves (brand-level). */
  where_youre_losing?: WhereYoureLosing;
  /** Merchant-grade narrative: headline, what's working, where you're losing,
   * prioritized actions, answer-quality — the insight layer. */
  merchant_narrative?: AgentCenterMerchantNarrative | null;
  /** Subscription tier + store-connection state, so the results page doesn't
   * push the free-sample / connect-store / buy-credits funnel at a merchant who
   * is already subscribed and connected. */
  merchant_context?: {
    plan_tier?: string;
    is_paid?: boolean;
    store_connected?: boolean;
    credits?: number;
  } | null;
  /**
   * Per-product reports — one per pasted URL — produced by the durable per-SKU
   * pipeline. This is the primary payload for the rich per-product UI.
   */
  per_sku_reports?: AgentCenterPerSkuReport[];
  /** Brand-level rollup across the audited products (priority queue, medians). */
  brand_rollup?: AgentCenterBrandRollup | null;
  /** Per-SKU authority hosts (who's cited instead of you, incl. communities). */
  authority_map?: Record<string, unknown> | null;
  where_you_can_win?: Record<string, unknown> | null;
  /** The merchant's own test prompts ("Your prompts"), probed once brand-level. */
  custom_prompts?: CustomPromptResult[];
  /**
   * False for URL audits: catalog-only dimensions (identity/content/routability)
   * can't be measured without a synced store, so the UI renders them as
   * "connect store to measure" rather than a misleading low score.
   */
  catalog_dimensions_available?: boolean;
  /** Full per_sku brand report (kept for back-compat / debugging). */
  brand_report?: AgentCenterBdBrandReport;
  /** Report Summary Contract v1 — condensed summary layer (backend-dark;
   * rendered only behind FEATURE_FLAGS.REPORT_SUMMARY_VIEW). Null when the
   * backend build failed; absent on runs that predate it. */
  report_summary?: ReportSummary | null;
  /** Per-SKU hero intelligence (legacy wedge shape). Absent on per_sku runs. */
  sku_intelligence?: SkuIntelligence | null;
  audit_run_id: string | null;
  /** The brand site we used for context (= request website / store_url). */
  audited_url: string | null;
  tier: string;
  /** Exactly the products the merchant chose, as we fetched them. */
  audited_products: UrlReadinessAuditedProduct[];
  methodology: UrlReadinessMethodology;
  free_audits_allowed: number;
  free_audits_used: number;
  free_audits_remaining: number;
}

/**
 * Pre-launch readiness verdict — GET /api/audits/readiness. Lets the portal
 * show "ready" vs "still syncing" upfront instead of letting the merchant run
 * an audit that comes back all-blocked (the launch POST enforces the same gate
 * with a 409). `ready` is true only when the BLOCKING deps are present:
 * a synced catalog (catalog_products) + completed quality backfill
 * (product_quality_snapshot.content_quality_score). Enhancement gaps lower the
 * ceiling but don't block.
 */
export interface AuditReadiness {
  merchant_id: string;
  platform: string;
  ready: boolean;
  counts: {
    catalog_products: number;
    products_cache: number;
    product_quality_snapshot: number;
    product_enrichment: number;
    product_enrichment_with_content: number;
  };
  /**
   * Provenance breakdown of the merchant's catalog (merchant-wide, all
   * platforms — unlike `counts`, which is platform-scoped to the audit gate).
   * Drives the "ready, but observed-only" nudge: a merchant whose whole catalog
   * is historical URL-audit/seed observations, with no connected store, is
   * pointed at Integrations for a deeper first-party audit. Optional: absent on
   * older backends.
   */
  provenance?: {
    connected_store_products: number;
    observed_referral_products: number;
    brand_authored_products: number;
  };
  /**
   * True when the catalog is entirely observed URL-audit/seed rows with no
   * connected store — recommend a sync for a first-party audit. Advisory only;
   * never affects `ready`. Absent on older backends → treated as false.
   */
  recommend_store_sync?: boolean;
  blocking_gaps: string[];
  enhancement_gaps: string[];
  recommendation: string;
  /**
   * Active quality-backfill timing, when a job is in flight — lets the
   * "Preparing your catalog" state show a grounded count + countdown instead of
   * a flat "a few minutes". Optional/nullable: absent on older backends and
   * null when no job is running. `eta_seconds` is best-effort (null while the
   * job is still queued).
   */
  backfill?: {
    status: string;
    requested_at: string | null;
    started_at: string | null;
    total_candidates: number;
    processed: number;
    progress_pct: number | null;
    eta_seconds: number | null;
  } | null;
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

// W5 P7 — a parked executor run awaiting the merchant's approve/decline, when
// executor_auto_execute is off. `expired` rows can no longer be actioned.
export interface PendingExecutorRun {
  run_id: string;
  agent_name?: string | null;
  kind?: string | null;
  stage?: string | null;
  expired?: boolean;
  title?: string | null;
  requested_at?: string | null;
  parent_audit_run_id?: string | null;
  [k: string]: unknown;
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
  // Merchant-safe display copy from the backend dimension/band copy layer.
  // band is derived from one centralized threshold (_band_for_score), so the UI
  // should render `band`/`meaning` rather than re-deriving a color from score.
  // 'unscored' = not measured (distinct from 'blocked' = measured + failing).
  band?: SkuScoreBand | 'unscored';
  band_label?: string;
  meaning?: string;
  dimension_label?: string;
  question?: string;
  // Internal scoring detail — stripped from the merchant-facing response by the
  // backend (sanitize_report_for_merchant). Optional here; the UI renders only
  // `score` + the merchant-safe primary_gaps.
  breakdown?: SkuScoreBreakdown;
}

// Merchant-safe band label + meaning for a SKU-level (or rollup) band.
export interface BandDisplay {
  band: SkuScoreBand | 'unscored';
  label: string;
  meaning: string;
}

export interface SkuGroundingSource {
  uri: string;
  title: string;
  host: string | null;
}

// Backend `_grounding_evidence` emits `query` + `grounding_sources`; the older
// names are kept optional so either shape renders.
export interface SkuGroundingEvidence {
  query?: string;
  prompt?: string;
  grounding_sources?: SkuGroundingSource[];
  grounded_sources?: SkuGroundingSource[];
  evidence_excerpt: string;
}

// Merchant-safe primary gap. `label`/`why` are display copy from the backend
// _GAP_DISPLAY table; dimension/bucket/gap are internal sort keys (never shown).
export interface SkuPrimaryGap {
  label: string;
  why: string;
  dimension: string;
  bucket: string;
  gap: number;
}

// Per-model citation for one SKU (citation_by_provider[provider]).
export interface SkuProviderCitation {
  score: number | null;
  prompts: number;
  status?: string;
}

// Cross-model signal: cited/mentioned in `cited` of `of` models that ran.
export interface ModelsCited {
  cited: number;
  of: number;
}

// Backend resolves a usable, bad-name-tolerant display name in `identity.name`
// (brand-prefixed, variant-aware); `sku_title` is the raw catalog title. The
// card/queue render sku_title -> identity.name -> sku_key.
export interface SkuIdentity {
  name?: string | null;
  confidence?: string;
  source?: string;
  unresolved?: boolean;
  anchors?: Record<string, unknown>;
}

export interface AgentCenterPerSkuReport {
  sku_key: string;
  product_key: string;
  content_key: string | null;
  // Backend emits `sku_title` (the raw catalog title); the old `title` key never
  // existed in the payload, so the card silently fell back to sku_key.
  sku_title?: string;
  identity?: SkuIdentity;
  scores: {
    identity: SkuDimensionScore;
    content_richness: SkuDimensionScore;
    routability: SkuDimensionScore;
    citation: SkuDimensionScore;
  };
  band: SkuScoreBand;
  // Merchant-safe label + meaning for the SKU-level band so the card never
  // renders the raw enum.
  band_display?: BandDisplay;
  primary_gaps: SkuPrimaryGap[];
  models_cited?: ModelsCited;
  citation_by_provider?: Record<string, SkuProviderCitation>;
  next_best_action?: SkuNextBestAction | null;
  verbatim_grounding_evidence: SkuGroundingEvidence[];
  axis_coverage: Record<string, number>;
  // Channel-by-channel appearance: across this product's probed queries, where
  // it shows up in AI answers — the brand's own site vs each retailer/marketplace
  // AI cites instead. The subject is the product; cited hosts are channels.
  channel_appearance?: ChannelAppearance | null;
  // Product-FIRST competitiveness: does the product win NON-BRANDED discovery
  // demand ("best hair oil for damaged hair") — where the brand gains new buyers
  // — and who AI recommends instead. Leads the card; branded queries low-value.
  product_competitiveness?: ProductCompetitiveness | null;
  // Per-prompt probe detail (forwarded intact in the GET envelope). The
  // cited_evidence.excerpt is the verbatim AI answer — the richest proof of
  // what the AI actually said and who it recommended instead.
  opportunity?: SkuOpportunity | null;
  // Per-engine operating plan: Gemini and ChatGPT are two different games
  // (different indexes), so each gets its own status + how-it-cites + moves.
  engine_playbook?: EnginePlaybook | null;
  // Pivota's moat lever: turn merchant-supplied proof into grounded, citable
  // claims. Only render when present.
  evidence_play?: EvidencePlay | null;
}

// per_sku_reports[].engine_playbook — the per-engine operating plan.
export interface EnginePlaybookEngine {
  label?: string; // "Gemini (Google index)" / "ChatGPT (Bing + community)"
  how_it_cites?: string;
  appeared?: number;
  total?: number;
  rate?: number | null;
  status?: 'invisible' | 'weak' | 'present' | 'couldnt_measure' | string;
  moves?: string[];
}

export interface EnginePlaybook {
  has_signal?: boolean;
  primary_gap?: 'gemini' | 'chatgpt' | string | null;
  engines?: Record<string, EnginePlaybookEngine>;
  divergence?: { query: string; won: string[]; lost: string[] }[];
  divergence_note?: string | null;
}

// per_sku_reports[].evidence_play — supply proof → Pivota publishes citable claims.
export interface EvidencePlay {
  present?: boolean;
  already_substantiated?: boolean;
  claims_to_substantiate?: string[];
  unsubstantiated_in_ai?: number;
  moves?: string[];
  pivota_value?: string | null;
}

// Per-query probe row inside per_sku_reports[].opportunity.per_prompt. Carries
// the verbatim AI answer (cited_evidence), per-engine verdicts, and the
// substitution that names who AI recommends instead.
export interface SkuPerPromptRow {
  query: string;
  normalized_query?: string;
  axis?: string;
  intent?: { label?: string; weight?: number } | null;
  demand_state?: string | null;
  ownership_state?: string | null;
  who_owns?: string[];
  competitors?: string[];
  open_lane?: boolean;
  // Did the product surface only because its own/retail LISTING was retrieved
  // (findability), as opposed to an independent recommendation?
  appearance_via_listing?: boolean;
  provider_verdicts?: Record<string, 'win' | 'loss' | 'absent' | string>;
  cited_evidence?: {
    provider?: string | null;
    excerpt?: string;
    cited_hosts?: string[];
    competitors_named?: string[];
  } | null;
  substitution?: {
    present: boolean;
    kind?: 'category' | 'branded' | string;
    prompt?: string;
    substituted_by?: string;
    engines?: string[];
  } | null;
  source_summary?: {
    top_cited_hosts?: { host: string; times_cited?: number }[];
    merchant_cited_runs?: number;
    runs_with_citations?: number;
  } | null;
}

export interface SkuOpportunity {
  per_prompt?: SkuPerPromptRow[];
  substitution_alert?: SkuSubstitutionAlert | null;
  demand_state_summary?: string | null;
}

export interface ProductCompetitiveness {
  has_discovery: boolean;
  // Discovery queries ran but the AI grounded none of them → couldn't measure
  // this run (a transient grounding failure), NOT "appears nowhere".
  grounding_unavailable?: boolean;
  discovery: {
    appeared: number;
    total: number;
    rate: number | null;
    ungrounded?: number;
    // The HONEST decomposition of `appeared`: independent recommendation
    // (an editorial/community source named you organically) vs merely findable
    // (your own/retail listing was retrieved). appeared === recommended+listing.
    // Never show a single inflated `appeared` — lead with this split.
    appeared_recommended?: number;
    appeared_listing?: number;
    missed: string[];
    top_competitors: { name: string; query_count: number }[];
  };
  branded: { appeared: number; total: number; rate: number | null };
  // Per-model discovery appearance — Gemini and ChatGPT ground different
  // indexes, so wins diverge; the merchant should act per model.
  by_model?: Record<
    string,
    { appeared: number; total: number; rate: number | null }
  >;
  // Per-query model divergence (won in one model, lost in another).
  model_divergence?: { query: string; won: string[]; lost: string[] }[];
}

export interface ChannelAppearanceChannel {
  host: string;
  type: string;
  type_label: string;
  is_own_site: boolean;
  is_your_listing?: boolean;
  cited_query_count: number;
  total_queries: number;
  times_cited?: number;
  intents_cited?: string[];
}

export interface ChannelAppearance {
  total_queries: number;
  own_site_host?: string | null;
  // No host cited + brand never appeared anywhere = the AI didn't ground any
  // answer this run → couldn't measure, not "appears on no channel".
  grounding_unavailable?: boolean;
  // Your OWN domain cited as a source (the honest "are you the answer?").
  own_site_cited: boolean;
  own_site_cited_count: number;
  // Softer signal: AI named your brand somewhere (often via a channel).
  brand_mentioned_count: number;
  channels: ChannelAppearanceChannel[];
}

// Per-dimension median/p25/p75 across the audited SKUs. Values are null when no
// SKU produced a score for that dimension (e.g. all blocked / pre-index).
export interface BrandDimensionStat {
  median: number | null;
  p25: number | null;
  p75: number | null;
  // Merchant-safe display for the median (band pill + meaning), plus a plain
  // "X of Y SKUs at or above the median" framing to replace raw P25/P75 jargon.
  band?: SkuScoreBand | 'unscored';
  band_label?: string;
  meaning?: string;
  dimension_label?: string;
  question?: string;
  above_count?: number;
  total_count?: number;
}

export interface BrandDimensionStats {
  identity: BrandDimensionStat;
  content_richness: BrandDimensionStat;
  routability: BrandDimensionStat;
  citation: BrandDimensionStat;
}

// Backend `build_brand_rollup` priority queue entry. The composite rank is
// `priority_score` (NOT `score`); `dimension_score` is the weakest dimension's
// raw score. impact × gap × fixability feed priority_score.
export interface BrandPriorityQueueEntry {
  sku_key: string;
  product_key?: string;
  impact: number;
  gap: number;
  fixability: number;
  dimension?: string;
  dimension_score?: number;
  bucket?: string;
  reason?: string | null;
  priority_score: number;
}

// Brand-level state for the per-SKU audit. blocked_pre_index / insufficient_signal
// are honest "no citation signal yet" states — NOT a bottom-tier "invisible" verdict.
export type BrandState = 'scored' | 'blocked_pre_index' | 'insufficient_signal';

// Per-model brand rollup (citation_by_provider[provider]), derived from the
// per-SKU data. One entry today (Gemini); fills in as providers are enabled.
export interface BrandProviderCitation {
  median: number | null;
  p25: number | null;
  p75: number | null;
  skus_scored: number;
  skus_cited: number;
  prompts: number;
}

// Issue #902 — brand rollup of the per-SKU Google indexing arcs. How many
// audited SKUs sit on freshly-minted Pivota canonical PDPs still inside Google's
// 30-90d indexing window, so a merchant reads zero category citations there as
// indexing latency, not a content gap. (The per-SKU shape is
// AgentCenterBdIndexingArcState; this is the brand-level rollup.)
export interface BrandIndexingArcRollup {
  skus_on_canonical_pdp: number;
  phase_counts: Record<string, number>;
  skus_still_indexing: number;
  recheck_on_or_after: string | null;
  caveat: string;
}

// Issue #902 — brand-level integration status + CTAs (the GSC-connect button).
// `actions` is the legacy merchant_view integration/GSC action ladder: the
// "Complete Pivota integration" action when store/PSP is incomplete, else the
// "Grant GSC access" CTA when Search Console isn't connected.
export interface AgentCenterIntegrationBlock {
  gsc_integrated: boolean;
  store_platform_integrated: boolean;
  psp_integrated: boolean;
  fully_integrated: boolean;
  actions: AgentCenterBdActionItem[];
}

export interface AgentCenterBrandRollup {
  // Backend shape: { dimensions: { identity: {median,p25,p75}, ... } }.
  // (NOT a top-level median/p25/p75 keyed by dimension — that mismatch crashed
  // the per-SKU dashboard once real reports started flowing.)
  dimensions: BrandDimensionStats;
  winning_skus_by_citation: string[];
  winning_skus_by_band: string[];
  blocked_skus: string[];
  priority_queue: BrandPriorityQueueEntry[];
  // Retailer-aware model (R0): derived from the catalog. 'reseller' = the merchant
  // sells other brands' products (the audit measures the STORE, not those brands);
  // 'brand' = a D2C brand auditing its own products. Absent on pre-R0 runs.
  merchant_type?: 'reseller' | 'brand' | string;
  // R3: the retailer win — for buy-intent queries, is the STORE the AI-routed buy
  // path, and who does AI route to instead. Absent on pre-R3 runs.
  store_as_destination?: {
    rate: number;
    cited: number;
    total: number;
    routed_to_instead: { host: string; role?: string | null; times_cited?: number }[];
  };
  // C3: for a reseller, the winning competitor products AI names that the merchant
  // does NOT carry — a stocking/sourcing signal. Absent on non-reseller / pre-C3 runs.
  winning_products_not_carried?: {
    name: string;
    times_named: number;
    example_queries: string[];
  }[];
  brand_state?: BrandState;
  brand_verdict_label?: string;
  brand_verdict_explanation?: string;
  citation_by_provider?: Record<string, BrandProviderCitation>;
  // Step 2: citation rate by fine intent axis (head/problem/constraint/trust/nav) —
  // WHERE the brand is cited by question TYPE. Snapshot-only; absent on pre-Step-2 runs.
  citation_by_intent?: Record<
    string,
    { cited: number; total: number; rate: number; skus?: number }
  >;
  // Phase 2 niche-targeting: where the brand can win (open lanes) vs the
  // flagship-owned head terms to stop fighting.
  where_you_can_win?: WhereYouCanWin;
  // Win-the-specific-long-tail (Step 2): the engine's computed-but-unprobed
  // winnable niches, surfaced as prompts the merchant can 1-click add to test.
  // Absent on pre-Step-2 runs; has_prompts=false when nothing un-probed remains.
  suggested_prompts?: SuggestedPrompts;
  // Issue #902: per-SKU Google indexing-arc rolled up to the brand. Optional +
  // best-effort on the backend; null when no audited SKU has a canonical-PDP arc.
  indexing_arc?: BrandIndexingArcRollup | null;
  // Issue #902: integration status + CTAs (GSC-connect / onboarding). Optional +
  // best-effort; null when the integration lookup failed.
  integration?: AgentCenterIntegrationBlock | null;
  // Step 3: run-over-run performance trend for this per_sku audit. null on the
  // first audit (no prior per_sku run). Same history shape as merchant_view.tracking.
  tracking?: {
    history?: {
      audits_in_history: number;
      most_recent_audit?: {
        run_id?: string | null;
        requested_at?: string | null;
        visibility?: number | null;
        attribution?: number | null;
        category_visibility?: number | null;
        // Per-engine visibility median for the most-recent run. Frontier models
        // cite different sources, so we track each separately. null/absent on
        // older runs that predate per-model history.
        by_model?: AuditByModel | null;
      } | null;
      delta_from_most_recent?: {
        visibility?: number | null;
        attribution?: number | null;
        category_visibility?: number | null;
        days_since_last_audit?: number | null;
        // Per-engine delta (current run minus most-recent prior run).
        by_model?: AuditByModel | null;
      } | null;
      series?: {
        requested_at?: string | null;
        visibility?: number | null;
        attribution?: number | null;
        category_visibility?: number | null;
        // Per-engine visibility median for this point in the series.
        by_model?: AuditByModel | null;
      }[];
    } | null;
  } | null;
}

// Per-engine visibility medians. Keys are provider slugs (gemini, chatgpt, …);
// each value is a 0-100 median visibility or null when that engine wasn't run.
export interface AuditByModel {
  gemini?: number | null;
  chatgpt?: number | null;
  [provider: string]: number | null | undefined;
}

// The verbatim AI answer behind a query (the proof) — forwarded from per_prompt
// cited_evidence by build_where_you_can_win.
export interface WhereYouCanWinEvidence {
  excerpt: string;
  cited_hosts?: string[];
  provider?: string | null;
}

export interface WhereYouCanWinTarget {
  query: string;
  normalized_query?: string;
  sku: string;
  sku_key?: string;
  attribute_fit?: number | null;
  demand_state?: string | null;
  opportunity_score?: number;
  why_you_fit?: string | null;
  evidence?: WhereYouCanWinEvidence | null;
  // The "why winnable" decomposition (each 0-1) behind opportunity_score.
  opportunity_factors?: {
    attribute_fit?: number | null;
    demand?: number | null;
    low_competition?: number | null;
    intent?: number | null;
  } | null;
  action?: string;
  // Phase 2 v2: cross-merchant recurrence (how many distinct brands this niche
  // recurs across) — populated when Pivota's audit history has data.
  recurrence?: { distinct_merchants: number; total_runs: number };
  // Phase 4: re-audit movement on this niche (won / holding / lost / still_open).
  movement?: 'won' | 'holding' | 'lost' | 'still_open' | 'shifted';
}

export interface WhereYouCanWinSkip {
  query: string;
  owned_by?: string | null;
  ownership_state?: string;
  demand_signal?: number;
  competitors_named?: string[];
  evidence?: WhereYouCanWinEvidence | null;
}

export type DemandProxy = 'probe' | 'recurrence' | 'community';

export interface WhereYouCanWin {
  targets: WhereYouCanWinTarget[];
  skip: WhereYouCanWinSkip[];
  has_targets: boolean;
  // Which demand-ranking lenses the operator can choose between. 'probe' is
  // always present; 'recurrence' appears once Pivota's cross-brand history has
  // data for these niches. 'community' is a future method.
  demand_proxies?: DemandProxy[];
  demand_proxy_default?: DemandProxy;
}

// Win-the-specific-long-tail (Step 2/3): the specific, attribute-stacked prompts
// the engine BUILT from a SKU's evidenced attributes but did NOT probe this audit
// — the winnable niches the merchant can 1-click add to test next. Disjoint from
// WhereYouCanWin.targets (those are probed open lanes; these are un-probed).
export interface SuggestedPrompt {
  query: string;
  normalized_query?: string;
  sku?: string | null;
  sku_key?: string | null;
  attribute_basis?: string[];
  intent_weight?: number;
  source?: string;
}

export interface SuggestedPrompts {
  prompts: SuggestedPrompt[];
  has_prompts: boolean;
  rationale?: string;
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

// Fix 2 — brand-level findability-vs-endorsement rollup the backend computes on
// `authority_map.host_attribution_summary`. Findability = the merchant's own
// site + its product listed on a marketplace (distribution); endorsement = an
// independent third party recommending it (the only honest "AI recommends you"
// signal). Kept apart so "your listing is indexed" never reads as endorsement.
/** C1 — a competitor channel AI cites instead of the merchant, with a display
 * label + how-to-compete advice keyed on the host's merchant-relative role. */
export interface ChannelToCompete {
  host: string;
  role?: string;
  role_label?: string;
  how_to_compete?: string;
  times_cited?: number;
}

export interface HostAttributionSummary {
  distinct_hosts: number;
  by_role: Record<string, number>;
  findability_hosts: string[];
  endorsement_hosts: string[];
  /** Independent hosts that cited the brand on a category/discovery query —
   * the only "recommended for the category" evidence. */
  endorsement_category_hosts: string[];
  competitor_hosts: string[];
  has_independent_endorsement: boolean;
  independently_recommended_for_category: boolean;
  /** Cited, but only through own/retail listings — never independently
   * endorsed. Drives the "listed, not recommended" badge. */
  surfaced_only_via_own_listing: boolean;
  /** Cited as a grounding source but did NOT name the merchant. */
  cited_not_naming_hosts?: string[];
  /** C1 — the same "cited instead" hosts, enriched with a role label + a
   * per-channel how-to-compete action. Each is a competitor channel to watch. */
  channels_ai_cites_instead?: ChannelToCompete[];
}

export interface AgentCenterAuthorityMap {
  per_sku: Record<string, AuthorityPerSkuEntry>;
  /** Fix 2 brand rollup. Optional: older runs (pre-Fix-2) omit it. */
  host_attribution_summary?: HostAttributionSummary;
}

// Per-provider call/token telemetry. Backend `cost_summary.providers` is an
// array of these — NOT a list of provider-name strings.
export interface CostSummaryProvider {
  provider: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

// Backend `report_jsonb.cost_summary` — LLM call/token telemetry (not credit
// accounting; the credit debit lives on the run's cost_summary_jsonb column).
export interface AgentCenterCostSummary {
  prompts: number;
  llm_calls?: number;
  providers: CostSummaryProvider[];
  total_input_tokens?: number;
  total_output_tokens?: number;
  provider_models?: Record<
    string,
    { model: string; default_model?: string; model_is_override?: boolean }
  >;
  model_is_override?: boolean;
}

// ── "Your Prompts" — per-lane results for the merchant's custom prompts.
// The merchant's custom prompt slots are probed once (axis="custom") but the
// per-SKU scorecard only scores the auto-generated queries, so the backend
// `build_custom_prompt_results` turns them into an open-vs-contested-lane table:
// per prompt, was the brand cited, who the AI grounded in, who won the lane.
//
//   open      — brand cited, low competition (the lane to defend/scale)
//   contested — brand cited, but crowded with competitors
//   absent    — AI answered with sources but never the brand (competitors own it)
//   no_signal — the prompt didn't probe / returned no grounding (thin demand)
export type CustomPromptLane = 'open' | 'contested' | 'absent' | 'no_signal';

export interface CustomPromptResult {
  prompt: string;
  /** Did the brand appear as a grounding source for ≥1 provider run. */
  cited: boolean;
  lane: CustomPromptLane;
  /** How many provider probes ran this prompt. */
  runs: number;
  /** Of those, how many cited the brand. */
  runs_cited: number;
  /** Grounding source labels where the brand itself appeared. */
  cited_sources: string[];
  /** All distinct sources the AI grounded in for this prompt. */
  grounding_sources: string[];
  /** Competitor brand/retailer labels the AI named instead, ranked. */
  competitors: string[];
  competitors_count: number;
  evidence_excerpt: string | null;
}

// ── Fix 3 — merchant-grade narrative. The decision-grade story assembled from
// the Fix 1 resolved hosts + Fix 2 findability/endorsement split + verify
// rollup + the Fix 4 win-plan rollup. Every field is honest-by-construction on
// the backend: absent data degrades to "not available" strings, never fabricated.

export interface NarrativeEvidenceExcerpt {
  sku_title: string | null;
  query: string | null;
  excerpt: string;
  source_labels: string[];
}

export interface NarrativeWhatsWorking {
  summary: string;
  findability_hosts: string[];
  branded_navigational_probes: number;
  category_discovery_probes: number;
  evidence_excerpt: NarrativeEvidenceExcerpt | null;
}

export interface WhoAiCitesInsteadHost {
  host: string;
  citation_role: string | null;
  recommendation_class: string | null;
  prompts_cited_count: number;
  cited_on_category_query: boolean;
}

export interface WhoAiCitesInstead {
  available: boolean;
  cited_hosts: WhoAiCitesInsteadHost[];
  competitors: { name: string; times_named: number }[];
  note: string | null;
}

// Fix 4 — brand rollup of the per-SKU win-plan, surfaced inside "where you're
// losing" so the narrative names the path to winning, not just the loss.
export interface WinPlanSummary {
  summary: string;
  losing_category_queries: number;
  independent_hosts_to_win: string[];
  /** Hosts with a one-click pitch actually rendered (email + template). */
  pitch_ready_hosts: string[];
}

export interface NarrativeWhereYoureLosing {
  summary: string;
  independently_recommended_for_category: boolean;
  endorsement_hosts: string[];
  who_ai_cites_instead: WhoAiCitesInstead;
  win_plan_summary: WinPlanSummary | null;
}

export interface NarrativeScorecardRow {
  sku_key: string;
  sku_title: string | null;
  band: string | null;
  status: string | null;
  what_it_means: string | null;
  surfaced_only_via_own_listing: boolean;
  independently_recommended_for_category: boolean;
}

export interface NarrativeFlaggedExample {
  /** The shopper query whose AI answer DeepSeek flagged. */
  query: string;
  /** AI misstated a fact about the product. */
  misstates_facts: boolean;
  /** The AI answer didn't actually support recommending this merchant. */
  unsupported_recommendation: boolean;
  /** DeepSeek's short explanation of the accuracy issue. */
  note: string;
}

export interface NarrativeVerifyPlain {
  status: string;
  verified: number;
  flagged: number;
  checked: number;
  candidates: number;
  text: string;
  /** The specific flagged citations behind `flagged` — which query + why.
   *  Optional: older reports (pre-surfacing) won't carry it. */
  flagged_examples?: NarrativeFlaggedExample[];
}

export interface NarrativePrioritizedAction {
  sku_title: string | null;
  primary_gap: string | null;
  headline: string;
  first_move: string | null;
  why_this_first: string | null;
  growth_phase: string;
  growth_phase_label: string;
}

export interface AgentCenterMerchantNarrative {
  headline_story: string;
  whats_working: NarrativeWhatsWorking;
  where_youre_losing: NarrativeWhereYoureLosing;
  per_sku_scorecard: NarrativeScorecardRow[];
  verify_summary_plain: NarrativeVerifyPlain;
  prioritized_actions: NarrativePrioritizedAction[];
  honest_limits: string[];
  verdict_label: string | null;
  verdict_explanation: string | null;
}

// ── Fix 4 — per-SKU win-plan: for each losing category query, the independent
// hosts AI grounds the answer in (the targets to get cited in), the competitor
// benchmark, the win condition, and the honest outreach path per target.

export type WinPlanOutreachState = 'draft_ready' | 'submission_only' | 'target_only';

export interface WinPlanPitchDraft {
  subject: string;
  body: string;
  /** P3-8: 'email' = one-click mailto; 'submission_form' = paste-ready draft
   * for the host's published form (recipient_email is null there). Older
   * reports predate the field — treat absent as 'email'. */
  channel?: 'email' | 'submission_form' | string;
  recipient_email: string | null;
  submission_url?: string | null;
  recipient_note: string | null;
}

export interface WinPlanOutreachRecipient {
  email: string | null;
  submission_url: string | null;
  note: string | null;
}

export interface WinPlanOutreach {
  state: WinPlanOutreachState;
  hint: string | null;
  cycle_weeks: [number, number] | null;
  recipient: WinPlanOutreachRecipient | null;
  /** The one-click pitch email — present only for draft_ready targets that also
   * have a matching playbook template. Never fabricated. */
  pitch_draft: WinPlanPitchDraft | null;
}

export interface WinPlanTarget {
  host: string;
  role: string | null;
  tier: number | null;
  applies_to_merchant_category: boolean | null;
  outreach: WinPlanOutreach;
}

export interface WinPlanLosingQuery {
  query: string;
  axis: string | null;
  /** The independent endorsement hosts AI grounds this answer in — the targets.
   * Empty when no nameable target (then `limit` explains why). */
  grounds_in: WinPlanTarget[];
  competitor_benchmark: string[];
  win_condition: string | null;
  limit: string | null;
}

export interface WinPlanSkuCoverage {
  losing_category_queries: number;
  queries_with_grounded_target: number;
  queries_with_draft_ready_target: number;
}

export interface WinPlanSkuPlan {
  sku_key: string;
  sku_title: string | null;
  losing_queries: WinPlanLosingQuery[];
  coverage: WinPlanSkuCoverage;
}

export interface WinPlanRollup {
  losing_category_queries: number;
  independent_hosts_to_win: string[];
  draft_ready_hosts: string[];
  pitch_ready_hosts: string[];
}

export interface AgentCenterWinPlan {
  available: boolean;
  note: string | null;
  sku_plans: WinPlanSkuPlan[];
  rollup: WinPlanRollup;
}

// A trend-friendly summary row from `GET /api/audits` (the run-history list).
// No full report — fetch that per run via getAuditRunDetail(run_id).
export interface AuditRunSummary {
  run_id: string | null;
  requested_at: string | null;
  completed_at: string | null;
  /** Top-level status column; per-SKU runs signal completion via `completed_at`
   * (this can be null mid-run). */
  status: string | null;
  product_keys: string[];
  verdict_labels: string[];
  visibility_score_avg: number | null;
  attribution_score_avg: number | null;
  category_visibility_score_avg: number | null;
  audited_via_pivota_canonical_count: number;
}

export interface AgentCenterPerSkuAuditResponse {
  audit_run_id: string;
  merchant_id: string;
  audit_mode: 'per_sku';
  per_sku_reports: AgentCenterPerSkuReport[];
  brand_rollup: AgentCenterBrandRollup;
  /** Present when the merchant added custom prompts to the audit. Absent on
   * runs with no custom prompts (or older runs before this surface shipped). */
  custom_prompts?: CustomPromptResult[];
  authority_map: AgentCenterAuthorityMap;
  /** Fix 3 narrative + Fix 4 win-plan. Optional + best-effort on the backend:
   * a malformed report degrades to null rather than sinking the audit, and
   * pre-Fix-3/4 runs omit them. */
  merchant_narrative?: AgentCenterMerchantNarrative | null;
  win_plan?: AgentCenterWinPlan | null;
  /** Audit→action→outcome loop: what changed at the hosts the prior audit told
   * the merchant to target. Optional + best-effort on the backend (omitted on
   * first audit / pre-loop runs, degrades to available:false rather than
   * sinking the report). */
  outreach_outcomes?: AgentCenterOutreachOutcomes | null;
  legacy_verdict: string;
  cost_summary: AgentCenterCostSummary;
}

// Spec §I — pre-flight cost preview before launching an audit. Returns
// projected probe count + estimated credits + current balance + a
// `sufficient` flag. The merchant decides; we never auto-shrink scope.

export type CreditPlanTier = 'free' | 'starter' | 'growth' | 'enterprise' | 'custom';

// Single-balance model (backend migration 091 collapsed the 3 wallets into one
// `credits` pool). The preview's current_balance returns {credits, allowance_credits, plan_tier}.
export interface MerchantCreditBalance {
  credits: number;
  allowance_credits?: number;
  plan_tier: CreditPlanTier;
}

export interface AuditPreviewGap {
  kind: 'audit' | 'prompt' | 'execution';
  required: number;
  available: number;
  short: number;
}

// Backend canonical provider ids. 'chatgpt' is the OpenAI Responses probe
// (model chat-latest); 'openai' kept as a legacy alias. 'chatgpt'/'claude' are
// premium (paid plan required); 'gemini' is free; 'deepseek' is verify-only.
export type AuditPreviewProvider = 'gemini' | 'deepseek' | 'claude' | 'chatgpt' | 'openai';

// Premium (paid-plan-gated) audit providers, mirrored from the backend
// coverage-profile config. Selecting one on a free plan yields a 402
// PremiumProviderRequiredError at launch.
export const PREMIUM_AUDIT_PROVIDERS: readonly AuditPreviewProvider[] = ['chatgpt', 'claude'];

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
  /** True when a PAID tier will run the excess on overage (sufficient stays
   * true — paid tiers aren't blocked; the overage bills after). */
  will_overage?: boolean;
  gaps: AuditPreviewGap[];
}

// Discriminated union so render-time exhaustiveness checks compile.
export type AgentCenterAuditResponse =
  | (AiReadinessAuditResponse & { audit_mode?: 'legacy' })
  | AgentCenterPerSkuAuditResponse;

// ── Report Summary Contract v1 ──────────────────────────────────────────────
// The condensed summary layer the backend attaches (dark) as `report_summary`
// on the URL-audit response — one shape consumed by the 3-page condensed view,
// the PPT export, and the homepage hero. Mirrors
// pivota-backend services/report_summary_builder.py (contract doc:
// docs/report_summary_contract_v1_2026-07-15.md). All prose is authored by the
// backend narrative layer and rendered verbatim — the client never re-derives
// a claim or a score.

/** One measured probe backing an action — only fields the probe actually
 * produced; the backend attaches these via real joins only (basis stamped). */
export interface ReportSummaryPromptEvidence {
  query: string;
  /** Generator stamp (llm_winnable/llm_scenario) — spec-matched by construction. */
  prompt_source?: string | null;
  axis?: string | null;
  provider?: string | null;
  reason?: string | null;
  evidence_run_id?: string | null;
  competitors_named?: string[] | null;
}

export interface ReportSummaryAction {
  action_id?: string | null;
  headline?: string | null;
  why_this_first?: string | null;
  first_move?: string | null;
  evidence_summary?: string | null;
  how_to_track?: string[];
  primary_gap?: string | null;
  growth_phase?: string | null;
  sku_title?: string | null;
  target_sku_key?: string | null;
  cta?: { label?: string; action?: string; target_sku_key?: string | null } | null;
  supporting_prompts?: ReportSummaryPromptEvidence[];
  /** 'evidence_used' (real join) or 'none' — never render prompts when 'none'. */
  supporting_prompts_basis?: string | null;
}

export interface ReportSummaryFinding {
  finding_id?: string | null;
  kind?: string | null;
  title?: string | null;
  severity?: 'high' | 'medium' | 'info' | string | null;
  evidence_summary?: string | null;
  supporting_prompts?: ReportSummaryPromptEvidence[];
}

export interface ReportSummaryScore {
  /** Raw 0–100 — kept for delta tracking; never re-derived client-side. */
  raw?: number | null;
  /** 0–10 at one decimal (backend-computed). */
  display?: number | null;
  scale_max?: number;
  band?: 'needs_work' | 'pass' | 'good' | 'excellent' | string | null;
  /** Pass/good/excellent cutoffs on the 0–10 scale (calibration pending). */
  band_thresholds?: number[];
  subscores?: { key: string; raw?: number | null; display?: number | null }[];
  delta?: {
    raw?: number | null;
    previous_audit_run_id?: string | null;
    days_since_last_audit?: number | null;
  } | null;
  /** Contract 1.2 — the weakest MEASURED dimension (drives the ⓘ popover). */
  weakest_dimension?: {
    key?: string | null;
    label?: string | null;
    raw?: number | null;
    display?: number | null;
  } | null;
  /** Dimensions this run type couldn't measure, excluded from the score. */
  unmeasured_excluded?: string[];
  /** Prewritten popover copy: weakest-link method + what wasn't counted. */
  explainer?: string | null;
}

export interface ReportSummarySkuRow {
  sku_key?: string | null;
  sku_title?: string | null;
  score?: ReportSummaryScore;
  band_display?: { band?: string; label?: string; meaning?: string } | null;
  primary_gap?: string | null;
  action_headline?: string | null;
  supporting_prompts?: ReportSummaryPromptEvidence[];
  supporting_prompts_basis?: string | null;
}

export interface ReportSummary {
  contract_version?: string;
  audit_run_id?: string | null;
  generated_at?: string | null;
  subject?: {
    type?: 'brand' | 'sku' | string;
    merchant_id?: string | null;
    merchant_name?: string | null;
  };
  score?: ReportSummaryScore;
  verdict?: {
    headline?: string | null;
    label?: string | null;
    explanation?: string | null;
    primary_gap?: string | null;
  };
  top_findings?: ReportSummaryFinding[];
  top_actions?: ReportSummaryAction[];
  competitive_snapshot?: {
    available?: boolean;
    top_cited_hosts?: string[];
    competitors_named?: string[];
    note?: string | null;
  };
  sku_summaries?: ReportSummarySkuRow[];
  meta?: {
    source?: string;
    audit_mode?: string | null;
    providers?: string[];
    verify_providers?: string[];
    products_audited?: number;
    actions_total?: number;
    honest_limits?: string[];
  };
}
