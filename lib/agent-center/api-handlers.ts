import { NextRequest, NextResponse } from "next/server.js";
import {
  getAgentCenterState,
  DEMO_MERCHANT_ID,
  withAgentCenterRepositorySession,
} from "./repository.ts";
import { getAgentCenterRuntimeConfigStatus } from "./runtime-config.ts";
import {
  CheckoutVerificationService,
  DemoFixtureService,
  DemoScenarioService,
  DemandTestJobService,
  GMVAssuranceService,
  getAgentCenterOverview,
  getIssueDebugView,
  getPublicState,
  getUsageSummary,
  InputReadinessService,
  IssueResolutionService,
  MerchantFacingReportService,
  MerchantStoreService,
  OfferExecutionService,
  PivotaIndexingTaskService,
  PivotaPDPIndexabilityAuditService,
  PivotaOptimizationService,
  PilotProductEntityProvisioningService,
  ProductEntityIndexRegistryService,
  ProductionValidationRunService,
  ProductUnderstandingService,
  ScanTargetService,
  UsageMeteringService,
  VerificationService,
} from "./services.ts";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function merchantIdFromRequest(req: NextRequest) {
  return (
    req.headers.get("x-merchant-id") ||
    req.nextUrl.searchParams.get("merchantId") ||
    DEMO_MERCHANT_ID
  );
}

async function requestBody(req: NextRequest) {
  return req.json().catch(() => ({}));
}

function pathSegments(params?: { path?: string[] }) {
  return params?.path || [];
}

function internalDebugAllowed(_req: NextRequest) {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.PIVOTA_AGENT_CENTER_INTERNAL_DEBUG === "true"
  );
}

function demoScenarioAllowed(_req: NextRequest) {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.PIVOTA_AGENT_CENTER_DEMO_MODE === "true"
  );
}

function internalDemoFixtureGate(req: NextRequest) {
  if (process.env.ENABLE_INTERNAL_DEMO_FIXTURES !== "true") {
    return { allowed: false, error: "Internal demo fixtures are disabled" };
  }

  const expected =
    process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET ||
    process.env.INTERNAL_DEMO_FIXTURE_TOKEN ||
    process.env.PIVOTA_INTERNAL_API_SECRET;
  if (!expected) {
    return { allowed: false, error: "Internal demo fixture auth is not configured" };
  }

  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7)
    : "";
  const provided =
    req.headers.get("x-pivota-internal-secret") ||
    req.headers.get("x-internal-demo-fixture-token") ||
    bearer;

  return provided === expected
    ? { allowed: true }
    : { allowed: false, error: "Internal authorization required" };
}

function internalProductionValidationGate(req: NextRequest) {
  if (process.env.ENABLE_INTERNAL_PRODUCTION_VALIDATION !== "true") {
    return {
      allowed: false,
      error: "Internal production validation is disabled",
    };
  }

  const expected =
    process.env.PIVOTA_INTERNAL_PRODUCTION_VALIDATION_SECRET ||
    process.env.PIVOTA_INTERNAL_DEMO_FIXTURE_SECRET ||
    process.env.INTERNAL_DEMO_FIXTURE_TOKEN ||
    process.env.PIVOTA_INTERNAL_API_SECRET;
  if (!expected) {
    return {
      allowed: false,
      error: "Internal production validation auth is not configured",
    };
  }

  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7)
    : "";
  const provided =
    req.headers.get("x-pivota-internal-secret") ||
    req.headers.get("x-internal-production-validation-token") ||
    bearer;

  return provided === expected
    ? { allowed: true }
    : { allowed: false, error: "Internal authorization required" };
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Agent Center request failed";
  const status = /not found/i.test(message) ? 404 : 400;
  return json({ error: message }, status);
}

export async function handleInternalDemoFixturesRequest(
  req: NextRequest,
  params?: { fixtureId?: string }
) {
  return withAgentCenterRepositorySession(() =>
    handleInternalDemoFixturesRequestInner(req, params)
  );
}

