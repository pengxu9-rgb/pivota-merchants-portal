import { notFound } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/config";
import { RecoveryReports } from "@/components/recovery-v2/RecoveryPages";

// AI Revenue Recovery v2 only. Flag off: rewritten to a 404 in next.config.mjs.
export default function ReportsPage() {
  if (!FEATURE_FLAGS.RECOVERY_V2) notFound();
  return <RecoveryReports />;
}
