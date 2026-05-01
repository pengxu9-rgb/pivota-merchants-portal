import crypto from "node:crypto";
import type {
  ChannelAttribution,
  DemandTestInput,
  LLMRawResult,
  MentionedProduct,
  ParsedRecommendation,
  PivotaAttributionPreflight,
  PurchasePathType,
} from "./types";
import { nextId, nowIso } from "./repository.ts";

export const PARSED_RECOMMENDATION_SCHEMA = {
  type: "object",
  properties: {
    mentioned_brands: { type: "array", items: { type: "string" } },
    mentioned_products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          brand: { type: "string" },
          rank: { type: "number" },
          reason: { type: "string" },
          likely_price_range: { type: "string" },
          purchase_path_present: { type: "boolean" },
          purchase_path_type: { type: "string" },
          product_url: { type: "string" },
        },
        required: ["name", "brand", "rank", "reason"],
      },
    },
    product_entity_mentioned: { type: "boolean" },
    merchant_store_mentioned: { type: "boolean" },
    merchant_pdp_url_present: { type: "boolean" },
    merchant_pdp_url: { type: "string" },
    merchant_store_attribution_confidence: { type: "number" },
    merchant_offer_present: { type: "boolean" },
    pivota_pdp_mentioned: { type: "boolean" },
    pivota_pdp_url_present: { type: "boolean" },
    pivota_pdp_url: { type: "string" },
    pivota_pdp_url_verified: { type: "boolean" },
    pivota_product_object_id: { type: "string" },
    pivota_product_object_id_present: { type: "boolean" },
    pivota_product_object_id_verified: { type: "boolean" },
    pivota_offer_present: { type: "boolean" },
    pivota_offer_ids: { type: "array", items: { type: "string" } },
    pivota_offer_ids_present: { type: "boolean" },
    pivota_offer_ids_verified: { type: "boolean" },
    pivota_attribution_verified: { type: "boolean" },
    pivota_attribution_failure_reason: { type: "string" },
    purchase_path_present: { type: "boolean" },
    purchase_path_type: { type: "string" },
    channel_attribution: { type: "string" },
    missing_attributes_identified: {
      type: "array",
      items: { type: "string" },
    },
    reasoning_summary: { type: "string" },
  },
  required: [
    "mentioned_brands",
    "mentioned_products",
    "missing_attributes_identified",
    "reasoning_summary",
  ],
};

function stableHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function includesLoose(haystack: string, needle?: string | null) {
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function domainOf(url?: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeUrlKey(url?: string | null) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return String(url).trim().toLowerCase();
  }
}

function sameUrlPath(a?: string | null, b?: string | null) {
  const left = normalizeUrlKey(a);
  const right = normalizeUrlKey(b);
  return Boolean(left && right && left === right);
}

function candidatePivotaPdpUrl(input: DemandTestInput) {
  const attrs = input.merchantContext?.product?.pivota_attributes || {};
  const explicitUrl = stringValue(attrs.pivota_pdp_url);
  if (explicitUrl) return explicitUrl;
  const objectId = stringValue(attrs.pivota_product_object_id);
  if (/^ext_[a-z0-9_]+$/i.test(objectId)) {
    return `https://agent.pivota.cc/products/${objectId}`;
  }
  return "";
}

function expectedPivotaOfferIds(input: DemandTestInput) {
  const attrs = input.merchantContext?.product?.pivota_attributes || {};
  return arrayOfStrings(attrs.offer_ids).concat(arrayOfStrings(attrs.pivota_offer_ids));
}

function expectedPivotaProductObjectId(input: DemandTestInput) {
  const attrs = input.merchantContext?.product?.pivota_attributes || {};
  return stringValue(attrs.pivota_product_object_id);
}

