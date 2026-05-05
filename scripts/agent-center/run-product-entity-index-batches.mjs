#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://pivota-merchants-portal-clean.vercel.app";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  if (!item) return fallback;
  return item.slice(prefix.length);
}

function numberArg(name, fallback) {
  const value = Number(argValue(name, fallback));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolArg(name, fallback = false) {
  const value = argValue(name, undefined);
  if (value === undefined) return fallback;
  return ["1", "true", "yes"].includes(String(value).toLowerCase());
}

const baseUrl = argValue("base-url", process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const secret =
  process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET ||
  process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET ||
  process.env.PIVOTA_INTERNAL_API_SECRET;

if (!secret) {
  console.error(
    "Missing internal secret. Set PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET."
  );
  process.exit(1);
}

const maxRuns = numberArg("max-runs", 25);
const syncLimit = numberArg("sync-limit", 50);
const pageSize = numberArg("page-size", 50);
const maxPages = numberArg("max-pages", 1);
const syncSource = argValue("sync-source", process.env.AGENT_CENTER_PRODUCT_ENTITY_INDEX_SYNC_SOURCE || "");
const sourceMarket = argValue("source-market", process.env.AGENT_CENTER_PRODUCT_ENTITY_SOURCE_MARKET || "");
const sourceTool = argValue("source-tool", process.env.AGENT_CENTER_PRODUCT_ENTITY_SOURCE_TOOL || "");
const verifyLimit = numberArg("verify-limit", 5);
const verifyConcurrency = numberArg("verify-concurrency", 5);
const auditLimit = numberArg("audit-limit", 5);
const auditConcurrency = numberArg("audit-concurrency", 5);
const geminiLimit = numberArg("gemini-limit", 2);
const delayMs = numberArg("delay-ms", 1000);
const includeGemini = boolArg("include-gemini", false);
let runId = argValue("run-id", undefined);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${path} returned non-JSON HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  if (!response.ok) {
    throw new Error(`${path} failed HTTP ${response.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json;
}

function compactSummary(summary = {}) {
  return {
    total_candidates: summary.total_candidates,
    pdp_content_ready: summary.pdp_content_ready,
    content_verification_pending: summary.content_verification_pending,
    sitemap_eligible: summary.sitemap_eligible,
    indexability_ready: summary.indexability_ready,
    indexability_audit_pending: summary.indexability_audit_pending,
    search_grounded_pending: summary.search_grounded_pending,
    gemini_found: summary.gemini_found,
  };
}

function shouldStop(run, summary) {
  if (!run) return false;
  if (run.status === "failed") return true;
  if (run.stage === "sync" && run.has_more) return false;
  if ((summary.content_verification_pending || 0) > 0) return false;
  if ((summary.indexability_audit_pending || 0) > 0) return false;
  if (includeGemini && (summary.search_grounded_pending || 0) > 0) return false;
  return run.stage !== "sync" || run.has_more === false;
}

const initialSummary = await request(
  "/api/internal/agent-center/product-entity-index/summary?limit=1"
);
console.log(
  JSON.stringify({
    event: "initial_summary",
    summary: compactSummary(initialSummary.product_entity_index_summary),
  })
);

let lastRun;
for (let index = 0; index < maxRuns; index += 1) {
  const body = {
    stage: "auto",
    run_id: runId,
    sync_limit: syncLimit,
    page_size: pageSize,
    max_pages: maxPages,
    sync_source: syncSource,
    source_market: sourceMarket,
    source_tool: sourceTool,
    verify_limit: verifyLimit,
    verify_concurrency: verifyConcurrency,
    audit_limit: auditLimit,
    audit_concurrency: auditConcurrency,
    gemini_limit: geminiLimit,
    include_gemini: includeGemini,
  };
  const started = Date.now();
  const payload = await request("/api/internal/agent-center/product-entity-index/run-batch", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const run = payload.product_entity_index_batch_run;
  lastRun = run;
  runId = run.id;
  const summary = run.result_summary || {};
  console.log(
    JSON.stringify({
      event: "batch_run",
      ordinal: index + 1,
      elapsed_ms: Date.now() - started,
      run_id: run.id,
      status: run.status,
      stage: run.stage,
      has_more: run.has_more,
      next_page: run.next_page,
      records_processed: run.records_processed,
      stages_completed: run.stages_completed,
      next_recommended_stage: summary.next_recommended_stage,
      summary: compactSummary(summary),
      error: run.error,
    })
  );
  if (run.status === "failed") process.exitCode = 1;
  if (shouldStop(run, summary)) break;
  await sleep(delayMs);
}

const finalSummary = await request(
  "/api/internal/agent-center/product-entity-index/summary?limit=1"
);
console.log(
  JSON.stringify({
    event: "final_summary",
    run_id: runId || lastRun?.id,
    summary: compactSummary(finalSummary.product_entity_index_summary),
  })
);
