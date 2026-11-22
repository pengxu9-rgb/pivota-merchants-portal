export function formatApiErrorPayload(payload: unknown, fallback = "Request failed"): string {
  if (payload === null || payload === undefined || payload === "") {
    return fallback;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (payload instanceof Error) {
    return payload.message || fallback;
  }

  if (Array.isArray(payload)) {
    const parts = payload
      .map((item) => formatApiErrorPayload(item, ""))
      .filter(Boolean);
    return parts.length ? parts.join("; ") : fallback;
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    for (const key of ["detail", "message", "error", "reason", "description", "title"]) {
      const value = record[key];
      if (value) {
        const formatted = formatApiErrorPayload(value, "");
        if (formatted) return formatted;
      }
    }

    if (typeof record.code === "string") {
      return record.code;
    }
  }

  return fallback;
}

export function formatApiError(error: unknown, fallback = "Request failed"): string {
  const maybeAxiosError = error as {
    response?: { data?: unknown };
    message?: unknown;
  };

  if (maybeAxiosError?.response?.data !== undefined) {
    const formatted = formatApiErrorPayload(maybeAxiosError.response.data, "");
    if (formatted) return formatted;
  }

  if (typeof maybeAxiosError?.message === "string" && maybeAxiosError.message) {
    return maybeAxiosError.message;
  }

  return formatApiErrorPayload(error, fallback);
}

/**
 * A request error for the browser console, WITHOUT the request config: an AxiosError (or anything
 * shaped like one) carries `config.headers.Authorization`, so logging the error object itself put the
 * merchant's bearer token in the console. Keeps only the message, code, status, method and path
 * (the query string is dropped too).
 */
export function describeRequestError(error: unknown): string {
  const e = (error ?? {}) as {
    message?: unknown;
    code?: unknown;
    response?: { status?: unknown };
    config?: { method?: unknown; url?: unknown };
  };
  const parts: string[] = [];
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const method = text(e.config?.method);
  const url = text(e.config?.url)?.split("?")[0] ?? null;
  if (method || url) parts.push([method?.toUpperCase(), url].filter(Boolean).join(" "));
  if (typeof e.response?.status === "number") parts.push(String(e.response.status));
  const code = text(e.code);
  if (code) parts.push(code);
  const message = text(e.message) ?? (typeof error === "string" ? error : null);
  if (message) parts.push(message);
  return parts.join(" · ") || "request failed";
}

/**
 * Remove the bearer token from a request error before anyone sees it. Call sites across the portal
 * log the AxiosError itself (`console.error('…', err)`), and its `config.headers.Authorization`
 * (also reachable as `response.config`) is the merchant's token. Stripping it once, in the client's
 * error interceptors, covers every one of them. Safe for retries: the request interceptor sets the
 * header again on every request. Returns the same error.
 */
export function stripAuthFromError<T>(error: T): T {
  const scrub = (headers: unknown) => {
    if (!headers || typeof headers !== "object") return;
    const h = headers as Record<string, unknown> & { delete?: (name: string) => unknown };
    for (const name of ["Authorization", "authorization"]) {
      if (typeof h.delete === "function") h.delete(name); // AxiosHeaders
      delete h[name];
    }
  };
  try {
    const e = error as { config?: { headers?: unknown }; response?: { config?: { headers?: unknown } } } | null;
    scrub(e?.config?.headers);
    scrub(e?.response?.config?.headers);
  } catch {
    // never let scrubbing replace the real error
  }
  return error;
}