async function handleInternalDemoFixturesRequestInner(
  req: NextRequest,
  params?: { fixtureId?: string }
) {
  const gate = internalDemoFixtureGate(req);
  if (!gate.allowed) return json({ error: gate.error }, 403);

  const service = new DemoFixtureService();
  const fixtureId = params?.fixtureId;

  try {
    if (req.method === "POST" && !fixtureId) {
      const body = await requestBody(req);
      return json({ demo_fixture: service.create(body) }, 201);
    }

    if (req.method === "GET" && fixtureId) {
      return json({ demo_fixture: service.get(fixtureId) });
    }

    if (req.method === "DELETE" && fixtureId) {
      return json({ demo_fixture: service.delete(fixtureId) });
    }

    return json({ error: "Unsupported internal demo fixture route" }, 404);
  } catch (error) {
    return routeError(error);
  }
}

export async function handleInternalProductionValidationRunsRequest(
  req: NextRequest,
  params?: { runId?: string; action?: string }
) {
  return withAgentCenterRepositorySession(() =>
    handleInternalProductionValidationRunsRequestInner(req, params)
  );
}

export async function handleInternalPilotProductEntitiesRequest(
  req: NextRequest,
  params?: { runId?: string; action?: string }
) {
  return withAgentCenterRepositorySession(() =>
    handleInternalPilotProductEntitiesRequestInner(req, params)
  );
}

export async function handleInternalPivotaIndexingTasksRequest(
  req: NextRequest,
  params?: { taskId?: string }
) {
  return withAgentCenterRepositorySession(() =>
    handleInternalPivotaIndexingTasksRequestInner(req, params)
  );
}

export async function handleInternalProductEntityIndexRequest(
  req: NextRequest,
  params?: { action?: string }
) {
  return withAgentCenterRepositorySession(() =>
    handleInternalProductEntityIndexRequestInner(req, params)
  );
}

async function handleInternalProductEntityIndexRequestInner(
  req: NextRequest,
  params?: { action?: string }
) {
  const gate = internalProductionValidationGate(req);
  if (!gate.allowed) return json({ error: gate.error }, 403);

  const service = new ProductEntityIndexRegistryService();
  const action = params?.action;

  try {
    if (req.method === "POST" && action === "sync") {
      return json({ product_entity_index_sync: await service.sync(await requestBody(req)) }, 201);
    }
    if (req.method === "POST" && action === "verify-content") {
      return json(
        { product_entity_index_content_verification: await service.verifyContent(await requestBody(req)) },
        201
      );
    }
    if (req.method === "POST" && action === "audit") {
      return json({ product_entity_index_audit: await service.audit(await requestBody(req)) }, 201);
    }
    if (req.method === "POST" && action === "gemini-rerun") {
      return json(
        {
          product_entity_index_search_grounded_rerun:
            await service.runSearchGroundedBatch(await requestBody(req)),
        },
        201
      );
    }
    if (req.method === "POST" && action === "run-batch") {
      return json(
        { product_entity_index_batch_run: await service.runBatch(await requestBody(req)) },
        201
      );
    }
    if (req.method === "GET" && action === "batch-runs") {
      return json({
        product_entity_index_batch_runs: service.listBatchRuns({
          limit: Number(req.nextUrl.searchParams.get("limit") || 25),
        }),
      });
    }
    if (req.method === "GET" && (!action || action === "summary")) {
      return json({
        product_entity_index_summary: service.summary(),
        product_entity_index_records: service.list({
          limit: Number(req.nextUrl.searchParams.get("limit") || 100),
          sitemap_eligible:
            req.nextUrl.searchParams.get("sitemap_eligible") === "true"
              ? true
              : req.nextUrl.searchParams.get("sitemap_eligible") === "false"
                ? false
                : undefined,
        }),
      });
    }
    return json({ error: "Unsupported internal ProductEntity index route" }, 404);
  } catch (error) {
    return routeError(error);
  }
}

