'use client';

/**
 * Phase 2b merchant evidence intake — OPTIONAL "Strengthen with evidence" panel
 * for the product-optimization detail view.
 *
 * A suggestion, never a gate: collapsed by default, opportunity-framed, fully
 * skippable. It lets a merchant (1) add positioning (stored `unverified` —
 * improves on-page copy), (2) supply an ingredient (INCI) list or brand-page URL
 * that Pivota verifies into grounded, cited "Contains X" claims, and (3) upload a
 * lab / third-party test report whose LLM-extracted CANDIDATE claims they review
 * and confirm one at a time. The merchant supplies EVIDENCE, never the served
 * copy: the backend verifies → substantiates → grades it, and only substantiated
 * claims are served to agents. Nothing is published as-authored — the trust spine,
 * surfaced honestly.
 */

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  FlaskConical,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { MerchantButton } from '@/components/ui/merchant-primitives';
import {
  gradeBadge,
  labCandidateToClaim,
  partitionClaims,
  POSITIONING_SOURCE,
  statusBadge,
  type LabCandidateClaim,
  type ProductEvidence,
  type ProductEvidenceClaim,
} from '@/lib/evidence';

function ClaimRow({ claim }: { claim: ProductEvidenceClaim }) {
  const grade = gradeBadge(claim.evidence_grade);
  const status = statusBadge(claim.substantiation_status);
  return (
    <li className="flex flex-col gap-1 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2">
      <span className="text-xs text-slate-800">{claim.claim_text}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}>
          {status.label}
        </span>
        {claim.evidence_grade ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${grade.className}`}>
            {grade.label}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function ProductEvidencePanel({
  platform,
  platformProductId,
  defaultExpanded = false,
}: {
  platform: string;
  platformProductId: string;
  // When mounted from an explicit "Supply proof" affordance (e.g. the audit
  // "Make your claims citable" section), open expanded so the intake is visible
  // immediately rather than requiring a second click.
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evidence, setEvidence] = useState<ProductEvidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // positioning intake
  const [positioningText, setPositioningText] = useState('');
  const [savingPositioning, setSavingPositioning] = useState(false);

  // ingredient (INCI) evidence intake — the strongest cheap lever: verified
  // actives become grounded, cited claims. Paste the list or link the brand page.
  const [inciText, setInciText] = useState('');
  const [brandUrl, setBrandUrl] = useState('');
  const [submittingInci, setSubmittingInci] = useState(false);

  // lab-report intake
  const [labFile, setLabFile] = useState<File | null>(null);
  const [labText, setLabText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LabCandidateClaim[] | null>(null);
  const [confirmingIdx, setConfirmingIdx] = useState<number | null>(null);
  // Per-candidate outcome (keyed by index so duplicate texts don't collide):
  // 'served' = backend graded it substantiated (cited to agents); 'added' = saved
  // but NOT served (e.g. backend flagged it). Drives an honest row label.
  const [confirmedByIdx, setConfirmedByIdx] = useState<Record<number, 'served' | 'added'>>({});

  async function loadEvidence() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMerchantProductEvidence(platform, platformProductId);
      setEvidence(data);
      setLoaded(true);
    } catch (err: any) {
      setError(err?.message || 'Could not load evidence.');
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded && !loading) void loadEvidence();
  }

  // When the panel is mounted already-expanded (defaultExpanded), toggle() never
  // fires, so kick off the initial load here.
  useEffect(() => {
    if (expanded && !loaded && !loading) void loadEvidence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddPositioning() {
    const text = positioningText.trim();
    if (!text) return;
    setSavingPositioning(true);
    setError(null);
    setNotice(null);
    try {
      await apiClient.addMerchantProductEvidence(platform, platformProductId, [
        { claim_text: text, source_type: POSITIONING_SOURCE },
      ]);
      setPositioningText('');
      setNotice('Saved. Positioning improves your on-page copy — back it with a lab report to get cited by agents.');
      await loadEvidence();
    } catch (err: any) {
      setError(err?.message || 'Could not save positioning.');
    } finally {
      setSavingPositioning(false);
    }
  }

  async function handleSubmitInci() {
    const inci = inciText.trim();
    const url = brandUrl.trim();
    if (!inci && !url) return;
    setSubmittingInci(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiClient.submitMerchantSupplierEvidence(platform, platformProductId, {
        rawInci: inci || null,
        brandUrl: url || null,
      });
      const n = res.substantiated_claims?.length || 0;
      if (res.status === 'ok' && n > 0) {
        setInciText('');
        setBrandUrl('');
        setNotice(
          res.served
            ? `Verified ${n} ingredient-backed claim${n === 1 ? '' : 's'} — now cited to agents and live on this product’s agent PDP.`
            : `Verified ${n} ingredient-backed claim${n === 1 ? '' : 's'} — cited to agents (goes live on the next refresh).`
        );
        await loadEvidence();
      } else if (res.status === 'rejected_not_inci') {
        setError('That didn’t look like an ingredient (INCI) list. Paste the full ingredients, comma-separated.');
      } else if (res.status === 'not_found') {
        setError('Couldn’t match this product in the catalog yet — try again after it syncs.');
      } else if (res.status === 'no_evidence') {
        setError('No ingredients found. Paste an INCI list, or a brand product-page URL we can read.');
      } else {
        // status ok but nothing net-new was substantiated (e.g. already on file).
        setNotice('Ingredients saved — no new verifiable claims were derived from them.');
        await loadEvidence();
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(detail || err?.message || 'Could not submit ingredients.');
    } finally {
      setSubmittingInci(false);
    }
  }

  async function handleExtract() {
    if (!labFile && !labText.trim()) return;
    setExtracting(true);
    setError(null);
    setNotice(null);
    setCandidates(null);
    setArtifactId(null);
    try {
      const res = await apiClient.extractMerchantLabReport(platform, platformProductId, {
        file: labFile,
        labText: labText.trim() || null,
      });
      setArtifactId(res.artifact_id);
      setCandidates(res.candidate_claims || []);
      setConfirmedByIdx({});
      if (!res.candidate_claims?.length) {
        setNotice('No verifiable claims were found in that report.');
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(detail || err?.message || 'Could not read that report.');
    } finally {
      setExtracting(false);
    }
  }

  async function handleConfirmCandidate(candidate: LabCandidateClaim, idx: number) {
    if (!artifactId) return;
    setConfirmingIdx(idx);
    setError(null);
    setNotice(null);
    try {
      const res = await apiClient.addMerchantProductEvidence(platform, platformProductId, [
        labCandidateToClaim(candidate, artifactId),
      ]);
      const served = res.substantiated > 0;
      setConfirmedByIdx((prev) => ({ ...prev, [idx]: served ? 'served' : 'added' }));
      setNotice(
        served
          ? res.served_refresh
            ? 'Added — now cited to agents and live on its agent PDP.'
            : 'Added — now cited to agents (goes live on the next refresh).'
          : 'Added to this product’s evidence.'
      );
      await loadEvidence();
    } catch (err: any) {
      setError(err?.message || 'Could not add that claim.');
    } finally {
      setConfirmingIdx(null);
    }
  }

  const claims = evidence?.claims ?? [];
  const { served, copyOnly } = partitionClaims(claims);

  return (
    <div className="bg-white rounded-lg shadow border">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              Strengthen with evidence{' '}
              <span className="font-normal text-gray-400">· optional</span>
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Add ingredients, lab results, or positioning so agents cite this product
              with grounded, attributable claims. Only substantiated claims are served —
              nothing is published until you confirm it.
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          {error && (
            <div className="flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading evidence…
            </div>
          ) : (
            <>
              {/* Proof: the real, immediate outcome of adding evidence — how many
                  claims agents can now cite on this product. Reflects the live
                  served count (grows when a lab claim is confirmed); no score is
                  implied because evidence doesn't feed the score (yet). */}
              {served.length > 0 && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {served.length} claim{served.length === 1 ? '' : 's'} cited to agents
                  </div>
                  <p className="mt-0.5 text-[11px] text-emerald-700">
                    Agents can ground recommendations on this product with these grounded,
                    attributable claims — they appear on its agent-facing PDP.
                  </p>
                </div>
              )}

              {/* Current evidence */}
              {claims.length > 0 ? (
                <div className="space-y-3">
                  {served.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-gray-700">
                        Cited to agents ({served.length})
                      </div>
                      <ul className="space-y-1.5">
                        {served.map((c, i) => (
                          <ClaimRow key={`s-${i}`} claim={c} />
                        ))}
                      </ul>
                    </div>
                  )}
                  {copyOnly.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-gray-700">
                        Improves copy only ({copyOnly.length})
                      </div>
                      <ul className="space-y-1.5">
                        {copyOnly.map((c, i) => (
                          <ClaimRow key={`c-${i}`} claim={c} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  No evidence yet. Add positioning or a lab report below — both are optional.
                </p>
              )}

              {/* Add positioning */}
              <div className="space-y-2 rounded-md border border-slate-100 p-3">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-gray-700">Add positioning</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  How you describe this product. Stored as positioning — it sharpens your
                  on-page copy. To be cited by agents, back it with a lab report.
                </p>
                <textarea
                  value={positioningText}
                  onChange={(e) => setPositioningText(e.target.value)}
                  rows={2}
                  placeholder="e.g. Formulated for sensitive skin with a fragrance-free base"
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-blue-400 focus:outline-none"
                />
                <MerchantButton
                  type="button"
                  variant="secondary"
                  onClick={handleAddPositioning}
                  disabled={savingPositioning || !positioningText.trim()}
                  className="inline-flex items-center gap-1 text-xs"
                >
                  {savingPositioning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Add positioning
                </MerchantButton>
              </div>

              {/* Ingredients (INCI) — the strongest cheap lever. Verified actives
                  become grounded, cited "Contains X" claims. Merchant supplies
                  EVIDENCE (the list, or a page we crawl), never free-text copy;
                  only what the backend can substantiate is served. */}
              <div className="space-y-2 rounded-md border border-slate-100 p-3">
                <div className="flex items-center gap-1.5">
                  <FlaskConical className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-xs font-medium text-gray-700">Ingredients (INCI)</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Paste the ingredient list, or link the brand product page — we verify
                  the actives and turn them into grounded, cited claims. Nothing you type
                  is published as-is; only what we can substantiate is served.
                </p>
                <textarea
                  value={inciText}
                  onChange={(e) => setInciText(e.target.value)}
                  rows={3}
                  placeholder="Water, Niacinamide, Glycerin, Snail Secretion Filtrate, …"
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-blue-400 focus:outline-none"
                />
                <input
                  type="url"
                  value={brandUrl}
                  onChange={(e) => setBrandUrl(e.target.value)}
                  placeholder="…or paste the brand product-page URL"
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-blue-400 focus:outline-none"
                />
                <MerchantButton
                  type="button"
                  onClick={handleSubmitInci}
                  disabled={submittingInci || (!inciText.trim() && !brandUrl.trim())}
                  className="inline-flex items-center gap-1 text-xs"
                >
                  {submittingInci ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                  Verify ingredients
                </MerchantButton>
              </div>

              {/* Lab / test report */}
              <div className="space-y-2 rounded-md border border-slate-100 p-3">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-xs font-medium text-gray-700">
                    Lab / third-party test report
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Upload a PDF (or paste its text). We extract the verifiable findings for
                  you to review — confirm the ones that are accurate and they become cited,
                  grade-A claims.
                </p>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,text/plain,application/pdf"
                  onChange={(e) => setLabFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:text-slate-700"
                />
                <textarea
                  value={labText}
                  onChange={(e) => setLabText(e.target.value)}
                  rows={2}
                  placeholder="…or paste the report text here"
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-blue-400 focus:outline-none"
                />
                <MerchantButton
                  type="button"
                  onClick={handleExtract}
                  disabled={extracting || (!labFile && !labText.trim())}
                  className="inline-flex items-center gap-1 text-xs"
                >
                  {extracting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Extract claims
                </MerchantButton>

                {candidates && candidates.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] font-medium text-gray-700">
                      Review the extracted findings — nothing is published until you confirm.
                    </div>
                    <ul className="space-y-1.5">
                      {candidates.map((cand, idx) => {
                        const outcome = confirmedByIdx[idx];
                        return (
                          <li
                            key={idx}
                            className="flex flex-col gap-1 rounded-md border border-slate-100 px-3 py-2"
                          >
                            <span className="text-xs text-slate-800">{cand.claim_text}</span>
                            {cand.source_excerpt && (
                              <span className="text-[10px] italic text-slate-400">
                                “{cand.source_excerpt}”
                              </span>
                            )}
                            <div>
                              {outcome === 'served' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3" /> Added — cited to agents
                                </span>
                              ) : outcome === 'added' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                                  <CheckCircle2 className="h-3 w-3" /> Added to evidence
                                </span>
                              ) : (
                                <MerchantButton
                                  type="button"
                                  variant="secondary"
                                  onClick={() => handleConfirmCandidate(cand, idx)}
                                  disabled={confirmingIdx === idx}
                                  className="inline-flex items-center gap-1 text-[11px]"
                                >
                                  {confirmingIdx === idx ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Plus className="h-3 w-3" />
                                  )}
                                  Add as cited evidence
                                </MerchantButton>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ProductEvidencePanel;
