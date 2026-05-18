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
