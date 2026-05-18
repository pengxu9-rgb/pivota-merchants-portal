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
