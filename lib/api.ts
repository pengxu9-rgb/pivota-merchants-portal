import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://pivota-infra-production.up.railway.app';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests if available
apiClient.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const onboardingApi = {
  register: async (data: any) => {
    const response = await apiClient.post('/merchant/onboarding/register', data);
    return response.data;
  },

  submitKYC: async (merchantId: string, documents: any) => {
    const response = await apiClient.post(`/merchant/onboarding/kyc/${merchantId}`, documents);
    return response.data;
  },

  setupPSP: async (merchantId: string, pspData: any) => {
    const response = await apiClient.post(`/merchant/onboarding/psp/${merchantId}`, pspData);
    return response.data;
  },

  getDetails: async (merchantId: string) => {
    const response = await apiClient.get(`/merchant/onboarding/details/${merchantId}`);
    return response.data;
  },

  issueApiKey: async (merchantId: string) => {
    const response = await apiClient.post(`/merchant/onboarding/api-key/${merchantId}`);
    return response.data;
  }
};

export const integrationsApi = {
  connectShopify: async (merchantId: string, data: any) => {
    const response = await apiClient.post(`/integrations/shopify/connect/${merchantId}`, data);
    return response.data;
  },

  connectWix: async (merchantId: string, data: any) => {
    const response = await apiClient.post(`/integrations/wix/connect/${merchantId}`, data);
    return response.data;
  }
};

export default apiClient;
