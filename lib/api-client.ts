import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_CONFIG } from './config';
import type {
  BillingCheckoutSession,
  BillingCheckoutSessionRequest,
  BillingCurrentPeriod,
  BillingPlansResponse,
  BillingStatementsResponse,
} from './types/billing';
import type {
  EvidenceClaimInput,
  LabExtractionResult,
  ProductEvidence,
} from './evidence';

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
export {
  InsufficientCreditsError,
  PremiumProviderRequiredError,
  MissingVerifiedPaymentMethodError,
} from './credit-errors';
import {
  InsufficientCreditsError,
  PremiumProviderRequiredError,
  MissingVerifiedPaymentMethodError,
} from './credit-errors';

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

  // Raw current-merchant profile (JWT-scoped). Returns the unmapped payload so
  // callers can read fields like `operating_mode` that getProfile() does not expose.
  async getMerchantProfile() {
    const response = await this.client.get(API_CONFIG.ENDPOINTS.PROFILE);
    return response.data?.data || response.data;
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
    // Per-merchant executor consent (P7). true = Pivota auto-runs recommended
    // actions; false = the merchant approves each executor action before it runs.
    executor_auto_execute?: boolean;
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

  // Store-less brand-authored catalog (gated server-side by ENABLE_STORELESS_BRAND_CATALOG).
  async createMerchantProduct(body: {
    title: string;
    brand?: string;
    category?: string;
    description?: string;
    image_url?: string;
    tags?: string[];
    price?: number;
    currency?: string;
    summary_short?: string;
    bullet_points?: string[];
  }) {
    const response = await this.client.post('/merchant/products', body);
    return response.data;
  }

  async updateMerchantProduct(
    productId: string,
    body: Partial<{
      title: string;
      brand: string;
      category: string;
      description: string;
      image_url: string;
      tags: string[];
      price: number;
      currency: string;
      summary_short: string;
      bullet_points: string[];
    }>
  ) {
    const response = await this.client.put(
      `/merchant/products/${encodeURIComponent(productId)}`,
      body
    );
    return response.data;
  }

  // --- Pivota PDP contributions (merchant adds content straight to the
  // canonical PDP agents read — the "Add to your Pivota page" path). The
  // backend keys the contribution to the authed merchant_id; we only pass the
  // platform + platform_product_id (parsed from the audit report's product_key
  // = merchant_id|platform|platform_product_id). ---

  /** Stage a content contribution onto the merchant's Pivota PDP. */
  async submitPivotaPdpContribution(args: {
    platform: string;
    platformProductId: string;
    moduleKey?: string;
    payload: Record<string, unknown>;
    notes?: string;
  }) {
    const { platform, platformProductId, moduleKey = 'copy', payload, notes } = args;
    const url = `/merchant/pdps/product/${encodeURIComponent(platform)}/${encodeURIComponent(platformProductId)}/contributions`;
    const response = await this.client.post(url, {
      module_key: moduleKey,
      payload,
      ...(notes ? { notes } : {}),
    });
    return response.data;
  }

  /** Approve a staged module → routes through the GPT-5.5 quality gate, which
   *  auto-publishes (and makes it agent-readable) when SKU_OPT_OVERLAY_V1 is on.
   *  Returns { decision, published } — or throws SKU_OPT_OVERLAY_V1_DISABLED
   *  (404) when the serving overlay isn't enabled yet. */
  async approvePivotaPdpModule(args: {
    platform: string;
    platformProductId: string;
    moduleKey?: string;
  }) {
    const { platform, platformProductId, moduleKey = 'copy' } = args;
    const url = `/merchant/pdps/product/${encodeURIComponent(platform)}/${encodeURIComponent(platformProductId)}/approve`;
    const response = await this.client.post(url, { module_key: moduleKey });
    return response.data;
  }

  /** Supplier-evidence intake: the merchant supplies VERIFIABLE EVIDENCE (an INCI
   *  list in v1) and Pivota verifies → substantiates → screens → grades it into
   *  provenance-backed, claim-safe claims on the canonical record + serves them.
   *  Returns { status, content_key, wrote_evidence, served, substantiated_claims }. */
  async submitProductEvidence(args: {
    platform: string;
    platformProductId: string;
    rawInci?: string;
    brandUrl?: string;
  }) {
    const { platform, platformProductId, rawInci, brandUrl } = args;
    const url = `/merchant/pdps/product/${encodeURIComponent(platform)}/${encodeURIComponent(platformProductId)}/evidence`;
    const response = await this.client.post(url, {
      ...(rawInci ? { raw_inci: rawInci } : {}),
      ...(brandUrl ? { brand_url: brandUrl } : {}),
    });
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
    segment?: 'all' | 'fix_here' | 'in_store' | 'other';
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
        segment: options?.segment,
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
    segment?: 'all' | 'fix_here' | 'in_store' | 'other';
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
    segment?: 'all' | 'fix_here' | 'in_store' | 'other';
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
        segment: params?.segment,
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

  /** Publish the previewed E1 enrichment to the merchant's OWN store PDP as an
   *  app-owned Shopify metafield (pivota/ai_pdp) — never body_html. GATED +
   *  default-OFF server-side; returns a {status} envelope (written | blocked |
   *  needs_write_products | no_copy | error). Fires ONLY from an explicit
   *  merchant click; the server derives the merchant + copy. */
  async publishStorePdp(platform: string, platformProductId: string) {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.post(
      `/merchant/products/${platform}/${encodedId}/store_pdp/publish`
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

  /**
   * Phase 2b merchant evidence intake (OPTIONAL — a suggestion, never required).
   * Read a product's stored provenance-graded claims.
   *   GET /merchant/products/{platform}/{platform_product_id}/evidence
   */
  async getMerchantProductEvidence(
    platform: string,
    platformProductId: string
  ): Promise<ProductEvidence> {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.get(
      `/merchant/products/${platform}/${encodedId}/evidence`
    );
    return response.data;
  }

  /**
   * Write graded claims for a product. Positioning is stored `unverified`
   * (improves copy); a lab/cert/third-party source_type WITH a source_ref grades
   * it `substantiated` (cited to agents). The serve gate is single-sourced in the
   * backend — this just posts the merchant's intent.
   *   POST /merchant/products/{platform}/{platform_product_id}/evidence
   */
  async addMerchantProductEvidence(
    platform: string,
    platformProductId: string,
    claims: EvidenceClaimInput[],
    reviewState: string = 'observed'
  ): Promise<{
    product_key: string;
    claims_written: number;
    substantiated: number;
    served_refresh: boolean;
  }> {
    const encodedId = encodeURIComponent(platformProductId);
    const response = await this.client.post(
      `/merchant/products/${platform}/${encodedId}/evidence`,
      { claims, review_state: reviewState }
    );
    return response.data;
  }

  /**
   * Upload a lab / third-party test report (PDF) or paste its text → CANDIDATE
   * claims an LLM extracted, for the merchant to review. Nothing is published:
   * confirm a candidate via addMerchantProductEvidence with
   * source_type='merchant_lab_report' and source_ref=<artifact_id> to grade it.
   *   POST /merchant/products/{platform}/{platform_product_id}/evidence/lab-report
   */
  async extractMerchantLabReport(
    platform: string,
    platformProductId: string,
    input: { file?: File | null; labText?: string | null }
  ): Promise<LabExtractionResult> {
    const encodedId = encodeURIComponent(platformProductId);
    const formData = new FormData();
    if (input.file) formData.append('file', input.file);
    if (input.labText) formData.append('lab_text', input.labText);
    const response = await this.client.post(
      `/merchant/products/${platform}/${encodedId}/evidence/lab-report`,
      formData
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

  // Billing (self-serve subscription) methods.
  // The backend derives the merchant from the JWT (no merchantId in the path);
  // the request interceptor already attaches `Authorization: Bearer <token>`.
  async getBillingCurrentPeriod(): Promise<BillingCurrentPeriod> {
    const response = await this.client.get('/api/billing/me/current-period');
    return response.data;
  }

  async getBillingStatements(limit = 12): Promise<BillingStatementsResponse> {
    const response = await this.client.get('/api/billing/me/statements', {
      params: { limit },
    });
    return response.data;
  }

  async getBillingPlans(): Promise<BillingPlansResponse> {
    const response = await this.client.get('/api/billing/plans');
    return response.data;
  }

  async createBillingCheckoutSession(
    data: BillingCheckoutSessionRequest,
  ): Promise<BillingCheckoutSession> {
    const response = await this.client.post('/api/billing/checkout-session', data);
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

  // -------------------------------------------------------------------
  // Visibility-over-time series (the W2 pinned-basis payoff / retention
  // chart). GET /api/merchant-center/audit/tracking
  //   ?limit=1..50&subject_type=merchant|merchant_url
  //
  // Brand-level visibility / attribution / category scores across the
  // merchant's completed audits, each point tagged with its measurement
  // basis so the chart connects ONLY comparable (same pinned prompt set)
  // points and breaks where the basis changed. Same merchant-JWT auth as
  // the other /api/merchant-center/audit/* calls (interceptor attaches it).
  //
  // `subjectType` picks which run kind to trend: 'merchant' (catalog
  // audits, default) or 'merchant_url' (URL-wedge audits — what the
  // url-audit page launches). Disjoint series server-side; never mixed.
  //
  // Returns the payload UNWRAPPED (the route returns it directly, not under
  // `data`); we still tolerate a `data` envelope defensively.
  // -------------------------------------------------------------------
  async getVisibilityTracking(
    limit: number = 50,
    subjectType: import('./types/visibility-tracking').TrackingSubjectType = 'merchant',
  ): Promise<import('./types/visibility-tracking').VisibilityTrackingResponse> {
    const clamped = Math.max(1, Math.min(50, Math.floor(limit) || 50));
    const response = await this.client.get(
      '/api/merchant-center/audit/tracking',
      { params: { limit: clamped, subject_type: subjectType } },
    );
    return response.data?.data || response.data;
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
  // Merchant-CURATED + ASYNC: the merchant gives us their site + up to 5
  // product URLs (their hero SKUs); we FETCH each for clean data and audit
  // exactly those — NO catalog sync, NO auto-discovery.
  //
  // The grounded probes can take several MINUTES (the upstream serializes
  // them), so the POST kicks the audit off and returns a run_id immediately
  // (status: 'running'); we then POLL GET /url-readiness/{run_id} until it's
  // done. Request duration no longer bounds the audit — no more timeouts.
  //
  // `website` defaults to the merchant's onboarding store_url server-side.
  // POST errors surface synchronously: 402 { code: 'free_audit_limit_reached' }
  // past the free cap; 422 { code: 'no_products_resolved', unresolved } when no
  // URL resolves. A failed background run throws Error(message).
  // -------------------------------------------------------------------
  async runUrlReadinessAudit(params: {
    productUrls: string[];
    website?: string;
    brand?: string;
    customPrompts?: string[];
    onProgress?: (info: { elapsedMs: number; status: string }) => void;
  }): Promise<import('./types/ai-readiness').UrlReadinessAuditResponse> {
    const body: Record<string, unknown> = {
      product_urls: params.productUrls,
    };
    if (params.website) body.website = params.website;
    if (params.brand) body.brand = params.brand;
    if (params.customPrompts && params.customPrompts.length > 0) {
      body.custom_prompts = params.customPrompts;
    }

    // 1. Kick off — returns quickly with a run_id (status: 'running').
    const startRes = await this.client.post(
      '/api/merchant-center/audit/url-readiness',
      body,
      { timeout: 60_000 },
    );
    const kicked = startRes.data?.data || startRes.data;
    // Defensive: handle a synchronous result if the backend ever returns one.
    if (kicked?.status === 'succeeded' || kicked?.brand_report) return kicked;
    const runId = kicked?.run_id || kicked?.audit_run_id;
    if (!runId) throw new Error('Audit did not start. Please try again.');

    // 2. Poll until the background audit finishes. The grounded per-SKU probes
    //    serialize upstream — a single product was observed at ~16 min, so the
    //    inline budget is 18 min to let a typical 1–2 URL run finish in-page.
    //    Multi-URL runs can exceed it; the run is durable and continues
    //    server-side, so on budget-exhaustion we signal 'poll_timeout' (handled
    //    as a "still running → Past visibility checks" notice, not a failure).
    const startedAt = Date.now();
    const MAX_MS = 18 * 60_000;
    const INTERVAL_MS = 5_000;
    for (;;) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      const elapsedMs = Date.now() - startedAt;
      let poll: any;
      try {
        const res = await this.client.get(
          `/api/merchant-center/audit/url-readiness/${encodeURIComponent(runId)}`,
          { timeout: 20_000 },
        );
        poll = res.data?.data || res.data;
      } catch (e) {
        // A single poll failing (transient) shouldn't abort — keep trying
        // until the overall budget is spent.
        if (elapsedMs >= MAX_MS) throw e;
        params.onProgress?.({ elapsedMs, status: 'running' });
        continue;
      }
      if (poll?.status === 'succeeded') return poll;
      if (poll?.status === 'failed') {
        throw new Error(poll?.error || 'Audit failed. Please re-run.');
      }
      params.onProgress?.({ elapsedMs, status: poll?.status || 'running' });
      if (elapsedMs >= MAX_MS) {
        // The grounded per-SKU probes serialize upstream and can run past the
        // browser poll budget. The run is durable — it keeps going server-side
        // and lands in Past visibility checks. Signal this as a recoverable
        // "still running" state (with the run_id) rather than a hard failure so
        // the caller can point the merchant to history instead of an error.
        throw Object.assign(
          new Error(
            "Still auditing — this can take a few minutes. We'll save it to Past visibility checks; you can leave this page and re-open it there.",
          ),
          { code: 'poll_timeout', runId },
        );
      }
    }
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

  /**
   * Pre-launch readiness for the per-SKU audit (GET /api/audits/readiness).
   * The audit page calls this on load to show "catalog ready" vs "still
   * preparing" upfront, instead of surfacing the same gate only as a 409 after
   * the merchant clicks Run. Read-only; the backend resolves the merchant from
   * the session.
   */
  async getAuditReadiness(): Promise<
    import('./types/ai-readiness').AuditReadiness
  > {
    const response = await this.client.get('/api/audits/readiness', {
      timeout: 15_000,
    });
    return response.data?.data || response.data;
  }

  /**
   * Buy a pay-as-you-go credit pack (ADR-005). Charges the merchant's verified
   * Stripe card off-session — there's no card-entry UI in the portal — and the
   * credits land in the persistent `purchased_credits` bucket once the Stripe
   * `payment_intent.succeeded` webhook fires (a few seconds later), so the
   * returned balance does NOT yet reflect the new credits.
   *
   * Throws `MissingVerifiedPaymentMethodError` (HTTP 402) when no verified card
   * is on file — the caller routes the merchant to Billing to add one.
   */
  async createCreditTopup(
    packCredits: number,
    idempotencyKey?: string,
  ): Promise<{
    payment_intent_id: string;
    status: string;
    pack_credits: number;
    amount: { currency: string; total: string };
  }> {
    const merchantId = localStorage.getItem('merchant_id') || '';
    try {
      const res = await this.client.post(
        '/api/credits/topup',
        {
          merchant_id: merchantId,
          pack_credits: packCredits,
          idempotency_key: idempotencyKey,
        },
        { timeout: 30_000 },
      );
      return res.data?.data ?? res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        const detail = (err.response.data as { detail?: unknown })?.detail;
        const payload =
          typeof detail === 'object' && detail !== null
            ? (detail as Record<string, unknown>)
            : {};
        throw new MissingVerifiedPaymentMethodError({
          code: typeof payload.error === 'string' ? payload.error : null,
          reason: typeof payload.reason === 'string' ? payload.reason : null,
          message:
            typeof payload.message === 'string'
              ? payload.message
              : 'Add a verified card in Billing to buy credits.',
        });
      }
      throw err;
    }
  }

  /** Fetch one audit run's detail row (stage + report_jsonb). Used to recover a
   *  completed run by id — e.g. when a slow run's live poll hit its budget but
   *  the backend finished and the report is intact. */
  async getAuditRunDetail(runId: string): Promise<{
    stage?: string;
    report_jsonb?: import('./types/ai-readiness').AgentCenterPerSkuAuditResponse;
    error_message?: string | null;
  }> {
    const res = await this.client.get(
      `/api/audits/${encodeURIComponent(runId)}`,
      { timeout: 20_000 },
    );
    return res.data?.data || res.data;
  }

  /** List this merchant's recent audit runs (newest first) — trend-friendly
   *  summary rows only; fetch a run's full report via getAuditRunDetail. Powers
   *  the run-history view so merchants can re-open past audits.
   *  `subjectType` scopes to one run kind ("merchant" = per-SKU catalog audits,
   *  "merchant_url" = the URL-visibility wedge) so each surface lists only the
   *  runs it can open. */
  async listAuditRuns(
    limit = 20,
    subjectType?: string,
  ): Promise<import('./types/ai-readiness').AuditRunSummary[]> {
    const res = await this.client.get('/api/audits', {
      params: subjectType ? { limit, subject_type: subjectType } : { limit },
      timeout: 20_000,
    });
    const data = res.data?.data ?? res.data;
    return Array.isArray(data) ? data : [];
  }

  /** Fetch a completed URL-visibility (wedge) run by id, to re-open it in the
   *  AI Visibility history. Returns the full result when the run succeeded, or a
   *  `{ status }` marker ('running' | 'failed') otherwise. */
  async getUrlAuditRunDetail(
    runId: string,
  ): Promise<
    import('./types/ai-readiness').UrlReadinessAuditResponse | { status: string }
  > {
    const res = await this.client.get(
      `/api/merchant-center/audit/url-readiness/${encodeURIComponent(runId)}`,
      { timeout: 20_000 },
    );
    return res.data?.data ?? res.data;
  }

  /**
   * Ask a freeform question about a completed audit. The backend answers it
   * grounded ONLY in that run's audit data (ungrounded DeepSeek — it can't
   * reach the web), so the reply stays faithful to the report.
   */
  async askAuditQuestion(params: {
    runId: string;
    question: string;
    productKey?: string | null;
  }): Promise<{ answer: string; grounded?: boolean }> {
    const res = await this.client.post(
      '/api/merchant-center/audit/ask',
      {
        run_id: params.runId,
        question: params.question,
        product_key: params.productKey ?? undefined,
      },
      { timeout: 45_000 },
    );
    return res.data?.data ?? res.data;
  }

  /**
   * Turn a "Start here" audit action into a real follow-up: creates a tracked
   * task and (best-effort) drafts the deliverable via grounded DeepSeek. The
   * task is created even if drafting is skipped/fails.
   */
  async startAuditAction(params: {
    runId: string;
    headline: string;
    firstMove?: string | null;
    skuTitle?: string | null;
    growthPhase?: string | null;
    primaryGap?: string | null;
    // External-channel outreach: when set, the backend drafts the artifact to
    // SEND to that third-party source (pitch / review request / KOL DM /
    // community post) instead of first-party copy.
    channelHost?: string | null;
    channelLever?: string | null;
    channelType?: string | null;
    query?: string | null;
  }): Promise<{
    status: 'success' | 'exists' | string;
    task_id?: string;
    draft?: string | null;
    credits_charged?: number;
  }> {
    const res = await this.client.post(
      '/api/merchant-center/audit/actions/start',
      {
        run_id: params.runId,
        headline: params.headline,
        first_move: params.firstMove ?? undefined,
        sku_title: params.skuTitle ?? undefined,
        growth_phase: params.growthPhase ?? undefined,
        primary_gap: params.primaryGap ?? undefined,
        channel_host: params.channelHost ?? undefined,
        channel_lever: params.channelLever ?? undefined,
        channel_type: params.channelType ?? undefined,
        query: params.query ?? undefined,
      },
      { timeout: 45_000 },
    );
    return res.data?.data ?? res.data;
  }

  async runPerSkuAudit(request: {
    merchant_id: string;
    sku_keys: string[];
    prompts_per_sku?: number;
    custom_prompts?: string[];
    providers?: import('./types/ai-readiness').AuditPreviewProvider[];
    idempotency_key: string;
    onProgress?: (info: { elapsedMs: number; stage: string }) => void;
  }): Promise<import('./types/ai-readiness').AgentCenterPerSkuAuditResponse> {
    try {
      // 1. Enqueue. POST /api/audits is async — it returns a 202 receipt
      //    ({ run_id, stage: 'queued' }), NOT the finished report. The worker
      //    drives the run through probing/scoring on its own ticks.
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
          timeout: 60_000,
          headers: { 'Idempotency-Key': request.idempotency_key },
        },
      );
      const created = response.data?.data || response.data;
      // Defensive: if the backend ever returns the full report inline, use it.
      if (created?.per_sku_reports) {
        return created as import('./types/ai-readiness').AgentCenterPerSkuAuditResponse;
      }
      if (created?.report_jsonb?.per_sku_reports) {
        return created.report_jsonb as import('./types/ai-readiness').AgentCenterPerSkuAuditResponse;
      }
      const runId = created?.run_id || created?.audit_run_id;
      if (!runId) throw new Error('Audit did not start. Please try again.');

      // 2. Poll GET /api/audits/{run_id} until the worker finishes. The
      //    completion signal is `stage === 'completed'` (the detail row's
      //    top-level `status` is null); the flat per-SKU report we render
      //    lives in `report_jsonb`.
      const startedAt = Date.now();
      // Worker probes can run several minutes; a 2-SKU grounded run was observed
      // at ~11.5 min, so 9 min was too tight (the poll gave up before the backend
      // finished, stranding a completed report). 15 min covers slow real runs; a
      // timeout still leaves the run recoverable by id (getAuditRunDetail).
      const MAX_MS = 15 * 60_000;
      const INTERVAL_MS = 5_000;
      for (;;) {
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
        const elapsedMs = Date.now() - startedAt;
        let detail: {
          stage?: string;
          report_jsonb?: import('./types/ai-readiness').AgentCenterPerSkuAuditResponse;
          error_jsonb?: { message?: string } | null;
          error_message?: string | null;
        };
        try {
          const res = await this.client.get(
            `/api/audits/${encodeURIComponent(runId)}`,
            { timeout: 20_000 },
          );
          detail = res.data?.data || res.data;
        } catch (e) {
          // Transient poll failure — keep trying until the budget is spent.
          if (elapsedMs >= MAX_MS) throw e;
          request.onProgress?.({ elapsedMs, stage: 'running' });
          continue;
        }
        const stage = detail?.stage ?? 'running';
        if (stage === 'completed') {
          const report = detail.report_jsonb;
          if (!report?.per_sku_reports) {
            throw new Error(
              'Audit completed but returned no report. Please re-run.',
            );
          }
          return report;
        }
        if (stage === 'failed' || stage === 'cancelled') {
          throw new Error(
            detail?.error_jsonb?.message ||
              detail?.error_message ||
              'Audit failed. Please re-run.',
          );
        }
        request.onProgress?.({ elapsedMs, stage });
        if (elapsedMs >= MAX_MS) {
          throw new Error(
            'The audit is taking longer than expected — it may still finish. Check back shortly.',
          );
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        const detail = (err.response.data as { detail?: unknown })?.detail;
        const payload = (typeof detail === 'object' && detail !== null
          ? (detail as Record<string, unknown>)
          : (err.response.data as Record<string, unknown> | undefined)) ?? {};
        // Premium-provider paywall (ChatGPT/Claude on a free plan) also returns
        // 402, distinguished by `code`. Surface it as its own typed error so the
        // page shows a subscribe CTA instead of an insufficient-credits banner.
        if (payload.code === 'premium_provider_subscription_required') {
          throw new PremiumProviderRequiredError({
            premiumProvidersRequested: Array.isArray(payload.premium_providers_requested)
              ? (payload.premium_providers_requested as unknown[]).filter(
                  (p): p is string => typeof p === 'string',
                )
              : [],
            freeAlternativeProvider:
              typeof payload.free_alternative_provider === 'string'
                ? payload.free_alternative_provider
                : null,
            message:
              typeof payload.message === 'string'
                ? payload.message
                : 'This audit uses a premium model. Subscribe to a paid plan to run it.',
          });
        }
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

  /** Phase 3: graduate a winnable-niche 'create the answer' action into a
   *  tracked distribution task in the merchant queue. Idempotent server-side. */
  async createNicheContentTask(body: {
    query: string;
    sku_key?: string;
    sku_name?: string;
    why_you_fit?: string | null;
  }): Promise<{ status: string; task_id: string; title: string }> {
    const response = await this.client.post(
      '/api/merchant-center/audit/tasks/niche-content',
      body,
    );
    return response.data;
  }

  // Outreach lifecycle Step 1: mark a win-plan pitch sent to an independent host.
  // Persists a tracked outreach record so the next audit can re-verify citation.
  async markPitchSent(body: {
    host: string;
    query: string;
    state: 'draft_ready' | 'submission_only';
    tier?: number | null;
    recipient_email?: string | null;
    submission_url?: string | null;
    sku_key?: string;
    sku_title?: string | null;
    audit_run_id?: string;
  }): Promise<{ status: string; task_id: string; title: string }> {
    const response = await this.client.post(
      '/api/merchant-center/audit/tasks/outreach-pitch',
      body,
    );
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

  // ADR-006 Phase 3 — per-SKU request_indexing trigger. Submits the SKU's
  // Pivota canonical PDP URL for indexing under the Pivota credential and
  // returns the REAL backend status (submitted / no_canonical_url / not_enabled
  // / …). Backs the "Pivota handles this" lane so its copy is truthful instead
  // of an unconditional "Automatic" promise. merchant scoping is enforced by
  // the token server-side; target_sku_key comes from nba.cta.target_sku_key.
  async requestSkuIndexing(args: {
    targetSkuKey: string;
    auditRunId?: string | null;
  }): Promise<import('./types/ai-readiness').SkuIndexingResult> {
    const { targetSkuKey, auditRunId } = args;
    const response = await this.client.post(
      '/api/merchant-center/audit/sku/request-indexing',
      {
        target_sku_key: targetSkuKey,
        ...(auditRunId ? { audit_run_id: auditRunId } : {}),
      },
    );
    return response.data;
  }

  // Read-back of the per-SKU Pivota-page indexing status for the status chip.
  async getSkuIndexingStatus(
    targetSkuKey: string,
  ): Promise<import('./types/ai-readiness').SkuIndexingResult> {
    const response = await this.client.get(
      '/api/merchant-center/audit/sku/indexing-status',
      { params: { target_sku_key: targetSkuKey } },
    );
    return response.data;
  }

  // ── W5 P7: per-merchant executor consent. When executor_auto_execute is off,
  // executor runs park in a pending queue the merchant approves/declines.
  async getPendingExecutorRuns(auditRunId?: string | null): Promise<{
    runs: import('./types/ai-readiness').PendingExecutorRun[];
    count: number;
  }> {
    const response = await this.client.get('/merchant/executor-runs/pending', {
      params: auditRunId ? { audit_run_id: auditRunId } : {},
    });
    const data = response.data?.data || response.data || {};
    return {
      runs: Array.isArray(data.runs) ? data.runs : [],
      count: typeof data.count === 'number' ? data.count : (data.runs?.length ?? 0),
    };
  }

  /** Approve a parked executor run (idempotent → 200; 404 not-found;
   *  409 expired/conflict). */
  async approveExecutorRun(runId: string): Promise<{ status?: string }> {
    const response = await this.client.post(
      `/merchant/executor-runs/${encodeURIComponent(runId)}/approve`,
    );
    return response.data?.data || response.data || {};
  }

  /** Decline a parked executor run (idempotent → 200; 404 not-found;
   *  409 expired/conflict). */
  async declineExecutorRun(runId: string): Promise<{ status?: string }> {
    const response = await this.client.post(
      `/merchant/executor-runs/${encodeURIComponent(runId)}/decline`,
    );
    return response.data?.data || response.data || {};
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
