'use client';

/**
 * Wave-3 B2: mint + copy the read-only share link (agency/partner demo
 * scene — complements the PPT deck). Token is server-minted, 30-day expiry,
 * revocable here; the public page carries noindex. Renders only when both
 * the portal flag and a runId exist; backend 404s when its flag is off.
 */

import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export function ShareLinkButton({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  async function share() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await apiClient.createAuditShareLink(runId);
      const url = `${window.location.origin}${res.share_path}`;
      await navigator.clipboard.writeText(url);
      setShared(true);
      setNote('Link copied — expires in 30 days.');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setNote(
        status === 404
          ? 'Sharing isn’t enabled yet.'
          : 'Couldn’t create the link — try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (busy) return;
    setBusy(true);
    try {
      await apiClient.revokeAuditShareLink(runId);
      setShared(false);
      setNote('Link revoked.');
    } catch {
      setNote('Couldn’t revoke — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--merchant-line)] px-2.5 py-1.5 text-xs font-semibold transition hover:border-[color:var(--merchant-accent,#6366f1)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
        {shared ? 'Copy share link again' : 'Share read-only link'}
      </button>
      {note ? (
        <p className="merchant-text-muted max-w-56 text-right text-[11px]">
          {note}
          {shared ? (
            <>
              {' '}
              <button type="button" onClick={revoke} className="underline hover:opacity-80">
                Revoke
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
