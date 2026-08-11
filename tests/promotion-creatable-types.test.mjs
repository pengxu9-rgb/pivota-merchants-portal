import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATABLE_PROMOTION_TYPES,
} from "../types/promotion.ts";

// The infra quote engine applies only MULTI_BUY_DISCOUNT (pivota-backend #1728).
// Manually created promotions of any other type are refused upstream with 400
// PROMO_TYPE_NOT_APPLIED_AT_QUOTE, so the create form must not offer them.
// Asserted as an exact ALLOWLIST: adding a type here without teaching the quote
// engine to apply it puts merchants back in front of that error.
test("only MULTI_BUY_DISCOUNT is creatable from the portal", () => {
  assert.deepEqual([...CREATABLE_PROMOTION_TYPES], ["MULTI_BUY_DISCOUNT"]);
});

test("FLASH_SALE and FREE_SHIPPING are not creatable from the portal", () => {
  for (const notApplied of ["FLASH_SALE", "FREE_SHIPPING"]) {
    assert.equal(
      CREATABLE_PROMOTION_TYPES.includes(notApplied),
      false,
      `${notApplied} must not be creatable — it is applied in Shopify pricing, not at quote`,
    );
  }
});
