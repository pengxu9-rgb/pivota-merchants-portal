'use client';

import { useState } from 'react';
import { BadgeCheck, ShieldCheck, Upload } from 'lucide-react';
import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';
import { ProductEvidencePanel } from '@/components/evidence/ProductEvidencePanel';
import { parseAuditProductKey } from '@/lib/audit/productKey';

export function EvidencePlayPanel({ report }: { report: AgentCenterPerSkuReport }) {
  const ev = report.evidence_play;
  const [intakeOpen, setIntakeOpen] = useState(false);

  const product = parseAuditProductKey(report.product_key);

  if (!ev || !ev.present) return null;

  const claims = (ev.claims_to_substantiate || []).filter(Boolean);
  const checklist = (ev.evidence_checklist || []).filter((c) => c && c.claim);
  const flaggedAnswers = (ev.flagged_answers || []).filter((f) => f && f.query);
  const flagged = ev.unsubstantiated_in_ai ?? 0;

  return (
    <>
    <div className="mt-3 rounded-md border border-[color:var(--merchant-accent,#6366f1)] bg-[color:var(--merchant-accent,#6366f1)]/[0.05] px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--merchant-accent,#6366f1)]">
        <ShieldCheck className="h-3.5 w-3.5" />
        Evidence for your claims
      </div>

      {ev.already_substantiated ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
          <BadgeCheck className="h-3.5 w-3.5" />
          This audit recorded substantiated claims. Open product evidence to see their current review status.
        </p>
      ) : (
        <>
          {checklist.length > 0 ? (
            <div className="mt-1.5">
              <span className="text-xs opacity-70">
                What to prove, and what proves it:
              </span>
              <ul className="mt-1 space-y-1">
                {checklist.map((c, i) => (
                  <li key={i} className="flex gap-1.5 text-xs leading-snug">
                    <span className="shrink-0 rounded-full border border-[color:var(--merchant-accent,#6366f1)]/40 px-2 py-0.5 text-[11px] font-medium">
                      {c.claim}
                    </span>
                    <span className="pt-0.5">{c.prove_with}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : claims.length > 0 ? (
            <div className="mt-1.5">
              <span className="text-xs opacity-70">Claims to back with proof: </span>
              {claims.map((c) => (
                <span
                  key={c}
                  className="mr-1 inline-block rounded-full border border-[color:var(--merchant-accent,#6366f1)]/40 px-2 py-0.5 text-[11px] font-medium"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}
          {flaggedAnswers.length > 0 ? (
            <div className="mt-1.5">
              <span className="text-xs opacity-70">
                Answers with evidence gaps
              </span>
              <ul className="mt-1 space-y-1">
                {flaggedAnswers.map((f, i) => (
                  <li key={i} className="rounded-md border border-[color:var(--merchant-line)] bg-white/60 px-2.5 py-1.5 text-xs leading-snug">
                    <span className="font-medium">&ldquo;{f.query}&rdquo;</span>
                    <span className="merchant-text-muted"> — {f.why}</span>
                    {f.note ? (
                      <div className="merchant-text-muted mt-0.5 text-[11px]">{f.note}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : flagged > 0 ? (
            <p className="mt-1.5 text-xs leading-snug">
              AI couldn&apos;t verify your product in{' '}
              <span className="font-semibold">{flagged}</span> answer
              {flagged === 1 ? '' : 's'}. Check whether your product evidence addresses the gaps.
            </p>
          ) : null}
        </>
      )}

      {/* Supply proof / upload docs — reveals the shared evidence intake
          (positioning + lab/third-party report upload) already backed by the
          governance endpoints. Only when the SKU is indexed (3-part product_key),
          because that's what the intake can post against. */}
      {product ? (
        <button
          type="button"
          onClick={() => setIntakeOpen((v) => !v)}
          aria-expanded={intakeOpen}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-[color:var(--merchant-accent,#6366f1)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Upload className="h-3.5 w-3.5" />
          {intakeOpen ? 'Hide proof upload' : 'Supply proof / upload docs'}
        </button>
      ) : null}
    </div>

    {product && intakeOpen ? (
      <div className="mt-2">
        <ProductEvidencePanel
          key={report.product_key}
          platform={product.platform}
          platformProductId={product.platformProductId}
          defaultExpanded
        />
      </div>
    ) : null}
    </>
  );
}