function matchesExpectedPivotaProduct(input: DemandTestInput, url?: string, finalUrl?: string) {
  const product = input.merchantContext?.product;
  const explicitUrl = stringValue(product?.pivota_attributes?.pivota_pdp_url);
  const objectId = expectedPivotaProductObjectId(input);
  const entityId = product?.product_entity_id || "";
  const urlText = `${url || ""} ${finalUrl || ""}`.toLowerCase();

  if (explicitUrl && (sameUrlPath(url, explicitUrl) || sameUrlPath(finalUrl, explicitUrl))) {
    return true;
  }
  if (objectId && urlText.includes(objectId.toLowerCase())) return true;
  if (entityId && urlText.includes(entityId.toLowerCase())) return true;
  return false;
}

export async function buildPivotaAttributionPreflight(
  input: DemandTestInput
): Promise<PivotaAttributionPreflight> {
  const expectedProductObjectId = expectedPivotaProductObjectId(input);
  const expectedOfferIds = expectedPivotaOfferIds(input);
  const base: PivotaAttributionPreflight = {
    status: "not_applicable",
    expected_product_entity_id: input.merchantContext?.product?.product_entity_id,
    expected_product_object_id: expectedProductObjectId || undefined,
    verified_product_object_ids: [],
    expected_offer_ids: expectedOfferIds,
    verified_offer_ids: [],
  };

  if (input.scanMode !== "pivota_pdp_attribution_test") return base;

  const candidateUrl = candidatePivotaPdpUrl(input);
  if (!candidateUrl) {
    return {
      ...base,
      status: "negative_control",
      candidate_url: undefined,
      status_code: null,
      failure_reason: "no_public_pivota_pdp_url_available",
    };
  }

  let statusCode: number | null = null;
  let finalUrl = candidateUrl;
  try {
    let response = await fetch(candidateUrl, { method: "HEAD", redirect: "follow" });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(candidateUrl, { method: "GET", redirect: "follow" });
    }
    statusCode = response.status;
    finalUrl = response.url || candidateUrl;
  } catch {
    return {
      ...base,
      status: "failed",
      candidate_url: candidateUrl,
      status_code: statusCode,
      final_url: finalUrl,
      failure_reason: "pivota_pdp_preflight_request_failed",
    };
  }

  const verified =
    statusCode >= 200 &&
    statusCode < 300 &&
    matchesExpectedPivotaProduct(input, candidateUrl, finalUrl);

  return {
    ...base,
    status: verified ? "verified" : "failed",
    candidate_url: candidateUrl,
    status_code: statusCode,
    final_url: finalUrl,
    verified_url: verified ? finalUrl : undefined,
    verified_product_object_ids:
      verified && expectedProductObjectId ? [expectedProductObjectId] : [],
    verified_offer_ids: verified ? expectedOfferIds : [],
    failure_reason: verified ? undefined : "pivota_pdp_url_not_public_or_product_mismatch",
  };
}

const purchasePathTypes = new Set<PurchasePathType>([
  "none",
  "merchant_pdp",
  "merchant_offer",
  "pivota_pdp",
  "pivota_offer",
  "executable_offer",
  "unknown",
]);

const channelAttributions = new Set<ChannelAttribution>([
  "unattributed_product_recommendation",
  "merchant_store_attributed",
  "pivota_pdp_attributed",
  "pivota_pdp_attributed_unverified",
  "pivota_pdp_attributed_verified",
  "pivota_offer_attributed",
  "pivota_offer_attributed_unverified",
  "pivota_offer_attributed_verified",
  "unverified_pivota_echo",
  "executable_offer_attributed",
  "unknown",
]);

function normalizePurchasePathType(value: unknown): PurchasePathType {
  const normalized = String(value || "").trim().toLowerCase();
  return purchasePathTypes.has(normalized as PurchasePathType)
    ? (normalized as PurchasePathType)
    : normalized
      ? "unknown"
      : "none";
}

