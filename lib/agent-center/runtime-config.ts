export function envFlagEnabled(value?: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .toLowerCase();
  return ["true", "1", "yes", "on", "enabled"].includes(normalized);
}

export function geminiSearchGroundingEnabled() {
  return envFlagEnabled(process.env.GEMINI_SEARCH_GROUNDING_ENABLED);
}

export function getAgentCenterRuntimeConfigStatus() {
  const searchGroundingRawPresent =
    process.env.GEMINI_SEARCH_GROUNDING_ENABLED !== undefined;
  const searchGroundingEnabled = geminiSearchGroundingEnabled();

  return {
    gemini_api_key_configured: Boolean(process.env.GEMINI_API_KEY),
    gemini_search_grounding_env_present: searchGroundingRawPresent,
    gemini_search_grounding_enabled: searchGroundingEnabled,
    search_grounded_product_discovery_status: searchGroundingEnabled
      ? "configured"
      : "not_configured",
    gemini_model_configured: Boolean(process.env.PIVOTA_AGENT_CENTER_GEMINI_MODEL),
    mock_gemini_enabled: envFlagEnabled(process.env.PIVOTA_AGENT_CENTER_MOCK_GEMINI),
  };
}
