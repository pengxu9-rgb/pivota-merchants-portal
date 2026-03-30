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
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
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
    if (
      typeof detail === 'object' &&
      detail !== null &&
      'message' in detail &&
      typeof (detail as { message?: unknown }).message === 'string' &&
      (detail as { message: string }).message.trim()
    ) {
      return (detail as { message: string }).message;
    }
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

function normalizeEmail(value: string) {
  return (value || '').trim().toLowerCase();
}

export default function MerchantSignup() {
  const { t } = useMerchantLanguage();
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
          {t('auth.shell.alreadyRegistered')}
        </p>
        <Link
          href="/login"
          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
        >
          <span>{t('auth.shell.signIn')}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    ),
    [t],
  );

  const signupHighlights = useMemo(
    () =>
      [
        {
          title: t('auth.signup.highlightAccountTitle'),
          description: t('auth.signup.highlightAccountDescription'),
          icon: Store,
        },
        {
          title: t('auth.signup.highlightPaymentsTitle'),
          description: t('auth.signup.highlightPaymentsDescription'),
          icon: CreditCard,
        },
        {
          title: t('auth.signup.highlightPortalTitle'),
          description: t('auth.signup.highlightPortalDescription'),
          icon: Sparkles,
        },
      ] as const,
    [t],
  );

  const steps = useMemo(
    () =>
      [
        { id: 'register', title: t('auth.registration.businessDetailsTitle'), icon: Store },
        { id: 'psp', title: t('auth.psp.title'), icon: CreditCard },
        { id: 'documents', title: t('auth.documents.recommendedTitle'), icon: FileText },
        { id: 'complete', title: t('auth.complete.readyTitle'), icon: Rocket },
      ] as const,
    [t],
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
      setError(t('auth.signup.passwordMismatch'));
      return;
    }

    if (registrationForm.password.length < 8) {
      setError(t('auth.signup.passwordTooShort'));
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = normalizeEmail(registrationForm.contact_email);
      const { confirm_password: _confirmPassword, ...payload } = {
        ...registrationForm,
        contact_email: normalizedEmail,
      };
      const response = await onboardingApi.register(payload);

      setOnboardingData({
        merchant_id: response.merchant_id,
        business_name: registrationForm.business_name,
        store_url: registrationForm.store_url,
        website: registrationForm.website,
        region: registrationForm.region,
        contact_email: normalizedEmail,
        contact_phone: registrationForm.contact_phone,
        auto_approved: response.auto_approved,
        confidence_score: response.confidence_score,
        message: response.message,
      });
      setRegistrationForm((prev) => ({
        ...prev,
        contact_email: normalizedEmail,
      }));
      setCurrentStep('psp');
      setError('');
    } catch (err) {
      setError(getApiErrorMessage(err, t('auth.signup.registrationFailed')));
    } finally {
      setLoading(false);
    }
  };

  const handlePspSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!onboardingData.merchant_id) {
      setError(t('auth.signup.merchantMissing'));
      setCurrentStep('register');
      return;
    }

    if (!pspForm.pspType) {
      setError(t('auth.signup.selectProvider'));
      return;
    }

    if (pspForm.pspType === 'other' && !pspForm.customPspName.trim()) {
      setError(t('auth.signup.providerNameRequired'));
      return;
    }

    if (!pspForm.apiKey.trim()) {
      setError(t('auth.signup.providerCredentialRequired'));
      return;
    }

    if (pspForm.pspType === 'paypal' && !pspForm.secretKey.trim()) {
      setError(t('auth.signup.paypalSecretRequired'));
      return;
    }

    if ((pspForm.pspType === 'adyen' || pspForm.pspType === 'checkout') && !pspForm.accountId.trim()) {
      setError(t('auth.signup.providerAccountRequired'));
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
      setError(getApiErrorMessage(err, t('auth.signup.paymentSetupFailed')));
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
      setError(t('auth.signup.merchantMissing'));
      setCurrentStep('register');
      return;
    }

    if (!documentFiles.length) {
      if (onboardingData.auto_approved) {
        setCurrentStep('complete');
        return;
      }

      setError(t('auth.signup.uploadRequired'));
      return;
    }

    setLoading(true);

    try {
      await onboardingApi.uploadDocuments(onboardingData.merchant_id, documentFiles);
      setCurrentStep('complete');
      setError('');
    } catch (err) {
      setError(getApiErrorMessage(err, t('auth.signup.documentUploadFailed')));
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
      eyebrow={t('auth.shell.controlCenter')}
      title={t('auth.signup.pageTitle')}
      description={t('auth.signup.pageDescription')}
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