function normalizeChannelAttribution(value: unknown): ChannelAttribution | null {
  const normalized = String(value || "").trim().toLowerCase();
  return channelAttributions.has(normalized as ChannelAttribution)
    ? (normalized as ChannelAttribution)
    : null;
}

function inferMissingAttributes(input: DemandTestInput) {
  const product = input.merchantContext?.product;
  const query = input.query.toLowerCase();
  const missing = new Set<string>();

  if (query.includes("sensitive") && !product?.pivota_attributes?.sensitive_skin) {
    missing.add("sensitive_skin");
  }
  if (query.includes("fragrance") && !product?.pivota_attributes?.fragrance_free) {
    missing.add("fragrance_free");
  }
  if (query.includes("under") && product?.price && product.price > 45) {
    missing.add("price_band_clarity");
  }
  if (query.includes("beginner") && !product?.pivota_attributes?.beginner_friendly) {
    missing.add("beginner_friendly");
  }
  if (query.includes("vitamin c") && !product?.pivota_attributes?.vitamin_c) {
    missing.add("vitamin_c");
  }

  return [...missing];
}

function competitorRecommendation(input: DemandTestInput, rank = 1): MentionedProduct {
  const brands = input.competitorContext?.brands?.length
    ? input.competitorContext.brands
    : ["Competitor A"];
  const products = input.competitorContext?.products?.length
    ? input.competitorContext.products
    : ["Competitor Recommendation"];
  const index = Number.parseInt(stableHash(input.query).slice(0, 2), 16) % brands.length;

  return {
    name: products[index % products.length],
    brand: brands[index],
    rank,
    reason: "Clearer public claims for this shopping intent.",
    likely_price_range: "$30-$55",
    purchase_path_present: false,
  };
}

function merchantRecommendation(input: DemandTestInput, rank = 2): MentionedProduct {
  const product = input.merchantContext?.product;

  return {
    name: product?.title || "Demo Skincare Product",
    brand: product?.brand || "Demo Skincare Brand",
    rank,
    reason: "Relevant merchant product with improving agent-facing attributes.",
    likely_price_range:
      typeof product?.price === "number" ? `$${product.price.toFixed(0)}` : "$30-$55",
    purchase_path_present: Boolean(product?.pdp_url),
  };
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(),
  ];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Let parseProviderOutput mark schema validity; a malformed model payload is
      // parser evidence, not a transport/provider failure.
    }
  }

  return undefined;
}

