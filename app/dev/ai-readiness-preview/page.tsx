import { notFound } from 'next/navigation';

import { AiReadinessPreviewClient } from './PreviewClient';

// Dev-only visual preview of the AI-readiness per-SKU report — rendered from
// committed fixtures with NO auth and NO backend, so the redesign (Action plan
// store/Pivota lanes, run-over-run trend, "Pivota handles this" indexing lane,
// per-SKU cards) can be eyeballed locally without running a real audit.
// Hidden in production (404).
export const dynamic = 'force-dynamic';

export default function AiReadinessPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <AiReadinessPreviewClient />;
}
