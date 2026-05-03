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
  DemoFixture,
  GMVAssuranceSnapshot,
  MerchantStore,
  ProductRecord,
  ProductionValidationRun,
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
    pivotaOptimizationPatches: [],
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

type AgentCenterRepositoryKind = "memory" | "persistent" | "db";

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
  "pivotaOptimizationPatches",
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
  readonly kind: AgentCenterRepositoryKind;
  getState(): AgentCenterState;
  replaceState(state: AgentCenterState): AgentCenterState;
  reset(): AgentCenterState;
  persist(): void;
  reload?(): AgentCenterState;
  hydrate?(): Promise<AgentCenterState>;
  flush?(): Promise<void>;
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
  abstract readonly kind: AgentCenterRepositoryKind;

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

type PersistedCollectionKey =
  | "stores"
  | "scanTargets"
  | "issues"
  | "productUnderstandingDiagnoses"
  | "offerExecutionDiagnoses"
  | "checkoutVerificationDiagnoses"
  | "gmvAssuranceSnapshots"
  | "issueResolutionPlans"
  | "usageEvents"
  | "productionValidationRuns"
  | "demoFixtures";

const DB_COLLECTION_TABLES: Record<PersistedCollectionKey, string> = {
  stores: "agent_center_merchant_stores",
  scanTargets: "agent_center_scan_targets",
  issues: "agent_center_issues",
  productUnderstandingDiagnoses:
    "agent_center_product_understanding_diagnoses",
  offerExecutionDiagnoses: "agent_center_offer_execution_diagnoses",
  checkoutVerificationDiagnoses:
    "agent_center_checkout_verification_diagnoses",
  gmvAssuranceSnapshots: "agent_center_gmv_assurance_snapshots",
  issueResolutionPlans: "agent_center_issue_resolution_plans",
  usageEvents: "agent_center_usage_events",
  productionValidationRuns: "agent_center_production_validation_runs",
  demoFixtures: "agent_center_demo_fixtures",
};

const DB_COLLECTION_KEYS = Object.keys(
  DB_COLLECTION_TABLES
) as PersistedCollectionKey[];

type PgPoolLike = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: RecordLike[] }>;
};

let agentCenterDbPoolPromise: Promise<PgPoolLike> | null = null;

function configuredDbSchema() {
  const schema = (process.env.AGENT_CENTER_DB_SCHEMA || "agent_center").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("AGENT_CENTER_DB_SCHEMA must be a valid SQL identifier");
  }
  return schema;
}

function qualifiedTable(collection: PersistedCollectionKey) {
  const schema = configuredDbSchema();
  return `"${schema}"."${DB_COLLECTION_TABLES[collection]}"`;
}

async function getAgentCenterDbPool() {
  if (!agentCenterDbPoolPromise) {
    agentCenterDbPoolPromise = (async () => {
      const connectionString = (
        process.env.AGENT_CENTER_DATABASE_URL ||
        process.env.DATABASE_URL ||
        ""
      ).trim();
      if (!connectionString) {
        throw new Error(
          "AGENT_CENTER_STATE_BACKEND=db requires AGENT_CENTER_DATABASE_URL"
        );
      }
      const { Pool } = await import("pg");
      const sslEnabled =
        process.env.AGENT_CENTER_DB_SSL === "true" ||
        (process.env.AGENT_CENTER_DB_SSL !== "false" &&
          /sslmode=require/i.test(connectionString));
      return new Pool({
        connectionString,
        ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
        max: Number(process.env.AGENT_CENTER_DB_POOL_MAX || 3),
      }) as PgPoolLike;
    })();
  }

  return agentCenterDbPoolPromise;
}

function recordValue(record: unknown, field: string) {
  return record && typeof record === "object"
    ? ((record as RecordLike)[field] as string | undefined)
    : undefined;
}

function firstString(values: unknown) {
  return Array.isArray(values) && typeof values[0] === "string"
    ? values[0]
    : undefined;
}

function statusForRecord(collection: PersistedCollectionKey, record: RecordLike) {
  if (collection === "stores") return record.integration_status as string | undefined;
  if (collection === "demoFixtures") return record.cleanup_status as string | undefined;
  return record.status as string | undefined;
}

function productEntityForRecord(collection: PersistedCollectionKey, record: RecordLike) {
  return (
    (record.product_entity_id as string | undefined) ||
    firstString(record.affected_product_entities) ||
    (collection === "productionValidationRuns"
      ? (record.pivota_product_entity_id as string | undefined)
      : undefined)
  );
}

function runIdForRecord(collection: PersistedCollectionKey, record: RecordLike) {
  return (
    (record.production_validation_run_id as string | undefined) ||
    (collection === "productionValidationRuns"
      ? (record.id as string | undefined)
      : undefined)
  );
}