function mockGeminiOutput(input: DemandTestInput) {
  const hash = stableHash(
    `${input.query}:${input.promptTemplateId}:${input.repetitionIndex}`
  );
  const product = input.merchantContext?.product;
  const shouldMentionMerchant =
    input.retestBoost ||
    input.promptTemplateId.includes("merchant_aware") ||
    Number.parseInt(hash.slice(0, 2), 16) % 9 === 0;

  const mentionedProducts: MentionedProduct[] = shouldMentionMerchant
    ? [
        merchantRecommendation(input, input.retestBoost ? 1 : 2),
        competitorRecommendation(input, input.retestBoost ? 3 : 1),
      ]
    : [
        competitorRecommendation(input, 1),
        {
          ...competitorRecommendation(input, 2),
          brand: "Competitor B",
          name: "Barrier Repair Moisturizer",
          reason: "The answer has stronger attribute evidence for this query.",
        },
      ];

  const missingAttributes = input.retestBoost
    ? inferMissingAttributes(input).slice(0, 1)
    : inferMissingAttributes(input);

  const merchantAttributed =
    input.scanMode === "merchant_store_attribution_test" && shouldMentionMerchant;
  const pivotaAttributed =
    input.scanMode === "pivota_pdp_attribution_test" && shouldMentionMerchant;
  const merchantPdpUrl = input.merchantContext?.product?.pdp_url || "";
  const pivotaPdpUrl =
    typeof input.merchantContext?.product?.pivota_attributes?.pivota_pdp_url === "string"
      ? input.merchantContext.product.pivota_attributes.pivota_pdp_url
      : "";
  const pivotaProductObjectId = expectedPivotaProductObjectId(input);
  const pivotaOfferIds = Array.isArray(
    input.merchantContext?.product?.pivota_attributes?.offer_ids
  )
    ? input.merchantContext?.product?.pivota_attributes?.offer_ids.map(String)
    : [];

  return {
    mentioned_brands: [...new Set(mentionedProducts.map((product) => product.brand))],
    mentioned_products: mentionedProducts,
    product_entity_mentioned: shouldMentionMerchant,
    merchant_store_mentioned: merchantAttributed,
    merchant_pdp_url_present: merchantAttributed && Boolean(merchantPdpUrl),
    merchant_pdp_url: merchantAttributed ? merchantPdpUrl : "",
    merchant_store_attribution_confidence: merchantAttributed ? 0.92 : 0,
    merchant_offer_present: false,
    pivota_pdp_mentioned: pivotaAttributed,
    pivota_pdp_url_present: pivotaAttributed && Boolean(pivotaPdpUrl),
    pivota_pdp_url: pivotaAttributed ? pivotaPdpUrl : "",
    pivota_pdp_url_verified: false,
    pivota_product_object_id: pivotaAttributed ? pivotaProductObjectId : "",
    pivota_product_object_id_present: pivotaAttributed && Boolean(pivotaProductObjectId),
    pivota_product_object_id_verified: false,
    pivota_offer_present: pivotaAttributed && pivotaOfferIds.length > 0,
    pivota_offer_ids: pivotaAttributed ? pivotaOfferIds : [],
    pivota_offer_ids_present: pivotaAttributed && pivotaOfferIds.length > 0,
    pivota_offer_ids_verified: false,
    pivota_attribution_verified: false,
    pivota_attribution_failure_reason: pivotaAttributed
      ? "mock_provider_output_requires_preflight_verification"
      : "",
    purchase_path_present: merchantAttributed || pivotaAttributed,
    purchase_path_type: merchantAttributed
      ? "merchant_pdp"
      : pivotaAttributed && pivotaOfferIds.length
        ? "pivota_offer"
        : pivotaAttributed
          ? "pivota_pdp"
          : "none",
    channel_attribution: merchantAttributed
      ? "merchant_store_attributed"
      : pivotaAttributed && pivotaOfferIds.length
        ? "pivota_offer_attributed_unverified"
        : pivotaAttributed
          ? "pivota_pdp_attributed_unverified"
          : shouldMentionMerchant
            ? "unattributed_product_recommendation"
            : "unknown",
    missing_attributes_identified: missingAttributes,
    reasoning_summary: shouldMentionMerchant
      ? `${product?.title || "The merchant product"} is visible for this AI demand scenario but still needs clearer structured evidence.`
      : "The model prefers competitors with clearer demand-specific claims and stronger agent-facing product evidence.",
  };
}

export class GeminiProviderAdapter {
  providerName = "gemini" as const;

  supportsStructuredOutput() {
    return true;
  }

  supportsWebGrounding() {
    return true;
  }

  supportsBatch() {
    return true;
  }

  async estimateCost(input: DemandTestInput) {
    const promptChars = `${input.prompt}\n${input.query}`.length;
    return {
      estimated_input_tokens: Math.ceil(promptChars / 4),
      estimated_output_tokens: 650,
      ai_test_credits: 1,
    };
  }

  async runDemandTest(input: DemandTestInput): Promise<LLMRawResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    const allowLiveGemini =
      apiKey && process.env.PIVOTA_AGENT_CENTER_MOCK_GEMINI !== "true";

