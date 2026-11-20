import { notFound } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/config";
import { RecoveryStart } from "@/components/recovery-v2/RecoveryStart";

// AI Revenue Recovery v2 only. With the flag off, next.config.mjs rewrites this
// URL to a missing path (a real 404, as before v2); notFound() is a backstop.
export default function StartPage() {
  if (!FEATURE_FLAGS.RECOVERY_V2) notFound();
  return <RecoveryStart />;
}
