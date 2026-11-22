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

test("stripAuthFromError removes the bearer token from a real AxiosError, and a retry still authenticates", async () => {
  const { stripAuthFromError } = await import("../lib/api-error.ts");
  const { default: axios } = await import("axios");
  const token = "Bearer eyJhbGciOiJIUzI1NiJ9.placeholder.signature";
  const seen = [];
  const client = axios.create({
    adapter: async (config) => {
      seen.push(config.headers.get("Authorization"));
      const error = new axios.AxiosError("Request failed with status code 401", "ERR_BAD_REQUEST", config, {}, {
        status: 401, statusText: "Unauthorized", headers: {}, config, data: { detail: "expired" },
      });
      throw error;
    },
  });
  client.interceptors.request.use((config) => { config.headers.Authorization = token; return config; });
  client.interceptors.response.use((r) => r, (error) => Promise.reject(stripAuthFromError(error)));

  const caught = await client.get("/merchant/settings/preferences").catch((e) => e);
  assert.ok(caught instanceof axios.AxiosError);
  assert.equal(seen[0], token, "the request itself carried the token");
  const dump = JSON.stringify({ config: caught.config, response: { config: caught.response?.config } });
  assert.ok(!dump.includes("Bearer"), dump);
  assert.equal(caught.config.headers.get("Authorization"), undefined);
  assert.equal(caught.response.status, 401, "the rest of the error is intact");

  await client.request(caught.config).catch(() => {});
  assert.equal(seen[1], token, "a retry from the stripped config is re-authenticated by the request interceptor");
  assert.equal(stripAuthFromError(undefined), undefined);
  assert.deepEqual(stripAuthFromError({ config: { headers: { authorization: token, Accept: "x" } } }), { config: { headers: { Accept: "x" } } });
});