async function handleInternalPivotaIndexingTasksRequestInner(
  req: NextRequest,
  params?: { taskId?: string }
) {
  const gate = internalProductionValidationGate(req);
  if (!gate.allowed) return json({ error: gate.error }, 403);

  const service = new PivotaIndexingTaskService();
  const taskId = params?.taskId;

  try {
    if (req.method === "POST" && taskId === "bulk") {
      return json(
        {
          pivota_indexing_task_bulk:
            service.createBulkFromProductEntityIndex(await requestBody(req)),
        },
        201
      );
    }
    if (req.method === "POST" && !taskId) {
      return json({ pivota_indexing_task: service.create(await requestBody(req)) }, 201);
    }
    if (req.method === "GET" && !taskId) {
      const productEntityId =
        req.nextUrl.searchParams.get("product_entity_id") || undefined;
      const summaries = service.summaries({
        product_entity_id: productEntityId,
      });
      const summary = productEntityId ? summaries[0] || null : null;
      return json({
        pivota_indexing_tasks: service.list({
          product_entity_id: productEntityId,
        }),
        product_entity_summaries: summaries,
        summary,
        next_recommended_operator_action:
          summary?.next_recommended_operator_action,
      });
    }
    if (req.method === "GET" && taskId) {
      return json({ pivota_indexing_task: service.get(taskId) });
    }
    if (req.method === "PATCH" && taskId) {
      return json({
        pivota_indexing_task: service.update(taskId, await requestBody(req)),
      });
    }
    return json({ error: "Unsupported internal Pivota indexing task route" }, 404);
  } catch (error) {
    return routeError(error);
  }
}

async function handleInternalPilotProductEntitiesRequestInner(
  req: NextRequest,
  params?: { runId?: string; action?: string }
) {
  const gate = internalProductionValidationGate(req);
  if (!gate.allowed) return json({ error: gate.error }, 403);

  const service = new PilotProductEntityProvisioningService();
  const runId = params?.runId;
  const action = params?.action;

  try {
    if (req.method === "POST" && !runId) {
      const body = await requestBody(req);
      return json({ run: await service.create(body) }, 201);
    }
    if (req.method === "GET" && runId && !action) {
      return json({ run: service.get(runId) });
    }
    if (req.method === "POST" && runId && action === "publish") {
      return json({ run: await service.publish(runId) });
    }
    if (req.method === "POST" && runId && action === "audit") {
      return json({ run: await service.audit(runId) });
    }
    return json({ error: "Unsupported internal pilot ProductEntity route" }, 404);
  } catch (error) {
    return routeError(error);
  }
}

async function handleInternalProductionValidationRunsRequestInner(
  req: NextRequest,
  params?: { runId?: string; action?: string }
) {
  const gate = internalProductionValidationGate(req);
  if (!gate.allowed) return json({ error: gate.error }, 403);

  const service = new ProductionValidationRunService();
  const runId = params?.runId;

  try {
    if (req.method === "POST" && !runId) {
      const body = await requestBody(req);
      return json({ production_validation_run: service.create(body) }, 201);
    }

    if (req.method === "POST" && runId && params?.action === "run") {
      const body = await requestBody(req);
      const completed = await service.run(runId);
      if (body.cleanup_after_run === true) {
        const completedSnapshot = JSON.parse(JSON.stringify(completed));
        const cleaned = service.delete(runId);
        return json({
          production_validation_run: completedSnapshot,
          cleanup: {
            id: cleaned.id,
            status: cleaned.status,
            deleted_at: cleaned.deleted_at,
          },
        });
      }
      return json({
        production_validation_run: completed,
      });
    }

    if (
      req.method === "POST" &&
      runId &&
      params?.action === "report-draft"
    ) {
      const body = await requestBody(req);
      return json(
        {
          report: new MerchantFacingReportService().generate(runId, {
            regenerate: Boolean(body.regenerate),
            audience: body.audience,
          }),
        },
        201
      );
    }

    if (
      req.method === "GET" &&
      runId &&
      params?.action === "report-draft"
    ) {
      return json({
        report: new MerchantFacingReportService().latestForRun(runId),
      });
    }

    if (
      req.method === "PATCH" &&
      runId &&
      params?.action === "report-draft"
    ) {
      const body = await requestBody(req);
      return json({
        report: new MerchantFacingReportService().updateStatus(runId, body),
      });
    }

    if (req.method === "GET" && runId) {
      return json({ production_validation_run: service.get(runId) });
    }

    if (req.method === "DELETE" && runId) {
      return json({ production_validation_run: service.delete(runId) });
    }

    return json({ error: "Unsupported internal production validation route" }, 404);
  } catch (error) {
    return routeError(error);
  }
}

