'use client';

/**
 * URL check run lifecycle — quote → accept → kick off → poll — shared by the
 * existing URL check page (app/dashboard/agent-center/url-audit) and the
 * Recovery v2 Start screen. Extracted from the URL check page without changing
 * its behaviour or its messages (review M15: reuse, don't re-derive).
 *
 * - A quote is fetched only when shopper (consumer-answer) questions are
 *   included; that is the only case where the backend prices a run before it
 *   starts. Without them there is no pre-run credit quote.
 * - A quote is valid for one exact request scope; any change needs a new one.
 * - 402 = not enough credits / free checks used; 409 quote_required = the scope
 *   or price changed; 422 = no product resolved from the links (may carry an
 *   upgrade_path); poll_timeout = the durable run is still going (not a failure).
 */
import { useCallback, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { UrlReadinessAuditResponse } from '@/lib/types/ai-readiness';

export type UrlAuditRequest = {
  product_urls: string[];
  website?: string;
  brand?: string;
  custom_prompts?: string[];
  custom_prompts_by_url?: Record<string, string[]>;
  consumer_answer_queries: string[];
};

export type UrlAuditQuote = {
  scope: string;
  quote_id: string;
  credits: number;
  base_credits: number;
  providers: string[];
  product_count: number;
  consumer_capture?: { credits: number; probe_count: number };
};

export type UrlAuditErrorKind = 'needs_urls' | 'quote_required' | 'credits' | 'unresolved' | 'other';

export type UrlAuditErrorInfo = {
  kind: UrlAuditErrorKind;
  /** The URL check page's message, unchanged. */
  message: string;
  upgradePath: string | null;
  unresolved: string[];
  required: number | null;
  available: number | null;
};

export type UrlAuditOutcome = 'quoted' | 'finished' | 'still_running' | 'failed';

export function urlAuditScope(request: UrlAuditRequest): string {
  return JSON.stringify(request);
}

export function useUrlAuditRun(options: {
  onFinished?: (result: UrlReadinessAuditResponse, request: UrlAuditRequest) => void;
  onStillRunning?: (runId: string | null, request: UrlAuditRequest) => void;
} = {}) {
  const { onFinished, onStillRunning } = options;
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorInfo, setErrorInfo] = useState<UrlAuditErrorInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quote, setQuote] = useState<UrlAuditQuote | null>(null);
  const [result, setResult] = useState<UrlReadinessAuditResponse | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const setError = useCallback((message: string | null) => {
    setErrorInfo(message ? { kind: 'other', message, upgradePath: null, unresolved: [], required: null, available: null } : null);
  }, []);

  const quoteFor = useCallback(
    (request: UrlAuditRequest) => (quote?.scope === urlAuditScope(request) ? quote : null),
    [quote],
  );

  const start = useCallback(async (request: UrlAuditRequest): Promise<UrlAuditOutcome> => {
    const fail = (info: Omit<UrlAuditErrorInfo, 'upgradePath' | 'unresolved' | 'required' | 'available'> & Partial<UrlAuditErrorInfo>) =>
      setErrorInfo({ upgradePath: null, unresolved: [], required: null, available: null, ...info });
    if (request.product_urls.length === 0) {
      fail({ kind: 'needs_urls', message: 'Add at least one product URL to audit.' });
      return 'failed';
    }
    const consumerQueries = request.consumer_answer_queries;
    const scope = urlAuditScope(request);
    const currentQuote = quote?.scope === scope ? quote : null;
    setLoading(true);
    setElapsedSec(0);
    setErrorInfo(null);
    setNotice(null);
    try {
      if (consumerQueries.length && !currentQuote) {
        const fresh = await apiClient.quoteUrlReadinessAudit(request);
        setQuote({ ...fresh, scope });
        return 'quoted';
      }
      setResult(null);
      const res = await apiClient.runUrlReadinessAudit({
        productUrls: request.product_urls,
        consumerAnswerQueries: consumerQueries,
        acceptedQuote: currentQuote?.quote_id,
        website: request.website,
        brand: request.brand,
        customPrompts: request.custom_prompts,
        customPromptsByUrl: request.custom_prompts_by_url,
        onProgress: ({ elapsedMs }) => setElapsedSec(Math.round(elapsedMs / 1000)),
      });
      setQuote(null);
      setResult(res);
      setActiveRunId(res.audit_run_id ?? null);
      onFinished?.(res, request);
      return 'finished';
    } catch (e: any) {
      setQuote(null);
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      if (e?.code === 'poll_timeout') {
        // Not a failure — the durable run is still going and will appear in
        // Past visibility checks. Surface it there + as a friendly notice.
        setNotice(e?.message || 'Still auditing — check Past visibility checks shortly.');
        if (e?.runId) setActiveRunId(e.runId);
        onStillRunning?.(e?.runId ?? null, request);
        return 'still_running';
      }
      if (status === 409 && detail?.code === 'quote_required') {
        fail({ kind: 'quote_required', message: detail.message || 'The audit scope or price changed. Get a fresh quote.' });
      } else if (status === 402) {
        fail({
          kind: 'credits',
          required: typeof detail?.required === 'number' ? detail.required : null,
          available: typeof detail?.available === 'number' ? detail.available : null,
          message:
            (typeof detail === 'string' ? detail : detail?.message) ||
            (consumerQueries.length ? `Not enough credits for this audit${typeof detail?.required === 'number' ? `: ${detail.required} required, ${detail.available ?? 0} available` : ''}. Top up credits, or remove the supplemental questions to use any remaining free diagnostic allowance.` : null) ||
            "You've used your free URL audits. Connect your store for the full per-SKU audit, or upgrade to keep auditing by URL.",
        });
      } else if (status === 422) {
        const unresolved: string[] = Array.isArray(detail?.unresolved)
          ? detail.unresolved.map((u: { url?: string }) => u?.url).filter(Boolean)
          : [];
        fail({
          kind: 'unresolved',
          unresolved,
          upgradePath: typeof detail?.upgrade_path === 'string' && detail.upgrade_path ? detail.upgrade_path : null,
          message:
            ((typeof detail === 'string' ? detail : detail?.message) ||
              "We couldn't read a product from those URLs. Make sure each link opens a single product page.") +
            (unresolved.length ? ` (${unresolved.join(', ')})` : ''),
        });
      } else {
        fail({ kind: 'other', message: (typeof detail === 'string' ? detail : detail?.message) || e?.message || 'Audit failed. Please try again.' });
      }
      return 'failed';
    } finally {
      setLoading(false);
    }
  }, [quote, onFinished, onStillRunning]);

  return {
    loading,
    elapsedSec,
    error: errorInfo?.message ?? null,
    errorInfo,
    errorUpgradePath: errorInfo?.upgradePath ?? null,
    notice,
    result,
    activeRunId,
    quoteFor,
    clearQuote: () => setQuote(null),
    start,
    setResult,
    setActiveRunId,
    setError,
  };
}
