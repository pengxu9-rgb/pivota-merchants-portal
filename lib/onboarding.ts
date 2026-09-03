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
  /**
   * The anonymous audit run the marketing funnel minted for this visitor
   * before they had an account. It survives the multi-step signup in session
   * storage so the dashboard can claim THAT run after login rather than
   * starting a fresh audit — the visitor keeps the check they watched.
   */
  funnelAuditRunId?: string;
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

/**
 * A funnel run id is only ever a v4-shaped UUID.
 *
 * Validated at the boundary rather than trusted because it came from our own
 * marketing site: it is echoed into a redirect URL and then interpolated into
 * an API path segment, and "we generated it" is not a property the browser
 * can verify. Anything else is dropped, which costs the visitor a claim and
 * nothing else.
 */
export function sanitizeFunnelAuditRunId(raw: string | null | undefined): string {
  const trimmed = (raw || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : '';
}

/**
 * Where an audit-funnel signup lands after login, carrying everything the
 * dashboard needs to continue the visitor's session rather than restart it.
 *
 * `audit_run_id` is the one that matters: without it the merchant re-runs an
 * audit they already watched, which is the behaviour this whole funnel exists
 * to remove.
 */
export function auditFunnelLandingPath(input: {
  storeUrl?: string;
  businessName?: string;
  funnelAuditRunId?: string;
}): string {
  const params = new URLSearchParams();
  const website = (input.storeUrl || '').trim();
  const brand = (input.businessName || '').trim();
  const runId = sanitizeFunnelAuditRunId(input.funnelAuditRunId);
  if (website) params.set('website', website);
  if (brand) params.set('brand', brand);
  if (runId) params.set('audit_run_id', runId);
  const query = params.toString();
  return `/dashboard/agent-center/url-audit${query ? `?${query}` : ''}`;
}

