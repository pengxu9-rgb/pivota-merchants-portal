import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_CONFIG } from './config';

export type CommerceFunnelGroupBy =
  | 'product'
  | 'variant'
  | 'surface'
  | 'commerce_surface'
  | 'source_channel'
  | 'source_family'
  | 'protocol_name'
  | 'agent_id'
  | 'query_source'
  | 'llm_provider'
  | 'llm_model';

export interface CommerceFunnelParams {
  surface?: string;
  group_by?: CommerceFunnelGroupBy;
  source_channel?: string;
  source_family?: string;
  protocol_name?: string;
  agent_id?: string;
  query_source?: string;
  llm_provider?: string;
  llm_model?: string;
  commerce_surface?: string;
}

interface RequestOptions {
  timeoutMs?: number;
}

// Re-export `InsufficientCreditsError` (spec §I) from its standalone
// module so callers can keep importing it via the api-client surface.
// Lives in `./credit-errors.ts` to keep the smoke test runnable under
// node:test (which can't traverse the extensionless imports the
// api-client itself triggers).
export { InsufficientCreditsError } from './credit-errors';
import { InsufficientCreditsError } from './credit-errors';

function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

const ACTIVE_STORE_STATUSES = new Set(['active', 'connected']);
const REMOVED_STORE_STATUSES = new Set([
  'archived',
  'deleted',
  'disabled',
  'disconnected',
  'inactive',
  'removed',
]);

function normalizeBooleanFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'primary'].includes(value.trim().toLowerCase());
  }
  return false;
}

