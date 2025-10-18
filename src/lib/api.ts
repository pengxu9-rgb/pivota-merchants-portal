import axios from 'axios';

const API_BASE_URL = 'https://web-production-fedb.up.railway.app';

// Create axios instance with auth
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('merchant_token') || localStorage.getItem('merchant_api_key');
  if (token) {
    config.headers['X-Merchant-API-Key'] = token;
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear tokens and redirect to login
      localStorage.removeItem('merchant_token');
      localStorage.removeItem('merchant_api_key');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// PSP Management API
export const pspApi = {
  // Get list of available PSPs
  async getList() {
    const response = await api.get('/admin/psp/list');
    return response.data.psps || [];
  },

  // Get PSP status and metrics
  async getStatus() {
    const response = await api.get('/admin/psp/status');
    return response.data;
  },

  // Test PSP connection
  async testConnection(pspId: string) {
    const response = await api.post(`/admin/psp/${pspId}/test`);
    return response.data;
  },

  // Connect new PSP
  async connect(pspData: any) {
    const response = await api.post('/merchant/onboarding/setup-psp', pspData);
    return response.data;
  },

  // Get PSP metrics
  async getMetrics() {
    const response = await api.get('/psp/metrics');
    return response.data.metrics;
  },

  // Configure PSP settings
  async configure(pspId: string, settings: any) {
    const response = await api.put(`/admin/psp/${pspId}/configure`, settings);
    return response.data;
  }
};

// Routing Rules API
export const routingApi = {
  // Get routing rules
  async getRules() {
    const response = await api.get('/admin/routing/rules');
    return response.data.rules || [];
  },

  // Create new rule
  async createRule(rule: any) {
    const response = await api.post('/admin/routing/rules', rule);
    return response.data;
  },

  // Update rule
  async updateRule(ruleId: string, rule: any) {
    const response = await api.put(`/admin/routing/rules/${ruleId}`, rule);
    return response.data;
  },

  // Delete rule
  async deleteRule(ruleId: string) {
    const response = await api.delete(`/admin/routing/rules/${ruleId}`);
    return response.data;
  },

  // Toggle rule
  async toggleRule(ruleId: string, enabled: boolean) {
    const response = await api.patch(`/admin/routing/rules/${ruleId}`, { enabled });
    return response.data;
  }
};

// Orders API
export const ordersApi = {
  // Get orders
  async getOrders(params?: { status?: string; page?: number; limit?: number }) {
    const response = await api.get('/order/list', { params });
    return response.data;
  },

  // Get order details
  async getOrderDetails(orderId: string) {
    const response = await api.get(`/order/${orderId}`);
    return response.data;
  },

  // Update order status
  async updateStatus(orderId: string, status: string) {
    const response = await api.patch(`/order/${orderId}/status`, { status });
    return response.data;
  },

  // Export orders
  async exportCSV(params?: { status?: string; startDate?: string; endDate?: string }) {
    const response = await api.get('/order/export', { 
      params,
      responseType: 'blob'
    });
    return response.data;
  },

  // Process refund
  async refund(orderId: string, amount?: number) {
    const response = await api.post(`/order/${orderId}/refund`, { amount });
    return response.data;
  }
};

// Products API
export const productsApi = {
  // Get products
  async getProducts(merchantId?: string) {
    const endpoint = merchantId ? `/product/list/${merchantId}` : '/product/list';
    const response = await api.get(endpoint);
    return response.data.products || [];
  },

  // Sync from Shopify
  async syncFromShopify() {
    const response = await api.post('/shopify/sync/products');
    return response.data;
  },

  // Add product
  async addProduct(product: any) {
    const response = await api.post('/product/create', product);
    return response.data;
  },

  // Update product
  async updateProduct(productId: string, product: any) {
    const response = await api.put(`/product/${productId}`, product);
    return response.data;
  },

  // Delete product
  async deleteProduct(productId: string) {
    const response = await api.delete(`/product/${productId}`);
    return response.data;
  },

  // Update stock
  async updateStock(productId: string, quantity: number) {
    const response = await api.patch(`/product/${productId}/stock`, { quantity });
    return response.data;
  }
};

// Settings API
export const settingsApi = {
  // Get merchant profile
  async getProfile() {
    const response = await api.get('/merchant/profile');
    return response.data;
  },

  // Update profile
  async updateProfile(profile: any) {
    const response = await api.put('/merchant/profile', profile);
    return response.data;
  },

  // Get notification preferences
  async getNotifications() {
    const response = await api.get('/merchant/notifications');
    return response.data;
  },

  // Update notifications
  async updateNotifications(preferences: any) {
    const response = await api.put('/merchant/notifications', preferences);
    return response.data;
  },

  // Regenerate API key
  async regenerateApiKey() {
    const response = await api.post('/merchant/api-key/regenerate');
    return response.data;
  },

  // Connect payment method
  async connectPaymentMethod(provider: string, credentials: any) {
    const response = await api.post(`/merchant/payment/${provider}/connect`, credentials);
    return response.data;
  }
};

// Analytics API
export const analyticsApi = {
  // Get dashboard metrics
  async getDashboard(timeRange: '1d' | '7d' | '30d' | '90d' = '7d') {
    const response = await api.get('/analytics/dashboard', { 
      params: { time_range: timeRange } 
    });
    return response.data;
  },

  // Get payment analytics
  async getPaymentAnalytics() {
    const response = await api.get('/analytics/payments');
    return response.data;
  },

  // Get conversion rates
  async getConversionRates() {
    const response = await api.get('/analytics/conversions');
    return response.data;
  },

  // Get revenue metrics
  async getRevenueMetrics() {
    const response = await api.get('/analytics/revenue');
    return response.data;
  }
};

// Auth API
export const authApi = {
  // Merchant login
  async login(email: string, password: string) {
    const response = await api.post('/auth/merchant/login', { email, password });
    if (response.data.access_token) {
      localStorage.setItem('merchant_token', response.data.access_token);
      localStorage.setItem('merchant_user', JSON.stringify(response.data.merchant));
    }
    return response.data;
  },

  // Merchant signup
  async signup(data: any) {
    const response = await api.post('/merchant/onboarding/register', data);
    if (response.data.api_key) {
      localStorage.setItem('merchant_api_key', response.data.api_key);
      localStorage.setItem('merchant_id', response.data.merchant_id);
    }
    return response.data;
  },

  // Logout
  async logout() {
    localStorage.removeItem('merchant_token');
    localStorage.removeItem('merchant_api_key');
    localStorage.removeItem('merchant_user');
    localStorage.removeItem('merchant_id');
    window.location.href = '/login';
  },

  // Get current merchant
  async getCurrentMerchant() {
    const response = await api.get('/merchant/profile');
    return response.data;
  }
};

export default api;