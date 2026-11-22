import assert from "node:assert/strict";
import test from "node:test";

import { formatApiError, formatApiErrorPayload } from "../lib/api-error.ts";

test("formatApiErrorPayload renders FastAPI detail objects as messages", () => {
  assert.equal(
    formatApiErrorPayload({
      detail: {
        code: "WIX_SITE_ID_NOT_FOUND_IN_URL",
        message: "Wix Site ID was not found in that URL.",
      },
    }),
    "Wix Site ID was not found in that URL.",
  );
});

test("formatApiError renders axios-style response objects without object stringification", () => {
  const message = formatApiError({
    response: {
      data: {
        detail: {
          code: "WIX_PERMISSION_DENIED",
          message: "Wix credentials do not have permission to access this site.",
        },
      },
    },
  });

  assert.equal(message, "Wix credentials do not have permission to access this site.");
  assert.equal(message.includes("[object Object]"), false);
});

test("describeRequestError never includes the request headers (bearer token) or the query string", async () => {
  const { describeRequestError } = await import("../lib/api-error.ts");
  const token = "Bearer eyJhbGciOiJIUzI1NiJ9.placeholder.signature";
  const axiosLike = {
    message: "Request failed with status code 401",
    code: "ERR_BAD_REQUEST",
    config: { method: "get", url: "/merchant/settings/preferences?merchant_id=merch_example", headers: { Authorization: token } },
    request: { _header: `GET / HTTP/1.1\r\nAuthorization: ${token}` },
    response: { status: 401, headers: {}, config: { headers: { Authorization: token } } },
  };

  const text = describeRequestError(axiosLike);

  assert.equal(text, "GET /merchant/settings/preferences · 401 · ERR_BAD_REQUEST · Request failed with status code 401");
  assert.ok(!text.includes("Bearer") && !text.includes("merch_example"));
  assert.equal(describeRequestError(new Error("Network Error")), "Network Error");
  assert.equal(describeRequestError(undefined), "request failed");
});
