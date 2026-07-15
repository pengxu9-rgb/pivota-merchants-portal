import { notFound } from 'next/navigation';

import { LayoutPreviewClient } from './PreviewClient';

// Dev-only visual preview of the audit-page re-layout pieces (score strip,
// highlighted diagnostics expander, per-action measured evidence, get-cited
// losing-query evidence) — fixture-driven, no auth, 404 in production.
export const dynamic = 'force-dynamic';

export default function AuditLayoutPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <LayoutPreviewClient />;
}
