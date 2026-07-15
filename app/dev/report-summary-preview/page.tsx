import { notFound } from 'next/navigation';

import { ReportSummaryView } from '@/components/audit/ReportSummaryView';
import type { ReportSummary } from '@/lib/types/ai-readiness';
import summaryFixture from '@/scripts/fixtures/report-summary.glowlab.json';

// Dev-only visual preview of the Report Summary Contract v1 condensed view —
// rendered from the committed fixture (REAL backend-builder output; see
// scripts/verify-report-summary-render.mjs for the regen recipe) with NO auth
// and NO backend, so the 3-page layout, 0–10 score display, and collapsed
// prompt evidence can be eyeballed locally. Hidden in production (404).
export const dynamic = 'force-dynamic';

export default function ReportSummaryPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="merchant-page-title">Report summary preview (dev)</h1>
      <p className="merchant-text-muted text-sm">
        Fixture: scripts/fixtures/report-summary.glowlab.json — real
        report_summary_builder output.
      </p>
      <ReportSummaryView summary={summaryFixture as ReportSummary} />
    </div>
  );
}
