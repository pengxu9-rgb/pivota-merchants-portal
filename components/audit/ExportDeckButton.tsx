'use client';

/**
 * Leadership-deck (PPTX) export button. Free tier downloads the watermarked
 * preview slide; paid tier the full deck (backend bills its LLM executive
 * summary at 1.6x actual token usage — one charge per run, re-exports
 * replay). Post-export note surfaces what actually happened from the
 * response's billing headers; 402 → top-up copy, 409 → not-ready copy.
 */

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

function exportNote(
  billingMode: string | null,
  creditsCharged: number,
): string | null {
  if (billingMode === 'preview_only') {
    return 'Preview slide exported — upgrade to export the full deck.';
  }
  if (billingMode === 'metered' && creditsCharged > 0) {
    return `Deck exported — ${creditsCharged} credit${
      creditsCharged === 1 ? '' : 's'
    } used.`;
  }
  if (billingMode) return 'Deck exported.';
  return null;
}

function exportErrorCopy(status: number | undefined): string {
  if (status === 402) {
    return 'Not enough credits — top up or upgrade on the Billing page.';
  }
  if (status === 409) {
    return "This audit isn't ready to export yet — re-run it or wait for it to finish.";
  }
  return "Couldn't export the deck right now — try again.";
}

export function ExportDeckButton({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function exportDeck() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { blob, billingMode, creditsCharged } =
        await apiClient.exportReportDeck(runId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pivota-ai-readiness-${runId}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Deferred a tick: capture the download stream before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setNote(exportNote(billingMode, creditsCharged));
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setError(exportErrorCopy(status));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={exportDeck}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--merchant-line)] px-2.5 py-1.5 text-xs font-semibold transition hover:border-[color:var(--merchant-accent,#6366f1)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {busy ? 'Exporting…' : 'Export deck (PPT)'}
      </button>
      {error ? <p className="max-w-56 text-right text-[11px] text-red-700">{error}</p> : null}
      {note ? (
        <p className="merchant-text-muted max-w-56 text-right text-[11px]">{note}</p>
      ) : null}
    </div>
  );
}
