'use client';

/**
 * Phase 2b merchant evidence intake — OPTIONAL "Strengthen with evidence" panel
 * for the product-optimization detail view.
 *
 * A suggestion, never a gate: collapsed by default, opportunity-framed, fully
 * skippable. It lets a merchant (1) add positioning (stored `unverified` —
 * improves on-page copy) and (2) upload a lab / third-party test report whose
 * LLM-extracted CANDIDATE claims they review and confirm one at a time. Confirming
 * a candidate posts it with source_ref=<artifact_id>, which is what grades it
 * `substantiated` server-side and gets it cited to agents. Nothing is published
 * until the merchant confirms — the trust spine, surfaced honestly.
 */

import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
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
}: {
  platform: string;
  platformProductId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evidence, setEvidence] = useState<ProductEvidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // positioning intake
  const [positioningText, setPositioningText] = useState('');
  const [savingPositioning, setSavingPositioning] = useState(false);

  // lab-report intake
  const [labFile, setLabFile] = useState<File | null>(null);
  const [labText, setLabText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LabCandidateClaim[] | null>(null);
  const [confirmingIdx, setConfirmingIdx] = useState<number | null>(null);
  const [addedClaims, setAddedClaims] = useState<Set<string>>(new Set());

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
      setAddedClaims(new Set());
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
      await apiClient.addMerchantProductEvidence(platform, platformProductId, [
        labCandidateToClaim(candidate, artifactId),
      ]);
      setAddedClaims((prev) => new Set(prev).add(candidate.claim_text));
      setNotice('Added as a cited claim — agents can now ground recommendations on it.');
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
              Add lab results or positioning so agents cite this product with grounded,
              attributable claims. Only substantiated claims are served — nothing is
              published until you confirm it.
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
                        const added = addedClaims.has(cand.claim_text);
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
                              {added ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3" /> Added — cited to agents
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
