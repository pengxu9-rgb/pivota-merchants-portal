'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, CreditCard, FileText, Rocket, Sparkles, Store } from 'lucide-react';
import RegistrationStep from '@/components/RegistrationStep';
import PSPSetupStep from '@/components/PSPSetupStep';
import DocumentUploadStep from '@/components/DocumentUploadStep';
import CompletionStep from '@/components/CompletionStep';
import { AuthShell } from '@/components/auth/AuthShell';
import { OnboardingProgress } from '@/components/auth/OnboardingProgress';
import { onboardingApi } from '@/lib/api';
import {
  emptyPspDraft,
  emptyRegistrationDraft,
  type OnboardingData,
  type PSPFormData,
  type PublicRegistrationDraft,
  type RegistrationFormData,
  SIGNUP_SESSION_STORAGE_KEY,
  type SignupSessionState,
  type SignupStepId,
} from '@/lib/onboarding';

const signupHighlights = [
  {
    title: 'One merchant account from start to dashboard',
    description:
      'Create the merchant record once and keep the same identity through signup, approval, and portal access.',
    icon: Store,
  },
  {
    title: 'Merchant-native payment setup',
    description:
      'Connect the PSP already used for merchant-native checkout, or finish onboarding first and connect it later.',
    icon: CreditCard,
  },
  {
    title: 'Portal-ready from day one',
    description:
      'Move from onboarding into the merchant portal without switching to a separate registration system.',
    icon: Sparkles,
  },
] as const;

const steps = [
  { id: 'register', title: 'Business info', icon: Store },
  { id: 'psp', title: 'Payment setup', icon: CreditCard },
  { id: 'documents', title: 'Documents', icon: FileText },
  { id: 'complete', title: 'Complete', icon: Rocket },
] as const;

function toPublicRegistrationDraft(formData: RegistrationFormData): PublicRegistrationDraft {
  const { password: _password, confirm_password: _confirmPassword, ...publicDraft } = formData;
  return publicDraft;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      response?: {
        data?: {
          detail?: unknown;
          message?: string;
        };
      };
      message?: string;
    };

    const detail = candidate.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length) {
      const message = detail
        .map((item) =>
          typeof item === 'object' && item !== null && 'msg' in item
            ? String((item as { msg?: unknown }).msg || '')
            : '',
        )
        .filter(Boolean)
        .join(', ');

      if (message) return message;
    }

    const responseMessage = candidate.response?.data?.message;
    if (responseMessage) return responseMessage;
    if (candidate.message) return candidate.message;
  }

  return fallback;
}

function normalizeStoredSession(
  rawValue: string | null,
): {
  currentStep: SignupStepId;
  onboardingData: OnboardingData;
  registrationDraft: PublicRegistrationDraft;
  pspDraft: Pick<PSPFormData, 'pspType' | 'customPspName'>;
} | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<SignupSessionState>;
    const hasMerchantId = typeof parsed.onboardingData?.merchant_id === 'string';
    const storedStep = parsed.currentStep;
    const currentStep: SignupStepId =
      storedStep === 'psp' || storedStep === 'documents' || storedStep === 'complete'
        ? hasMerchantId
          ? storedStep
          : 'register'
        : 'register';

    return {
      currentStep,
      onboardingData: parsed.onboardingData || {},
      registrationDraft: {
        ...toPublicRegistrationDraft(emptyRegistrationDraft),
        ...(parsed.registrationDraft || {}),
      },
      pspDraft: {
        pspType: parsed.pspDraft?.pspType || '',
        customPspName: parsed.pspDraft?.customPspName || '',
      },
    };
  } catch {
    return null;
  }
}

