export type SignupStepId = 'register' | 'psp' | 'documents' | 'complete';

export type PSPType = 'stripe' | 'adyen' | 'paypal' | 'checkout' | 'other' | '';

export type OperatingMode = 'storefront' | 'store_less';

export interface RegistrationFormData {
  business_name: string;
  store_url: string;
  website: string;
  region: string;
  contact_email: string;
  contact_phone: string;
  password: string;
  confirm_password: string;
  operating_mode: OperatingMode;
}

export type PublicRegistrationDraft = Omit<
  RegistrationFormData,
  'password' | 'confirm_password'
>;

export interface PSPFormData {
  pspType: PSPType;
  customPspName: string;
  apiKey: string;
  secretKey: string;
  accountId: string;
}

export interface OnboardingData {
  merchant_id?: string;
  business_name?: string;
  store_url?: string;
  website?: string;
  region?: string;
  contact_email?: string;
  contact_phone?: string;
  auto_approved?: boolean;
  confidence_score?: number;
  message?: string;
  psp_type?: string;
}

export interface SignupSessionState {
  currentStep: SignupStepId;
  onboardingData: OnboardingData;
  registrationDraft: PublicRegistrationDraft;
  pspDraft: Pick<PSPFormData, 'pspType' | 'customPspName'>;
  signupSource?: string;
}

export const SIGNUP_SESSION_STORAGE_KEY = 'merchant_signup_flow_v1';

// Acquisition source set by the marketing-site URL-capture form
// (pivota.cc/ai-readiness). Registrations arriving with this source skip the
// PSP + document steps after auto-approval and land directly on the URL-audit
// form, prefilled with the store URL they entered on the marketing site.
export const AUDIT_FUNNEL_SIGNUP_SOURCE = 'ai-readiness-audit';

export const emptyRegistrationDraft: RegistrationFormData = {
  business_name: '',
  store_url: 'https://',
  website: '',
  region: '',
  contact_email: '',
  contact_phone: '',
  password: '',
  confirm_password: '',
  operating_mode: 'storefront',
};

export const emptyPspDraft: PSPFormData = {
  pspType: '',
  customPspName: '',
  apiKey: '',
  secretKey: '',
  accountId: '',
};