function normalizeStoreStatus(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeStoreTimestamp(value: unknown): number {
  if (!value) return 0;
  const timestamp = new Date(String(value)).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeConnectedStore(rawStore: any, index: number) {
  const platform = String(rawStore.platform || '').trim().toLowerCase();
  const domain = String(rawStore.domain || rawStore.store_url || rawStore.shop_domain || '').trim();
  const status = normalizeStoreStatus(rawStore.status);
  const id =
    rawStore.id ||
    rawStore.store_id ||
    rawStore.storeId ||
    `${platform || 'store'}-${domain || rawStore.name || rawStore.store_name || index}`;
  const isActive =
    normalizeBooleanFlag(rawStore.is_active) ||
    ACTIVE_STORE_STATUSES.has(status);
  const isPrimary =
    normalizeBooleanFlag(rawStore.is_primary) ||
    normalizeBooleanFlag(rawStore.isPrimary) ||
    normalizeBooleanFlag(rawStore.primary) ||
    normalizeBooleanFlag(rawStore.is_default) ||
    normalizeBooleanFlag(rawStore.isDefault) ||
    normalizeBooleanFlag(rawStore.primary_store);

  return {
    id: String(id),
    store_id: String(id),
    platform,
    name: rawStore.name || rawStore.store_name || domain || 'Store',
    store_name: rawStore.name || rawStore.store_name || domain || 'Store',
    domain,
    status: rawStore.status,
    is_active: isActive,
    is_primary: isPrimary,
    product_count: rawStore.product_count ?? 0,
    last_sync: rawStore.last_sync || null,
    connected_at: rawStore.connected_at || null,
    updated_at: rawStore.updated_at || null,
  };
}

function normalizeConnectedStores(rawStores: any[]) {
  const stores = rawStores
    .map((store, index) => normalizeConnectedStore(store, index))
    .filter((store) => !REMOVED_STORE_STATUSES.has(normalizeStoreStatus(store.status)));

  const dedupedById = new Map<string, (typeof stores)[number]>();
  for (const store of stores) {
    const existing = dedupedById.get(store.id);
    if (!existing) {
      dedupedById.set(store.id, store);
      continue;
    }
    const existingTimestamp = Math.max(
      normalizeStoreTimestamp(existing.updated_at),
      normalizeStoreTimestamp(existing.connected_at),
    );
    const nextTimestamp = Math.max(
      normalizeStoreTimestamp(store.updated_at),
      normalizeStoreTimestamp(store.connected_at),
    );
    if ((store.is_primary && !existing.is_primary) || nextTimestamp >= existingTimestamp) {
      dedupedById.set(store.id, store);
    }
  }

  const dedupedByLocation = new Map<string, (typeof stores)[number]>();
  for (const store of dedupedById.values()) {
    const locationKey =
      store.platform && store.domain
        ? `${store.platform}:${store.domain.toLowerCase()}`
        : store.id;
    const existing = dedupedByLocation.get(locationKey);
    if (!existing) {
      dedupedByLocation.set(locationKey, store);
      continue;
    }
    const existingTimestamp = Math.max(
      normalizeStoreTimestamp(existing.updated_at),
      normalizeStoreTimestamp(existing.connected_at),
    );
    const nextTimestamp = Math.max(
      normalizeStoreTimestamp(store.updated_at),
      normalizeStoreTimestamp(store.connected_at),
    );
    if ((store.is_primary && !existing.is_primary) || nextTimestamp >= existingTimestamp) {
      dedupedByLocation.set(locationKey, store);
    }
  }

  const primarySeen = { value: false };
  return Array.from(dedupedByLocation.values()).map((store) => {
    if (!store.is_primary) return store;
    if (primarySeen.value) return { ...store, is_primary: false };
    primarySeen.value = true;
    return store;
  }).sort((left, right) => {
    if (left.is_primary !== right.is_primary) return left.is_primary ? -1 : 1;
    return (
      Math.max(normalizeStoreTimestamp(right.updated_at), normalizeStoreTimestamp(right.connected_at)) -
      Math.max(normalizeStoreTimestamp(left.updated_at), normalizeStoreTimestamp(left.connected_at))
    );
  });
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        console.log(`🔄 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        console.log(`✅ API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error: AxiosError) => {
        const detailCode =
          (error.response?.data as any)?.detail?.code ||
          (error.response?.data as any)?.code;
        const isExpectedOptimizationConflict =
          error.response?.status === 409 &&
          detailCode === 'OPTIMIZATION_PLAN_SUPERSEDED';

        if (!isExpectedOptimizationConflict) {
          console.error(`❌ API Error: ${error.response?.status} ${error.config?.url}`);
        }
        
        if (error.response?.status === 401) {
          // Keep login failure feedback visible on /login.
          // Redirect only for authenticated-page 401s.
          const requestUrl = String(error.config?.url || '');
          const isLoginRequest =
            requestUrl.includes(API_CONFIG.ENDPOINTS.LOGIN) ||
            requestUrl.includes('/api/auth/login');
          const isLoginPage =
            typeof window !== 'undefined' && window.location.pathname === '/login';

          if (!isLoginRequest && !isLoginPage) {
            this.clearAuth();
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  private getAuthToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('merchant_token');
    }
    return null;
  }

  private clearAuth(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('merchant_token');
      localStorage.removeItem('merchant_user');
      localStorage.removeItem('merchant_id');
    }
  }

  private normalizeEmail(value?: string): string {
    return (value || '').trim().toLowerCase();
  }

  private normalizeMerchantOrdersParams(params?: Record<string, unknown>) {
    const normalized: Record<string, unknown> = { ...(params || {}) };

    const limit = Number(normalized.limit);
    if (Number.isFinite(limit) && limit > 0) {
      // The merchant orders route currently enforces limit <= 100.
      normalized.limit = Math.min(Math.trunc(limit), 100);
    }

    const offset = Number(normalized.offset);
    if (Number.isFinite(offset) && offset >= 0) {
      normalized.offset = Math.trunc(offset);
    }

    return normalized;
  }

  private shouldFallbackToLegacyMerchantOrders(error: unknown) {
    if (!axios.isAxiosError(error)) return false;

    const status = error.response?.status;
    return status === 404 || status === 405 || status === 501;
  }

  // Auth methods
  async login(email: string, password: string) {
    const response = await this.client.post(API_CONFIG.ENDPOINTS.LOGIN, {
      email: this.normalizeEmail(email),
      password,
    });
    
    // Store auth data
    if ((response.data.success === true || response.data.status === 'success') && response.data.token) {
      localStorage.setItem('merchant_token', response.data.token);
      localStorage.setItem('merchant_user', JSON.stringify(response.data.user));
      localStorage.setItem('merchant_id', response.data.user.merchant_id || response.data.user.id);
    }
    
    return response.data;
  }

  async register(data: any) {
    const response = await this.client.post(API_CONFIG.ENDPOINTS.REGISTER, data);
    return response.data;
  }

  async logout() {
    this.clearAuth();
    window.location.href = '/login';
  }

  // Profile methods
  async getProfile() {
    const response = await this.client.get(API_CONFIG.ENDPOINTS.PROFILE);
    const payload = response.data?.data || response.data || {};

    return {
      merchant_id: payload.merchant_id || '',
      business_name: payload.business_name || payload.full_name || '',
      contact_email: payload.contact_email || payload.email || '',
      contact_phone: payload.contact_phone || payload.phone || '',
      website: payload.website || payload.store_url || '',
      address: payload.address || '',
      country: payload.country || payload.region || '',
      business_type: payload.business_type || '',
      status: payload.status || '',
      total_orders: payload.total_orders || 0,
      total_revenue: payload.total_revenue || 0,
    };
  }

  async updateProfile(data: any) {
    const response = await this.client.put(API_CONFIG.ENDPOINTS.UPDATE_PROFILE, data);
    if (typeof window !== 'undefined') {
      try {
        const storedUser = localStorage.getItem('merchant_user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          localStorage.setItem(
            'merchant_user',
            JSON.stringify({
              ...parsed,
              business_name: data.business_name || parsed.business_name,
              email: data.contact_email || parsed.email,
            })
          );
        }
      } catch (error) {
        console.warn('Failed to update stored merchant profile:', error);
      }
    }
    return response.data;
  }

  async getSettingsPreferences() {
    const response = await this.client.get('/merchant/settings/preferences');
    return response.data?.data || response.data;
  }

  async updateSettingsPreferences(data: {
    email_orders?: boolean;
    email_payments?: boolean;
    email_inventory?: boolean;
    email_weekly?: boolean;
    portal_language?: "en" | "zh-CN" | "ja-JP" | "ko-KR" | "fr-FR" | "de-DE";
  }) {
    const response = await this.client.put('/merchant/settings/preferences', data);
    return response.data?.data || response.data;
  }

  // Products methods
  async getProducts() {
    const merchantId = localStorage.getItem('merchant_id') || '';
    if (!merchantId) return [];

    // Prefer the v2 products API which is backed by products_cache and supports
    // pagination, so we can fetch the full catalog instead of an arbitrary
    // fixed limit from the legacy endpoint.
    try {
      const pageSize = 250;
      const first = await this.getProductsV2({
        limit: pageSize,
        offset: 0,
      });

      let products = first.products || [];
      const total =
        typeof first.total === 'number' ? first.total : products.length;

      // If there are more products than the first page, fetch the remaining
      // slice(s) and concatenate. This keeps the Products page in sync with
      // MCP, which shows the full catalog size.
      let offset = products.length;
      while (offset < total) {
        const next = await this.getProductsV2({
          limit: pageSize,
          offset,
        });
        const nextProducts = next.products || [];
        if (!nextProducts.length) break;
        products = products.concat(nextProducts);
        offset += nextProducts.length;
      }

      return products;
    } catch (err) {
      console.warn('getProducts v2 failed, falling back to legacy /products', err);
      const response = await this.client.get(`/products/${merchantId}`, {
        params: { limit: 250 },
      });
      return response.data.products || [];
    }
  }

  async getProductsV2(params?: { platform?: string; limit?: number; offset?: number }) {
    const merchantId = localStorage.getItem('merchant_id') || '';
    if (!merchantId) {
      return { products: [], total: 0, limit: params?.limit ?? 20, offset: params?.offset ?? 0 };
    }
    const response = await this.client.get(`/products/v2/${merchantId}`, {
      params: {
        platform: params?.platform,
        limit: params?.limit ?? 20,
        offset: params?.offset ?? 0,
      },
    });
    return response.data;
  }

  async getProduct(id: string) {
    const url = API_CONFIG.ENDPOINTS.PRODUCT_DETAIL.replace(':id', id);
    const response = await this.client.get(url);
    return response.data;
  }

  async getMerchantReadinessOptimization(options?: RequestOptions & {
    queue_mode?: 'full' | 'page' | 'none';
    page?: number;
    page_size?: number;
    search?: string;
    issue_bucket?: string;
    push_status?: 'all' | 'eligible' | 'excluded';
    blocked_only?: boolean;
    low_quality_only?: boolean;
    sort_by?: 'default' | 'cq_desc' | 'mr_desc';
  }) {
    const response = await this.client.get('/merchant/readiness/optimization', {
      params: {
        queue_mode: options?.queue_mode,
        page: options?.page,
        page_size: options?.page_size,
        search: options?.search,
        issue_bucket: options?.issue_bucket,
        push_status: options?.push_status,
        blocked_only: options?.blocked_only,
        low_quality_only: options?.low_quality_only,
        sort_by: options?.sort_by,
      },
      timeout: options?.timeoutMs,
    });
    return response.data?.data || response.data;
  }

  async getDashboardReadiness(options?: RequestOptions) {
    const response = await this.client.get('/merchant/dashboard/readiness', {
      timeout: options?.timeoutMs,
    });
    return response.data?.data || response.data;
  }

  async refreshMerchantReadinessOptimization(params?: {
    scope?: string;
    reason?: string;
    reason_code?: string;
    queue_mode?: 'full' | 'page' | 'none';
    page?: number;
    page_size?: number;
    search?: string;
    issue_bucket?: string;
    push_status?: 'all' | 'eligible' | 'excluded';
    blocked_only?: boolean;
    low_quality_only?: boolean;
    sort_by?: 'default' | 'cq_desc' | 'mr_desc';
  }) {
    const response = await this.refreshMerchantReadinessOptimizationDetailed(params);
    return response?.data || response;
  }

  async refreshMerchantReadinessOptimizationDetailed(params?: {
    scope?: string;
    reason?: string;
    reason_code?: string;
    queue_mode?: 'full' | 'page' | 'none';
    page?: number;
    page_size?: number;
    search?: string;
    issue_bucket?: string;
    push_status?: 'all' | 'eligible' | 'excluded';
    blocked_only?: boolean;
    low_quality_only?: boolean;
    sort_by?: 'default' | 'cq_desc' | 'mr_desc';
  }) {
    const response = await this.client.post(
      '/merchant/readiness/actions/refresh',
      {
        scope: params?.scope ?? 'merchant',
        reason: params?.reason ?? 'manual',
        reason_code: params?.reason_code,
        queue_mode: params?.queue_mode,
        page: params?.page,
        page_size: params?.page_size,
        search: params?.search,
        issue_bucket: params?.issue_bucket,
        push_status: params?.push_status,
        blocked_only: params?.blocked_only,
        low_quality_only: params?.low_quality_only,
        sort_by: params?.sort_by,
      }
    );
    return response.data;
  }

  async previewMerchantReadinessAction(body: {
    plan_id: string;
    action_id?: string;
    action_type?: string;
    targets?: Array<Record<string, any>>;
    dry_run?: boolean;
  }) {
    const response = await this.client.post(
      '/merchant/readiness/actions/preview',
      {
        plan_id: body.plan_id,
        action_id: body.action_id,
        action_type: body.action_type,
        targets: body.targets ?? [],
        dry_run: body.dry_run ?? true,
      }
    );
    return response.data?.data || response.data;
  }

  async runMerchantReadinessAction(body: {
    plan_id: string;
    action_id?: string;
    action_type?: string;
    targets?: Array<Record<string, any>>;
    idempotency_key?: string;
    execution_mode?: 'sync' | 'async';
  }) {
    const response = await this.client.post('/merchant/readiness/actions/run', {
      plan_id: body.plan_id,
      action_id: body.action_id,
      action_type: body.action_type,
      targets: body.targets ?? [],
      idempotency_key: body.idempotency_key,
      execution_mode: body.execution_mode ?? 'sync',
    });
    return response.data?.data || response.data;
  }

  async getMerchantReadinessJob(jobId: string) {
    const response = await this.client.get(`/merchant/readiness/jobs/${jobId}`);
    return response.data?.data || response.data;
  }

  /**
   * v2 Merchant product view used for enrichment & quality
   * Backed by /merchant/products* endpoints in pivota-backend.
   */
  async listMerchantProducts(params?: {
    platform?: string;
    page?: number;
    page_size?: number;
  }) {
    const response = await this.client.get('/merchant/products', {
      params: {
        platform: params?.platform,
        page: params?.page ?? 1,
        page_size: params?.page_size ?? 20,
      },
    });
    return response.data;
  }

  async getMerchantProductDetail(platform: string, platformProductId: string) {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.get(
      `/merchant/products/${platform}/${encodedId}`
    );
    return response.data;
  }

  async getMerchantPdpStatus(platform: string, platformProductId: string, market = 'US') {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.get(
      `/merchant/pdps/product/${platform}/${encodedId}`,
      { params: { market } }
    );
    return response.data;
  }

  async submitMerchantPdpContribution(
    platform: string,
    platformProductId: string,
    body: {
      module_key: string;
      payload: Record<string, unknown>;
      notes?: string;
      market?: string;
    }
  ) {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.post(
      `/merchant/pdps/product/${platform}/${encodedId}/contributions`,
      body
    );
    return response.data;
  }

  async getMerchantProductBlockers(
    platform: string,
    platformProductId: string,
    planId: string
  ) {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.get(
      `/merchant/readiness/optimization/products/${platform}/${encodedId}/blockers`,
      {
        params: {
          plan_id: planId,
        },
      }
    );
    return response.data?.data || response.data;
  }

  async getMerchantSourceDataTriage(params: {
    plan_id: string;
    reason_code?: string;
    limit?: number;
  }) {
    const response = await this.client.get(
      '/merchant/readiness/optimization/source-data-triage',
      {
        params: {
          plan_id: params.plan_id,
          reason_code: params.reason_code,
          limit: params.limit ?? 500,
        },
      }
    );
    return response.data?.data || response.data;
  }

  async exportMerchantSourceDataTriageCSV(params: {
    plan_id: string;
    reason_code?: string;
  }) {
    const response = await this.client.get(
      '/merchant/readiness/optimization/source-data-triage/export.csv',
      {
        params: {
          plan_id: params.plan_id,
          reason_code: params.reason_code,
        },
        responseType: 'blob',
      }
    );
    return response.data as Blob;
  }

  async putMerchantSourceDataDecision(params: {
    reason_code: string;
    platform: string;
    platform_product_id: string;
    decision_state: string;
  }) {
    const encodedProductId = encodeURIComponent(params.platform_product_id);
    const response = await this.client.put(
      `/merchant/readiness/source-data-decisions/${params.reason_code}/${params.platform}/${encodedProductId}`,
      {
        decision_state: params.decision_state,
      }
    );
    return response.data?.data || response.data;
  }

  async deleteMerchantSourceDataDecision(params: {
    reason_code: string;
    platform: string;
    platform_product_id: string;
  }) {
    const encodedProductId = encodeURIComponent(params.platform_product_id);
    const response = await this.client.delete(
      `/merchant/readiness/source-data-decisions/${params.reason_code}/${params.platform}/${encodedProductId}`
    );
    return response.data?.data || response.data;
  }

  async updateMerchantProductEnrichment(
    platform: string,
    platformProductId: string,
    enrichment: any
  ) {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.put(
      `/merchant/products/${platform}/${encodedId}/enrichment`,
      enrichment
    );
    return response.data;
  }

  /**
   * Merchant-authored fashion-field write path (material / care / size_guide).
   * Backed by pivota-backend PR #563:
   *   PUT /merchant/products/{platform}/{platform_product_id}/fashion_fields
   *
   * null on a field means "leave unchanged". Response.outcomes maps each
   * provided field to one of: 'written' | 'skipped_payload_owned' |
   * 'product_not_found' | 'unchanged'. skipped_payload_owned is NOT an
   * error — it signals that a Shopify metafield is authoritative and the
   * merchant's value was not overwritten. Surface that honestly in the UI
   * via Screen 08.
   */
  /**
   * Per-product fashion-completeness queue for the merchant agent
   * surface. Backed by pivota-backend PR #565:
   *   GET /merchant/products/fashion_completeness
   *
   * Returns only products with at least one missing fashion field, so
   * the agent surface can drive the trigger + structured editor flows
   * directly off this list. Per-field `status` mirrors the UI's
   * FieldStatus enum (missing / filled-by-llm / merchant-authored /
   * merchant-payload-locked / inherited).
   */
  async getMerchantFashionCompleteness(options?: {
    page?: number;
    page_size?: number;
  }): Promise<{
    status: string;
    data: {
      queue: Array<{
        platform: string;
        platform_product_id: string;
        title: string;
        image_url: string | null;
        sku: string | null;
        fields: {
          material: {
            status: "missing" | "filled-by-llm" | "merchant-authored" | "merchant-payload-locked" | "inherited";
            value: string | null;
            confidence: number | null;
          };
          care: {
            status: "missing" | "filled-by-llm" | "merchant-authored" | "merchant-payload-locked" | "inherited";
            value: string | null;
            confidence: number | null;
          };
          size_guide: {
            status: "missing" | "filled-by-llm" | "merchant-authored" | "merchant-payload-locked" | "inherited";
            value: string | Record<string, any> | null;
            confidence: number | null;
          };
        };
      }>;
      totals: {
        fashion_total: number;
        missing_material: number;
        missing_care: number;
        missing_size_guide: number;
        total_incomplete: number;
        page: number;
        page_size: number;
        has_more: boolean;
      };
    };
  }> {
    const response = await this.client.get("/merchant/products/fashion_completeness", {
      params: {
        page: options?.page,
        page_size: options?.page_size,
      },
    });
    return response.data;
  }

  async updateMerchantProductFashionFields(
    platform: string,
    platformProductId: string,
    fields: {
      material?: string | null;
      care?: string | null;
      size_guide?: string | Record<string, any> | null;
    }
  ): Promise<{
    status: string;
    // Per-field outcomes are narrow strings, not arbitrary `Record<string, …>`.
    // Imported as the exact type from @/types/fashion-authoring would create
    // an import cycle (the types module is consumed by Zustand store etc.);
    // pin the union here so the structural contract still tightens vs the
    // prior loose `Record<string, ...>` (codex 🟢).
    outcomes: Partial<Record<
      "material" | "care" | "size_guide",
      "written" | "skipped_payload_owned" | "product_not_found" | "unchanged"
    >>;
  }> {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.put(
      `/merchant/products/${platform}/${encodedId}/fashion_fields`,
      fields
    );
    return response.data;
  }

  /**
   * Per-product beauty-completeness queue.
   *   GET /merchant/products/beauty_completeness
   * Returns only beauty products missing at least one field for their subcategory.
   * Each product includes subcategory_kind so the UI can render the right form.
   */
  async getMerchantBeautyCompleteness(options?: {
    page?: number;
    page_size?: number;
  }): Promise<{
    status: string;
    data: {
      queue: Array<{
        platform: string;
        platform_product_id: string;
        title: string;
        image_url: string | null;
        sku: string | null;
        subcategory_kind: string;
        fields: Record<
          string,
          {
            status: "missing" | "filled-by-llm" | "merchant-authored" | "merchant-payload-locked" | "inherited";
            value: string | null;
            confidence: number | null;
          }
        >;
      }>;
      totals: {
        beauty_total: number;
        total_incomplete: number;
        page: number;
        page_size: number;
        has_more: boolean;
      };
    };
  }> {
    const response = await this.client.get("/merchant/products/beauty_completeness", {
      params: {
        page: options?.page,
        page_size: options?.page_size,
      },
    });
    return response.data;
  }

  /**
   * Merchant-authored beauty-field write path.
   *   PUT /merchant/products/{platform}/{platform_product_id}/beauty_fields
   * Only post fields applicable to the product's subcategory_kind.
   */
  async updateMerchantProductBeautyFields(
    platform: string,
    platformProductId: string,
    fields: Record<string, string | null>
  ): Promise<{
    status: string;
    outcomes: Record<
      string,
      "written" | "skipped_payload_owned" | "product_not_found" | "unchanged"
    >;
  }> {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.put(
      `/merchant/products/${platform}/${encodedId}/beauty_fields`,
      fields
    );
    return response.data;
  }

  async runMerchantProductOptimization(
    platform: string,
    platformProductId: string
  ) {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.post(
      `/merchant/products/${platform}/${encodedId}/enrichment/run`
    );
    return response.data;
  }

  async runMerchantBulkEnrichment(params?: { platform?: string; limit?: number }) {
    const response = await this.client.post('/merchant/products/enrichment/backfill', {
      platform: params?.platform,
      limit: params?.limit,
    });
    return response.data;
  }
  async createProduct(data: any) {
    const response = await this.client.post(API_CONFIG.ENDPOINTS.PRODUCT_CREATE, data);
    return response.data;
  }

  async updateProduct(id: string, data: any) {
    const url = API_CONFIG.ENDPOINTS.PRODUCT_UPDATE.replace(':id', id);
    const response = await this.client.put(url, data);
    return response.data;
  }

  async deleteProduct(id: string) {
    const url = API_CONFIG.ENDPOINTS.PRODUCT_DELETE.replace(':id', id);
    const response = await this.client.delete(url);
    return response.data;
  }

  async syncShopifyProducts(merchantId: string) {
    const response = await this.client.post(API_CONFIG.ENDPOINTS.SYNC_SHOPIFY, {
      merchant_id: merchantId,
    });
    return response.data;
  }

  // Orders methods
  async getOrders(params?: any) {
    const merchantId = localStorage.getItem('merchant_id') || '';
    if (!merchantId) return { orders: [], total: 0, limit: 50, offset: 0 };

    const normalizedParams = this.normalizeMerchantOrdersParams(params);

    // Try the new merchant-specific endpoint first
    try {
      const response = await this.client.get(`/merchant/${merchantId}/orders`, { params: normalizedParams });
      const data = response.data?.data || response.data;
      return {
        orders: data?.orders || [],
        total: data?.total || 0,
        limit: data?.limit || 50,
        offset: data?.offset || 0
      };
    } catch (error) {
      if (!this.shouldFallbackToLegacyMerchantOrders(error)) {
        throw error;
      }

      // Fallback to old endpoint
      const response = await this.client.get(`/orders/merchant/${merchantId}`, { params: normalizedParams });
      const data = response.data?.data || response.data;
      return {
        orders: data?.orders || [],
        total: data?.total || data?.total_orders || 0,
        limit: data?.limit || Number(normalizedParams.limit) || 50,
        offset: data?.offset || Number(normalizedParams.offset) || 0
      };
    }
  }

  async getOrder(id: string) {
    const url = API_CONFIG.ENDPOINTS.ORDER_DETAIL.replace(':id', id);
    const response = await this.client.get(url);
    return response.data;
  }

  async updateOrder(id: string, data: any) {
    const url = API_CONFIG.ENDPOINTS.ORDER_UPDATE.replace(':id', id);
    const response = await this.client.patch(url, data);
    return response.data;
  }

  async refundOrder(id: string, amount?: number) {
    const url = API_CONFIG.ENDPOINTS.ORDER_REFUND.replace(':id', id);
    const response = await this.client.post(url, { amount });
    return response.data;
  }

  // Integration methods
  async connectShopify(
    merchantId: string,
    shopDomain: string,
    clientId: string,
    clientSecret: string
  ) {
    const response = await this.client.post('/integrations/shopify/connect', {
      merchant_id: merchantId,
      shop_domain: shopDomain,
      client_id: clientId,
      client_secret: clientSecret,
    });
    return response.data;
  }

  async disconnectShopify(merchantId: string) {
    const response = await this.client.post(API_CONFIG.ENDPOINTS.SHOPIFY_DISCONNECT, {
      merchant_id: merchantId,
    });
    return response.data;
  }

  async connectWix(merchantId: string, apiKey: string, siteId: string) {
    const response = await this.client.post(API_CONFIG.ENDPOINTS.WIX_CONNECT, {
      merchant_id: merchantId,
      api_key: apiKey,
      site_id: siteId,
    });
    return response.data;
  }

  async disconnectWix(merchantId: string) {
    const response = await this.client.post(API_CONFIG.ENDPOINTS.WIX_DISCONNECT, {
      merchant_id: merchantId,
    });
    return response.data;
  }

  async getConnectedStores(merchantId: string) {
    // Use dashboard routes that merge runtime and demo stores
    const response = await this.client.get(`/merchant/${merchantId}/integrations`);
    const raw = response.data?.data?.stores || [];
    return normalizeConnectedStores(Array.isArray(raw) ? raw : []);
  }

  async setPrimaryStore(storeId: string) {
    const response = await this.client.post(
      `/merchant/integrations/store/${storeId}/primary`
    );
    return response.data;
  }

  async deleteStore(storeId: string) {
    const response = await this.client.delete(
      `/merchant/integrations/store/${storeId}`
    );
    return response.data;
  }

  async deletePSP(pspId: string) {
    const response = await this.client.delete(
      `/merchant/integrations/psp/${pspId}`
    );
    return response.data;
  }

  // PSP methods
  async getPSPs(merchantId: string) {
    const response = await this.client.get(`/merchant/${merchantId}/psps`);
    const raw = response.data?.data?.psps || [];
    // Normalize to UI expected fields
    return raw.map((p: any) => {
      const paymentTelemetryReported = p.payment_telemetry_reported === true;

      return {
        id: p.id || p.provider,
        type: p.provider || p.type,
        name: p.name || (p.provider ? p.provider.charAt(0).toUpperCase() + p.provider.slice(1) : 'PSP'),
        status: p.status,
        is_active: (() => {
          const status = (p.status || '').toLowerCase();
          return status === 'active' || p.is_active === true;
        })(),
        payment_telemetry_reported: paymentTelemetryReported,
        success_rate: paymentTelemetryReported ? finiteNumberOrNull(p.success_rate) : null,
        volume_today: paymentTelemetryReported ? finiteNumberOrNull(p.volume_today) : null,
        transaction_count: paymentTelemetryReported ? finiteNumberOrNull(p.transaction_count) : null,
        environment: p.environment || 'unknown',
        validation_status: p.validation_status || 'unknown',
        validation_error: p.validation_error || null,
        live_charge_ready: Boolean(p.live_charge_ready),
        readiness_blockers: Array.isArray(p.readiness_blockers) ? p.readiness_blockers : [],
        last_validated_at: p.last_validated_at || null,
        provider_summary: p.provider_summary || {},
        account_id: p.account_id || null,
        api_key_last4: p.api_key_last4 || '****',
      };
    });
  }

  // Sync products by platform
  async syncPlatformProducts(platform: string) {
    const p = (platform || '').toLowerCase();
    const merchantId = localStorage.getItem('merchant_id') || '';
    
    if (p === 'shopify') {
    return this.syncShopifyProducts(merchantId);
    }
    // Wix or others
    const response = await this.client.post(`/merchant/integrations/${p}/sync`);
    return response.data;
  }
  /**
   * Product quality preview & eval for enrichment workflow.
   */
  async previewProductQuality(payload: any) {
    const response = await this.client.post(
      '/internal/product/quality/preview',
      payload
    );
    return response.data;
  }

  async evalProductQuality(
    platform: string,
    platformProductId: string,
    payload: any,
    geoCode: string = 'default'
  ) {
    const merchantId = localStorage.getItem('merchant_id') || '';
    if (!merchantId) {
      throw new Error('Merchant ID not found in localStorage');
    }
    const encodedId = encodeURIComponent(platformProductId);
    const body = {
      merchant_id: merchantId,
      platform,
      platform_product_id: platformProductId,
      geo_code: geoCode,
      payload,
    };
    const response = await this.client.post(
      '/internal/product/quality/eval',
      body
    );
    return response.data;
  }
  async connectPSP(merchantId: string, pspType: string, apiKey: string, options?: any) {
    const response = await this.client.post('/merchant/onboarding/setup-psp', {
      merchant_id: merchantId,
      psp_type: pspType,
      api_key: apiKey,
      test_mode: true,
      ...options,
    });
    return response.data;
  }

  async disconnectPSP(pspId: string) {
    const url = API_CONFIG.ENDPOINTS.PSP_DISCONNECT.replace(':id', pspId);
    const response = await this.client.post(url);
    return response.data;
  }

  async testPSP(pspId: string) {
    const url = API_CONFIG.ENDPOINTS.PSP_TEST.replace(':id', pspId);
    const response = await this.client.post(url);
    return response.data;
  }

  // Analytics methods
  async getAnalyticsDashboard(timeRange: string = '30d') {
    // Use the new dashboard stats endpoint
    const response = await this.client.get('/merchant/dashboard/stats');
    return response.data?.data || response.data;
  }

  async getAnalyticsTrends(params?: {
    metric?: 'gmv' | 'orders' | 'aov' | 'success_rate' | 'refunds';
    range?: '1d' | '7d' | '30d' | '90d';
    interval?: 'day' | 'week';
    psp?: string;
    currency?: string;
    compare?: boolean;
    mode?: 'gross' | 'net';
  }) {
    const response = await this.client.get('/merchant/analytics/trends', { params });
    return response.data?.data || response.data;
  }

  async getCommerceFunnel(params?: CommerceFunnelParams) {
    const response = await this.client.get('/merchant/analytics/commerce-funnel', {
      params,
    });
    return response.data;
  }

  async getCommerceFunnelIssues(params?: {
    surface?: string;
    limit?: number;
  }) {
    const response = await this.client.get('/merchant/analytics/commerce-funnel/issues', {
      params,
    });
    return response.data;
  }

  async getCommerceInteractionTrace(interactionId: string) {
    const response = await this.client.get(
      `/merchant/analytics/commerce-interactions/${encodeURIComponent(interactionId)}`
    );
    return response.data;
  }

  async getCommerceReadinessState() {
    const response = await this.client.get('/merchant/analytics/readiness-state');
    return response.data;
  }

  async exportAnalyticsTrendsCSV(params?: {
    metric?: 'gmv' | 'orders' | 'aov' | 'success_rate' | 'refunds';
    range?: '1d' | '7d' | '30d' | '90d';
    interval?: 'day' | 'week';
    psp?: string;
    currency?: string;
    compare?: boolean;
    mode?: 'gross' | 'net';
  }) {
    const response = await this.client.get('/merchant/analytics/trends.csv', {
      params,
      responseType: 'blob',
    });
    return response.data as Blob;
  }

  async getOrderAnalytics() {
    const response = await this.client.get(API_CONFIG.ENDPOINTS.ANALYTICS_ORDERS);
    return response.data;
  }

  async getRevenueAnalytics() {
    const response = await this.client.get(API_CONFIG.ENDPOINTS.ANALYTICS_REVENUE);
    return response.data;
  }

  // Extended methods for dashboard features
  // [Wait] Duplicate method detected. Keeping original login/logout/etc.
  // Merging new methods from "Extended methods" section into existing class structure...

  async getMcpSummary() {
    const response = await this.client.get('/merchant/mcp/summary');
    return response.data?.data || response.data;
  }

  async addProduct(productData: any) {
    const response = await this.client.post('/merchant/products/add', productData);
    return response.data;
  }

  async getOrderDetails(orderId: string) {
    const response = await this.client.get(`/merchant/orders/${orderId}`);
    return response.data?.data || response.data;
  }

  async exportOrders() {
    const response = await this.client.post('/merchant/orders/export');
    return response.data;
  }

  async connectStore(storeData: any) {
    const response = await this.client.post('/merchant/integrations/store/connect', storeData);
    return response.data;
  }

  async connectPSPProvider(pspData: any) {
    const response = await this.client.post('/merchant/integrations/psp/connect', pspData);
    return response.data;
  }

  // New integration methods
  async getIntegrations(type?: string) {
    const params = type ? { integration_type: type } : {};
    const response = await this.client.get('/merchant/integrations', { params });
    return response.data.integrations || [];
  }

  async getIntegrationSchemas(type?: string, provider?: string) {
    const params: any = {};
    if (type) params.integration_type = type;
    if (provider) params.provider = provider;
    const response = await this.client.get('/merchant/integrations/schemas', { params });
    return response.data.schemas || {};
  }

  async createIntegration(data: {
    integration_type: string;
    provider: string;
    display_name: string;
    credentials: any;
    settings?: any;
  }) {
    const response = await this.client.post('/merchant/integrations', data);
    return response.data;
  }

  async testIntegration(integrationId: number, credentials?: any) {
    const response = await this.client.post(`/merchant/integrations/${integrationId}/test`, {
      credentials
    });
    return response.data;
  }

  async updateIntegration(integrationId: number, data: any) {
    const response = await this.client.put(`/merchant/integrations/${integrationId}`, data);
    return response.data;
  }

  async deleteIntegration(integrationId: number) {
    const response = await this.client.delete(`/merchant/integrations/${integrationId}`);
    return response.data;
  }

  async syncIntegrationWebhooks(integrationId: number, webhookUrl: string) {
    const response = await this.client.post(`/merchant/integrations/${integrationId}/webhooks/sync`, 
      webhookUrl, // Send as raw string in body
      { headers: { 'Content-Type': 'text/plain' } }
    );
    return response.data;
  }

  async getIntegrationLogs(integrationId: number, logType?: string, limit: number = 100) {
    const params: any = { limit };
    if (logType) params.log_type = logType;
    const response = await this.client.get(`/merchant/integrations/${integrationId}/logs`, { params });
    return response.data;
  }

  // Merchant PSP routing configuration
  async getRoutingConfig() {
    const response = await this.client.get('/merchant/integrations/routing');
    return response.data?.data || response.data;
  }

  async updateRoutingConfig(payload: {
    psp_priority: { psp: string; priority: number }[];
    routing_strategy?: string;
    max_retries?: number;
    timeout_ms?: number;
  }) {
    const response = await this.client.put('/merchant/integrations/routing', payload);
    return response.data?.data || response.data;
  }

  async changePassword(passwordData: { current_password: string; new_password: string }) {
    const response = await this.client.post('/api/auth/change-password', passwordData);
    return response.data;
  }

  async enable2FA() {
    const response = await this.client.post('/merchant/security/enable-2fa');
    return response.data;
  }

  async getApiCredentials() {
    const response = await this.client.get('/merchant/api-credentials');
    return response.data?.data || response.data;
  }

  async rotateApiCredentials() {
    const response = await this.client.post('/merchant/api-credentials/rotate');
    return response.data?.data || response.data;
  }

  // Webhook methods
  async getWebhookConfig() {
    const response = await this.client.get(API_CONFIG.ENDPOINTS.WEBHOOK_CONFIG);
    const payload = response.data?.data || response.data?.config || response.data || {};
    return {
      url: payload.url || payload.destination_url || payload.webhook_url || '',
      events: payload.events || payload.subscribed_events || [],
      enabled: Boolean(payload.enabled),
      signing_secret_last4: payload.signing_secret_last4 || payload.secret_last4 || null,
      last_test_at: payload.last_test_at || null,
      last_test_status: payload.last_test_status || null,
      delivery_summary_24h: payload.delivery_summary_24h || null,
    };
  }

  async updateWebhookConfig(config: {
    url?: string;
    events?: string[];
    enabled?: boolean;
  }) {
    const response = await this.client.put(API_CONFIG.ENDPOINTS.WEBHOOK_CONFIG, config);
    return response.data?.data || response.data;
  }

  async getWebhookSecret() {
    const response = await this.client.get(API_CONFIG.ENDPOINTS.WEBHOOK_SECRET);
    return response.data?.data || response.data;
  }

  async rotateWebhookSecret() {
    const response = await this.client.post(`${API_CONFIG.ENDPOINTS.WEBHOOK_SECRET}/rotate`);
    return response.data?.data || response.data;
  }

  async testWebhook(eventType: string) {
    const response = await this.client.post(API_CONFIG.ENDPOINTS.WEBHOOK_TEST, {
      event_type: eventType,
    });
    return response.data?.data || response.data;
  }

  async getWebhookLogs(limit: number = 20, status?: string) {
    const response = await this.client.get(API_CONFIG.ENDPOINTS.WEBHOOK_LOGS, {
      params: { limit, status },
    });
    const payload = response.data?.data || response.data || {};
    return {
      deliveries: payload.deliveries || [],
      summary_24h: payload.summary_24h || null,
    };
  }

  // [Phase 6] Commission methods
  async getCommissionOffers(merchantId: string) {
    const response = await this.client.get(`/merchants/${merchantId}/commission/offers`);
    return response.data;
  }

  async createCommissionOffer(merchantId: string, data: {
    agent_type?: string | null;
    offered_commission_rate: number;
    min_order_amount: number;
    max_order_amount?: number;
    notes?: string;
  }) {
    const response = await this.client.post(`/merchants/${merchantId}/commission/offers`, data);
    return response.data;
  }

  async deleteCommissionOffer(merchantId: string, offerId: number) {
    const response = await this.client.delete(`/merchants/${merchantId}/commission/offers/${offerId}`);
    return response.data;
  }

  async markOrderShipped(orderId: string, trackingNumber: string, carrier?: string) {
    const merchantId = localStorage.getItem('merchant_id') || '';
    if (!merchantId) throw new Error('Merchant ID not found');
    const response = await this.client.post(`/merchant/orders/${orderId}/ship`, {
      tracking_number: trackingNumber,
      carrier: carrier,
    });
    return response.data;
  }

  async refundOrderV2(orderId: string, amount: number, reason: string) {
    const response = await this.client.post(`/merchant/orders/${orderId}/refund`, {
      amount,
      reason,
      source: 'pivota_merchant'
    });
    return response.data;
  }

  async getOrderRefunds(orderId: string) {
    const response = await this.client.get(`/merchant/orders/${orderId}/refunds`);
    return response.data;
  }

  async getOrderAfterSalesCases(orderId: string) {
    const response = await this.client.get(`/merchant/orders/${orderId}/after-sales/cases`);
    return response.data;
  }

  async approveAfterSalesCase(caseId: string, params?: { approved_refund_amount?: number; note?: string }) {
    const response = await this.client.post(`/merchant/after-sales/cases/${caseId}/approve`, {
      approved_refund_amount: params?.approved_refund_amount,
      note: params?.note,
    });
    return response.data;
  }

  // Generic HTTP methods
  async get(url: string, params?: any) {
    const response = await this.client.get(url, { params });
    return response;
  }

  async post(url: string, data?: any) {
    const response = await this.client.post(url, data);
    return response;
  }

  async put(url: string, data?: any) {
    const response = await this.client.put(url, data);
    return response;
  }

  async patch(url: string, data?: any) {
    const response = await this.client.patch(url, data);
    return response;
  }

  async delete(url: string) {
    const response = await this.client.delete(url);
    return response;
  }

  // -------------------------------------------------------------------
  // AI Commerce Readiness audit (merchant self-service, multi-SKU).
  //
  // Calls POST /api/merchant-center/audit/ai-commerce-readiness with
  // 1–5 of the merchant's own product_keys. The backend looks them up
  // in catalog_products WHERE merchant_id=current (cross-tenant guard
  // implicit) and runs run_brand_report — same engine as the employee
  // BD brand-level audit.
  //
  // Cost guard: 2 audits / 24h per merchant. 429 surfaces with a
  // detail object {limit, window_seconds, next_reset_in_seconds}.
  // Audit run takes ~60–90 sec; client timeout is 3 min.
  // -------------------------------------------------------------------
  // -------------------------------------------------------------------
  // APM funnel (PR-5): stage-level conversion funnel for this merchant.
  // GET /api/merchant-center/funnel?channel=&window_days=
  //
  // Backend rolls up funnel_events by stage in the trailing window;
  // returns the canonical 6-stage funnel (impression → profile_visit
  // → click → pdp_view → add_to_cart → conversion) with per-stage
  // counts + drop-off rates, plus a per-channel breakdown so the
  // operator can pick which channel to drill into.
  // -------------------------------------------------------------------
  async getApmFunnel(params?: {
    channel?: string;
    window_days?: number;
  }) {
    const response = await this.client.get('/api/merchant-center/funnel', {
      params,
    });
    return response.data as ApmFunnelResponse;
  }

  async runAiReadinessAudit(
    products: { platform: string; source_product_id: string }[],
    maxRuns: number = 3,
  ): Promise<import('./types/ai-readiness').AiReadinessAuditResponse> {
    // Per spec §I, the 1–5 cap is replaced by the credit pre-flight as the
    // authoritative cost gate. We keep a generous 1–50 ceiling client-side
    // to catch obvious typos before hitting the backend (which enforces
    // the real cap and the credit balance).
    if (products.length < 1 || products.length > 50) {
      throw new Error('Pick 1–50 SKUs to audit per run.');
    }
    const response = await this.client.post(
      '/api/merchant-center/audit/ai-commerce-readiness',
      { products, max_runs: maxRuns },
      { timeout: 180_000 },
    );
    return response.data?.data || response.data;
  }

  // -------------------------------------------------------------------
  // Tier-1 URL-audit wedge: POST /api/merchant-center/audit/url-readiness.
  // Merchant-CURATED: the merchant gives us their site + up to 5 product
  // URLs (their hero SKUs); we FETCH each for clean data and audit exactly
  // those — NO catalog sync, NO auto-discovery. `website` defaults to the
  // merchant's onboarding store_url server-side. The first 2 audits per
  // merchant are free; beyond that the backend returns HTTP 402 with a
  // { code: 'free_audit_limit_reached', message, free_audits_* } detail.
  // 422 { code: 'no_products_resolved', unresolved } when no URL resolves.
  // Run takes ~60–90s (backend audits the products with bounded concurrency);
  // client timeout 4 min as a safety margin against slow grounded-LLM calls.
  // -------------------------------------------------------------------
  async runUrlReadinessAudit(params: {
    productUrls: string[];
    website?: string;
    brand?: string;
  }): Promise<import('./types/ai-readiness').UrlReadinessAuditResponse> {
    const body: Record<string, unknown> = {
      product_urls: params.productUrls,
    };
    if (params.website) body.website = params.website;
    if (params.brand) body.brand = params.brand;
    const response = await this.client.post(
      '/api/merchant-center/audit/url-readiness',
      body,
      { timeout: 240_000 },
    );
    return response.data?.data || response.data;
  }

  // -------------------------------------------------------------------
  // v3 per-SKU audit — preview + launch (spec §I).
  //
  // The preview endpoint returns projected probe count + estimated
  // credits + current balance + sufficient flag. No probes are run.
  // The launch endpoint runs the actual audit and debits credits;
  // returns HTTP 402 with InsufficientCreditsError shape when the
  // balance can't cover the scope.
  //
  // Per memory feedback_no_execution_layer_fallbacks: callers do NOT
  // auto-shrink scope on 402. The merchant decides what to do.
  // -------------------------------------------------------------------

  async previewAudit(
    request: import('./types/ai-readiness').AgentCenterAuditPreviewRequest,
  ): Promise<import('./types/ai-readiness').AgentCenterAuditPreviewResponse> {
    const response = await this.client.post(
      '/api/audits/preview',
      request,
      { timeout: 30_000 },
    );
    return response.data?.data || response.data;
  }

  async runPerSkuAudit(request: {
    merchant_id: string;
    sku_keys: string[];
    prompts_per_sku?: number;
    custom_prompts?: string[];
    providers?: import('./types/ai-readiness').AuditPreviewProvider[];
    idempotency_key: string;
  }): Promise<import('./types/ai-readiness').AgentCenterPerSkuAuditResponse> {
    try {
      const response = await this.client.post(
        '/api/audits',
        {
          audit_mode: 'per_sku',
          merchant_id: request.merchant_id,
          sku_keys: request.sku_keys,
          prompts_per_sku: request.prompts_per_sku ?? 40,
          custom_prompts: request.custom_prompts ?? [],
          providers: request.providers ?? ['gemini'],
        },
        {
          timeout: 600_000, // 10 min; long-running grounded probes
          headers: { 'Idempotency-Key': request.idempotency_key },
        },
      );
      return response.data?.data || response.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        const detail = (err.response.data as { detail?: unknown })?.detail;
        const payload = (typeof detail === 'object' && detail !== null
          ? (detail as Record<string, unknown>)
          : (err.response.data as Record<string, unknown> | undefined)) ?? {};
        throw new InsufficientCreditsError({
          kind: (payload.kind as 'audit' | 'prompt' | 'execution') ?? 'audit',
          required: typeof payload.required === 'number' ? payload.required : 0,
          available: typeof payload.available === 'number' ? payload.available : 0,
          previewUrl: typeof payload.preview_url === 'string' ? payload.preview_url : null,
          message: typeof payload.error === 'string' ? payload.error : 'insufficient_credits',
        });
      }
      throw err;
    }
  }

  // P1.3: list merchant tasks. Backend exposes these at
  // /api/merchant-center/audit/* (the merchant audit router has
  // prefix /api/merchant-center/audit). Merchant portal previously
  // didn't call them. Default filter = open work
  // (pending + in_progress).
  async listMerchantTasks(options?: {
    statusFilter?: string;
    limit?: number;
  }): Promise<{
    merchant_id: string;
    count: number;
    tasks: import('./types/ai-readiness').MerchantTask[];
  }> {
    const params: Record<string, string | number> = {
      limit: options?.limit ?? 50,
    };
    if (options?.statusFilter) params.status_filter = options.statusFilter;
    const response = await this.client.get('/api/merchant-center/audit/tasks', {
      params,
    });
    return response.data;
  }

  async updateMerchantTask(
    taskId: string,
    body: {
      status: 'pending' | 'in_progress' | 'done' | 'failed';
      assigned_to_human?: string | null;
      evidence?: Record<string, unknown> | null;
    },
  ): Promise<{ task: import('./types/ai-readiness').MerchantTask }> {
    const response = await this.client.patch(
      `/api/merchant-center/audit/tasks/${encodeURIComponent(taskId)}`,
      body,
    );
    return response.data;
  }

  async dismissMerchantTask(
    taskId: string, reason: string,
  ): Promise<{ task: import('./types/ai-readiness').MerchantTask }> {
    const response = await this.client.post(
      `/api/merchant-center/audit/tasks/${encodeURIComponent(taskId)}/dismiss`,
      { reason },
    );
    return response.data;
  }

  async listMerchantExecutorRuns(options?: {
    agentName?: string;
    limit?: number;
  }): Promise<{
    merchant_id: string;
    agent_name: string | null;
    count: number;
    runs: import('./types/ai-readiness').MerchantExecutorRun[];
  }> {
    const params: Record<string, string | number> = {
      limit: options?.limit ?? 20,
    };
    if (options?.agentName) params.agent_name = options.agentName;
    const response = await this.client.get(
      '/api/merchant-center/audit/executor-runs',
      { params },
    );
    return response.data;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// APM funnel response shape — kept here since it's referenced from
// the dashboard page and a stand-alone funnel chart component.
export type ApmFunnelStage =
  | 'impression'
  | 'profile_visit'
  | 'click'
  | 'pdp_view'
  | 'add_to_cart'
  | 'conversion';

export type ApmSourceChannel =
  | 'ai_grounded_search'
  | 'ai_agent'
  | 'social_own'
  | 'social_kol'
  | 'editorial'
  | 'seo_organic'
  | 'retail'
  | 'direct'
  | 'unknown';

export interface ApmFunnelStageRow {
  stage: ApmFunnelStage;
  count: number;
  conversion_to_next: number | null;
  drop_off_pct: number | null;
}

export interface ApmFunnelChannelBreakdownRow {
  source_channel: ApmSourceChannel;
  total_events: number;
}

export interface ApmFunnelResponse {
  merchant_id: string;
  source_channel: ApmSourceChannel | null;
  window_days: number;
  total_events: number;
  stages: ApmFunnelStageRow[];
  channel_breakdown: ApmFunnelChannelBreakdownRow[];
}

// Export types
export interface MerchantUser {
  id: string;
  merchant_id: string;
  email: string;
  business_name: string;
  status: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  description?: string;
  image_url?: string;
  sku?: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_email: string;
  total_amount: number;
  status: string;
  created_at: string;
  items: OrderItem[];
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

export interface Store {
  id: string;
  platform: 'shopify' | 'wix' | 'woocommerce' | 'bigcommerce';
  store_name: string;
  domain: string;
  is_active: boolean;
  product_count: number;
  last_sync: string;
}

export interface PSP {
  id: string;
  type: string;
  name: string;
  is_active: boolean;
  payment_telemetry_reported?: boolean;
  success_rate?: number | null;
  volume_today?: number | null;
  transaction_count?: number | null;
}
