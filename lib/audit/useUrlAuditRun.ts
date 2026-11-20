'use client';

/**
 * URL check run lifecycle — quote → accept → kick off → poll — shared by the
 * existing URL check page (app/dashboard/agent-center/url-audit) and the
 * Recovery v2 Start screen. Extracted from the URL check page without changing
 * its behaviour or its messages (review M15: reuse, don't re-derive). The pure
 * request / error mapping lives in ./urlAuditRun (unit-tested).
 *
 * - The URL check page fetches a quote only when shopper (consumer-answer)
 *   questions are included. Start passes `quoteAll`: the read-only quote route
 *   prices any request once the free allowance is used, so every Start run is
 *   priced before it can be started.
 * - A quote is valid for one exact request scope; any change needs a new one.
 * - 402 = not enough credits / free checks used; 409 quote_required = the scope
 *   or price changed; 422 = no product resolved from the links (may carry an
 *   upgrade_path); poll_timeout = the durable run is still going (not a failure).
 */
import { useCallback, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { UrlReadinessAuditResponse } from '@/lib/types/ai-readiness';
import {
  NEEDS_URLS_ERROR,
  errorInfo,
  mapUrlAuditFailure,
  needsQuote,
  runParams,
  urlAuditScope,
  type UrlAuditErrorInfo,
  type UrlAuditQuote,
  type UrlAuditRequest,
} from '@/lib/audit/urlAuditRun';

export type { UrlAuditErrorInfo, UrlAuditErrorKind, UrlAuditQuote, UrlAuditRequest } from '@/lib/audit/urlAuditRun';
export { urlAuditScope } from '@/lib/audit/urlAuditRun';

export type UrlAuditOutcome = 'quoted' | 'finished' | 'still_running' | 'failed';

export function useUrlAuditRun(options: {
  onFinished?: (result: UrlReadinessAuditResponse, request: UrlAuditRequest) => void;
  onStillRunning?: (runId: string | null, request: UrlAuditRequest) => void;
  /** Quote every run, not only runs with shopper questions (Recovery v2). */
  quoteAll?: boolean;
} = {}) {
  const { onFinished, onStillRunning, quoteAll = false } = options;
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorState, setErrorState] = useState<UrlAuditErrorInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quote, setQuote] = useState<UrlAuditQuote | null>(null);
  const [result, setResult] = useState<UrlReadinessAuditResponse | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const setError = useCallback((message: string | null) => {
    setErrorState(message ? errorInfo({ kind: 'other', message }) : null);
  }, []);

  const quoteFor = useCallback(
    (request: UrlAuditRequest) => (quote?.scope === urlAuditScope(request) ? quote : null),
    [quote],
  );

  const start = useCallback(async (request: UrlAuditRequest): Promise<UrlAuditOutcome> => {
    if (request.product_urls.length === 0) {
      setErrorState(NEEDS_URLS_ERROR);
      return 'failed';
    }
    const scope = urlAuditScope(request);
    const currentQuote = quote?.scope === scope ? quote : null;
    setLoading(true);
    setElapsedSec(0);
    setErrorState(null);
    setNotice(null);
    try {
      if (needsQuote(request, currentQuote, quoteAll)) {
        const fresh = await apiClient.quoteUrlReadinessAudit(request);
        setQuote({ ...fresh, scope });
        return 'quoted';
      }
      setResult(null);
      const res = await apiClient.runUrlReadinessAudit({
        ...runParams(request, currentQuote?.quote_id),
        onProgress: ({ elapsedMs }) => setElapsedSec(Math.round(elapsedMs / 1000)),
      });
      setQuote(null);
      setResult(res);
      setActiveRunId(res.audit_run_id ?? null);
      onFinished?.(res, request);
      return 'finished';
    } catch (e) {
      setQuote(null);
      const failure = mapUrlAuditFailure(e, request.consumer_answer_queries.length > 0);
      if (failure.kind === 'still_running') {
        // Not a failure — the durable run keeps going and appears in history.
        setNotice(failure.notice);
        if (failure.runId) setActiveRunId(failure.runId);
        onStillRunning?.(failure.runId, request);
        return 'still_running';
      }
      setErrorState(failure.error);
      return 'failed';
    } finally {
      setLoading(false);
    }
  }, [quote, quoteAll, onFinished, onStillRunning]);

  return {
    loading,
    elapsedSec,
    error: errorState?.message ?? null,
    errorInfo: errorState,
    errorUpgradePath: errorState?.upgradePath ?? null,
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
