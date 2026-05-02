"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  Play,
  Plus,
  Store,
} from "lucide-react";
import {
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from "@/components/ui/merchant-primitives";
import {
  agentFetch,
  LimitationList,
  MetricTile,
  ScoreBar,
} from "@/components/agent-center/agent-center-ui";
import { cx } from "@/lib/cx";

const steps = [
  "Store Target Setup",
  "Input Readiness",
  "Scan Type",
  "Products & Query Scope",
  "Provider Selection",
  "Usage Preview",
  "Run Scan",
];

const scanModes = [
  {
    id: "organic_product_discovery_test",
    label: "Organic Product Discovery Test",
    helper:
      "Tests whether your product or brand appears naturally from no-context category and shopping-intent prompts.",
  },
  {
    id: "search_grounded_product_discovery_test",
    label: "Search-Grounded Product Discovery Test",
    helper:
      "Tests whether AI/search grounding can discover your merchant PDP or Pivota PDP from product-name queries.",
  },
  {
    id: "buying_path_discovery_test",
    label: "Buying Path Discovery Test",
    helper:
      "Tests whether AI returns official pages, verified buying options, offers, prices, or availability signals.",
  },
  {
    id: "open_product_visibility_test",
    label: "Open Product Visibility Test",
    helper: "Tests whether the product entity is known and recommended by the model.",
  },
  {
    id: "merchant_store_attribution_test",
    label: "Merchant Store Attribution Test",
    helper: "Tests whether the model can return your merchant store/PDP as the purchase source.",
  },
  {
    id: "pivota_pdp_attribution_test",
    label: "Pivota PDP Attribution Test",
    helper: "Tests whether the model can return Pivota unified PDP or Pivota-managed offers as the agent-facing path.",
  },
] as const;

type StoreRecord = {
  id: string;
  store_name: string;
  store_url: string;
  platform: string;
  integration_status: string;
  market: string;
  language: string;
  currency: string;
  primary_category?: string;
  products?: Array<{ id: string; title: string; sku: string; priority?: string }>;
};

export default function RunAgentScanPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedScanMode, setSelectedScanMode] = useState<(typeof scanModes)[number]["id"]>(
    "open_product_visibility_test"
  );
  const [scanTarget, setScanTarget] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStore, setNewStore] = useState({
    store_name: "",
    store_url: "",
    platform: "unknown",
    market: "US",
    language: "en",
    currency: "USD",
    primary_category: "skincare",
    competitor_brands: "Competitor A, Competitor B",
    optional_pdp_urls: "",
  });

  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId),
    [stores, selectedStoreId]
  );

  useEffect(() => {
    void loadStores();
  }, []);

  async function loadStores() {
    const payload = await agentFetch<{ stores: StoreRecord[] }>("/api/merchant-stores");
    setStores(payload.stores);
    if (!selectedStoreId && payload.stores[0]) {
      setSelectedStoreId(payload.stores[0].id);
      setSelectedProductIds(payload.stores[0].products?.map((product) => product.id) || []);
    }
  }

  async function addUrlOnlyStore() {
    setLoading(true);
    setError(null);
    try {
      const payload = await agentFetch<{ store: StoreRecord }>("/api/merchant-stores", {
        method: "POST",
        body: JSON.stringify({
          ...newStore,
          competitor_brands: newStore.competitor_brands
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          optional_pdp_urls: newStore.optional_pdp_urls
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      await loadStores();
      setSelectedStoreId(payload.store.id);
      setSelectedProductIds([]);
      setScanTarget(null);
      setEstimate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add store");
    } finally {
      setLoading(false);
    }
  }

  async function ensureScanTarget() {
    if (scanTarget?.scan_mode === selectedScanMode) return scanTarget;
    if (!selectedStoreId) throw new Error("Select or add a store before scanning.");
    const selectedIds = selectedProductIds.length
      ? selectedProductIds
      : selectedStore?.products?.map((product) => product.id) || [];
    const targetPayload = await agentFetch<{ scan_target: any }>(
      "/api/agent-center/scan-targets",
      {
        method: "POST",
        body: JSON.stringify({
          store_id: selectedStoreId,
          selected_product_ids: selectedIds,
          scan_mode: selectedScanMode,
        }),
      }
    );
    setScanTarget(targetPayload.scan_target);
    return targetPayload.scan_target;
  }

  async function buildReadiness() {
    setLoading(true);
    setError(null);
    try {
      const target = await ensureScanTarget();
      const payload = await agentFetch<{ readiness: any }>(
        "/api/agent-center/input-readiness",
        {
          method: "POST",
          body: JSON.stringify({ scan_target_id: target.id }),
        }
      );
      setReadiness(payload.readiness);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Input readiness failed");
    } finally {
      setLoading(false);
    }
  }

  async function buildEstimate() {
    setLoading(true);
    setError(null);
    try {
      const target = await ensureScanTarget();
      const payload = await agentFetch<{ estimate: any }>(
        "/api/agent-center/usage-estimate",
        {
          method: "POST",
          body: JSON.stringify({
            scan_target_id: target.id,
            selected_product_ids: selectedProductIds,
            providers: ["gemini"],
            prompt_template_ids: [
              "general_recommendation_v1",
              "purchase_ready_v1",
              "attribute_specific_v1",
            ],
            repetitions: 2,
          }),
        }
      );
      setEstimate(payload.estimate);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usage estimate failed");
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const target = await ensureScanTarget();
      const jobPayload = await agentFetch<{ job: any }>(
        "/api/agent-center/demand-test-jobs",
        {
          method: "POST",
          body: JSON.stringify({
            scan_target_id: target.id,
            selected_product_ids: selectedProductIds,
            providers: ["gemini"],
            prompt_template_ids: [
              "general_recommendation_v1",
              "purchase_ready_v1",
              "attribute_specific_v1",
            ],
            repetitions: 2,
          }),
        }
      );
      await agentFetch(`/api/agent-center/demand-test-jobs/${jobPayload.job.id}/run`, {
        method: "POST",
      });
      router.push(`/agent-center/jobs/${jobPayload.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  function goNext() {
    if (step === 0) void buildReadiness();
    else if (step === 4) void buildEstimate();
    else setStep((value) => Math.min(6, value + 1));
  }

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Run Agent Scan"
        title="AI Demand Scan Wizard"
        description="Create a store-scoped scan target, check inputs, choose Gemini baseline, preview AI Test Credits, then run the scan."
      />

      <SurfaceCard>
        <div className="grid gap-1 px-4 py-4 md:grid-cols-7">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              className={cx(
                "rounded-xl px-3 py-2 text-left text-sm transition",
                index === step
                  ? "bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]"
                  : index < step
                    ? "text-[color:var(--merchant-success)] hover:bg-white/60"
                    : "text-[color:var(--merchant-muted)]"
              )}
              onClick={() => setStep(index)}
            >
              <span className="block text-xs font-semibold">{index}</span>
              <span className="font-medium">{label}</span>
            </button>
          ))}
        </div>
      </SurfaceCard>

      {error ? (
        <div className="rounded-2xl border border-[color:var(--merchant-critical-soft)] bg-[color:var(--merchant-critical-soft)] px-4 py-3 text-sm text-[color:var(--merchant-critical)]">
          {error}
        </div>
      ) : null}

      {step === 0 ? (
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <SurfaceCard title="Connected Stores" description="Choose an existing store target.">
            <div className="divide-y divide-[color:var(--merchant-line)]">
              {stores.map((store) => (
                <label
                  key={store.id}
                  className="flex cursor-pointer items-start gap-4 px-5 py-4 transition hover:bg-white/50"
                >
                  <input
                    type="radio"
                    name="store"
                    checked={selectedStoreId === store.id}
                    onChange={() => {
                      setSelectedStoreId(store.id);
                      setSelectedProductIds(store.products?.map((product) => product.id) || []);
                      setScanTarget(null);
                      setReadiness(null);
                      setEstimate(null);
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-[color:var(--merchant-ink)]">
                        {store.store_name}
                      </p>
                      <StatusBadge tone={store.integration_status === "connected" ? "success" : "warning"}>
                        {store.integration_status.replace(/_/g, " ")}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-sm text-[color:var(--merchant-muted)]">
                      {store.store_url} · {store.platform} · {store.market} · {store.currency}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--merchant-muted)]">
                      Products: {store.products?.length || "URL-only public PDP inputs"}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard title="Add URL-Only Store" description="Fast onboarding for public PDP demand testing.">
            <div className="space-y-4 px-5 py-5">
              {[
                ["store_name", "Store name"],
                ["store_url", "Store URL"],
                ["primary_category", "Primary category"],
                ["competitor_brands", "Competitor brands"],
              ].map(([key, label]) => (
                <label key={key} className="block space-y-1.5">
                  <span className="text-sm font-medium text-[color:var(--merchant-ink)]">
                    {label}
                  </span>
                  <input
                    className="w-full rounded-xl border border-[color:var(--merchant-line)] bg-white/80 px-3 py-2 text-sm"
                    value={(newStore as any)[key]}
                    onChange={(event) =>
                      setNewStore((value) => ({ ...value, [key]: event.target.value }))
                    }
                  />
                </label>
              ))}
              <div className="grid gap-3 sm:grid-cols-3">
                {(["platform", "market", "currency"] as const).map((key) => (
                  <label key={key} className="block space-y-1.5">
                    <span className="text-sm font-medium capitalize text-[color:var(--merchant-ink)]">
                      {key}
                    </span>
                    <input
                      className="w-full rounded-xl border border-[color:var(--merchant-line)] bg-white/80 px-3 py-2 text-sm"
                      value={newStore[key]}
                      onChange={(event) =>
                        setNewStore((value) => ({ ...value, [key]: event.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[color:var(--merchant-ink)]">
                  Optional PDP URLs
                </span>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-[color:var(--merchant-line)] bg-white/80 px-3 py-2 text-sm"
                  value={newStore.optional_pdp_urls}
                  onChange={(event) =>
                    setNewStore((value) => ({
                      ...value,
                      optional_pdp_urls: event.target.value,
                    }))
                  }
                />
              </label>
              <MerchantButton icon={Plus} onClick={addUrlOnlyStore} disabled={loading}>
                Add URL Store
              </MerchantButton>
            </div>
          </SurfaceCard>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <SurfaceCard title="Input Completeness">
            <div className="space-y-5 px-5 py-5">
              <MetricTile
                label="Completeness"
                value={`${readiness?.input_completeness_score || 0} / 100`}
                helper="Available inputs for V1 demand testing"
                tone={(readiness?.input_completeness_score || 0) >= 60 ? "success" : "warning"}
              />
              <ScoreBar
                label="Input completeness"
                value={readiness?.input_completeness_score || 0}
              />
            </div>
          </SurfaceCard>
          <SurfaceCard title="Available Scan Modes" description="V1 executes AI Demand Scan only.">
            <div className="grid gap-5 px-5 py-5 lg:grid-cols-2">
              <div className="space-y-3">
                {[
                  "open_product_visibility_test",
                  "merchant_store_attribution_test",
                  "pivota_pdp_attribution_test",
                  "agentic_execution_test",
                ].map((mode) => {
                  const available = readiness?.available_scan_modes?.includes(mode);
                  const v1 = mode !== "agentic_execution_test";
                  return (
                    <div key={mode} className="flex items-center gap-2 text-sm">
                      {available && v1 ? (
                        <CheckCircle2 className="h-4 w-4 text-[color:var(--merchant-success)]" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-[color:var(--merchant-muted)]" />
                      )}
                      <span className="text-[color:var(--merchant-ink)]">
                        {mode.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-4">
                <div>
                  <p className="merchant-overline">Missing high-impact inputs</p>
                  <div className="mt-2 space-y-2">
                    {readiness?.missing_inputs?.slice(0, 4).map((item: any) => (
                      <div key={item.input} className="rounded-xl border border-[color:var(--merchant-line)] bg-white/60 p-3 text-sm">
                        <p className="font-medium text-[color:var(--merchant-ink)]">
                          {item.input.replace(/_/g, " ")}
                        </p>
                        <p className="text-[color:var(--merchant-muted)]">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <LimitationList items={readiness?.scan_limitations || []} />
              </div>
            </div>
          </SurfaceCard>
        </div>
      ) : null}

      {step === 2 ? (
        <SurfaceCard title="Choose Scan Mode" description="V1 separates natural discovery from contextual attribution and pre-payment readiness checks.">
          <div className="grid gap-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
            {scanModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setSelectedScanMode(mode.id);
                  setScanTarget(null);
                  setEstimate(null);
                }}
                className={cx(
                  "rounded-2xl border p-4 text-left transition",
                  selectedScanMode === mode.id
                    ? "border-[color:var(--merchant-brand)] bg-[color:var(--merchant-brand-soft)]"
                    : "border-[color:var(--merchant-line)] bg-white/70 hover:bg-white"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-[color:var(--merchant-ink)]">{mode.label}</p>
                  <StatusBadge tone={selectedScanMode === mode.id ? "success" : "neutral"}>
                    {selectedScanMode === mode.id ? "selected" : "available"}
                  </StatusBadge>
                </div>
                <p className="mt-3 text-sm text-[color:var(--merchant-muted)]">{mode.helper}</p>
              </button>
            ))}
          </div>
        </SurfaceCard>
      ) : null}

      {step === 3 ? (
        <SurfaceCard title="Products & Query Scope" description="Query clusters are generated automatically from product, category, and competitor context.">
          <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1fr_0.8fr]">
            <div className="space-y-3">
              {selectedStore?.products?.length ? (
                selectedStore.products.map((product) => (
                  <label key={product.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[color:var(--merchant-line)] bg-white/60 p-4">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={(event) => {
                        setSelectedProductIds((value) =>
                          event.target.checked
                            ? [...value, product.id]
                            : value.filter((id) => id !== product.id)
                        );
                        setEstimate(null);
                      }}
                    />
                    <div>
                      <p className="font-medium text-[color:var(--merchant-ink)]">
                        {product.title}
                      </p>
                      <p className="text-sm text-[color:var(--merchant-muted)]">
                        {product.sku} · {product.priority || "standard"} priority
                      </p>
                    </div>
                  </label>
                ))
              ) : (
                <div className="rounded-2xl border border-[color:var(--merchant-line)] bg-white/60 p-4">
                  <p className="font-medium text-[color:var(--merchant-ink)]">
                    URL-only auto-detect
                  </p>
                  <p className="text-sm text-[color:var(--merchant-muted)]">
                    Pivota will use the store URL, optional PDP URLs, category, and competitor list. Real crawling is not implemented in V1.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {[
                "Auto-generate query clusters",
                "Include competitor comparison",
                "Include purchase-ready queries",
                "Include dupe/substitute queries",
              ].map((label) => (
                <div key={label} className="flex items-center gap-2 text-sm text-[color:var(--merchant-ink)]">
                  <CheckCircle2 className="h-4 w-4 text-[color:var(--merchant-success)]" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>
      ) : null}

      {step === 4 ? (
        <SurfaceCard title="Provider Selection" description="Gemini baseline is active for V1. Other providers are disabled placeholders.">
          <div className="grid gap-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Gemini baseline", "active", true],
              ["OpenAI", "coming soon", false],
              ["Claude", "coming soon", false],
              ["Perplexity", "coming soon", false],
              ["Copilot-compatible surface", "future", false],
            ].map(([label, status, enabled]) => (
              <div key={label as string} className="rounded-2xl border border-[color:var(--merchant-line)] bg-white/70 p-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(enabled)} disabled readOnly />
                  <p className="font-medium text-[color:var(--merchant-ink)]">{label}</p>
                </div>
                <StatusBadge tone={enabled ? "success" : "neutral"} className="mt-3">
                  {status}
                </StatusBadge>
              </div>
            ))}
          </div>
        </SurfaceCard>
      ) : null}

      {step === 5 ? (
        <SurfaceCard
          title="Usage Preview / Credits & Usage"
          description="Merchant Portal shows AI Test Credits only. Token-level costs and real billing are not exposed."
        >
          <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1fr_0.8fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                label="Products selected"
                value={estimate?.products_selected || 0}
              />
              <MetricTile
                label="Query clusters"
                value={estimate?.estimated_query_clusters || 0}
              />
              <MetricTile
                label="Providers"
                value={estimate?.providers?.join(", ") || "Gemini"}
              />
              <MetricTile
                label="Prompt templates"
                value={estimate?.prompt_templates?.length || 0}
              />
              <MetricTile label="Repetitions" value={estimate?.repetitions || 2} />
              <MetricTile
                label="Estimated credits"
                value={estimate?.estimated_ai_test_credits || 0}
                tone="brand"
              />
            </div>
            <div className="space-y-4 rounded-2xl border border-[color:var(--merchant-line)] bg-white/70 p-4">
              <ScoreBar
                label="Included credits used after estimate"
                value={
                  estimate
                    ? ((estimate.credits_used_this_month +
                        estimate.estimated_ai_test_credits) /
                        Math.max(1, estimate.plan_included_credits)) *
                      100
                    : 0
                }
              />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="merchant-overline">Remaining now</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--merchant-ink)]">
                    {estimate?.remaining_credits || 0}
                  </p>
                </div>
                <div>
                  <p className="merchant-overline">Estimated overage</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--merchant-ink)]">
                    {estimate?.estimated_overage_credits || 0}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-[color:var(--merchant-brand-soft)] p-3 text-sm text-[color:var(--merchant-brand)]">
                Billing mode: preview only · Billing status: not invoiced
              </div>
            </div>
          </div>
        </SurfaceCard>
      ) : null}

      {step === 6 ? (
        <SurfaceCard title="Run Scan" description="The scan runs synchronously for V1 demo and records idempotent usage events after successful provider results.">
          <div className="space-y-5 px-5 py-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[color:var(--merchant-line)] bg-white/60 p-4">
                <Store className="h-5 w-5 text-[color:var(--merchant-brand)]" />
                <p className="mt-3 font-medium text-[color:var(--merchant-ink)]">
                  {selectedStore?.store_name}
                </p>
                <p className="text-sm text-[color:var(--merchant-muted)]">
                  {scanTarget?.scan_mode?.replace(/_/g, " ")}
                </p>
              </div>
              <div className="rounded-2xl border border-[color:var(--merchant-line)] bg-white/60 p-4">
                <CreditCard className="h-5 w-5 text-[color:var(--merchant-brand)]" />
                <p className="mt-3 font-medium text-[color:var(--merchant-ink)]">
                  {estimate?.estimated_ai_test_credits || 0} AI Test Credits
                </p>
                <p className="text-sm text-[color:var(--merchant-muted)]">
                  Preview-only usage ledger
                </p>
              </div>
              <div className="rounded-2xl border border-[color:var(--merchant-line)] bg-white/60 p-4">
                <Play className="h-5 w-5 text-[color:var(--merchant-brand)]" />
                <p className="mt-3 font-medium text-[color:var(--merchant-ink)]">
                  Gemini baseline
                </p>
                <p className="text-sm text-[color:var(--merchant-muted)]">
                  Mock fallback when GEMINI_API_KEY is unavailable
                </p>
              </div>
            </div>
            <MerchantButton icon={Play} onClick={runScan} disabled={loading}>
              {loading ? "Running..." : "Run Scan"}
            </MerchantButton>
          </div>
        </SurfaceCard>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="merchant-button-secondary"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0 || loading}
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
        {step < 6 ? (
          <MerchantButton
            icon={ArrowRight}
            onClick={goNext}
            disabled={loading || (step === 0 && !selectedStoreId)}
          >
            {step === 4 ? "Preview Usage" : "Continue"}
          </MerchantButton>
        ) : null}
      </div>
    </main>
  );
}
