import type { VisibilityTrackingResponse } from '@/lib/types/visibility-tracking';

/** A score delta needs the exact preceding run on the same known product panel and basis. */
export function comparableMomentumPrior(
  tracking: VisibilityTrackingResponse | null | undefined,
  currentRunId: string | null | undefined,
): string | null {
  if (!currentRunId) return null;
  const points = tracking?.points ?? [];
  const index = points.findIndex(point => point.run_id === currentRunId);
  if (index < 1) return null;
  const current = points[index], previous = points[index - 1];
  if (current.comparable_with_prev !== true || !previous.run_id ||
      !current.panel_id || current.panel_id !== previous.panel_id ||
      !current.basis_id || current.basis_id !== previous.basis_id) return null;
  return previous.run_id;
}
