'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Store, Database, FileText, Rocket } from 'lucide-react';
import { FEATURE_FLAGS } from '@/lib/config';
import { platformOnboardingApi } from '@/lib/api';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';

type StepId = 'intro' | 'datasource' | 'reports' | 'coming-soon';

const STEPS: { id: StepId; title: string; icon: any; description: string }[] = [
  {
    id: 'intro',
    title: 'Overview',
    icon: Store,
    description: 'Understand how platform merchants connect to Pivota.',
  },
  {
    id: 'datasource',
    title: 'Data source',
    icon: Database,
    description: 'Choose between multi-channel tools and platform reports.',
  },
  {
    id: 'reports',
    title: 'Platform reports',
    icon: FileText,
    description: 'Upload Amazon/Temu CSV and preview orderable products.',
  },
  {
    id: 'coming-soon',
    title: 'Import & launch',
    icon: Rocket,
    description: 'Catalog import, MDQS and agent visibility (coming next).',
  },
];

interface ValidatePreviewRow {
  row_number: number;
  row_data: Record<string, string>;
  missing_required_fields: string[];
  valid: boolean;
}

interface ValidateResponse {
  report_type: string;
  required_columns: string[];
  found_columns: string[];
  missing_columns: string[];
  rows_scanned: number;
  rows_with_missing_required_fields: number;
  ready_to_import: boolean;
  preview: ValidatePreviewRow[];
}

interface StandardProduct {
  id: string;
  platform: string;
  merchant_id: string;
  title: string;
  price: number;
  currency: string;
  orderable?: boolean;
  orderable_validation?: {
    orderable?: boolean;
    errors?: string[];
  } | null;
}