export default function MerchantSignup() {
  const [currentStep, setCurrentStep] = useState<SignupStepId>('register');
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({});
  const [registrationForm, setRegistrationForm] =
    useState<RegistrationFormData>(emptyRegistrationDraft);
  const [pspForm, setPspForm] = useState<PSPFormData>(emptyPspDraft);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = normalizeStoredSession(sessionStorage.getItem(SIGNUP_SESSION_STORAGE_KEY));
    if (stored) {
      setCurrentStep(stored.currentStep);
      setOnboardingData(stored.onboardingData);
      setRegistrationForm((prev) => ({
        ...prev,
        ...stored.registrationDraft,
        password: '',
        confirm_password: '',
      }));
      setPspForm((prev) => ({
        ...prev,
        pspType: stored.pspDraft.pspType,
        customPspName: stored.pspDraft.customPspName,
      }));
    }

    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated || typeof window === 'undefined') return;

    const sessionState: SignupSessionState = {
      currentStep,
      onboardingData,
      registrationDraft: toPublicRegistrationDraft(registrationForm),
      pspDraft: {
        pspType: pspForm.pspType,
        customPspName: pspForm.customPspName,
      },
    };

    sessionStorage.setItem(SIGNUP_SESSION_STORAGE_KEY, JSON.stringify(sessionState));
  }, [currentStep, hasHydrated, onboardingData, pspForm.customPspName, pspForm.pspType, registrationForm]);

  const panelAction = useMemo(
    () => (
      <div className="text-right">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--merchant-muted)]">
          Already registered?
        </p>
        <Link
          href="/login"
          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
        >
          <span>Sign in</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    ),
    [],
  );

  const clearSignupSession = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SIGNUP_SESSION_STORAGE_KEY);
    }
  };

  const resetStepFeedback = () => {
    setError('');
    setLoading(false);
  };

  const updateRegistrationField = (field: keyof RegistrationFormData, value: string) => {
    setRegistrationForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const updatePspField = (field: keyof PSPFormData, value: string) => {
    setPspForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const handleRegistrationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (registrationForm.password !== registrationForm.confirm_password) {
      setError('Passwords do not match.');
      return;
    }

    if (registrationForm.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      const { confirm_password: _confirmPassword, ...payload } = registrationForm;
      const response = await onboardingApi.register(payload);

      setOnboardingData({
        merchant_id: response.merchant_id,
        business_name: registrationForm.business_name,
        store_url: registrationForm.store_url,
        website: registrationForm.website,
        region: registrationForm.region,
        contact_email: registrationForm.contact_email,
        contact_phone: registrationForm.contact_phone,
        auto_approved: response.auto_approved,
        confidence_score: response.confidence_score,
        message: response.message,
      });
      setCurrentStep('psp');
      setError('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handlePspSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!onboardingData.merchant_id) {
      setError('Your merchant record is missing. Please restart registration.');
      setCurrentStep('register');
      return;
    }

    if (!pspForm.pspType) {
      setError('Select a payment provider or choose "Set up later".');
      return;
    }

    if (pspForm.pspType === 'other' && !pspForm.customPspName.trim()) {
      setError('Enter the name of your payment provider.');
      return;
    }

    if (!pspForm.apiKey.trim()) {
      setError('Enter the provider credential or choose "Set up later".');
      return;
    }

    if (pspForm.pspType === 'paypal' && !pspForm.secretKey.trim()) {
      setError('PayPal requires both Client ID and Client Secret.');
      return;
    }

    if ((pspForm.pspType === 'adyen' || pspForm.pspType === 'checkout') && !pspForm.accountId.trim()) {
      setError('This provider requires the account or channel identifier.');
      return;
    }

    setLoading(true);

    try {
      const provider =
        pspForm.pspType === 'other'
          ? pspForm.customPspName.toLowerCase().trim().replace(/\s+/g, '_')
          : pspForm.pspType;

      const additionalData: Record<string, string | boolean> = {};

      if (pspForm.pspType === 'paypal' && pspForm.secretKey.trim()) {
        additionalData.secret_key = pspForm.secretKey.trim();
      }

      if ((pspForm.pspType === 'adyen' || pspForm.pspType === 'checkout') && pspForm.accountId.trim()) {
        additionalData.account_id = pspForm.accountId.trim();
      }

      if (pspForm.pspType === 'other') {
        additionalData.custom_psp = true;
      }

      await onboardingApi.setupPSP(
        onboardingData.merchant_id,
        provider,
        pspForm.apiKey.trim(),
        additionalData,
      );

      setOnboardingData((prev) => ({
        ...prev,
        psp_type: provider,
      }));
      setCurrentStep('documents');
      setError('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Payment setup failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSkipPsp = () => {
    setOnboardingData((prev) => ({ ...prev, psp_type: 'setup_later' }));
    setCurrentStep('documents');
    resetStepFeedback();
  };

  const handleDocumentsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!onboardingData.merchant_id) {
      setError('Your merchant record is missing. Please restart registration.');
      setCurrentStep('register');
      return;
    }

    if (!documentFiles.length) {
      if (onboardingData.auto_approved) {
        setCurrentStep('complete');
        return;
      }

      setError('Upload at least one document or continue later only if you are pre-approved.');
      return;
    }

    setLoading(true);

    try {
      await onboardingApi.uploadDocuments(onboardingData.merchant_id, documentFiles);
      setCurrentStep('complete');
      setError('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Document upload failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSkipDocuments = () => {
    if (!onboardingData.auto_approved) return;

    setCurrentStep('complete');
    resetStepFeedback();
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;

    setDocumentFiles((prev) => [...prev, ...Array.from(files)]);
    if (error) setError('');
  };

  const handleRemoveFile = (index: number) => {
    setDocumentFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  return (
    <AuthShell
      eyebrow="Merchant control center"
      title="Start merchant onboarding in the portal"
      description="Create the merchant record once, complete payment and KYB setup, and continue into the portal with the same merchant account."
      highlights={signupHighlights}
      showSidebar={false}
      panelAction={panelAction}
      progress={<OnboardingProgress steps={[...steps]} currentStep={currentStep} />}
    >
      {currentStep === 'register' ? (
        <RegistrationStep
          formData={registrationForm}
          loading={loading}
          error={error}
          onChange={updateRegistrationField}
          onSubmit={handleRegistrationSubmit}
        />
      ) : null}

      {currentStep === 'psp' ? (
        <PSPSetupStep
          merchantId={onboardingData.merchant_id || ''}
          formData={pspForm}
          loading={loading}
          error={error}
          onBack={() => {
            setCurrentStep('register');
            resetStepFeedback();
          }}
          onSkip={handleSkipPsp}
          onChange={updatePspField}
          onSubmit={handlePspSubmit}
        />
      ) : null}

      {currentStep === 'documents' ? (
        <DocumentUploadStep
          merchantId={onboardingData.merchant_id || ''}
          autoApproved={onboardingData.auto_approved}
          files={documentFiles}
          loading={loading}
          error={error}
          onBack={() => {
            setCurrentStep('psp');
            resetStepFeedback();
          }}
          onSubmit={handleDocumentsSubmit}
          onSkip={handleSkipDocuments}
          onFilesSelected={handleFilesSelected}
          onRemoveFile={handleRemoveFile}
        />
      ) : null}

      {currentStep === 'complete' ? (
        <CompletionStep
          data={onboardingData}
          loginEmail={registrationForm.contact_email || onboardingData.contact_email}
          password={registrationForm.password}
          onClearSession={clearSignupSession}
        />
      ) : null}
    </AuthShell>
  );
}
