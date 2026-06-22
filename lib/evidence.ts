/**
 * Phase 2b merchant evidence intake — shared types + pure display/handshake
 * helpers for the optional "Strengthen with evidence" UI.
 *
 * Mirrors the pivota-backend contract (claim_safety.ProductClaim / product_evidence):
 *   - GET  /merchant/products/{platform}/{id}/evidence            -> ProductEvidence
 *   - POST /merchant/products/{platform}/{id}/evidence            -> write graded claims
 *   - POST /merchant/products/{platform}/{id}/evidence/lab-report -> LabExtractionResult
 *
 * Trust spine, surfaced honestly in the UI: positioning is stored `unverified`
 * (improves PDP copy) and only a lab/cert/third-party source grades a claim
 * `substantiated` — and only `substantiated` claims are cited to agents. The
 * lab-report flow PROPOSES candidates; the merchant confirms one with
 * source_ref=<artifact_id>, which is what grades it server-side.
 */

export type EvidenceSourceType =
  | 'merchant_positioning'
  | 'merchant_lab_report'
  | 'third_party_test'
  | 'certification'
  | 'third_party_review'
  | 'editorial_press';

export const POSITIONING_SOURCE: EvidenceSourceType = 'merchant_positioning';
export const LAB_SOURCE: EvidenceSourceType = 'merchant_lab_report';

export interface ProductEvidenceClaim {
  claim_text: string;
  source_type?: string | null;
  source_ref?: string | null;
  evidence_grade?: string | null;
  substantiation_status?: string | null;
}

export interface ProductEvidence {
  claims: ProductEvidenceClaim[];
  review_state?: string | null;
  required_disclaimers?: Array<{ code?: string; text?: string }> | null;
  updated_at?: string | null;
}

export interface LabCandidateClaim {
  claim_text: string;
  source_excerpt?: string | null;
}

export interface LabExtractionResult {
  artifact_id: string;
  product_key: string;
  candidate_claims: LabCandidateClaim[];
  candidate_count: number;
  next_step?: { instructions?: string; source_type?: string; source_ref?: string };
}

export interface EvidenceClaimInput {
  claim_text: string;
  source_type?: string | null;
  source_ref?: string | null;
}

interface Badge {
  label: string;
  className: string;
}

/** Evidence-grade → badge (matches the serving gate's a/b/c letters). */
export function gradeBadge(grade?: string | null): Badge {
  switch (String(grade || '').toLowerCase()) {
    case 'a':
      return { label: 'Grade A', className: 'bg-emerald-100 text-emerald-800' };
    case 'b':
      return { label: 'Grade B', className: 'bg-blue-100 text-blue-800' };
    case 'c':
      return { label: 'Grade C', className: 'bg-amber-100 text-amber-800' };
    default:
      return { label: 'Ungraded', className: 'bg-slate-100 text-slate-600' };
  }
}

/** Substantiation status → merchant-friendly badge. Only `substantiated` is
 * cited to agents; everything else only improves on-page copy. */
export function statusBadge(status?: string | null): Badge {
  switch (String(status || '').toLowerCase()) {
    case 'substantiated':
      return {
        label: 'Cited to agents',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      };
    case 'flagged':
      return {
        label: 'Flagged',
        className: 'bg-amber-50 text-amber-700 border border-amber-200',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        className: 'bg-red-50 text-red-700 border border-red-200',
      };
    default:
      return {
        label: 'Improves copy only',
        className: 'bg-slate-50 text-slate-600 border border-slate-200',
      };
  }
}

/** Whether a stored claim is currently cited to agents (substantiated only). */
export function isServedToAgents(claim: ProductEvidenceClaim): boolean {
  return String(claim.substantiation_status || '').toLowerCase() === 'substantiated';
}

/** Split stored claims into the two buckets the UI shows: cited-to-agents
 * (substantiated) vs improves-copy-only (everything else). */
export function partitionClaims(claims: ProductEvidenceClaim[]): {
  served: ProductEvidenceClaim[];
  copyOnly: ProductEvidenceClaim[];
} {
  const served: ProductEvidenceClaim[] = [];
  const copyOnly: ProductEvidenceClaim[] = [];
  for (const claim of claims || []) {
    (isServedToAgents(claim) ? served : copyOnly).push(claim);
  }
  return { served, copyOnly };
}

/** The trust-spine handshake: turn a lab-report candidate into the confirm body.
 * source_ref=<artifact_id> is what grades it `substantiated` server-side — the
 * merchant is attesting "this finding is in the report I uploaded". */
export function labCandidateToClaim(
  candidate: LabCandidateClaim,
  artifactId: string,
): EvidenceClaimInput {
  return {
    claim_text: candidate.claim_text,
    source_type: LAB_SOURCE,
    source_ref: artifactId,
  };
}
