/**
 * Pure parts of the URL check run lifecycle (used by useUrlAuditRun):
 * request scope, run params, when a quote is needed, and how backend errors
 * map to merchant-facing outcomes. No imports, so `node --test` can load it
 * directly (tests/url-audit-run.test.mjs).
 *
 * The messages are the URL check page's own, unchanged.
 */

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

export type UrlAuditFailure =
  | { kind: 'still_running'; notice: string; runId: string | null }
  | { kind: 'error'; error: UrlAuditErrorInfo };

export function urlAuditScope(request: UrlAuditRequest): string {
  return JSON.stringify(request);
}

/** The URL check page quotes only runs with shopper (consumer-answer)
 * questions. `quoteAll` (Recovery v2 Start) quotes every run: the read-only
 * quote route prices any request once the free allowance is used. */
export function needsQuote(request: UrlAuditRequest, current: UrlAuditQuote | null, quoteAll = false): boolean {
  if (current && current.scope === urlAuditScope(request)) return false;
  return quoteAll || request.consumer_answer_queries.length > 0;
}

export function runParams(request: UrlAuditRequest, acceptedQuote: string | undefined) {
  return {
    productUrls: request.product_urls,
    consumerAnswerQueries: request.consumer_answer_queries,
    acceptedQuote,
    website: request.website,
    brand: request.brand,
    customPrompts: request.custom_prompts,
    customPromptsByUrl: request.custom_prompts_by_url,
  };
}

export function errorInfo(info: Pick<UrlAuditErrorInfo, 'kind' | 'message'> & Partial<UrlAuditErrorInfo>): UrlAuditErrorInfo {
  return { upgradePath: null, unresolved: [], required: null, available: null, ...info };
}

export const NEEDS_URLS_ERROR = errorInfo({ kind: 'needs_urls', message: 'Add at least one product URL to audit.' });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapUrlAuditFailure(e: any, hasConsumerQueries: boolean): UrlAuditFailure {
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail;
  if (e?.code === 'poll_timeout') {
    // Not a failure — the durable run is still going and will appear in
    // Past visibility checks.
    return { kind: 'still_running', notice: e?.message || 'Still auditing — check Past visibility checks shortly.', runId: e?.runId ?? null };
  }
  if (status === 409 && detail?.code === 'quote_required') {
    return { kind: 'error', error: errorInfo({ kind: 'quote_required', message: detail.message || 'The audit scope or price changed. Get a fresh quote.' }) };
  }
  if (status === 402) {
    return {
      kind: 'error',
      error: errorInfo({
        kind: 'credits',
        required: typeof detail?.required === 'number' ? detail.required : null,
        available: typeof detail?.available === 'number' ? detail.available : null,
        message:
          (typeof detail === 'string' ? detail : detail?.message) ||
          (hasConsumerQueries ? `Not enough credits for this audit${typeof detail?.required === 'number' ? `: ${detail.required} required, ${detail.available ?? 0} available` : ''}. Top up credits, or remove the supplemental questions to use any remaining free diagnostic allowance.` : null) ||
          "You've used your free URL audits. Connect your store for the full per-SKU audit, or upgrade to keep auditing by URL.",
      }),
    };
  }
  if (status === 422) {
    const unresolved: string[] = Array.isArray(detail?.unresolved)
      ? detail.unresolved.map((u: { url?: string }) => u?.url).filter(Boolean)
      : [];
    return {
      kind: 'error',
      error: errorInfo({
        kind: 'unresolved',
        unresolved,
        upgradePath: typeof detail?.upgrade_path === 'string' && detail.upgrade_path ? detail.upgrade_path : null,
        message:
          ((typeof detail === 'string' ? detail : detail?.message) ||
            "We couldn't read a product from those URLs. Make sure each link opens a single product page.") +
          (unresolved.length ? ` (${unresolved.join(', ')})` : ''),
      }),
    };
  }
  return { kind: 'error', error: errorInfo({ kind: 'other', message: (typeof detail === 'string' ? detail : detail?.message) || e?.message || 'Audit failed. Please try again.' }) };
}

/** Internal links only: one leading slash, never protocol-relative, and no
 * backslash, whitespace or control character anywhere (browsers strip tab /
 * CR / LF, so `/\t/evil.example` would become `//evil.example`). */
export function safeInternalPath(path: string | null | undefined): string | null {
  if (typeof path !== 'string') return null;
  if (!/^\/(?![/\\])/.test(path)) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f-\u009f\\]/.test(path)) return null;
  return path;
}