function fixtureIdForRecord(record: RecordLike) {
  return record.fixture_id as string | undefined;
}

function rowValuesForRecord(
  collection: PersistedCollectionKey,
  record: CollectionRecord<PersistedCollectionKey>
) {
  const value = record as RecordLike;
  const createdAt = (value.created_at as string | undefined) || nowIso();
  const updatedAt = (value.updated_at as string | undefined) || createdAt;
  const deletedAt =
    (value.deleted_at as string | undefined) ||
    (collection === "productionValidationRuns" && value.status === "deleted"
      ? (value.deleted_at as string | undefined) || updatedAt
      : undefined);

  return {
    id: String(value.id || value.fixture_id),
    merchant_id: recordValue(value, "merchant_id"),
    store_id: recordValue(value, "store_id"),
    scan_target_id: recordValue(value, "scan_target_id"),
    issue_id: recordValue(value, "issue_id"),
    fixture_id: fixtureIdForRecord(value),
    production_validation_run_id: runIdForRecord(collection, value),
    product_entity_id: productEntityForRecord(collection, value),
    agent_type: recordValue(value, "agent_type") || recordValue(value, "source_agent"),
    provider: recordValue(value, "provider"),
    status: statusForRecord(collection, value),
    idempotency_key: recordValue(value, "idempotency_key"),
    workflow_type: recordValue(value, "workflow_type"),
    event_type: recordValue(value, "event_type"),
    billing_mode: recordValue(value, "billing_mode"),
    billing_status: recordValue(value, "billing_status"),
    quantity:
      typeof value.quantity === "number" || typeof value.quantity === "string"
        ? value.quantity
        : undefined,
    environment: recordValue(value, "environment"),
    preset: recordValue(value, "preset"),
    cleanup_status: recordValue(value, "cleanup_status"),
    readiness_level: recordValue(value, "readiness_level"),
    payload: value,
    created_at: createdAt,
    updated_at: updatedAt,
    deleted_at: deletedAt || null,
    completed_at: recordValue(value, "completed_at"),
    expires_at: recordValue(value, "expires_at"),
  };
}

function deriveCounters(state: AgentCenterState) {
  const counters: Record<string, number> = { ...state.counters };
  for (const key of ARRAY_COLLECTION_KEYS) {
    for (const record of state[key] as Array<RecordLike>) {
      for (const value of [record.id, record.fixture_id]) {
        if (typeof value !== "string") continue;
        const match = value.match(/^(.+)_([0-9]+)$/);
        if (!match) continue;
        counters[match[1]] = Math.max(counters[match[1]] || 0, Number(match[2]));
      }
    }
  }
  state.counters = counters;
}

export class DbAgentCenterRepository extends BaseAgentCenterRepository {
  readonly kind = "db" as const;

  private dirty = false;
  private hydrated = false;
  private persistSuspended = false;
  private baselineIds = new Map<PersistedCollectionKey, Set<string>>();

  constructor(state?: AgentCenterState) {
    super(state);
    this.state = this.wrapState(this.state);
  }

  replaceState(state: AgentCenterState) {
    this.persistSuspended = true;
    this.state = this.wrapState(mergeStateWithDefaults(state));
    this.persistSuspended = false;
    this.persist();
    return this.state;
  }

  persist() {
    if (!this.persistSuspended) this.dirty = true;
  }

  async hydrate() {
    const pool = await getAgentCenterDbPool();
    const hydratedState = createInitialAgentCenterState();
    this.baselineIds = new Map();
    for (const collection of DB_COLLECTION_KEYS) {
      const includeDeleted =
        collection === "productionValidationRuns" || collection === "demoFixtures";
      const result = await pool.query(
        `SELECT payload FROM ${qualifiedTable(collection)} ${
          includeDeleted ? "" : "WHERE deleted_at IS NULL"
        } ORDER BY created_at ASC`
      );
      (hydratedState as unknown as Record<PersistedCollectionKey, unknown[]>)[
        collection
      ] = result.rows.map((row) => row.payload);
      this.baselineIds.set(
        collection,
        new Set(result.rows.map((row) => String((row.payload as RecordLike).id)))
      );
    }
    deriveCounters(hydratedState);
    this.persistSuspended = true;
    this.state = this.wrapState(hydratedState);
    this.persistSuspended = false;
    this.dirty = false;
    this.hydrated = true;
    return this.state;
  }

  async flush() {
    if (!this.hydrated || !this.dirty) return;
    const pool = await getAgentCenterDbPool();
    for (const collection of DB_COLLECTION_KEYS) {
      await this.flushCollection(pool, collection);
    }
    this.dirty = false;
  }

