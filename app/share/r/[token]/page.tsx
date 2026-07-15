import type { Metadata } from 'next';

import { SharedAuditClient } from './SharedAuditClient';

// Wave-3 B2: public read-only view of a shared audit. No auth, no layout
// chrome; the backend already redacts billing/custom-prompts/pitch emails
// and the token is unguessable + expiring + revocable.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shared AI-visibility report — Pivota',
  robots: { index: false, follow: false },
};

export default async function SharedAuditPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedAuditClient token={token} />;
}
