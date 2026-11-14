/**
 * Phase 2b merchant evidence intake — shared types + pure display/handshake
 * helpers for the optional "Strengthen with evidence" UI.
 *
 * Mirrors the pivota-backend contract (claim_safety.ProductClaim / product_evidence):
 *   - GET  /merchant/products/{platform}/{id}/evidence            -> ProductEvidence
 *   - POST /merchant/products/{platform}/{id}/evidence            -> submit claims
 *   - POST /merchant/products/{platform}/{id}/evidence/lab-report -> LabExtractionResult
 *
 * Claim review is independent of publication and observed citations. The lab
 * flow proposes candidate claims and attaches a public source for review.
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
  public_source_url?: string | null;
  review_source_url?: string | null;
  evidence_grade?: string | null;
  substantiation_status?: string | null;
  review_status?: string | null;
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
  public_source_url?: string | null;
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

export function statusBadge(claim: ProductEvidenceClaim): Badge {
  switch (claim.substantiation_status?.toLowerCase()) {
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
  }
  if (isVerifiedClaim(claim)) return {
    label: 'Verified',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  };
  return {
    label: claim.source_type === POSITIONING_SOURCE ? 'Positioning' : 'Submitted',
    className: 'bg-slate-50 text-slate-600 border border-slate-200',
  };
}

export function isVerifiedClaim(claim: ProductEvidenceClaim): boolean {
  return claim.substantiation_status === 'substantiated' && claim.review_status === 'verified';
}

export function partitionClaims(claims: ProductEvidenceClaim[]): {
  verified: ProductEvidenceClaim[];
  other: ProductEvidenceClaim[];
} {
  const verified: ProductEvidenceClaim[] = [];
  const other: ProductEvidenceClaim[] = [];
  for (const claim of claims || []) {
    (isVerifiedClaim(claim) ? verified : other).push(claim);
  }
  return { verified, other };
}

export function normalizeEvidenceSourceUrl(value?: string | null): string | null {
  const input = value?.trim();
  if (!input || input.length > 2000 || !/^https:\/\//i.test(input) || input.includes('\\') || input.includes('#')
      || /\s/.test(input) || [...input].some(character => character.charCodeAt(0) < 32)) return null;
  try {
    const url = new URL(input);
    const hostname = url.hostname.replace(/\.$/, '');
    if (url.protocol !== 'https:' || !hostname.includes('.') || url.username || url.password
        || /\.(?:local|internal|localhost)$/i.test(hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
    if ([...url.searchParams.keys()].some(key => /token|password|secret|authorization|api.?key/i.test(key))) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Keep the extraction reference and the URL that staff can open. */
export function labCandidateToClaim(
  candidate: LabCandidateClaim,
  artifactId: string,
  source: string,
): EvidenceClaimInput {
  return {
    claim_text: candidate.claim_text,
    source_type: LAB_SOURCE,
    source_ref: artifactId,
    public_source_url: source,
  };
}