export async function handleMerchantStoresRequest(
  req: NextRequest,
  params?: { path?: string[] }
) {
  return withAgentCenterRepositorySession(() =>
    handleMerchantStoresRequestInner(req, params)
  );
}

async function handleMerchantStoresRequestInner(
  req: NextRequest,
  params?: { path?: string[] }
) {
  const segments = pathSegments(params);
  const merchantId = merchantIdFromRequest(req);
  const service = new MerchantStoreService();

  try {
    if (req.method === "GET" && segments.length === 0) {
      return json({ stores: service.list(merchantId) });
    }

    if (req.method === "POST" && segments.length === 0) {
      const body = await requestBody(req);
      return json({ store: service.create(body, merchantId) }, 201);
    }

    const storeId = segments[0];
    if (req.method === "GET" && storeId) {
      const store = service.list(merchantId).find((item) => item.id === storeId);
      return store ? json({ store }) : json({ error: "Store not found" }, 404);
    }

    if (req.method === "PATCH" && storeId) {
      const body = await requestBody(req);
      return json({ store: service.update(storeId, body) });
    }

    return json({ error: "Unsupported merchant store route" }, 404);
  } catch (error) {
    return routeError(error);
  }
}

export async function handleAgentCenterRequest(
  req: NextRequest,
  params?: { path?: string[] }
) {
  return withAgentCenterRepositorySession(() =>
    handleAgentCenterRequestInner(req, params)
  );
}

