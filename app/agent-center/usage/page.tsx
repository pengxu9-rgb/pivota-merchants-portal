"use client";

import { useEffect, useState } from "react";
import { PageHeader, SurfaceCard } from "@/components/ui/merchant-primitives";
import { agentFetch, MetricTile, ScoreBar } from "@/components/agent-center/agent-center-ui";

function UsageGroup({
  title,
  values,
}: {
  title: string;
  values: Record<string, number>;
}) {
  const entries = Object.entries(values || {});
  return (
    <SurfaceCard title={title}>
      <div className="divide-y divide-[color:var(--merchant-line)]">
        {entries.length ? (
          entries.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <span className="text-[color:var(--merchant-muted-strong)]">
                {label.replace(/_/g, " ")}
              </span>
              <span className="font-semibold text-[color:var(--merchant-ink)]">
                {value}
              </span>
            </div>
          ))
        ) : (
          <p className="px-5 py-5 text-sm text-[color:var(--merchant-muted)]">
            No usage recorded yet.
          </p>
        )}
      </div>
    </SurfaceCard>
  );
}

export default function UsagePage() {
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => {
    void agentFetch("/api/agent-center/usage").then(setUsage);
  }, []);

  return (
    <main className="merchant-page space-y-6 py-6">
      <PageHeader
        eyebrow="Usage Preview / Credits & Usage"
        title="AI Test Credits"
        description="Demand Test Agent V1 records preview-only usage events with deterministic idempotency keys. No real billing, invoicing, payment collection, or subscription management is implemented."
      />

      <SurfaceCard strong>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5">
          <MetricTile label="Plan" value={usage?.current_plan || "..."} />
          <MetricTile
            label="Included credits"
            value={usage?.included_ai_test_credits || 0}
          />
          <MetricTile label="Used" value={usage?.used_credits || 0} tone="brand" />
          <MetricTile
            label="Remaining"
            value={usage?.remaining_credits || 0}
            tone="success"
          />
          <MetricTile
            label="Estimated overage"
            value={usage?.estimated_overage_credits || 0}
            tone={(usage?.estimated_overage_credits || 0) > 0 ? "warning" : "neutral"}
          />
        </div>
      </SurfaceCard>

      <SurfaceCard title="Credit Meter">
        <div className="space-y-4 px-5 py-5">
          <ScoreBar
            label="Included AI Test Credits used"
            value={
              usage
                ? (usage.used_credits / Math.max(1, usage.included_ai_test_credits)) *
                  100
                : 0
            }
          />
          <div className="rounded-2xl border border-[color:var(--merchant-line)] bg-white/70 p-4 text-sm text-[color:var(--merchant-muted-strong)]">
            Billing mode: {usage?.billing_mode || "preview_only"} · Billing status:{" "}
            {usage?.billing_status || "not_invoiced"}
          </div>
        </div>
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <UsageGroup title="Usage by Agent" values={usage?.usage_by_agent || {}} />
        <UsageGroup title="Usage by Provider" values={usage?.usage_by_provider || {}} />
        <UsageGroup title="Usage by Store" values={usage?.usage_by_store || {}} />
        <UsageGroup title="Usage by Scan Mode" values={usage?.usage_by_scan_mode || {}} />
      </div>

      <SurfaceCard title="Usage Event Ledger">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[color:var(--merchant-line)] text-[color:var(--merchant-muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Idempotency key</th>
                <th className="px-5 py-3 font-medium">Provider</th>
                <th className="px-5 py-3 font-medium">Store</th>
                <th className="px-5 py-3 font-medium">Scan mode</th>
                <th className="px-5 py-3 font-medium">Credits</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--merchant-line)]">
              {usage?.events?.map((event: any) => (
                <tr key={event.id}>
                  <td className="max-w-[360px] truncate px-5 py-3 font-mono text-xs text-[color:var(--merchant-muted-strong)]">
                    {event.idempotency_key}
                  </td>
                  <td className="px-5 py-3 text-[color:var(--merchant-muted)]">
                    {event.provider}
                  </td>
                  <td className="px-5 py-3 text-[color:var(--merchant-muted)]">
                    {event.store_id}
                  </td>
                  <td className="px-5 py-3 text-[color:var(--merchant-muted)]">
                    {event.scan_mode.replace(/_/g, " ")}
                  </td>
                  <td className="px-5 py-3 font-semibold text-[color:var(--merchant-ink)]">
                    {event.quantity}
                  </td>
                  <td className="px-5 py-3 text-[color:var(--merchant-muted)]">
                    {event.billing_status.replace(/_/g, " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </main>
  );
}
