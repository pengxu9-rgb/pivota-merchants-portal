import { NextRequest, NextResponse } from "next/server.js";
import { getAgentCenterState, DEMO_MERCHANT_ID } from "./repository.ts";
import {
  DemoFixtureService,
  DemoScenarioService,
  DemandTestJobService,
  getAgentCenterOverview,
  getIssueDebugView,
  getPublicState,
  getUsageSummary,
  InputReadinessService,
  MerchantStoreService,
  OfferExecutionService,
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

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Agent Center request failed";
  const status = /not found/i.test(message) ? 404 : 400;
  return json({ error: message }, status);
}

export async function handleInternalDemoFixturesRequest(
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

export async function handleMerchantStoresRequest(
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
  const segments = pathSegments(params);
  const [resource, id, action] = segments;
  const merchantId = merchantIdFromRequest(req);
  const state = getAgentCenterState();

  try {
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
        const issue = state.issues.find((item) => item.id === id);
        return issue ? json({ issue }) : json({ error: "Issue not found" }, 404);
      }
      if (req.method === "GET") {
        return json({
          issues: state.issues.filter((issue) => issue.merchant_id === merchantId),
        });
      }
      if (req.method === "PATCH" && id) {
        const issue = state.issues.find((item) => item.id === id);
        if (!issue) return json({ error: "Issue not found" }, 404);
        Object.assign(issue, await requestBody(req), { updated_at: new Date().toISOString() });
        return json({ issue });
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
