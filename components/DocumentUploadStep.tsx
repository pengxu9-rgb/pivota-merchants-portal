'use client';

import type { FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';

interface DocumentUploadStepProps {
  merchantId: string;
  autoApproved?: boolean;
  files: File[];
  loading: boolean;
  error: string;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSkip: () => void;
  onFilesSelected: (files: FileList | null) => void;
  onRemoveFile: (index: number) => void;
}

export default function DocumentUploadStep({
  merchantId,
  autoApproved,
  files,
  loading,
  error,
  onBack,
  onSubmit,
  onSkip,
  onFilesSelected,
  onRemoveFile,
}: DocumentUploadStepProps) {
  const { t } = useMerchantLanguage();
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="merchant-overline">{t('auth.documents.stepEyebrow')}</div>
        <h2 className="text-[1.9rem] font-semibold tracking-[-0.045em] text-[color:var(--merchant-ink)]">
          {t('auth.documents.title')}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
          {t('auth.documents.description')}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-[24px] border border-dashed border-[color:var(--merchant-line-strong)] bg-white/72 p-5 text-center">
            <input
              type="file"
              id="merchant-document-upload"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(event) => onFilesSelected(event.target.files)}
              className="hidden"
            />
            <label htmlFor="merchant-document-upload" className="block cursor-pointer">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border border-[color:var(--merchant-line-strong)] bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]">
                <Upload className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-semibold text-[color:var(--merchant-ink)]">
                {t('auth.documents.uploadTitle')}
              </p>
              <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                {t('auth.documents.uploadDescription')}
              </p>
            </label>
          </div>

          {files.length ? (
            <div className="rounded-[24px] border border-[color:var(--merchant-line)] bg-white/72 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                  {t('auth.documents.selectedFilesTitle')}
                </p>
                <p className="text-xs text-[color:var(--merchant-muted)]">{t('auth.documents.fileCount', { count: files.length })}</p>
              </div>
              <div className="space-y-2.5">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-3 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[color:var(--merchant-line-strong)] bg-white text-[color:var(--merchant-muted-strong)]">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[color:var(--merchant-ink)]">
                          {file.name}
                        </p>
                        <p className="text-xs text-[color:var(--merchant-muted)]">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveFile(index)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--merchant-line-strong)] text-[color:var(--merchant-muted-strong)] transition hover:bg-white"
                      aria-label={t('auth.documents.removeFile', { fileName: file.name })}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[20px] border border-[color:var(--merchant-critical)] bg-[color:var(--merchant-critical-soft)] px-4 py-3 text-sm text-[color:var(--merchant-critical)]">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4.5 w-4.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-[color:var(--merchant-line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--merchant-line-strong)] px-4 py-3 text-sm font-medium text-[color:var(--merchant-muted-strong)] transition hover:bg-white"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
              <span>{t('auth.documents.back')}</span>
            </button>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {autoApproved ? (
                <button
                  type="button"
                  onClick={onSkip}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--merchant-line-strong)] px-4 py-3 text-sm font-medium text-[color:var(--merchant-ink)] transition hover:bg-white"
                >
                  <span>{t('auth.documents.skip')}</span>
                </button>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-2xl bg-[color:var(--merchant-brand)] px-4 py-3 text-sm font-medium text-white shadow-[0_14px_30px_rgba(51,75,133,0.18)] transition hover:bg-[color:var(--merchant-brand-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    <span>{t('auth.documents.uploading')}</span>
                  </>
                ) : (
                  <>
                    <span>{files.length ? t('auth.documents.uploadAndContinue') : t('auth.documents.continue')}</span>
                    <ArrowRight className="h-4.5 w-4.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--merchant-line-strong)] bg-white/80 text-[color:var(--merchant-brand)]">
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                  {t('auth.documents.verificationTitle')}
                </p>
                <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                  {t('auth.documents.verificationDescription', { merchantId })}
                </p>
              </div>
            </div>
          </div>

          {autoApproved ? (
            <div className="rounded-[24px] border border-[color:rgba(157,106,42,0.18)] bg-[color:var(--merchant-warning-soft)] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:rgba(157,106,42,0.2)] bg-white/80 text-[color:var(--merchant-warning)]">
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                    {t('auth.documents.preApprovedTitle')}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
                    {t('auth.documents.preApprovedDescription')}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[24px] border border-[color:var(--merchant-line)] bg-white/72 p-4">
            <p className="text-sm font-semibold text-[color:var(--merchant-ink)]">
              {t('auth.documents.recommendedTitle')}
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
              <li>{t('auth.documents.recommendedRegistration')}</li>
              <li>{t('auth.documents.recommendedTax')}</li>
              <li>{t('auth.documents.recommendedBank')}</li>
              <li>{t('auth.documents.recommendedOwner')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
