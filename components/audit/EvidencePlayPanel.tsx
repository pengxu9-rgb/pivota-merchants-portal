'use client';

/**
 * "Make your claims citable" — Pivota's differentiated lever. When AI can't
 * substantiate a merchant's efficacy claims, it won't cite them. Supplying
 * third-party proof (lab tests, certs, ingredient data) lets Pivota publish
 * grounded, citable claims on the canonical PDP — a trust signal retailers and
 * publishers can't provide for the brand. Given real estate (accent treatment)
 * because it's unique to Pivota. Hidden when present=false.
 */

import { useState } from 'react';
import { BadgeCheck, ShieldCheck, ArrowRight, Upload } from 'lucide-react';
import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';
import { ProductEvidencePanel } from '@/components/evidence/ProductEvidencePanel';
import { parseAuditProductKey } from '@/lib/audit/productKey';

export function EvidencePlayPanel({ report }: { report: AgentCenterPerSkuReport }) {
  const ev = report.evidence_play;
  const [intakeOpen, setIntakeOpen] = useState(false);

  const product = parseAuditProductKey(report.product_key);

  if (!ev || !ev.present) return null;

  const claims = (ev.claims_to_substantiate || []).filter(Boolean);
  const flagged = ev.unsubstantiated_in_ai ?? 0;
  const moves = (ev.moves || []).filter(Boolean);

  return (
    <>
    <div className="mt-3 rounded-md border border-[color:var(--merchant-accent,#6366f1)] bg-[color:var(--merchant-accent,#6366f1)]/[0.05] px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--merchant-accent,#6366f1)]">
        <ShieldCheck className="h-3.5 w-3.5" />
        Make your claims citable
        <span className="ml-1 rounded-full bg-[color:var(--merchant-accent,#6366f1)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase">
          Pivota
        </span>
      </div>

      {ev.already_substantiated ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
          <BadgeCheck className="h-3.5 w-3.5" />
          Your claims are substantiated — Pivota keeps them published as citable claims.
        </p>
      ) : (
        <>
          {claims.length > 0 ? (
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
          {flagged > 0 ? (
            <p className="mt-1.5 text-xs leading-snug">
              AI couldn&apos;t verify your product in{' '}
              <span className="font-semibold">{flagged}</span> answer
              {flagged === 1 ? '' : 's'} — proof is what closes that gap and earns the citation.
            </p>
          ) : null}
        </>
      )}

      {moves.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {moves.slice(0, 3).map((m, i) => (
            <li key={i} className="flex gap-1.5 text-xs leading-snug">
              <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--merchant-accent,#6366f1)]" />
              <span>{m}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {ev.pivota_value ? (
        <p className="mt-2 border-t border-[color:var(--merchant-accent,#6366f1)]/15 pt-2 text-[11px] leading-snug opacity-70">
          {ev.pivota_value}
        </p>
      ) : null}

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
          platform={product.platform}
          platformProductId={product.platformProductId}
          defaultExpanded
        />
      </div>
    ) : null}
    </>
  );
}