    if (!allowLiveGemini) {
      const raw = mockGeminiOutput(input);
      return {
        provider: "gemini",
        model: input.model,
        raw_output: raw,
        normalized_output: raw,
        input_tokens: Math.ceil(`${input.prompt}\n${input.query}`.length / 4),
        output_tokens: 320,
        tool_calls: 0,
        provider_request_id: `mock_gemini_${stableHash(JSON.stringify(raw)).slice(0, 12)}`,
      };
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      input.model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${input.prompt}\n\nContext:\n${JSON.stringify({
                merchant: input.merchantContext,
                pivota: input.pivotaContext,
                competitors: input.competitorContext,
              })}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: PARSED_RECOMMENDATION_SCHEMA,
      },
    };

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            `Gemini request failed: ${response.status} ${JSON.stringify(payload)}`
          );
        }

        const rawText =
          payload?.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text || "")
            .join("") || "{}";
        const usage = payload?.usageMetadata || {};
        const normalized = parseJsonObject(rawText);

        return {
          provider: "gemini",
          model: input.model,
          raw_output: rawText,
          normalized_output: normalized || {},
          input_tokens: Number(usage.promptTokenCount || 0),
          output_tokens: Number(usage.candidatesTokenCount || 0),
          tool_calls: 0,
          provider_request_id:
            response.headers.get("x-request-id") ||
            `gemini_${stableHash(rawText).slice(0, 12)}`,
        };
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Gemini request failed after retries");
  }
}

