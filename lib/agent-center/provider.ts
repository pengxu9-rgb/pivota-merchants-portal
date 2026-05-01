import crypto from "node:crypto";
import type {
  DemandTestInput,
  LLMRawResult,
  MentionedProduct,
  ParsedRecommendation,
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
        },
        required: ["name", "brand", "rank", "reason"],
      },
    },
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

  return {
    mentioned_brands: [...new Set(mentionedProducts.map((product) => product.brand))],
    mentioned_products: mentionedProducts,
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
  const merchantProduct = input.merchantContext?.product;
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
  const competitorBrands = input.competitorContext?.brands || [];
  const competitorSubstitutionDetected =
    !merchantProductMentioned &&
    mentionedProducts.some((product) =>
      competitorBrands.some((brand) => includesLoose(product.brand, brand))
    );

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
    merchant_brand_mentioned: merchantBrandMentioned,
    merchant_product_mentioned: merchantProductMentioned,
    merchant_sku_mentioned: merchantSkuMentioned,
    pivota_product_entity_mentioned: includesLoose(
      joinedProducts,
      merchantProduct?.product_entity_id
    ),
    competitor_substitution_detected: competitorSubstitutionDetected,
    purchase_path_present: mentionedProducts.some(
      (product) => product.purchase_path_present
    ),
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
