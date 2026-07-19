'use client';

import { useEffect, useState } from 'react';

import { apiClient } from '@/lib/api-client';
import { PerSkuAuditReportRenderer } from '@/app/dashboard/agent-center/ai-readiness/page';
import type { AgentCenterPerSkuAuditResponse } from '@/lib/types/ai-readiness';
import reportFixture from '@/scripts/fixtures/ai-readiness-preview.report.json';
import tasksFixture from '@/scripts/fixtures/ai-readiness-preview.tasks.json';

// The Action plan panel self-fetches tasks via the apiClient singleton. For the
// preview we override that one method to return the fixture tasks — honoring the
// status filter the panel passes so its Open/All/Done tabs behave. Scoped: the
// original is captured in the state initializer (so the override is in place before
// the nested panel's mount-effect fires) and restored on unmount.
function previewListTasks(opts?: { statusFilter?: string }) {
  const sf = opts?.statusFilter;
  let tasks = tasksFixture as Array<{ status: string }>;
  if (sf === undefined) {
    tasks = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  } else if (sf && sf !== 'all') {
    const wanted = new Set(sf.split(','));
    tasks = tasks.filter((t) => wanted.has(t.status));
  }
  return Promise.resolve({ tasks });
}

// Momentum dumbbells self-fetch the PREVIOUS run's brand_rollup dimensions
// (there's no `reaudit_delta` field to read). For the backend-less preview we
// stub the two runs-list endpoints to serve one synthetic prior run whose
// dimension medians sit below the fixture's current ones, so the dumbbells show
// a real baseline → current delta.
const PREVIEW_PRIOR_RUN_ID = 'fixture-prior-run';
function previewListAuditRuns() {
  return Promise.resolve([
    // Current run (matches the fixture's audit_run_id), newest first…
    {
      run_id: reportFixture.audit_run_id,
      requested_at: '2026-07-10T12:00:00Z',
      completed_at: '2026-07-10T12:04:00Z',
      status: 'completed',
      product_keys: reportFixture.per_sku_reports.map((r) => r.sku_key),
      verdict_labels: [],
      visibility_score_avg: null,
      attribution_score_avg: null,
      category_visibility_score_avg: null,
      audited_via_pivota_canonical_count: 0,
    },
    // …then the older run the momentum panel compares against.
    {
      run_id: PREVIEW_PRIOR_RUN_ID,
      requested_at: '2026-06-28T12:00:00Z',
      completed_at: '2026-06-28T12:05:00Z',
      status: 'completed',
      product_keys: reportFixture.per_sku_reports.map((r) => r.sku_key),
      verdict_labels: [],
      visibility_score_avg: null,
      attribution_score_avg: null,
      category_visibility_score_avg: null,
      audited_via_pivota_canonical_count: 0,
    },
  ]);
}
function previewGetAuditRunDetail(runId: string) {
  if (runId !== PREVIEW_PRIOR_RUN_ID) return Promise.resolve({});
  return Promise.resolve({
    stage: 'completed',
    report_jsonb: {
      brand_rollup: {
        dimensions: {
          identity: { median: 61, p25: 61, p75: 61 },
          content_richness: { median: 42, p25: 42, p75: 42 },
          routability: { median: 48, p25: 48, p75: 48 },
          citation: { median: 22, p25: 22, p75: 22 },
        },
      },
    },
  });
}

export function AiReadinessPreviewClient() {
  const [original] = useState(() => {
    const client = apiClient as unknown as {
      listMerchantTasks: unknown;
      listAuditRuns: unknown;
      getAuditRunDetail: unknown;
    };
    const orig = {
      listMerchantTasks: client.listMerchantTasks,
      listAuditRuns: client.listAuditRuns,
      getAuditRunDetail: client.getAuditRunDetail,
    };
    client.listMerchantTasks = previewListTasks;
    client.listAuditRuns = previewListAuditRuns;
    client.getAuditRunDetail = previewGetAuditRunDetail;
    return orig;
  });
  useEffect(
    () => () => {
      const client = apiClient as unknown as {
        listMerchantTasks: unknown;
        listAuditRuns: unknown;
        getAuditRunDetail: unknown;
      };
      client.listMerchantTasks = original.listMerchantTasks;
      client.listAuditRuns = original.listAuditRuns;
      client.getAuditRunDetail = original.getAuditRunDetail;
    },
    [original],
  );

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          background: '#fef3c7', color: '#92400e', padding: '8px 12px',
          borderRadius: 8, marginBottom: 12, fontSize: 13,
        }}
      >
        Dev preview — fixture data, no auth/backend. For eyeballing the AI-readiness
        redesign render (Action plan lanes · trend · indexing lane).
      </div>
      <PerSkuAuditReportRenderer
        report={reportFixture as unknown as AgentCenterPerSkuAuditResponse}
      />
    </div>
  );
}