async function handleAgentCenterRequestInner(
  req: NextRequest,
  params?: { path?: string[] }
) {
  const segments = pathSegments(params);
  const [resource, id, action] = segments;
  const merchantId = merchantIdFromRequest(req);
  const state = getAgentCenterState();

  try {
    if (resource === "internal-demo-fixtures") {
      return handleInternalDemoFixturesRequest(
        req,
        id ? { fixtureId: id } : undefined
      );
    }

    if (resource === "internal-production-validation-runs") {
      return handleInternalProductionValidationRunsRequest(
        req,
        id ? { runId: id, action } : undefined
      );
    }

    if (resource === "internal-pilot-product-entities") {
      return handleInternalPilotProductEntitiesRequest(
        req,
        id ? { runId: id, action } : undefined
      );
    }

    if (resource === "internal-pivota-indexing-tasks") {
      return handleInternalPivotaIndexingTasksRequest(
        req,
        id ? { taskId: id } : undefined
      );
    }

    if (resource === "internal-product-entity-index") {
      return handleInternalProductEntityIndexRequest(req, id ? { action: id } : undefined);
    }

    if (resource === "product-entity-index" && id === "public") {
      if (req.method !== "GET") {
        return json({ error: "Unsupported ProductEntity index public route" }, 404);
      }
      const service = new ProductEntityIndexRegistryService();
      const limit = Number(req.nextUrl.searchParams.get("limit") || 5000);
      if (req.nextUrl.searchParams.get("shape") === "resolver") {
        return json({
          product_entity_resolver_records: service.publicResolverEntries({
            limit,
            product_entity_id:
              req.nextUrl.searchParams.get("product_entity_id") || undefined,
            external_seed_id:
              req.nextUrl.searchParams.get("external_seed_id") || undefined,
          }),
        });
      }
      if (req.nextUrl.searchParams.get("shape") === "sitemap") {
        return json({
          product_entity_sitemap_entries: service.publicSitemapCompactEntries({ limit }),
        });
      }
      return json({
        product_entity_index_records: service.publicSitemapEntries({
          limit,
        }),
      });
    }

    if (
      resource === "internal-config-status" ||
      resource === "internal-runtime-config"
    ) {
      const gate = internalProductionValidationGate(req);
      if (!gate.allowed) return json({ error: gate.error }, 403);
      if (req.method === "GET") {
        return json({ config: getAgentCenterRuntimeConfigStatus() });
      }
      return json({ error: "Unsupported internal config status route" }, 404);
    }

    if (resource === "internal-pivota-pdp-indexability-audit") {
      const gate = internalProductionValidationGate(req);
      if (!gate.allowed) return json({ error: gate.error }, 403);
      if (req.method === "GET") {
        const service = new PivotaPDPIndexabilityAuditService();
        const url = req.nextUrl.searchParams.get("url") || "";
        if (!url) return json({ error: "Pivota PDP URL is required" }, 400);
        const productName = req.nextUrl.searchParams.get("product_name") || "";
        const brand = req.nextUrl.searchParams.get("brand") || "";
        const merchantPdpUrl =
          req.nextUrl.searchParams.get("merchant_pdp_url") || "";
        const offersExist =
          req.nextUrl.searchParams.get("offers_exist") === "true";
        return json({
          audit: await service.audit({
            url,
            product_name: productName,
            brand,
            merchant_pdp_url: merchantPdpUrl,
            offers_exist: offersExist,
            product_entity_id:
              req.nextUrl.searchParams.get("product_entity_id") || undefined,
            canonical_product_slug:
              req.nextUrl.searchParams.get("canonical_product_slug") || undefined,
            canonical_pivota_pdp_url:
              req.nextUrl.searchParams.get("canonical_pivota_pdp_url") || undefined,
            external_seed_id:
              req.nextUrl.searchParams.get("external_seed_id") || undefined,
            merchant_offer_id:
              req.nextUrl.searchParams.get("merchant_offer_id") || undefined,
            pivota_offer_id:
              req.nextUrl.searchParams.get("pivota_offer_id") || undefined,
            promoted_external_seed_ids: (
              req.nextUrl.searchParams.get("promoted_external_seed_ids") || ""
            )
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          }),
        });
      }
      return json(
        { error: "Unsupported internal Pivota PDP indexability audit route" },
        404
      );
    }

    if (!resource || resource === "overview") {
      if (req.method === "GET") return json(getAgentCenterOverview(merchantId));
    }

    if (resource === "bootstrap" && req.method === "GET") {
      return json(getPublicState());
    }

    if (resource === "providers" && req.method === "GET") {
      return json({ providers: state.providers });
    }

    if (resource === "demo-scenarios") {
      if (!demoScenarioAllowed(req)) {
        return json({ error: "Demo scenario seeding is not enabled" }, 403);
      }
      if (req.method === "POST" && (!id || id === "seed")) {
        const body = await requestBody(req);
        return json(
          new DemoScenarioService().seed({
            scenario: body.scenario || "all",
            merchantId,
          }),
          201
        );
      }
      if (req.method === "GET") {
        return json({
          scenarios: [
            "competitor_substitution",
            "missing_merchant_pdp_attributes",
            "pivota_pdp_readiness_gap",
          ],
        });
      }
    }

    if (resource === "scan-targets") {
      if (req.method === "POST" && !id) {
        const body = await requestBody(req);
        return json(
          { scan_target: new ScanTargetService().create({ ...body, merchant_id: merchantId }) },
          201
        );
      }
      if (req.method === "GET" && id) {
        return json({ scan_target: new ScanTargetService().get(id) });
      }
    }

    if (resource === "input-readiness") {
      if (req.method === "POST") {
        const body = await requestBody(req);
        return json({
          readiness: new InputReadinessService().createSnapshot(body.scan_target_id),
        });
      }
      if (req.method === "GET" && id) {
        return json({ readiness: new InputReadinessService().getLatest(id) });
      }
    }

    if (resource === "usage-estimate" && req.method === "POST") {
      const body = await requestBody(req);
      return json({ estimate: new UsageMeteringService().estimate(body) });
    }

    if (resource === "demand-test-jobs") {
      const jobService = new DemandTestJobService();
      if (req.method === "POST" && !id) {
        const body = await requestBody(req);
        return json({ job: jobService.create(body) }, 201);
      }
      if (req.method === "GET" && id) {
        return json({ job: jobService.get(id), results: jobService.results(id) });
      }
      if (req.method === "POST" && id && action === "run") {
        const results = await jobService.run(id);
        return json({ job: results.job, results });
      }
      if (req.method === "POST" && id && action === "cancel") {
        const job = jobService.get(id);
        job.status = "cancelled";
        return json({ job });
      }
    }

    if (resource === "results" && req.method === "GET" && id) {
      return json(new DemandTestJobService().results(id));
    }

    if (resource === "query-clusters") {
      if (req.method === "GET" && id) {
        const cluster = state.queryClusters.find((item) => item.id === id);
        return cluster ? json({ query_cluster: cluster }) : json({ error: "Query cluster not found" }, 404);
      }
      if (req.method === "GET") {
        const scanTargetId = req.nextUrl.searchParams.get("scan_target_id");
        return json({
          query_clusters: state.queryClusters.filter(
            (cluster) => !scanTargetId || cluster.scan_target_id === scanTargetId
          ),
        });
      }
    }

    if (resource === "gmv-assurance") {
      const service = new GMVAssuranceService();
      if (id === "overview" && req.method === "GET") {
        return json(service.overview(merchantId));
      }
      if (id === "snapshots" && req.method === "POST") {
        const body = await requestBody(req);
        return json(
          {
            snapshot: service.createSnapshot({
              ...body,
              merchant_id: body.merchant_id || merchantId,
            }),
          },
          201
        );
      }
      if (id === "snapshots" && action && req.method === "GET") {
        return json({ snapshot: service.get(action) });
      }
    }

    if (resource === "issues") {
      if (req.method === "GET" && id) {
        if (action === "debug") {
          if (!internalDebugAllowed(req)) {
            return json({ error: "Issue debug view is internal-only" }, 403);
          }
          return json({ debug: getIssueDebugView(id) });
        }
        if (action === "verification") {
          const verification = [...state.verificationRuns]
            .reverse()
            .find((item) => item.issue_id === id);
          return json({ verification: verification || null });
        }
        if (action === "product-diagnosis") {
          const service = new ProductUnderstandingService();
          return json({
            diagnosis: service.latest(id),
            debug: service.debugPayload(id),
          });
        }
        if (action === "offer-diagnosis") {
          const service = new OfferExecutionService();
          return json({
            diagnosis: service.latest(id),
            debug: service.debugPayload(id),
          });
        }
        if (action === "checkout-diagnosis") {
          const service = new CheckoutVerificationService();
          return json({
            diagnosis: service.latest(id),
            debug: service.debugPayload(id),
          });
        }
        if (action === "resolution-plan") {
          const service = new IssueResolutionService();
          return json({ resolution_plan: service.latest(id) });
        }
        if (action === "pivota-optimization-patch") {
          const service = new PivotaOptimizationService();
          return json({ patches: service.list(id) });
        }
        const issue = state.issues.find((item) => item.id === id);
        return issue ? json({ issue }) : json({ error: "Issue not found" }, 404);
      }
      if (req.method === "GET") {
        return json({
          issues: state.issues.filter((issue) => issue.merchant_id === merchantId),
        });
      }
      if (req.method === "PATCH" && id && action === "resolution-plan") {
        const service = new IssueResolutionService();
        return json({
          resolution_plan: service.update(id, await requestBody(req)),
        });
      }
      if (req.method === "PATCH" && id) {
        const issue = state.issues.find((item) => item.id === id);
        if (!issue) return json({ error: "Issue not found" }, 404);
        Object.assign(issue, await requestBody(req), { updated_at: new Date().toISOString() });
        return json({ issue });
      }
      if (req.method === "POST" && id && action === "resolution-plan") {
        const service = new IssueResolutionService();
        if (segments[3] === "actions" && segments[4] && segments[5] === "approve") {
          return json({
            resolution_plan: service.approveAction(id, segments[4]),
          });
        }
        if (segments[3] === "actions" && segments[4] && segments[5] === "apply") {
          return json({
            resolution_plan: service.applyAction(id, segments[4]),
          });
        }
        if (segments[3] === "retest") {
          return json({
            resolution_plan: await service.retest(id),
          });
        }
        const body = await requestBody(req);
        return json(
          {
            resolution_plan: service.generate(id, {
              regenerate: Boolean(body.regenerate),
            }),
          },
          201
        );
      }
      if (req.method === "POST" && id && action === "pivota-optimization-patch") {
        const service = new PivotaOptimizationService();
        return json(
          {
            patches: service.generate(id, await requestBody(req)),
          },
          201
        );
      }
      if (req.method === "POST" && id && action === "apply-pivota-optimization") {
        const service = new PivotaOptimizationService();
        return json({
          patches: service.apply(id, await requestBody(req)),
        });
      }
      if (req.method === "POST" && id && action === "rerun-after-pivota-optimization") {
        const service = new PivotaOptimizationService();
        return json({
          result: await service.rerunAfterOptimization(id),
          patches: service.list(id),
        });
      }
      if (req.method === "POST" && id && ["approve", "ignore", "assign"].includes(action || "")) {
        const issue = state.issues.find((item) => item.id === id);
        if (!issue) return json({ error: "Issue not found" }, 404);
        if (action === "approve") issue.status = "approved";
        if (action === "ignore") issue.status = "ignored";
        if (action === "assign") issue.status = "approval_required";
        issue.updated_at = new Date().toISOString();
        return json({ issue });
      }
      if (req.method === "POST" && id && action === "product-diagnosis") {
        const diagnosis = new ProductUnderstandingService().runDiagnosis(id);
        const issue = state.issues.find((item) => item.id === id);
        return json({ diagnosis, issue }, 201);
      }
      if (req.method === "POST" && id && action === "regenerate-product-patch") {
        const diagnosis = new ProductUnderstandingService().regeneratePatch(id);
        const issue = state.issues.find((item) => item.id === id);
        return json({ diagnosis, issue }, 201);
      }
      if (
        req.method === "POST" &&
        id &&
        action === "attach-product-diagnosis-to-retest"
      ) {
        const diagnosis = new ProductUnderstandingService().attachToRetestPlan(id);
        const issue = state.issues.find((item) => item.id === id);
        return json({ diagnosis, issue });
      }
      if (req.method === "POST" && id && action === "offer-diagnosis") {
        const diagnosis = new OfferExecutionService().runDiagnosis(id);
        const issue = state.issues.find((item) => item.id === id);
        return json({ diagnosis, issue }, 201);
      }
      if (req.method === "POST" && id && action === "regenerate-offer-patch") {
        const diagnosis = new OfferExecutionService().regeneratePatch(id);
        const issue = state.issues.find((item) => item.id === id);
        return json({ diagnosis, issue }, 201);
      }
      if (
        req.method === "POST" &&
        id &&
        action === "attach-offer-diagnosis-to-retest"
      ) {
        const diagnosis = new OfferExecutionService().attachToRetestPlan(id);
        const issue = state.issues.find((item) => item.id === id);
        return json({ diagnosis, issue });
      }
      if (req.method === "POST" && id && action === "checkout-diagnosis") {
        const diagnosis = new CheckoutVerificationService().runDiagnosis(id);
        const issue = state.issues.find((item) => item.id === id);
        return json({ diagnosis, issue }, 201);
      }
      if (req.method === "POST" && id && action === "regenerate-checkout-patch") {
        const diagnosis = new CheckoutVerificationService().regeneratePatch(id);
        const issue = state.issues.find((item) => item.id === id);
        return json({ diagnosis, issue }, 201);
      }
      if (
        req.method === "POST" &&
        id &&
        action === "attach-checkout-diagnosis-to-retest"
      ) {
        const diagnosis = new CheckoutVerificationService().attachToRetestPlan(id);
        const issue = state.issues.find((item) => item.id === id);
        return json({ diagnosis, issue });
      }
      if (req.method === "POST" && id && action === "retest") {
        const verification = await new VerificationService().retestIssue(id);
        return json({ verification });
      }
      if (
        req.method === "POST" &&
        id &&
        (action === "retest-preparation" || action === "prepare-retest")
      ) {
        const retestPreparation = new VerificationService().prepareRetestIssue(id);
        return json({ retest_preparation: retestPreparation }, 201);
      }
    }

    if (resource === "verification" && req.method === "GET" && id) {
      const verification = state.verificationRuns.find((item) => item.id === id);
      return verification
        ? json({ verification })
        : json({ error: "Verification not found" }, 404);
    }

    if (resource === "usage" && req.method === "GET") {
      const summary = getUsageSummary(merchantId);
      if (id === "by-store") return json({ usage_by_store: summary.usage_by_store });
      if (id === "by-provider") {
        return json({ usage_by_provider: summary.usage_by_provider });
      }
      return json(summary);
    }

    return json({ error: "Unsupported Agent Center route" }, 404);
  } catch (error) {
    return routeError(error);
  }
}