  private async flushCollection(
    pool: PgPoolLike,
    collection: PersistedCollectionKey
  ) {
    const table = qualifiedTable(collection);
    const records = this.state[collection] as Array<
      CollectionRecord<PersistedCollectionKey>
    >;
    const activeIds = new Set<string>();
    for (const record of records) {
      const row = rowValuesForRecord(collection, record);
      activeIds.add(row.id);
      await pool.query(
        `INSERT INTO ${table} (
          id, merchant_id, store_id, scan_target_id, issue_id, fixture_id,
          production_validation_run_id, product_entity_id, agent_type, provider,
          status, idempotency_key, workflow_type, event_type, billing_mode,
          billing_status, quantity, environment, preset, cleanup_status,
          readiness_level, payload, created_at, updated_at, deleted_at,
          completed_at, expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22::jsonb, $23, $24, $25,
          $26, $27
        )
        ON CONFLICT (id) DO UPDATE SET
          merchant_id = EXCLUDED.merchant_id,
          store_id = EXCLUDED.store_id,
          scan_target_id = EXCLUDED.scan_target_id,
          issue_id = EXCLUDED.issue_id,
          fixture_id = EXCLUDED.fixture_id,
          production_validation_run_id = EXCLUDED.production_validation_run_id,
          product_entity_id = EXCLUDED.product_entity_id,
          agent_type = EXCLUDED.agent_type,
          provider = EXCLUDED.provider,
          status = EXCLUDED.status,
          idempotency_key = EXCLUDED.idempotency_key,
          workflow_type = EXCLUDED.workflow_type,
          event_type = EXCLUDED.event_type,
          billing_mode = EXCLUDED.billing_mode,
          billing_status = EXCLUDED.billing_status,
          quantity = EXCLUDED.quantity,
          environment = EXCLUDED.environment,
          preset = EXCLUDED.preset,
          cleanup_status = EXCLUDED.cleanup_status,
          readiness_level = EXCLUDED.readiness_level,
          payload = EXCLUDED.payload,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          completed_at = EXCLUDED.completed_at,
          expires_at = EXCLUDED.expires_at`,
        [
          row.id,
          row.merchant_id || null,
          row.store_id || null,
          row.scan_target_id || null,
          row.issue_id || null,
          row.fixture_id || null,
          row.production_validation_run_id || null,
          row.product_entity_id || null,
          row.agent_type || null,
          row.provider || null,
          row.status || null,
          row.idempotency_key || null,
          row.workflow_type || null,
          row.event_type || null,
          row.billing_mode || null,
          row.billing_status || null,
          row.quantity || null,
          row.environment || null,
          row.preset || null,
          row.cleanup_status || null,
          row.readiness_level || null,
          JSON.stringify(row.payload),
          row.created_at,
          row.updated_at,
          row.deleted_at,
          row.completed_at || null,
          row.expires_at || null,
        ]
      );
    }

    const baselineIds = this.baselineIds.get(collection) || new Set<string>();
    const removedIds = [...baselineIds].filter((id) => !activeIds.has(id));
    if (removedIds.length > 0) {
      await pool.query(
        `UPDATE ${table}
         SET deleted_at = COALESCE(deleted_at, NOW()), updated_at = NOW()
         WHERE id = ANY($1::text[])`,
        [removedIds]
      );
    }
  }

  private persistAfterMutation() {
    if (!this.persistSuspended) this.dirty = true;
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
  const backend = process.env.AGENT_CENTER_STATE_BACKEND;
  if (backend === "db") return "db";
  if (backend === "persistent" || backend === "file") return "persistent";
  return "memory";
}

declare global {
  // eslint-disable-next-line no-var
  var __pivotaAgentCenterRepository: AgentCenterRepository | undefined;
}

function createConfiguredRepository() {
  const backend = configuredStateBackend();
  if (backend === "db") return new DbAgentCenterRepository();
  if (backend === "persistent") return new FileBackedAgentCenterRepository();
  return new InMemoryAgentCenterRepository();
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

let agentCenterRepositorySessionDepth = 0;

export async function withAgentCenterRepositorySession<T>(
  callback: () => T | Promise<T>
): Promise<T> {
  const repository = getAgentCenterRepository();
  if (repository.kind !== "db") {
    return callback();
  }

  const isRootSession = agentCenterRepositorySessionDepth === 0;
  agentCenterRepositorySessionDepth += 1;
  try {
    if (isRootSession) {
      await repository.hydrate?.();
    }
    return await callback();
  } finally {
    agentCenterRepositorySessionDepth -= 1;
    if (isRootSession) {
      await repository.flush?.();
    }
  }
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