export default function PlatformOnboardingPage() {
  const { t } = useMerchantLanguage();
  const [currentStep, setCurrentStep] = useState<StepId>('intro');
  const [featureEnabled, setFeatureEnabled] = useState<boolean>(FEATURE_FLAGS.PLATFORM_ONBOARDING_V2);
  const [probing, setProbing] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    business_name: '',
    region: 'US',
    source_type: 'connector',
    contact_email: '',
    store_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<any | null>(null);
  const [importTasks, setImportTasks] = useState<any[] | null>(null);
  const [reportType, setReportType] = useState<'amazon' | 'temu'>('amazon');
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<ValidateResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [products, setProducts] = useState<StandardProduct[]>([]);
  const [orderProductId, setOrderProductId] = useState('');
  const [orderVariantId, setOrderVariantId] = useState('');
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [ordering, setOrdering] = useState(false);
  const [orderResult, setOrderResult] = useState<any | null>(null);

  useEffect(() => {
    if (!FEATURE_FLAGS.PLATFORM_ONBOARDING_V2) return;
    const probe = async () => {
      try {
        setProbing(true);
        const res = await platformOnboardingApi.getFeatureStatus();
        if (res && res.enabled) {
          setFeatureEnabled(true);
        }
      } catch (e) {
        // If backend flag is off we keep the page but show a disabled state.
        setFeatureEnabled(false);
      } finally {
        setProbing(false);
      }
    };
    probe();
  }, []);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!featureEnabled) return;

    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);
    setImportTasks(null);

    try {
      const payload: any = {
        business_name: formData.business_name,
        region: formData.region,
        source_type: formData.source_type,
      };
      if (formData.contact_email) {
        payload.contact_email = formData.contact_email;
      }
      if (formData.store_url) {
        payload.store_url = formData.store_url;
      }

      const created = await platformOnboardingApi.register(payload);
      let tasks: any[] | null = null;

      // Directly use register response - it always has correct platform_profile
      // Skip getDetails to avoid data inconsistency issues
      console.log('[Platform Onboarding] Using register response directly');
      
      if (created && created.onboarding_id) {
        try {
          const tRes = await platformOnboardingApi.listImportTasks(created.onboarding_id);
          tasks = Array.isArray(tRes.tasks) ? tRes.tasks : null;
        } catch (err) {
          console.error('Platform onboarding listImportTasks failed', err);
        }
      }

      setSubmitResult(created);
      if (tasks) {
        setImportTasks(tasks);
      }
    } catch (err: any) {
      console.error('Platform onboarding register failed', err);
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        'Registration failed. Please try again.';
      setSubmitError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshTasks = async () => {
    if (!submitResult?.onboarding_id) return;
    try {
      const tRes = await platformOnboardingApi.listImportTasks(submitResult.onboarding_id);
      const tasks = Array.isArray(tRes.tasks) ? tRes.tasks : null;
      setImportTasks(tasks);
    } catch (err) {
      console.error('Platform onboarding refresh import tasks failed', err);
    }
  };

  const onboardingId = submitResult?.onboarding_id as string | undefined;

  const handleValidateReport = async () => {
    if (!onboardingId || !file) return;
    setValidating(true);
    setValidateResult(null);
    try {
      const data = await platformOnboardingApi.validateReport(onboardingId, reportType, file);
      setValidateResult(data as ValidateResponse);
    } catch (err: any) {
      console.error('Platform report validate failed', err);
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        t('dashboard.platformOnboarding.reports.validationFailed');
      setValidateResult(null);
      alert(detail);
    } finally {
      setValidating(false);
    }
  };

  const handleUploadReport = async () => {
    if (!onboardingId || !file || !validateResult?.ready_to_import) return;
    setUploading(true);
    try {
      const data = await platformOnboardingApi.uploadReport(onboardingId, reportType, file);
      alert(t('dashboard.platformOnboarding.reports.uploadStarted'));
      if (data?.import_task_id) {
        const tRes = await platformOnboardingApi.listImportTasks(onboardingId);
        const tasks = Array.isArray(tRes.tasks) ? tRes.tasks : null;
        setImportTasks(tasks);
      }
    } catch (err: any) {
      console.error('Platform report upload failed', err);
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        t('dashboard.platformOnboarding.reports.uploadFailed');
      alert(detail);
    } finally {
      setUploading(false);
    }
  };

  const handleRefreshProducts = async () => {
    if (!onboardingId) return;
    setProductsLoading(true);
    setProducts([]);
    try {
      const data = await platformOnboardingApi.getOrderableProducts(
        onboardingId,
        reportType,
        20
      );
      const list = (data?.products || []) as StandardProduct[];
      setProducts(list);
    } catch (err: any) {
      console.error('Fetch orderable products failed', err);
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        t('dashboard.platformOnboarding.reports.productsFailed');
      alert(detail);
    } finally {
      setProductsLoading(false);
    }
  };

  const handleCreateStubOrder = async () => {
    if (!onboardingId || !orderProductId) return;
    setOrdering(true);
    setOrderResult(null);
    try {
      const payload = {
        platform: reportType,
        platform_product_id: orderProductId.trim(),
        variant_id: orderVariantId.trim() || undefined,
        quantity: orderQuantity > 0 ? orderQuantity : 1,
      } as const;
      const data = await platformOnboardingApi.createPlatformOrderPoc(onboardingId, payload);
      setOrderResult(data);
    } catch (err: any) {
      console.error('Create stub order failed', err);
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        t('dashboard.platformOnboarding.reports.createTestOrderFailed');
      alert(detail);
    } finally {
      setOrdering(false);
    }
  };

  if (!FEATURE_FLAGS.PLATFORM_ONBOARDING_V2) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">
          {t('dashboard.platformOnboarding.disabledTitle')}
        </h1>
        <p className="text-gray-600 text-sm">
          {t('dashboard.platformOnboarding.disabledDescription')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('dashboard.platformOnboarding.title')}
          </h1>
          <p className="text-gray-600 text-sm">
            {t('dashboard.platformOnboarding.description')}
          </p>
        </div>
        {probing && (
          <div className="text-xs text-gray-500">
            {t('dashboard.platformOnboarding.checkingFlag')}
          </div>
        )}
      </div>

      {!featureEnabled && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm rounded-lg p-4">
          {t('dashboard.platformOnboarding.flagDisabledTitle')}{' '}
          {t('dashboard.platformOnboarding.flagDisabledDescription')}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-1 justify-between md:justify-start md:space-x-8">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-lg border text-left transition-colors text-sm ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">
                    {step.id === 'intro'
                      ? t('dashboard.platformOnboarding.steps.intro')
                      : step.id === 'datasource'
                        ? t('dashboard.platformOnboarding.steps.datasource')
                        : step.id === 'reports'
                          ? t('dashboard.platformOnboarding.steps.reports')
                          : t('dashboard.platformOnboarding.steps.comingSoon')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        {currentStep === 'intro' && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">
              {t('dashboard.platformOnboarding.intro.title')}
            </h2>
            <p className="text-sm text-gray-700">
              {t('dashboard.platformOnboarding.intro.paragraph1')}
            </p>
            <p className="text-sm text-gray-700">
              {t('dashboard.platformOnboarding.intro.paragraph2')}
            </p>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              <li>{t('dashboard.platformOnboarding.intro.bullet1')}</li>
              <li>{t('dashboard.platformOnboarding.intro.bullet2')}</li>
              <li>{t('dashboard.platformOnboarding.intro.bullet3')}</li>
            </ul>
          </section>
        )}

        {currentStep === 'datasource' && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">
              {t('dashboard.platformOnboarding.datasource.title')}
            </h2>
            <p className="text-sm text-gray-700">
              {t('dashboard.platformOnboarding.datasource.description')}
            </p>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              <li>
                <strong>{t('dashboard.platformOnboarding.register.connector')}</strong>: {t('dashboard.platformOnboarding.datasource.pathA')}
              </li>
              <li>
                <strong>{t('dashboard.platformOnboarding.register.report')}</strong>: {t('dashboard.platformOnboarding.datasource.pathB')}
              </li>
            </ul>
            <p className="text-xs text-gray-500">
              {t('dashboard.platformOnboarding.datasource.apiReserved')}{' '}
              <code className="mx-1 bg-gray-100 px-1 rounded">/platform-onboarding/register</code>
            </p>
            <div className="mt-4 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-900">
                {t('dashboard.platformOnboarding.register.title')}
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                {t('dashboard.platformOnboarding.register.description')}
              </p>
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('dashboard.platformOnboarding.register.businessName')}
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.business_name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, business_name: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={t('dashboard.platformOnboarding.register.businessPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('dashboard.platformOnboarding.register.region')}
                    </label>
                    <select
                      value={formData.region}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, region: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="US">{t('dashboard.platformOnboarding.register.regionUS')}</option>
                      <option value="CA">{t('dashboard.platformOnboarding.register.regionCA')}</option>
                      <option value="UK">{t('dashboard.platformOnboarding.register.regionUK')}</option>
                      <option value="EU">{t('dashboard.platformOnboarding.register.regionEU')}</option>
                      <option value="APAC">{t('dashboard.platformOnboarding.register.regionAPAC')}</option>
                      <option value="Other">{t('dashboard.platformOnboarding.register.regionOther')}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('dashboard.platformOnboarding.register.contactEmail')}
                    </label>
                    <input
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, contact_email: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={t('dashboard.platformOnboarding.register.contactEmailPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('dashboard.platformOnboarding.register.storeUrl')}
                    </label>
                    <input
                      type="text"
                      value={formData.store_url}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, store_url: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={t('dashboard.platformOnboarding.register.storeUrlPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t('dashboard.platformOnboarding.register.sourceType')}
                  </label>
                  <div className="flex gap-3 text-xs">
                    {[
                      { id: 'connector', label: t('dashboard.platformOnboarding.register.connector') },
                      { id: 'report', label: t('dashboard.platformOnboarding.register.report') },
                      { id: 'unknown', label: t('dashboard.platformOnboarding.register.unknown') },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, source_type: opt.id }))
                        }
                        className={`px-3 py-1 rounded-full border ${
                          formData.source_type === opt.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {submitError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {submitError}
                  </div>
                )}

                {submitResult && (
                  <div className="text-xs bg-green-50 border border-green-200 rounded-md px-3 py-2 space-y-2">
                    <div className="font-semibold text-green-700">
                      {t('dashboard.platformOnboarding.register.createdTitle')}
                    </div>
                    <div className="text-green-800">
                      <div>onboarding_id: {submitResult.onboarding_id}</div>
                      <div>{t('dashboard.platformOnboarding.register.statusLabel')}: {submitResult.status}</div>
                      {submitResult.platform_profile && (
                        <div className="text-[11px]">
                          {t('dashboard.platformOnboarding.register.sourceTypeLabel')}: {submitResult.platform_profile.source_type}
                        </div>
                      )}
                    </div>
                    {importTasks && importTasks.length > 0 && (
                      <div className="mt-2 border-t border-green-100 pt-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-semibold text-[11px] text-green-700">
                            {t('dashboard.platformOnboarding.register.recentTasks')}
                          </div>
                          <button
                            type="button"
                            onClick={handleRefreshTasks}
                            className="text-[10px] text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline"
                          >
                            {t('dashboard.platformOnboarding.register.refreshTasks')}
                          </button>
                        </div>
                        <ul className="space-y-1">
                          {importTasks.map((t) => (
                            <li key={t.id} className="flex items-center justify-between text-[11px]">
                              <span>
                                #{t.id} · {t.connector || 'n/a'} · {t.source_type}
                                {t.counts?.total != null && (
                                  <> · {t.counts.total} {t('dashboard.platformOnboarding.register.itemsLabel')}</>
                                )}
                                {t.counts?.pages_fetched != null && (
                                  <>
                                    {' '}
                                    · {t.counts.pages_fetched} {t('dashboard.platformOnboarding.register.pagesLabel')}
                                  </>
                                )}
                              </span>
                              <span className="text-right">
                                <span className="capitalize">{t.status}</span>
                                {t.counts?.duration_sec != null && (
                                  <span className="ml-1 text-[10px] text-slate-500">
                                    ({t.counts.duration_sec.toFixed?.(2) ?? t.counts.duration_sec}s)
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!featureEnabled || submitting}
                  className="inline-flex items-center px-4 py-2 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? t('dashboard.platformOnboarding.register.creating')
                    : t('dashboard.platformOnboarding.register.create')}
                </button>
              </form>
            </div>
          </section>
        )}

        {currentStep === 'reports' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {t('dashboard.platformOnboarding.reports.title')}
            </h2>
            <p className="text-sm text-gray-700">
              {t('dashboard.platformOnboarding.reports.description')}
            </p>
            {!onboardingId && (
              <p className="text-xs text-red-600">
                {t('dashboard.platformOnboarding.reports.completeRegistration')}
              </p>
            )}

            {onboardingId && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('dashboard.platformOnboarding.reports.reportType')}
                    </label>
                    <select
                      value={reportType}
                      onChange={(e) => {
                        setReportType(e.target.value as 'amazon' | 'temu');
                        setValidateResult(null);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="amazon">{t('dashboard.platformOnboarding.reports.amazon')}</option>
                      <option value="temu">{t('dashboard.platformOnboarding.reports.temu')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('dashboard.platformOnboarding.reports.csvFile')}
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setFile(f);
                        setValidateResult(null);
                      }}
                      className="block w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      {t('dashboard.platformOnboarding.reports.csvHelper')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleValidateReport}
                    disabled={!file || validating}
                    className="inline-flex items-center px-4 py-2 rounded-md text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                  >
                    {validating
                      ? t('dashboard.platformOnboarding.reports.validating')
                      : t('dashboard.platformOnboarding.reports.validate')}
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadReport}
                    disabled={!file || !validateResult?.ready_to_import || uploading}
                    className="inline-flex items-center px-4 py-2 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploading
                      ? t('dashboard.platformOnboarding.reports.uploading')
                      : t('dashboard.platformOnboarding.reports.upload')}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {currentStep === 'coming-soon' && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">
              {t('dashboard.platformOnboarding.steps.comingSoon')}
            </h2>
          </section>
        )}
      </div>
    </div>
  );
}