export function parseProviderOutput(
  raw: LLMRawResult,
  input: DemandTestInput
): ParsedRecommendation {
  const createdAt = nowIso();
  const validationErrors: string[] = [];
  let output: Record<string, unknown> = {};

  try {
    if (typeof raw.raw_output === "string") {
      const parsed = parseJsonObject(raw.raw_output);
      if (parsed) output = parsed;
      else validationErrors.push("raw_output_json_invalid");
    } else {
      output = raw.normalized_output || raw.raw_output;
    }
  } catch {
    validationErrors.push("raw_output_json_invalid");
  }

  const mentionedProducts = Array.isArray(output.mentioned_products)
    ? output.mentioned_products
        .map((product, index) => {
          const value = product as Record<string, unknown>;
          return {
            name: String(value.name || value.product_name || ""),
            brand: String(value.brand || ""),
            rank: Number(value.rank || index + 1),
            reason: String(value.reason || value.why_it_matches || ""),
            likely_price_range:
              value.likely_price_range === undefined
                ? undefined
                : String(value.likely_price_range),
            purchase_path_present: Boolean(value.purchase_path_present),
            purchase_path_type: normalizePurchasePathType(value.purchase_path_type),
            product_url:
              value.product_url === undefined ? undefined : String(value.product_url),
          };
        })
        .filter((product) => product.name && product.brand)
    : [];

  if (!mentionedProducts.length) {
    validationErrors.push("mentioned_products_missing");
  }

  const mentionedBrands = Array.isArray(output.mentioned_brands)
    ? output.mentioned_brands.map(String).filter(Boolean)
    : [...new Set(mentionedProducts.map((product) => product.brand))];

  if (!mentionedBrands.length) {
    validationErrors.push("mentioned_brands_missing");
  }

  const missingAttributes = Array.isArray(output.missing_attributes_identified)
    ? output.missing_attributes_identified.map(String).filter(Boolean)
    : [];

  const joinedProducts = mentionedProducts
    .map((product) => `${product.brand} ${product.name}`)
    .join(" | ");
  const joinedBrands = mentionedBrands.join(" | ");
  const productUrls = mentionedProducts
    .map((product) => product.product_url || "")
    .filter(Boolean)
    .join(" | ");
  const allText = [
    joinedProducts,
    joinedBrands,
    productUrls,
    String(output.reasoning_summary || ""),
    String(output.purchase_path_type || ""),
    String(output.channel_attribution || ""),
  ].join(" | ");
  const merchantProduct = input.merchantContext?.product;
  const merchantStore = input.merchantContext?.store;
  const merchantBrand = merchantProduct?.brand || input.merchantContext?.store.store_name;
  const merchantBrandMentioned =
    includesLoose(joinedBrands, merchantBrand) ||
    includesLoose(joinedProducts, merchantBrand);
  const merchantProductMentioned =
    includesLoose(joinedProducts, merchantProduct?.title) ||
    includesLoose(joinedProducts, merchantProduct?.product_entity_id);
  const merchantSkuMentioned = includesLoose(joinedProducts, merchantProduct?.sku);
  const recommendation = mentionedProducts.find((product) =>
    includesLoose(`${product.brand} ${product.name}`, merchantProduct?.title)
  );
  const productEntityMentioned =
    merchantProductMentioned ||
    merchantSkuMentioned ||
    includesLoose(joinedProducts, merchantProduct?.product_entity_id);
  const merchantDomain = domainOf(merchantStore?.store_url);
  const merchantPdpDomain = domainOf(merchantProduct?.pdp_url);
  const pivotaPdpUrl =
    typeof merchantProduct?.pivota_attributes?.pivota_pdp_url === "string"
      ? merchantProduct.pivota_attributes.pivota_pdp_url
      : "";
  const pivotaPdpDomain = domainOf(pivotaPdpUrl);
  const expectedProductObjectId = expectedPivotaProductObjectId(input);
  const preflight = input.pivotaAttributionPreflight;
  const verifiedPivotaUrl = preflight?.verified_url;
  const verifiedObjectIds = new Set(preflight?.verified_product_object_ids || []);
  const verifiedOfferIds = new Set(preflight?.verified_offer_ids || []);
  const explicitPurchasePathType = normalizePurchasePathType(output.purchase_path_type);
  const productPurchasePathType =
    mentionedProducts.find((product) => product.purchase_path_present)
      ?.purchase_path_type || "none";
  const purchasePathType =
    explicitPurchasePathType !== "none"
      ? explicitPurchasePathType
      : productPurchasePathType !== "none"
        ? productPurchasePathType
        : mentionedProducts.some((product) => product.purchase_path_present)
          ? "unknown"
          : "none";
  const merchantStoreMentioned =
    Boolean(output.merchant_store_mentioned) ||
    includesLoose(allText, merchantStore?.store_name) ||
    Boolean(merchantDomain && includesLoose(allText, merchantDomain));
  const merchantPdpUrlPresent =
    Boolean(output.merchant_pdp_url_present) ||
    Boolean(merchantProduct?.pdp_url && includesLoose(allText, merchantProduct.pdp_url)) ||
    Boolean(merchantPdpDomain && productUrls.includes(merchantPdpDomain));
  const merchantPdpUrl =
    typeof output.merchant_pdp_url === "string"
      ? output.merchant_pdp_url
      : merchantPdpUrlPresent
        ? merchantProduct?.pdp_url
        : undefined;
  const explicitMerchantConfidence = Number(
    output.merchant_store_attribution_confidence
  );
  const merchantStoreAttributionConfidence = Number(
    (Number.isFinite(explicitMerchantConfidence)
      ? Math.max(0, Math.min(1, explicitMerchantConfidence))
      : merchantPdpUrlPresent
        ? 0.95
        : merchantStoreMentioned
          ? 0.82
          : 0).toFixed(2)
  );
  const merchantOfferPresent =
    Boolean(output.merchant_offer_present) || purchasePathType === "merchant_offer";
  const pivotaPdpMentioned =
    Boolean(output.pivota_pdp_mentioned) ||
    includesLoose(allText, "pivota unified pdp") ||
    includesLoose(allText, "pivota product") ||
    includesLoose(allText, "agent.pivota.cc") ||
    includesLoose(allText, "pivota.cc");
  const modelPivotaUrl = mentionedProducts.find((product) => {
    const domain = domainOf(product.product_url);
    return domain === "agent.pivota.cc" || domain === "pivota.cc";
  })?.product_url;
  const parsedPivotaPdpUrl =
    stringValue(output.pivota_pdp_url) ||
    (pivotaPdpUrl && includesLoose(allText, pivotaPdpUrl) ? pivotaPdpUrl : "") ||
    (verifiedPivotaUrl && includesLoose(allText, verifiedPivotaUrl)
      ? verifiedPivotaUrl
      : "") ||
    modelPivotaUrl;
  const pivotaPdpUrlPresent =
    Boolean(parsedPivotaPdpUrl) ||
    Boolean(pivotaPdpUrl && includesLoose(allText, pivotaPdpUrl)) ||
    Boolean(verifiedPivotaUrl && includesLoose(allText, verifiedPivotaUrl)) ||
    Boolean(pivotaPdpDomain && productUrls.includes(pivotaPdpDomain));
  const pivotaPdpUrlVerified =
    Boolean(parsedPivotaPdpUrl) &&
    Boolean(
      (verifiedPivotaUrl && sameUrlPath(parsedPivotaPdpUrl, verifiedPivotaUrl)) ||
        (preflight?.status === "verified" &&
          matchesExpectedPivotaProduct(input, parsedPivotaPdpUrl, parsedPivotaPdpUrl))
    );
  const outputProductObjectId = stringValue(output.pivota_product_object_id);
  const parsedProductObjectId =
    outputProductObjectId ||
    (expectedProductObjectId && includesLoose(allText, expectedProductObjectId)
      ? expectedProductObjectId
      : "");
  const pivotaProductObjectIdPresent = Boolean(parsedProductObjectId);
  const pivotaProductObjectIdVerified =
    Boolean(parsedProductObjectId) && verifiedObjectIds.has(parsedProductObjectId);
  const outputOfferIds = arrayOfStrings(output.pivota_offer_ids);
  const inferredOfferIds = (preflight?.expected_offer_ids || []).filter((offerId) =>
    includesLoose(allText, offerId)
  );
  const pivotaOfferIds = uniqueStrings(outputOfferIds.concat(inferredOfferIds));
  const pivotaOfferIdsPresent = pivotaOfferIds.length > 0;
  const pivotaOfferIdsVerified =
    pivotaOfferIds.length > 0 && pivotaOfferIds.some((offerId) => verifiedOfferIds.has(offerId));
  const pivotaAttributionVerified =
    pivotaPdpUrlVerified || pivotaProductObjectIdVerified || pivotaOfferIdsVerified;
  const pivotaOfferPresent =
    pivotaOfferIdsPresent ||
    Boolean(output.pivota_offer_present) ||
    purchasePathType === "pivota_offer";
  const pivotaAttributionEcho =
    !pivotaAttributionVerified &&
    (pivotaPdpMentioned ||
      pivotaPdpUrlPresent ||
      pivotaProductObjectIdPresent ||
      pivotaOfferPresent ||
      String(output.channel_attribution || "").toLowerCase().includes("pivota"));
  const pivotaAttributionFailureReason = pivotaAttributionVerified
    ? undefined
    : preflight?.status === "negative_control"
      ? "pivota_pdp_preflight_negative_control_no_public_url"
      : pivotaPdpUrlPresent
        ? "pivota_pdp_url_not_verified"
        : pivotaProductObjectIdPresent
          ? "pivota_product_object_id_not_verified"
          : pivotaOfferIdsPresent
            ? "pivota_offer_ids_not_verified"
            : pivotaAttributionEcho
              ? "unverified_pivota_echo"
              : preflight?.failure_reason;
  const competitorBrands = input.competitorContext?.brands || [];
  const competitorSubstitutionDetected =
    !merchantProductMentioned &&
    mentionedProducts.some((product) =>
      competitorBrands.some((brand) => includesLoose(product.brand, brand))
    );
  const outputChannelAttribution = normalizeChannelAttribution(
    output.channel_attribution
  );
  const channelAttribution: ChannelAttribution =
    purchasePathType === "executable_offer"
      ? "executable_offer_attributed"
      : pivotaOfferPresent && pivotaOfferIdsVerified
        ? "pivota_offer_attributed_verified"
        : pivotaOfferPresent
          ? "pivota_offer_attributed_unverified"
          : (pivotaPdpUrlPresent || pivotaProductObjectIdPresent) &&
              (pivotaPdpUrlVerified || pivotaProductObjectIdVerified)
            ? "pivota_pdp_attributed_verified"
            : pivotaPdpUrlPresent || pivotaProductObjectIdPresent
              ? "pivota_pdp_attributed_unverified"
              : pivotaAttributionEcho ||
                  outputChannelAttribution === "pivota_pdp_attributed" ||
                  outputChannelAttribution === "pivota_offer_attributed"
                ? "unverified_pivota_echo"
                : outputChannelAttribution ||
                    (merchantStoreMentioned || merchantPdpUrlPresent || merchantOfferPresent
                      ? "merchant_store_attributed"
                      : productEntityMentioned
                        ? "unattributed_product_recommendation"
                        : "unknown");

  const schemaValid = validationErrors.length === 0;
  const parserConfidence = schemaValid
    ? Math.max(0.72, 0.96 - missingAttributes.length * 0.04)
    : 0.42;

  return {
    id: nextId("parsed"),
    test_run_id: "",
    query_cluster_id: input.queryClusterId,
    provider: raw.provider,
    model: raw.model,
    mentioned_brands: mentionedBrands,
    mentioned_products: mentionedProducts,
    product_entity_mentioned: productEntityMentioned,
    merchant_brand_mentioned: merchantBrandMentioned,
    merchant_product_mentioned: merchantProductMentioned,
    merchant_sku_mentioned: merchantSkuMentioned,
    pivota_product_entity_mentioned: includesLoose(
      joinedProducts,
      merchantProduct?.product_entity_id
    ),
    merchant_store_mentioned: merchantStoreMentioned,
    merchant_pdp_url_present: merchantPdpUrlPresent,
    merchant_pdp_url: merchantPdpUrl,
    merchant_store_attribution_confidence: merchantStoreAttributionConfidence,
    merchant_offer_present: merchantOfferPresent,
    pivota_pdp_mentioned: pivotaPdpMentioned,
    pivota_pdp_url_present: pivotaPdpUrlPresent,
    pivota_pdp_url: parsedPivotaPdpUrl,
    pivota_pdp_url_verified: pivotaPdpUrlVerified,
    pivota_product_object_id: parsedProductObjectId || undefined,
    pivota_product_object_id_present: pivotaProductObjectIdPresent,
    pivota_product_object_id_verified: pivotaProductObjectIdVerified,
    pivota_offer_present: pivotaOfferPresent,
    pivota_offer_ids: pivotaOfferIds,
    pivota_offer_ids_present: pivotaOfferIdsPresent,
    pivota_offer_ids_verified: pivotaOfferIdsVerified,
    pivota_attribution_verified: pivotaAttributionVerified,
    pivota_attribution_failure_reason: pivotaAttributionFailureReason,
    pivota_pdp_preflight_status: preflight?.status,
    pivota_pdp_preflight_status_code: preflight?.status_code,
    competitor_substitution_detected: competitorSubstitutionDetected,
    purchase_path_present:
      Boolean(output.purchase_path_present) ||
      mentionedProducts.some((product) => product.purchase_path_present),
    purchase_path_type: purchasePathType,
    channel_attribution: channelAttribution,
    missing_attributes_identified: missingAttributes,
    recommendation_rank: recommendation?.rank || null,
    reasoning_summary: String(output.reasoning_summary || ""),
    parser_confidence: Number(parserConfidence.toFixed(2)),
    schema_valid: schemaValid,
    validation_errors: validationErrors,
    created_at: createdAt,
    updated_at: createdAt,
  };
}
