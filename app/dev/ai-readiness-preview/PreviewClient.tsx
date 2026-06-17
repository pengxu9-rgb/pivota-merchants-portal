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

export function AiReadinessPreviewClient() {
  const [original] = useState(() => {
    const client = apiClient as unknown as { listMerchantTasks: unknown };
    const orig = client.listMerchantTasks;
    client.listMerchantTasks = previewListTasks;
    return orig;
  });
  useEffect(
    () => () => {
      (apiClient as unknown as { listMerchantTasks: unknown }).listMerchantTasks = original;
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
