import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type {
  AgentCenterState,
  GMVAssuranceSnapshot,
  MerchantStore,
  ProductRecord,
  ProviderRegistry,
  PromptTemplate,
  StorePlatformConnection,
  UsageEvent,
} from "./types";

const DEMO_MERCHANT_ID = "merchant_demo";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

function nowIso() {
  return new Date().toISOString();
}

function configuredGeminiModel() {
  const configured = (process.env.PIVOTA_AGENT_CENTER_GEMINI_MODEL || "")
    .trim()
    .replace(/^models\//, "");

  if (!configured) {
    return DEFAULT_GEMINI_MODEL;
  }

  return configured === "gemini-3.0-flash-preview"
    ? "gemini-3-flash-preview"
    : configured;
}

function skincareProducts(): ProductRecord[] {
  return [
    {
      id: "prod_vitamin_c_serum",
      product_entity_id: "pe_vitamin_c_serum",
      sku: "sku_vitc_30ml",
      title: "Hydrating Vitamin C Serum",
      brand: "Demo Skincare Brand",
      category: "skincare",
      price: 42,
      currency: "USD",
      pdp_url: "https://demo.pivota.cc/products/hydrating-vitamin-c-serum",
      attributes: {
        vitamin_c: true,
        hydration: true,
        texture: "light serum",
      },
      pivota_attributes: {
        vitamin_c: true,
        hydration: true,
        agent_summary:
          "A lightweight vitamin C serum focused on glow and hydration.",
      },
      agent_summary:
        "A lightweight vitamin C serum focused on glow and hydration.",
      priority: "high",
    },
    {
      id: "prod_sensitive_moisturizer",
      product_entity_id: "pe_sensitive_moisturizer",
      sku: "sku_moist_sensitive_50ml",
      title: "Sensitive Skin Moisturizer",
      brand: "Demo Skincare Brand",
      category: "skincare",
      price: 36,
      currency: "USD",
      pdp_url: "https://demo.pivota.cc/products/sensitive-skin-moisturizer",
      attributes: {
        sensitive_skin: true,
        fragrance_free: true,
        moisturizer: true,
      },
      pivota_attributes: {
        moisturizer: true,
        agent_summary:
          "A gentle daily moisturizer. The sensitive-skin and fragrance-free claims need clearer structured attributes.",
      },
      agent_summary:
        "A gentle daily moisturizer for compromised or easily irritated skin.",
      priority: "high",
    },
    {
      id: "prod_beginner_retinol",
      product_entity_id: "pe_beginner_retinol",
      sku: "sku_retinol_beginner_30ml",
      title: "Beginner Retinol Cream",
      brand: "Demo Skincare Brand",
      category: "skincare",
      price: 48,
      currency: "USD",
      pdp_url: "https://demo.pivota.cc/products/beginner-retinol-cream",
      attributes: {
        retinol: true,
        beginner_friendly: true,
        nighttime: true,
      },
      pivota_attributes: {
        retinol: true,
        agent_summary:
          "A retinol cream positioned for first-time retinoid users.",
      },
      agent_summary:
        "A retinol cream positioned for first-time retinoid users.",
      priority: "medium",
    },
  ];
}

function providerRegistry(): ProviderRegistry[] {
  return [
    {
      provider: "gemini",
      status: "active",
      role: "baseline_provider",
      supports_structured_output: true,
      supports_web_grounding: true,
      supports_batch: true,
      default_model: configuredGeminiModel(),
      enabled_for_v1: true,
      credit_multiplier: 1,
    },
    {
      provider: "openai",
      status: "planned",
      role: "core_provider",
      supports_structured_output: true,
      supports_web_grounding: true,
      supports_batch: true,
      enabled_for_v1: false,
      credit_multiplier: 2,
    },
    {
      provider: "claude",
      status: "planned",
      role: "provider_and_evaluator",
      supports_structured_output: true,
      supports_batch: true,
      enabled_for_v1: false,
      credit_multiplier: 2,
    },
    {
      provider: "perplexity",
      status: "planned",
      role: "web_grounded_search_proxy",
      supports_web_grounding: true,
      supports_openai_compatible_client: true,
      enabled_for_v1: false,
      credit_multiplier: 2.5,
    },
    {
      provider: "copilot",
      status: "research_required",
      role: "enterprise_or_surface_specific_testing",
      enabled_for_v1: false,
      credit_multiplier: null,
    },
  ];
}

function promptTemplates(): PromptTemplate[] {
  return [
    {
      id: "general_recommendation_v1",
      template_type: "general_recommendation",
      version: 1,
      language: "en",
      prompt:
        'You are helping a consumer find products to buy.\n\nUser query:\n"{{query}}"\n\nReturn up to 5 recommended products. For each product include product_name, brand, rank, why_it_matches, likely_price_range, and purchase_path_present. Return only JSON matching the provided schema.',
      required_output_schema_id: "parsed_recommendation_v1",
      status: "active",
    },
    {
      id: "purchase_ready_v1",
      template_type: "purchase_ready",
      version: 1,
      language: "en",
      prompt:
        'A consumer is ready to buy.\n\nUser query:\n"{{query}}"\n\nRecommend products that are specific enough for a buyer to evaluate. Return only JSON matching the provided schema.',
      required_output_schema_id: "parsed_recommendation_v1",
      status: "active",
    },
    {
      id: "attribute_specific_v1",
      template_type: "attribute_specific",
      version: 1,
      language: "en",
      prompt:
        'Evaluate products for this attribute-specific shopping intent.\n\nUser query:\n"{{query}}"\n\nFocus on whether recommended products clearly satisfy the required attributes. Return only JSON matching the provided schema.',
      required_output_schema_id: "parsed_recommendation_v1",
      status: "active",
    },
    {
      id: "merchant_aware_evaluation_v1",
      template_type: "merchant_aware_evaluation",
      version: 1,
      language: "en",
      prompt:
        'You are evaluating whether the following product is a good match for the user shopping intent.\n\nUser query:\n"{{query}}"\n\nMerchant product data:\n{{merchant_product_data}}\n\nPivota unified PDP data:\n{{pivota_product_data}}\n\nReturn only JSON matching the provided schema.',
      required_output_schema_id: "parsed_recommendation_v1",
      status: "active",
    },
    {
      id: "pivota_pdp_readiness_v1",
      template_type: "pivota_pdp_readiness",
      version: 1,
      language: "en",
      prompt:
        'Evaluate whether this Pivota unified PDP is agent-ready for the user query.\n\nUser query:\n"{{query}}"\n\nPivota unified PDP:\n{{pivota_product_data}}\n\nReturn readiness, missing attributes, recommended updates, and confidence as JSON.',
      required_output_schema_id: "parsed_recommendation_v1",
      status: "active",
    },
  ];
}

function initialStores(createdAt: string): MerchantStore[] {
  return [
    {
      id: "store_shopify_us",
      merchant_id: DEMO_MERCHANT_ID,
      store_name: "Demo Skincare Shopify US",
      store_url: "https://demo.pivota.cc",
      platform: "shopify",
      market: "US",
      language: "en",
      currency: "USD",
      integration_status: "connected",
      primary_category: "skincare",
      competitor_brands: ["Competitor A", "Competitor B", "Competitor C"],
      competitor_products: [
        "Competitor Vitamin C Serum",
        "Barrier Repair Moisturizer",
        "Gentle Retinol Night Cream",
      ],
      products: skincareProducts(),
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];
}

function initialConnections(createdAt: string): StorePlatformConnection[] {
  return [
    {
      id: "conn_shopify_us",
      merchant_id: DEMO_MERCHANT_ID,
      store_id: "store_shopify_us",
      platform: "shopify",
      status: "connected",
      last_catalog_sync_at: createdAt,
      last_offer_sync_at: null,
      last_checkout_sync_at: null,
      capabilities: {
        catalog: true,
        pdp_urls: true,
        sku_variant_map: true,
        structured_attributes: true,
        offers: false,
        checkout: false,
        orders: false,
      },
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];
}

export function createInitialAgentCenterState(): AgentCenterState {
  const createdAt = nowIso();

  return {
    stores: initialStores(createdAt),
    connections: initialConnections(createdAt),
    scanTargets: [],
    readinessSnapshots: [],
    providers: providerRegistry(),
    queryClusters: [],
    promptTemplates: promptTemplates(),
    jobs: [],
    testRuns: [],
    results: [],
    parsedRecommendations: [],
    matches: [],
    scores: [],
    issues: [],
    merchantOffers: [],
    pivotaOffers: [],
    merchantCheckoutPaths: [],
    pivotaCheckoutPaths: [],
    retestPreparations: [],
    verificationRuns: [],
    productUnderstandingDiagnoses: [],
    offerExecutionDiagnoses: [],
    checkoutVerificationDiagnoses: [],
    issueResolutionPlans: [],
    gmvAssuranceSnapshots: [],
    demoFixtures: [],
    productionValidationRuns: [],
    usageEvents: [],
    usagePlan: {
      included_credits: 1000,
      budget_cap_credits: 1500,
    },
    counters: {},
  };
}

type ArrayKeys<T> = {
  [K in keyof T]: T[K] extends Array<unknown> ? K : never;
}[keyof T];

export type AgentCenterCollectionKey = ArrayKeys<AgentCenterState>;

type CollectionRecord<K extends AgentCenterCollectionKey> =
  AgentCenterState[K] extends Array<infer RecordType> ? RecordType : never;

type RecordLike = Record<string, unknown>;

type UsageEventFilters = {
  merchant_id?: string;
  store_id?: string;
  agent_type?: string;
  provider?: string;
};

type SnapshotFilters = {
  merchant_id?: string;
  store_id?: string;
  product_entity_id?: string;
};

const ARRAY_COLLECTION_KEYS: AgentCenterCollectionKey[] = [
  "stores",
  "connections",
  "scanTargets",
  "readinessSnapshots",
  "providers",
  "queryClusters",
  "promptTemplates",
  "jobs",
  "testRuns",
  "results",
  "parsedRecommendations",
  "matches",
  "scores",
  "issues",
  "merchantOffers",
  "pivotaOffers",
  "merchantCheckoutPaths",
  "pivotaCheckoutPaths",
  "retestPreparations",
  "verificationRuns",
  "productUnderstandingDiagnoses",
  "offerExecutionDiagnoses",
  "checkoutVerificationDiagnoses",
  "issueResolutionPlans",
  "gmvAssuranceSnapshots",
  "demoFixtures",
  "productionValidationRuns",
  "usageEvents",
];

const MUTATING_ARRAY_METHODS = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

function hasField(record: unknown, field: string, value?: string) {
  if (!record || typeof record !== "object") return false;
  const fieldValue = (record as RecordLike)[field];
  return typeof value === "undefined" ? Boolean(fieldValue) : fieldValue === value;
}

function mergeStateWithDefaults(state?: Partial<AgentCenterState>): AgentCenterState {
  const initial = createInitialAgentCenterState();
  if (!state || typeof state !== "object") return initial;

  const merged = {
    ...initial,
    ...state,
    usagePlan: {
      ...initial.usagePlan,
      ...(state.usagePlan || {}),
    },
    counters: {
      ...(state.counters || {}),
    },
  } as AgentCenterState;

  for (const key of ARRAY_COLLECTION_KEYS) {
    if (!Array.isArray(merged[key])) {
      (merged as unknown as Record<AgentCenterCollectionKey, unknown[]>)[key] =
        initial[key] as unknown[];
    }
  }

  return merged;
}

export interface AgentCenterRepository {
  readonly kind: "memory" | "persistent";
  getState(): AgentCenterState;
  replaceState(state: AgentCenterState): AgentCenterState;
  reset(): AgentCenterState;
  persist(): void;
  reload?(): AgentCenterState;
  list<K extends AgentCenterCollectionKey>(
    collection: K
  ): Array<CollectionRecord<K>>;
  getById<K extends AgentCenterCollectionKey>(
    collection: K,
    id: string
  ): CollectionRecord<K> | undefined;
  upsert<K extends AgentCenterCollectionKey>(
    collection: K,
    record: CollectionRecord<K>
  ): CollectionRecord<K>;
  deleteById<K extends AgentCenterCollectionKey>(collection: K, id: string): boolean;
  byMerchantId<K extends AgentCenterCollectionKey>(
    collection: K,
    merchantId: string
  ): Array<CollectionRecord<K>>;
  byStoreId<K extends AgentCenterCollectionKey>(
    collection: K,
    storeId: string
  ): Array<CollectionRecord<K>>;
  byScanTargetId<K extends AgentCenterCollectionKey>(
    collection: K,
    scanTargetId: string
  ): Array<CollectionRecord<K>>;
  byIssueId<K extends AgentCenterCollectionKey>(
    collection: K,
    issueId: string
  ): Array<CollectionRecord<K>>;
  byFixtureId<K extends AgentCenterCollectionKey>(
    collection: K,
    fixtureId: string
  ): Array<CollectionRecord<K>>;
  byProductionValidationRunId<K extends AgentCenterCollectionKey>(
    collection: K,
    runId: string
  ): Array<CollectionRecord<K>>;
  usageEventsBy(filters: UsageEventFilters): UsageEvent[];
  snapshotsBy(filters: SnapshotFilters): GMVAssuranceSnapshot[];
}

abstract class BaseAgentCenterRepository implements AgentCenterRepository {
  abstract readonly kind: "memory" | "persistent";

  protected state: AgentCenterState;

  constructor(state?: AgentCenterState) {
    this.state = mergeStateWithDefaults(state);
  }

  getState() {
    return this.state;
  }

  replaceState(state: AgentCenterState) {
    this.state = mergeStateWithDefaults(state);
    this.persist();
    return this.state;
  }

  reset() {
    return this.replaceState(createInitialAgentCenterState());
  }

  persist() {
    // Memory repositories intentionally keep state process-local.
  }

  list<K extends AgentCenterCollectionKey>(collection: K) {
    return this.state[collection] as Array<CollectionRecord<K>>;
  }

  getById<K extends AgentCenterCollectionKey>(collection: K, id: string) {
    return this.list(collection).find(
      (record) => hasField(record, "id", id) || hasField(record, "fixture_id", id)
    );
  }

  upsert<K extends AgentCenterCollectionKey>(
    collection: K,
    record: CollectionRecord<K>
  ) {
    const records = this.list(collection);
    const recordId =
      (record as RecordLike).id ||
      (record as RecordLike).fixture_id ||
      (record as RecordLike).idempotency_key;
    const existingIndex = records.findIndex((candidate) => {
      if (recordId && (candidate as RecordLike).id === recordId) return true;
      if (recordId && (candidate as RecordLike).fixture_id === recordId) return true;
      return (
        Boolean((record as RecordLike).idempotency_key) &&
        (candidate as RecordLike).idempotency_key ===
          (record as RecordLike).idempotency_key
      );
    });

    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }

    this.persist();
    return record;
  }

  deleteById<K extends AgentCenterCollectionKey>(collection: K, id: string) {
    const records = this.list(collection);
    const index = records.findIndex(
      (record) => hasField(record, "id", id) || hasField(record, "fixture_id", id)
    );
    if (index < 0) return false;
    records.splice(index, 1);
    this.persist();
    return true;
  }

  byMerchantId<K extends AgentCenterCollectionKey>(
    collection: K,
    merchantId: string
  ) {
    return this.list(collection).filter((record) =>
      hasField(record, "merchant_id", merchantId)
    );
  }

  byStoreId<K extends AgentCenterCollectionKey>(collection: K, storeId: string) {
    return this.list(collection).filter((record) => hasField(record, "store_id", storeId));
  }

  byScanTargetId<K extends AgentCenterCollectionKey>(
    collection: K,
    scanTargetId: string
  ) {
    return this.list(collection).filter((record) =>
      hasField(record, "scan_target_id", scanTargetId)
    );
  }

  byIssueId<K extends AgentCenterCollectionKey>(collection: K, issueId: string) {
    return this.list(collection).filter((record) => hasField(record, "issue_id", issueId));
  }

  byFixtureId<K extends AgentCenterCollectionKey>(
    collection: K,
    fixtureId: string
  ) {
    return this.list(collection).filter((record) =>
      hasField(record, "fixture_id", fixtureId)
    );
  }

  byProductionValidationRunId<K extends AgentCenterCollectionKey>(
    collection: K,
    runId: string
  ) {
    return this.list(collection).filter(
      (record) =>
        hasField(record, "production_validation_run_id", runId) ||
        hasField(record, "validation_run_id", runId) ||
        hasField(record, "id", runId)
    );
  }

  usageEventsBy(filters: UsageEventFilters) {
    return this.state.usageEvents.filter((event) =>
      Object.entries(filters).every(
        ([key, value]) =>
          typeof value === "undefined" ||
          (event as unknown as RecordLike)[key] === value
      )
    );
  }

  snapshotsBy(filters: SnapshotFilters) {
    return this.state.gmvAssuranceSnapshots.filter((snapshot) =>
      Object.entries(filters).every(
        ([key, value]) =>
          typeof value === "undefined" ||
          (snapshot as unknown as RecordLike)[key] === value
      )
    );
  }
}

export class InMemoryAgentCenterRepository extends BaseAgentCenterRepository {
  readonly kind = "memory" as const;
}

export class FileBackedAgentCenterRepository extends BaseAgentCenterRepository {
  readonly kind = "persistent" as const;

  private readonly filePath: string;
  private persistSuspended = false;

  constructor(filePath = defaultAgentCenterStateFile()) {
    super();
    this.filePath = filePath;
    this.state = this.wrapState(this.loadFromDisk());
  }

  replaceState(state: AgentCenterState) {
    this.persistSuspended = true;
    this.state = this.wrapState(mergeStateWithDefaults(state));
    this.persistSuspended = false;
    this.persist();
    return this.state;
  }

  reload() {
    this.persistSuspended = true;
    this.state = this.wrapState(this.loadFromDisk());
    this.persistSuspended = false;
    return this.state;
  }

  persist() {
    if (this.persistSuspended) return;
    const directory = dirname(this.filePath);
    mkdirSync(directory, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
    renameSync(tempPath, this.filePath);
  }

  private loadFromDisk() {
    if (!existsSync(this.filePath)) {
      return createInitialAgentCenterState();
    }

    try {
      return mergeStateWithDefaults(
        JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<AgentCenterState>
      );
    } catch {
      return createInitialAgentCenterState();
    }
  }

  private persistAfterMutation() {
    if (!this.persistSuspended) this.persist();
  }

  private wrapArray<T>(records: T[]) {
    const repository = this;
    return new Proxy(records, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (
          typeof property === "string" &&
          MUTATING_ARRAY_METHODS.has(property) &&
          typeof value === "function"
        ) {
          return (...args: unknown[]) => {
            const result = (value as (...methodArgs: unknown[]) => unknown).apply(
              target,
              args
            );
            repository.persistAfterMutation();
            return result;
          };
        }
        return value;
      },
      set(target, property, value, receiver) {
        const result = Reflect.set(target, property, value, receiver);
        repository.persistAfterMutation();
        return result;
      },
      deleteProperty(target, property) {
        const result = Reflect.deleteProperty(target, property);
        repository.persistAfterMutation();
        return result;
      },
    });
  }

  private wrapState(state: AgentCenterState) {
    const repository = this;
    for (const key of ARRAY_COLLECTION_KEYS) {
      (state as unknown as Record<AgentCenterCollectionKey, unknown[]>)[key] =
        this.wrapArray(state[key] as unknown[]);
    }

    return new Proxy(state, {
      set(target, property, value, receiver) {
        const key = property as AgentCenterCollectionKey;
        const nextValue =
          ARRAY_COLLECTION_KEYS.includes(key) && Array.isArray(value)
            ? repository.wrapArray(value)
            : value;
        const result = Reflect.set(target, property, nextValue, receiver);
        repository.persistAfterMutation();
        return result;
      },
    });
  }
}

function defaultAgentCenterStateFile() {
  return (
    process.env.AGENT_CENTER_STATE_FILE ||
    join(tmpdir(), "pivota-agent-center-state.json")
  );
}

function configuredStateBackend() {
  return process.env.AGENT_CENTER_STATE_BACKEND === "persistent"
    ? "persistent"
    : "memory";
}

declare global {
  // eslint-disable-next-line no-var
  var __pivotaAgentCenterRepository: AgentCenterRepository | undefined;
}

function createConfiguredRepository() {
  return configuredStateBackend() === "persistent"
    ? new FileBackedAgentCenterRepository()
    : new InMemoryAgentCenterRepository();
}

export function getAgentCenterRepository() {
  if (!globalThis.__pivotaAgentCenterRepository) {
    globalThis.__pivotaAgentCenterRepository = createConfiguredRepository();
  }

  return globalThis.__pivotaAgentCenterRepository;
}

export function setAgentCenterRepositoryForTests(
  repository?: AgentCenterRepository
) {
  globalThis.__pivotaAgentCenterRepository =
    repository || new InMemoryAgentCenterRepository();
  return globalThis.__pivotaAgentCenterRepository;
}

export function getAgentCenterState() {
  return getAgentCenterRepository().getState();
}

export function resetAgentCenterState() {
  return getAgentCenterRepository().reset();
}

export function persistAgentCenterState() {
  getAgentCenterRepository().persist();
}

export function nextId(prefix: string) {
  const state = getAgentCenterState();
  state.counters[prefix] = (state.counters[prefix] || 0) + 1;
  persistAgentCenterState();
  return `${prefix}_${String(state.counters[prefix]).padStart(4, "0")}`;
}

export function touch<T extends { updated_at?: string }>(record: T): T {
  record.updated_at = nowIso();
  persistAgentCenterState();
  return record;
}

export { DEFAULT_GEMINI_MODEL, DEMO_MERCHANT_ID, nowIso };
