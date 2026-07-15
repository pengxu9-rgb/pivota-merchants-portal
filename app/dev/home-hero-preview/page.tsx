import { notFound } from 'next/navigation';

import { HomeHeroPreviewClient } from './PreviewClient';

// Dev-only visual preview of the Overview AI-readiness hero (AI_READINESS_HOME
// flag) — both states, rendered from the committed report-summary fixture with
// NO auth and NO backend. Hidden in production (404).
export const dynamic = 'force-dynamic';

export default function HomeHeroPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <HomeHeroPreviewClient />;
}
